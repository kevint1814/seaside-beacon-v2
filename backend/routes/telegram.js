// ==========================================
// Telegram Webhook Route
// POST /api/telegram/webhook — receives updates from Telegram
// Handles: linking, commands, AI chatbot for premium users
// ==========================================

const express = require('express');
const router = express.Router();
const chatbotService = require('../services/chatbotService');
const PremiumUser = require('../models/PremiumUser');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Per-user chatbot rate limiter: max 10 messages per 60 seconds
const _chatRateMap = new Map(); // chatId → { count, resetAt }
const CHAT_RATE_LIMIT = 10;
const CHAT_RATE_WINDOW = 60 * 1000; // 1 minute
function checkChatRateLimit(chatId) {
  const key = String(chatId);
  const now = Date.now();
  let entry = _chatRateMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + CHAT_RATE_WINDOW };
    _chatRateMap.set(key, entry);
  }
  entry.count++;
  return entry.count <= CHAT_RATE_LIMIT;
}
// Cleanup stale entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _chatRateMap.entries()) {
    if (now > v.resetAt) _chatRateMap.delete(k);
  }
}, 5 * 60 * 1000);

/**
 * POST /api/telegram/webhook
 * Receives incoming messages from Telegram Bot API
 */
router.post('/telegram/webhook', async (req, res) => {
  // Respond immediately — process async
  res.json({ ok: true });

  const update = req.body;
  setImmediate(async () => {
    try {
      const message = update.message;
      if (!message || !message.text) return;

      const text = message.text.trim();
      const chatId = message.chat.id;
      const userName = message.from?.first_name || '';

      // ─── 1. Handle 8-character hex link code ───
      if (/^[A-Fa-f0-9]{8}$/.test(text)) {
        await handleCodeLinking(chatId, text);
        return;
      }

      // ─── 2. Handle slash commands ───
      if (text.startsWith('/')) {
        await handleCommand(chatId, text, userName);
        return;
      }

      // ─── 3. AI Chatbot — only for linked premium users ───
      const user = await PremiumUser.findOne({ telegramChatId: chatId.toString() });

      if (!user) {
        // Not linked — prompt to link
        await sendTelegramMessage(chatId,
          '👋 You need to link your Seaside Beacon premium account first.\n\n' +
          'Send your 8-character link code from the website, or use:\n' +
          '<code>/start your@email.com</code>'
        );
        return;
      }

      if (user.status !== 'active') {
        await sendTelegramMessage(chatId,
          '☀️ The AI assistant is available for active premium subscribers.\n\n' +
          '<a href="https://www.seasidebeacon.com">Subscribe at seasidebeacon.com →</a>'
        );
        return;
      }

      // Premium user — route to AI chatbot (with rate limiting)
      if (!checkChatRateLimit(chatId)) {
        await sendTelegramMessage(chatId, '⏳ You\'re sending messages too quickly. Please wait a moment and try again.');
        return;
      }
      await sendTypingAction(chatId);
      const response = await chatbotService.chat(chatId, text, userName);
      await sendTelegramMessage(chatId, response);

    } catch (err) {
      console.error('Telegram update error:', err.message);
    }
  });
});

/**
 * Handle slash commands
 */
async function handleCommand(chatId, text, userName) {
  const cmd = text.split(' ')[0].toLowerCase();

  switch (cmd) {
    case '/start': {
      const parts = text.split(' ');
      const email = parts[1]?.toLowerCase().trim();

      // /start with email → link via email
      if (email && /^\S+@\S+\.\S+$/.test(email)) {
        const user = await PremiumUser.findOne({ email, status: 'active' });
        if (!user) {
          await sendTelegramMessage(chatId,
            '❌ No active premium account found for this email.\n\n' +
            'Make sure you have an active premium subscription at seasidebeacon.com'
          );
          return;
        }

        user.telegramChatId = String(chatId);
        user.telegramLinkedAt = new Date();
        await user.save();

        await sendTelegramMessage(chatId,
          `🎉 <b>Account linked!</b>\n\n` +
          `Email: ${user.email}\n` +
          `Plan: ${user.plan === 'annual' ? '₹399/year' : '₹49/month'}\n\n` +
          `You now have:\n` +
          `• 🔔 Instant alerts for 70+ mornings\n` +
          `• 🌅 Daily forecasts at 4 AM & 8:30 PM\n` +
          `• 💬 <b>AI sunrise assistant</b> — just type any question!\n\n` +
          `Commands: /forecast · /status · /help · /unlink`
        );
        console.log(`📱 Telegram email-linked: ${email} → chat ${chatId}`);
        return;
      }

      // Plain /start → welcome message
      const user = await PremiumUser.findOne({ telegramChatId: chatId.toString(), status: 'active' });
      if (user) {
        await sendTelegramMessage(chatId,
          `☀️ <b>Welcome back, ${userName || user.name || 'sunrise chaser'}!</b>\n\n` +
          `Your account is linked and active.\n\n` +
          `💬 <b>Ask me anything</b> — I'm your sunrise & photography assistant. Try:\n` +
          `• "How does tomorrow's sunrise look?"\n` +
          `• "Best camera settings for sunrise?"\n` +
          `• "What is golden hour?"\n` +
          `• "Which beach is best this week?"\n\n` +
          `Commands:\n` +
          `/forecast — Quick forecast for all beaches\n` +
          `/status — Your account info\n` +
          `/help — All commands\n` +
          `/unlink — Disconnect account`
        );
      } else {
        await sendTelegramMessage(chatId,
          '☀️ <b>Welcome to Seaside Beacon!</b>\n\n' +
          'India\'s first native sunrise quality forecaster for Chennai beaches.\n\n' +
          '<b>To get started:</b>\n' +
          '1. Send your 8-character link code from the website\n' +
          '2. Or use: <code>/start your@email.com</code>\n\n' +
          'Once linked, you\'ll get:\n' +
          '• 🔔 Alerts for 70+ score mornings\n' +
          '• 💬 AI sunrise assistant (ask anything!)\n' +
          '• 🌅 Daily forecasts at 4 AM & 8:30 PM\n\n' +
          '<a href="https://www.seasidebeacon.com">Visit seasidebeacon.com →</a>'
        );
      }
      return;
    }

    case '/help': {
      await sendTelegramMessage(chatId,
        '☀️ <b>Seaside Beacon Bot — Commands</b>\n\n' +
        '/forecast — Tomorrow\'s scores for all beaches\n' +
        '/status — Your account & subscription info\n' +
        '/unlink — Disconnect your account\n' +
        '/help — This message\n\n' +
        '💬 <b>AI Assistant</b>\n' +
        'Just type any question naturally:\n' +
        '• "How will tomorrow\'s sunrise look?"\n' +
        '• "What does 45% cloud cover mean?"\n' +
        '• "Best settings for phone photography?"\n' +
        '• "Why is AOD important for sunrises?"\n' +
        '• "Marina vs Elliot\'s — which is better?"\n\n' +
        'I have real-time access to all forecast data and deep knowledge about sunrise photography.'
      );
      return;
    }

    case '/forecast': {
      const user = await PremiumUser.findOne({ telegramChatId: chatId.toString(), status: 'active' });
      if (!user) {
        await sendTelegramMessage(chatId, '🔒 /forecast is for linked premium users. Link your account first!');
        return;
      }

      await sendTypingAction(chatId);

      // Fetch all beaches
      const beaches = ['marina', 'elliot', 'covelong', 'thiruvanmiyur'];
      const lines = ['🌅 <b>Tomorrow\'s Sunrise Forecast</b>\n'];
      let bestBeach = null;
      let bestScore = 0;

      for (const key of beaches) {
        try {
          const data = await require('../services/weatherService').getTomorrow6AMForecast(key, { forceAvailable: true });
          if (data && data.available) {
            const s = data.prediction.score;
            const emoji = s >= 70 ? '🔥' : s >= 55 ? '🌤' : s >= 40 ? '☁️' : '🌫';
            lines.push(`${emoji} <b>${data.beach}</b> — ${s}/100`);
            lines.push(`   ${data.prediction.verdict}`);
            if (data.goldenHour) lines.push(`   ✦ Golden hour: ${data.goldenHour.start} – ${data.goldenHour.end}`);
            lines.push('');
            if (s > bestScore) { bestScore = s; bestBeach = data.beach; }
          }
        } catch (e) { /* skip */ }
      }

      if (bestBeach && bestScore >= 60) {
        lines.push(`📸 <b>Recommendation:</b> Head to ${bestBeach} — best conditions tomorrow.`);
      } else if (bestBeach) {
        lines.push(`📸 Mixed conditions tomorrow. ${bestBeach} looks most promising at ${bestScore}/100.`);
      }

      lines.push('\n<a href="https://www.seasidebeacon.com">Full forecast on web →</a>');
      await sendTelegramMessage(chatId, lines.join('\n'));
      return;
    }

    case '/status': {
      const user = await PremiumUser.findOne({ telegramChatId: chatId.toString() });
      if (user) {
        const planLabel = user.plan === 'annual' ? '₹399/year' : '₹49/month';
        const beach = user.preferredBeach || 'Not set';
        const linked = user.telegramLinkedAt
          ? user.telegramLinkedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'Unknown';
        await sendTelegramMessage(chatId,
          `✅ <b>Account Linked</b>\n\n` +
          `Email: ${user.email}\n` +
          `Plan: ${planLabel} (${user.status})\n` +
          `Beach: ${beach}\n` +
          `Linked: ${linked}\n\n` +
          `You receive: alerts, forecasts & AI assistant access.`
        );
      } else {
        await sendTelegramMessage(chatId, '❌ No account linked. Send your link code or /start your@email.com');
      }
      return;
    }

    case '/unlink': {
      const user = await PremiumUser.findOne({ telegramChatId: chatId.toString() });
      if (user) {
        user.telegramChatId = null;
        user.telegramLinkedAt = null;
        await user.save();
        await sendTelegramMessage(chatId, '👋 Account unlinked. You won\'t receive alerts or AI chat anymore.\n\nSend a link code anytime to reconnect.');
        console.log(`📱 Telegram unlinked: ${user.email}`);
      } else {
        await sendTelegramMessage(chatId, 'No account is linked to this chat.');
      }
      return;
    }

    default: {
      // Unknown command — treat as AI chat if linked
      const user = await PremiumUser.findOne({ telegramChatId: chatId.toString(), status: 'active' });
      if (user) {
        if (!checkChatRateLimit(chatId)) {
          await sendTelegramMessage(chatId, '⏳ You\'re sending messages too quickly. Please wait a moment.');
          return;
        }
        await sendTypingAction(chatId);
        const response = await chatbotService.chat(chatId, text, userName);
        await sendTelegramMessage(chatId, response);
      } else {
        await sendTelegramMessage(chatId, `Unknown command. Try /help for available commands.`);
      }
      return;
    }
  }
}

/**
 * Handle linking via 8-character hex code
 */
async function handleCodeLinking(chatId, code) {
  try {
    const codeUpper = code.toUpperCase();

    // Use regex to match first 8 chars of authToken in DB (avoids loading all users)
    const regex = new RegExp('^' + codeUpper, 'i');
    const matchedUser = await PremiumUser.findOne({
      status: 'active',
      authToken: { $regex: regex }
    });

    if (matchedUser) {
      // Atomic: unlink any other account tied to this chatId, then link this one
      await PremiumUser.updateMany(
        { telegramChatId: chatId.toString(), _id: { $ne: matchedUser._id } },
        { $set: { telegramChatId: null, telegramLinkedAt: null } }
      );

      // Atomic findOneAndUpdate to avoid race conditions
      await PremiumUser.findOneAndUpdate(
        { _id: matchedUser._id },
        { $set: { telegramChatId: chatId.toString(), telegramLinkedAt: new Date() } }
      );

      await sendTelegramMessage(chatId,
        `🎉 <b>Account linked successfully!</b>\n\n` +
        `Email: ${matchedUser.email}\n` +
        `Plan: ${matchedUser.plan === 'annual' ? '₹399/year' : '₹49/month'}\n\n` +
        `You now have:\n` +
        `• 🔔 Instant alerts for 70+ mornings\n` +
        `• 🌅 Daily forecasts at 4 AM & 8:30 PM\n` +
        `• 💬 <b>AI sunrise assistant</b> — just type any question!\n\n` +
        `Try: "How does tomorrow's sunrise look?"\n\n` +
        `Commands: /forecast · /status · /help · /unlink`
      );

      console.log(`✅ Telegram code-linked: ${matchedUser.email} → chat ${chatId}`);
    } else {
      await sendTelegramMessage(chatId,
        '❌ Invalid code. Make sure you:\n\n' +
        '1. Have an active premium subscription\n' +
        '2. Are logged in on the website\n' +
        '3. Copied the code from Settings → Telegram\n\n' +
        'Or use: <code>/start your@email.com</code>'
      );
    }
  } catch (err) {
    console.error('Code linking error:', err.message);
    await sendTelegramMessage(chatId, '⚠️ Something went wrong. Please try again.');
  }
}

/**
 * Send typing indicator
 */
async function sendTypingAction(chatId) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });
  } catch (e) { /* non-critical */ }
}

/**
 * Split long text into chunks at paragraph/line boundaries
 */
function splitMessage(text, maxLen) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to split at last double-newline within limit
    let splitAt = remaining.lastIndexOf('\n\n', maxLen);
    // Fallback: split at last single newline
    if (splitAt <= 0) splitAt = remaining.lastIndexOf('\n', maxLen);
    // Last resort: split at space
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', maxLen);
    // Absolute fallback: hard cut
    if (splitAt <= 0) splitAt = maxLen;

    chunks.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Send message via Telegram Bot API
 * Automatically splits messages exceeding Telegram's 4096-char limit
 */
async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set');
    return;
  }

  // Telegram has a 4096-char limit per message — split if needed
  const MAX_LEN = 4000; // leave room for safety
  if (text.length > MAX_LEN) {
    const chunks = splitMessage(text, MAX_LEN);
    for (const chunk of chunks) {
      await sendTelegramMessage(chatId, chunk);
    }
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram send failed:', data.description);
      // If HTML parse fails, retry without parse_mode
      if (data.description?.includes('parse')) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: text.replace(/<[^>]+>/g, '') })
        });
      }
    }
  } catch (err) {
    console.error('Telegram send error:', err.message);
  }
}

module.exports = router;
