// ==========================================
// SiteStats Model - Persistent Counters
// Single document that tracks cumulative stats
// ==========================================

const mongoose = require('mongoose');

const siteStatsSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: 'global'           // singleton document
  },
  forecastsGenerated: {
    type: Number, default: 0    // total beach-level predictions (4 per day)
  },
  emailsSent: {
    type: Number, default: 0    // total emails delivered
  },
  dataPointsProcessed: {
    type: Number, default: 0    // 6 factors × 4 beaches per day = 24
  },
  daysLive: {
    type: Number, default: 0    // incremented each cron run
  },
  launchDate: {
    type: Date, default: new Date('2026-02-14')
  },
  lastForecastDate: {
    type: String, default: null  // 'YYYY-MM-DD'
  }
}, {
  timestamps: true
});

/**
 * Increment stats after daily cron run
 * @param {number} beachCount — number of beaches forecasted
 * @param {number} emailCount — number of emails sent
 */
siteStatsSchema.statics.recordDailyRun = async function(beachCount, emailCount) {
  return this.findOneAndUpdate(
    { _id: 'global' },
    {
      $inc: {
        forecastsGenerated: beachCount,
        emailsSent: emailCount,
        dataPointsProcessed: beachCount * 12 * 11,  // 12 hourly forecasts × 11 fields per hour per beach
        daysLive: 1
      },
      $set: {
        lastForecastDate: new Date().toISOString().split('T')[0]
      }
    },
    { upsert: true, new: true }
  );
};

/**
 * Get current stats for the frontend
 */
siteStatsSchema.statics.getPublicStats = async function() {
  const stats = await this.findById('global').lean();
  if (!stats) {
    return {
      forecastsGenerated: 0,
      daysLive: 0,
      dataPointsProcessed: 0
    };
  }

  // Calculate consecutive days from launch
  const launch = stats.launchDate || new Date('2026-02-14');
  const now = new Date();
  const consecutiveDays = Math.max(stats.daysLive,
    Math.floor((now - launch) / (1000 * 60 * 60 * 24))
  );

  return {
    forecastsGenerated: stats.forecastsGenerated,
    consecutiveDays,
    dataPointsProcessed: stats.dataPointsProcessed,
    emailsSent: stats.emailsSent
  };
};

module.exports = mongoose.model('SiteStats', siteStatsSchema);