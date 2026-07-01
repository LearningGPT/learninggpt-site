// Vercel serverless function for the LearningGPT playground
// Three modes:
//   POST { prompt, models }                          → runs all models (up to 6)
//   POST { prompt, results, coach: true }            → playground coach analysis
//   POST { coach: true, lessonCoach: true, ... }     → per-lesson AI tutor
//
// Cost protection added:
//   - CORS locked to the LearningGPT domain (blocks other sites calling it via a browser)
//   - Per-IP daily limit (DAILY_LIMIT), enforced server-side via Supabase, covering ALL modes
//   - Fails OPEN: if the usage counter is ever unreachable, requests still go through.
//     Your OpenRouter spend cap is the hard backstop, so a counter glitch never takes
//     the playground down for real visitors.
const DAILY_LIMIT = 30; // requests per IP per day, shared across all three modes
const ALLOWED_ORIGINS = ['https://learninggpt.ai', 'https://www.learninggpt.ai'];
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
// Increments today's count for this IP and returns the new total.
// Returns null if the check couldn't run (we then fail open).
async function bumpUsage(ip) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null; // misconfigured → fail open
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/bump_playground_usage', {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_ip: ip })
    });
    if (!r.ok) return null; // error → fail open
    const count = await r.json(); // RPC returns the integer count
    return typeof count === 'number' ? count : (parseInt(count, 10) || null);
  } catch {
    return null; // network error → fail open
  }
}
// Returns true if the request carries a valid login token for a paying
// (Pro / Pro+) account. Paid members get unlimited playground use — their plan
// promises it — so they skip the per-IP daily cap. Verification failures return
// false (treated as non-paid, still capped), so a hiccup never removes the cost
// protection for free/anonymous traffic.
async function isPaidUser(token) {
  if (!token) return false;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;     // server-only, bypasses RLS
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;   // needed for /auth/v1/user
  if (!url || !serviceKey || !anonKey) return false;
  const base = url.replace(/\/$/, '');
  try {
    // 1) Validate the token and get the user id.
    const ur = await fetch(base + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token }
    });
    if (!ur.ok) return false;
    const user = await ur.json();
    if (!user || !user.id) return false;
    // 2) Look up their plan (read-only).
    const pr = await fetch(base + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=plan', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
    });
    if (!pr.ok) return false;
    const rows = await pr.json();
    const plan = Array.isArray(rows) && rows[0] ? rows[0].plan : null;
    // Any "pro" tier (pro, pro_plus, and their annual variants) counts as paid.
    return !!plan && String(plan).toLowerCase().startsWith('pro');
  } catch {
    return false;
  }
}
export default async function handler(req, res) {
  // ── CORS: locked to our domain. Same-origin calls from the site are unaffected. ──
  const origin = req.headers.origin;
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured in Vercel.' });
  // ── RATE LIMIT: per IP per day, covers every mode below ──
  // Paid (Pro/Pro+) members get unlimited playground use, so a valid Pro token
  // skips the cap entirely. Everyone else (free + anonymous) stays capped per IP.
  const paid = await isPaidUser(body.token);
  if (!paid) {
    const ip = getClientIp(req);
    const count = await bumpUsage(ip);
    if (count !== null && count > DAILY_LIMIT) {
      return res.status(429).json({
        error: "You've reached today's free playground limit. Upgrade to Pro for unlimited runs, or come back tomorrow.",
        rateLimited: true
      });
    }
  }
  // ── LESSON COACH MODE ────────────────────────────────────────────────────────
  if (body.coach === true && body.lessonCoach === true) {
    const { lessonContext, history } = body;
    if (!lessonContext || !Array.isArray(history)) {
      return res.status(400).json({ error: 'Missing lessonContext or history' });
    }
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://learninggpt.ai',
          'X-Title': 'LearningGPT Lesson Coach'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-6',
          messages: [
            { role: 'system', content: lessonContext },
            ...history
          ],
          max_tokens: 400,
          temperature: 0.6
        })
      });
      const data = await response.json();
      const coach = data.choices?.[0]?.message?.content || null;
      return res.status(200).json({ coach });
    } catch (err) {
      return res.status(200).json({ coach: null });
    }
  }
  // ── PLAYGROUND COACH MODE ────────────────────────────────────────────────────
  if (body.coach === true) {
    const { prompt, results } = body;
    if (!prompt || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Missing prompt or results' });
    }
    const successful = results.filter(r => !r.error && r.response);
    if (successful.length < 2) return res.status(200).json({ coach: null });
    const context = successful.map(r => `### ${r.modelName}\n${r.response}`).join('\n\n');
    const coachPrompt = `You are an AI learning coach for LearningGPT.ai. A student ran this prompt across multiple AI models.
STUDENT'S PROMPT: "${prompt}"
MODEL RESPONSES:
${context}
1. Pick the strongest response and name the model clearly (e.g. "Claude wins this round")
2. In 2-3 sentences explain specifically WHY it won
3. In 1-2 sentences give a concrete actionable takeaway
Under 120 words. Direct and specific. Plain text only, no markdown symbols.`;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://learninggpt.ai',
          'X-Title': 'LearningGPT Coach'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: coachPrompt }],
          max_tokens: 300,
          temperature: 0.5
        })
      });
      const data = await response.json();
      return res.status(200).json({ coach: data.choices?.[0]?.message?.content || null });
    } catch (err) {
      return res.status(200).json({ coach: null });
    }
  }
  // ── MODELS MODE ──────────────────────────────────────────────────────────────
  const { prompt, models } = body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt' });
  if (prompt.length > 4000) return res.status(400).json({ error: 'Prompt too long' });
  if (!Array.isArray(models) || models.length === 0 || models.length > 6) return res.status(400).json({ error: 'Invalid models array' });
  try {
    const promises = models.map(async (model) => {
      const startTime = Date.now();
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://learninggpt.ai',
            'X-Title': 'LearningGPT Playground'
          },
          body: JSON.stringify({
            model: model.id,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1500,
            temperature: 0.7
          })
        });
        const data = await response.json();
        const elapsedMs = Date.now() - startTime;
        if (!response.ok || data.error) {
          return { modelId: model.id, modelName: model.name || model.id, response: '', tokens: 0, timeMs: elapsedMs, error: (data.error?.message || data.error) || ('HTTP ' + response.status) };
        }
        return { modelId: model.id, modelName: model.name || model.id, response: data.choices?.[0]?.message?.content || '', tokens: data.usage?.total_tokens || 0, promptTokens: data.usage?.prompt_tokens || 0, completionTokens: data.usage?.completion_tokens || 0, timeMs: elapsedMs, error: null };
      } catch (err) {
        return { modelId: model.id, modelName: model.name || model.id, response: '', tokens: 0, timeMs: Date.now() - startTime, error: err.message };
      }
    });
    const results = await Promise.all(promises);
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
