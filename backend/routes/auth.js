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
const { isValidBeach } = require('../services/weatherService');

const PremiumUser = require('../models/PremiumUser');

const APP_URL = process.env.APP_URL || 'https://www.seasidebeacon.com';
const AUTH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days

// Google OAuth client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const BCRYPT_ROUNDS = 10;

// Short-lived one-time codes for OAuth redirect (avoids token in URL)
const _oauthCodes = new Map(); // code → { authToken, createdAt }
const OAUTH_CODE_TTL = 60 * 1000; // 60 seconds
// Cleanup expired codes every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of _oauthCodes.entries()) {
    if (now - data.createdAt > OAUTH_CODE_TTL) _oauthCodes.delete(code);
  }
}, 5 * 60 * 1000);


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
            isActive: existing.isActive
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
    // Handle duplicate key error (race condition: two concurrent registrations)
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Try signing in.' });
    }
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
        isActive: user.isActive
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
        isActive: user.isActive
      }
    });

  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});


// ═══════════════════════════════════════
// POST /api/auth/forgot-password
// Body: { email }
// Sends a password reset link via email
// ═══════════════════════════════════════
router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const normalised = email.toLowerCase().trim();
    const user = await PremiumUser.findOne({ email: normalised });

    // Always return success to prevent email enumeration
    if (!user || (!user.password && user.googleId)) {
      return res.json({ success: true, message: 'If an account exists with that email, we\'ve sent a reset link.' });
    }

    // Generate reset token (30 min TTL)
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    // Send reset email
    const { sendPasswordResetEmail } = require('../services/emailService');
    const resetUrl = `${APP_URL}?resetToken=${resetToken}&email=${encodeURIComponent(normalised)}`;
    await sendPasswordResetEmail(normalised, resetUrl);

    console.log(`📧 Password reset email sent to: ${normalised}`);

    res.json({ success: true, message: 'If an account exists with that email, we\'ve sent a reset link.' });

  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});


// ═══════════════════════════════════════
// POST /api/auth/reset-password
// Body: { email, token, newPassword }
// Resets password using the reset token
// ═══════════════════════════════════════
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const normalised = email.toLowerCase().trim();
    const user = await PremiumUser.findOne({
      email: normalised,
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link. Please request a new one.' });
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    console.log(`✅ Password reset for: ${normalised}`);

    res.json({ success: true, message: 'Password updated! You can now sign in.' });

  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});


// ═══════════════════════════════════════
// GET /api/auth/google-client-id
// Returns Google client ID for frontend GSI
// Also returns redirect URI for OAuth flow
// ═══════════════════════════════════════
router.get('/auth/google-client-id', (req, res) => {
  const apiBase = process.env.API_URL || `${req.protocol}://${req.get('host')}/api`;
  res.json({
    clientId: GOOGLE_CLIENT_ID || null,
    redirectSupported: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
  });
});

// ═══════════════════════════════════════
// GET /api/auth/google/redirect
// Initiates OAuth 2.0 redirect to Google
// ═══════════════════════════════════════
router.get('/auth/google/redirect', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).send('Google Sign-In not configured');
  }

  const API_BASE = process.env.API_URL
    ? process.env.API_URL.replace(/\/api\/?$/, '')
    : `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${API_BASE}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    access_type: 'online'
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ═══════════════════════════════════════
// GET /api/auth/google/callback
// Google redirects here after user signs in
// Exchanges code for ID token, creates session, redirects to frontend
// ═══════════════════════════════════════
router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error || !code) {
      console.error('Google OAuth callback error:', error);
      return res.redirect(`${APP_URL}?googleAuthError=${encodeURIComponent(error || 'no_code')}`);
    }

    if (!GOOGLE_CLIENT_SECRET) {
      console.error('GOOGLE_CLIENT_SECRET not set');
      return res.redirect(`${APP_URL}?googleAuthError=server_config`);
    }

    const API_BASE = process.env.API_URL
      ? process.env.API_URL.replace(/\/api\/?$/, '')
      : `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${API_BASE}/api/auth/google/callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();

    if (!tokens.id_token) {
      console.error('No id_token in Google response:', tokens);
      return res.redirect(`${APP_URL}?googleAuthError=token_failed`);
    }

    // Verify the ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;
    const normalised = email.toLowerCase().trim();

    // Find or create user (same logic as POST /auth/google)
    let user = await PremiumUser.findOne({ $or: [{ googleId }, { email: normalised }] });

    if (user) {
      if (!user.googleId) user.googleId = googleId;
      if (name && !user.name) user.name = name;
    } else {
      user = new PremiumUser({
        email: normalised,
        googleId,
        name: name || null,
        status: 'pending'
      });
    }

    const authToken = await generateAuthSession(user);
    console.log(`✅ Google OAuth redirect login: ${normalised}`);

    // Use short-lived one-time code instead of exposing auth token in URL
    const oauthCode = crypto.randomBytes(32).toString('hex');
    _oauthCodes.set(oauthCode, { authToken, createdAt: Date.now() });
    res.redirect(`${APP_URL}?googleAuth=success&code=${oauthCode}`);

  } catch (err) {
    console.error('Google OAuth callback error:', err.message);
    res.redirect(`${APP_URL}?googleAuthError=server_error`);
  }
});


// ═══════════════════════════════════════
// POST /api/auth/exchange-code
// Exchange one-time OAuth code for auth token (prevents token in URL)
// ═══════════════════════════════════════
router.post('/auth/exchange-code', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, message: 'Code required' });

  const data = _oauthCodes.get(code);
  if (!data) return res.status(400).json({ success: false, message: 'Invalid or expired code' });

  // One-time use — delete immediately
  _oauthCodes.delete(code);

  // Check expiry
  if (Date.now() - data.createdAt > OAUTH_CODE_TTL) {
    return res.status(400).json({ success: false, message: 'Code expired' });
  }

  res.json({ success: true, authToken: data.authToken });
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
      isActive: user.isActive,
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
      if (!isValidBeach(preferredBeach)) {
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
