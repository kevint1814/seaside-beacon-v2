// ==========================================
// Email Jobs v2 — Premium-aware alert system
// 4:00 AM  — Morning forecast (everyone; premium gets photography)
// 7:00 PM  — Special 70+ alert (premium only)
// 8:30 PM  — Evening preview (premium only)
// ==========================================

const cron = require('node-cron');
const Subscriber = require('../models/Subscriber');
const PremiumUser = require('../models/PremiumUser');
const DailyScore = require('../models/DailyScore');
const SiteStats = require('../models/SiteStats');
const weatherService = require('../services/weatherService');
const aiService = require('../services/aiService');
const emailService = require('../services/emailService');
const telegramService = require('../services/telegramService');

const ALL_BEACHES = weatherService.getBeaches().map(b => b.key);

// Rate limiting: Brevo allows max 300 emails/day, ~5/second on free tier
// 250ms delay = 4 emails/sec = safe margin under the 5/sec limit
const EMAIL_DELAY_MS = parseInt(process.env.EMAIL_DELAY_MS) || 250;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch weather for all beaches once — returns { marina: data, elliot: data, ... }
 * Used by both storeDailyScores and sendDailyPredictions to avoid duplicate API calls.
 */
async function fetchAllBeachWeather() {
  const allWeatherData = {};

  for (const beachKey of ALL_BEACHES) {
    try {
      const data = await weatherService.getTomorrow6AMForecast(beachKey, { forceAvailable: true });
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
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

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
    metadata: { generatedAt: new Date(), weatherSource: 'AccuWeather+Open-Meteo', scoringVersion: 'v5.3' }
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
    const premiumUsers = await PremiumUser.getActiveUsers();
    const premiumEmails = new Set(premiumUsers.map(u => u.email));
    console.log(`📧 Found ${subscribers.length} active subscribers (${premiumEmails.size} premium)`);

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

        const isPremium = premiumEmails.has(subscriber.email);

        // Generate AI insights once per beach (needed for premium emails)
        if (!insightsCache[beachKey]) {
          try {
            insightsCache[beachKey] = await aiService.generatePhotographyInsights(
              weatherData,
              allWeatherData
            );
          } catch (aiErr) {
            console.warn(`⚠️  AI insights failed for ${beachKey}: ${aiErr.message}`);
            insightsCache[beachKey] = null; // continue without AI insights
          }
        }

        // Premium users get enhanced email with photography insights
        // Free users get basic forecast only (no photography)
        await emailService.sendDailyPredictionEmail(
          subscriber.email,
          weatherData,
          isPremium ? insightsCache[beachKey] : null,  // Photography gated
          isPremium
        );

        subscriber.lastEmailSent = new Date();
        await subscriber.save();

        emailCount++;
        console.log(`✅ Email sent to ${subscriber.email}${isPremium ? ' (premium)' : ''}`);

        // Rate limit: pause between sends to stay under Brevo's per-second limit
        if (emailCount < subscribers.length) await delay(EMAIL_DELAY_MS);
      } catch (error) {
        console.error(`❌ Error for ${subscriber.email}:`, error.message);
        continue;
      }
    }

    // Step 5: Send to premium users who are NOT in the Subscriber collection
    // (Premium users who ARE subscribers already got their email above with isPremium=true)
    const subscriberEmails = new Set(subscribers.map(s => s.email));
    const premiumOnlyUsers = premiumUsers.filter(u => !subscriberEmails.has(u.email));

    if (premiumOnlyUsers.length > 0) {
      console.log(`📧 Sending to ${premiumOnlyUsers.length} premium-only users (not in subscriber list)`);
      for (const premiumUser of premiumOnlyUsers) {
        try {
          const beachKey = premiumUser.preferredBeach || 'marina';
          const weatherData = allWeatherData[beachKey];

          if (!weatherData) {
            console.log(`⏰ Skipping premium-only ${premiumUser.email} — no weather for ${beachKey}`);
            continue;
          }

          weatherData.allBeachNames = allBeachNames;

          // Generate AI insights if not cached yet for this beach
          if (!insightsCache[beachKey]) {
            try {
              insightsCache[beachKey] = await aiService.generatePhotographyInsights(weatherData, allWeatherData);
            } catch (aiErr) {
              console.warn(`⚠️  AI insights failed for ${beachKey}: ${aiErr.message}`);
              insightsCache[beachKey] = null;
            }
          }

          await emailService.sendDailyPredictionEmail(
            premiumUser.email,
            weatherData,
            insightsCache[beachKey],  // Premium always gets AI insights
            true                       // isPremium = true
          );

          emailCount++;
          console.log(`✅ Email sent to ${premiumUser.email} (premium-only)`);
          if (emailCount < subscribers.length + premiumOnlyUsers.length) await delay(EMAIL_DELAY_MS);
        } catch (error) {
          console.error(`❌ Error for premium-only ${premiumUser.email}:`, error.message);
          continue;
        }
      }
    }

    // Step 6: Send Telegram alerts to premium users (non-blocking)
    // Pass insightsCache so Telegram gets the same AI content as emails
    telegramService.sendDailyTelegramAlerts(allWeatherData, insightsCache).catch(err => {
      console.error('❌ Telegram daily alerts failed:', err.message);
    });

    // Step 7: Update site stats
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
/**
 * Send evening preview emails — respects each premium user's chosen time.
 *
 * Runs every 30 minutes from 6 PM to 10 PM. Each run checks the current IST time
 * and sends only to users whose eveningPreviewTime falls within this 30-min window.
 * Default is 20:30 for users who haven't customised their time.
 *
 * Example: cron fires at 20:00 → sends to users with time 20:00–20:29
 *          cron fires at 20:30 → sends to users with time 20:30–20:59 (default slot)
 */
async function sendEveningPreviews() {
  try {
    // Determine current IST time slot (the 30-min window this run covers)
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const slotHour = nowIST.getHours();
    const slotMin = nowIST.getMinutes() < 30 ? 0 : 30;
    const slotStart = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;
    const slotEndMin = slotMin + 29;
    const slotEnd = `${String(slotHour).padStart(2, '0')}:${String(slotEndMin).padStart(2, '0')}`;

    console.log(`\n🌙 Evening preview check — slot ${slotStart} to ${slotEnd} IST`);

    // Get all active premium users
    const allPremiumUsers = await PremiumUser.getActiveUsers();

    // Filter to users whose eveningPreviewTime falls in this slot
    const premiumUsers = allPremiumUsers.filter(u => {
      const userTime = u.eveningPreviewTime || '20:30';
      const [h, m] = userTime.split(':').map(Number);
      return h === slotHour && m >= slotMin && m <= slotEndMin;
    });

    if (premiumUsers.length === 0) {
      console.log(`⏰ No premium users scheduled for ${slotStart} slot — skipping`);
      return;
    }

    console.log(`📧 Found ${premiumUsers.length} premium users for ${slotStart} slot (of ${allPremiumUsers.length} total)`);

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

    const insightsCache = {};
    let emailCount = 0;

    for (const premiumUser of premiumUsers) {
      try {
        const beachKey = premiumUser.preferredBeach || 'marina';
        const weatherData = allWeatherData[beachKey];

        if (!weatherData) {
          console.log(`⏰ Skipping ${premiumUser.email} — no weather data for ${beachKey}`);
          continue;
        }

        weatherData.allBeachNames = allBeachNames;

        // Generate AI insights once per beach
        if (!insightsCache[beachKey]) {
          try {
            insightsCache[beachKey] = await aiService.generatePhotographyInsights(
              weatherData,
              allWeatherData
            );
          } catch (aiErr) {
            console.warn(`⚠️  AI insights failed for ${beachKey}: ${aiErr.message}`);
            insightsCache[beachKey] = null;
          }
        }

        await emailService.sendEveningPreviewEmail(
          premiumUser.email,
          weatherData,
          insightsCache[beachKey]
        );

        emailCount++;
        console.log(`✅ Evening preview sent to ${premiumUser.email} (${premiumUser.eveningPreviewTime || '20:30'})`);

        // Rate limit: pause between sends
        if (emailCount < premiumUsers.length) await delay(EMAIL_DELAY_MS);
      } catch (error) {
        console.error(`❌ Evening preview error for ${premiumUser.email}:`, error.message);
        continue;
      }
    }

    // Send evening Telegram previews only during the default 20:30 slot
    // (Telegram doesn't have per-user timing — send once at default time)
    if (slotStart === '20:30') {
      telegramService.sendEveningTelegramPreviews(allWeatherData, insightsCache).catch(err => {
        console.error('❌ Telegram evening previews failed:', err.message);
      });
    }

    // Update site stats
    await SiteStats.recordDailyRun(0, emailCount);
    console.log(`📊 Evening preview (${slotStart} slot): ${emailCount} emails sent`);
    console.log('✅ Evening preview job completed\n');
  } catch (error) {
    console.error('❌ Evening preview job failed:', error.message);
  }
}

/**
 * Send special 70+ score alert at 7 PM IST (premium only)
 * Only triggers if ANY beach scores 70+ tomorrow
 */
async function sendSpecialAlert() {
  try {
    console.log('\n🔔 Checking for 70+ special alert...');

    const allWeatherData = await fetchAllBeachWeather();
    const availableBeaches = Object.keys(allWeatherData);

    if (availableBeaches.length === 0) {
      console.log('⚠️  No weather data — skipping special alert');
      return;
    }

    // Find beaches scoring 70+
    const hotBeaches = [];
    for (const [beachKey, data] of Object.entries(allWeatherData)) {
      if (data.prediction?.score >= 70) {
        hotBeaches.push({
          beachKey,
          beachName: data.beach,
          score: data.prediction.score,
          verdict: data.prediction.verdict
        });
      }
    }

    if (hotBeaches.length === 0) {
      console.log('📊 No beaches scoring 70+ — no special alert needed');
      return;
    }

    console.log(`🔥 ${hotBeaches.length} beach(es) scoring 70+: ${hotBeaches.map(b => `${b.beachName} (${b.score})`).join(', ')}`);

    // Send to premium users only
    const premiumUsers = await PremiumUser.getActiveUsers();
    if (premiumUsers.length === 0) {
      console.log('⏰ No premium users — skipping special alert');
      return;
    }

    let emailCount = 0;
    const bestBeach = hotBeaches.sort((a, b) => b.score - a.score)[0];

    for (const user of premiumUsers) {
      try {
        await emailService.sendSpecialAlertEmail(user.email, bestBeach, hotBeaches);
        emailCount++;
        console.log(`✅ Special alert sent to ${user.email}`);
      } catch (err) {
        console.error(`❌ Special alert error for ${user.email}:`, err.message);
      }
    }

    console.log(`🔔 Special 70+ alert: ${emailCount} emails sent`);

    // Also send via Telegram — pass allWeatherData for conditions detail
    telegramService.sendSpecialTelegramAlert(bestBeach, hotBeaches, allWeatherData).catch(err => {
      console.error('❌ Telegram special alert failed:', err.message);
    });
  } catch (error) {
    console.error('❌ Special alert job failed:', error.message);
  }
}

/**
 * Initialize all email cron jobs:
 * - 4:00 AM IST: Morning forecast (everyone; premium gets photography)
 * - 7:00 PM IST: Special 70+ alert (premium only)
 * - 8:30 PM IST: Evening preview (premium only)
 */
function validateTimeFormat(timeStr, label) {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    console.error(`❌ Invalid ${label} format: "${timeStr}" — expected HH:MM (e.g. "04:00"). Falling back to default.`);
    return null;
  }
  const [h, m] = timeStr.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    console.error(`❌ Invalid ${label} time: "${timeStr}" — hour must be 0-23, minute 0-59. Falling back to default.`);
    return null;
  }
  return { hour: String(h).padStart(2, '0'), min: String(m).padStart(2, '0') };
}

function initializeEmailJobs() {
  const TZ = { timezone: process.env.TIMEZONE || 'Asia/Kolkata' };

  // Morning definitive forecast
  const DAILY_EMAIL_TIME = process.env.DAILY_EMAIL_TIME || '04:00';
  const dailyParsed = validateTimeFormat(DAILY_EMAIL_TIME, 'DAILY_EMAIL_TIME') || { hour: '04', min: '00' };
  cron.schedule(`${dailyParsed.min} ${dailyParsed.hour} * * *`, sendDailyPredictions, TZ);
  console.log(`📅 Scheduled morning forecast emails at ${dailyParsed.hour}:${dailyParsed.min} IST`);

  // Special 70+ alert at 7 PM (premium only)
  cron.schedule('0 19 * * *', sendSpecialAlert, TZ);
  console.log(`🔔 Scheduled special 70+ alert at 19:00 IST (premium only)`);

  // Evening preview — runs every 30 min from 6 PM to 10 PM IST
  // Each run checks which premium users have their eveningPreviewTime in the current slot
  // Default is 20:30 for users who haven't customised their time
  cron.schedule('0,30 18-21 * * *', sendEveningPreviews, TZ);
  console.log(`🌙 Scheduled evening preview checks every 30 min (18:00–21:30 IST, per-user timing)`);

  console.log(`✅ All email jobs initialized successfully`);
}

// Keep old name as alias for backward compatibility
const initializeDailyEmailJob = initializeEmailJobs;

module.exports = {
  initializeDailyEmailJob,
  initializeEmailJobs,
  sendDailyPredictions,
  sendEveningPreviews,
  sendSpecialAlert,
  storeDailyScores
};