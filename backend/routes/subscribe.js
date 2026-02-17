// ==========================================
// Subscribe Routes v3
// ==========================================
// - Unsubscribe DELETES record from MongoDB
// - Tracks new subs + unsubs in DailyVisit
// - No per-event admin emails (digest at 8 AM)
// - Fixed return URL → seasidebeacon.com
// ==========================================

const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber');
const emailService = require('../services/emailService');
const { trackNewSub, trackUnsub } = require('../services/visitTracker');

/**
 * POST /api/subscribe
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { email, preferredBeach } = req.body;

    if (!email || !preferredBeach) {
      return res.status(400).json({
        success: false,
        message: 'Email and preferred beach are required'
      });
    }

    const validBeaches = ['marina', 'elliot', 'covelong', 'thiruvanmiyur'];
    if (!validBeaches.includes(preferredBeach)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid beach selection'
      });
    }

    let subscriber = await Subscriber.findOne({ email: email.toLowerCase() });

    if (subscriber) {
      if (subscriber.isActive) {
        return res.json({
          success: false,
          message: 'This email is already subscribed! Check your inbox for daily forecasts.'
        });
      } else {
        // Reactivate
        subscriber.isActive = true;
        subscriber.preferredBeach = preferredBeach;
        subscriber.createdAt = new Date(); // Reset so it shows in digest
        await subscriber.save();
      }
    } else {
      subscriber = new Subscriber({
        email: email.toLowerCase(),
        preferredBeach
      });
      await subscriber.save();
    }

    // Track in DailyVisit (non-blocking)
    trackNewSub();

    // Welcome email (non-blocking)
    emailService.sendWelcomeEmail(subscriber.email, subscriber.preferredBeach)
      .then(() => console.log(`✅ Welcome email sent to ${subscriber.email}`))
      .catch(err => console.error(`❌ Email error for ${subscriber.email}:`, err.message));

    console.log(`✅ New subscriber: ${email} → ${preferredBeach}`);

    res.json({
      success: true,
      message: `You're subscribed! Your first forecast arrives tomorrow at 4:00 AM IST. 🌅`
    });
  } catch (error) {
    console.error('Subscribe error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Subscription failed. Please try again.'
    });
  }
});

/**
 * POST /api/unsubscribe  (API calls)
 * DELETES the subscriber record from MongoDB
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const subscriber = await Subscriber.findOne({ email: email.toLowerCase() });

    if (!subscriber) {
      return res.json({ success: false, message: 'Email not found in our subscribers list.' });
    }

    if (!subscriber.isActive) {
      await Subscriber.deleteOne({ email: email.toLowerCase() });
      return res.json({ success: false, message: 'This email is already unsubscribed.' });
    }

    await Subscriber.deleteOne({ email: email.toLowerCase() });
    trackUnsub(); // Track in DailyVisit

    console.log(`👋 Unsubscribed + deleted (POST): ${email}`);

    res.json({ success: true, message: "You've been unsubscribed. No more emails from Seaside Beacon." });
  } catch (error) {
    console.error('Unsubscribe error:', error.message);
    res.status(500).json({ success: false, message: 'Unsubscribe failed. Please try again.' });
  }
});

/**
 * GET /api/unsubscribe?email=xxx  (clickable links in emails)
 * DELETES the subscriber record + shows styled confirmation page
 */
router.get('/unsubscribe', async (req, res) => {
  const { email } = req.query;

  const page = (icon, title, message, isError = false) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seaside Beacon</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;min-height:100vh;display:flex;align-items:center;justify-content:center;color:white}
    .card{background:rgba(255,255,255,0.08);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.15);border-radius:24px;padding:48px 40px;max-width:460px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4)}
    .icon{font-size:48px;margin-bottom:20px}
    h1{font-size:24px;margin-bottom:12px;color:rgba(255,255,255,0.95)}
    p{color:rgba(255,255,255,0.6);line-height:1.6;margin-bottom:28px}
    a{display:inline-block;padding:12px 28px;border-radius:50px;text-decoration:none;font-weight:600;font-size:14px;${isError ? 'background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2)' : 'background:linear-gradient(135deg,#E8834A,#D4A843);color:white'}}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://seasidebeacon.com">Return to Seaside Beacon</a>
  </div>
</body>
</html>`;

  if (!email) {
    return res.status(400).send(page('⚠️', 'Invalid Link', 'No email address provided. Please use the unsubscribe link from your email.', true));
  }

  try {
    const decodedEmail = decodeURIComponent(email).toLowerCase();
    const subscriber = await Subscriber.findOne({ email: decodedEmail });

    if (!subscriber) {
      return res.send(page('✅', 'Already Unsubscribed', "You're already removed from our mailing list. No further action needed."));
    }

    if (!subscriber.isActive) {
      await Subscriber.deleteOne({ email: decodedEmail });
      return res.send(page('✅', 'Already Unsubscribed', "You're already removed from our mailing list. No further action needed."));
    }

    await Subscriber.deleteOne({ email: decodedEmail });
    trackUnsub(); // Track in DailyVisit

    console.log(`👋 Unsubscribed + deleted (GET): ${decodedEmail}`);

    res.send(page('👋', 'Successfully Unsubscribed', "You won't receive any more sunrise forecast emails. Your data has been removed. We hope to see you back on the beach! 🌅"));

  } catch (error) {
    console.error('Unsubscribe GET error:', error.message);
    res.status(500).send(page('⚠️', 'Something Went Wrong', 'An error occurred processing your request. Please try again later.', true));
  }
});

module.exports = router;