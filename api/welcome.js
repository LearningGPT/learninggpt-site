// Vercel serverless function: send a welcome email via Resend after signup.
// The signup page calls this with { email, name } once an account is created.
// Dependency-free. Fire-and-forget — never blocks the signup itself.

const WELCOME_HTML = (name) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a2e;">
<div style="max-width:600px;margin:0 auto;padding:24px 12px;">

<!-- Header -->
<div style="background:linear-gradient(135deg,#7c5cff,#5b8def,#44e0a4);border-radius:16px 16px 0 0;padding:36px 32px;text-align:center;">
<div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">LearningGPT</div>
<div style="font-size:15px;color:rgba(255,255,255,0.92);margin-top:6px;">Welcome aboard 👋</div>
</div>

<!-- Body -->
<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:36px 32px;">
<p style="font-size:17px;font-weight:700;margin:0 0 14px;">Hi ${name ? name : 'there'}, welcome to LearningGPT!</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 22px;">
You just joined the founding cohort of a platform built to teach you every major AI tool — honestly, with no vendor agenda. Here's what you can dive into right now:
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;">
<tr><td style="padding:8px 0;font-size:14.5px;color:#1a1a2e;">🎓 &nbsp;<strong>AI Foundations</strong> — your free, full course to build the fundamentals.</td></tr>
<tr><td style="padding:8px 0;font-size:14.5px;color:#1a1a2e;">🛠️ &nbsp;<strong>12 tool tracks, 380+ lessons</strong> — Copilot, ChatGPT, Claude, Gemini, Grok, Perplexity &amp; more, updated daily as the tools change.</td></tr>
<tr><td style="padding:8px 0;font-size:14.5px;color:#1a1a2e;">⚡ &nbsp;<strong>The Playground</strong> — run one prompt across six AIs side by side and see who wins.</td></tr>
<tr><td style="padding:8px 0;font-size:14.5px;color:#1a1a2e;">🏅 &nbsp;<strong>Progress & badges</strong> — track what you finish and earn shareable proof for LinkedIn.</td></tr>
</table>

<!-- CTA -->
<div style="text-align:center;margin:0 0 28px;">
<a href="https://learninggpt.ai/lessons" style="display:inline-block;background:linear-gradient(135deg,#7c5cff,#5b8def);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:10px;">Start learning →</a>
</div>

<p style="font-size:13.5px;line-height:1.6;color:#666;margin:0 0 18px;background:#f4f1ff;border:1px solid #e4dcff;border-radius:10px;padding:14px 16px;">
💜 <strong>Founding member pricing</strong> is open through Sep 30. Lock in today's Pro rate and it never goes up — even after we raise prices.
</p>

<p style="font-size:14.5px;line-height:1.6;color:#444;margin:0 0 6px;">
I read every reply to this email — so if you have a question, or want to tell me what you'd love to learn, just hit reply.
</p>
<p style="font-size:14.5px;line-height:1.6;color:#444;margin:0;">— Dan, founder of LearningGPT</p>
</div>

<!-- Footer -->
<div style="text-align:center;padding:20px 12px;font-size:11.5px;color:#9a9ab0;">
© 2026 LearningGPT, Inc. · Independent. Not affiliated with OpenAI, Anthropic, Microsoft, Google, or Perplexity.
</div>

</div>
</body>
</html>`;

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

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const email = (body && body.email || '').trim();
  const name = (body && body.name || '').trim();

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'LearningGPT <no-reply@send.learninggpt.ai>',
        to: [email],
        reply_to: 'dan@learninggpt.ai',
        subject: 'Welcome to LearningGPT 👋',
        html: WELCOME_HTML(name)
      })
    });
    const d = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: (d && d.message) || 'Could not send welcome email.' });
    }
    return res.status(200).json({ sent: true, id: d.id });
  } catch (e) {
    return res.status(500).json({ error: 'Could not send welcome email.' });
  }
}
