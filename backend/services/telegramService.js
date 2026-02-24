// ==========================================
// Telegram Bot Service v2
// Handles: daily alerts, 70+ special alerts, evening previews
// Messages match email content — same data, same insights
// Uses raw Bot API (no library needed)
// ==========================================

const PremiumUser = require('../models/PremiumUser');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const APP_URL = process.env.APP_URL || 'https://www.seasidebeacon.com';

// ─── Helpers ──────────────────────────────────

/**
 * Send a message to a specific Telegram chat
 */
async function sendMessage(chatId, text, options = {}) {
  if (!BOT_TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — skipping message');
    return null;
  }

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || 'HTML',
    disable_web_page_preview: true
  };

  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  // If HTML parse fails, retry as plain text
  if (!data.ok && payload.parse_mode === 'HTML') {
    console.warn(`Telegram HTML parse failed, retrying plain: ${data.description}`);
    payload.parse_mode = undefined;
    payload.text = text.replace(/<[^>]+>/g, '');
    const retry = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const retryData = await retry.json();
    if (!retryData.ok) {
      console.error(`Telegram sendMessage failed: ${JSON.stringify(retryData)}`);
      throw new Error(retryData.description || 'Telegram API error');
    }
    return retryData.result;
  }

  if (!data.ok) {
    console.error(`Telegram sendMessage failed: ${JSON.stringify(data)}`);
    throw new Error(data.description || 'Telegram API error');
  }
  return data.result;
}

/**
 * Emoji by score
 */
function scoreEmoji(score) {
  if (score >= 85) return '🔥';
  if (score >= 70) return '🌅';
  if (score >= 55) return '☀️';
  if (score >= 40) return '☁️';
  return '🌫️';
}

/**
 * Recommendation line by score
 */
function recommendation(score) {
  if (score >= 70) return '✓ Worth the early alarm';
  if (score >= 55) return '~ Could surprise you';
  if (score >= 40) return '~ Soft colors possible';
  if (score >= 25) return '✗ Muted sunrise likely';
  return '— Sunrise likely not visible';
}

/**
 * Build conditions block (shared across all alert types)
 */
function conditionsBlock(forecast, prediction) {
  const { cloudCover, humidity, visibility, windSpeed, temperature } = forecast;
  const breakdown = prediction?.breakdown || {};

  const highCloud = breakdown?.multiLevelCloud?.high ?? breakdown?.highCloud ?? null;
  const midCloud = breakdown?.multiLevelCloud?.mid ?? breakdown?.midCloud ?? null;
  const lowCloud = breakdown?.multiLevelCloud?.low ?? breakdown?.lowCloud ?? null;
  const aodValue = breakdown?.aod?.value ?? null;
  const pressureTrend = breakdown?.pressureTrend?.value ?? null;

  const lines = [
    `☁️ Cloud: ${cloudCover}%  💧 Humidity: ${humidity}%`,
    `👁 Visibility: ${visibility} km  💨 Wind: ${windSpeed} km/h`,
    `🌡 Temperature: ${temperature}°C`
  ];

  // Cloud layers
  if (highCloud != null) {
    lines.push(`☁️ Layers — High: ${highCloud}%  Mid: ${midCloud ?? '—'}%  Low: ${lowCloud ?? '—'}%`);
  }

  // AOD
  if (aodValue != null) {
    const aodLabel = aodValue < 0.2 ? 'Very Clean' : aodValue < 0.4 ? 'Clean' : aodValue < 0.7 ? 'Hazy' : 'Polluted';
    lines.push(`🌬 Air Clarity: ${aodValue.toFixed(2)} (${aodLabel})`);
  }

  // Pressure trend
  if (pressureTrend != null) {
    const pLabel = pressureTrend > 0.5 ? '↑ Rising' : pressureTrend < -0.5 ? '↓ Falling' : '→ Stable';
    lines.push(`📊 Pressure: ${pLabel}`);
  }

  return lines.join('\n');
}

/**
 * Build golden hour block
 */
function goldenHourBlock(weatherData, photographyInsights) {
  const gh = photographyInsights?.goldenHour || weatherData.goldenHour;
  if (!gh || gh.start === 'N/A') return '';

  const sunriseTime = weatherData.sunTimes?.sunRise
    ? new Date(weatherData.sunTimes.sunRise).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
      })
    : null;

  const lines = [];
  if (sunriseTime) lines.push(`🌅 Sunrise: ${sunriseTime}`);
  lines.push(`🌄 Golden Hour: ${gh.start} – ${gh.end}`);
  lines.push(`✨ Peak Colors: ${gh.peak}`);

  return lines.join('\n');
}

// ─── Daily Forecast (4 AM) ──────────────────────

/**
 * Send daily forecast to all premium users with linked Telegram
 * Content mirrors the morning email — score, verdict, recommendation,
 * golden hour, AI insight, conditions, photography (premium)
 */
async function sendDailyTelegramAlerts(allWeatherData, insightsCache = {}) {
  const premiumUsers = await PremiumUser.find({
    status: 'active',
    telegramChatId: { $ne: null }
  });

  if (premiumUsers.length === 0) {
    console.log('📱 No Telegram-linked premium users');
    return 0;
  }

  let sentCount = 0;

  for (const user of premiumUsers) {
    try {
      const beachKey = user.preferredBeach || 'marina';
      const data = allWeatherData[beachKey];
      if (!data) continue;

      const { score, verdict } = data.prediction;
      const emoji = scoreEmoji(score);
      const rec = recommendation(score);
      const pi = insightsCache[beachKey] || {};

      // Build message
      const sections = [];

      // Header
      sections.push(`${emoji} <b>${data.beach} — ${score}/100</b>`);
      sections.push(`<i>${verdict}</i>`);
      sections.push(`${rec}`);

      // Golden hour
      const gh = goldenHourBlock(data, pi);
      if (gh) sections.push('', gh);

      // AI Insight
      if (pi.greeting || pi.insight) {
        sections.push('');
        if (pi.greeting) sections.push(`<b>${pi.greeting}</b>`);
        if (pi.insight) sections.push(pi.insight);
      }

      // What to expect
      const sunExp = pi.sunriseExperience || {};
      if (sunExp.whatYoullSee) {
        sections.push('', `🎨 <b>What you'll see:</b> ${sunExp.whatYoullSee}`);
      }
      if (sunExp.worthWakingUp) {
        sections.push(`⏰ <b>Worth waking up?</b> ${sunExp.worthWakingUp}`);
      }

      // Conditions
      sections.push('', `<b>━━ Conditions ━━</b>`);
      sections.push(conditionsBlock(data.forecast, data.prediction));

      // Best beach recommendation
      if (pi.beachComparison?.todaysBest) {
        const best = pi.beachComparison;
        sections.push('', `🏖 <b>Best beach today:</b> ${best.todaysBest}${best.reason ? ' — ' + best.reason : ''}`);
      }

      // Photography (premium — always include)
      const dslr = pi.dslr?.cameraSettings;
      if (dslr && score >= 40) {
        sections.push('', `📸 <b>Camera Settings</b>`);
        const camParts = [];
        if (dslr.iso) camParts.push(`ISO ${dslr.iso}`);
        if (dslr.shutterSpeed) camParts.push(`${dslr.shutterSpeed}`);
        if (dslr.aperture) camParts.push(`f/${dslr.aperture}`);
        if (dslr.whiteBalance) camParts.push(`WB: ${dslr.whiteBalance}`);
        sections.push(camParts.join(' · '));

        const tips = pi.dslr?.compositionTips || [];
        if (tips.length > 0) {
          sections.push(`💡 ${tips.slice(0, 2).join(' | ')}`);
        }
      }

      // Footer
      sections.push('', `<a href="${APP_URL}">View full forecast →</a>`);

      await sendMessage(user.telegramChatId, sections.join('\n'));
      sentCount++;
    } catch (err) {
      console.error(`❌ Telegram alert failed for ${user.email}:`, err.message);
    }
  }

  console.log(`📱 Telegram daily alerts: ${sentCount}/${premiumUsers.length} sent`);
  return sentCount;
}

// ─── Special 70+ Alert (7 PM) ──────────────────

/**
 * Send special 70+ alert via Telegram — matches email
 */
async function sendSpecialTelegramAlert(bestBeach, allHotBeaches, allWeatherData = {}) {
  const premiumUsers = await PremiumUser.find({
    status: 'active',
    telegramChatId: { $ne: null }
  });

  if (premiumUsers.length === 0) return 0;

  // Get full weather data for best beach if available
  const bestData = allWeatherData[bestBeach.beachKey];

  const others = allHotBeaches
    .filter(b => b.beachKey !== bestBeach.beachKey)
    .map(b => `${b.beachName} (${b.score})`)
    .join(', ');

  const sections = [];

  sections.push(`🔥 <b>SPECIAL ALERT — ${bestBeach.score}/100</b>`);
  sections.push('');
  sections.push(`<b>${bestBeach.beachName}</b> is scoring ${bestBeach.score} for tomorrow's sunrise.`);
  sections.push(`<i>${bestBeach.verdict}</i>`);

  if (others) {
    sections.push('');
    sections.push(`🏖 Also scoring 70+: ${others}`);
  }

  // Include conditions if we have weather data
  if (bestData) {
    sections.push('');
    sections.push(`<b>━━ Conditions ━━</b>`);
    sections.push(conditionsBlock(bestData.forecast, bestData.prediction));

    const gh = goldenHourBlock(bestData, {});
    if (gh) sections.push('', gh);
  }

  sections.push('');
  sections.push(`Tomorrow morning is looking exceptional. Worth the alarm.`);
  sections.push(`Full forecast with conditions breakdown arrives at 4:00 AM.`);
  sections.push('');
  sections.push(`<a href="${APP_URL}">View forecast →</a>`);

  const msg = sections.join('\n');

  let sentCount = 0;
  for (const user of premiumUsers) {
    try {
      await sendMessage(user.telegramChatId, msg);
      sentCount++;
    } catch (err) {
      console.error(`❌ Telegram special alert failed for ${user.email}:`, err.message);
    }
  }

  console.log(`📱 Telegram 70+ alert: ${sentCount}/${premiumUsers.length} sent`);
  return sentCount;
}

// ─── Evening Preview (8:30 PM) ──────────────────

/**
 * Send evening preview via Telegram — matches the purple-themed preview email
 * Premium only, per-user preferred beach
 */
async function sendEveningTelegramPreviews(allWeatherData, insightsCache = {}) {
  const premiumUsers = await PremiumUser.find({
    status: 'active',
    telegramChatId: { $ne: null }
  });

  if (premiumUsers.length === 0) {
    console.log('📱 No Telegram-linked premium users for evening preview');
    return 0;
  }

  let sentCount = 0;

  for (const user of premiumUsers) {
    try {
      const beachKey = user.preferredBeach || 'marina';
      const data = allWeatherData[beachKey];
      if (!data) continue;

      const { score, verdict } = data.prediction;
      const emoji = scoreEmoji(score);
      const pi = insightsCache[beachKey] || {};

      // Evening-specific recommendation
      let rec;
      if (score >= 70) rec = 'Looking promising — set that alarm';
      else if (score >= 55) rec = 'Could go either way — check the final forecast';
      else if (score >= 40) rec = 'Soft tones possible — weather may shift overnight';
      else if (score >= 25) rec = 'Muted sunrise likely — but surprises happen';
      else rec = 'Low expectations — check the 4 AM forecast';

      const sections = [];

      // Header
      sections.push(`🌙 <b>EVENING PREVIEW</b>`);
      sections.push('');
      sections.push(`${emoji} <b>${data.beach} — ${score}/100</b>`);
      sections.push(`<i>${verdict}</i>`);
      sections.push(`${rec}`);

      // Golden hour
      const gh = goldenHourBlock(data, pi);
      if (gh) sections.push('', gh);

      // AI Insight
      if (pi.greeting || pi.insight) {
        sections.push('');
        if (pi.greeting) sections.push(`<b>${pi.greeting}</b>`);
        if (pi.insight) sections.push(pi.insight);
      }

      // Conditions
      sections.push('', `<b>━━ Current Conditions ━━</b>`);
      sections.push(conditionsBlock(data.forecast, data.prediction));

      // Preview disclaimer
      sections.push('');
      sections.push(`⚠️ <i>This is an early estimate. The atmosphere reshuffles after midnight — your final forecast at 4:00 AM captures overnight shifts and is more accurate.</i>`);

      // Footer
      sections.push('', `<a href="${APP_URL}">Check full forecast →</a>`);

      await sendMessage(user.telegramChatId, sections.join('\n'));
      sentCount++;
    } catch (err) {
      console.error(`❌ Telegram evening preview failed for ${user.email}:`, err.message);
    }
  }

  console.log(`📱 Telegram evening previews: ${sentCount}/${premiumUsers.length} sent`);
  return sentCount;
}

// ─── Webhook & Setup ──────────────────────────

/**
 * Set webhook URL for the Telegram bot
 */
async function setWebhook(webhookUrl) {
  if (!BOT_TOKEN) return;
  const res = await fetch(`${API_BASE}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl })
  });
  const data = await res.json();
  console.log('📱 Telegram webhook set:', data.ok ? 'success' : data.description);
  return data;
}

module.exports = {
  sendMessage,
  sendDailyTelegramAlerts,
  sendSpecialTelegramAlert,
  sendEveningTelegramPreviews,
  setWebhook
};
