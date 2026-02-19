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

// Auth middleware for API endpoints
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

// ── Real-time metrics (polled every 5s by dashboard) ──
router.get('/admin/metrics', requireAuth, async (req, res) => {
  try {
    const snapshot = getMetricsSnapshot();
    const visitStats = await getStats();

    // Subscriber breakdown
    const totalSubs = await Subscriber.countDocuments({ isActive: true });
    const subsByBeach = await Subscriber.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$preferredBeach', count: { $sum: 1 } } }
    ]);

    // Recent scores (last 7 days)
    const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const recentScores = await DailyScore.find({ date: { $gte: sevenAgo } })
      .sort({ date: -1 })
      .select('date beaches.beachKey beaches.score beaches.recommendation averageScore bestBeach -_id')
      .lean();

    // Lifetime stats
    const siteStats = await SiteStats.getPublicStats();

    // Database stats
    const dbStats = {
      connected: mongoose.connection.readyState === 1,
      collections: Object.keys(mongoose.connection.collections).length,
      host: mongoose.connection.host || 'unknown'
    };

    res.json({
      ...snapshot,
      traffic: visitStats,
      subscribers: {
        total: totalSubs,
        byBeach: subsByBeach.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {}),
        limit: 300,  // Brevo free tier
        utilization: Math.round((totalSubs / 300) * 100) + '%'
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
