// Vercel serverless function: receive user reports of inappropriate AI-generated
// content from the Playground (Microsoft Store policy 11.16) and email them to Dan.
// Dependency-free. POST { model, promptText, responseText, reason, page }.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
  const model = clip(body.model, 100) || 'unknown';
  const promptText = clip(body.promptText, 2000);
  const responseText = clip(body.responseText, 4000);
  const reason = clip(body.reason, 500);
  const page = clip(body.page, 200);

  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a2e;">
<h2 style="color:#b45309;">&#9873; AI content report</h2>
<p><b>Model:</b> ${esc(model)}<br><b>Page:</b> ${esc(page)}<br><b>When:</b> ${new Date().toISOString()}</p>
<p><b>User's reason:</b><br>${esc(reason) || '<i>(none given)</i>'}</p>
<p><b>Prompt:</b></p>
<pre style="background:#f4f4f8;padding:12px;border-radius:8px;white-space:pre-wrap;">${esc(promptText) || '(empty)'}</pre>
<p><b>Reported response:</b></p>
<pre style="background:#fff4e5;padding:12px;border-radius:8px;white-space:pre-wrap;">${esc(responseText) || '(empty)'}</pre>
</div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'LearningGPT <no-reply@send.learninggpt.ai>',
        to: ['dan@learninggpt.ai'],
        subject: `Playground AI content report — ${model}`,
        html
      })
    });
    if (!r.ok) return res.status(500).json({ error: 'Could not record the report.' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Could not record the report.' });
  }
}
