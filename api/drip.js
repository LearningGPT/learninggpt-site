// Vercel serverless function: free-signup drip emails, run daily by Vercel Cron.
// Day 2 after signup  -> "quick win" value email
// Day 4 after signup  -> founding-pricing email
// Idempotent: every send is recorded in public.drip_log and never repeated.
// Only emails profiles on the free plan. Dependency-free, same patterns as business.js.
// Test without sending: GET /api/drip?dry=1

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE = 'https://learninggpt.ai';

const sbHeaders = {
  'apikey': SUPABASE_SECRET_KEY,
  'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

async function sbSelect(q) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: sbHeaders });
  if (!r.ok) { console.error('select failed', q, await r.text()); return null; }
  try { return await r.json(); } catch { return null; }
}
async function sbInsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...sbHeaders, 'Prefer': 'return=minimal' }, body: JSON.stringify(row),
  });
  if (!r.ok) console.error(`insert ${table} failed`, await r.text());
  return r.ok;
}

function shell(inner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a2e;">
<div style="max-width:600px;margin:0 auto;padding:24px 12px;">
<div style="background:linear-gradient(135deg,#7c5cff,#5b8def,#44e0a4);border-radius:16px 16px 0 0;padding:26px 32px;text-align:center;">
<div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">LearningGPT</div>
</div>
<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:34px 32px;">${inner}</div>
<div style="text-align:center;padding:20px 12px;font-size:11.5px;color:#9a9ab0;">
© 2026 LearningGPT, Inc. · Independent. Not affiliated with any AI vendor.<br>
You're receiving this because you created a LearningGPT account. Reply "stop" and Dan will remove you personally.
</div>
</div></body></html>`;
}

const DAY2 = (name) => ({
  subject: 'The 5-minute trick that shows you which AI to trust',
  html: shell(`
<p style="font-size:16.5px;font-weight:700;margin:0 0 14px;">Hi ${name || 'there'},</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 16px;">
Quick one. The single most useful thing on LearningGPT takes about five minutes and most new members walk right past it:
</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 16px;">
<strong>Take a real question from your day — an email you need to write, a decision you're weighing — and run it through the <a href="${SITE}/playground?utm_source=email&utm_medium=drip&utm_campaign=day2" style="color:#5b8def;">Playground</a>.</strong>
One prompt, six AIs answer side by side. You'll see instantly which one is right for the kind of work <em>you</em> do — no vendor's marketing required.
</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 20px;">
Then pick the free starter lesson for whichever tool won:
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:6px 0;font-size:14.5px;"><a href="${SITE}/lessons/copilot/outlook-mastery?utm_source=email&utm_medium=drip&utm_campaign=day2" style="color:#5b8def;text-decoration:none;">📧 Copilot in Outlook — write 10 emails in the time of 1</a></td></tr>
<tr><td style="padding:6px 0;font-size:14.5px;"><a href="${SITE}/lessons/chatgpt/email-mastery?utm_source=email&utm_medium=drip&utm_campaign=day2" style="color:#5b8def;text-decoration:none;">💬 ChatGPT for email — plus a Custom GPT that compounds</a></td></tr>
<tr><td style="padding:6px 0;font-size:14.5px;"><a href="${SITE}/lessons/claude/connect-to-outlook?utm_source=email&utm_medium=drip&utm_campaign=day2" style="color:#5b8def;text-decoration:none;">🧠 Connect Claude to your inbox — 5 real workflows</a></td></tr>
<tr><td style="padding:6px 0;font-size:14.5px;"><a href="${SITE}/lessons/seniors?utm_source=email&utm_medium=drip&utm_campaign=day2" style="color:#5b8def;text-decoration:none;">🛡️ AI for Seniors — start with spotting AI scams</a></td></tr>
</table>
<p style="font-size:14.5px;line-height:1.6;color:#444;margin:0;">
Stuck on anything? Just reply — I read every one.<br>— Dan</p>`)
});

const DAY4 = (name) => ({
  subject: "Founding pricing: today's price is your price, forever",
  html: shell(`
<p style="font-size:16.5px;font-weight:700;margin:0 0 14px;">Hi ${name || 'there'},</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 16px;">
I'll keep this honest and short, the way we try to keep everything here.
</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 16px;">
LearningGPT is in its founding period through <strong>September 30</strong>. Founding members get Pro for <strong>$9/mo</strong> (standard will be $19) — and the deal is simple: <strong>the price you join at never goes up.</strong> Not next year, not when the catalog doubles. That's the whole pitch.
</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 16px;">What Pro opens up today:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
<tr><td style="padding:6px 0;font-size:14.5px;">📚 &nbsp;<strong>280+ lessons</strong> across every major AI — and we ship new ones <em>daily</em> as the tools change</td></tr>
<tr><td style="padding:6px 0;font-size:14.5px;">🧭 &nbsp;Every tool track: Copilot, ChatGPT, Claude, Gemini, Grok, Perplexity, and more</td></tr>
<tr><td style="padding:6px 0;font-size:14.5px;">🤖 &nbsp;The AI Coach on every lesson, unlimited</td></tr>
<tr><td style="padding:6px 0;font-size:14.5px;">🔄 &nbsp;Lessons updated when the products change — never study stale material</td></tr>
</table>
<div style="text-align:center;margin:0 0 24px;">
<a href="${SITE}/pricing?utm_source=email&utm_medium=drip&utm_campaign=day4" style="display:inline-block;background:linear-gradient(135deg,#7c5cff,#5b8def);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:10px;">Lock in $9/mo →</a>
</div>
<p style="font-size:14px;line-height:1.6;color:#666;margin:0 0 16px;">
And if free is what fits right now — that's fine, truly. The free lessons stay free, and new free lessons land every week. This email is the only nudge; I'd rather you upgrade because the lessons earned it.
</p>
<p style="font-size:14.5px;line-height:1.6;color:#444;margin:0;">— Dan, founder</p>`)
});

const CAP2 = () => ({
  subject: 'How are the lessons going?',
  html: shell(`
<p style="font-size:16.5px;font-weight:700;margin:0 0 14px;">Hello again,</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 16px;">
A couple of days ago we sent you five free AI lessons. No homework, no quiz &mdash; I just wanted to check in the way a good teacher would.
</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 16px;">
If you haven't started yet, begin with the one that matters most: <a href="https://learninggpt.ai/lessons/seniors/spot-the-scam?utm_source=email&utm_medium=drip&utm_campaign=cap2" style="color:#5b8def;font-weight:600;">Spot the scam &amp; stay safe</a>. Ten minutes, plain words, and you'll catch tricks that fool people half your age.
</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 16px;">
One thing people miss: every lesson has a <strong>patient AI helper</strong> in the corner of the page. If anything is confusing, click it and ask &mdash; in your own words, as many times as you like. That's what it's for.
</p>
<p style="font-size:14.5px;line-height:1.6;color:#444;margin:0;">Stuck on anything at all? Just reply to this email &mdash; a real person reads every one.<br>&mdash; Dan</p>`)
});

const CAP4 = () => ({
  subject: 'A little home for your progress (free)',
  html: shell(`
<p style="font-size:16.5px;font-weight:700;margin:0 0 14px;">Hello,</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 16px;">
One small suggestion, then I'll leave you be: if the lessons are working for you, it's worth creating a <strong>free account</strong>. It takes about a minute and it gives your learning a home &mdash; we remember which lessons you've finished and where you left off, so nothing gets lost between visits.
</p>
<p style="font-size:15px;line-height:1.65;color:#444;margin:0 0 20px;">
Free stays free &mdash; no credit card, and the five lessons you have are yours regardless.
</p>
<div style="text-align:center;margin:0 0 24px;">
<a href="https://learninggpt.ai/auth/signup?src=seniors-capture&utm_source=email&utm_medium=drip&utm_campaign=cap4" style="display:inline-block;background:linear-gradient(135deg,#2dd4a7,#5b8def);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:10px;">Create my free account &rarr;</a>
</div>
<p style="font-size:14.5px;line-height:1.6;color:#444;margin:0;">And if you'd rather keep things as they are &mdash; that's completely fine too. The lessons aren't going anywhere.<br>&mdash; Dan</p>`)
});

async function sendEmail(to, tpl) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Dan at LearningGPT <dan@send.learninggpt.ai>',
      to: [to],
      reply_to: 'dan@learninggpt.ai',
      subject: tpl.subject,
      html: tpl.html,
    }),
  });
  if (!r.ok) { console.error('send failed', to, await r.text()); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // Optional hardening: if CRON_SECRET is set in Vercel env, require it.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const dry = req.query && (req.query.dry === '1' || req.query.dry === 'true');

  const now = Date.now();
  const iso = (d) => new Date(d).toISOString();
  // Day-2 window: signed up 2-3 days ago. Day-4 window: 4-6 days ago (wider, catches app-closed days).
  const windows = [
    { step: 'day2', from: iso(now - 3 * 864e5), to: iso(now - 2 * 864e5), tpl: DAY2 },
    { step: 'day4', from: iso(now - 6 * 864e5), to: iso(now - 4 * 864e5), tpl: DAY4 },
  ];

  const report = { dry, steps: {} };
  for (const w of windows) {
    const profiles = await sbSelect(
      `profiles?select=id,email,full_name,plan,created_at` +
      `&created_at=gte.${encodeURIComponent(w.from)}&created_at=lt.${encodeURIComponent(w.to)}` +
      `&or=(plan.is.null,plan.eq.free)`
    );
    const rows = Array.isArray(profiles) ? profiles : [];
    const results = [];
    for (const p of rows) {
      if (!p.email || !p.email.includes('@')) continue;
      const logged = await sbSelect(`drip_log?profile_id=eq.${encodeURIComponent(p.id)}&step=eq.${w.step}&select=id`);
      if (Array.isArray(logged) && logged.length) { results.push({ email: p.email, skipped: 'already sent' }); continue; }
      if (dry) { results.push({ email: p.email, wouldSend: true }); continue; }
      const name = (p.full_name || '').split(' ')[0];
      const ok = await sendEmail(p.email, w.tpl(name));
      if (ok) await sbInsert('drip_log', { profile_id: p.id, email: p.email, step: w.step });
      results.push({ email: p.email, sent: ok });
    }
    report.steps[w.step] = { candidates: rows.length, results };
  }
  // ── Email-capture follow-ups (no account; from /seniors free-5 form) ──
  const capWindows = [
    { step: 'cap2', from: iso(now - 3 * 864e5), to: iso(now - 2 * 864e5), tpl: CAP2 },
    { step: 'cap4', from: iso(now - 6 * 864e5), to: iso(now - 4 * 864e5), tpl: CAP4 },
  ];
  for (const w of capWindows) {
    const caps = await sbSelect(
      `email_captures?select=id,email,created_at` +
      `&created_at=gte.${encodeURIComponent(w.from)}&created_at=lt.${encodeURIComponent(w.to)}`
    );
    const rows = Array.isArray(caps) ? caps : [];
    const results = [];
    for (const c of rows) {
      if (!c.email || !c.email.includes('@')) continue;
      // If they created a real account, the main drip owns them — skip.
      const prof = await sbSelect(`profiles?email=eq.${encodeURIComponent(c.email)}&select=id`);
      if (Array.isArray(prof) && prof.length) { results.push({ email: c.email, skipped: 'has account' }); continue; }
      const logged = await sbSelect(`drip_log?profile_id=eq.${encodeURIComponent(c.id)}&step=eq.${w.step}&select=id`);
      if (Array.isArray(logged) && logged.length) { results.push({ email: c.email, skipped: 'already sent' }); continue; }
      if (dry) { results.push({ email: c.email, wouldSend: true }); continue; }
      const ok = await sendEmail(c.email, w.tpl());
      if (ok) await sbInsert('drip_log', { profile_id: c.id, email: c.email, step: w.step });
      results.push({ email: c.email, sent: ok });
    }
    report.steps[w.step] = { candidates: rows.length, results };
  }

  return res.status(200).json(report);
}
