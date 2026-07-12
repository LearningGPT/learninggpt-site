// Vercel serverless function for the LearningGPT waitlist
// Receives email signup, sends notification to dan@learninggpt.ai via Resend.
// If source is "seniors-free-5", ALSO sends the subscriber their five free lessons.
//
// Required Vercel environment variable: RESEND_API_KEY

const SITE = 'https://learninggpt.ai';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

// Record the capture so the daily drip (api/drip.js) can follow up. Fire-and-forget.
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

const FREE5_HTML = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a2e;">
<div style="max-width:600px;margin:0 auto;padding:24px 12px;">
<div style="background:linear-gradient(135deg,#2dd4a7,#5b8def);border-radius:16px 16px 0 0;padding:30px 32px;text-align:center;">
<div style="font-size:21px;font-weight:800;color:#ffffff;">LearningGPT</div>
<div style="font-size:14.5px;color:rgba(255,255,255,0.95);margin-top:6px;">Your five free lessons</div>
</div>
<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:34px 32px;">
<p style="font-size:16px;font-weight:700;margin:0 0 14px;">Hello!</p>
<p style="font-size:15.5px;line-height:1.65;color:#444;margin:0 0 20px;">
Here are your five free lessons, in the order we suggest. No account needed — just click and read at your own pace. Take days or weeks; they aren't going anywhere.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:9px 0;font-size:15.5px;">1. <a href="${SITE}/lessons/seniors/first-chat?utm_source=email&utm_medium=capture&utm_campaign=seniors-free-5" style="color:#0f9d76;font-weight:600;">Your very first chat with AI</a> — what it is and how to ask.</td></tr>
<tr><td style="padding:9px 0;font-size:15.5px;">2. <a href="${SITE}/lessons/seniors/spot-the-scam?utm_source=email&utm_medium=capture&utm_campaign=seniors-free-5" style="color:#0f9d76;font-weight:600;">Spot the scam &amp; stay safe</a> — the most important one.</td></tr>
<tr><td style="padding:9px 0;font-size:15.5px;">3. <a href="${SITE}/lessons/seniors/is-this-real?utm_source=email&utm_medium=capture&utm_campaign=seniors-free-5" style="color:#0f9d76;font-weight:600;">Is that photo real?</a> — spotting AI fakes.</td></tr>
<tr><td style="padding:9px 0;font-size:15.5px;">4. <a href="${SITE}/lessons/seniors/ai-on-your-phone?utm_source=email&utm_medium=capture&utm_campaign=seniors-free-5" style="color:#0f9d76;font-weight:600;">The AI already on your phone</a> — Siri &amp; Google Assistant.</td></tr>
<tr><td style="padding:9px 0;font-size:15.5px;">5. <a href="${SITE}/lessons/seniors/for-the-family-helper?utm_source=email&utm_medium=capture&utm_campaign=seniors-free-5" style="color:#0f9d76;font-weight:600;">For the family helper</a> — share this one with your adult kids.</td></tr>
</table>
<p style="font-size:14.5px;line-height:1.65;color:#444;margin:0 0 8px;">
If you ever get stuck or have a question — even one that feels "too basic" — just reply to this email. A real person (me) reads every reply.
</p>
<p style="font-size:14.5px;line-height:1.6;color:#444;margin:0;">— Dan, founder of LearningGPT</p>
</div>
<div style="text-align:center;padding:20px 12px;font-size:11.5px;color:#9a9ab0;">
© 2026 LearningGPT, Inc. · Independent — no vendor agenda.<br>
You asked for these lessons at learninggpt.ai/seniors. Reply "stop" any time and we'll remove you.
</div>
</div></body></html>`;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { email, source } = body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (email.length > 200) {
    return res.status(400).json({ error: 'Email too long' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured in Vercel environment variables.' });
  }

  const sourceLabel = (typeof source === 'string' && source) ? source.substring(0, 50) : 'unknown';
  const timestamp = new Date().toISOString();
  const userAgent = String(req.headers['user-agent'] || 'unknown').substring(0, 200);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').substring(0, 100);

  // If this came from the seniors free-5 capture, send the subscriber their lessons.
  let subscriberSent = false;
  if (sourceLabel === 'seniors-free-5') {
    await recordCapture(email, sourceLabel);
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Dan at LearningGPT <dan@send.learninggpt.ai>',
          to: [email],
          reply_to: 'dan@learninggpt.ai',
          subject: 'Your 5 free AI lessons (start with the scam one)',
          html: FREE5_HTML,
        }),
      });
      subscriberSent = r.ok;
      if (!r.ok) console.error('Free-5 subscriber email failed:', await r.text());
    } catch (e) { console.error('Free-5 subscriber email error:', e); }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'LearningGPT Waitlist <no-reply@send.learninggpt.ai>',
        to: ['dan@learninggpt.ai'],
        reply_to: email,
        subject: '🎉 New signup (' + sourceLabel + '): ' + email,
        text: `New LearningGPT signup\n\nEmail: ${email}\nSource: ${sourceLabel}\nSubscriber lesson email sent: ${subscriberSent}\nTime: ${timestamp}\nIP: ${ip}\nUser Agent: ${userAgent}\n\nReply to this email to reach them directly.`,
      })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Resend API error:', response.status, errData);
      return res.status(subscriberSent ? 200 : 500).json(subscriberSent ? { success: true } : { error: 'Failed to send notification', details: errData.message || ('HTTP ' + response.status) });
    }
    return res.status(200).json({ success: true, lessons: subscriberSent });
  } catch (error) {
    console.error('Waitlist handler error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
