// ==========================================
// Email Jobs — Morning (4 AM) + Evening Preview (8:30 PM)
// Morning: definitive forecast + stores daily scores + updates stats
// Evening: simplified preview + persuasive 4 AM teaser
// ==========================================

const cron = require('node-cron');
const Subscriber = require('../models/Subscriber');
const DailyScore = require('../models/DailyScore');
const SiteStats = require('../models/SiteStats');
const weatherService = require('../services/weatherService');
const aiService = require('../services/aiService');
const emailService = require('../services/emailService');

const ALL_BEACHES = weatherService.getBeaches().map(b => b.key);

/**
 * Fetch weather for all beaches once — returns { marina: data, elliot: data, ... }
 * Used by both storeDailyScores and sendDailyPredictions to avoid duplicate API calls.
 */
async function fetchAllBeachWeather() {
  const allWeatherData = {};

  for (const beachKey of ALL_BEACHES) {
    try {
      const data = await weatherService.getTomorrow6AMForecast(beachKey);
      if (data.available) {
        allWeatherData[beachKey] = data;
      }
    } catch (err) {
      console.error(`⚠️  Could not fetch ${beachKey}:`, err.message);
    }
  }

  return allWeatherData;
}

/**
 * Store today's forecast data for all beaches
 * This runs regardless of subscriber count — we're building a dataset
 */
async function storeDailyScores(allWeatherData) {
  const today = new Date().toISOString().split('T')[0];

  // Idempotent — skip if already stored today
  const existing = await DailyScore.findOne({ date: today, citySlug: 'chennai' });
  if (existing) {
    console.log(`📊 Daily scores already stored for ${today}`);
    return existing;
  }

  console.log(`📊 Storing daily scores for ${today}...`);

  const beachScores = [];
  let bestBeach = null;
  let totalScore = 0;

  for (const [beachKey, data] of Object.entries(allWeatherData)) {
    try {
      const beachEntry = {
        beachKey: data.beachKey,
        beachName: data.beach,
        score: data.prediction.score,
        verdict: data.prediction.verdict,
        recommendation: data.prediction.recommendation,
        weather: {
          cloudCover: data.forecast.cloudCover,
          humidity: data.forecast.humidity,
          visibility: data.forecast.visibility,
          windSpeed: data.forecast.windSpeed,
          temperature: data.forecast.temperature,
          precipProbability: data.forecast.precipProbability,
          weatherDescription: data.forecast.weatherDescription
        },
        breakdown: {
          // v5 structured base factors
          cloudCover:     data.prediction.breakdown.cloudCover,
          multiLevelCloud:data.prediction.breakdown.multiLevelCloud,
          humidity:       data.prediction.breakdown.humidity,
          pressureTrend:  data.prediction.breakdown.pressureTrend,
          aod:            data.prediction.breakdown.aod,
          visibility:     data.prediction.breakdown.visibility,
          weather:        data.prediction.breakdown.weather,
          wind:           data.prediction.breakdown.wind,
          synergy:        data.prediction.breakdown.synergy || 0,
          postRainBonus:  data.prediction.breakdown.postRainBonus || 0,
          isPostRain:     data.prediction.breakdown.isPostRain || false,
          solarBonus:     data.prediction.breakdown.solarBonus || 0,
          // Denormalized for quick queries
          highCloud:      data.prediction.breakdown.highCloud ?? null,
          midCloud:       data.prediction.breakdown.midCloud ?? null,
          lowCloud:       data.prediction.breakdown.lowCloud ?? null
        }
      };

      beachScores.push(beachEntry);
      totalScore += data.prediction.score;

      if (!bestBeach || data.prediction.score > bestBeach.score) {
        bestBeach = { beachKey: data.beachKey, beachName: data.beach, score: data.prediction.score };
      }
    } catch (err) {
      console.error(`⚠️  Could not score ${beachKey}:`, err.message);
    }
  }

  if (beachScores.length === 0) {
    console.log('⚠️  No beach scores available — skipping daily store');
    return null;
  }

  const dailyScore = await DailyScore.create({
    date: today,
    citySlug: 'chennai',
    beaches: beachScores,
    bestBeach,
    averageScore: Math.round(totalScore / beachScores.length),
    metadata: { generatedAt: new Date(), weatherSource: 'AccuWeather+Open-Meteo', scoringVersion: 'v5.2' }
  });

  console.log(`✅ Stored ${beachScores.length} beach scores for ${today} (avg: ${dailyScore.averageScore}, best: ${bestBeach.beachName} ${bestBeach.score}/100)`);
  return dailyScore;
}

/**
 * Send daily predictions to all active subscribers
 *
 * Flow:
 *   1. Fetch weather for ALL beaches once (single set of API calls)
 *   2. Store daily scores from that data
 *   3. For each subscriber: pick their beach from cache, generate AI with full multi-beach context, send email
 *
 * This fixes two previous issues:
 *   - Weather is no longer re-fetched per subscriber (was wasting API calls)
 *   - AI now receives allWeatherData so emails include beach comparison
 */
async function sendDailyPredictions() {
  try {
    console.log('\n🌅 Starting daily email job...');

    // Step 1: Fetch all beach weather ONCE
    const allWeatherData = await fetchAllBeachWeather();
    const availableBeaches = Object.keys(allWeatherData);
    console.log(`🌊 Fetched weather for ${availableBeaches.length} beaches: ${availableBeaches.join(', ')}`);

    if (availableBeaches.length === 0) {
      console.log('⚠️  No beach weather available — skipping entire job');
      return;
    }

    // Step 2: Store daily scores (dataset collection)
    const dailyScore = await storeDailyScores(allWeatherData);
    const beachCount = dailyScore ? dailyScore.beaches.length : 0;

    // Step 3: Build beach name lookup (once, not per subscriber)
    const beachList = weatherService.getBeaches();
    const allBeachNames = {};
    beachList.forEach(b => { allBeachNames[b.key] = b.name; });

    // Step 4: Send emails to subscribers
    const subscribers = await Subscriber.find({ isActive: true });
    console.log(`📧 Found ${subscribers.length} active subscribers`);

    // Group subscribers by beach to generate AI insights once per beach
    const insightsCache = {};
    let emailCount = 0;

    for (const subscriber of subscribers) {
      try {
        const beachKey = subscriber.preferredBeach;
        const weatherData = allWeatherData[beachKey];

        if (!weatherData) {
          console.log(`⏰ Skipping ${subscriber.email} - no weather data for ${beachKey}`);
          continue;
        }

        // Attach beach name lookup for email template
        weatherData.allBeachNames = allBeachNames;

        // Generate AI insights once per beach, cache for other subscribers on same beach
        if (!insightsCache[beachKey]) {
          insightsCache[beachKey] = await aiService.generatePhotographyInsights(
            weatherData,
            allWeatherData  // ← FIX: pass all beaches so AI generates beach comparison
          );
        }

        await emailService.sendDailyPredictionEmail(
          subscriber.email,
          weatherData,
          insightsCache[beachKey]
        );

        subscriber.lastEmailSent = new Date();
        await subscriber.save();

        emailCount++;
        console.log(`✅ Email sent to ${subscriber.email}`);
      } catch (error) {
        console.error(`❌ Error for ${subscriber.email}:`, error.message);
        continue;
      }
    }

    // Step 5: Update site stats
    await SiteStats.recordDailyRun(beachCount, emailCount);
    console.log(`📈 Stats updated: +${beachCount} forecasts, +${emailCount} emails`);

    console.log('✅ Daily email job completed\n');
  } catch (error) {
    console.error('❌ Daily email job failed:', error.message);
  }
}

/**
 * Send evening preview emails at 8:30 PM IST
 *
 * Same weather-fetch flow as morning, but:
 * - Does NOT store daily scores (only morning does that — one score per day)
 * - Does NOT update subscriber.lastEmailSent (that tracks morning definitive emails)
 * - Uses sendEveningPreviewEmail() for purple theme + preview disclaimer
 */
async function sendEveningPreviews() {
  try {
    console.log('\n🌙 Starting evening preview email job...');

    // Step 1: Fetch all beach weather ONCE
    const allWeatherData = await fetchAllBeachWeather();
    const availableBeaches = Object.keys(allWeatherData);
    console.log(`🌊 Fetched weather for ${availableBeaches.length} beaches: ${availableBeaches.join(', ')}`);

    if (availableBeaches.length === 0) {
      console.log('⚠️  No beach weather available — skipping evening preview job');
      return;
    }

    // Step 2: Build beach name lookup
    const beachList = weatherService.getBeaches();
    const allBeachNames = {};
    beachList.forEach(b => { allBeachNames[b.key] = b.name; });

    // Step 3: Send previews to subscribers
    const subscribers = await Subscriber.find({ isActive: true });
    console.log(`📧 Found ${subscribers.length} active subscribers for evening preview`);

    const insightsCache = {};
    let emailCount = 0;

    for (const subscriber of subscribers) {
      try {
        const beachKey = subscriber.preferredBeach;
        const weatherData = allWeatherData[beachKey];

        if (!weatherData) {
          console.log(`⏰ Skipping ${subscriber.email} — no weather data for ${beachKey}`);
          continue;
        }

        weatherData.allBeachNames = allBeachNames;

        // Generate AI insights once per beach
        if (!insightsCache[beachKey]) {
          insightsCache[beachKey] = await aiService.generatePhotographyInsights(
            weatherData,
            allWeatherData
          );
        }

        await emailService.sendEveningPreviewEmail(
          subscriber.email,
          weatherData,
          insightsCache[beachKey]
        );

        emailCount++;
        console.log(`✅ Evening preview sent to ${subscriber.email}`);
      } catch (error) {
        console.error(`❌ Evening preview error for ${subscriber.email}:`, error.message);
        continue;
      }
    }

    // Update site stats (count evening emails too)
    await SiteStats.recordDailyRun(0, emailCount);  // 0 forecasts (already stored), just email count
    console.log(`📊 Evening preview: ${emailCount} emails sent`);
    console.log('✅ Evening preview job completed\n');
  } catch (error) {
    console.error('❌ Evening preview job failed:', error.message);
  }
}

/**
 * Initialize both email cron jobs:
 * - 4:00 AM IST: Definitive morning forecast (stores scores + sends emails)
 * - 8:30 PM IST: Evening preview (sends simplified preview emails)
 */
function initializeEmailJobs() {
  const TZ = { timezone: process.env.TIMEZONE || 'Asia/Kolkata' };

  // Morning definitive forecast
  const DAILY_EMAIL_TIME = process.env.DAILY_EMAIL_TIME || '04:00';
  const [dailyHour, dailyMin] = DAILY_EMAIL_TIME.split(':');
  cron.schedule(`${dailyMin} ${dailyHour} * * *`, sendDailyPredictions, TZ);
  console.log(`📅 Scheduled morning forecast emails at ${DAILY_EMAIL_TIME} IST`);

  // Evening preview
  const EVENING_TIME = process.env.EVENING_PREVIEW_TIME || '20:30';
  const [eveningHour, eveningMin] = EVENING_TIME.split(':');
  cron.schedule(`${eveningMin} ${eveningHour} * * *`, sendEveningPreviews, TZ);
  console.log(`🌙 Scheduled evening preview emails at ${EVENING_TIME} IST`);

  console.log(`✅ Both email jobs initialized successfully`);
}

// Keep old name as alias for backward compatibility
const initializeDailyEmailJob = initializeEmailJobs;

module.exports = {
  initializeDailyEmailJob,
  initializeEmailJobs,
  sendDailyPredictions,
  sendEveningPreviews,
  storeDailyScores
};