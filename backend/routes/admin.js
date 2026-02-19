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

// ── Serve dashboard HTML ─────────────────────
router.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'dashboard.html'));
});

module.exports = router;
