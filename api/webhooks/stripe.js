const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
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
