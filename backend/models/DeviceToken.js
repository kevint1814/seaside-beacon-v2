// ==========================================
// DeviceToken Model — Stores FCM tokens for push notifications
// ==========================================

const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  platform: {
    type: String,
    enum: ['android', 'ios'],
    required: true
  },
  // Which push topics the device subscribes to
  settings: {
    muteAll: { type: Boolean, default: false },
    muteMorning: { type: Boolean, default: false },
    muteEvening: { type: Boolean, default: false }
  },
  // Default beach for personalised pushes
  defaultBeach: {
    type: String,
    default: 'marina'
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Update lastActive on every save
deviceTokenSchema.pre('save', function(next) {
  this.lastActive = new Date();
  next();
});

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
