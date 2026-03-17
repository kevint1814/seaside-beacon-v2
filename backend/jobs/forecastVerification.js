// ==========================================
// Forecast Verification Job — MOS Data Collection
// v5.6: Runs daily at 7:30 AM IST (post-sunrise)
// Fetches observed 6 AM weather from Open-Meteo Archive API,
// compares against predicted values stored in DailyScore.
// ==========================================

const cron = require('node-cron');
const axios = require('axios');
const DailyScore = require('../models/DailyScore');
const ForecastVerification = require('../models/ForecastVerification');
const weatherService = require('../services/weatherService');
const { invalidateCache } = require('../services/forecastCalibration');

const OPENMETEO_PROXY = process.env.OPENMETEO_PROXY_URL || null;

/**
 * Fetch observed 6 AM IST weather from Open-Meteo Archive API.
 * Archive API provides reanalysis/ERA5 data — what actually happened.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {Promise<Object|null>} observed weather at 6 AM IST
 */
async function fetchObservedWeather(lat, lon, dateStr) {
  // Don't round coordinates for archive — each beach gets its own observed data
  // Archive API has no rate limiting concerns (historical data, less load)
  const baseUrl = OPENMETEO_PROXY
    ? `${OPENMETEO_PROXY.split('/forecast')[0]}/archive`
    : 'https://archive-api.open-meteo.com/v1/archive';

  try {
    const response = await axios.get(baseUrl, {
      params: {
        latitude: lat,
        longitude: lon,
        start_date: dateStr,
        end_date: dateStr,
        hourly: 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,visibility,wind_speed_10m,pressure_msl',
        timezone: 'Asia/Kolkata'
      },
      timeout: 15000
    });

    const hourly = response.data?.hourly;
    if (!hourly?.time || hourly.time.length === 0) {
      console.log(`⚠️ MOS Archive: No hourly data for ${dateStr} at ${lat},${lon}`);
      return null;
    }

    // Find 6 AM IST index
    const target6AM = `${dateStr}T06:00`;
    const idx = hourly.time.findIndex(t => t.startsWith(target6AM));
    if (idx === -1) {
      console.log(`⚠️ MOS Archive: 6 AM slot not found in response for ${dateStr}`);
      return null;
    }

    // Extract observed values
    const visMeters = hourly.visibility?.[idx];
    const windMs = hourly.wind_speed_10m?.[idx];

    return {
      cloudCover:  hourly.cloud_cover?.[idx] ?? null,
      highCloud:   hourly.cloud_cover_high?.[idx] ?? null,
      midCloud:    hourly.cloud_cover_mid?.[idx] ?? null,
      lowCloud:    hourly.cloud_cover_low?.[idx] ?? null,
      humidity:    hourly.relative_humidity_2m?.[idx] ?? null,
      visibility:  visMeters != null ? Math.round(visMeters / 100) / 10 : null,   // meters → km (1 decimal)
      windSpeed:   windMs != null ? Math.round(windMs * 3.6 * 10) / 10 : null,    // m/s → km/h (1 decimal)
      pressureMsl: hourly.pressure_msl?.[idx] ?? null
    };
  } catch (err) {
    // Archive API might not have today's data ready yet
    if (err.response?.status === 400 || err.response?.status === 404) {
      console.log(`⏳ MOS Archive: Data not yet available for ${dateStr} — will retry`);
    } else {
      console.error(`⚠️ MOS Archive API error for ${dateStr}:`, err.message);
    }
    return null;
  }
}

/**
 * Extract predicted weather for a specific beach from DailyScore document.
 * Maps the breakdown structure to flat predicted values.
 */
function extractPredictedWeather(dailyScore, beachKey) {
  const beachData = dailyScore.beaches.find(b => b.beachKey === beachKey);
  if (!beachData) return null;

  const b = beachData.breakdown || {};
  const w = beachData.weather || {};

  return {
    cloudCover:   b.cloudCover?.value ?? w.cloudCover ?? null,
    highCloud:    b.highCloud ?? b.multiLevelCloud?.high ?? null,
    midCloud:     b.midCloud ?? b.multiLevelCloud?.mid ?? null,
    lowCloud:     b.lowCloud ?? b.multiLevelCloud?.low ?? null,
    humidity:     b.humidity?.value ?? w.humidity ?? null,
    visibility:   b.visibility?.value ?? w.visibility ?? null,
    windSpeed:    b.wind?.value ?? w.windSpeed ?? null,
    pressureMsl:  b.pressureTrend?.pressureMsl?.[b.pressureTrend?.pressureMsl?.length - 1] ?? null,  // Last value = 6 AM
    aod:          b.aod?.value ?? null,
    score:        beachData.score
  };
}

/**
 * Compute deltas: observed - predicted
 */
function computeDeltas(predicted, observed) {
  const deltas = {};
  const vars = ['cloudCover', 'highCloud', 'midCloud', 'lowCloud', 'humidity', 'visibility', 'windSpeed', 'pressureMsl'];

  for (const v of vars) {
    if (predicted[v] != null && observed[v] != null) {
      deltas[v] = Math.round((observed[v] - predicted[v]) * 100) / 100;
    } else {
      deltas[v] = null;
    }
  }

  return deltas;
}

/**
 * Main verification function — runs for all beaches.
 * Fetches observed data, compares with predictions, stores results.
 */
async function runVerification() {
  console.log('\n═══════════════════════════════════════');
  console.log('🔬 MOS FORECAST VERIFICATION — Post-Sunrise Data Collection');
  console.log('═══════════════════════════════════════');

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const beaches = weatherService.getBeaches();
  const allBeachKeys = beaches.map(b => b.key);

  // Find today's DailyScore (stored at 4 AM by email job)
  const dailyScore = await DailyScore.findOne({ date: today }).lean();
  if (!dailyScore) {
    console.log(`⚠️ MOS: No DailyScore found for ${today} — 4 AM job may not have run yet`);
    return { success: false, reason: 'no_daily_score', verified: 0, skipped: 0, failed: 0 };
  }

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const beach of beaches) {
    const beachKey = beach.key;

    try {
      // Check if already verified today
      const existing = await ForecastVerification.findOne({ date: today, beachKey }).lean();
      if (existing?.observed) {
        console.log(`✅ MOS ${beachKey}: already verified for ${today}`);
        skipCount++;
        continue;
      }

      // Extract predicted values from DailyScore
      const predicted = extractPredictedWeather(dailyScore, beachKey);
      if (!predicted) {
        console.log(`⚠️ MOS ${beachKey}: no prediction data in DailyScore for ${today}`);
        failCount++;
        continue;
      }

      // Fetch observed weather from Archive API
      const beachConfig = weatherService.BEACHES[beachKey];
      if (!beachConfig) {
        failCount++;
        continue;
      }

      const observed = await fetchObservedWeather(
        beachConfig.coordinates.lat,
        beachConfig.coordinates.lon,
        today
      );

      if (!observed) {
        // Archive data not ready — will be caught by retry at 8:30 AM
        failCount++;
        continue;
      }

      // Compute deltas
      const deltas = computeDeltas(predicted, observed);

      // Get current correction snapshot (if any active)
      let correctionSnapshot = null;
      try {
        const { getBeachCorrections } = require('../services/forecastCalibration');
        const corrections = await getBeachCorrections(beachKey);
        if (corrections) {
          correctionSnapshot = {
            strength: corrections.strength,
            daysOfData: corrections.daysOfData,
            factors: corrections.factors
          };
        }
      } catch (e) {
        // Calibration service not ready — that's fine
      }

      // Upsert into ForecastVerification
      await ForecastVerification.findOneAndUpdate(
        { date: today, beachKey },
        {
          date: today,
          beachKey,
          predicted,
          observed,
          deltas,
          correctionApplied: beachConfig.autoCalibrate && correctionSnapshot != null,
          correctionSnapshot,
          observedAt: new Date(),
          retryCount: existing ? (existing.retryCount || 0) + 1 : 0
        },
        { upsert: true, new: true }
      );

      // Invalidate calibration cache for this beach (new data available)
      invalidateCache(beachKey);

      const calLabel = beachConfig.autoCalibrate ? '🔧 auto-calibrate' : '📊 observe-only';
      console.log(`✅ MOS ${beachKey} (${calLabel}): cloud Δ${fmtDelta(deltas.cloudCover)}%, humidity Δ${fmtDelta(deltas.humidity)}%, vis Δ${fmtDelta(deltas.visibility)}km`);
      successCount++;
    } catch (err) {
      console.error(`⚠️ MOS ${beachKey}: verification failed —`, err.message);
      failCount++;
    }
  }

  console.log(`\n📊 MOS Verification complete: ${successCount} verified, ${skipCount} already done, ${failCount} failed`);
  return { success: true, verified: successCount, skipped: skipCount, failed: failCount };
}

/** Format delta with +/- sign */
function fmtDelta(val) {
  if (val == null) return 'N/A';
  return (val >= 0 ? '+' : '') + val.toFixed(1);
}

/**
 * Initialize the verification cron jobs.
 * Primary: 7:30 AM IST | Retry: 8:30 AM IST
 */
function initializeVerificationJob() {
  // Primary run — 7:30 AM IST daily
  cron.schedule('30 7 * * *', async () => {
    try {
      console.log('⏰ MOS verification job triggered (7:30 AM IST)');
      const result = await runVerification();

      // If some beaches failed (archive data not ready), retry picks them up at 8:30
      if (result.failed > 0) {
        console.log(`🔄 MOS: ${result.failed} beach(es) need retry — 8:30 AM attempt scheduled`);
      }
    } catch (err) {
      console.error('❌ MOS verification job crashed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Retry run — 8:30 AM IST (catches late archive data)
  cron.schedule('30 8 * * *', async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const allBeachKeys = weatherService.getBeachKeys();
      const verified = await ForecastVerification.countDocuments({
        date: today,
        'observed.cloudCover': { $ne: null }
      });

      if (verified < allBeachKeys.length) {
        console.log(`⏰ MOS retry triggered (8:30 AM IST) — ${allBeachKeys.length - verified} beach(es) pending`);
        await runVerification();
      }
    } catch (err) {
      console.error('❌ MOS retry job crashed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('🔬 MOS verification jobs initialized (7:30 AM + 8:30 AM retry IST)');
}

module.exports = {
  initializeVerificationJob,
  runVerification,
  fetchObservedWeather,
  extractPredictedWeather,
  computeDeltas
};
