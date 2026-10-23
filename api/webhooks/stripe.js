// api/webhooks/stripe.js
// Dependency-free: no npm packages. Uses plain web requests, exactly like auth.js.
// (The old version required the 'stripe' and '@supabase/supabase-js' toolkits, which
// aren't installed in this project — that's what was crashing the function.)
//
// Authenticity, two independent layers:
//
//  1. Signature. Every request must carry a valid Stripe-Signature over the RAW
//     body. The old note here said a signing secret "fights Vercel's body handling"
//     — it only does if you read req.body, because Vercel parses it and the bytes
//     no longer match what Stripe signed. Turning the body parser off and hashing
//     the raw stream solves it, with no npm package: node:crypto is enough.
//
//  2. Re-fetch, failing CLOSED. Nothing is granted, changed or revoked on the
//     strength of the posted payload. Every handler re-reads the object from
//     Stripe with the secret key and acts only on what comes back. If the re-fetch
//     fails, we do nothing and log — we never fall back to the caller's data.
//
// Layer 2 is what actually protects the database, so a runtime that won't give us
// the raw body degrades to "unverified but still safe" rather than to "open".
//
// (Before 2026-10-22 only the individual-checkout path re-fetched. The subscription
// created/updated handler read the plan straight off the posted price id, the
// deleted handler revoked on an unverified event, and the business checkout fell
// through to the caller's object whenever the re-fetch errored — and skipped the
// paid check entirely if payment_status was simply absent. All four are closed.)
//
// 2026-07-18 fix (first-customer incident): Stripe does NOT guarantee event order.
// customer.subscription.created/updated could arrive before checkout.session.completed
// had stored stripe_customer_id on the profile — its patch then matched ZERO rows and
// the customer stayed on Free after paying. Every handler is now self-sufficient:
// each one can find the profile on its own (customer id first, then the customer's
// email looked up at Stripe) and the checkout handler also sets the plan directly.

import { createHmac, timingSafeEqual } from 'node:crypto';

// Stripe signs the raw bytes, so we must read the stream before anything parses
// it. On Vercel, req.body is a LAZY GETTER: touching it is what triggers parsing
// and drains the stream. So readRawBody() below reads the stream first and only
// falls back to req.body if the stream is already gone.
//
// Vercel's documented opt-out is the NODEJS_HELPERS=0 environment variable, not
// a config export — and it is project-wide, so it would strip req.body/req.query
// from auth.js, business.js and the rest. Not worth it: not touching the getter
// achieves the same thing for this one function.

const SITE = 'https://learninggpt.ai';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Pick the right Stripe key by mode: live events use the live key, sandbox/test
// events use the test key.
const STRIPE_KEYS = {
  live: process.env.STRIPE_SECRET_KEY,
  test: process.env.STRIPE_SECRET_KEY_TEST,
};

// Signing secrets (whsec_…). Both are tried rather than picked by livemode: that
// field comes from the payload, so it means nothing until the signature is checked.
const STRIPE_SIGNING_SECRETS = [
  process.env.STRIPE_WEBHOOK_SECRET,
  process.env.STRIPE_WEBHOOK_SECRET_TEST,
].filter(Boolean);

const SIG_TOLERANCE_SECONDS = 300;

// What a genuinely completed checkout reports. 'no_payment_required' covers trials
// and fully discounted sessions; anything else is not provisioned.
const PAID_STATUSES = new Set(['paid', 'no_payment_required']);

// The untouched request bytes, read straight off the stream. Returns null when
// the stream has already been consumed, which the caller treats as "cannot
// verify" rather than "invalid".
export async function readRawBody(req) {
  // Stream FIRST. Reading req.body here instead would invoke Vercel's getter,
  // parse the body, drain the stream and leave us with nothing to verify.
  if (req.readable) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    }
    if (chunks.length) return Buffer.concat(chunks);
  }
  // Only reached if something upstream already consumed the stream.
  try {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  } catch { /* the getter throws on malformed bodies — treat as unavailable */ }
  return null;
}

function hexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); }
  catch { return false; }
}

// Header shape: t=<unix>,v1=<hex>[,v1=<hex>…]; signed payload is `${t}.${rawBody}`.
// Returns 'ok' | 'bad' | 'unverifiable' (no secret configured yet).
export function verifyStripeSignature(rawBody, header) {
  if (!STRIPE_SIGNING_SECRETS.length) return 'unverifiable';
  // No raw bytes means the runtime parsed the body despite the config above, so
  // there is nothing to hash. That is our problem, not a bad request: say so and
  // let layer 2 carry it, rather than rejecting genuine Stripe traffic.
  if (!rawBody || !rawBody.length) return 'unverifiable';
  // We have the bytes, so a missing or wrong signature is a real failure.
  if (!header) return 'bad';

  let timestamp = null;
  const provided = [];
  for (const part of String(header).split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1') provided.push(v);
  }
  if (!timestamp || !provided.length) return 'bad';

  // Reject replays of a signature captured earlier.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > SIG_TOLERANCE_SECONDS) return 'bad';

  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]);
  for (const secret of STRIPE_SIGNING_SECRETS) {
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
    if (provided.some((p) => hexEqual(p, expected))) return 'ok';
  }
  return 'bad';
}

const sbHeaders = {
  'apikey': SUPABASE_SECRET_KEY,
  'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

// A business plan maps to the access tier we grant on the member's profile.
// The current single all-access plan ('business') grants pro_plus; legacy
// business_pro rows keep granting pro.
function accessTierFor(plan) {
  return plan === 'business_pro' ? 'pro' : 'pro_plus';
}
function nowIso() { return new Date().toISOString(); }

// Map a Stripe price id to our plan name. Returns null for unknown prices —
// callers must NOT downgrade anyone on null (an unrecognized price is a config
// problem to log, not a reason to yank access).
function planFromPrice(priceId) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  if (priceId === process.env.STRIPE_PRO_PLUS_PRICE_ID) return 'pro_plus';
  if (priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) return 'pro';
  if (priceId === process.env.STRIPE_PRO_PLUS_ANNUAL_PRICE_ID) return 'pro_plus';
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let raw = null;
  try { raw = await readRawBody(req); }
  catch (err) { console.error('Webhook: could not read raw body:', err && err.message); }

  const verdict = verifyStripeSignature(raw, req.headers['stripe-signature']);
  if (verdict === 'bad') {
    console.error('Webhook: REJECTED — bad or missing Stripe signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }
  if (verdict === 'unverifiable') {
    // No signing secret set yet. Every handler below re-fetches from Stripe and
    // fails closed, so nothing can be forged into the database — but set
    // STRIPE_WEBHOOK_SECRET in Vercel to restore the first layer.
    console.warn('Webhook: signature NOT checked — STRIPE_WEBHOOK_SECRET is unset');
  }

  let event = {};
  if (raw && raw.length) {
    try { event = JSON.parse(raw.toString('utf8')); } catch { event = {}; }
  } else {
    try {
      if (req.body && typeof req.body === 'object') event = req.body;
    } catch { /* getter threw on a malformed body — leave event empty */ }
  }

  const type = event && event.type;
  const obj = (event && event.data && event.data.object) || {};
  // The only value still read from the posted payload, and it only picks which
  // checkout handler runs. Both re-fetch the session from Stripe and bail if its
  // own metadata doesn't back them up, so a wrong hint here costs nothing.
  const isBusiness = obj.metadata && obj.metadata.type === 'business';
  const stripeKey = event && event.livemode ? STRIPE_KEYS.live : STRIPE_KEYS.test;

  try {
    switch (type) {
      case 'checkout.session.completed': {
        const isLive = !!(event && event.livemode);
        if (isBusiness) await handleBusinessCheckout(obj, stripeKey, isLive);
        else await handleIndividualCheckout(obj, stripeKey, isLive);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        // The posted object decides nothing. Re-read the subscription from Stripe
        // and grant on that alone; if we can't read it, we change nothing.
        const sub = obj.id ? await stripeGet(`subscriptions/${enc(obj.id)}`, stripeKey) : null;
        if (!sub || sub.error) {
          console.error('Subscription event: could not verify', obj.id, '— ignored');
          break;
        }
        const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id);
        // Routing is taken from Stripe's copy too, not the caller's metadata.
        const businessScoped = !!(sub.metadata && sub.metadata.type === 'business');

        if (businessScoped) {
          await patchByFilter('businesses', `stripe_customer_id=eq.${enc(customerId)}`, { subscription_status: sub.status });
        } else {
          const plan = planFromPrice(sub.items?.data?.[0]?.price?.id);
          const patch = { subscription_status: sub.status, stripe_subscription_id: sub.id };
          if (plan) patch.plan = plan;
          else console.error('Subscription event: unrecognized price id', sub.items?.data?.[0]?.price?.id);
          let matched = await patchCount('profiles', `stripe_customer_id=eq.${enc(customerId)}`, patch);
          if (!matched) {
            // The checkout event may not have stored the customer id yet (Stripe
            // events can arrive in any order) — find the profile by the
            // customer's email instead, and store the id while we're at it.
            const email = await stripeCustomerEmail(customerId, stripeKey);
            if (email) {
              matched = await patchCount('profiles', `email=eq.${enc(email)}`, { ...patch, stripe_customer_id: customerId });
            }
            if (!matched) console.error('Subscription event: no profile matched', customerId, email || '(no email)');
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        // Revoke only when Stripe itself says the subscription has ended. A
        // canceled subscription is still readable from the API, so a lookup that
        // 404s means the id was invented, not that access should be pulled.
        const sub = obj.id ? await stripeGet(`subscriptions/${enc(obj.id)}`, stripeKey) : null;
        const ended = !!sub && !sub.error &&
          (sub.status === 'canceled' || sub.status === 'incomplete_expired');
        if (!ended) {
          console.error('Subscription deleted: Stripe did not confirm for', obj.id, '— ignored');
          break;
        }
        const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id);
        const businessScoped = !!(sub.metadata && sub.metadata.type === 'business');

        if (businessScoped) {
          await revokeBusinessAccess(customerId);
        } else {
          const patch = { plan: 'free', subscription_status: 'canceled' };
          let matched = await patchCount('profiles', `stripe_customer_id=eq.${enc(customerId)}`, patch);
          if (!matched) {
            const email = await stripeCustomerEmail(customerId, stripeKey);
            if (email) matched = await patchCount('profiles', `email=eq.${enc(email)}`, patch);
            if (!matched) console.error('Subscription deleted: no profile matched', customerId);
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err && err.message);
    // Return 200 anyway so Stripe doesn't keep retrying — the error is logged.
  }

  return res.status(200).json({ received: true });
}

// ── Individual checkout ────────────────────────────────────────────────────────
// Self-sufficient: stores the Stripe ids AND sets the plan by looking up the
// subscription's price directly, so access is granted even if this is the only
// event that ever matches the profile.
async function handleIndividualCheckout(session, stripeKey, isLive) {
  // Confirm with Stripe before touching anything. Fails closed: if we can't read
  // the session back, we do nothing rather than trust the caller's copy.
  if (!stripeKey || !session.id) {
    console.error('Individual checkout: missing Stripe key or session id — ignored');
    return;
  }
  const s = await stripeGet(`checkout/sessions/${enc(session.id)}`, stripeKey);
  if (!s || s.error) {
    console.error('Individual checkout: could not verify session', session.id, '— ignored');
    return;
  }
  if (!PAID_STATUSES.has(s.payment_status)) {
    console.error('Individual session not paid:', session.id, s.payment_status || '(no payment_status)');
    return;
  }

  const email =
    s.customer_email ||
    (s.customer_details && s.customer_details.email) ||
    null;
  const customerId = s.customer;
  const subscriptionId = s.subscription;

  const patch = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: 'active',
  };

  // Derive the plan here too, so this one event is enough to unlock access.
  if (stripeKey && subscriptionId) {
    const sub = await stripeGet(`subscriptions/${subscriptionId}`, stripeKey);
    if (sub && !sub.error) {
      const plan = planFromPrice(sub.items?.data?.[0]?.price?.id);
      if (plan) patch.plan = plan;
      if (sub.status) patch.subscription_status = sub.status;
    }
  }

  let matched = 0;
  if (email) matched = await patchCount('profiles', `email=eq.${enc(email)}`, patch);
  if (!matched && customerId) {
    matched = await patchCount('profiles', `stripe_customer_id=eq.${enc(customerId)}`, patch);
  }
  if (!matched) console.error('Individual checkout: no profile matched', email || '(no email)', customerId);

  // Owner heads-up for every purchase (remove or quiet this once trust is earned).
  const amount = typeof s.amount_total === 'number'
    ? `$${(s.amount_total / 100).toFixed(2)} ${String(s.currency || 'usd').toUpperCase()}`
    : 'n/a';
  await notifyDan(
    `${isLive ? '' : '[TEST] '}${matched ? '✅' : '🚨'} Purchase: ${patch.plan || 'plan?'} — ${email || '(no email)'}`,
    [
      `Customer: ${email || '(no email)'}`,
      `Plan: ${patch.plan || 'UNKNOWN — check price ids in Vercel env!'}`,
      `Amount: ${amount}`,
      `Provisioned: ${matched ? `YES — profile updated to ${patch.plan || '?'}` : 'NO — NO PROFILE MATCHED. Fix manually in Supabase!'}`,
      `Stripe customer: ${customerId || 'n/a'}`,
      `Subscription: ${subscriptionId || 'n/a'}`,
    ]
  );
}

// Look up a Stripe customer's email (used when a profile has no customer id yet).
async function stripeCustomerEmail(customerId, stripeKey) {
  if (!customerId || !stripeKey) return null;
  const cust = await stripeGet(`customers/${enc(customerId)}`, stripeKey);
  if (cust && !cust.error && !cust.deleted && cust.email) return cust.email;
  return null;
}

// ── Business onboarding ────────────────────────────────────────────────────────
async function handleBusinessCheckout(session, stripeKey, isLive) {
  // Confirm with Stripe before provisioning anything. Fails closed on every path:
  // no key, no session id, an unreadable session, or anything short of 'paid'.
  if (!stripeKey || !session.id) {
    console.error('Business checkout: missing Stripe key or session id — ignored');
    return;
  }
  const s = await stripeGet(`checkout/sessions/${enc(session.id)}`, stripeKey);
  if (!s || s.error) {
    console.error('Business checkout: could not verify session', session.id, '— ignored');
    return;
  }
  // 'no_payment_required' is what a legitimate trial or 100%-off session reports.
  if (!PAID_STATUSES.has(s.payment_status)) {
    console.error('Business session not paid:', session.id, s.payment_status || '(no payment_status)');
    return;
  }

  const m = s.metadata || {};
  const companyName = m.company_name || 'Your company';
  const adminEmail = m.admin_email || s.customer_email;
  const adminName = m.admin_name || 'there';
  const plan = m.plan; // 'business' (current) | business_pro / business_pro_plus (legacy)
  const seats = parseInt(m.seats, 10) || 0;
  const customerId = s.customer;
  const subscriptionId = s.subscription;

  if (!adminEmail || !plan) {
    console.error('Business checkout missing metadata:', m);
    return;
  }

  // Idempotency — don't create the same business twice on a retry.
  const existing = await sbSelect(`businesses?stripe_subscription_id=eq.${enc(subscriptionId)}&select=id`);
  if (Array.isArray(existing) && existing.length > 0) {
    console.log('Business already exists for subscription', subscriptionId);
    return;
  }

  const { link, userId } = await generateSetupLink(adminEmail);

  await sbInsert('businesses', {
    company_name: companyName,
    admin_email: adminEmail,
    admin_id: userId,
    plan,
    seats,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: 'active',
  });

  // Look up the new business row so we can link the admin's own seat to it.
  let businessId = null;
  const created = await sbSelect(`businesses?stripe_subscription_id=eq.${enc(subscriptionId)}&select=id`);
  if (Array.isArray(created) && created[0]) businessId = created[0].id;

  // The admin gets a seat too (per the plan): record them as an active member
  // and unlock their lessons. This counts as 1 of the purchased seats.
  if (businessId) {
    await sbInsert('business_members', {
      business_id: businessId,
      user_id: userId,
      email: adminEmail,
      full_name: adminName === 'there' ? null : adminName,
      role: 'admin',
      status: 'active',
      invited_at: nowIso(),
      activated_at: nowIso(),
    });
  }
  await patchProfileByEmail(adminEmail, {
    plan: accessTierFor(plan),
    subscription_status: 'active',
  });

  await sendAdminWelcome(adminEmail, adminName, companyName, link);

  const amount = typeof s.amount_total === 'number'
    ? `$${(s.amount_total / 100).toFixed(2)} ${String(s.currency || 'usd').toUpperCase()}`
    : 'n/a';
  await notifyDan(
    `${isLive ? '' : '[TEST] '}✅ BUSINESS purchase: ${companyName} — ${plan} × ${seats} seats`,
    [
      `Company: ${companyName}`,
      `Admin: ${adminName} <${adminEmail}>`,
      `Plan: ${plan} · Seats: ${seats}`,
      `Amount: ${amount}`,
      `Stripe customer: ${customerId || 'n/a'}`,
      `Subscription: ${subscriptionId || 'n/a'}`,
    ]
  );
}

// Owner purchase notification — plain and scannable.
async function notifyDan(subject, lines) {
  if (!RESEND_API_KEY) return;
  const html = `<div style="font-family:ui-monospace,Consolas,monospace;font-size:14px;line-height:1.8;color:#14142b;">${lines.map(escapeHtml).join('<br>')}</div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'LearningGPT <no-reply@send.learninggpt.ai>',
      to: ['dan@learninggpt.ai'],
      subject,
      html,
    }),
  });
  if (!r.ok) console.error('Purchase notification failed:', await r.text());
}

// When a business subscription is canceled, revoke everyone's access and mark
// the company + its members inactive — so a canceled team doesn't keep Pro forever.
async function revokeBusinessAccess(customerId) {
  await patchByFilter('businesses', `stripe_customer_id=eq.${enc(customerId)}`, { subscription_status: 'canceled' });
  const biz = await sbSelect(`businesses?stripe_customer_id=eq.${enc(customerId)}&select=id`);
  const id = Array.isArray(biz) && biz[0] ? biz[0].id : null;
  if (!id) return;
  const members = await sbSelect(`business_members?business_id=eq.${enc(id)}&status=eq.active&select=email`);
  if (Array.isArray(members)) {
    for (const mem of members) {
      if (mem.email) await patchProfileByEmail(mem.email, { plan: 'free', subscription_status: 'canceled' });
    }
  }
  await patchByFilter('business_members', `business_id=eq.${enc(id)}`, { status: 'removed' });
}

// ── Supabase REST helpers ──────────────────────────────────────────────────────
function enc(v) { return encodeURIComponent(v == null ? '' : v); }

async function sbSelect(pathAndQuery) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: sbHeaders });
  try { return await r.json(); } catch { return null; }
}

async function sbInsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!r.ok) console.error(`Insert into ${table} failed:`, await r.text());
}

async function patchByFilter(table, filter, patch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) console.error(`Patch ${table} failed:`, await r.text());
}

// Like patchByFilter, but reports how many rows actually changed — so callers
// can tell "no match" apart from "success" and try a fallback. A silent
// zero-row patch is exactly the bug that hid our first customer's upgrade.
async function patchCount(table, filter, patch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) { console.error(`Patch ${table} failed:`, await r.text()); return 0; }
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}

async function patchProfileByEmail(email, patch) {
  if (!email) return;
  await patchByFilter('profiles', `email=eq.${enc(email)}`, patch);
}

// ── Supabase admin: create account + password-setup link ───────────────────────
async function generateSetupLink(email) {
  for (const type of ['invite', 'recovery']) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({ type, email, redirect_to: `${SITE}/auth/reset` }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      const link = data.action_link || (data.properties && data.properties.action_link) || null;
      const userId = data.id || (data.user && data.user.id) || null;
      if (link) return { link, userId };
    }
  }
  console.error('Could not generate setup link for', email);
  return { link: null, userId: null };
}

// ── Stripe REST ─────────────────────────────────────────────────────────────────
async function stripeGet(path, key) {
  if (!key) return null;
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  try { return await r.json(); } catch { return null; }
}

// ── Resend email ─────────────────────────────────────────────────────────────────
async function sendAdminWelcome(email, name, company, link) {
  if (!RESEND_API_KEY || !link) {
    console.error('Skipping welcome email (missing key or link) for', email);
    return;
  }
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f8;padding:32px 0;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececf3;">
    <div style="background:linear-gradient(135deg,#7c5cff,#5b8def);padding:28px 32px;">
      <div style="font-size:18px;font-weight:700;color:#ffffff;">LearningGPT for Business</div>
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:22px;color:#14142b;margin:0 0 12px;">Welcome, ${escapeHtml(name)}!</h1>
      <p style="font-size:15px;color:#4a4a63;line-height:1.6;margin:0 0 20px;">
        Your team's plan for <strong>${escapeHtml(company)}</strong> is active. Set your password to access your
        admin dashboard, where you can invite your team and manage their seats.
      </p>
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#7c5cff,#5b8def);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;">
        Set up my account &rarr;
      </a>
      <p style="font-size:13px;color:#8a8aa0;line-height:1.6;margin:24px 0 0;">
        This link is single-use and expires soon. If it stops working, request a new one from the sign-in page,
        or reply to this email and we'll help.
      </p>
    </div>
    <div style="padding:18px 32px;background:#fafafc;border-top:1px solid #ececf3;font-size:12px;color:#a0a0b5;">
      LearningGPT &middot; <a href="${SITE}" style="color:#5b8def;text-decoration:none;">learninggpt.ai</a>
    </div>
  </div>
</div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'LearningGPT <onboarding@send.learninggpt.ai>',
      to: [email],
      subject: `${company} is set up on LearningGPT — finish your admin setup`,
      html,
    }),
  });
  if (!r.ok) console.error('Resend email failed:', await r.text());
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
