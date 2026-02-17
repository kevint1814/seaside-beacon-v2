// ==========================================
// Subscribe Routes
// ==========================================

const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber');
const emailService = require('../services/emailService');
const { notifyNewSubscriber, notifyUnsubscribe } = require('../services/notifyAdmin');

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

    // Validate beach
    const validBeaches = ['marina', 'elliot', 'covelong', 'thiruvanmiyur'];
    if (!validBeaches.includes(preferredBeach)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid beach selection'
      });
    }

    // Check if already subscribed
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
        await subscriber.save();
      }
    } else {
      subscriber = new Subscriber({
        email: email.toLowerCase(),
        preferredBeach
      });
      await subscriber.save();
    }

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail(subscriber.email, subscriber.preferredBeach)
      .then(() => console.log(`✅ Welcome email sent to ${subscriber.email}`))
      .catch(err => console.error(`❌ Email error for ${subscriber.email}:`, err.message));

    console.log(`✅ New subscriber: ${email} → ${preferredBeach}`);
    notifyNewSubscriber(email, preferredBeach);

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
 * POST /api/unsubscribe  (fetch/API calls)
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
      return res.json({ success: false, message: 'This email is already unsubscribed.' });
    }

    subscriber.isActive = false;
    await subscriber.save();

    console.log(`👋 Unsubscribed (POST): ${email}`);
    notifyUnsubscribe(email);

    res.json({ success: true, message: "You've been unsubscribed. No more emails from Seaside Beacon." });
  } catch (error) {
    console.error('Unsubscribe error:', error.message);
    res.status(500).json({ success: false, message: 'Unsubscribe failed. Please try again.' });
  }
});

/**
 * GET /api/unsubscribe?email=xxx  (clickable links in emails)
 * Returns a styled HTML confirmation page
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
      return res.send(page('🔍', 'Not Found', 'This email address was not found in our subscribers list.', true));
    }

    if (!subscriber.isActive) {
      return res.send(page('✅', "Already Unsubscribed", "You're already removed from our mailing list. No further action needed."));
    }

    subscriber.isActive = false;
    await subscriber.save();
    console.log(`👋 Unsubscribed (GET link): ${decodedEmail}`);
    notifyUnsubscribe(decodedEmail);

    res.send(page('👋', 'Successfully Unsubscribed', "You won't receive any more sunrise forecast emails. We hope to see you back on the beach! 🌅"));

  } catch (error) {
    console.error('Unsubscribe GET error:', error.message);
    res.status(500).send(page('⚠️', 'Something Went Wrong', 'An error occurred processing your request. Please try again later.', true));
  }
});

module.exports = router;