// Vercel serverless function: server-side lesson progress.
// Actions:
//   complete { token, track, lesson }  -> record a completion (idempotent)
//   mine     { token }                 -> this user's completions (cross-device)
//   team     { token }                 -> per-member engagement rollup (team admins)
// Dependency-free, same patterns as auth.js. Table: public.lesson_completions.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { action, token } = body || {};

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return res.status(500).json({ error: 'Server not configured.' });
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const sb = {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };

  // Validate the session and identify the caller.
  let user;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${token}` }
    });
    user = await userRes.json();
  } catch (e) { user = null; }
  if (!user || user.error || !user.id) return res.status(401).json({ error: 'Invalid or expired session.' });
  const userId = user.id;
  const email = (user.email || '').trim().toLowerCase();

  // ── COMPLETE ───────────────────────────────────────────────────────────────
  if (action === 'complete') {
    const track = String(body.track || '').slice(0, 60);
    const lesson = String(body.lesson || '').slice(0, 200);
    if (!track || !lesson) return res.status(400).json({ error: 'track and lesson are required.' });
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/lesson_completions?on_conflict=user_id,track,lesson`, {
        method: 'POST',
        headers: { ...sb, 'Prefer': 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify({ user_id: userId, email, track, lesson })
      });
      if (!r.ok) console.error('progress complete insert failed:', await r.text());
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('progress complete error:', err);
      return res.status(500).json({ error: 'Could not record progress.' });
    }
  }

  // ── MINE ───────────────────────────────────────────────────────────────────
  if (action === 'mine') {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/lesson_completions?user_id=eq.${encodeURIComponent(userId)}&select=track,lesson,completed_at&order=completed_at.desc&limit=1000`,
        { headers: sb }
      );
      const rows = await r.json();
      return res.status(200).json({ completions: Array.isArray(rows) ? rows : [] });
    } catch (err) {
      return res.status(500).json({ error: 'Could not load progress.' });
    }
  }

  // ── TEAM (admins) ──────────────────────────────────────────────────────────
  if (action === 'team') {
    try {
      // Caller must be an active admin of a business.
      const aRes = await fetch(
        `${SUPABASE_URL}/rest/v1/business_members?user_id=eq.${encodeURIComponent(userId)}&role=eq.admin&status=eq.active&select=business_id&limit=1`,
        { headers: sb }
      );
      const admins = await aRes.json();
      const bizId = Array.isArray(admins) && admins[0] ? admins[0].business_id : null;
      if (!bizId) return res.status(403).json({ error: 'Not a team admin.' });

      const mRes = await fetch(
        `${SUPABASE_URL}/rest/v1/business_members?business_id=eq.${encodeURIComponent(bizId)}&select=email,user_id&limit=500`,
        { headers: sb }
      );
      const members = await mRes.json();
      const ids = (Array.isArray(members) ? members : []).map(m => m.user_id).filter(Boolean);

      const engagement = {};
      (Array.isArray(members) ? members : []).forEach(m => {
        if (m.email) engagement[m.email.toLowerCase()] = { count: 0, last: null };
      });

      if (ids.length) {
        const inList = ids.map(encodeURIComponent).join(',');
        const cRes = await fetch(
          `${SUPABASE_URL}/rest/v1/lesson_completions?user_id=in.(${inList})&select=user_id,completed_at&limit=10000`,
          { headers: sb }
        );
        const rows = await cRes.json();
        const byUser = {};
        (Array.isArray(rows) ? rows : []).forEach(r2 => {
          if (!byUser[r2.user_id]) byUser[r2.user_id] = { count: 0, last: null };
          byUser[r2.user_id].count += 1;
          if (!byUser[r2.user_id].last || r2.completed_at > byUser[r2.user_id].last) byUser[r2.user_id].last = r2.completed_at;
        });
        (Array.isArray(members) ? members : []).forEach(m => {
          if (m.user_id && m.email && byUser[m.user_id]) engagement[m.email.toLowerCase()] = byUser[m.user_id];
        });
      }

      return res.status(200).json({ engagement });
    } catch (err) {
      console.error('progress team error:', err);
      return res.status(500).json({ error: 'Could not load team engagement.' });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}
