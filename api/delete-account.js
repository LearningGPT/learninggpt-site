// Vercel serverless function: permanent account deletion (App Store 5.1.1(v)).
// POST { token, confirm: "DELETE" } — verifies the user's session, cancels any
// active Stripe subscriptions, removes their data rows, then deletes the
// Supabase auth user. Dependency-free, same patterns as auth.js.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { token, confirm } = body || {};

  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  if (confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Confirmation required.' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return res.status(500).json({ error: 'Server not configured.' });
  }

  const sb = {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1. Who is this? (validates the session token)
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${token}` }
    });
    const user = await userRes.json();
    if (!user || user.error || !user.id) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    const userId = user.id;
    const email = (user.email || '').trim().toLowerCase();
    const e = encodeURIComponent(email);

    // 2. Cancel any active Stripe subscriptions (best-effort; never blocks deletion).
    if (STRIPE_SECRET_KEY && email) {
      try {
        const custRes = await fetch(
          `https://api.stripe.com/v1/customers?email=${e}&limit=10`,
          { headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` } }
        );
        const custData = await custRes.json();
        const customers = (custData && custData.data) || [];
        for (const c of customers) {
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(c.id)}&limit=10`,
            { headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` } }
          );
          const subData = await subRes.json();
          for (const s of (subData && subData.data) || []) {
            if (s.status !== 'canceled') {
              await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(s.id)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` }
              });
            }
          }
        }
      } catch (stripeErr) {
        console.error('delete-account: stripe cancel failed:', stripeErr && stripeErr.message);
      }
    }

    // 3. Remove their data rows (best-effort each; deletion proceeds regardless).
    const del = (path) =>
      fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'DELETE',
        headers: { ...sb, 'Prefer': 'return=minimal' }
      }).catch((err) => console.error('delete-account row cleanup:', path, err && err.message));

    await Promise.all([
      del(`login_events?user_id=eq.${encodeURIComponent(userId)}`),
      del(`drip_log?profile_id=eq.${encodeURIComponent(userId)}`),
      email ? del(`drip_log?email=eq.${e}`) : Promise.resolve(),
      email ? del(`email_captures?email=eq.${e}`) : Promise.resolve(),
      del(`business_members?user_id=eq.${encodeURIComponent(userId)}`),
      del(`lesson_completions?user_id=eq.${encodeURIComponent(userId)}`)
    ]);

    // 4. Delete the profile row.
    await del(`profiles?id=eq.${encodeURIComponent(userId)}`);

    // 5. Delete the auth user itself (admin API).
    const authDel = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: sb
    });
    if (!authDel.ok) {
      const detail = await authDel.text().catch(() => '');
      console.error('delete-account: auth user delete failed:', authDel.status, detail);
      return res.status(500).json({ error: 'Could not fully delete the account. Please contact hello@learninggpt.ai and we will complete it for you.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('delete-account error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
