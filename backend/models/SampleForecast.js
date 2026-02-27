// ==========================================
// SampleForecast Model
// Stores the complete forecast response (weather + AI + photography)
// per beach, overwritten daily by the 4 AM email job.
// Used to show non-premium users a "yesterday's forecast" sample
// during the time-locked window (7 AM – 6 PM).
// ==========================================

const mongoose = require('mongoose');

const sampleForecastSchema = new mongoose.Schema({
  beachKey: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: String,       // 'YYYY-MM-DD' IST date when the forecast was generated
    required: true
  },
  // The full weather response from getTomorrow6AMForecast()
  weather: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // The full AI photography insights from generatePhotographyInsights()
  photography: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
});

// One document per beach — upsert overwrites daily
sampleForecastSchema.index({ beachKey: 1 }, { unique: true });

module.exports = mongoose.model('SampleForecast', sampleForecastSchema);
