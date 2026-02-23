// ==========================================
// Telegram Bot Service
// Handles: /start linking, daily alerts, 70+ special alerts
// Uses raw Bot API (no library needed)
// ==========================================

const PremiumUser = require('../models/PremiumUser');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Send a message to a specific chat
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
  if (!data.ok) {
    console.error(`Telegram sendMessage failed: ${JSON.stringify(data)}`);
    throw new Error(data.description || 'Telegram API error');
  }
  return data.result;
}

/**
 * Send daily forecast to all premium users with linked Telegram
 */
async function sendDailyTelegramAlerts(allWeatherData) {
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

      const score = data.prediction.score;
      const verdict = data.prediction.verdict;
      const emoji = score >= 70 ? '🔥' : score >= 55 ? '🌅' : score >= 40 ? '🌤' : '☁️';

      const msg = [
        `${emoji} <b>${data.beach} — ${score}/100</b>`,
        `${verdict}`,
        '',
        `☁️ Cloud: ${data.forecast.cloudCover}%`,
        `💧 Humidity: ${data.forecast.humidity}%`,
        `🌡 ${data.forecast.temperature}°C | Wind: ${data.forecast.windSpeed} km/h`,
        data.sunTimes?.sunRise ? `🌅 Sunrise: ${new Date(data.sunTimes.sunRise).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : '',
        '',
        `<a href="https://www.seasidebeacon.com">View full forecast →</a>`
      ].filter(Boolean).join('\n');

      await sendMessage(user.telegramChatId, msg);
      sentCount++;
    } catch (err) {
      console.error(`❌ Telegram alert failed for ${user.email}:`, err.message);
    }
  }

  console.log(`📱 Telegram daily alerts: ${sentCount}/${premiumUsers.length} sent`);
  return sentCount;
}

/**
 * Send special 70+ alert via Telegram
 */
async function sendSpecialTelegramAlert(bestBeach, allHotBeaches) {
  const premiumUsers = await PremiumUser.find({
    status: 'active',
    telegramChatId: { $ne: null }
  });

  if (premiumUsers.length === 0) return 0;

  const others = allHotBeaches
    .filter(b => b.beachKey !== bestBeach.beachKey)
    .map(b => `${b.beachName} (${b.score})`)
    .join(', ');

  const msg = [
    `🔥 <b>SPECIAL ALERT — ${bestBeach.score}/100</b>`,
    '',
    `<b>${bestBeach.beachName}</b> is scoring ${bestBeach.score} for tomorrow's sunrise.`,
    `${bestBeach.verdict}`,
    '',
    others ? `Also 70+: ${others}` : '',
    '',
    `Tomorrow morning is looking exceptional. Worth the alarm.`,
    '',
    `<a href="https://www.seasidebeacon.com">View forecast →</a>`
  ].filter(Boolean).join('\n');

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

/**
 * Process incoming webhook update from Telegram
 * Handles /start command to link user account
 */
async function processUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // /start <email> — link Telegram to premium account
  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    const email = parts[1]?.toLowerCase().trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      await sendMessage(chatId,
        '👋 Welcome to <b>Seaside Beacon</b>!\n\n' +
        'To link your account, use:\n' +
        '<code>/start your@email.com</code>\n\n' +
        'Use the same email you signed up with on the website.'
      );
      return;
    }

    const user = await PremiumUser.findOne({ email, status: 'active' });
    if (!user) {
      await sendMessage(chatId,
        '❌ No active premium account found for this email.\n\n' +
        'Make sure you have an active premium subscription at seasidebeacon.com'
      );
      return;
    }

    user.telegramChatId = String(chatId);
    user.telegramLinkedAt = new Date();
    await user.save();

    await sendMessage(chatId,
      '✅ <b>Telegram linked!</b>\n\n' +
      'You\'ll receive:\n' +
      '• Daily forecast alerts\n' +
      '• Special 70+ morning alerts\n' +
      '• Evening previews\n\n' +
      '🌅 Your first alert arrives with the next scheduled forecast.'
    );

    console.log(`📱 Telegram linked: ${email} → chat ${chatId}`);
    return;
  }

  // /unlink — remove Telegram connection
  if (text === '/unlink') {
    const user = await PremiumUser.findOne({ telegramChatId: String(chatId) });
    if (user) {
      user.telegramChatId = null;
      user.telegramLinkedAt = null;
      await user.save();
      await sendMessage(chatId, '✅ Telegram unlinked. You won\'t receive alerts here anymore.');
      console.log(`📱 Telegram unlinked: ${user.email}`);
    } else {
      await sendMessage(chatId, 'No linked account found for this chat.');
    }
    return;
  }

  // /status — check connection status
  if (text === '/status') {
    const user = await PremiumUser.findOne({ telegramChatId: String(chatId) });
    if (user) {
      await sendMessage(chatId,
        `✅ <b>Connected</b>\n\n` +
        `Email: ${user.email}\n` +
        `Plan: ${user.plan}\n` +
        `Beach: ${user.preferredBeach}\n` +
        `Linked: ${user.telegramLinkedAt?.toLocaleDateString('en-IN') || 'Unknown'}`
      );
    } else {
      await sendMessage(chatId, 'No linked account. Use <code>/start your@email.com</code> to connect.');
    }
    return;
  }
}

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
  processUpdate,
  setWebhook
};
