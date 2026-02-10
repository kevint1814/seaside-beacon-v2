// ==========================================
// Daily Email Job - Automated 4 AM Predictions
// ==========================================

const cron = require('node-cron');
const Subscriber = require('../models/Subscriber');
const weatherService = require('../services/weatherService');
const aiService = require('../services/aiService');
const emailService = require('../services/emailService');

/**
 * Send daily predictions to all active subscribers
 */
async function sendDailyPredictions() {
  try {
    console.log('\n🌅 Starting daily email job...');
    
    const subscribers = await Subscriber.find({ isActive: true });
    console.log(`📧 Found ${subscribers.length} active subscribers`);

    for (const subscriber of subscribers) {
      try {
        // Fetch weather data
        const weatherData = await weatherService.getTomorrow6AMForecast(subscriber.preferredBeach);
        
        if (!weatherData.available) {
          console.log(`⏰ Skipping ${subscriber.email} - predictions not available yet`);
          continue;
        }

        // Generate AI insights
        const photographyInsights = await aiService.generatePhotographyInsights(weatherData);

        // Send email
        await emailService.sendDailyPredictionEmail(
          subscriber.email,
          weatherData,
          photographyInsights
        );

        // Update last email sent
        subscriber.lastEmailSent = new Date();
        await subscriber.save();

        console.log(`✅ Email sent to ${subscriber.email}`);

      } catch (error) {
        console.error(`❌ Error for ${subscriber.email}:`, error.message);
        continue;
      }
    }

    console.log('✅ Daily email job completed\n');
  } catch (error) {
    console.error('❌ Daily email job failed:', error.message);
  }
}

/**
 * Initialize cron job
 */
function initializeDailyEmailJob() {
  const DAILY_EMAIL_TIME = process.env.DAILY_EMAIL_TIME || '04:00';
  const [hour, minute] = DAILY_EMAIL_TIME.split(':');

  // Schedule: Every day at 4:00 AM IST
  const cronExpression = `${minute} ${hour} * * *`;

  cron.schedule(cronExpression, sendDailyPredictions, {
    timezone: process.env.TIMEZONE || 'Asia/Kolkata'
  });

  console.log(`📅 Scheduling daily emails at ${DAILY_EMAIL_TIME} IST`);
  console.log(`✅ Daily email job initialized successfully`);
}

module.exports = {
  initializeDailyEmailJob,
  sendDailyPredictions
};