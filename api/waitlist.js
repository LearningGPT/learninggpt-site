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

const PROMPTS25_HTML = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f8;padding:32px 0;"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececf3;"><div style="background:linear-gradient(135deg,#7c5cff,#5b8def);padding:26px 32px;"><div style="font-size:18px;font-weight:700;color:#ffffff;">LearningGPT</div></div><div style="padding:28px 32px;"><h1 style="font-size:21px;color:#14142b;margin:0 0 10px;">Your 25 Copilot prompts</h1><p style="font-size:14.5px;color:#4a4a63;line-height:1.6;margin:0 0 6px;">As promised — copy any prompt into Copilot, swap the [brackets] for your details, done. Keep this email; it works as a cheat sheet.</p><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:22px 0 6px;font-size:16px;font-weight:700;color:#14142b;">✉️ Outlook — stop drowning in email</td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">1. Clear the inbox fast</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Summarize the unread emails in my inbox into a table: sender, one-line summary, and whether it needs a reply, an FYI read, or can be archived. Put anything urgent at the top.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">2. Reply in your own voice</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Draft a reply to this email that is warm but concise, agrees to the meeting, and proposes Tuesday or Thursday afternoon. Keep it under 90 words.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">3. Say no gracefully</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Write a polite reply declining this request. Be kind, give one honest sentence of reason, and offer an alternative. No over-apologizing.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">4. Catch up after time off</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Summarize everything in this email thread I was cc&#x27;d on while I was out. Tell me what was decided, what&#x27;s still open, and whether anything needs me.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">5. Chase without nagging</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Draft a short, friendly follow-up to this email since I haven&#x27;t heard back in a week. Light touch, no guilt.</div></td></tr><tr><td style="padding:22px 0 6px;font-size:16px;font-weight:700;color:#14142b;">📄 Word — first drafts in minutes</td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">6. The blank-page killer</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Draft a one-page [memo / proposal / update] about [topic]. Audience is [who]. Goal is [what I want them to do]. Confident and concise, no corporate filler.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">7. Make it shorter</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Cut this document by 40% without losing any key point. Keep the structure and the strongest lines.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">8. Match a tone</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Rewrite this to sound [more direct / warmer / more formal]. Keep the meaning identical; only change the voice.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">9. Turn notes into prose</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Here are my rough bullet points. Turn them into 3 clean paragraphs a client could read, in plain English.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">10. Executive summary on demand</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Add a 4-bullet executive summary to the top of this document — the kind a busy exec would read instead of the whole thing.</div></td></tr><tr><td style="padding:22px 0 6px;font-size:16px;font-weight:700;color:#14142b;">📊 Excel — data without the formulas</td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">11. Explain the sheet</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Look at this data and tell me the 3 most important things a manager should notice, in plain language. No jargon.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">12. Build the formula for me</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">I want a column that flags any row where [condition]. Write the formula and tell me exactly which cell to put it in.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">13. Find what&#x27;s off</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Scan this data for anything that looks wrong or inconsistent — outliers, duplicates, blanks that shouldn&#x27;t be blank — and list them.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">14. Chart the story</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Recommend the single best chart to show [what I&#x27;m trying to prove] from this data, and set it up.</div></td></tr><tr><td style="padding:22px 0 6px;font-size:16px;font-weight:700;color:#14142b;">👥 Teams &amp; meetings — get your time back</td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">15. Recap I actually missed</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Summarize this meeting: decisions made, action items with owners, and anything I was assigned. Bullet points only.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">16. Prep in 60 seconds</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Based on our recent chats and files, give me a 5-point briefing to prepare for my meeting with [person/team] about [topic].</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">17. Draft the follow-up</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Write the post-meeting follow-up: thank everyone, restate the 3 decisions, and list who owns what by when.</div></td></tr><tr><td style="padding:22px 0 6px;font-size:16px;font-weight:700;color:#14142b;">🖥️ PowerPoint — from doc to deck</td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">18. Deck from a document</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Turn this document into a 6-slide deck: title, problem, 3 key points, and a clear next step. One idea per slide.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">19. Fix the wall of text</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">This slide has too much text. Cut it to a headline plus 3 short bullets, and suggest what I should say out loud instead.</div></td></tr><tr><td style="padding:22px 0 6px;font-size:16px;font-weight:700;color:#14142b;">🧠 Everyday time-savers</td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">20. Decode the jargon</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Explain [confusing term/email/document] to me like I&#x27;m smart but busy and not in this field. 3 sentences.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">21. Think it through</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">I need to decide between [A] and [B]. Ask me 3 sharp questions that would help me choose, then wait for my answers.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">22. Prep for the hard conversation</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Help me plan a conversation with [person] about [issue]. Give me an opening line, the one point I must land, and how to keep it calm.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">23. Weekly reset</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Based on my calendar and unfinished items, help me plan the 3 things that actually matter this week and what I can let go of.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">24. Turn a mess into a checklist</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Here&#x27;s a rambling set of notes about a project. Turn it into a clean checklist of next steps, in the order I should do them.</div></td></tr><tr><td style="padding:8px 0;"><div style="font-weight:600;font-size:14px;color:#14142b;margin-bottom:4px;">25. The &quot;make this better&quot; catch-all</div><div style="background:#f4f2ff;border-left:3px solid #7c5cff;border-radius:8px;padding:10px 14px;font-size:13.5px;color:#3d3d55;line-height:1.5;">Here&#x27;s something I wrote. Make it clearer and more persuasive, keep it in my voice, and tell me the one thing you changed that matters most.</div></td></tr></table><div style="margin-top:26px;padding:16px 18px;background:#f7f6ff;border:1px solid #e4defc;border-radius:10px;"><p style="font-size:13.5px;color:#3d3d55;line-height:1.6;margin:0;">Rolling Copilot out to a team? We send prompts like these <b>tailored to each role, every week</b> — it&#x27;s included in every <a href="https://learninggpt.ai/business?utm_source=email&amp;utm_medium=leadmagnet&amp;utm_campaign=copilot-prompts" style="color:#7c5cff;font-weight:600;">LearningGPT for Business</a> plan, alongside 380+ always-current lessons and an engagement dashboard.</p></div><p style="font-size:13px;color:#8a8aa0;line-height:1.6;margin:20px 0 0;">Questions? Just reply — this inbox reaches Dan, the founder. Really.</p></div><div style="padding:16px 32px;background:#fafafc;border-top:1px solid #ececf3;font-size:12px;color:#a0a0b5;">LearningGPT &middot; <a href="https://learninggpt.ai" style="color:#5b8def;text-decoration:none;">learninggpt.ai</a></div></div></div>`;

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
  // Store every signup in Supabase (deduped) so it's visible and the drip can follow up.
  await recordCapture(email, sourceLabel);
  if (sourceLabel === 'copilot-prompts') {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Dan at LearningGPT <dan@send.learninggpt.ai>',
          to: [email],
          reply_to: 'dan@learninggpt.ai',
          subject: 'Your 25 Copilot prompts (keep this as a cheat sheet)',
          html: PROMPTS25_HTML,
        }),
      });
      subscriberSent = r.ok;
      if (!r.ok) console.error('Prompts-25 subscriber email failed:', await r.text());
    } catch (e) { console.error('Prompts-25 subscriber email error:', e); }
  }
  if (sourceLabel === 'seniors-free-5') {
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
        from: 'LearningGPT Signups <no-reply@send.learninggpt.ai>',
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
