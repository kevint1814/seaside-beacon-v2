// ==========================================
// DailyVisit Model — Daily analytics storage
// ==========================================
// One document per day (IST). Tracks:
//   visits       — total API hits
//   uniqueIPs    — deduplicated visitor IPs
//   uniqueVisits — count of unique IPs
//   predictions  — forecast requests served
//   newSubs      — subscribers gained
//   unsubs       — subscribers lost
// ==========================================

const mongoose = require('mongoose');

const dailyVisitSchema = new mongoose.Schema({
  date: {
    type: String,           // "2026-02-18" (IST date)
    required: true,
    unique: true
  },
  visits: {
    type: Number,
    default: 0
  },
  uniqueIPs: {
    type: [String],
    default: [],
    select: false           // Don't return raw IPs in normal queries
  },
  uniqueVisits: {
    type: Number,
    default: 0
  },
  predictions: {
    type: Number,
    default: 0
  },
  newSubs: {
    type: Number,
    default: 0
  },
  unsubs: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

dailyVisitSchema.index({ date: -1 });

module.exports = mongoose.model('DailyVisit', dailyVisitSchema);
