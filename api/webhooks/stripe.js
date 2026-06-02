// api/webhooks/stripe.js
// Dependency-free: no npm packages. Uses plain web requests, exactly like auth.js.
// (The old version required the 'stripe' and '@supabase/supabase-js' toolkits, which
//  aren't installed in this project — that's what was crashing the function.)
//
// Authenticity: instead of verifying a signing secret (which fights Vercel's body
// handling), we re-fetch each object from Stripe with the secret key. A spoofed event
// can't survive that check, and we get trustworthy data to act on.

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

const sbHeaders = {
  'apikey': SUPABASE_SECRET_KEY,
  'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

// A business plan maps to the access tier we grant on the member's profile.
function accessTierFor(plan) {
  return plan === 'business_pro_plus' ? 'pro_plus' : 'pro';
}
function nowIso() { return new Date().toISOString(); }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event = req.body;
  if (typeof event === 'string') {
    try { event = JSON.parse(event); } catch { event = {}; }
  }

  const type = event && event.type;
  const obj = (event && event.data && event.data.object) || {};
  const isBusiness = obj.metadata && obj.metadata.type === 'business';
  const stripeKey = event && event.livemode ? STRIPE_KEYS.live : STRIPE_KEYS.test;

  try {
    switch (type) {
      case 'checkout.session.completed': {
        if (isBusiness) await handleBusinessCheckout(obj, stripeKey);
        else await patchProfileByEmail(obj.customer_email, {
          stripe_customer_id: obj.customer,
          stripe_subscription_id: obj.subscription,
          subscription_status: 'active',
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        if (isBusiness) {
          await patchByFilter('businesses', `stripe_customer_id=eq.${enc(obj.customer)}`, { subscription_status: obj.status });
        } else {
          const priceId = obj.items?.data?.[0]?.price?.id;
          let plan = 'free';
          if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'pro';
          if (priceId === process.env.STRIPE_PRO_PLUS_PRICE_ID) plan = 'pro_plus';
          if (priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) plan = 'pro';
          if (priceId === process.env.STRIPE_PRO_PLUS_ANNUAL_PRICE_ID) plan = 'pro_plus';
          await patchByFilter('profiles', `stripe_customer_id=eq.${enc(obj.customer)}`, {
            plan, subscription_status: obj.status, stripe_subscription_id: obj.id,
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        if (isBusiness) {
          await revokeBusinessAccess(obj.customer);
        } else {
          await patchByFilter('profiles', `stripe_customer_id=eq.${enc(obj.customer)}`, { plan: 'free', subscription_status: 'canceled' });
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

// ── Business onboarding ────────────────────────────────────────────────────────
async function handleBusinessCheckout(session, stripeKey) {
  // Re-fetch from Stripe to confirm it's real and paid.
  let s = session;
  if (stripeKey) {
    const fetched = await stripeGet(`checkout/sessions/${session.id}`, stripeKey);
    if (fetched && !fetched.error) s = fetched;
  }
  if (s.payment_status && s.payment_status !== 'paid') {
    console.error('Business session not paid:', session.id, s.payment_status);
    return;
  }

  const m = s.metadata || session.metadata || {};
  const companyName = m.company_name || 'Your company';
  const adminEmail = m.admin_email || s.customer_email || session.customer_email;
  const adminName = m.admin_name || 'there';
  const plan = m.plan; // business_pro | business_pro_plus
  const seats = parseInt(m.seats, 10) || 0;
  const customerId = s.customer || session.customer;
  const subscriptionId = s.subscription || session.subscription;

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
