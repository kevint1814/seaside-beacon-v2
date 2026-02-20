// ==========================================
// DailyScore Model - Historical Forecast Dataset
// Stores every day's predictions for all beaches
// ==========================================

const mongoose = require('mongoose');

const beachScoreSchema = new mongoose.Schema({
  beachKey:       { type: String, required: true },
  beachName:      { type: String, required: true },
  score:          { type: Number, required: true, min: 0, max: 100 },
  verdict:        { type: String, required: true },
  recommendation: { type: String, required: true, enum: ['GO', 'MAYBE', 'SKIP', 'NO'] },
  weather: {
    cloudCover:       Number,
    humidity:         Number,
    visibility:       Number,
    windSpeed:        Number,
    temperature:      Number,
    precipProbability:Number,
    weatherDescription:String
  },
  breakdown: {
    // v5 base factors (all promoted to base weights)
    cloudCover:     { value: Number, score: Number, maxScore: Number, lowStratusDiscount: Number },
    multiLevelCloud:{ high: Number, mid: Number, low: Number, score: Number, maxScore: Number },
    humidity:       { value: Number, score: Number, maxScore: Number },
    pressureTrend:  { value: Number, score: Number, maxScore: Number },
    aod:            { value: Number, score: Number, maxScore: Number },
    visibility:     { value: Number, score: Number, maxScore: Number },
    weather:        { value: Number, score: Number, maxScore: Number },
    wind:           { value: Number, score: Number, maxScore: Number },
    synergy:         Number,   // ±4
    postRainBonus:   Number,   // 0 or +5
    isPostRain:      Boolean,
    solarBonus:      Number,   // ±2 seasonal angle
    // Denormalized fields for quick queries
    highCloud:       Number,
    midCloud:        Number,
    lowCloud:        Number
  }
}, { _id: false });

const dailyScoreSchema = new mongoose.Schema({
  date: {
    type: String,          // 'YYYY-MM-DD' format for easy querying
    required: true,
    index: true
  },
  citySlug: {
    type: String,
    required: true,
    default: 'chennai'
  },
  beaches:   [beachScoreSchema],
  bestBeach: {
    beachKey:  String,
    beachName: String,
    score:     Number
  },
  averageScore: Number,    // city-wide average
  aiSummary:    String,    // optional: store the AI narrative for the best beach
  metadata: {
    generatedAt:  { type: Date, default: Date.now },
    weatherSource:{ type: String, default: 'AccuWeather' },
    aiModel:      String
  }
}, {
  timestamps: true
});

// Compound index: one entry per city per date
dailyScoreSchema.index({ date: 1, citySlug: 1 }, { unique: true });

module.exports = mongoose.model('DailyScore', dailyScoreSchema);