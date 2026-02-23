const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const SunriseSubmission = require('../models/SunriseSubmission');
const Feedback = require('../models/Feedback');
const { notifyNewFeedback, notifyNewPhotoSubmission } = require('../services/notifyAdmin');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dj0ewfbtf',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer — memory storage, 10MB limit, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});

// ─────────────────────────────────────────────
// POST /api/sunrise-submission
// ─────────────────────────────────────────────
router.post('/sunrise-submission', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Photo must be under 10MB.' });
      }
      return res.status(400).json({ success: false, message: 'Upload error. Please try again.' });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo uploaded.' });
    }

    const { beach, date, name } = req.body;

    if (!beach || !date || !name) {
      return res.status(400).json({ success: false, message: 'Beach, date, and name are required.' });
    }

    // Upload to Cloudinary via buffer
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'seaside-beacon/community',
          resource_type: 'image',
          transformation: [
            { width: 1600, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    // Store in MongoDB
    const submission = await SunriseSubmission.create({
      cloudinaryUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      beach,
      date: new Date(date),
      name: name || 'Anonymous'
    });

    console.log(`📸 New sunrise submission: ${submission.beachName} by ${submission.name} (${date})`);
    notifyNewPhotoSubmission(submission.name, beach, date, result.secure_url);

    res.json({
      success: true,
      message: 'Your sunrise has been received — thank you.',
      id: submission._id
    });
  } catch (error) {
    console.error('❌ Submission error:', error.message);
    res.status(500).json({ success: false, message: 'Upload failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/feedback
// ─────────────────────────────────────────────
router.post('/feedback', async (req, res) => {
  try {
    const { rating, comment, beach, name, date } = req.body;

    if (!rating || !beach || !name || !date || !comment) {
      return res.status(400).json({ success: false, message: 'All fields are required: name, date, rating, comment, and beach.' });
    }

    const feedback = await Feedback.create({
      rating,
      comment,
      beach,
      userName: name,
      visitDate: date
    });

    console.log(`💬 New feedback: ${feedback.rating} for ${feedback.beachName}${name ? ` by ${name}` : ''}${date ? ` (${date})` : ''}${comment ? ' — "' + comment.substring(0, 50) + '"' : ''}`);
    notifyNewFeedback(rating, comment, beach, name, date);

    res.json({
      success: true,
      message: 'Noted — this makes every forecast better.'
    });
  } catch (error) {
    console.error('❌ Feedback error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;