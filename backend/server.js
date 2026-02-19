// ==========================================
// Seaside Beacon Backend Server v3
// Kevin T - 24BCS1045 - VIT Chennai
// ==========================================
// v3: Added visit tracking middleware
//     Added daily admin digest (8 AM IST)
//     Removed per-event admin notifications
// ==========================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const subscribeRoutes = require('./routes/subscribe');
const predictRoutes = require('./routes/predict');
const communityRoutes = require('./routes/community');
const { initializeDailyEmailJob } = require('./jobs/dailyEmail');
const { initializeDailyDigest } = require('./services/notifyAdmin');
const { trackVisitMiddleware } = require('./services/visitTracker');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ========== MIDDLEWARE ==========

app.use(helmet());

// CORS — handle multiple allowed origins properly
const allowedOrigins = (process.env.FRONTEND_URL || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }
    return callback(null, false);
  },
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

// Visit tracking — counts every /api request
app.use('/api', trackVisitMiddleware);

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ========== ROUTES ==========

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Seaside Beacon API',
    version: '3.0.0',
    endpoints: {
      beaches: 'GET /api/beaches',
      predict: 'GET /api/predict/:beach',
      subscribe: 'POST /api/subscribe',
      unsubscribe: 'POST /api/unsubscribe'
    }
  });
});

// Health check endpoint for UptimeRobot + diagnostics
app.get('/health', async (req, res) => {
  const uptimeSec = process.uptime();
  const uptimeH = Math.floor(uptimeSec / 3600);
  const uptimeM = Math.floor((uptimeSec % 3600) / 60);

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${uptimeH}h ${uptimeM}m`,
    memory: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
    services: {
      accuWeather: !!process.env.ACCUWEATHER_API_KEY,
      openMeteoProxy: !!process.env.OPENMETEO_PROXY_URL,
      groqAI: !!process.env.GROQ_API_KEY,
      email: !!(process.env.BREVO_API_KEY || process.env.SENDGRID_API_KEY),
      database: mongoose.connection.readyState === 1
    }
  };

  const allUp = Object.values(health.services).every(Boolean);
  health.status = allUp ? 'healthy' : 'degraded';

  res.status(allUp ? 200 : 503).json(health);
});

app.use('/api', subscribeRoutes);
app.use('/api', predictRoutes);
app.use('/api', communityRoutes);

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
      console.log('🌅 SEASIDE BEACON SERVER v4.0');
      console.log('═══════════════════════════════════════');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📧 Email: ${process.env.BREVO_API_KEY ? 'Brevo ✓' : 'Not configured'}${process.env.SENDGRID_API_KEY ? ' + SendGrid fallback ✓' : ''}`);
      console.log(`🤖 AI: ${process.env.GROQ_API_KEY ? `Groq ✓ (${process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'})` : 'Fallback mode'}`);
      console.log(`🌤️  Weather: ${process.env.ACCUWEATHER_API_KEY ? 'AccuWeather ✓ (cached 30min)' : 'Not configured'}`);
      console.log(`🌥️  Open-Meteo: ${process.env.OPENMETEO_PROXY_URL ? 'CF Worker proxy ✓' : 'Direct (shared IP limits)'}`);
      console.log(`⚡ Caching: Prediction 10min | Hourly 30min | Daily 2h | Open-Meteo 6h`);
      console.log(`📊 Analytics: Visit tracking ✓`);
      console.log('═══════════════════════════════════════');
    });

    // Daily forecast emails at 4:00 AM IST
    initializeDailyEmailJob();

    // Daily admin digest at 8:00 AM IST
    initializeDailyDigest();

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