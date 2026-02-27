// ==========================================
// Admin Routes — Dashboard & Metrics API
// ==========================================
// Auth: simple token-based login.
// Set ADMIN_USER and ADMIN_PASS in .env
// ==========================================

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const router = express.Router();

const { getMetricsSnapshot } = require('../services/metricsCollector');
const { getStats } = require('../services/visitTracker');
const Subscriber = require('../models/Subscriber');
const DailyScore = require('../models/DailyScore');
const DailyVisit = require('../models/DailyVisit');
const SiteStats = require('../models/SiteStats');
const PremiumUser = require('../models/PremiumUser');
const Feedback = require('../models/Feedback');
const SunriseSubmission = require('../models/SunriseSubmission');
const SupportTicket = require('../models/SupportTicket');
const DeviceToken = require('../models/DeviceToken');
const SampleForecast = require('../models/SampleForecast');
const mongoose = require('mongoose');

// ── Auth config ──────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'beacon2026';

// Simple session tokens (in-memory, cleared on restart)
const _sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ── Stale pending user cleanup (runs at most once per hour) ──
let _lastPendingCleanup = 0;
async function cleanupStalePendingUsers() {
  const now = Date.now();
  if (now - _lastPendingCleanup < 60 * 60 * 1000) return; // throttle: 1hr
  _lastPendingCleanup = now;
  try {
    const cutoff = new Date(now - 24 * 60 * 60 * 1000);
    const result = await PremiumUser.deleteMany({
      status: 'pending',
      createdAt: { $lt: cutoff }
    });
    if (result.deletedCount > 0) {
      console.log(`🧹 Cleaned up ${result.deletedCount} stale pending user(s) (>24h old)`);
    }
  } catch (err) {
    console.error('Pending cleanup error:', err.message);
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isValidSession(token) {
  if (!token) return false;
  const session = _sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    _sessions.delete(token);
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!isValidSession(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Login ────────────────────────────────────
router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = generateToken();
    _sessions.set(token, { createdAt: Date.now() });
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// ── Full metrics — lifetime from MongoDB + session from memory ──
router.get('/admin/metrics', requireAuth, async (req, res) => {
  try {
    // Housekeeping: remove stale pending users (throttled, max 1x/hr)
    cleanupStalePendingUsers();

    const snapshot = getMetricsSnapshot();
    const visitStats = await getStats();

    // ── Subscribers: full list with emails (include inactive for admin management) ──
    const allSubscribers = await Subscriber.find({})
      .sort({ subscribedAt: -1 })
      .select('email preferredBeach isActive subscribedAt lastEmailSent')
      .lean();
    const activeSubscribers = allSubscribers.filter(s => s.isActive);

    const subsByBeach = {};
    activeSubscribers.forEach(s => {
      subsByBeach[s.preferredBeach] = (subsByBeach[s.preferredBeach] || 0) + 1;
    });

    // ── Lifetime traffic from MongoDB (all days) ──
    const allTraffic = await DailyVisit.find({})
      .sort({ date: -1 })
      .select('date visits uniqueVisits predictions newSubs unsubs -_id')
      .lean();

    const lifetimeTraffic = allTraffic.reduce((acc, d) => {
      acc.visits += d.visits || 0;
      acc.unique += d.uniqueVisits || 0;
      acc.predictions += d.predictions || 0;
      acc.newSubs += d.newSubs || 0;
      acc.unsubs += d.unsubs || 0;
      return acc;
    }, { visits: 0, unique: 0, predictions: 0, newSubs: 0, unsubs: 0 });

    // Last 30 days for chart
    const last30 = allTraffic.slice(0, 30).reverse();

    // ── Scores: last 14 days ──
    const fourteenAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const recentScores = await DailyScore.find({ date: { $gte: fourteenAgo } })
      .sort({ date: -1 })
      .select('date beaches.beachKey beaches.beachName beaches.score beaches.recommendation beaches.verdict averageScore bestBeach -_id')
      .lean();

    // ── Lifetime site stats ──
    const siteStats = await SiteStats.getPublicStats();

    // ── Premium Users ──
    const premiumUsers = await PremiumUser.find({})
      .select('email plan status currentPeriodEnd preferredBeach telegramChatId lastLogin subscribedAt alertTime eveningPreviewTime cancelledAt lastPaymentFailed cancelledWithGrace createdAt')
      .lean();

    // Sort: active first, then grace period, then pending, then cancelled/expired
    const statusOrder = { active: 0, pending: 2, cancelled: 3, expired: 4 };
    const now = new Date();
    premiumUsers.sort((a, b) => {
      const aGrace = a.cancelledWithGrace && a.currentPeriodEnd && new Date(a.currentPeriodEnd) > now;
      const bGrace = b.cancelledWithGrace && b.currentPeriodEnd && new Date(b.currentPeriodEnd) > now;
      const aOrder = a.status === 'active' ? 0 : aGrace ? 1 : (statusOrder[a.status] ?? 5);
      const bOrder = b.status === 'active' ? 0 : bGrace ? 1 : (statusOrder[b.status] ?? 5);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.subscribedAt || b.createdAt) - new Date(a.subscribedAt || a.createdAt);
    });

    // Active includes grace period users
    const activePremium = premiumUsers.filter(u =>
      u.status === 'active' ||
      (u.cancelledWithGrace && u.currentPeriodEnd && new Date(u.currentPeriodEnd) > now)
    );
    const cancelledCount = await PremiumUser.countDocuments({ status: 'cancelled' });
    const telegramLinked = await PremiumUser.countDocuments({ telegramChatId: { $exists: true, $ne: null } });

    // Calculate average tenure for active users (in days)
    let avgTenure = 0;
    if (activePremium.length > 0) {
      const tenures = activePremium.map(u => {
        const subDate = new Date(u.subscribedAt).getTime();
        return (Date.now() - subDate) / (1000 * 60 * 60 * 24);
      });
      avgTenure = Math.round(tenures.reduce((a, b) => a + b, 0) / tenures.length);
    }

    const premiumStats = {
      total: activePremium.length,
      list: premiumUsers,
      revenue: {
        monthly: activePremium.filter(u => u.plan === 'monthly').length * 49,
        annual: activePremium.filter(u => u.plan === 'annual').length * 399
      },
      cancellations: cancelledCount,
      avgTenure: avgTenure,
      telegramLinked: telegramLinked
    };

    // ── Email Health (covers both Subscriber + PremiumUser collections) ──
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000);

    // Subscribers who got an email in the last 24h (healthy)
    const subEmailed24h = await Subscriber.countDocuments({
      isActive: true,
      lastEmailSent: { $gte: twentyFourHoursAgo }
    });

    // Premium-only users (not in Subscriber) who logged in within 48h = likely received emails
    // Since premium-only users don't have lastEmailSent in Subscriber, use lastLogin as proxy
    const subscriberEmailSet = new Set(activeSubscribers.map(s => s.email));
    const premiumOnlyActive = activePremium.filter(u => !subscriberEmailSet.has(u.email));
    const premiumOnlyEmailed = premiumOnlyActive.filter(u => u.lastLogin && new Date(u.lastLogin) >= twentyFourHoursAgo).length;

    const emailedLast24h = subEmailed24h + premiumOnlyActive.length; // premium-only always get emails if active

    // Stale subscribers (48h+ without email)
    const staleSubscribers = await Subscriber.find({
      isActive: true,
      $or: [
        { lastEmailSent: null },
        { lastEmailSent: { $lt: fortyEightHoursAgo } }
      ]
    }).select('email preferredBeach lastEmailSent subscribedAt').lean();

    // Total email recipients = active subscribers + premium-only users
    const totalEmailRecipients = activeSubscribers.length + premiumOnlyActive.length;

    const emailHealth = {
      activeSubscribers: totalEmailRecipients,
      subscriberCount: allSubscribers.length,
      premiumOnlyCount: premiumOnlyActive.length,
      emailedLast24h,
      staleCount: staleSubscribers.length,
      staleList: staleSubscribers.slice(0, 20), // show top 20
      deliveryRate: totalEmailRecipients > 0
        ? Math.round((emailedLast24h / totalEmailRecipients) * 100)
        : 0,
      provider: process.env.EMAIL_PROVIDER || 'brevo',
      dailyLimit: (process.env.EMAIL_PROVIDER || 'brevo') === 'brevo' ? 300 : 100,
      estimatedDailyUsage: totalEmailRecipients + activePremium.length, // morning (all) + evening (premium)
      rateLimitWarning: (totalEmailRecipients + activePremium.length) > 250
    };

    // ── Recent Feedback ──
    const recentFeedback = await Feedback.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // ── Database ──
    const dbStats = {
      connected: mongoose.connection.readyState === 1,
      collections: Object.keys(mongoose.connection.collections).length,
      host: mongoose.connection.host || 'unknown'
    };

    res.json({
      session: snapshot,
      traffic: {
        today: visitStats.today,
        lifetime: lifetimeTraffic,
        last30: last30,
        totalDays: allTraffic.length
      },
      subscribers: {
        total: activeSubscribers.length,
        totalAll: allSubscribers.length,
        list: allSubscribers,
        byBeach: subsByBeach,
        limit: 300
      },
      premium: premiumStats,
      emailHealth,
      feedback: recentFeedback,
      scores: recentScores,
      siteStats,
      database: dbStats
    });
  } catch (error) {
    console.error('Admin metrics error:', error.message);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// ── Live predictions (24/7, no time restriction — future paid tier) ──
router.get('/api/admin/predictions', requireAuth, async (req, res) => {
  try {
    const weatherService = require('../services/weatherService');
    const aiService = require('../services/aiService');

    const ALL_BEACHES = weatherService.getBeaches();
    // Only show Marina + Covelong (others are nearly identical to Marina)
    const DASHBOARD_BEACHES = ALL_BEACHES.filter(b => b.key === 'marina' || b.key === 'covelong');
    const predictions = {};

    // Fetch dashboard beaches + all for AI context
    const allWeatherData = {};
    for (const beach of ALL_BEACHES) {
      try {
        const data = await weatherService.getTomorrow6AMForecast(beach.key, { forceAvailable: true });
        if (data.available) {
          allWeatherData[beach.key] = data;
        }
      } catch (err) {
        console.warn(`⚠️  Admin predictions: ${beach.key} fetch failed:`, err.message);
      }
    }

    // Generate insights per beach (with full context for comparison)
    const beachNames = {};
    ALL_BEACHES.forEach(b => { beachNames[b.key] = b.name; });

    // Only build detailed predictions for dashboard beaches
    const dashboardKeys = new Set(DASHBOARD_BEACHES.map(b => b.key));
    for (const [beachKey, data] of Object.entries(allWeatherData)) {
      if (!dashboardKeys.has(beachKey)) continue;
      try {
        data.allBeachNames = beachNames;
        const insights = await aiService.generatePhotographyInsights(data, allWeatherData);

        predictions[beachKey] = {
          beach: data.beach,
          available: true,
          score: data.prediction.score,
          verdict: data.prediction.verdict,
          recommendation: data.prediction.recommendation,
          forecast: data.forecast,
          breakdown: data.prediction.breakdown,
          atmosphericLabels: data.prediction.atmosphericLabels,
          factors: data.prediction.factors || {},
          sunTimes: data.sunTimes || null,
          goldenHour: data.goldenHour || null,
          insights: {
            source: insights.source || 'rules',
            greeting: insights.greeting || '',
            insight: insights.insight || '',
            whatYoullSee: insights.sunriseExperience?.whatYoullSee || '',
            beachVibes: insights.sunriseExperience?.beachVibes || '',
            worthWakingUp: insights.sunriseExperience?.worthWakingUp || ''
          },
          dataSources: data.dataSources || {}
        };
      } catch (err) {
        predictions[beachKey] = {
          beach: data.beach,
          available: true,
          score: data.prediction.score,
          verdict: data.prediction.verdict,
          recommendation: data.prediction.recommendation,
          forecast: data.forecast,
          breakdown: data.prediction.breakdown,
          atmosphericLabels: data.prediction.atmosphericLabels,
          factors: data.prediction.factors || {},
          sunTimes: data.sunTimes || null,
          goldenHour: data.goldenHour || null,
          insights: { greeting: '', insight: 'AI insights unavailable' },
          dataSources: data.dataSources || {},
          error: err.message
        };
      }
    }

    res.json({
      success: true,
      predictions,
      beachCount: Object.keys(predictions).length,
      fetchedAt: new Date().toISOString(),
      timezone: 'Asia/Kolkata'
    });
  } catch (error) {
    console.error('Admin predictions error:', error.message);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

// ── Send broadcast email ─────────────────────
router.post('/admin/send-email', requireAuth, async (req, res) => {
  try {
    const { subject, body, senderAddress, recipients, attachments } = req.body;

    if (!subject || !body || !recipients || !recipients.length) {
      return res.status(400).json({ error: 'Subject, body, and recipients are required' });
    }

    // Validate attachments size (20MB total max)
    if (attachments && attachments.length) {
      const totalBytes = attachments.reduce((sum, a) => sum + (a.base64 ? Buffer.from(a.base64, 'base64').length : 0), 0);
      if (totalBytes > 20 * 1024 * 1024) {
        return res.status(400).json({ error: 'Total attachments exceed 20MB limit' });
      }
    }

    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) {
      return res.status(500).json({ error: 'BREVO_API_KEY not configured on server' });
    }

    // Validate sender — only allow verified senders
    const allowedSenders = ['hello@seasidebeacon.com', 'forecast@seasidebeacon.com'];
    const sender = allowedSenders.includes(senderAddress) ? senderAddress : 'forecast@seasidebeacon.com';

    // Build clean HTML email wrapping the body text
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f5f0ea;-webkit-text-size-adjust:none;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f0ea">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td bgcolor="#C4733A" style="padding:36px 40px;text-align:center;">
  <p style="margin:0 0 6px;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2.5px;color:#f5e8d8;">Seaside Beacon</p>
  <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">${subject}</h1>
</td></tr>
<tr><td bgcolor="#ffffff" style="padding:36px 40px;">
  <div style="font-family:'Instrument Sans',-apple-system,sans-serif;font-size:14px;line-height:1.75;color:#4a4440;">
    ${body.replace(/\n/g, '<br>')}
  </div>
</td></tr>
<tr><td bgcolor="#F0E8DE" style="padding:20px 40px;text-align:center;border-top:1px solid #E0D5C8;">
  <p style="margin:0;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:11px;color:#8a7e72;">Seaside Beacon · <a href="https://www.seasidebeacon.com" style="color:#C4733A;text-decoration:none;">seasidebeacon.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

    const plainText = body;

    // Send to each recipient via Brevo
    let sent = 0;
    let failed = 0;
    const errors = [];

    // Brevo supports batch, but sending individually for reliability + unsubscribe headers
    for (const email of recipients) {
      try {
        const unsubUrl = `${process.env.API_URL || 'https://api.seasidebeacon.com'}/api/unsubscribe?email=${encodeURIComponent(email)}`;
        const payload = {
          sender: { name: 'Seaside Beacon', email: sender },
          to: [{ email }],
          subject,
          htmlContent,
          textContent: plainText,
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
          }
        };

        // Add attachments if present (Brevo supports base64 attachments)
        if (attachments && attachments.length) {
          payload.attachment = attachments.map(a => ({
            name: a.name,
            content: a.base64,
            type: a.type || 'application/octet-stream'
          }));
        }

        const apiRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (apiRes.ok) {
          sent++;
        } else {
          const errText = await apiRes.text();
          failed++;
          errors.push({ email, error: errText });
        }

        // Small delay to avoid rate limits (10 emails/sec on Brevo free)
        if (recipients.length > 5) {
          await new Promise(r => setTimeout(r, 150));
        }
      } catch (err) {
        failed++;
        errors.push({ email, error: err.message });
      }
    }

    console.log(`📧 Admin broadcast: ${sent} sent, ${failed} failed (from: ${sender}, subject: "${subject}")`);

    res.json({
      success: true,
      sent,
      failed,
      total: recipients.length,
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    console.error('Admin send-email error:', error.message);
    res.status(500).json({ error: 'Failed to send emails' });
  }
});

// ── Subscriber Management ────────────────────

// Edit subscriber (beach preference, toggle active)
router.patch('/admin/subscriber/:email', requireAuth, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    const { preferredBeach, isActive } = req.body;

    const update = {};
    if (preferredBeach && ['marina', 'elliot', 'covelong', 'thiruvanmiyur'].includes(preferredBeach)) {
      update.preferredBeach = preferredBeach;
    }
    if (typeof isActive === 'boolean') {
      update.isActive = isActive;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const subscriber = await Subscriber.findOneAndUpdate(
      { email },
      { $set: update },
      { new: true }
    );

    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    console.log(`🔧 Admin: Updated subscriber ${email} →`, update);
    res.json({ success: true, subscriber });
  } catch (error) {
    console.error('Admin subscriber update error:', error.message);
    res.status(500).json({ error: 'Failed to update subscriber' });
  }
});

// Delete subscriber
router.delete('/admin/subscriber/:email', requireAuth, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    const result = await Subscriber.findOneAndDelete({ email });

    if (!result) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    console.log(`🗑️  Admin: Deleted subscriber ${email}`);
    res.json({ success: true, deleted: email });
  } catch (error) {
    console.error('Admin subscriber delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete subscriber' });
  }
});

// ── Premium User Management ─────────────────

// Edit premium user (beach, alert time, evening time, status)
router.patch('/admin/premium/:email', requireAuth, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    const { preferredBeach, alertTime, eveningPreviewTime, status } = req.body;

    const update = {};
    if (preferredBeach && ['marina', 'elliot', 'covelong', 'thiruvanmiyur'].includes(preferredBeach)) {
      update.preferredBeach = preferredBeach;
    }
    if (alertTime && /^\d{2}:\d{2}$/.test(alertTime)) {
      update.alertTime = alertTime;
    }
    if (eveningPreviewTime && /^\d{2}:\d{2}$/.test(eveningPreviewTime)) {
      update.eveningPreviewTime = eveningPreviewTime;
    }
    if (status && ['active', 'cancelled', 'expired', 'pending'].includes(status)) {
      update.status = status;
      if (status === 'cancelled') {
        update.cancelledAt = new Date();
      }
      if (status === 'active') {
        update.cancelledAt = null;
        update.cancelledWithGrace = false;
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const user = await PremiumUser.findOneAndUpdate(
      { email },
      { $set: update },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Premium user not found' });
    }

    console.log(`🔧 Admin: Updated premium user ${email} →`, update);
    res.json({ success: true, user });
  } catch (error) {
    console.error('Admin premium update error:', error.message);
    res.status(500).json({ error: 'Failed to update premium user' });
  }
});

// Extend premium subscription
router.post('/admin/premium/:email/extend', requireAuth, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    const { days } = req.body;

    if (!days || days < 1 || days > 365) {
      return res.status(400).json({ error: 'Days must be between 1 and 365' });
    }

    const user = await PremiumUser.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'Premium user not found' });
    }

    // Extend from current period end or from now
    const baseDate = (user.currentPeriodEnd && new Date(user.currentPeriodEnd) > new Date())
      ? new Date(user.currentPeriodEnd)
      : new Date();

    const newEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    user.currentPeriodEnd = newEnd;
    if (user.status !== 'active') {
      user.status = 'active';
      user.cancelledAt = null;
      user.cancelledWithGrace = false;
    }
    await user.save();

    console.log(`📅 Admin: Extended premium for ${email} by ${days} days → ${newEnd.toISOString()}`);
    res.json({ success: true, newPeriodEnd: newEnd, user });
  } catch (error) {
    console.error('Admin premium extend error:', error.message);
    res.status(500).json({ error: 'Failed to extend subscription' });
  }
});

// Cancel premium subscription (admin override)
router.post('/admin/premium/:email/cancel', requireAuth, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    const { immediate } = req.body; // if true, cancel immediately; else grace period

    const user = await PremiumUser.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'Premium user not found' });
    }

    if (immediate) {
      user.status = 'cancelled';
      user.cancelledAt = new Date();
      user.cancelledWithGrace = false;
    } else {
      // Cancel with grace — keep access until currentPeriodEnd
      user.status = 'cancelled';
      user.cancelledAt = new Date();
      user.cancelledWithGrace = true;
    }
    await user.save();

    console.log(`❌ Admin: Cancelled premium for ${email} (immediate: ${!!immediate})`);
    res.json({ success: true, user });
  } catch (error) {
    console.error('Admin premium cancel error:', error.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Get premium user payment/subscription history
router.get('/admin/premium/:email/history', requireAuth, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    const user = await PremiumUser.findOne({ email }).lean();

    if (!user) {
      return res.status(404).json({ error: 'Premium user not found' });
    }

    // Build a timeline from available data
    const timeline = [];

    if (user.createdAt) {
      timeline.push({ date: user.createdAt, event: 'Account created', detail: '' });
    }
    if (user.subscribedAt) {
      timeline.push({ date: user.subscribedAt, event: 'Subscribed', detail: user.plan || 'unknown plan' });
    }
    if (user.telegramLinkedAt) {
      timeline.push({ date: user.telegramLinkedAt, event: 'Telegram linked', detail: 'Chat ID: ' + (user.telegramChatId || '—') });
    }
    if (user.cancelledAt) {
      timeline.push({ date: user.cancelledAt, event: 'Cancelled', detail: user.cancelledWithGrace ? 'Grace period until ' + (user.currentPeriodEnd ? new Date(user.currentPeriodEnd).toLocaleDateString('en-IN') : '—') : 'Immediate' });
    }
    if (user.lastPaymentFailed) {
      timeline.push({ date: user.lastPaymentFailed, event: 'Payment failed', detail: '' });
    }
    if (user.lastLogin) {
      timeline.push({ date: user.lastLogin, event: 'Last login', detail: '' });
    }

    // Sort by date descending
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      email: user.email,
      plan: user.plan,
      status: user.status,
      razorpaySubscriptionId: user.razorpaySubscriptionId || null,
      razorpayCustomerId: user.razorpayCustomerId || null,
      currentPeriodEnd: user.currentPeriodEnd,
      cancelledWithGrace: user.cancelledWithGrace,
      timeline
    });
  } catch (error) {
    console.error('Admin premium history error:', error.message);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ══════════════════════════════════════════════
// Photos Management (Cloudinary / SunriseSubmission)
// ══════════════════════════════════════════════

// List all sunrise submissions (paginated, filterable)
router.get('/admin/photos', requireAuth, async (req, res) => {
  try {
    const { beach, featured } = req.query;
    const filter = {};
    if (beach && ['marina', 'elliot', 'covelong', 'thiruvanmiyur'].includes(beach)) filter.beach = beach;
    if (featured === 'true') filter.featured = true;
    if (featured === 'false') filter.featured = false;

    const pg = Math.max(parseInt(req.query.page) || 1, 1);
    const lim = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 100));
    const skip = (pg - 1) * lim;
    const total = await SunriseSubmission.countDocuments(filter);
    const photos = await SunriseSubmission.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim)
      .lean();

    const stats = {
      total: await SunriseSubmission.countDocuments({}),
      featured: await SunriseSubmission.countDocuments({ featured: true }),
      spotlighted: await SunriseSubmission.countDocuments({ spotlighted: true }),
      byBeach: {}
    };
    for (const b of ['marina', 'elliot', 'covelong', 'thiruvanmiyur']) {
      stats.byBeach[b] = await SunriseSubmission.countDocuments({ beach: b });
    }

    res.json({ success: true, photos, total, page: pg, stats });
  } catch (error) {
    console.error('Admin photos list error:', error.message);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Toggle featured/spotlighted flags on a photo
router.patch('/admin/photos/:id', requireAuth, async (req, res) => {
  try {
    const { featured, spotlighted } = req.body;
    const update = {};
    if (typeof featured === 'boolean') update.featured = featured;
    if (typeof spotlighted === 'boolean') update.spotlighted = spotlighted;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const photo = await SunriseSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    console.log(`📸 Admin: Updated photo ${req.params.id} →`, update);
    res.json({ success: true, photo });
  } catch (error) {
    console.error('Admin photo update error:', error.message);
    res.status(500).json({ error: 'Failed to update photo' });
  }
});

// Delete photo from MongoDB + Cloudinary
router.delete('/admin/photos/:id', requireAuth, async (req, res) => {
  try {
    const photo = await SunriseSubmission.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    // Try to delete from Cloudinary if we have the public ID
    if (photo.cloudinaryPublicId) {
      try {
        const cloudinary = require('cloudinary').v2;
        await cloudinary.uploader.destroy(photo.cloudinaryPublicId);
        console.log(`☁️  Cloudinary: Deleted ${photo.cloudinaryPublicId}`);
      } catch (cloudErr) {
        console.warn(`☁️  Cloudinary delete failed (continuing): ${cloudErr.message}`);
      }
    }

    await SunriseSubmission.findByIdAndDelete(req.params.id);
    console.log(`🗑️  Admin: Deleted photo ${req.params.id}`);
    res.json({ success: true, deleted: req.params.id });
  } catch (error) {
    console.error('Admin photo delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// ══════════════════════════════════════════════
// Support Tickets
// ══════════════════════════════════════════════

// List all support tickets (filterable by status)
router.get('/admin/tickets', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && ['open', 'in-progress', 'resolved', 'closed'].includes(status)) {
      filter.status = status;
    }

    const tickets = await SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const stats = {
      open: await SupportTicket.countDocuments({ status: 'open' }),
      inProgress: await SupportTicket.countDocuments({ status: 'in-progress' }),
      resolved: await SupportTicket.countDocuments({ status: 'resolved' }),
      closed: await SupportTicket.countDocuments({ status: 'closed' }),
      total: await SupportTicket.countDocuments({})
    };

    res.json({ success: true, tickets, stats });
  } catch (error) {
    console.error('Admin tickets list error:', error.message);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Update ticket status + admin notes
router.patch('/admin/tickets/:ticketId', requireAuth, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const update = {};
    if (status && ['open', 'in-progress', 'resolved', 'closed'].includes(status)) {
      update.status = status;
      if (status === 'resolved') update.resolvedAt = new Date();
    }
    if (typeof adminNotes === 'string') update.adminNotes = adminNotes;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const ticket = await SupportTicket.findOneAndUpdate(
      { ticketId: req.params.ticketId },
      { $set: update },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    console.log(`🎫 Admin: Updated ticket ${req.params.ticketId} →`, update);
    res.json({ success: true, ticket });
  } catch (error) {
    console.error('Admin ticket update error:', error.message);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Resolve a ticket (shortcut)
router.post('/admin/tickets/:ticketId/resolve', requireAuth, async (req, res) => {
  try {
    const { adminNotes } = req.body;
    const update = { status: 'resolved', resolvedAt: new Date() };
    if (adminNotes) update.adminNotes = adminNotes;

    const ticket = await SupportTicket.findOneAndUpdate(
      { ticketId: req.params.ticketId },
      { $set: update },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    console.log(`✅ Admin: Resolved ticket ${req.params.ticketId}`);
    res.json({ success: true, ticket });
  } catch (error) {
    console.error('Admin ticket resolve error:', error.message);
    res.status(500).json({ error: 'Failed to resolve ticket' });
  }
});

// ══════════════════════════════════════════════
// Feedback Management
// ══════════════════════════════════════════════

// Delete feedback entry
router.delete('/admin/feedback/:id', requireAuth, async (req, res) => {
  try {
    const result = await Feedback.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Feedback not found' });

    console.log(`🗑️  Admin: Deleted feedback ${req.params.id}`);
    res.json({ success: true, deleted: req.params.id });
  } catch (error) {
    console.error('Admin feedback delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete feedback' });
  }
});

// ══════════════════════════════════════════════
// Database Browser
// ══════════════════════════════════════════════

// Get all collection stats
router.get('/admin/db/stats', requireAuth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ error: 'Database connection unavailable' });
    const collections = await db.listCollections().toArray();
    const stats = [];

    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      stats.push({ name: col.name, count });
    }

    stats.sort((a, b) => b.count - a.count);
    res.json({ success: true, collections: stats, total: stats.length });
  } catch (error) {
    console.error('Admin db stats error:', error.message);
    res.status(500).json({ error: 'Failed to fetch database stats' });
  }
});

// Browse documents from any collection (read-only)
router.get('/admin/db/collection/:name', requireAuth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ error: 'Database connection unavailable' });
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip = parseInt(req.query.skip) || 0;

    // Verify collection exists
    const collections = await db.listCollections({ name: req.params.name }).toArray();
    if (collections.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const docs = await db.collection(req.params.name)
      .find({})
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await db.collection(req.params.name).countDocuments();

    res.json({ success: true, collection: req.params.name, docs, total, limit, skip });
  } catch (error) {
    console.error('Admin db browse error:', error.message);
    res.status(500).json({ error: 'Failed to browse collection' });
  }
});

// ══════════════════════════════════════════════
// Manual Job Triggers
// ══════════════════════════════════════════════

router.post('/admin/jobs/trigger', requireAuth, async (req, res) => {
  try {
    const { job } = req.body;
    const allowed = ['dailyEmail', 'eveningPreview', 'morningPush', 'eveningPush', 'specialAlert'];
    if (!job || !allowed.includes(job)) {
      return res.status(400).json({ error: `Invalid job. Allowed: ${allowed.join(', ')}` });
    }

    let result;
    const startTime = Date.now();

    switch (job) {
      case 'dailyEmail': {
        const { sendDailyPredictions } = require('../jobs/dailyEmail');
        result = await sendDailyPredictions();
        break;
      }
      case 'eveningPreview': {
        const { sendEveningPreviews } = require('../jobs/dailyEmail');
        result = await sendEveningPreviews();
        break;
      }
      case 'morningPush': {
        const { sendMorningPush } = require('../jobs/pushNotifications');
        result = await sendMorningPush();
        break;
      }
      case 'eveningPush': {
        const { sendEveningPush } = require('../jobs/pushNotifications');
        result = await sendEveningPush();
        break;
      }
      case 'specialAlert': {
        const { sendSpecialAlert } = require('../jobs/dailyEmail');
        result = await sendSpecialAlert();
        break;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`⚡ Admin: Triggered job "${job}" (${duration}ms)`);
    res.json({ success: true, job, duration, result: result || 'completed' });
  } catch (error) {
    console.error(`Admin job trigger error (${req.body.job}):`, error.message);
    res.status(500).json({ error: `Job failed: ${error.message}` });
  }
});

// ══════════════════════════════════════════════
// FCM Devices
// ══════════════════════════════════════════════

router.get('/admin/devices', requireAuth, async (req, res) => {
  try {
    const devices = await DeviceToken.find({})
      .sort({ lastActive: -1 })
      .lean();

    const stats = {
      total: devices.length,
      android: devices.filter(d => d.platform === 'android').length,
      ios: devices.filter(d => d.platform === 'ios').length,
      muteAll: devices.filter(d => d.settings?.muteAll).length,
      activeLastWeek: devices.filter(d => d.lastActive && (Date.now() - new Date(d.lastActive).getTime()) < 7 * 24 * 60 * 60 * 1000).length
    };

    res.json({ success: true, devices, stats });
  } catch (error) {
    console.error('Admin devices error:', error.message);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// ══════════════════════════════════════════════
// System — Environment & Exports
// ══════════════════════════════════════════════

// Sanitized environment variables
router.get('/admin/system/env', requireAuth, async (req, res) => {
  try {
    const sensitiveKeys = [
      'ADMIN_PASS', 'BREVO_API_KEY', 'SENDGRID_API_KEY', 'RAZORPAY_KEY_SECRET',
      'RAZORPAY_KEY_ID', 'MONGODB_URI', 'GOOGLE_CLIENT_SECRET', 'TELEGRAM_BOT_TOKEN',
      'CLOUDINARY_API_SECRET', 'CLOUDINARY_API_KEY', 'FIREBASE_PRIVATE_KEY',
      'JWT_SECRET', 'SESSION_SECRET', 'GROQ_API_KEY', 'GEMINI_API_KEY'
    ];

    const envVars = {};
    const relevantPrefixes = [
      'ADMIN_', 'BREVO_', 'SENDGRID_', 'RAZORPAY_', 'MONGODB_', 'GOOGLE_',
      'TELEGRAM_', 'CLOUDINARY_', 'FIREBASE_', 'API_', 'FRONTEND_', 'NODE_ENV',
      'PORT', 'JWT_', 'SESSION_', 'GROQ_', 'GEMINI_', 'EMAIL_', 'RENDER'
    ];

    for (const [key, value] of Object.entries(process.env)) {
      if (!relevantPrefixes.some(p => key.startsWith(p))) continue;
      const isSensitive = sensitiveKeys.includes(key);
      if (isSensitive) {
        // Always fully mask sensitive values — never leak partial keys
        envVars[key] = '••••••••';
      } else {
        envVars[key] = value;
      }
    }

    res.json({ success: true, env: envVars, count: Object.keys(envVars).length });
  } catch (error) {
    console.error('Admin env error:', error.message);
    res.status(500).json({ error: 'Failed to fetch environment' });
  }
});

// CSV exports
router.get('/admin/export/:type', requireAuth, async (req, res) => {
  try {
    const { type } = req.params;
    let csv = '';
    let filename = '';

    switch (type) {
      case 'subscribers': {
        const subs = await Subscriber.find({}).sort({ subscribedAt: -1 }).lean();
        csv = 'Email,Beach,Active,Subscribed At,Last Email\n';
        for (const s of subs) {
          csv += `"${s.email}","${s.preferredBeach}",${s.isActive},"${s.subscribedAt || ''}","${s.lastEmailSent || ''}"\n`;
        }
        filename = `subscribers-${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }
      case 'premium': {
        const users = await PremiumUser.find({}).sort({ subscribedAt: -1 }).lean();
        csv = 'Email,Plan,Status,Beach,Subscribed At,Period End,Telegram,Last Login\n';
        for (const u of users) {
          csv += `"${u.email}","${u.plan || ''}","${u.status}","${u.preferredBeach}","${u.subscribedAt || ''}","${u.currentPeriodEnd || ''}","${u.telegramChatId || ''}","${u.lastLogin || ''}"\n`;
        }
        filename = `premium-users-${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }
      case 'forecasts': {
        const scores = await DailyScore.find({}).sort({ date: -1 }).limit(365).lean();
        csv = 'Date,Average Score,Best Beach,Marina,Elliot,Covelong,Thiruvanmiyur\n';
        for (const s of scores) {
          const beachScores = {};
          (s.beaches || []).forEach(b => { beachScores[b.beachKey] = b.score; });
          csv += `"${s.date}",${s.averageScore || ''},"${s.bestBeach || ''}",${beachScores.marina || ''},${beachScores.elliot || ''},${beachScores.covelong || ''},${beachScores.thiruvanmiyur || ''}\n`;
        }
        filename = `forecasts-${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }
      case 'feedback': {
        const fb = await Feedback.find({}).sort({ createdAt: -1 }).lean();
        csv = 'Rating,Comment,User,Email,Beach,Date\n';
        for (const f of fb) {
          csv += `${f.rating || ''},"${(f.comment || '').replace(/"/g, '""')}","${f.userName || ''}","${f.email || ''}","${f.beach || ''}","${f.createdAt || ''}"\n`;
        }
        filename = `feedback-${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }
      case 'traffic': {
        const visits = await DailyVisit.find({}).sort({ date: -1 }).lean();
        csv = 'Date,Visits,Unique Visitors,Predictions,New Subs,Unsubs\n';
        for (const v of visits) {
          csv += `"${v.date}",${v.visits || 0},${v.uniqueVisits || 0},${v.predictions || 0},${v.newSubs || 0},${v.unsubs || 0}\n`;
        }
        filename = `traffic-${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }
      default:
        return res.status(400).json({ error: 'Invalid export type. Allowed: subscribers, premium, forecasts, feedback, traffic' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Admin export error:', error.message);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// ── Serve dashboard HTML ─────────────────────
router.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'dashboard.html'));
});

module.exports = router;
