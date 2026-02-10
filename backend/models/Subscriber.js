// ==========================================
// Subscriber Model - MongoDB Schema
// ==========================================

const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  preferredBeach: {
    type: String,
    required: true,
    enum: ['marina', 'elliot', 'covelong', 'thiruvanmiyur'],
    default: 'marina'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastEmailSent: {
    type: Date,
    default: null
  },
  subscribedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
subscriberSchema.index({ email: 1 });
subscriberSchema.index({ isActive: 1 });

module.exports = mongoose.model('Subscriber', subscriberSchema);