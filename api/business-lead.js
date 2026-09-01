// Vercel serverless function: the "talk to us" form on /business.
// Records the email in Supabase email_captures AND emails Dan immediately via Resend,
// with reply_to set to the enquirer so Dan can just hit Reply.
// Required env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

// Durable record so a lead is never lost if the email send fails. Fire-and-forget.
async function recordCapture(email, source) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/email_captures?on_conflict=email`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify({ email: email.toLowerCase(), source }),
    });
    if (!r.ok) console.error('email_captures insert failed:', await r.text());
  } catch (e) { console.error('email_captures insert error:', e); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const email = clip(body.email, 200);
  const name = clip(body.name, 120);
  const company = clip(body.company, 160);
  const teamSize = clip(body.teamSize, 40);
  const interest = clip(body.interest, 80);
  const message = clip(body.message, 2000);
  const page = clip(body.page, 300);

  // Honeypot: bots fill this, humans never see it.
  if (clip(body.website, 100)) return res.status(200).json({ ok: true });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid work email.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Email is not configured.' });

  await recordCapture(email, 'business-form');

  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const row = (k, v) => v
    ? `<tr><td style="padding:6px 16px 6px 0;color:#6b6b85;font-size:14px;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${esc(v)}</td></tr>`
    : '';

  const html = `
<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;color:#14142b;">
  <h2 style="margin:0 0 4px;color:#0f9d76;">New business enquiry</h2>
  <p style="margin:0 0 18px;color:#6b6b85;font-size:13.5px;">Hit reply &mdash; it goes straight to them.</p>
  <table style="border-collapse:collapse;">
    ${row('Name', name)}
    ${row('Email', email)}
    ${row('Company', company)}
    ${row('Team size', teamSize)}
    ${row('Interested in', interest)}
    ${row('From page', page)}
    ${row('When', new Date().toISOString())}
  </table>
  ${message ? `<p style="margin:18px 0 6px;color:#6b6b85;font-size:13.5px;">What they said</p><pre style="background:#f4f4f8;padding:14px;border-radius:10px;white-space:pre-wrap;font-family:inherit;font-size:14px;margin:0;">${esc(message)}</pre>` : ''}
</div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'LearningGPT <no-reply@send.learninggpt.ai>',
        to: ['dan@learninggpt.ai'],
        reply_to: email,
        subject: `Business enquiry — ${company || name || email}${teamSize ? ' (' + teamSize + ')' : ''}`,
        html,
      }),
    });
    if (!r.ok) {
      console.error('business-lead email failed:', await r.text());
      return res.status(500).json({ error: 'Could not send. Please email dan@learninggpt.ai directly.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('business-lead error:', e);
    return res.status(500).json({ error: 'Could not send. Please email dan@learninggpt.ai directly.' });
  }
}
