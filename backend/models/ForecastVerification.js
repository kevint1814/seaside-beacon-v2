// ==========================================
// ForecastVerification Model — MOS Auto-Calibration Dataset
// Stores predicted vs observed weather per beach per day
// Used to compute rolling correction factors for non-Chennai beaches
// ==========================================

const mongoose = require('mongoose');

const forecastVerificationSchema = new mongoose.Schema({
  date: {
    type: String,           // 'YYYY-MM-DD' format (IST)
    required: true,
    index: true
  },
  beachKey: {
    type: String,
    required: true,
    index: true
  },

  // What we predicted at 4 AM (pulled from DailyScore)
  predicted: {
    cloudCover:   Number,   // %
    highCloud:    Number,   // %
    midCloud:     Number,   // %
    lowCloud:     Number,   // %
    humidity:     Number,   // %
    visibility:   Number,   // km
    windSpeed:    Number,   // km/h
    pressureMsl:  Number,   // hPa (6 AM value)
    aod:          Number,   // dimensionless
    score:        Number    // final sunrise score (0-100)
  },

  // What actually happened at 6 AM (Open-Meteo Archive/reanalysis)
  observed: {
    cloudCover:   Number,
    highCloud:    Number,
    midCloud:     Number,
    lowCloud:     Number,
    humidity:     Number,
    visibility:   Number,   // km (converted from meters)
    windSpeed:    Number,   // km/h (converted from m/s)
    pressureMsl:  Number    // hPa
    // No AOD — Archive API doesn't have air quality
  },

  // observed - predicted (auto-computed on save)
  deltas: {
    cloudCover:   Number,
    highCloud:    Number,
    midCloud:     Number,
    lowCloud:     Number,
    humidity:     Number,
    visibility:   Number,
    windSpeed:    Number,
    pressureMsl:  Number
  },

  // Was an auto-correction applied to this beach's score today?
  correctionApplied: { type: Boolean, default: false },

  // Snapshot of active correction factors (for audit trail)
  correctionSnapshot: {
    strength:     Number,   // 0-1 (confidence ramp-in)
    daysOfData:   Number,
    factors: {
      cloudCover:   Number,
      highCloud:    Number,
      midCloud:     Number,
      lowCloud:     Number,
      humidity:     Number,
      visibility:   Number,
      windSpeed:    Number,
      pressureMsl:  Number
    }
  },

  // Metadata
  observedAt:   { type: Date },   // when Archive API was queried
  retryCount:   { type: Number, default: 0 }
}, {
  timestamps: true
});

// One entry per beach per day
forecastVerificationSchema.index({ date: 1, beachKey: 1 }, { unique: true });

// Query: last N days for a beach (used by correction computation)
forecastVerificationSchema.index({ beachKey: 1, date: -1 });

module.exports = mongoose.model('ForecastVerification', forecastVerificationSchema);
