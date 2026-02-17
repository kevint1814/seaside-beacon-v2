// ==========================================
// Visit Tracker — Middleware + Helpers
// ==========================================
// Tracks all analytics into DailyVisit model.
// Everything is fire-and-forget (non-blocking).
// ==========================================

const DailyVisit = require('../models/DailyVisit');

/** Today's date in IST as "YYYY-MM-DD" */
function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Extract client IP */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || 'unknown';
}

/**
 * Middleware: track every API request as a page visit.
 * Attach BEFORE your routes in server.js.
 */
function trackVisitMiddleware(req, res, next) {
  setImmediate(async () => {
    try {
      const today = getTodayIST();
      const ip = getClientIP(req);

      const doc = await DailyVisit.findOneAndUpdate(
        { date: today },
        { $inc: { visits: 1 }, $addToSet: { uniqueIPs: ip } },
        { upsert: true, new: true, select: '+uniqueIPs' }
      );

      // Keep uniqueVisits count in sync
      await DailyVisit.updateOne(
        { date: today },
        { $set: { uniqueVisits: doc.uniqueIPs.length } }
      );
    } catch (err) {
      console.warn('⚠️ Visit track error:', err.message);
    }
  });
  next();
}

/** Increment prediction count for today */
async function trackPrediction() {
  try {
    await DailyVisit.findOneAndUpdate(
      { date: getTodayIST() },
      { $inc: { predictions: 1 } },
      { upsert: true }
    );
  } catch (err) {
    console.warn('⚠️ Prediction track error:', err.message);
  }
}

/** Increment new-sub count for today */
async function trackNewSub() {
  try {
    await DailyVisit.findOneAndUpdate(
      { date: getTodayIST() },
      { $inc: { newSubs: 1 } },
      { upsert: true }
    );
  } catch (err) {
    console.warn('⚠️ Sub track error:', err.message);
  }
}

/** Increment unsub count for today */
async function trackUnsub() {
  try {
    await DailyVisit.findOneAndUpdate(
      { date: getTodayIST() },
      { $inc: { unsubs: 1 } },
      { upsert: true }
    );
  } catch (err) {
    console.warn('⚠️ Unsub track error:', err.message);
  }
}

/**
 * Get stats for the admin digest.
 * Returns { today: {...}, lifetime: {...}, week: [...] }
 */
async function getStats() {
  const today = getTodayIST();

  // Today
  const todayDoc = await DailyVisit.findOne({ date: today });
  const todayStats = todayDoc
    ? { visits: todayDoc.visits, unique: todayDoc.uniqueVisits, predictions: todayDoc.predictions, newSubs: todayDoc.newSubs, unsubs: todayDoc.unsubs }
    : { visits: 0, unique: 0, predictions: 0, newSubs: 0, unsubs: 0 };

  // Lifetime
  const agg = await DailyVisit.aggregate([{
    $group: {
      _id: null,
      totalVisits: { $sum: '$visits' },
      totalUnique: { $sum: '$uniqueVisits' },
      totalPredictions: { $sum: '$predictions' },
      totalNewSubs: { $sum: '$newSubs' },
      totalUnsubs: { $sum: '$unsubs' },
      totalDays: { $sum: 1 }
    }
  }]);
  const lt = agg[0] || { totalVisits: 0, totalUnique: 0, totalPredictions: 0, totalNewSubs: 0, totalUnsubs: 0, totalDays: 0 };

  // Last 7 days
  const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const week = await DailyVisit.find({ date: { $gte: sevenAgo } })
    .sort({ date: 1 })
    .select('date visits uniqueVisits predictions newSubs unsubs -_id')
    .lean();

  return {
    today: todayStats,
    lifetime: {
      visits: lt.totalVisits,
      unique: lt.totalUnique,
      predictions: lt.totalPredictions,
      newSubs: lt.totalNewSubs,
      unsubs: lt.totalUnsubs,
      days: lt.totalDays
    },
    week
  };
}

module.exports = {
  trackVisitMiddleware,
  trackPrediction,
  trackNewSub,
  trackUnsub,
  getStats,
  getTodayIST
};
