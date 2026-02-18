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
    cloudCover:  { value: Number, score: Number },
    visibility:  { value: Number, score: Number },
    humidity:    { value: Number, score: Number },
    weather:     { value: Number, score: Number },
    wind:        { value: Number, score: Number },
    synergy:       Number,
    postRainBonus: Number
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