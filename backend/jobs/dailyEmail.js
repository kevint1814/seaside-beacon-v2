// ==========================================
// Daily Email Job - Automated 4 AM Predictions
// Now also stores daily scores + updates stats
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
          cloudCover:  { value: data.prediction.breakdown.cloudCover.value,  score: data.prediction.breakdown.cloudCover.score },
          visibility:  { value: data.prediction.breakdown.visibility.value,  score: data.prediction.breakdown.visibility.score },
          humidity:    { value: data.prediction.breakdown.humidity.value,    score: data.prediction.breakdown.humidity.score },
          weather:     { value: data.prediction.breakdown.weather.value,     score: data.prediction.breakdown.weather.score },
          wind:        { value: data.prediction.breakdown.wind.value,        score: data.prediction.breakdown.wind.score },
          synergy:     data.prediction.breakdown.synergy || 0,
          postRainBonus: data.prediction.breakdown.postRainBonus || 0
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
    metadata: { generatedAt: new Date(), weatherSource: 'AccuWeather' }
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
 * Initialize cron job
 */
function initializeDailyEmailJob() {
  const DAILY_EMAIL_TIME = process.env.DAILY_EMAIL_TIME || '04:00';
  const [hour, minute] = DAILY_EMAIL_TIME.split(':');

  const cronExpression = `${minute} ${hour} * * *`;

  cron.schedule(cronExpression, sendDailyPredictions, {
    timezone: process.env.TIMEZONE || 'Asia/Kolkata'
  });

  console.log(`📅 Scheduling daily emails at ${DAILY_EMAIL_TIME} IST`);
  console.log(`✅ Daily email job initialized successfully`);
}

module.exports = {
  initializeDailyEmailJob,
  sendDailyPredictions,
  storeDailyScores
};