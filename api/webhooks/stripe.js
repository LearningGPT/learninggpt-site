const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const SITE = 'https://learninggpt.ai';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  // Try both signing secrets so this one endpoint can verify BOTH your live
  // individual-plan events AND your sandbox business test events.
  // STRIPE_WEBHOOK_SECRET = live (existing). STRIPE_WEBHOOK_SECRET_TEST = sandbox.
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_TEST
  ].filter(Boolean);

  let lastErr;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!event) {
    console.error('Webhook signature failed:', lastErr && lastErr.message);
    return res.status(400).send(`Webhook Error: ${lastErr && lastErr.message}`);
  }

  const session = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      // ── BUSINESS checkout ──────────────────────────────────────────────────
      if (session.metadata && session.metadata.type === 'business') {
        await handleBusinessCheckout(session);
        break;
      }

      // ── INDIVIDUAL checkout (existing, unchanged) ───────────────────────────
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const userEmail = session.customer_email;
      await supabase
        .from('profiles')
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: 'active',
        })
        .eq('email', userEmail);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      // ── BUSINESS subscription state sync ────────────────────────────────────
      if (session.metadata && session.metadata.type === 'business') {
        await supabase
          .from('businesses')
          .update({ subscription_status: session.status })
          .eq('stripe_customer_id', session.customer);
        break;
      }

      // ── INDIVIDUAL (existing, unchanged) ────────────────────────────────────
      const priceId = session.items?.data[0]?.price?.id;
      let plan = 'free';
      if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'pro';
      if (priceId === process.env.STRIPE_PRO_PLUS_PRICE_ID) plan = 'pro_plus';
      await supabase
        .from('profiles')
        .update({
          plan,
          subscription_status: session.status,
          stripe_subscription_id: session.id,
        })
        .eq('stripe_customer_id', session.customer);
      break;
    }

    case 'customer.subscription.deleted': {
      // ── BUSINESS (cancel) ───────────────────────────────────────────────────
      if (session.metadata && session.metadata.type === 'business') {
        await supabase
          .from('businesses')
          .update({ subscription_status: 'canceled' })
          .eq('stripe_customer_id', session.customer);
        break;
      }

      // ── INDIVIDUAL (existing, unchanged) ────────────────────────────────────
      await supabase
        .from('profiles')
        .update({
          plan: 'free',
          subscription_status: 'canceled',
        })
        .eq('stripe_customer_id', session.customer);
      break;
    }
  }

  res.status(200).json({ received: true });
};

// ── Business helpers ───────────────────────────────────────────────────────────

async function handleBusinessCheckout(session) {
  const m = session.metadata || {};
  const companyName = m.company_name || 'Your company';
  const adminEmail = m.admin_email || session.customer_email;
  const adminName = m.admin_name || 'there';
  const plan = m.plan; // 'business_pro' | 'business_pro_plus'
  const seats = parseInt(m.seats, 10) || 0;

  if (!adminEmail || !plan) {
    console.error('Business checkout missing metadata:', m);
    return;
  }

  // Idempotency: Stripe can retry webhooks, so don't create the same business twice.
  const { data: existing } = await supabase
    .from('businesses')
    .select('id')
    .eq('stripe_subscription_id', session.subscription)
    .maybeSingle();
  if (existing) {
    console.log('Business already exists for subscription', session.subscription);
    return;
  }

  // Create / locate the admin's auth account and get a password-setup link.
  const { link, userId } = await getSetupLink(adminEmail);

  // Create the business row.
  const { error: bizErr } = await supabase.from('businesses').insert({
    company_name: companyName,
    admin_email: adminEmail,
    admin_id: userId,
    plan,
    seats,
    stripe_customer_id: session.customer,
    stripe_subscription_id: session.subscription,
    subscription_status: 'active',
  });
  if (bizErr) console.error('Failed to insert business:', bizErr.message);

  // Send the admin welcome / setup email via Resend.
  await sendAdminWelcome(adminEmail, adminName, companyName, link);
}

// Generate a link that lets the admin set their password.
// New email -> invite link (creates the account). Existing email -> recovery link.
async function getSetupLink(email) {
  let result = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${SITE}/auth/reset` },
  });

  if (result.error) {
    // Likely already registered (e.g. had an individual account) — use recovery.
    result = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${SITE}/auth/reset` },
    });
  }

  if (result.error) {
    console.error('Could not generate setup link for', email, result.error.message);
  }

  return {
    link: result.data?.properties?.action_link || null,
    userId: result.data?.user?.id || null,
  };
}

async function sendAdminWelcome(email, name, company, link) {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set — skipping welcome email');
    return;
  }
  if (!link) {
    console.error('No setup link available — skipping welcome email for', email);
    return;
  }

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f8;padding:32px 0;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececf3;">
      <div style="background:linear-gradient(135deg,#7c5cff,#5b8def);padding:28px 32px;">
        <div style="font-size:18px;font-weight:700;color:#ffffff;">LearningGPT for Business</div>
      </div>
      <div style="padding:32px;">
        <h1 style="font-size:22px;color:#14142b;margin:0 0 12px;">Welcome, ${escapeHtml(name)}!</h1>
        <p style="font-size:15px;color:#4a4a63;line-height:1.6;margin:0 0 20px;">
          Your team's plan for <strong>${escapeHtml(company)}</strong> is active. Set your password to access your
          admin dashboard, where you can invite your team and track their progress.
        </p>
        <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#7c5cff,#5b8def);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;">
          Set up my account &rarr;
        </a>
        <p style="font-size:13px;color:#8a8aa0;line-height:1.6;margin:24px 0 0;">
          This link is single-use and expires soon. If it stops working, you can request a new one from the
          sign-in page, or reply to this email and we'll help.
        </p>
      </div>
      <div style="padding:18px 32px;background:#fafafc;border-top:1px solid #ececf3;font-size:12px;color:#a0a0b5;">
        LearningGPT &middot; <a href="${SITE}" style="color:#5b8def;text-decoration:none;">learninggpt.ai</a>
      </div>
    </div>
  </div>`;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'LearningGPT <onboarding@learninggpt.ai>',
        to: [email],
        subject: `${company} is set up on LearningGPT — finish your admin setup`,
        html,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Resend email failed:', errText);
    }
  } catch (err) {
    console.error('Resend email error:', err.message);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
