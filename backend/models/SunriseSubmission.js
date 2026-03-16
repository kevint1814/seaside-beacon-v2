const mongoose = require('mongoose');
const { getBeachKeys, getBeachNames } = require('../services/weatherService');

const sunriseSubmissionSchema = new mongoose.Schema({
  cloudinaryUrl: { type: String, required: true },
  cloudinaryPublicId: { type: String },
  beach: {
    type: String,
    required: true,
    validate: {
      validator: v => getBeachKeys().includes(v),
      message: props => `${props.value} is not a valid beach`
    }
  },
  beachName: { type: String },
  date: { type: Date, required: true },
  name: { type: String, default: 'Anonymous' },
  email: { type: String, default: '' },
  featured: { type: Boolean, default: false },
  spotlighted: { type: Boolean, default: false }, // included in a Sunday Spotlight
  createdAt: { type: Date, default: Date.now }
});

sunriseSubmissionSchema.pre('save', function(next) {
  if (!this.beachName) {
    const names = getBeachNames();
    this.beachName = names[this.beach] || this.beach;
  }
  next();
});

module.exports = mongoose.model('SunriseSubmission', sunriseSubmissionSchema);
