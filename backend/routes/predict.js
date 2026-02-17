// ==========================================
// Predict Routes v3
// ==========================================
// Added: trackPrediction() on each forecast request
// ==========================================

const express = require('express');
const router = express.Router();
const weatherService = require('../services/weatherService');
const aiService = require('../services/aiService');
const { trackPrediction } = require('../services/visitTracker');

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