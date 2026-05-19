// Vercel serverless function for the LearningGPT waitlist
// Receives email signup, sends notification to dan@learninggpt.ai via Resend.
//
// Required Vercel environment variable: RESEND_API_KEY
// (Get yours at https://resend.com/api-keys)

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Parse body
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { email, source } = body || {};

  // Validate email
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
    return res.status(500).json({
      error: 'RESEND_API_KEY not configured in Vercel environment variables.'
    });
  }

  const sourceLabel = (typeof source === 'string' && source) ? source.substring(0, 50) : 'unknown';
  const timestamp = new Date().toISOString();
  const userAgent = String(req.headers['user-agent'] || 'unknown').substring(0, 200);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').substring(0, 100);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'LearningGPT Waitlist <onboarding@resend.dev>',
        to: ['dan@learninggpt.ai'],
        reply_to: email,
        subject: '🎉 New LearningGPT waitlist signup: ' + email,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f7f7fb;">
            <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
              <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 22px;">🎉 New waitlist signup</h2>
              <p style="margin: 0 0 24px; color: #555; font-size: 15px;">A new person just joined the LearningGPT founding cohort.</p>

              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; width: 100px;">Email</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #1a1a2e; font-weight: 600;">
                    <a href="mailto:${escapeHtml(email)}" style="color: #7c5cff; text-decoration: none;">${escapeHtml(email)}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Source</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #1a1a2e;">${escapeHtml(sourceLabel)}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Time</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #1a1a2e;">${escapeHtml(timestamp)}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">IP</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #1a1a2e;">${escapeHtml(ip)}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #666; vertical-align: top;">Browser</td>
                  <td style="padding: 10px 0; color: #888; font-size: 12px;">${escapeHtml(userAgent)}</td>
                </tr>
              </table>

              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 13px;">
                Reply directly to this email to reach the subscriber — replies route to ${escapeHtml(email)}.
              </div>
            </div>
          </div>
        `,
        text: `New LearningGPT waitlist signup\n\nEmail: ${email}\nSource: ${sourceLabel}\nTime: ${timestamp}\nIP: ${ip}\nUser Agent: ${userAgent}`
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Resend API error:', response.status, errData);
      return res.status(500).json({
        error: 'Failed to send notification',
        details: errData.message || ('HTTP ' + response.status)
      });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Waitlist handler error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
