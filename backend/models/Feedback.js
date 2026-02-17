const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  rating: {
    type: String,
    required: true,
    enum: ['spot-on', 'close', 'missed']
  },
  comment: { type: String, default: '' },
  beach: {
    type: String,
    required: true,
    enum: ['marina', 'elliot', 'covelong', 'thiruvanmiyur']
  },
  beachName: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const BEACH_NAMES = {
  marina: 'Marina Beach',
  elliot: "Elliot's Beach",
  covelong: 'Covelong Beach',
  thiruvanmiyur: 'Thiruvanmiyur Beach'
};

feedbackSchema.pre('save', function(next) {
  if (!this.beachName) this.beachName = BEACH_NAMES[this.beach] || this.beach;
  next();
});

module.exports = mongoose.model('Feedback', feedbackSchema);
