// ==========================================
// Push Notification Jobs — Morning (4 AM) + Evening Preview (8:30 PM) IST
// Sends FCM topic messages to subscribed mobile devices
// ==========================================

const cron = require('node-cron');
const weatherService = require('../services/weatherService');
const { sendToTopic } = require('../services/firebaseAdmin');

const ALL_BEACHES = weatherService.getBeaches().map(b => b.key);
const BEACH_NAMES = {};
weatherService.getBeaches().forEach(b => { BEACH_NAMES[b.key] = b.name; });

/**
 * Get the best beach forecast (highest score) for the push notification.
 */
async function getBestBeachForecast() {
  let best = null;

  for (const beachKey of ALL_BEACHES) {
    try {
      const data = await weatherService.getTomorrow6AMForecast(beachKey, { forceAvailable: true });
      if (data.available && data.score != null) {
        if (!best || data.score > best.score) {
          best = {
            beach: beachKey,
            beachName: BEACH_NAMES[beachKey] || beachKey,
            score: data.score,
            verdict: data.verdict || '',
            recommendation: data.recommendation || ''
          };
        }
      }
    } catch (err) {
      console.error(`[Push] Error fetching ${beachKey}:`, err.message);
    }
  }

  return best;
}

/**
 * 4 AM IST — Morning forecast push
 * "Marina Beach: 78/100 — Amber Glow. GO catch this sunrise!"
 */
async function sendMorningPush() {
  console.log('[Push] Sending morning forecast notification...');

  try {
    const best = await getBestBeachForecast();
    if (!best) {
      console.log('[Push] No forecast data available — skipping morning push');
      return;
    }

    const title = `${best.beachName}: ${best.score}/100 — ${best.verdict}`;

    let body;
    if (best.recommendation === 'go') {
      body = `${best.recommendation.toUpperCase()} — this sunrise is worth the early alarm.`;
    } else if (best.recommendation === 'maybe') {
      body = `Worth a look if you're already up. Could surprise you.`;
    } else {
      body = `Not the best morning for a sunrise chase. Sleep in.`;
    }

    const result = await sendToTopic('morning_forecast', title, body, {
      beach: best.beach,
      score: String(best.score),
      type: 'morning'
    });

    console.log('[Push] Morning push result:', result);
  } catch (error) {
    console.error('[Push] Morning push failed:', error.message);
  }
}

/**
 * 8:30 PM IST — Evening preview push
 * "Tomorrow's sunrise preview: 82/100 at Covelong. Set your alarm?"
 */
async function sendEveningPush() {
  console.log('[Push] Sending evening preview notification...');

  try {
    const best = await getBestBeachForecast();
    if (!best) {
      console.log('[Push] No forecast data available — skipping evening push');
      return;
    }

    const title = `Tomorrow's sunrise: ${best.score}/100`;
    const body = best.score >= 70
      ? `${best.beachName} looks promising. Set your alarm for golden hour.`
      : best.score >= 40
        ? `${best.beachName} might deliver something. Worth keeping an eye on.`
        : `Low scores across the board. Maybe save the early alarm for another day.`;

    const result = await sendToTopic('evening_preview', title, body, {
      beach: best.beach,
      score: String(best.score),
      type: 'evening'
    });

    console.log('[Push] Evening push result:', result);
  } catch (error) {
    console.error('[Push] Evening push failed:', error.message);
  }
}

/**
 * Initialize push notification cron jobs.
 * Times are IST (UTC+5:30) — cron runs in server timezone,
 * so we use UTC equivalents: 4 AM IST = 22:30 UTC (prev day),
 * 8:30 PM IST = 15:00 UTC.
 */
function initializePushJobs() {
  // 4:00 AM IST = 22:30 UTC previous day
  cron.schedule('30 22 * * *', sendMorningPush, {
    timezone: 'Asia/Kolkata'
  });

  // 8:30 PM IST = 15:00 UTC
  cron.schedule('30 20 * * *', sendEveningPush, {
    timezone: 'Asia/Kolkata'
  });

  console.log('📱 Push notification jobs scheduled: 4:00 AM + 8:30 PM IST');
}

module.exports = { initializePushJobs, sendMorningPush, sendEveningPush };
