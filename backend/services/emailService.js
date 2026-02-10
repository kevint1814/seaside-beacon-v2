// ==========================================
// Email Service - SendGrid / Brevo / Gmail
// ==========================================

const nodemailer = require('nodemailer');
let nodemailerSendgrid;
try { nodemailerSendgrid = require('nodemailer-sendgrid'); }
catch (e) { console.warn('nodemailer-sendgrid not installed, SendGrid unavailable'); }

const APP_URL = process.env.APP_URL || 'https://seaside-beacon.vercel.app';
const API_URL = process.env.API_URL || 'https://seaside-beacon.onrender.com';

/**
 * Create transporter - SendGrid preferred, Brevo/Gmail fallback
 */
function createTransporter() {
  if (process.env.SENDGRID_API_KEY && nodemailerSendgrid) {
    return nodemailer.createTransport(
      nodemailerSendgrid({ apiKey: process.env.SENDGRID_API_KEY })
    );
  }
  return nodemailer.createTransport({
    host: process.env.BREVO_USER ? 'smtp-relay.brevo.com' : 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_USER || process.env.GMAIL_USER,
      pass: process.env.BREVO_API_KEY || process.env.GMAIL_APP_PASSWORD
    }
  });
}

/**
 * Generate unsubscribe URL (GET link for one-click unsubscribe)
 */
function getUnsubscribeUrl(email) {
  return `${API_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`;
}

/**
 * Send welcome email
 */
async function sendWelcomeEmail(subscriberEmail, beachName) {
  try {
    const transporter = createTransporter();
    const unsubscribeUrl = getUnsubscribeUrl(subscriberEmail);

    const beachDisplayNames = {
      marina: 'Marina Beach',
      elliot: "Elliot's Beach (Besant Nagar)",
      covelong: 'Covelong Beach',
      thiruvanmiyur: 'Thiruvanmiyur Beach'
    };
    const beachDisplay = beachDisplayNames[beachName] || beachName;

    const mailOptions = {
      from: { name: 'Seaside Beacon', address: process.env.GMAIL_USER },
      to: subscriberEmail,
      subject: '🌅 Welcome to Seaside Beacon — Your sunrise forecasts start tomorrow',
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #D64828, #E8834A); color: white; padding: 48px 36px; text-align: center; }
    .header h1 { margin: 0 0 8px 0; font-size: 28px; font-weight: 700; }
    .header p { margin: 0; opacity: 0.9; font-size: 15px; }
    .content { padding: 40px 36px; color: #1a1a1a; }
    .content h2 { font-size: 22px; margin: 0 0 16px 0; color: #1a1a1a; }
    .content p { line-height: 1.7; color: #555; margin-bottom: 16px; }
    .beach-badge { display: inline-block; background: linear-gradient(135deg, #E8834A20, #D4A84320); border: 1px solid #E8834A40; border-radius: 20px; padding: 6px 16px; font-weight: 600; color: #D64828; font-size: 14px; margin-bottom: 24px; }
    .features { background: #FAFAFA; border-radius: 12px; padding: 24px; margin: 24px 0; }
    .feature { display: flex; align-items: flex-start; margin-bottom: 16px; }
    .feature:last-child { margin-bottom: 0; }
    .feature-icon { font-size: 22px; margin-right: 14px; flex-shrink: 0; margin-top: 2px; }
    .feature-text strong { display: block; font-size: 15px; color: #1a1a1a; margin-bottom: 2px; }
    .feature-text span { font-size: 13px; color: #777; line-height: 1.5; }
    .highlight { background: linear-gradient(135deg, #FFF4ED, #FFF9F0); border-left: 3px solid #E8834A; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 24px 0; font-size: 14px; color: #555; line-height: 1.6; }
    .footer { background: #F9F9F9; padding: 24px 36px; text-align: center; border-top: 1px solid #eee; }
    .footer p { font-size: 12px; color: #999; margin: 0 0 6px 0; line-height: 1.5; }
    .footer a { color: #E8834A; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌅 Welcome to Seaside Beacon</h1>
      <p>Your intelligent sunrise companion for Chennai beaches</p>
    </div>
    <div class="content">
      <h2>You're all set!</h2>
      <div class="beach-badge">📍 ${beachDisplay}</div>
      <p>Every morning at <strong>4:00 AM IST</strong>, we'll send you an AI-powered sunrise forecast for your beach — complete with photography tips tailored to tomorrow's exact atmospheric conditions.</p>
      <div class="features">
        <div class="feature">
          <div class="feature-icon">🤖</div>
          <div class="feature-text">
            <strong>Research-Backed Predictions</strong>
            <span>Scoring based on meteorological research — cloud cover, humidity, visibility, wind all weighted correctly for sunrise photography quality.</span>
          </div>
        </div>
        <div class="feature">
          <div class="feature-icon">📸</div>
          <div class="feature-text">
            <strong>Educational Photography Insights</strong>
            <span>Not just settings — we explain WHY each setting works for the day's atmospheric conditions, for both DSLR and smartphone.</span>
          </div>
        </div>
        <div class="feature">
          <div class="feature-icon">🏖️</div>
          <div class="feature-text">
            <strong>Beach Comparison</strong>
            <span>All 4 Chennai beaches rated for today's conditions so you always go to the right spot.</span>
          </div>
        </div>
        <div class="feature">
          <div class="feature-icon">🌤️</div>
          <div class="feature-text">
            <strong>Atmospheric Analysis</strong>
            <span>Understand how each weather parameter — clouds, humidity, wind — shapes the colors and mood of your sunrise.</span>
          </div>
        </div>
      </div>
      <div class="highlight">
        ⏰ <strong>Your first forecast arrives tomorrow at 4:00 AM IST.</strong><br>
        Set your alarm for 5:30 AM and you'll arrive at the beach just in time for the peak golden hour (10-15 minutes before sunrise at 6 AM).
      </div>
    </div>
    <div class="footer">
      <p><strong>Seaside Beacon</strong> · Made with ☀️ in Chennai</p>
      <p>You're subscribed to daily sunrise forecasts for ${beachDisplay}.</p>
      <p><a href="${unsubscribeUrl}">Unsubscribe</a> · <a href="${APP_URL}">Visit Website</a></p>
    </div>
  </div>
</body>
</html>`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${subscriberEmail}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Welcome email error:', error.message);
    throw error;
  }
}

/**
 * Send daily prediction email (updated for new data structure)
 */
async function sendDailyPredictionEmail(subscriberEmail, weatherData, photographyInsights) {
  try {
    const transporter = createTransporter();
    const unsubscribeUrl = getUnsubscribeUrl(subscriberEmail);

    const { beach, forecast, prediction } = weatherData;
    const { score, verdict, breakdown, atmosphericLabels } = prediction;
    const { cloudCover, humidity, visibility, windSpeed, temperature, precipProbability } = forecast;

    const statusColor = score >= 85 ? '#059669' : score >= 70 ? '#0284c7' : score >= 55 ? '#D97706' : score >= 40 ? '#EA580C' : '#DC2626';
    const verdictEmoji = score >= 85 ? '🔥' : score >= 70 ? '🌅' : score >= 55 ? '☀️' : score >= 40 ? '☁️' : '🌫️';

    // Extract insights safely (handle both AI and rule-based structure)
    const insight = photographyInsights.insight || '';
    const greeting = photographyInsights.greeting || '';
    const goldenHour = photographyInsights.goldenHour || { start: '5:45 AM', peak: '5:50 AM', end: '6:20 AM', quality: 'Good' };
    const dslrSettings = photographyInsights.dslr?.cameraSettings || {};
    const dslrTips = photographyInsights.dslr?.compositionTips || [];
    const beachComp = photographyInsights.beachComparison || null;
    const atm = photographyInsights.atmosphericAnalysis || null;

    // Cloud label
    const cloudLabel = atmosphericLabels?.cloudLabel || (cloudCover >= 30 && cloudCover <= 60 ? 'Optimal' : cloudCover < 30 ? 'Too Clear' : 'Overcast');
    const cloudColor = cloudCover >= 30 && cloudCover <= 60 ? '#059669' : cloudCover < 75 ? '#D97706' : '#DC2626';

    const mailOptions = {
      from: { name: 'Seaside Beacon', address: process.env.GMAIL_USER },
      to: subscriberEmail,
      subject: `${verdictEmoji} ${verdict} Sunrise Tomorrow — ${beach} (${score}/100)`,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f0f0f0; }
    .container { max-width: 600px; margin: 32px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, ${statusColor}, ${statusColor}CC); color: white; padding: 36px; text-align: center; }
    .header .verdict-emoji { font-size: 36px; margin-bottom: 8px; }
    .header h1 { margin: 0 0 4px 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .score-section { background: #FAFAFA; padding: 28px 36px; text-align: center; border-bottom: 1px solid #eee; }
    .score-number { font-size: 64px; font-weight: 800; color: ${statusColor}; line-height: 1; margin: 0; }
    .score-label { font-size: 14px; color: #888; margin: 6px 0 0 0; }
    .golden-hour { display: inline-block; background: linear-gradient(135deg, #FFF4ED, #FFF0E0); border: 1px solid #E8834A30; border-radius: 10px; padding: 10px 20px; margin-top: 16px; font-size: 14px; color: #D64828; font-weight: 600; }
    .content { padding: 28px 36px; }
    .section-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0 0 14px 0; padding-bottom: 8px; border-bottom: 2px solid #f0f0f0; }
    .insight-box { background: linear-gradient(135deg, #FFF4ED, #FFF9F4); border-left: 3px solid #E8834A; border-radius: 0 10px 10px 0; padding: 16px 20px; margin-bottom: 24px; font-size: 14px; color: #444; line-height: 1.7; }
    .atm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 24px; }
    .atm-card { background: #F9F9F9; border-radius: 10px; padding: 14px; }
    .atm-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 4px; }
    .atm-value { font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 2px; }
    .atm-rating { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 10px; display: inline-block; }
    .rating-good { background: #d1fae5; color: #065f46; }
    .rating-ok { background: #fef3c7; color: #92400e; }
    .rating-bad { background: #fee2e2; color: #991b1b; }
    .settings-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
    .setting-card { background: #1a1a1a; color: white; border-radius: 10px; padding: 14px; text-align: center; }
    .setting-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; }
    .setting-value { font-size: 17px; font-weight: 700; margin: 4px 0 0 0; }
    .tips-list { padding: 0; margin: 0 0 24px 0; list-style: none; }
    .tips-list li { font-size: 14px; color: #555; line-height: 1.6; padding: 10px 12px; background: #F9F9F9; border-radius: 8px; margin-bottom: 8px; }
    .tips-list li::before { content: "📸 "; }
    .beach-best { background: linear-gradient(135deg, #F0FDF4, #ECFDF5); border: 1px solid #6ee7b720; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; }
    .beach-best-label { font-size: 11px; text-transform: uppercase; color: #059669; font-weight: 700; margin-bottom: 4px; }
    .beach-best-name { font-size: 17px; font-weight: 700; color: #1a1a1a; }
    .beach-best-reason { font-size: 13px; color: #555; margin-top: 4px; line-height: 1.5; }
    .footer { background: #F9F9F9; padding: 20px 36px; text-align: center; border-top: 1px solid #eee; }
    .footer p { font-size: 12px; color: #aaa; margin: 0 0 4px 0; }
    .footer a { color: #E8834A; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="verdict-emoji">${verdictEmoji}</div>
      <h1>${verdict}</h1>
      <p>Tomorrow's Sunrise · ${beach}</p>
    </div>

    <div class="score-section">
      <p class="score-number">${score}</p>
      <p class="score-label">Sunrise Quality Score / 100</p>
      <div class="golden-hour">⏰ Peak Color: ${goldenHour.peak || goldenHour.start} · Window: ${goldenHour.start} – ${goldenHour.end}</div>
    </div>

    <div class="content">

      <div class="insight-box">
        <strong>${greeting}</strong><br>${insight}
      </div>

      <h3 class="section-title">🌤️ Atmospheric Conditions</h3>
      <div class="atm-grid">
        <div class="atm-card">
          <div class="atm-label">☁️ Cloud Cover</div>
          <div class="atm-value">${cloudCover}%</div>
          <span class="atm-rating ${cloudCover >= 30 && cloudCover <= 75 ? 'rating-good' : cloudCover < 30 ? 'rating-ok' : 'rating-bad'}">${cloudLabel}</span>
        </div>
        <div class="atm-card">
          <div class="atm-label">💧 Humidity</div>
          <div class="atm-value">${humidity}%</div>
          <span class="atm-rating ${humidity <= 55 ? 'rating-good' : humidity <= 70 ? 'rating-ok' : 'rating-bad'}">${atmosphericLabels?.humidityLabel || (humidity <= 55 ? 'Very Good' : humidity <= 70 ? 'Moderate' : 'High')}</span>
        </div>
        <div class="atm-card">
          <div class="atm-label">👁️ Visibility</div>
          <div class="atm-value">${visibility}km</div>
          <span class="atm-rating ${visibility >= 8 ? 'rating-good' : visibility >= 5 ? 'rating-ok' : 'rating-bad'}">${atmosphericLabels?.visibilityLabel || (visibility >= 10 ? 'Excellent' : visibility >= 8 ? 'Very Good' : 'Good')}</span>
        </div>
        <div class="atm-card">
          <div class="atm-label">🌡️ Temperature</div>
          <div class="atm-value">${temperature}°C</div>
          <span class="atm-rating rating-good">At Sunrise</span>
        </div>
      </div>

      ${beachComp ? `
      <h3 class="section-title">🏖️ Today's Best Beach</h3>
      <div class="beach-best">
        <div class="beach-best-label">⭐ Recommended for Today</div>
        <div class="beach-best-name">${{marina: 'Marina Beach', elliot: "Elliot's Beach", covelong: 'Covelong Beach', thiruvanmiyur: 'Thiruvanmiyur Beach'}[beachComp.todaysBest] || beach}</div>
        <div class="beach-best-reason">${beachComp.reason || ''}</div>
      </div>` : ''}

      <h3 class="section-title">📷 DSLR Settings</h3>
      <div class="settings-grid">
        <div class="setting-card"><div class="setting-label">ISO</div><div class="setting-value">${dslrSettings.iso || '200'}</div></div>
        <div class="setting-card"><div class="setting-label">Shutter</div><div class="setting-value">${dslrSettings.shutterSpeed || '1/125s'}</div></div>
        <div class="setting-card"><div class="setting-label">Aperture</div><div class="setting-value">${dslrSettings.aperture || 'f/8'}</div></div>
        <div class="setting-card"><div class="setting-label">White Balance</div><div class="setting-value">${dslrSettings.whiteBalance || '5500K'}</div></div>
      </div>

      <h3 class="section-title">💡 Composition Tips</h3>
      <ul class="tips-list">
        ${dslrTips.map(tip => `<li>${tip}</li>`).join('')}
      </ul>

    </div>
    <div class="footer">
      <p><strong>Seaside Beacon</strong> · Daily at 4:00 AM IST · <a href="${APP_URL}">seaside-beacon.vercel.app</a></p>
      <p>You're receiving this because you subscribed for ${beach} forecasts.</p>
      <p><a href="${unsubscribeUrl}">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Daily prediction sent to ${subscriberEmail}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Daily email error:', error.message);
    throw error;
  }
}

module.exports = { sendWelcomeEmail, sendDailyPredictionEmail };