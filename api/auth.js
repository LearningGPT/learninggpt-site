// Vercel serverless function for LearningGPT authentication
// Handles: signup, login, session verification, checkout
// Uses Supabase for auth + Stripe for checkout
// Supports monthly AND annual plans for Pro and Pro+.

// ── Team-seat activation ─────────────────────────────────────────────────────
// If this email was assigned a seat by a business team, switch their access on
// the moment they authenticate (login OR signup) — no matter where they land.
// Returns the access tier ('pro' | 'pro_plus') to apply, or null if no seat.
async function businessSyncSeat(email, userId) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!email || !SUPABASE_URL || !SUPABASE_SECRET_KEY) return null;

  const sb = {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };
  const e = encodeURIComponent(email.trim().toLowerCase());

  try {
    // Is there a seat assigned to this email (active or still pending)?
    const mRes = await fetch(
      `${SUPABASE_URL}/rest/v1/business_members?email=eq.${e}&status=in.(active,pending)&select=id,business_id,status,user_id`,
      { headers: sb }
    );
    const members = await mRes.json();
    const member = Array.isArray(members) && members[0] ? members[0] : null;
    if (!member) return null;

    // Is the company subscription active?
    const bRes = await fetch(
      `${SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(member.business_id)}&select=plan,subscription_status`,
      { headers: sb }
    );
    const bizArr = await bRes.json();
    const biz = Array.isArray(bizArr) && bizArr[0] ? bizArr[0] : null;
    if (!biz) return null;
    if (biz.subscription_status && biz.subscription_status !== 'active') return null;

    // Single all-access plan ('business') grants pro_plus; legacy business_pro keeps pro.
    const tier = biz.plan === 'business_pro' ? 'pro' : 'pro_plus';

    // Activate the seat (mark active + link their user id).
    if (member.status !== 'active' || !member.user_id) {
      await fetch(`${SUPABASE_URL}/rest/v1/business_members?id=eq.${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        headers: { ...sb, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          user_id: userId || member.user_id || null,
          status: 'active',
          activated_at: new Date().toISOString()
        })
      });
    }

    // Grant access on their profile.
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${e}`, {
      method: 'PATCH',
      headers: { ...sb, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ plan: tier, subscription_status: 'active' })
    });

    return tier;
  } catch (err) {
    console.error('businessSyncSeat error:', err && err.message);
    return null;
  }
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

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

  // Plan key -> Stripe price ID (monthly + annual for Pro and Pro+).
  const PRICE_IDS = {
    pro:             process.env.STRIPE_PRO_PRICE_ID,
    pro_plus:        process.env.STRIPE_PRO_PLUS_PRICE_ID,
    pro_annual:      process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    pro_plus_annual: process.env.STRIPE_PRO_PLUS_ANNUAL_PRICE_ID,
  };

  // What we store in profiles.plan — gate.js checks 'pro' / 'pro_plus' (billing-agnostic).
  const basePlan = (p) =>
    (p === 'pro' || p === 'pro_annual') ? 'pro'
    : (p === 'pro_plus' || p === 'pro_plus_annual') ? 'pro_plus'
    : 'free';

  const { action } = body;

  // ── SIGNUP ─────────────────────────────────────────────────────────────────
  if (action === 'signup') {
    const { email, password, plan } = body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
      // Create user in Supabase
      const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`
        },
        body: JSON.stringify({ email, password })
      });

      const signupData = await signupRes.json();

      if (signupData.error) {
        return res.status(400).json({ error: signupData.error.message || 'Could not create account.' });
      }

      const userId = signupData.user?.id;
      const token = signupData.access_token;

      // Save the (billing-agnostic) plan to the profile.
      await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          id: userId,
          email: email,
          plan: basePlan(plan),
          created_at: new Date().toISOString()
        })
      });

      // If a paid plan was chosen, create a Stripe checkout session.
      const priceId = PRICE_IDS[plan];
      if (priceId) {
        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            'mode': 'subscription',
            'customer_email': email,
            'line_items[0][price]': priceId,
            'line_items[0][quantity]': '1',
            'success_url': 'https://learninggpt.ai/auth/success?session_id={CHECKOUT_SESSION_ID}',
            'cancel_url': 'https://learninggpt.ai/auth/signup',
            'metadata[user_id]': userId,
            'metadata[plan]': basePlan(plan)
          }).toString()
        });

        const stripeData = await stripeRes.json();

        if (stripeData.error) {
          return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
        }

        return res.status(200).json({
          success: true,
          token,
          plan: basePlan(plan),
          checkoutUrl: stripeData.url
        });
      }

      // Free plan — but if they were invited to a team, turn their seat on now.
      const seatTier = await businessSyncSeat(email, userId);
      return res.status(200).json({ success: true, token, plan: seatTier || 'free' });

    } catch (err) {
      console.error('Signup error:', err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (action === 'login') {
    const { email, password } = body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
      const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`
        },
        body: JSON.stringify({ email, password })
      });

      const loginData = await loginRes.json();

      if (loginData.error || !loginData.access_token) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Log the login event (best-effort — never blocks login)
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/login_events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SECRET_KEY,
            'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            user_id: loginData.user.id,
            email: email,
            created_at: new Date().toISOString()
          })
        });
      } catch (logErr) {
        console.error('login_events insert failed:', logErr);
      }

      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${loginData.user.id}&select=plan`,
        {
          headers: {
            'apikey': SUPABASE_SECRET_KEY,
            'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`
          }
        }
      );

      const profiles = await profileRes.json();
      const plan = profiles?.[0]?.plan || 'free';

      // If this person holds a team seat, make sure their access is switched on.
      const seatTier = await businessSyncSeat(email, loginData.user.id);

      return res.status(200).json({
        success: true,
        token: loginData.access_token,
        plan: seatTier || plan
      });

    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  // ── VERIFY SESSION ─────────────────────────────────────────────────────────
  if (action === 'verify') {
    const { token } = body;

    if (!token) {
      return res.status(401).json({ error: 'No token provided', authenticated: false });
    }

    try {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'apikey': SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${token}`
        }
      });

      const userData = await userRes.json();

      if (userData.error || !userData.id) {
        return res.status(401).json({ error: 'Invalid or expired session', authenticated: false });
      }

      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userData.id}&select=plan`,
        {
          headers: {
            'apikey': SUPABASE_SECRET_KEY,
            'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`
          }
        }
      );

      const profiles = await profileRes.json();
      const plan = profiles?.[0]?.plan || 'free';

      return res.status(200).json({ authenticated: true, plan, userId: userData.id });

    } catch (err) {
      return res.status(401).json({ error: 'Session verification failed', authenticated: false });
    }
  }

  // ── CHECKOUT (for logged-in users upgrading) ──────────────────────────────
  if (action === 'checkout') {
    const { token, plan } = body;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }

    try {
      // Get user info from token
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'apikey': SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      const userData = await userRes.json();

      if (!userData.email) {
        return res.status(401).json({ error: 'Invalid session.' });
      }

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'mode': 'subscription',
          'customer_email': userData.email,
          'line_items[0][price]': priceId,
          'line_items[0][quantity]': '1',
          'success_url': 'https://learninggpt.ai/auth/success?session_id={CHECKOUT_SESSION_ID}',
          'cancel_url': 'https://learninggpt.ai/pricing'
        }).toString()
      });

      const stripeData = await stripeRes.json();

      if (stripeData.error) {
        return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
      }

      return res.status(200).json({ checkoutUrl: stripeData.url });

    } catch (err) {
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}
