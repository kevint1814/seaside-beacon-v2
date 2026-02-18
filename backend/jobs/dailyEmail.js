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

const ALL_BEACHES = ['marina', 'elliot', 'covelong', 'thiruvanmiyur'];

/**
 * Store today's forecast data for all beaches
 * This runs regardless of subscriber count — we're building a dataset
 */
async function storeDailyScores() {
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

  for (const beachKey of ALL_BEACHES) {
    try {
      const data = await weatherService.getTomorrow6AMForecast(beachKey);
      if (!data.available) continue;

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
 */
async function sendDailyPredictions() {
  try {
    console.log('\n🌅 Starting daily email job...');

    // Step 1: Store daily scores (dataset collection)
    const dailyScore = await storeDailyScores();
    const beachCount = dailyScore ? dailyScore.beaches.length : 0;

    // Step 2: Send emails to subscribers
    const subscribers = await Subscriber.find({ isActive: true });
    console.log(`📧 Found ${subscribers.length} active subscribers`);

    let emailCount = 0;

    for (const subscriber of subscribers) {
      try {
        const weatherData = await weatherService.getTomorrow6AMForecast(subscriber.preferredBeach);
        if (!weatherData.available) {
          console.log(`⏰ Skipping ${subscriber.email} - predictions not available yet`);
          continue;
        }

        // Build beach name lookup from config for email template
        const allBeaches = weatherService.getBeaches();
        const allBeachNames = {};
        allBeaches.forEach(b => { allBeachNames[b.key] = b.name; });
        weatherData.allBeachNames = allBeachNames;

        const photographyInsights = await aiService.generatePhotographyInsights(weatherData);

        await emailService.sendDailyPredictionEmail(
          subscriber.email,
          weatherData,
          photographyInsights
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

    // Step 3: Update site stats
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