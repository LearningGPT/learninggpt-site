// Vercel serverless function: open the Stripe Customer Portal for the logged-in user.
// The dashboard's "Manage subscription" button POSTs { token } here and we return { url }.
// Dependency-free (same style as api/auth.js): uses fetch to Supabase + Stripe REST.

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

  const { token } = body;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    // 1. Resolve the signed-in user's email from their token.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${token}` }
    });
    const userData = await userRes.json();
    if (!userData || !userData.email) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    // 2. Find this person's Stripe customer by email.
    const custRes = await fetch(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(userData.email)}&limit=1`,
      { headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    const custData = await custRes.json();
    const customer = custData.data && custData.data[0];
    if (!customer) {
      return res.status(404).json({ error: 'No billing account found. If you just subscribed, give it a minute and try again.' });
    }

    // 3. Create a Customer Portal session and hand back the URL.
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        customer: customer.id,
        return_url: 'https://learninggpt.ai/account'
      }).toString()
    });
    const portalData = await portalRes.json();
    if (portalData.error) {
      return res.status(500).json({ error: portalData.error.message || 'Could not open the billing portal.' });
    }

    return res.status(200).json({ url: portalData.url });

  } catch (e) {
    return res.status(500).json({ error: 'Something went wrong opening the billing portal.' });
  }
}
