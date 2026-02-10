// ==========================================
// Seaside Beacon Backend Server
// Kevin T - 24BCS1045 - VIT Chennai
// ==========================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const subscribeRoutes = require('./routes/subscribe');
const predictRoutes = require('./routes/predict');
const { initializeDailyEmailJob } = require('./jobs/dailyEmail');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ========== MIDDLEWARE ==========

app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});
app.use('/api/', limiter);

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ========== ROUTES ==========

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Seaside Beacon API',
    version: '2.0.0',
    endpoints: {
      beaches: 'GET /api/beaches',
      predict: 'GET /api/predict/:beach',
      subscribe: 'POST /api/subscribe',
      unsubscribe: 'POST /api/unsubscribe'
    }
  });
});

// Health check endpoint for external monitoring
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api', subscribeRoutes);
app.use('/api', predictRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// ========== DATABASE ==========

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB error:', error.message);
    process.exit(1);
  }
}

// ========== STARTUP ==========

async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      console.log('═══════════════════════════════════════');
      console.log('🌅 SEASIDE BEACON SERVER v2.0');
      console.log('═══════════════════════════════════════');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📧 Email: ${process.env.GMAIL_USER ? 'Configured ✓' : 'Not configured'}`);
      console.log(`🤖 AI: ${process.env.GEMINI_API_KEY ? 'Gemini ✓' : 'Fallback mode'}`);
      console.log(`🌤️  Weather: ${process.env.ACCUWEATHER_API_KEY ? 'AccuWeather ✓' : 'Not configured'}`);
      console.log('═══════════════════════════════════════');
    });

    initializeDailyEmailJob();
  } catch (error) {
    console.error('❌ Startup error:', error.message);
    process.exit(1);
  }
}

// ========== SHUTDOWN ==========

process.on('SIGTERM', async () => {
  console.log('⚠️  Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⚠️  Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

startServer();