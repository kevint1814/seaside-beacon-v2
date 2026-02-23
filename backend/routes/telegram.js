// ==========================================
// Telegram Webhook Route
// POST /api/telegram/webhook — receives updates from Telegram
// ==========================================

const express = require('express');
const router = express.Router();
const telegramService = require('../services/telegramService');
const PremiumUser = require('../models/PremiumUser');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * POST /api/telegram/webhook
 * Receives incoming messages from Telegram Bot API
 * Handles both existing email-based linking and new code-based linking
 */
router.post('/telegram/webhook', async (req, res) => {
  try {
    // Process asynchronously — respond immediately to Telegram
    const update = req.body;
    setImmediate(async () => {
      try {
        // First, check if this is a code-based link attempt
        const message = update.message;
        if (message && message.text) {
          const text = message.text.trim();
          const chatId = message.chat.id;

          // Handle 8-character hex code (first 8 chars of auth token)
          if (/^[A-Fa-f0-9]{8}$/.test(text)) {
            await handleCodeLinking(chatId, text);
            return;
          }

          // Handle /start command
          if (text === '/start') {
            await sendTelegramMessage(chatId,
              '☀️ <b>Welcome to Seaside Beacon!</b>\n\n' +
              'To link your premium account, choose one of:\n\n' +
              '<b>Option 1: Link Code</b>\n' +
              'Send your 8-character link code from your account settings\n\n' +
              '<b>Option 2: Email</b>\n' +
              '<code>/start your@email.com</code>\n\n' +
              '<a href="https://www.seasidebeacon.com">Go to dashboard →</a>'
            );
            return;
          }

          // Handle /status command
          if (text === '/status') {
            const user = await PremiumUser.findOne({ telegramChatId: chatId.toString() });
            if (user) {
              await sendTelegramMessage(chatId,
                `✅ <b>Account Linked</b>\n\n` +
                `Email: ${user.email}\n` +
                `Plan: ${user.plan === 'annual' ? '₹399/year' : '₹49/month'}\n` +
                `Beach: ${user.preferredBeach || 'Not set'}\n\n` +
                `You'll receive alerts for 70+ score mornings.`
              );
            } else {
              await sendTelegramMessage(chatId, '❌ No account linked. Send your link code or use /start your@email.com');
            }
            return;
          }

          // Handle /unlink command
          if (text === '/unlink') {
            const user = await PremiumUser.findOne({ telegramChatId: chatId.toString() });
            if (user) {
              user.telegramChatId = null;
              user.telegramLinkedAt = null;
              await user.save();
              await sendTelegramMessage(chatId, '👋 Account unlinked. You won\'t receive alerts anymore.');
            } else {
              await sendTelegramMessage(chatId, 'No account is linked to this chat.');
            }
            return;
          }
        }

        // Fall back to existing telegramService.processUpdate for email-based linking
        await telegramService.processUpdate(update);
      } catch (err) {
        console.error('Telegram update processing error:', err.message);
      }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err.message);
    res.json({ ok: true }); // Always 200 to prevent retries
  }
});

/**
 * Handle linking via 8-character hex code
 * Code is the first 8 characters of the user's auth token
 */
async function handleCodeLinking(chatId, code) {
  try {
    const codeUpper = code.toUpperCase();

    // Find user whose auth token starts with this code
    const users = await PremiumUser.find({
      status: 'active',
      authToken: { $exists: true, $ne: null }
    });

    const matchedUser = users.find(u =>
      u.authToken && u.authToken.substring(0, 8).toUpperCase() === codeUpper
    );

    if (matchedUser) {
      // Check if this Telegram is already linked to another account
      const existing = await PremiumUser.findOne({ telegramChatId: chatId.toString() });
      if (existing && existing.email !== matchedUser.email) {
        existing.telegramChatId = null;
        existing.telegramLinkedAt = null;
        await existing.save();
      }

      matchedUser.telegramChatId = chatId.toString();
      matchedUser.telegramLinkedAt = new Date();
      await matchedUser.save();

      await sendTelegramMessage(chatId,
        `🎉 <b>Account linked successfully!</b>\n\n` +
        `Email: ${matchedUser.email}\n` +
        `Plan: ${matchedUser.plan === 'annual' ? '₹399/year' : '₹49/month'}\n\n` +
        `You'll now receive:\n` +
        `• 🔔 Instant alerts for 70+ score mornings\n` +
        `• 🌅 Evening previews at 8:30 PM\n` +
        `• ☀️ Morning forecasts at 4:00 AM\n\n` +
        `Commands:\n` +
        `/status — Check your account\n` +
        `/unlink — Disconnect this account`
      );

      console.log(`✅ Telegram code-linked: ${matchedUser.email} → chat ${chatId}`);
    } else {
      await sendTelegramMessage(chatId,
        '❌ Invalid code. Make sure you:\n\n' +
        '1. Have an active premium subscription\n' +
        '2. Are logged in on the website\n' +
        '3. Copied the code from your account settings\n\n' +
        'The code is shown in the Telegram linking section.\n\n' +
        'Or use: <code>/start your@email.com</code>'
      );
    }
  } catch (err) {
    console.error('Code linking error:', err.message);
    await sendTelegramMessage(chatId, '⚠️ Something went wrong. Please try again.');
  }
}

/**
 * Send message via Telegram Bot API
 */
async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set');
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.error('Telegram send error:', err.message);
  }
}

module.exports = router;
