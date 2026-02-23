// ==========================================
// Firebase Admin SDK — Server-side push notifications
// ==========================================

const admin = require('firebase-admin');

let initialized = false;

function initFirebase() {
  if (initialized) return;

  // Firebase service account credentials come from env
  // In production, set FIREBASE_SERVICE_ACCOUNT as a JSON string
  // or GOOGLE_APPLICATION_CREDENTIALS as a file path
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      initialized = true;
      console.log('[Firebase] Admin SDK initialized with service account');
    } catch (e) {
      console.error('[Firebase] Failed to parse service account:', e.message);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    initialized = true;
    console.log('[Firebase] Admin SDK initialized with application default credentials');
  } else {
    console.warn('[Firebase] No credentials found — push notifications disabled');
  }
}

/**
 * Send a push notification to a specific FCM topic.
 * @param {string} topic - e.g. 'morning_forecast' or 'evening_preview'
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {Object} data - Optional data payload
 */
async function sendToTopic(topic, title, body, data = {}) {
  if (!initialized) {
    console.warn('[Firebase] Not initialized — skipping push to', topic);
    return { success: false, reason: 'not_initialized' };
  }

  try {
    const message = {
      topic,
      notification: { title, body },
      data: {
        ...data,
        clickAction: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'seaside_beacon_forecasts',
          priority: 'high',
          defaultSound: true
        }
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log(`[Firebase] Push sent to topic "${topic}": ${response}`);
    return { success: true, messageId: response };
  } catch (error) {
    console.error(`[Firebase] Failed to send to topic "${topic}":`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send a push notification to a list of specific device tokens.
 * @param {string[]} tokens - FCM device tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {Object} data - Optional data payload
 */
async function sendToTokens(tokens, title, body, data = {}) {
  if (!initialized || tokens.length === 0) return { success: 0, failure: 0 };

  try {
    const message = {
      notification: { title, body },
      data: {
        ...data,
        clickAction: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'seaside_beacon_forecasts',
          priority: 'high'
        }
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } }
      },
      tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[Firebase] Multicast: ${response.successCount} sent, ${response.failureCount} failed`);

    // Clean up invalid tokens
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const code = resp.error.code;
        if (code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      const DeviceToken = require('../models/DeviceToken');
      await DeviceToken.deleteMany({ token: { $in: invalidTokens } });
      console.log(`[Firebase] Cleaned ${invalidTokens.length} invalid tokens`);
    }

    return {
      success: response.successCount,
      failure: response.failureCount
    };
  } catch (error) {
    console.error('[Firebase] Multicast error:', error.message);
    return { success: 0, failure: tokens.length, error: error.message };
  }
}

module.exports = { initFirebase, sendToTopic, sendToTokens };
