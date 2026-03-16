const mongoose = require('mongoose');
const { getBeachKeys, getBeachNames } = require('../services/weatherService');

const feedbackSchema = new mongoose.Schema({
  rating: {
    type: String,
    required: true,
    enum: ['spot-on', 'close', 'missed']
  },
  comment: { type: String, required: true },
  userName: { type: String, required: true },
  email: { type: String, default: '' },
  visitDate: { type: String, required: true },
  beach: {
    type: String,
    required: true,
    validate: {
      validator: v => getBeachKeys().includes(v),
      message: props => `${props.value} is not a valid beach`
    }
  },
  beachName: { type: String },
  createdAt: { type: Date, default: Date.now }
});

feedbackSchema.pre('save', function(next) {
  if (!this.beachName) {
    const names = getBeachNames();
    this.beachName = names[this.beach] || this.beach;
  }
  next();
});

module.exports = mongoose.model('Feedback', feedbackSchema);
