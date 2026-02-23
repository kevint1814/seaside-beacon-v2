// ==========================================
// Auth Routes - Email/Password + Google OAuth
// POST /api/auth/register     — create account
// POST /api/auth/login        — email + password
// POST /api/auth/google       — Google ID token verify
// GET  /api/auth/me           — check session
// POST /api/auth/preferences  — update settings
// POST /api/auth/logout       — clear session
// ==========================================

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const router = express.Router();

const PremiumUser = require('../models/PremiumUser');

const APP_URL = process.env.APP_URL || 'https://www.seasidebeacon.com';
const AUTH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days

// Google OAuth client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const BCRYPT_ROUNDS = 10;


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


// ─── Helper: generate auth token + save ───
async function generateAuthSession(user) {
  const authToken = crypto.randomBytes(32).toString('hex');
  user.authToken = authToken;
  user.authTokenExpiry = new Date(Date.now() + AUTH_TOKEN_TTL);
  user.lastLogin = new Date();
  await user.save();
  return authToken;
}


// ═══════════════════════════════════════
// POST /api/auth/register
// Body: { email, password, name? }
// ═══════════════════════════════════════
router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const normalised = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await PremiumUser.findOne({ email: normalised });
    if (existing) {
      // If they signed up via Google and now want to add a password
      if (existing.googleId && !existing.password) {
        existing.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
        if (name) existing.name = name;
        const authToken = await generateAuthSession(existing);
        return res.json({
          success: true,
          message: 'Password added to your Google account.',
          authToken,
          user: {
            email: existing.email,
            name: existing.name,
            plan: existing.plan,
            status: existing.status,
            isActive: existing.status === 'active'
          }
        });
      }
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Try signing in.' });
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = new PremiumUser({
      email: normalised,
      password: hashedPassword,
      name: name || null,
      status: 'pending'
    });

    const authToken = await generateAuthSession(user);

    console.log(`✅ New user registered: ${normalised}`);

    res.json({
      success: true,
      message: 'Account created successfully!',
      authToken,
      user: {
        email: user.email,
        name: user.name,
        plan: user.plan,
        status: user.status,
        isActive: false
      }
    });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});


// ═══════════════════════════════════════
// POST /api/auth/login
// Body: { email, password }
// ═══════════════════════════════════════
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const normalised = email.toLowerCase().trim();
    const user = await PremiumUser.findOne({ email: normalised });

    if (!user) {
      return res.status(401).json({ success: false, message: 'No account found with this email. Create one first.' });
    }

    // Google-only user trying to log in with password
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: 'This account uses Google Sign-In. Please sign in with Google.',
        googleOnly: true
      });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Incorrect password. Try again.' });
    }

    const authToken = await generateAuthSession(user);

    console.log(`✅ Login: ${normalised}`);

    res.json({
      success: true,
      message: 'Signed in!',
      authToken,
      user: {
        email: user.email,
        name: user.name,
        plan: user.plan,
        status: user.status,
        isActive: user.status === 'active'
      }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});


// ═══════════════════════════════════════
// POST /api/auth/google
// Body: { credential } (Google ID token from frontend)
// ═══════════════════════════════════════
router.post('/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ success: false, message: 'Google credential required' });
    }

    if (!googleClient) {
      return res.status(500).json({ success: false, message: 'Google Sign-In not configured on server' });
    }

    // Verify the Google ID token
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error('Google token verification failed:', verifyErr.message);
      return res.status(401).json({ success: false, message: 'Invalid Google credential' });
    }

    const { sub: googleId, email, name, picture } = payload;
    const normalised = email.toLowerCase().trim();

    // Find existing user by googleId OR email
    let user = await PremiumUser.findOne({ $or: [{ googleId }, { email: normalised }] });

    if (user) {
      // Link Google to existing email-only account
      if (!user.googleId) {
        user.googleId = googleId;
      }
      if (name && !user.name) {
        user.name = name;
      }
    } else {
      // Create new user
      user = new PremiumUser({
        email: normalised,
        googleId,
        name: name || null,
        status: 'pending'
      });
    }

    const authToken = await generateAuthSession(user);

    console.log(`✅ Google login: ${normalised}`);

    res.json({
      success: true,
      message: user.status === 'active' ? 'Welcome back!' : 'Signed in with Google!',
      authToken,
      user: {
        email: user.email,
        name: user.name,
        plan: user.plan,
        status: user.status,
        isActive: user.status === 'active'
      }
    });

  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});


// ═══════════════════════════════════════
// GET /api/auth/google-client-id
// Returns Google client ID for frontend GSI
// ═══════════════════════════════════════
router.get('/auth/google-client-id', (req, res) => {
  res.json({ clientId: GOOGLE_CLIENT_ID || null });
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
      name: user.name,
      plan: user.plan,
      status: user.status,
      isActive: user.status === 'active',
      preferredBeach: user.preferredBeach,
      alertTime: user.alertTime,
      eveningPreviewTime: user.eveningPreviewTime,
      telegramLinked: !!user.telegramChatId,
      currentPeriodEnd: user.currentPeriodEnd,
      subscribedAt: user.subscribedAt,
      googleLinked: !!user.googleId,
      hasPassword: !!user.password
    }
  });
});


// ═══════════════════════════════════════
// POST /api/auth/preferences
// Header: x-auth-token
// Body: { alertTime, eveningPreviewTime, preferredBeach }
// ═══════════════════════════════════════
router.post('/auth/preferences', requirePremium, async (req, res) => {
  try {
    const user = req.premiumUser;
    const { alertTime, eveningPreviewTime, preferredBeach } = req.body;

    if (alertTime) {
      if (!/^\d{2}:\d{2}$/.test(alertTime)) {
        return res.status(400).json({ success: false, message: 'Invalid time format. Use HH:MM.' });
      }
      user.alertTime = alertTime;
    }

    if (eveningPreviewTime) {
      if (!/^\d{2}:\d{2}$/.test(eveningPreviewTime)) {
        return res.status(400).json({ success: false, message: 'Invalid time format. Use HH:MM.' });
      }
      user.eveningPreviewTime = eveningPreviewTime;
    }

    if (preferredBeach) {
      const validBeaches = ['marina', 'elliot', 'covelong', 'thiruvanmiyur'];
      if (!validBeaches.includes(preferredBeach)) {
        return res.status(400).json({ success: false, message: 'Invalid beach' });
      }
      user.preferredBeach = preferredBeach;
    }

    await user.save();
    res.json({ success: true, message: 'Preferences saved!' });
  } catch (err) {
    console.error('Preferences error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save preferences' });
  }
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


module.exports = router;
module.exports.requirePremium = requirePremium;
