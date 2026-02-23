// ==========================================
// Auth Routes - Magic Link Authentication
// POST /api/auth/magic-link  — send link
// GET  /api/auth/verify       — validate token
// GET  /api/auth/me           — check session
// POST /api/auth/logout       — clear session
// ==========================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const PremiumUser = require('../models/PremiumUser');

const isLocal = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const APP_URL = isLocal ? `http://localhost:${process.env.PORT || 3000}` : (process.env.APP_URL || 'https://www.seasidebeacon.com');
const API_URL = isLocal ? `http://localhost:${process.env.PORT || 3000}` : (process.env.API_URL || 'https://api.seasidebeacon.com');

const MAGIC_LINK_TTL = 15 * 60 * 1000;   // 15 minutes
const AUTH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days


// ─── Helper: send magic link email via Brevo ───
async function sendMagicLinkEmail(email, token) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY not set');

  const verifyUrl = `${API_URL}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;-webkit-text-size-adjust:none;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0f">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(180deg,#1a1520 0%,#12101a 100%);padding:36px 32px 28px;text-align:center;border-radius:16px 16px 0 0;border:1px solid rgba(196,115,58,0.15);border-bottom:none;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr>
              <td style="padding-right:10px;vertical-align:middle;">
                <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,rgba(196,115,58,0.2),rgba(212,146,74,0.1));border:1px solid rgba(196,115,58,0.3);text-align:center;line-height:32px;font-size:16px;">☀</div>
              </td>
              <td style="vertical-align:middle;">
                <p style="margin:0;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:14px;font-weight:500;color:#e8e0d4;">Seaside Beacon</p>
                <p style="margin:1px 0 0;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:9.5px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#c4733a;">Premium</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#12101a;padding:32px 36px 36px;text-align:center;border:1px solid rgba(196,115,58,0.15);border-top:1px solid rgba(255,255,255,0.06);border-radius:0 0 16px 16px;">
          <div style="width:48px;height:48px;margin:0 auto 20px;border-radius:50%;background:linear-gradient(135deg,#c4733a,#d4924a);text-align:center;line-height:48px;">
            <span style="font-size:20px;color:#fff;">✉</span>
          </div>
          <h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:600;color:#e8e0d4;letter-spacing:-0.3px;">Sign in to your account</h1>
          <p style="margin:0 0 28px;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:13.5px;color:rgba(232,224,212,0.6);line-height:1.65;">
            Tap the button below to sign in securely.<br>This link expires in 15 minutes.
          </p>
          <a href="${verifyUrl}" style="display:inline-block;padding:14px 48px;background:linear-gradient(135deg,#c4733a,#d4924a);color:#ffffff;text-decoration:none;border-radius:50px;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:15px;font-weight:600;letter-spacing:0.3px;">
            Sign in
          </a>
          <p style="margin:28px 0 0;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:11.5px;color:rgba(232,224,212,0.3);line-height:1.5;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 0;text-align:center;">
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:11px;color:rgba(232,224,212,0.25);">Seaside Beacon · India's first sunrise quality forecast · <a href="${APP_URL}" style="color:#c4733a;text-decoration:none;">seasidebeacon.com</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const payload = {
    sender: { name: 'Seaside Beacon', email: process.env.SENDER_EMAIL || 'forecast@seasidebeacon.com' },
    to: [{ email }],
    subject: 'Sign in to Seaside Beacon',
    htmlContent: html,
    textContent: `Sign in to Seaside Beacon:\n${verifyUrl}\n\nThis link expires in 15 minutes.`
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Brevo API ${res.status}: ${errBody}`);
  }
}


// ─── Middleware: require premium auth ───
async function requirePremium(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.authToken;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const user = await PremiumUser.findOne({
      authToken: token,
      authTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session' });
    }

    req.premiumUser = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ success: false, message: 'Authentication error' });
  }
}


// ═══════════════════════════════════════
// POST /api/auth/magic-link
// Body: { email }
// ═══════════════════════════════════════
router.post('/auth/magic-link', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email required' });
    }

    const normalised = email.toLowerCase().trim();

    // Find or create premium user record
    let user = await PremiumUser.findOne({ email: normalised });
    if (!user) {
      user = new PremiumUser({ email: normalised, status: 'pending' });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    user.magicLinkToken = token;
    user.magicLinkExpiry = new Date(Date.now() + MAGIC_LINK_TTL);
    await user.save();

    // Send email (non-blocking response — we still await but catch errors)
    try {
      await sendMagicLinkEmail(normalised, token);
    } catch (emailErr) {
      console.error('Magic link email failed:', emailErr.message);
      return res.status(500).json({ success: false, message: 'Failed to send email. Try again.' });
    }

    res.json({ success: true, message: 'Magic link sent! Check your inbox.' });

  } catch (err) {
    console.error('Magic link error:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});


// ═══════════════════════════════════════
// GET /api/auth/verify?token=xxx&email=xxx
// Validates magic link → sets auth cookie
// ═══════════════════════════════════════
router.get('/auth/verify', async (req, res) => {
  try {
    const { token, email } = req.query;
    if (!token || !email) {
      return res.status(400).send(errorPage('Missing verification parameters.'));
    }

    const normalised = email.toLowerCase().trim();
    const user = await PremiumUser.findOne({ email: normalised });

    if (!user || !user.hasValidMagicLink() || user.magicLinkToken !== token) {
      return res.status(400).send(errorPage('This link has expired or is invalid. Please request a new one.'));
    }

    // Generate long-lived auth token
    const authToken = crypto.randomBytes(32).toString('hex');
    user.authToken = authToken;
    user.authTokenExpiry = new Date(Date.now() + AUTH_TOKEN_TTL);
    user.magicLinkToken = null;
    user.magicLinkExpiry = null;
    user.lastLogin = new Date();
    await user.save();

    // Redirect to frontend with auth token in URL (frontend stores it)
    const redirectUrl = `${APP_URL}?authToken=${authToken}`;
    res.redirect(302, redirectUrl);

  } catch (err) {
    console.error('Verify error:', err.message);
    res.status(500).send(errorPage('Something went wrong. Please try again.'));
  }
});


// ═══════════════════════════════════════
// GET /api/auth/me
// Header: x-auth-token
// Returns current user info + premium status
// ═══════════════════════════════════════
router.get('/auth/me', requirePremium, async (req, res) => {
  const user = req.premiumUser;
  res.json({
    success: true,
    user: {
      email: user.email,
      plan: user.plan,
      status: user.status,
      isActive: user.status === 'active',
      preferredBeach: user.preferredBeach,
      alertTime: user.alertTime,
      telegramLinked: !!user.telegramChatId,
      currentPeriodEnd: user.currentPeriodEnd,
      subscribedAt: user.subscribedAt
    }
  });
});


// ═══════════════════════════════════════
// POST /api/auth/logout
// Header: x-auth-token
// Clears auth session
// ═══════════════════════════════════════
router.post('/auth/logout', requirePremium, async (req, res) => {
  try {
    const user = req.premiumUser;
    user.authToken = null;
    user.authTokenExpiry = null;
    await user.save();
    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});


// ─── Error page HTML ───
function errorPage(message) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seaside Beacon</title></head>
<body style="margin:0;padding:40px 20px;background:#faf8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;">
  <div style="max-width:420px;margin:60px auto;background:#fff;padding:36px 28px;border-radius:12px;border:1px solid #e8e0d4;">
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#c4733a;font-weight:600;margin:0 0 16px;">SEASIDE BEACON</p>
    <p style="font-size:16px;color:#1a1a1a;margin:0 0 20px;line-height:1.5;">${message}</p>
    <a href="${APP_URL}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#c4733a,#d4924a);color:#fff;text-decoration:none;border-radius:50px;font-size:14px;font-weight:600;">
      Back to Seaside Beacon
    </a>
  </div>
</body>
</html>`;
}


module.exports = router;
module.exports.requirePremium = requirePremium;
