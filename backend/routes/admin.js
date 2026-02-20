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
const mongoose = require('mongoose');

// ── Auth config ──────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'beacon2026';

// Simple session tokens (in-memory, cleared on restart)
const _sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
    const snapshot = getMetricsSnapshot();
    const visitStats = await getStats();

    // ── Subscribers: full list with emails ──
    const allSubscribers = await Subscriber.find({ isActive: true })
      .sort({ subscribedAt: -1 })
      .select('email preferredBeach subscribedAt lastEmailSent')
      .lean();

    const subsByBeach = {};
    allSubscribers.forEach(s => {
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
        total: allSubscribers.length,
        list: allSubscribers,
        byBeach: subsByBeach,
        limit: 300
      },
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
    const predictions = {};

    // Fetch all beach weather first (single pass)
    const allWeatherData = {};
    for (const beach of ALL_BEACHES) {
      try {
        const data = await weatherService.getTomorrow6AMForecast(beach.key);
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

    for (const [beachKey, data] of Object.entries(allWeatherData)) {
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
          insights: {
            greeting: insights.greeting || '',
            insight: insights.insight || '',
            whatYoullSee: insights.sunriseExperience?.whatYoullSee || '',
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
          forecast: data.forecast,
          breakdown: data.prediction.breakdown,
          insights: { greeting: '', insight: 'AI insights unavailable' },
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

// ── Serve dashboard HTML ─────────────────────
router.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'dashboard.html'));
});

module.exports = router;
