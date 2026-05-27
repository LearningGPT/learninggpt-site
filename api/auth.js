// Vercel serverless function for LearningGPT authentication
// Handles: signup, login, session verification
// Uses Supabase for auth + Stripe for checkout

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

      // Save plan to user metadata
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
          plan: plan || 'free',
          created_at: new Date().toISOString()
        })
      });

      // If paid plan, create Stripe checkout session
      if (plan === 'pro' || plan === 'pro_plus') {
        const priceId = plan === 'pro'
          ? process.env.STRIPE_PRO_PRICE_ID
          : process.env.STRIPE_PRO_PLUS_PRICE_ID;

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
            'metadata[plan]': plan
          }).toString()
        });

        const stripeData = await stripeRes.json();

        if (stripeData.error) {
          return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
        }

        return res.status(200).json({
          success: true,
          token,
          plan,
          checkoutUrl: stripeData.url
        });
      }

      // Free plan — return token directly
      return res.status(200).json({ success: true, token, plan: 'free' });

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

      // Get user plan from profiles table
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

      return res.status(200).json({
        success: true,
        token: loginData.access_token,
        plan
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

      // Get plan
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

  const priceId = plan === 'pro'
    ? process.env.STRIPE_PRO_PRICE_ID
    : process.env.STRIPE_PRO_PLUS_PRICE_ID;

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
