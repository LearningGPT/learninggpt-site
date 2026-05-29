// Vercel serverless function for LearningGPT BUSINESS onboarding
// Handles: create-checkout (business signup → Stripe Checkout)
// Mirrors the conventions in api/auth.js (raw fetch, URLSearchParams, action routing)

// ── Stripe key ───────────────────────────────────────────────────────────────
// During development we use the SANDBOX test key so we don't touch the LIVE
// individual-plan checkout (auth.js uses STRIPE_SECRET_KEY for that).
// AT LAUNCH: change this to process.env.STRIPE_SECRET_KEY and swap PRICES to live IDs.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY_TEST;

// ── Price IDs ────────────────────────────────────────────────────────────────
// SANDBOX / TEST price IDs. (Price IDs aren't secret, so they're safe in code.)
// AT LAUNCH: replace these five with the matching LIVE price IDs.
const PRICES = {
  business_pro:      { monthly: 'price_1TcEP4LLT2XwxxQy8l0KIIjo', annual: 'price_1TcES8LLT2XwxxQy5lEaNNh0' },
  business_pro_plus: { monthly: 'price_1TcEPmLLT2XwxxQypVCmaE4B', annual: 'price_1TcESmLLT2XwxxQy2cJH8WTm' },
  team_engagement_monthly: 'price_1TcEQNLLT2XwxxQyFCOGGjMn'
};

const MIN_SEATS = 3;
const ADDON_MIN_SEATS = 25;
const SITE = 'https://learninggpt.ai';

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
    let { plan, billing, seats, addon, company, name, email } = body;

    // Validate (never trust the client) ─────────────────────────────────────────
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
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid work email is required.' });
    }

    // Re-validate add-on rules server-side: monthly only (no annual price exists)
    // and a 25-seat minimum.
    const addonActive = !!addon && billing === 'monthly' && seats >= ADDON_MIN_SEATS;

    const basePrice = PRICES[plan][billing];
    if (!basePrice) {
      return res.status(500).json({ error: 'Price not configured. Please contact support.' });
    }
    if (!STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Payment system not configured. Please contact support.' });
    }

    // Build the Checkout session ─────────────────────────────────────────────────
    const params = {
      'mode': 'subscription',
      'customer_email': email,
      'line_items[0][price]': basePrice,
      'line_items[0][quantity]': String(seats),
      'success_url': `${SITE}/business-success?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${SITE}/signup`,
      'allow_promotion_codes': 'true',
      // Metadata the webhook (Step 5) reads to create the business record:
      'metadata[type]': 'business',
      'metadata[company_name]': company,
      'metadata[admin_name]': name,
      'metadata[admin_email]': email,
      'metadata[plan]': plan,
      'metadata[billing]': billing,
      'metadata[seats]': String(seats),
      'metadata[addon]': addonActive ? 'true' : 'false',
      // Mirror key fields onto the subscription itself for later seat management:
      'subscription_data[metadata][type]': 'business',
      'subscription_data[metadata][company_name]': company,
      'subscription_data[metadata][plan]': plan,
      'subscription_data[metadata][seats]': String(seats)
    };

    // Add the Team Engagement Suite as a second line item if selected:
    if (addonActive) {
      params['line_items[1][price]'] = PRICES.team_engagement_monthly;
      params['line_items[1][quantity]'] = String(seats);
    }

    try {
      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(params).toString()
      });

      const stripeData = await stripeRes.json();

      if (stripeData.error) {
        console.error('Stripe error:', stripeData.error);
        return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
      }

      // Return both keys: `url` for the signup page, `checkoutUrl` to match auth.js.
      return res.status(200).json({
        success: true,
        url: stripeData.url,
        checkoutUrl: stripeData.url
      });

    } catch (err) {
      console.error('Business checkout error:', err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}
