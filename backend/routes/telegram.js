// ==========================================
// Telegram Webhook Route
// POST /api/telegram/webhook — receives updates from Telegram
// ==========================================

const express = require('express');
const router = express.Router();
const telegramService = require('../services/telegramService');

/**
 * POST /api/telegram/webhook
 * Receives incoming messages from Telegram Bot API
 */
router.post('/telegram/webhook', async (req, res) => {
  try {
    // Process asynchronously — respond immediately to Telegram
    const update = req.body;
    setImmediate(() => {
      telegramService.processUpdate(update).catch(err => {
        console.error('Telegram update processing error:', err.message);
      });
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err.message);
    res.json({ ok: true }); // Always 200 to prevent retries
  }
});

module.exports = router;
