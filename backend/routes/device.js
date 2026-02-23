// ==========================================
// Device Routes — Register/update FCM tokens for push notifications
// ==========================================

const express = require('express');
const router = express.Router();
const DeviceToken = require('../models/DeviceToken');

/**
 * POST /api/register-device
 * Register or update a device's FCM token.
 * Body: { token, platform, defaultBeach? }
 */
router.post('/register-device', async (req, res) => {
  try {
    const { token, platform, defaultBeach } = req.body;

    if (!token || !platform) {
      return res.status(400).json({
        success: false,
        error: 'token and platform are required'
      });
    }

    if (!['android', 'ios'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'platform must be "android" or "ios"'
      });
    }

    const update = {
      platform,
      lastActive: new Date()
    };
    if (defaultBeach) update.defaultBeach = defaultBeach;

    const device = await DeviceToken.findOneAndUpdate(
      { token },
      { $set: update, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );

    console.log(`[Device] Registered ${platform} token: ${token.substring(0, 20)}...`);

    res.json({
      success: true,
      deviceId: device._id,
      settings: device.settings
    });
  } catch (error) {
    console.error('[Device] Registration error:', error.message);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

/**
 * POST /api/device-settings
 * Update a device's notification preferences.
 * Body: { token, settings: { muteAll, muteMorning, muteEvening }, defaultBeach? }
 */
router.post('/device-settings', async (req, res) => {
  try {
    const { token, settings, defaultBeach } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'token is required'
      });
    }

    const update = { lastActive: new Date() };

    if (settings) {
      if (typeof settings.muteAll === 'boolean') update['settings.muteAll'] = settings.muteAll;
      if (typeof settings.muteMorning === 'boolean') update['settings.muteMorning'] = settings.muteMorning;
      if (typeof settings.muteEvening === 'boolean') update['settings.muteEvening'] = settings.muteEvening;
    }

    if (defaultBeach) update.defaultBeach = defaultBeach;

    const device = await DeviceToken.findOneAndUpdate(
      { token },
      { $set: update },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found. Register first.'
      });
    }

    res.json({
      success: true,
      settings: device.settings,
      defaultBeach: device.defaultBeach
    });
  } catch (error) {
    console.error('[Device] Settings update error:', error.message);
    res.status(500).json({ success: false, error: 'Update failed' });
  }
});

module.exports = router;
