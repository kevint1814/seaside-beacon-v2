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
const { sendPremiumWelcomeEmail, sendPaymentReceiptEmail, sendCancellationEmail } = require('../services/emailService');

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
    if (!planConfig || !planConfig.id) {
      console.error(`❌ Razorpay plan not configured for "${plan}". Check RAZORPAY_PLAN_MONTHLY / RAZORPAY_PLAN_ANNUAL env vars.`);
      return res.status(503).json({ success: false, message: 'Payment plans are being configured. Please try again shortly.' });
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
    console.error('Webhook error:', err.message, err.stack);
    // Log to DB for manual review (non-blocking)
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        mongoose.connection.db.collection('webhook_errors').insertOne({
          error: err.message,
          stack: err.stack,
          body: typeof req.body === 'string' ? req.body.substring(0, 500) : JSON.stringify(req.body).substring(0, 500),
          createdAt: new Date()
        }).catch(() => {});
      }
    } catch (_) {}
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

    // Gifted users don't have Razorpay subscriptions — can't cancel via payment flow
    if (user.source === 'gift') {
      return res.status(400).json({ success: false, message: 'Gifted subscriptions are managed by the admin. Contact support to make changes.' });
    }

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


// ═══════════════════════════════════════
// POST /api/payment/switch-plan
// Header: x-auth-token
// Body: { newPlan: 'monthly' | 'annual' }
// Switch between monthly and annual plans
// ═══════════════════════════════════════
router.post('/payment/switch-plan', requirePremium, async (req, res) => {
  try {
    const { newPlan } = req.body;
    const user = req.premiumUser;

    if (!newPlan || !PLANS[newPlan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }
    if (user.plan === newPlan) {
      return res.status(400).json({ success: false, message: 'Already on this plan' });
    }
    if (user.status !== 'active') {
      return res.status(400).json({ success: false, message: 'No active subscription' });
    }

    // Gifted users can't switch plans via Razorpay
    if (user.source === 'gift') {
      return res.status(400).json({ success: false, message: 'Gifted subscriptions are managed by the admin. Contact support to change plans.' });
    }

    // Use Razorpay subscription update API
    // annual→monthly: change at cycle end. monthly→annual: change now
    try {
      await razorpayAPI('PATCH', `/subscriptions/${user.razorpaySubscriptionId}`, {
        plan_id: PLANS[newPlan].id,
        schedule_change_at: user.plan === 'annual' ? 'cycle_end' : 'now'
      });
    } catch (rzpErr) {
      // Razorpay doesn't allow plan updates for UPI subscriptions
      const msg = rzpErr.message || '';
      if (msg.includes('payment mode is upi') || msg.includes('cannot be updated')) {
        console.warn('UPI subscription cannot be updated directly. Advising user to cancel and resubscribe.');
        return res.status(400).json({
          success: false,
          upiBlock: true,
          message: `UPI subscriptions can't be switched directly. Please cancel your current ${PLANS[user.plan].display} plan first, then subscribe fresh to ${PLANS[newPlan].display}. Your access continues until the current billing period ends.`
        });
      }
      throw rzpErr;  // re-throw non-UPI errors
    }

    const oldPlan = user.plan;
    const changeAt = oldPlan === 'annual' ? 'end of current annual period' : 'next billing cycle';
    user.plan = newPlan;
    user.pendingPlanChange = oldPlan === 'annual' ? newPlan : null;
    await user.save();

    res.json({ success: true, message: `Plan will switch to ${PLANS[newPlan].display} at ${changeAt}.` });
  } catch (err) {
    console.error('Switch plan error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to switch plan. Please try again.' });
  }
});


// ═══════════════════════════════════════
// POST /api/payment/cancel-with-refund
// Header: x-auth-token
// Cancels within 7 days + processes refund
// ═══════════════════════════════════════
router.post('/payment/cancel-with-refund', requirePremium, async (req, res) => {
  try {
    const user = req.premiumUser;

    // Gifted users don't have Razorpay subscriptions — no refund flow
    if (user.source === 'gift') {
      return res.status(400).json({ success: false, message: 'Gifted subscriptions are managed by the admin. Contact support to make changes.' });
    }

    if (user.status !== 'active' || !user.razorpaySubscriptionId) {
      return res.status(400).json({ success: false, message: 'No active subscription' });
    }

    // Check 7-day window
    const subStart = user.subscribedAt || user.createdAt;
    const daysSince = (Date.now() - new Date(subStart).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince > 7) {
      return res.status(400).json({
        success: false,
        message: 'Free cancellation window has expired. Cancellation with refund is only available within the first 7 days.'
      });
    }

    // Cancel on Razorpay (stops future billing)
    await razorpayAPI('POST', `/subscriptions/${user.razorpaySubscriptionId}/cancel`, {
      cancel_at_cycle_end: 0  // Cancel billing immediately
    });

    // Process refund if there was a payment
    // Get the latest payment for this subscription
    try {
      const payments = await razorpayAPI('GET', `/subscriptions/${user.razorpaySubscriptionId}/payments`);
      if (payments.items && payments.items.length > 0) {
        const lastPayment = payments.items[0]; // Most recent
        if (lastPayment.status === 'captured') {
          await razorpayAPI('POST', `/payments/${lastPayment.id}/refund`, {
            speed: 'normal',
            notes: { reason: 'Cancellation within 7-day window', email: user.email }
          });
          console.log(`💰 Refund initiated for ${user.email}: payment ${lastPayment.id}`);
        }
      }
    } catch (refundErr) {
      console.error(`Refund error for ${user.email}:`, refundErr.message);
      // Still cancel even if refund fails — can be processed manually
    }

    // Grant access until day 8 (end of first billing period)
    // User already paid for this period — fair to let them use it
    const graceEnd = new Date(new Date(subStart).getTime() + (8 * 24 * 60 * 60 * 1000));
    user.status = 'cancelled';
    user.cancelledAt = new Date();
    user.cancelledWithGrace = true;
    user.currentPeriodEnd = graceEnd;
    await user.save();

    console.log(`📭 Premium cancelled with refund + grace: ${user.email} (${daysSince.toFixed(1)} days, access until ${graceEnd.toISOString().split('T')[0]})`);

    // Send cancellation email with refund notice (non-blocking)
    sendCancellationEmail(user.email, true)
      .catch(err => console.error(`❌ Cancellation email failed: ${err.message}`));

    const daysRemaining = Math.ceil((graceEnd - Date.now()) / (1000 * 60 * 60 * 24));
    res.json({
      success: true,
      message: `Subscription cancelled. Your refund will be processed within 5-7 business days. You'll still have premium access for ${daysRemaining} more day${daysRemaining !== 1 ? 's' : ''}.`
    });
  } catch (err) {
    console.error('Cancel with refund error:', err.message);
    res.status(500).json({ success: false, message: 'Cancellation failed. Please try again.' });
  }
});


// ═══════════════════════════════════════
// GET /api/payment/subscription-info
// Header: x-auth-token
// Returns subscription status + cancellation window
// ═══════════════════════════════════════
router.get('/payment/subscription-info', requirePremium, async (req, res) => {
  const user = req.premiumUser;
  const isGift = user.source === 'gift';
  const subStart = user.subscribedAt || user.createdAt;
  const daysSince = (Date.now() - new Date(subStart).getTime()) / (1000 * 60 * 60 * 24);
  const daysLeft = isGift ? 0 : Math.max(0, Math.ceil(7 - daysSince));
  const canCancel = isGift ? false : daysSince <= 7;

  res.json({
    success: true,
    subscription: {
      plan: user.plan,
      planDisplay: PLANS[user.plan]?.display || user.plan,
      status: user.status,
      source: user.source || 'razorpay',
      subscribedAt: subStart,
      currentPeriodEnd: user.currentPeriodEnd,
      canCancel,
      daysLeftForCancellation: daysLeft,
      canSwitchPlan: isGift ? false : user.status === 'active'
    }
  });
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
  if (!user.subscribedAt) user.subscribedAt = new Date();
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

  // Send payment receipt (non-blocking)
  const payment = payload.payment?.entity;
  if (payment) {
    sendPaymentReceiptEmail(user.email, {
      amount: payment.amount || PLANS[user.plan]?.amount || 0,
      plan: user.plan,
      nextBillingDate: user.currentPeriodEnd,
      paymentId: payment.id || 'N/A'
    }).catch(err => console.error(`❌ Receipt email failed: ${err.message}`));
  }
}


async function handleCancelled(payload) {
  const sub = payload.subscription?.entity;
  if (!sub) return;

  const user = await PremiumUser.findOne({ razorpaySubscriptionId: sub.id });
  if (!user) return;

  // If user cancelled with 7-day grace period, don't override — they keep access until currentPeriodEnd
  if (user.cancelledWithGrace && user.currentPeriodEnd && new Date() < user.currentPeriodEnd) {
    console.log(`📭 Razorpay cancelled webhook for ${user.email} — grace period active until ${user.currentPeriodEnd.toISOString().split('T')[0]}, skipping status change`);
    return;
  }

  user.status = 'cancelled';
  await user.save();

  console.log(`📭 Premium cancelled: ${user.email}`);

  // Send cancellation email (non-blocking)
  sendCancellationEmail(user.email, false)
    .catch(err => console.error(`❌ Cancellation email failed: ${err.message}`));
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

  const email = payment.notes?.email || payment.email;
  console.warn(`⚠️  Payment failed for ${email || 'unknown'}: ${payment.error_description || 'unknown error'}`);

  // Find user and set grace period (keep access for 3 days while Razorpay retries)
  if (email) {
    const user = await PremiumUser.findOne({ email: email.toLowerCase() });
    if (user && user.status === 'active') {
      // Don't immediately revoke — Razorpay auto-retries for 3 days
      // Just log it. If subscription.cancelled webhook fires, it will handle downgrade.
      user.lastPaymentFailed = new Date();
      await user.save();
      console.log(`⚠️  Payment grace period started for ${email}`);
    }
  }
}


module.exports = router;
