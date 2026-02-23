// ==========================================
// Payment Routes - Razorpay Subscriptions
// POST /api/payment/create-subscription
// POST /api/payment/webhook
// GET  /api/payment/plans
// ==========================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const PremiumUser = require('../models/PremiumUser');
const { requirePremium } = require('./auth');
const { sendPremiumWelcomeEmail } = require('../services/emailService');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// Plan IDs — created once in Razorpay Dashboard or via API
// These get set in .env after you create them in Razorpay
const PLANS = {
  monthly: {
    id: process.env.RAZORPAY_PLAN_MONTHLY,   // e.g. plan_XXXXX
    amount: 4900,     // ₹49 in paise
    display: '₹49/month',
    interval: 'monthly'
  },
  annual: {
    id: process.env.RAZORPAY_PLAN_ANNUAL,     // e.g. plan_YYYYY
    amount: 39900,    // ₹399 in paise
    display: '₹399/year',
    interval: 'yearly'
  }
};


// ─── Helper: Razorpay API call ───
async function razorpayAPI(method, path, body = null) {
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');

  const options = {
    method,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`https://api.razorpay.com/v1${path}`, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Razorpay ${res.status}: ${JSON.stringify(data.error || data)}`);
  }
  return data;
}


// ═══════════════════════════════════════
// GET /api/payment/plans
// Public — returns available plans + key
// ═══════════════════════════════════════
router.get('/payment/plans', (req, res) => {
  res.json({
    success: true,
    key: RAZORPAY_KEY_ID,  // Public key — safe to expose
    plans: {
      monthly: {
        amount: PLANS.monthly.amount,
        display: PLANS.monthly.display,
        interval: PLANS.monthly.interval
      },
      annual: {
        amount: PLANS.annual.amount,
        display: PLANS.annual.display,
        interval: PLANS.annual.interval
      }
    }
  });
});


// ═══════════════════════════════════════
// POST /api/payment/create-subscription
// Header: x-auth-token
// Body: { plan: 'monthly' | 'annual' }
// Creates a Razorpay subscription + returns
// subscription ID for Checkout.
// ═══════════════════════════════════════
router.post('/payment/create-subscription', requirePremium, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.premiumUser;

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan. Use "monthly" or "annual".' });
    }

    if (user.status === 'active') {
      return res.status(400).json({ success: false, message: 'You already have an active subscription.' });
    }

    const planConfig = PLANS[plan];
    if (!planConfig.id) {
      return res.status(500).json({ success: false, message: 'Plan not configured. Contact support.' });
    }

    // Create Razorpay subscription
    const subscription = await razorpayAPI('POST', '/subscriptions', {
      plan_id: planConfig.id,
      total_count: plan === 'monthly' ? 120 : 10,  // Max billing cycles
      quantity: 1,
      customer_notify: 0,  // We handle notifications
      notes: {
        email: user.email,
        plan: plan,
        source: 'seaside-beacon-web'
      }
    });

    // Store subscription ID (status still pending until webhook confirms)
    user.razorpaySubscriptionId = subscription.id;
    user.plan = plan;
    await user.save();

    res.json({
      success: true,
      subscriptionId: subscription.id,
      key: RAZORPAY_KEY_ID,
      plan: planConfig.display
    });

  } catch (err) {
    console.error('Create subscription error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create subscription' });
  }
});


// ═══════════════════════════════════════
// POST /api/payment/webhook
// Razorpay webhook — no auth header,
// verified via signature.
// ═══════════════════════════════════════
router.post('/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // ─── Verify signature ───
    const signature = req.headers['x-razorpay-signature'];
    if (!signature || !RAZORPAY_WEBHOOK_SECRET) {
      console.warn('Webhook: missing signature or secret');
      return res.status(400).json({ status: 'error' });
    }

    const body = typeof req.body === 'string' ? req.body : req.body.toString('utf8');
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.warn('Webhook: signature mismatch');
      return res.status(400).json({ status: 'error' });
    }

    // ─── Process event ───
    const event = JSON.parse(body);
    const eventType = event.event;
    const payload = event.payload;

    console.log(`💳 Razorpay webhook: ${eventType}`);

    switch (eventType) {
      case 'subscription.activated':
        await handleActivated(payload);
        break;

      case 'subscription.charged':
        await handleCharged(payload);
        break;

      case 'subscription.cancelled':
        await handleCancelled(payload);
        break;

      case 'subscription.paused':
        await handlePaused(payload);
        break;

      case 'subscription.completed':
        await handleCompleted(payload);
        break;

      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;

      default:
        console.log(`Webhook: unhandled event ${eventType}`);
    }

    // Always return 200 to acknowledge (Razorpay retries on non-2xx)
    res.json({ status: 'ok' });

  } catch (err) {
    console.error('Webhook error:', err.message);
    // Still return 200 to prevent retry storms
    res.json({ status: 'ok' });
  }
});


// ═══════════════════════════════════════
// POST /api/payment/cancel
// Header: x-auth-token
// Cancels active subscription at period end
// ═══════════════════════════════════════
router.post('/payment/cancel', requirePremium, async (req, res) => {
  try {
    const user = req.premiumUser;

    if (user.status !== 'active' || !user.razorpaySubscriptionId) {
      return res.status(400).json({ success: false, message: 'No active subscription to cancel.' });
    }

    // Cancel at end of current billing period
    await razorpayAPI('POST', `/subscriptions/${user.razorpaySubscriptionId}/cancel`, {
      cancel_at_cycle_end: 1
    });

    console.log(`📭 Subscription cancelled (at period end): ${user.email}`);

    res.json({
      success: true,
      message: 'Subscription will end at the current billing period. You keep access until then.'
    });

  } catch (err) {
    console.error('Cancel subscription error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
});


// ─── Webhook handlers ───

async function handleActivated(payload) {
  const sub = payload.subscription?.entity;
  if (!sub) return;

  const user = await PremiumUser.findOne({ razorpaySubscriptionId: sub.id });
  if (!user) {
    console.warn(`Webhook activated: no user for subscription ${sub.id}`);
    return;
  }

  user.status = 'active';
  user.razorpayCustomerId = sub.customer_id || user.razorpayCustomerId;
  user.currentPeriodEnd = sub.current_end ? new Date(sub.current_end * 1000) : null;
  await user.save();

  console.log(`✅ Premium activated: ${user.email} (${user.plan})`);

  // Send premium welcome email (non-blocking)
  sendPremiumWelcomeEmail(user.email, user.plan)
    .then(() => console.log(`✅ Premium welcome email sent to ${user.email}`))
    .catch(err => console.error(`❌ Premium welcome email failed for ${user.email}:`, err.message));
}


async function handleCharged(payload) {
  const sub = payload.subscription?.entity;
  if (!sub) return;

  const user = await PremiumUser.findOne({ razorpaySubscriptionId: sub.id });
  if (!user) return;

  // Renew period
  user.status = 'active';
  user.currentPeriodEnd = sub.current_end ? new Date(sub.current_end * 1000) : null;
  await user.save();

  console.log(`💳 Premium renewed: ${user.email} (${user.plan})`);
}


async function handleCancelled(payload) {
  const sub = payload.subscription?.entity;
  if (!sub) return;

  const user = await PremiumUser.findOne({ razorpaySubscriptionId: sub.id });
  if (!user) return;

  user.status = 'cancelled';
  await user.save();

  console.log(`📭 Premium cancelled: ${user.email}`);
}


async function handlePaused(payload) {
  const sub = payload.subscription?.entity;
  if (!sub) return;

  const user = await PremiumUser.findOne({ razorpaySubscriptionId: sub.id });
  if (!user) return;

  user.status = 'expired';
  await user.save();

  console.log(`⏸️  Premium paused: ${user.email}`);
}


async function handleCompleted(payload) {
  const sub = payload.subscription?.entity;
  if (!sub) return;

  const user = await PremiumUser.findOne({ razorpaySubscriptionId: sub.id });
  if (!user) return;

  user.status = 'expired';
  await user.save();

  console.log(`🏁 Premium completed (all cycles): ${user.email}`);
}


async function handlePaymentFailed(payload) {
  const payment = payload.payment?.entity;
  if (!payment) return;

  // Razorpay auto-retries, so just log for now
  const email = payment.notes?.email || payment.email;
  console.warn(`⚠️  Payment failed for ${email || 'unknown'}: ${payment.error_description || 'unknown error'}`);
}


module.exports = router;
