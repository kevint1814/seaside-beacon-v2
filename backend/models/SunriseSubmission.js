const mongoose = require('mongoose');

const sunriseSubmissionSchema = new mongoose.Schema({
  cloudinaryUrl: { type: String, required: true },
  cloudinaryPublicId: { type: String },
  beach: {
    type: String,
    required: true,
    enum: ['marina', 'elliot', 'covelong', 'thiruvanmiyur']
  },
  beachName: { type: String },
  date: { type: Date, required: true },
  name: { type: String, default: 'Anonymous' },
  featured: { type: Boolean, default: false },
  spotlighted: { type: Boolean, default: false }, // included in a Sunday Spotlight
  createdAt: { type: Date, default: Date.now }
});

const BEACH_NAMES = {
  marina: 'Marina Beach',
  elliot: "Elliot's Beach",
  covelong: 'Covelong Beach',
  thiruvanmiyur: 'Thiruvanmiyur Beach'
};

sunriseSubmissionSchema.pre('save', function(next) {
  if (!this.beachName) this.beachName = BEACH_NAMES[this.beach] || this.beach;
  next();
});

module.exports = mongoose.model('SunriseSubmission', sunriseSubmissionSchema);
