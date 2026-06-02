// Vercel serverless function for LearningGPT BUSINESS onboarding + team management
// Actions:
//   create-checkout → business signup → Stripe Checkout (unchanged; add-on parked)
//   team            → admin loads their company + member list
//   invite          → admin assigns a seat to an email (+ sends an invite email)
//   remove          → admin frees a seat and revokes that person's access
//   sync            → any logged-in user claims a pending invite → access turns on
//
// Price IDs below are the LIVE ones currently in use — DO NOT change them.

import { randomUUID } from 'node:crypto';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const PRICES = {
  business_pro:      { monthly: 'price_1TcGwIPtA7wbJTlEgs7udWDF', annual: 'price_1TcGwfPtA7wbJTlEhMJI109i' },
  business_pro_plus: { monthly: 'price_1TcGx6PtA7wbJTlE3gJtkpBZ', annual: 'price_1TcGxRPtA7wbJTlEQnHV1HRu' },
  team_engagement_monthly: 'price_1TcGxpPtA7wbJTlEcgiBla5R'
};

const MIN_SEATS = 3;
const SITE = 'https://learninggpt.ai';

// ── Supabase / Resend ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;          // service role (bypasses RLS)
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY; // anon (needed for /auth/v1/user)
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const sbHeaders = {
  'apikey': SUPABASE_SECRET_KEY,
  'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

function enc(v) { return encodeURIComponent(v == null ? '' : v); }
function nowIso() { return new Date().toISOString(); }
function accessTierFor(plan) { return plan === 'business_pro_plus' ? 'pro_plus' : 'pro'; }
function normEmail(e) { return String(e || '').trim().toLowerCase(); }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sbSelect(pathAndQuery) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: sbHeaders });
  try { return await r.json(); } catch { return null; }
}
async function sbInsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...sbHeaders, 'Prefer': 'return=minimal' }, body: JSON.stringify(row),
  });
  if (!r.ok) console.error(`Insert ${table} failed:`, await r.text());
}
async function sbPatch(table, filter, patch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH', headers: { ...sbHeaders, 'Prefer': 'return=minimal' }, body: JSON.stringify(patch),
  });
  if (!r.ok) console.error(`Patch ${table} failed:`, await r.text());
}
async function setProfilePlan(email, plan, status) {
  if (!email) return;
  await sbPatch('profiles', `email=eq.${enc(email)}`, { plan, subscription_status: status });
}

// Validate a login token → { id, email } or null.
async function getUser(token) {
  if (!token || !SUPABASE_PUBLISHABLE_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  if (!u || !u.id) return null;
  return { id: u.id, email: normEmail(u.email) };
}

// The business this user administers (by id, then by email), or null.
async function findAdminBusiness(user) {
  let rows = await sbSelect(`businesses?admin_id=eq.${enc(user.id)}&select=*`);
  if (Array.isArray(rows) && rows[0]) return rows[0];
  rows = await sbSelect(`businesses?admin_email=eq.${enc(user.email)}&select=*`);
  if (Array.isArray(rows) && rows[0]) return rows[0];
  return null;
}

// Active + pending members hold a seat.
async function listMembers(businessId) {
  const rows = await sbSelect(
    `business_members?business_id=eq.${enc(businessId)}&status=in.(active,pending)` +
    `&select=id,email,full_name,role,status,activated_at,invited_at&order=invited_at.asc`
  );
  return Array.isArray(rows) ? rows : [];
}

// Make sure the admin always occupies a seat — self-heals older/edge cases where
// the purchase webhook didn't record the admin's member row.
async function ensureAdminMember(biz) {
  const existing = await sbSelect(
    `business_members?business_id=eq.${enc(biz.id)}&role=eq.admin&status=in.(active,pending)&select=id`
  );
  if (Array.isArray(existing) && existing.length) return;
  await sbInsert('business_members', {
    id: randomUUID(),
    business_id: biz.id,
    user_id: biz.admin_id || null,
    email: normEmail(biz.admin_email),
    full_name: null,
    role: 'admin',
    status: 'active',
    invited_at: nowIso(),
    activated_at: nowIso(),
  });
  await setProfilePlan(biz.admin_email, accessTierFor(biz.plan), 'active');
}

async function sendInviteEmail(email, company, tier) {
  if (!RESEND_API_KEY) return;
  const tierLabel = tier === 'pro_plus' ? 'Pro+' : 'Pro';
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f8;padding:32px 0;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececf3;">
      <div style="background:linear-gradient(135deg,#7c5cff,#5b8def);padding:28px 32px;">
        <div style="font-size:18px;font-weight:700;color:#ffffff;">LearningGPT</div>
      </div>
      <div style="padding:32px;">
        <h1 style="font-size:22px;color:#14142b;margin:0 0 12px;">You've been added to ${escapeHtml(company)}'s team</h1>
        <p style="font-size:15px;color:#4a4a63;line-height:1.6;margin:0 0 20px;">
          ${escapeHtml(company)} has given you a LearningGPT <strong>${tierLabel}</strong> seat — full access to the AI tool tracks,
          lessons, and playground. Create your account (or sign in) with <strong>this email</strong> and your access turns on automatically.
        </p>
        <a href="${SITE}/auth/signup" style="display:inline-block;background:linear-gradient(135deg,#7c5cff,#5b8def);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;">
          Get started &rarr;
        </a>
        <p style="font-size:13px;color:#8a8aa0;line-height:1.6;margin:24px 0 0;">
          Already have a LearningGPT account on this email? Just sign in — your seat is already linked.
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
      subject: `You've got a LearningGPT seat from ${company}`,
      html,
    }),
  });
  if (!r.ok) console.error('Invite email failed:', await r.text());
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { action } = body;

  // ── CREATE CHECKOUT ──────────────────────────────────────────────────────────
  if (action === 'create-checkout') {
    let { plan, billing, seats, company, name, email } = body;

    if (plan !== 'business_pro' && plan !== 'business_pro_plus') {
      return res.status(400).json({ error: 'Invalid plan.' });
    }
    if (billing !== 'monthly' && billing !== 'annual') {
      return res.status(400).json({ error: 'Invalid billing cycle.' });
    }
    seats = parseInt(seats, 10);
    if (!Number.isInteger(seats) || seats < MIN_SEATS) {
      return res.status(400).json({ error: `Minimum ${MIN_SEATS} seats required.` });
    }
    if (!company || !name) {
      return res.status(400).json({ error: 'Company name and your name are required.' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid work email is required.' });
    }

    // Add-on is parked (Contact Dan) until those features ship — never charged for now.
    const addonActive = false;

    const basePrice = PRICES[plan][billing];
    if (!basePrice) return res.status(500).json({ error: 'Price not configured. Please contact support.' });
    if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Payment system not configured. Please contact support.' });

    const params = {
      'mode': 'subscription',
      'customer_email': email,
      'line_items[0][price]': basePrice,
      'line_items[0][quantity]': String(seats),
      'success_url': `${SITE}/business-success?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${SITE}/signup`,
      'allow_promotion_codes': 'true',
      'metadata[type]': 'business',
      'metadata[company_name]': company,
      'metadata[admin_name]': name,
      'metadata[admin_email]': email,
      'metadata[plan]': plan,
      'metadata[billing]': billing,
      'metadata[seats]': String(seats),
      'metadata[addon]': 'false',
      'subscription_data[metadata][type]': 'business',
      'subscription_data[metadata][company_name]': company,
      'subscription_data[metadata][plan]': plan,
      'subscription_data[metadata][seats]': String(seats)
    };

    if (addonActive) {
      params['line_items[1][price]'] = PRICES.team_engagement_monthly;
      params['line_items[1][quantity]'] = String(seats);
    }

    try {
      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString()
      });
      const stripeData = await stripeRes.json();
      if (stripeData.error) {
        console.error('Stripe error:', stripeData.error);
        return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
      }
      return res.status(200).json({ success: true, url: stripeData.url, checkoutUrl: stripeData.url });
    } catch (err) {
      console.error('Business checkout error:', err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  // ── TEAM (admin loads dashboard) ───────────────────────────────────────────────
  if (action === 'team') {
    const user = await getUser(body.token);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const biz = await findAdminBusiness(user);
    if (!biz) return res.status(403).json({ error: 'This account isn’t set up as a team admin.' });
    await ensureAdminMember(biz);
    const members = await listMembers(biz.id);
    return res.status(200).json({
      business: { company_name: biz.company_name, plan: biz.plan, seats: biz.seats, status: biz.subscription_status },
      seatsUsed: members.length,
      members,
    });
  }

  // ── INVITE (admin assigns a seat) ──────────────────────────────────────────────
  if (action === 'invite') {
    const user = await getUser(body.token);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const biz = await findAdminBusiness(user);
    if (!biz) return res.status(403).json({ error: 'This account isn’t set up as a team admin.' });
    if (biz.subscription_status && biz.subscription_status !== 'active') {
      return res.status(403).json({ error: 'Your subscription isn’t active right now.' });
    }
    await ensureAdminMember(biz);
    const email = normEmail(body.email);
    const fullName = (body.name || '').trim() || null;
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    const dupe = await sbSelect(`business_members?business_id=eq.${enc(biz.id)}&email=eq.${enc(email)}&status=in.(active,pending)&select=id`);
    if (Array.isArray(dupe) && dupe.length) return res.status(409).json({ error: 'That person is already on your team.' });

    const members = await listMembers(biz.id);
    if (members.length >= biz.seats) {
      return res.status(409).json({ error: `All ${biz.seats} seats are in use. Remove someone, or add seats from Manage billing.` });
    }

    const tier = accessTierFor(biz.plan);
    const prof = await sbSelect(`profiles?email=eq.${enc(email)}&select=id`);
    const profileId = Array.isArray(prof) && prof[0] ? prof[0].id : null;

    await sbInsert('business_members', {
      id: randomUUID(),
      business_id: biz.id,
      user_id: profileId,
      email,
      full_name: fullName,
      role: 'member',
      status: profileId ? 'active' : 'pending',
      invited_at: nowIso(),
      activated_at: profileId ? nowIso() : null,
    });
    if (profileId) await setProfilePlan(email, tier, 'active'); // existing account → access now

    await sendInviteEmail(email, biz.company_name, tier);

    const updated = await listMembers(biz.id);
    return res.status(200).json({ ok: true, seatsUsed: updated.length, members: updated });
  }

  // ── INVITE BULK (admin assigns many seats from a CSV / pasted list) ─────────────
  if (action === 'invite-bulk') {
    const user = await getUser(body.token);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const biz = await findAdminBusiness(user);
    if (!biz) return res.status(403).json({ error: 'This account isn’t set up as a team admin.' });
    if (biz.subscription_status && biz.subscription_status !== 'active') {
      return res.status(403).json({ error: 'Your subscription isn’t active right now.' });
    }
    await ensureAdminMember(biz);

    // Clean + de-dupe the incoming list.
    const raw = Array.isArray(body.emails) ? body.emails : [];
    const seen = new Set();
    const cleaned = [];
    for (const r of raw) {
      const e = normEmail(r);
      if (e && !seen.has(e)) { seen.add(e); cleaned.push(e); }
    }

    const members = await listMembers(biz.id);
    const onTeam = new Set(members.map((m) => normEmail(m.email)));
    let used = members.length;
    const tier = accessTierFor(biz.plan);

    const invited = [];
    const skipped = [];
    for (const email of cleaned) {
      if (!EMAIL_RE.test(email)) { skipped.push({ email, reason: 'invalid' }); continue; }
      if (onTeam.has(email)) { skipped.push({ email, reason: 'already on team' }); continue; }
      if (used >= biz.seats) { skipped.push({ email, reason: 'no seats left' }); continue; }

      const prof = await sbSelect(`profiles?email=eq.${enc(email)}&select=id`);
      const profileId = Array.isArray(prof) && prof[0] ? prof[0].id : null;
      await sbInsert('business_members', {
        id: randomUUID(),
        business_id: biz.id,
        user_id: profileId,
        email,
        full_name: null,
        role: 'member',
        status: profileId ? 'active' : 'pending',
        invited_at: nowIso(),
        activated_at: profileId ? nowIso() : null,
      });
      if (profileId) await setProfilePlan(email, tier, 'active');
      await sendInviteEmail(email, biz.company_name, tier);
      onTeam.add(email);
      used++;
      invited.push(email);
    }

    const after = await listMembers(biz.id);
    return res.status(200).json({ ok: true, invited, skipped, seatsUsed: after.length, members: after });
  }

  // ── REMOVE (admin frees a seat) ────────────────────────────────────────────────
  if (action === 'remove') {
    const user = await getUser(body.token);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const biz = await findAdminBusiness(user);
    if (!biz) return res.status(403).json({ error: 'This account isn’t set up as a team admin.' });

    const rows = await sbSelect(`business_members?id=eq.${enc(body.memberId)}&business_id=eq.${enc(biz.id)}&select=*`);
    const member = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!member) return res.status(404).json({ error: 'Member not found.' });
    if (member.role === 'admin') return res.status(400).json({ error: 'You can’t remove the account admin.' });

    await sbPatch('business_members', `id=eq.${enc(member.id)}`, { status: 'removed' });

    // Revoke access — unless they pay for their own individual plan.
    const prof = await sbSelect(`profiles?email=eq.${enc(member.email)}&select=stripe_subscription_id`);
    const hasOwnSub = Array.isArray(prof) && prof[0] && prof[0].stripe_subscription_id;
    if (!hasOwnSub) await setProfilePlan(member.email, 'free', 'canceled');

    const updated = await listMembers(biz.id);
    return res.status(200).json({ ok: true, seatsUsed: updated.length, members: updated });
  }

  // ── SYNC (any logged-in user claims their invite → access turns on) ─────────────
  if (action === 'sync') {
    const user = await getUser(body.token);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const rows = await sbSelect(`business_members?email=eq.${enc(user.email)}&status=in.(active,pending)&select=*`);
    const member = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!member) return res.status(200).json({ plan: null });

    const bizRows = await sbSelect(`businesses?id=eq.${enc(member.business_id)}&select=plan,subscription_status,company_name`);
    const biz = Array.isArray(bizRows) && bizRows[0] ? bizRows[0] : null;
    if (!biz || (biz.subscription_status && biz.subscription_status !== 'active')) {
      return res.status(200).json({ plan: null });
    }

    const tier = accessTierFor(biz.plan);
    if (member.status !== 'active' || !member.user_id) {
      await sbPatch('business_members', `id=eq.${enc(member.id)}`, {
        user_id: user.id, status: 'active', activated_at: member.activated_at || nowIso(),
      });
    }
    await setProfilePlan(user.email, tier, 'active');
    return res.status(200).json({ plan: tier, company: biz.company_name });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
