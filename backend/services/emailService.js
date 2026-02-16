// ==========================================
// Email Service - SendGrid / Brevo / Gmail
// General-audience-first, honest tone
// ==========================================

const nodemailer = require('nodemailer');
let nodemailerSendgrid;
try { nodemailerSendgrid = require('nodemailer-sendgrid'); }
catch (e) { console.warn('nodemailer-sendgrid not installed, SendGrid unavailable'); }

const APP_URL = process.env.APP_URL || 'https://seasidebeacon.com';
const API_URL = process.env.API_URL || 'https://api.seasidebeacon.com';

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
 * Send welcome email — general audience first
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
      from: { name: 'Seaside Beacon', address: process.env.SENDER_EMAIL || 'forecast@seasidebeacon.com' },
      to: subscriberEmail,
      subject: '🌅 Welcome to Seaside Beacon. Your Honest Sunrise Forecasts, Starting Tomorrow!',
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      text: `Welcome to Seaside Beacon!\n\nYou're subscribed to daily sunrise forecasts for ${beachDisplay}.\n\nEvery morning at 4:00 AM IST, we'll send you an honest sunrise forecast — what the sky will actually look like, whether it's worth waking up for, plus photography tips if you want them.\n\nYour first forecast arrives tomorrow at 4:00 AM IST.\n\nUnsubscribe: ${unsubscribeUrl}\n\nSeaside Beacon — Made in Chennai`,
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
      <h1>🌅 Welcome to Seaside Beacon!</h1>
      <p>Honest Sunrise Forecasts for Chennai Beaches</p>
    </div>
    <div class="content">
      <h2>You're all set!</h2>
      <div class="beach-badge">📍 ${beachDisplay}</div>
      <p>Every morning at <strong>4:00 AM IST</strong>, we'll send you an honest sunrise forecast for your beach on what the sky will actually look like, whether it's worth waking up for, plus photography tips if you need them.</p>
      <div class="features">
        <div class="feature">
          <div class="feature-icon">🌅</div>
          <div class="feature-text">
            <strong>Honest Verdict</strong>
            <span>We'll tell you straight, is tomorrow's sunrise worth the early alarm, or should you sleep in? No sugarcoating.</span>
          </div>
        </div>
        <div class="feature">
          <div class="feature-icon">🌤️</div>
          <div class="feature-text">
            <strong>What You'll Actually See</strong>
            <span>Specific descriptions of expected sky colors, light quality, and beach atmosphere so you're never disappointed.</span>
          </div>
        </div>
        <div class="feature">
          <div class="feature-icon">🏖️</div>
          <div class="feature-text">
            <strong>Beach Comparison</strong>
            <span>All 4 Chennai beaches rated or straight away told "none are great today" when that's the truth.</span>
          </div>
        </div>
        <div class="feature">
          <div class="feature-icon">📸</div>
          <div class="feature-text">
            <strong>Photography Tips</strong>
            <span>Camera settings and composition tips for photographers, with explanations of why each setting works for the day's conditions.</span>
          </div>
        </div>
      </div>
      <div class="highlight">
        ⏰ <strong>Your first forecast arrives tomorrow at 4:00 AM IST.</strong><br>
        If conditions are good, set your alarm for 5:30 AM to arrive at the beach for the peak color window (10 to 15 minutes before sunrise).
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
 * Send daily prediction email
 * General audience first, photography secondary
 * Conditionally shorter on poor days
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

    // Extract insights
    const insight = photographyInsights.insight || '';
    const greeting = photographyInsights.greeting || '';
    const goldenHour = photographyInsights.goldenHour || { start: '5:45 AM', peak: '5:50 AM', end: '6:20 AM', quality: 'Good' };
    const sunriseExp = photographyInsights.sunriseExperience || {};
    const dslrSettings = photographyInsights.dslr?.cameraSettings || {};
    const dslrTips = photographyInsights.dslr?.compositionTips || [];
    const beachComp = photographyInsights.beachComparison || null;

    // Cloud label
    const cloudLabel = atmosphericLabels?.cloudLabel || (cloudCover >= 30 && cloudCover <= 60 ? 'Optimal' : cloudCover < 30 ? 'Too Clear' : 'Overcast');

    // Determine if this is a good enough day to include full photography section
    const includePhotography = score >= 40;

    // Worth waking up recommendation
    let recLabel, recColor;
    if (score >= 70) { recLabel = '✓ Worth the early alarm'; recColor = '#059669'; }
    else if (score >= 50) { recLabel = '~ Pleasant, not spectacular'; recColor = '#D97706'; }
    else if (score >= 30) { recLabel = '✗ Underwhelming sunrise expected'; recColor = '#EA580C'; }
    else { recLabel = '— Sunrise likely not visible'; recColor = '#DC2626'; }

    const mailOptions = {
      from: { name: 'Seaside Beacon', address: process.env.SENDER_EMAIL || 'forecast@seasidebeacon.com' },
      to: subscriberEmail,
      subject: `${verdictEmoji} ${verdict} Sunrise Tomorrow — ${beach} (${score}/100)`,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      text: `${greeting}\n\n${beach} — Sunrise Score: ${score}/100 (${verdict})\n\nGolden Hour: ${goldenHour.start} – ${goldenHour.end} (Peak: ${goldenHour.peak})\n\n${insight}\n\n${sunriseExp.whatYoullSee ? 'What you\'ll see: ' + sunriseExp.whatYoullSee + '\n\n' : ''}${sunriseExp.worthWakingUp ? 'Worth waking up? ' + sunriseExp.worthWakingUp + '\n\n' : ''}Conditions: Cloud ${cloudCover}%, Humidity ${humidity}%, Visibility ${visibility}km, Wind ${windSpeed}km/h, Temp ${temperature}°C\n\nUnsubscribe: ${unsubscribeUrl}\n\nSeaside Beacon — Daily at 4:00 AM IST`,
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
    .rec-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-top: 12px; color: ${recColor}; background: ${recColor}12; border: 1px solid ${recColor}30; }
    .golden-hour { display: inline-block; background: linear-gradient(135deg, #FFF4ED, #FFF0E0); border: 1px solid #E8834A30; border-radius: 10px; padding: 10px 20px; margin-top: 12px; font-size: 14px; color: #D64828; font-weight: 600; }
    .content { padding: 28px 36px; }
    .section-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0 0 14px 0; padding-bottom: 8px; border-bottom: 2px solid #f0f0f0; }
    .insight-box { background: linear-gradient(135deg, #FFF4ED, #FFF9F4); border-left: 3px solid #E8834A; border-radius: 0 10px 10px 0; padding: 16px 20px; margin-bottom: 24px; font-size: 14px; color: #444; line-height: 1.7; }
    .experience-box { background: #F9F9F9; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .exp-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 6px; font-weight: 600; }
    .exp-text { font-size: 14px; color: #555; line-height: 1.65; margin-bottom: 14px; }
    .exp-text:last-child { margin-bottom: 0; }
    .exp-verdict-box { background: linear-gradient(135deg, #FFF4ED, #FFF9F4); border-left: 3px solid ${recColor}; border-radius: 0 10px 10px 0; padding: 14px 18px; margin-bottom: 24px; }
    .exp-verdict-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: ${recColor}; font-weight: 700; margin-bottom: 4px; }
    .exp-verdict-text { font-size: 14px; color: #444; line-height: 1.6; }
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
    .skip-note { background: #F9F9F9; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px; }
    .skip-note p { font-size: 14px; color: #777; line-height: 1.6; margin: 0; }
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
      <p>Today's Sunrise · ${beach}</p>
    </div>

    <div class="score-section">
      <p class="score-number">${score}</p>
      <p class="score-label">Sunrise Quality Score / 100</p>
      <div class="rec-badge">${recLabel}</div>
      ${score >= 50 ? `<br><div class="golden-hour">⏰ Peak Color: ${goldenHour.peak || goldenHour.start} · Window: ${goldenHour.start} – ${goldenHour.end}</div>` : ''}
    </div>

    <div class="content">

      <div class="insight-box">
        <strong>${greeting}</strong><br>${insight}
      </div>

      ${sunriseExp.whatYoullSee || sunriseExp.beachVibes ? `
      <h3 class="section-title">🌅 What to Expect</h3>
      <div class="experience-box">
        ${sunriseExp.whatYoullSee ? `<div class="exp-label">What you'll see</div><div class="exp-text">${sunriseExp.whatYoullSee}</div>` : ''}
        ${sunriseExp.beachVibes ? `<div class="exp-label">Beach vibes</div><div class="exp-text">${sunriseExp.beachVibes}</div>` : ''}
      </div>` : ''}

      ${sunriseExp.worthWakingUp ? `
      <div class="exp-verdict-box">
        <div class="exp-verdict-label">Worth waking up?</div>
        <div class="exp-verdict-text">${sunriseExp.worthWakingUp}</div>
      </div>` : ''}

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
        <div class="beach-best-label">⭐ Recommended</div>
        <div class="beach-best-name">${{marina: 'Marina Beach', elliot: "Elliot's Beach", covelong: 'Covelong Beach', thiruvanmiyur: 'Thiruvanmiyur Beach'}[beachComp.todaysBest] || beach}</div>
        <div class="beach-best-reason">${beachComp.reason || ''}</div>
      </div>` : ''}

      ${includePhotography ? `
      <h3 class="section-title">📷 Photography Settings</h3>
      <div class="settings-grid">
        <div class="setting-card"><div class="setting-label">ISO</div><div class="setting-value">${dslrSettings.iso || '200'}</div></div>
        <div class="setting-card"><div class="setting-label">Shutter</div><div class="setting-value">${dslrSettings.shutterSpeed || '1/125s'}</div></div>
        <div class="setting-card"><div class="setting-label">Aperture</div><div class="setting-value">${dslrSettings.aperture || 'f/8'}</div></div>
        <div class="setting-card"><div class="setting-label">White Balance</div><div class="setting-value">${dslrSettings.whiteBalance || '5500K'}</div></div>
      </div>

      ${dslrTips.length ? `
      <h3 class="section-title">💡 Composition Tips</h3>
      <ul class="tips-list">
        ${dslrTips.map(tip => `<li>${tip}</li>`).join('')}
      </ul>` : ''}
      ` : `
      <div class="skip-note">
        <p>Photography section skipped — conditions aren't favorable enough to warrant camera settings today. We'll include them when the sky is worth shooting. 📷</p>
      </div>
      `}

    </div>
    <div class="footer">
      <p><strong>Seaside Beacon</strong> · Daily at 4:00 AM IST · <a href="${APP_URL}">seasidebeacon.com</a></p>
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