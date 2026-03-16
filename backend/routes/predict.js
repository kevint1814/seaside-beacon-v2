// ==========================================
// Predict Routes v4
// ==========================================
// v3: trackPrediction() on each forecast request
// v4: Prediction-level cache (10-min TTL)
//     — weather + AI insights cached per beach
//     — eliminates duplicate API calls + AI provider hits
// ==========================================

const express = require('express');
const router = express.Router();
const weatherService = require('../services/weatherService');
const aiService = require('../services/aiService');
const { trackPrediction } = require('../services/visitTracker');
const metrics = require('../services/metricsCollector');
const { requirePremium } = require('./auth');

// ── Prediction-level cache ──────────────────────────
// Caches the FULL response (weather + AI) per beach.
// 10-min TTL — weather data doesn't change faster than this,
// and it saves both AccuWeather + AI provider API calls.
const PREDICTION_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const _predictionCache = {};

function getCachedPrediction(beachKey) {
  const cached = _predictionCache[beachKey];
  if (cached && (Date.now() - cached.cachedAt < PREDICTION_CACHE_TTL)) {
    return cached.data;
  }
  return null;
}

function cachePrediction(beachKey, data) {
  _predictionCache[beachKey] = { data, cachedAt: Date.now() };
}

// Cleanup stale cache entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const key in _predictionCache) {
    if (now - _predictionCache[key].cachedAt > PREDICTION_CACHE_TTL * 3) {
      delete _predictionCache[key];
    }
  }
}, 30 * 60 * 1000);

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
const SiteStats = require('../models/SiteStats');

/**
 * GET /api/stats
 * Returns live metrics from SiteStats (source of truth).
 * SiteStats is incremented by the daily cron job — scales
 * automatically as new beaches/cities are added.
 */
router.get('/stats', async (req, res) => {
  try {
    const siteStats = await SiteStats.getPublicStats();

    res.json({
      success: true,
      data: {
        forecastsGenerated: siteStats.forecastsGenerated,
        consecutiveDays: siteStats.consecutiveDays,
        dataPointsProcessed: siteStats.dataPointsProcessed,
        emailsSent: siteStats.emailsSent
      }
    });
  } catch (error) {
    console.error('Stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});
/**
 * GET /api/beaches
 */
router.get('/beaches', async (req, res) => {
  try {
    const beaches = weatherService.getBeaches();
    const regions = weatherService.getRegions();
    res.json({ success: true, data: beaches, regions });
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
 *
 * Optional premium check: if auth token provided, include
 * premium photography data (DSLR, mobile). Otherwise, strip it.
 */
router.get('/predict/:beach', async (req, res) => {
  try {
    const { beach } = req.params;
    const validBeaches = weatherService.getBeaches().map(b => b.key);
    if (!validBeaches.includes(beach)) {
      return res.status(400).json({ success: false, message: 'Invalid beach. Valid options: ' + validBeaches.join(', ') });
    }
    console.log(`\n📍 Prediction for: ${beach}`);

    // Track this forecast request (non-blocking)
    trackPrediction();
    metrics.trackRequest('predict');
    const _startTime = Date.now();

    // ── Optional premium check (don't require auth, just check if present) ──
    let isPremiumUser = false;
    const authToken = req.headers['x-auth-token'] || req.query.authToken;
    if (authToken) {
      try {
        const PremiumUser = require('../models/PremiumUser');
        const now = new Date();
        const premUser = await PremiumUser.findOne({
          authToken,
          authTokenExpiry: { $gt: now },
          $or: [
            { status: 'active' },
            { cancelledWithGrace: true, currentPeriodEnd: { $gt: now } }
          ]
        });
        if (premUser) isPremiumUser = true;
      } catch (e) {
        // Ignore auth errors on public endpoint
      }
    }

    // ── Check prediction-level cache first ──
    const cached = getCachedPrediction(beach);
    if (cached) {
      console.log(`⚡ Serving cached prediction for ${beach}`);
      metrics.trackPredictionCache(true);
      metrics.trackResponseTime(Date.now() - _startTime);

      // Strip premium data if not premium user
      const response = JSON.parse(JSON.stringify(cached)); // Deep clone
      if (!isPremiumUser && response.data?.photography) {
        delete response.data.photography.dslr;
        delete response.data.photography.mobile;
      }

      return res.json(response);
    }
    metrics.trackPredictionCache(false);

    // ── Fetch selected beach first (fail fast if unavailable) ──
    // Premium users bypass the 6 PM time restriction
    const primaryWeather = await weatherService.getTomorrow6AMForecast(beach, { forceAvailable: isPremiumUser });

    if (!primaryWeather.available) {
      const response = { success: true, data: { weather: primaryWeather, photography: null } };
      return res.json(response);
    }

    // ── Fetch other beaches sequentially (avoids Open-Meteo rate-limit bursts) ──
    const ALL_BEACHES = weatherService.getBeaches().map(b => b.key);
    const otherBeaches = ALL_BEACHES.filter(b => b !== beach);

    let allWeatherData = { [beach]: primaryWeather };

    for (const b of otherBeaches) {
      try {
        allWeatherData[b] = await weatherService.getTomorrow6AMForecast(b);
      } catch (e) {
        console.warn(`⚠️  Could not fetch ${b} weather:`, e.message);
      }
    }

    // ── Generate insights, passing real multi-beach data ─────
    const beachList = weatherService.getBeaches();
    const allBeachNames = {};
    beachList.forEach(b => { allBeachNames[b.key] = b.name; });
    primaryWeather.allBeachNames = allBeachNames;

    const photographyInsights = await aiService.generatePhotographyInsights(
      primaryWeather,
      allWeatherData
    );

    const response = {
      success: true,
      data: {
        weather: primaryWeather,
        photography: photographyInsights
      }
    };

    // ── Cache the full response ──
    cachePrediction(beach, response);
    metrics.trackResponseTime(Date.now() - _startTime);
    console.log(`💾 Cached prediction for ${beach} (TTL: ${PREDICTION_CACHE_TTL / 60000}min)`);

    // Strip premium data if not premium user — deep clone first to preserve cache
    if (!isPremiumUser && response.data?.photography) {
      const stripped = JSON.parse(JSON.stringify(response));
      delete stripped.data.photography.dslr;
      delete stripped.data.photography.mobile;
      return res.json(stripped);
    }

    res.json(response);
  } catch (error) {
    console.error('Prediction error:', error.message);
    metrics.trackRequestError();
    res.status(500).json({ success: false, message: error.message || 'Prediction failed' });
  }
});

/**
 * GET /api/forecast/7day/:beach
 * Premium-only — requires valid auth token
 * Returns 7-day scored forecast.
 */
router.get('/forecast/7day/:beach', requirePremium, async (req, res) => {
  try {
    const { beach } = req.params;
    console.log(`\n📅 7-day forecast request for: ${beach}`);

    const data = await weatherService.get7DayForecast(beach);

    res.json({ success: true, data });
  } catch (error) {
    console.error('7-day forecast error:', error.message);
    res.status(500).json({ success: false, message: error.message || '7-day forecast failed' });
  }
});

/**
 * GET /api/predict/sample/:beach
 * Public — returns yesterday's full forecast (weather + AI + photography)
 * for non-premium users to preview during the time-locked window.
 * Includes sample: true flag and sampleDate so frontend can label it clearly.
 */

// Sample forecast cache — one entry per beach, refreshed when date changes
const _sampleCache = {};

router.get('/predict/sample/:beach', async (req, res) => {
  try {
    const { beach } = req.params;
    const validBeaches = weatherService.getBeaches().map(b => b.key);
    if (!validBeaches.includes(beach)) {
      return res.status(400).json({ success: false, message: 'Invalid beach. Valid options: ' + validBeaches.join(', ') });
    }

    // Check in-memory cache first (date-keyed so it auto-expires daily)
    const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayStr = todayIST.toLocaleDateString('en-CA');
    const cacheKey = `${beach}_${todayStr}`;

    if (_sampleCache[cacheKey]) {
      return res.json(_sampleCache[cacheKey]);
    }

    const SampleForecast = require('../models/SampleForecast');
    const sample = await SampleForecast.findOne({ beachKey: beach });

    if (!sample) {
      return res.json({
        success: true,
        sample: true,
        sampleDate: null,
        data: null,
        message: 'No sample forecast available yet'
      });
    }

    const response = {
      success: true,
      sample: true,
      sampleDate: sample.date,
      data: {
        weather: sample.weather,
        photography: sample.photography
      }
    };

    // Cache until date rolls over
    _sampleCache[cacheKey] = response;

    // Clean old cache entries
    for (const key in _sampleCache) {
      if (!key.endsWith(`_${todayStr}`)) delete _sampleCache[key];
    }

    res.json(response);
  } catch (error) {
    console.error('Sample forecast error:', error.message);
    res.status(500).json({ success: false, message: error.message || 'Sample forecast failed' });
  }
});

module.exports = router;