// ==========================================
// PremiumUser Model - MongoDB Schema
// Stores premium subscription state, auth,
// and notification preferences.
// ==========================================

const mongoose = require('mongoose');

const premiumUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },

  // ─── Subscription ───
  plan: {
    type: String,
    enum: ['monthly', 'annual'],
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'pending'],
    default: 'pending'
  },
  razorpaySubscriptionId: {
    type: String,
    default: null
  },
  razorpayCustomerId: {
    type: String,
    default: null
  },
  currentPeriodEnd: {
    type: Date,
    default: null
  },

  // ─── Authentication ───
  password: {
    type: String,
    default: null  // null for Google-only users
  },
  googleId: {
    type: String,
    default: null  // null for email/password users
  },
  name: {
    type: String,
    default: null
  },
  resetToken: {
    type: String,
    default: null
  },
  resetTokenExpiry: {
    type: Date,
    default: null
  },
  authToken: {
    type: String,
    default: null
  },
  authTokenExpiry: {
    type: Date,
    default: null
  },
  lastLogin: {
    type: Date,
    default: null
  },

  // ─── Preferences ───
  preferredBeach: {
    type: String,
    enum: ['marina', 'elliot', 'covelong', 'thiruvanmiyur'],
    default: 'marina'
  },
  alertTime: {
    type: String,
    default: '04:00',  // Morning alert default (HH:MM IST)
    match: [/^\d{2}:\d{2}$/, 'Use HH:MM format']
  },
  eveningPreviewTime: {
    type: String,
    default: '20:30',  // Evening preview default (HH:MM IST)
    match: [/^\d{2}:\d{2}$/, 'Use HH:MM format']
  },

  // ─── Telegram ───
  telegramChatId: {
    type: String,
    default: null
  },
  telegramLinkedAt: {
    type: Date,
    default: null
  },

  // ─── Subscription Management ───
  subscribedAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  lastPaymentFailed: {
    type: Date,
    default: null
  },
  pendingPlanChange: {
    type: String,
    enum: ['monthly', 'annual', null],
    default: null
  },
  cancelledWithGrace: {
    type: Boolean,
    default: false   // true when 7-day refund cancel grants access until period end
  },

  // ─── Source Tracking ───
  source: {
    type: String,
    enum: ['razorpay', 'gift'],
    default: 'razorpay'
  }
}, {
  timestamps: true  // createdAt, updatedAt
});

// ─── Indexes (email index already created by unique:true) ───
premiumUserSchema.index({ status: 1 });
premiumUserSchema.index({ razorpaySubscriptionId: 1 });
premiumUserSchema.index({ googleId: 1 });
premiumUserSchema.index({ authToken: 1 });
premiumUserSchema.index({ telegramChatId: 1 });

// ─── Virtuals ───
premiumUserSchema.virtual('isActive').get(function () {
  // Active subscription
  if (this.status === 'active') return true;
  // Cancelled with grace period — still active until currentPeriodEnd
  if (this.cancelledWithGrace && this.currentPeriodEnd && new Date() < this.currentPeriodEnd) return true;
  return false;
});

// ─── Methods ───
premiumUserSchema.methods.hasValidAuth = function () {
  return this.authToken && this.authTokenExpiry && this.authTokenExpiry > new Date();
};

premiumUserSchema.methods.hasPassword = function () {
  return !!this.password;
};

premiumUserSchema.methods.isGoogleUser = function () {
  return !!this.googleId;
};

// ─── Statics ───
premiumUserSchema.statics.findActiveByEmail = function (email) {
  const now = new Date();
  return this.findOne({
    email: email.toLowerCase().trim(),
    $or: [
      { status: 'active' },
      { cancelledWithGrace: true, currentPeriodEnd: { $gt: now } }
    ]
  });
};

premiumUserSchema.statics.getActiveCount = function () {
  const now = new Date();
  return this.countDocuments({
    $or: [
      { status: 'active' },
      { cancelledWithGrace: true, currentPeriodEnd: { $gt: now } }
    ]
  });
};

premiumUserSchema.statics.getActiveUsers = function () {
  const now = new Date();
  return this.find({
    $or: [
      { status: 'active' },
      { cancelledWithGrace: true, currentPeriodEnd: { $gt: now } }
    ]
  });
};

module.exports = mongoose.model('PremiumUser', premiumUserSchema);
