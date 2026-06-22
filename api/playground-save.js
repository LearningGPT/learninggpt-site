// Vercel serverless function — saves & serves shared playground comparisons.
// Powers shareable permalinks and the public gallery.
//
// Modes:
//   POST { prompt, results, coach }   → saves a run, returns { id }
//   GET  ?id=<uuid>                   → returns one saved run
//   GET  ?gallery=1                   → returns up to 30 recent public runs (compact)
//
// Uses the same Supabase service key as the rest of the API (bypasses RLS).
// Requires a `playground_runs` table — see the SQL in the Phase 2 setup notes.

const ALLOWED_ORIGINS = ['https://learninggpt.ai', 'https://www.learninggpt.ai'];

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { base: url.replace(/\/$/, ''), key } : null;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const conn = sb();
  if (!conn) return res.status(500).json({ error: 'Supabase env not configured.' });
  const headers = { apikey: conn.key, Authorization: 'Bearer ' + conn.key, 'Content-Type': 'application/json' };

  // ── GET: one run by id, or the gallery feed ──
  if (req.method === 'GET') {
    const id = req.query.id;
    const gallery = req.query.gallery;
    try {
      if (id) {
        const r = await fetch(conn.base + '/rest/v1/playground_runs?id=eq.' + encodeURIComponent(id) + '&select=id,created_at,prompt,results,coach', { headers });
        const rows = await r.json();
        if (!Array.isArray(rows) || !rows[0]) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json({ run: rows[0] });
      }
      if (gallery) {
        const r = await fetch(conn.base + '/rest/v1/playground_runs?public=eq.true&select=id,created_at,prompt&order=created_at.desc&limit=30', { headers });
        const rows = await r.json();
        return res.status(200).json({ runs: Array.isArray(rows) ? rows : [] });
      }
      return res.status(400).json({ error: 'Provide ?id= or ?gallery=1' });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Fetch failed' });
    }
  }

  // ── POST: save a run ──
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const { prompt, results, coach } = body || {};
    if (!prompt || typeof prompt !== 'string' || prompt.length > 4000) return res.status(400).json({ error: 'Invalid prompt' });
    if (!Array.isArray(results) || results.length === 0 || results.length > 6) return res.status(400).json({ error: 'Invalid results' });

    // Keep only the fields we render, and cap sizes so a row can't balloon.
    const slim = results.map((r) => ({
      modelId: String(r.modelId || ''),
      modelName: String(r.modelName || ''),
      response: String(r.response || '').slice(0, 8000),
      tokens: r.tokens || 0,
      promptTokens: r.promptTokens || 0,
      completionTokens: r.completionTokens || 0,
      timeMs: r.timeMs || 0,
      error: r.error ? String(r.error).slice(0, 500) : null
    }));

    try {
      const r = await fetch(conn.base + '/rest/v1/playground_runs', {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          prompt: prompt.slice(0, 4000),
          results: slim,
          coach: coach ? String(coach).slice(0, 4000) : null
        })
      });
      const rows = await r.json();
      if (!r.ok || !Array.isArray(rows) || !rows[0]) return res.status(500).json({ error: 'Save failed' });
      return res.status(200).json({ id: rows[0].id });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Save failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
