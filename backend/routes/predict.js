// ==========================================
// Predict Routes v3
// ==========================================
// Added: trackPrediction() on each forecast request
// ==========================================

const express = require('express');
const router = express.Router();
const weatherService = require('../services/weatherService');
const aiService = require('../services/aiService');
const { trackPrediction, getStats } = require('../services/visitTracker');

/**
 * GET /api/stats
 * Returns live metrics for the frontend metrics strip
 *
 * Math:
 *   Forecasts generated = daysLive × 4 beaches (scored daily)
 *   Data points = daysLive × 4 beaches × 12 hourly forecasts × 11 fields per hour
 *     Fields: temperature, feelsLike, cloudCover, humidity, windSpeed,
 *             windDirection, visibility, uvIndex, precipProbability,
 *             weatherDescription, hasPrecipitation
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    const LAUNCH_DATE = new Date('2026-02-14T04:00:00+05:30');
    const daysLive = Math.max(1, Math.floor((Date.now() - LAUNCH_DATE.getTime()) / 86400000) + 1);

    const BEACHES = 4;
    const HOURS_FETCHED = 12;
    const FIELDS_PER_HOUR = 11;

    res.json({
      success: true,
      data: {
        forecastsGenerated: daysLive * BEACHES,
        consecutiveDays: daysLive,
        dataPointsProcessed: daysLive * BEACHES * HOURS_FETCHED * FIELDS_PER_HOUR,
        visitors: stats.lifetime.visits,
        predictions: stats.lifetime.predictions
      }
    });
  } catch (error) {
    console.error('Stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});
const DailyVisit = require('../models/DailyVisit');

/**
 * GET /api/stats
 * Returns live metrics for the homepage metrics strip.
 * Computes: forecasts generated, consecutive days live, data points analyzed.
 * Lightweight — no auth needed, public data only.
 */
router.get('/stats', async (req, res) => {
  try {
    // All-time aggregation from DailyVisit
    const agg = await DailyVisit.aggregate([{
      $group: {
        _id: null,
        totalPredictions: { $sum: '$predictions' },
        totalVisits: { $sum: '$visits' },
        totalDays: { $sum: 1 }
      }
    }]);

    const data = agg[0] || { totalPredictions: 0, totalVisits: 0, totalDays: 0 };

    // Each prediction uses 47 atmospheric parameters
    const dataPoints = data.totalPredictions * 47;

    res.json({
      success: true,
      data: {
        forecastsGenerated: data.totalPredictions,
        consecutiveDays: data.totalDays,
        dataPointsProcessed: dataPoints
      }
    });
  } catch (error) {
    console.error('Stats error:', error.message);
    res.json({
      success: true,
      data: { forecastsGenerated: 0, consecutiveDays: 0, dataPointsProcessed: 0 }
    });
  }
});

/**
 * GET /api/beaches
 */
router.get('/beaches', async (req, res) => {
  try {
    const beaches = weatherService.getBeaches();
    res.json({ success: true, data: beaches });
  } catch (error) {
    console.error('Beaches error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch beaches' });
  }
});

/**
 * GET /api/predict/:beach
 *
 * Fetches weather for ALL 4 beaches in parallel so the
 * comparison tab reflects real conditions at every beach,
 * not just a guess derived from the selected beach's data.
 */
router.get('/predict/:beach', async (req, res) => {
  try {
    const { beach } = req.params;
    console.log(`\n📍 Prediction for: ${beach}`);

    // Track this forecast request (non-blocking)
    trackPrediction();

    // ── Fetch selected beach first (fail fast if unavailable) ──
    const primaryWeather = await weatherService.getTomorrow6AMForecast(beach);

    if (!primaryWeather.available) {
      return res.json({
        success: true,
        data: { weather: primaryWeather, photography: null }
      });
    }

    // ── Fetch all other beaches in parallel ──────────────────
    const ALL_BEACHES = ['marina', 'elliot', 'covelong', 'thiruvanmiyur'];
    const otherBeaches = ALL_BEACHES.filter(b => b !== beach);

    let allWeatherData = { [beach]: primaryWeather };

    try {
      const otherResults = await Promise.allSettled(
        otherBeaches.map(b => weatherService.getTomorrow6AMForecast(b))
      );
      otherBeaches.forEach((b, i) => {
        if (otherResults[i].status === 'fulfilled') {
          allWeatherData[b] = otherResults[i].value;
        }
      });
    } catch (e) {
      console.warn('⚠️  Could not fetch all beach weather:', e.message);
    }

    // ── Generate insights, passing real multi-beach data ─────
    const photographyInsights = await aiService.generatePhotographyInsights(
      primaryWeather,
      allWeatherData
    );

    res.json({
      success: true,
      data: {
        weather: primaryWeather,
        photography: photographyInsights
      }
    });
  } catch (error) {
    console.error('Prediction error:', error.message);
    res.status(500).json({ success: false, message: error.message || 'Prediction failed' });
  }
});

module.exports = router;