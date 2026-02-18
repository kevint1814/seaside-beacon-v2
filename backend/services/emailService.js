// ==========================================
// Email Service - Brevo (primary) / SendGrid (backup)
// General-audience-first, honest tone
// LIGHT MODE: warm tones, email-safe CSS, works on ALL clients
// ENV: EMAIL_PROVIDER=brevo (default) or sendgrid
// ==========================================

const nodemailer = require('nodemailer');
let nodemailerSendgrid;
try { nodemailerSendgrid = require('nodemailer-sendgrid'); }
catch (e) { /* SendGrid transport not installed — Brevo only */ }

const APP_URL = process.env.APP_URL || 'https://seasidebeacon.com';
const API_URL = process.env.API_URL || 'https://api.seasidebeacon.com';

const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || 'brevo').toLowerCase();

/**
 * Send email via Brevo REST API (no nodemailer needed)
 */
async function sendViaBrevo(mailOptions) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY not set');

  const payload = {
    sender: { name: mailOptions.from.name, email: mailOptions.from.address },
    to: [{ email: mailOptions.to }],
    subject: mailOptions.subject,
    htmlContent: mailOptions.html,
    textContent: mailOptions.text,
    headers: {
      'List-Unsubscribe': mailOptions.headers['List-Unsubscribe']
    }
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Brevo API ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  return { messageId: data.messageId || data.messageIds?.[0] || 'brevo-sent' };
}

/**
 * Send email via SendGrid (nodemailer transport)
 */
async function sendViaSendGrid(mailOptions) {
  if (!process.env.SENDGRID_API_KEY || !nodemailerSendgrid) {
    throw new Error('SendGrid not configured');
  }
  const transporter = nodemailer.createTransport(
    nodemailerSendgrid({ apiKey: process.env.SENDGRID_API_KEY })
  );
  return transporter.sendMail(mailOptions);
}

/**
 * Send email — routes to active provider, falls back to other on failure
 */
async function sendEmail(mailOptions) {
  const primary = EMAIL_PROVIDER === 'sendgrid' ? sendViaSendGrid : sendViaBrevo;
  const fallback = EMAIL_PROVIDER === 'sendgrid' ? sendViaBrevo : sendViaSendGrid;

  try {
    return await primary(mailOptions);
  } catch (primaryErr) {
    console.warn(`⚠️ Primary (${EMAIL_PROVIDER}) failed: ${primaryErr.message}`);
    try {
      console.log(`🔄 Trying fallback provider...`);
      return await fallback(mailOptions);
    } catch (fallbackErr) {
      console.error(`❌ Fallback also failed: ${fallbackErr.message}`);
      throw primaryErr;
    }
  }
}

/**
 * Generate unsubscribe URL (GET link for one-click unsubscribe)
 */
function getUnsubscribeUrl(email) {
  return `${API_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`;
}

/**
 * Send welcome email — general audience first
 * EMAIL-SAFE: solid colors, no rgba, no gradients
 */
async function sendWelcomeEmail(subscriberEmail, beachName) {
  try {
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
      subject: '🌅 Welcome to Seaside Beacon — Honest sunrise forecasts, starting tomorrow',
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
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,600&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <!--[if mso]><style>*{font-family:Arial,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f5f0ea;-webkit-text-size-adjust:none;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f0ea">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- ═══ HEADER ═══ -->
        <tr><td bgcolor="#C4733A" style="padding:52px 40px 42px;text-align:center;">

          <p style="margin:0 0 4px;font-size:28px;line-height:1;">☀️</p>
          <p style="margin:0 0 6px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:3px;color:#f5e8d8;">Welcome to</p>
          <h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:600;color:#ffffff;letter-spacing:-0.5px;">Seaside Beacon</h1>
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#f5e0cc;letter-spacing:0.3px;">Honest sunrise forecasts for Chennai beaches</p>

        </td></tr>

        <!-- ═══ BODY ═══ -->
        <tr><td bgcolor="#ffffff" style="padding:0;">

          <!-- Beach badge -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:36px 40px 0;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr><td bgcolor="#FDF5EE" style="border:1px solid #E8D5C0;padding:8px 22px;">
                  <span style="font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:500;color:#c4733a;letter-spacing:0.3px;">📍 ${beachDisplay}</span>
                </td></tr>
              </table>
            </td></tr>
          </table>

          <!-- Main message -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:28px 40px 0;text-align:center;">
              <h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#2a2420;letter-spacing:-0.3px;">You're all set.</h2>
              <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.75;color:#6b6058;">Every morning at <strong style="color:#2a2420;">4:00 AM IST</strong>, we study the atmosphere and send you an honest forecast — what tomorrow's sky will actually look like at your beach, and whether it's worth the early alarm.</p>
            </td></tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:32px 40px;">
              <div style="height:1px;background-color:#E8DDD0;"></div>
            </td></tr>
          </table>

          <!-- What you'll get -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px;">
              <p style="margin:0 0 20px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:#a09080;">What you'll get</p>

              <!-- Feature 1 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FDF5EE" style="width:32px;height:32px;border:1px solid #E8D5C0;text-align:center;line-height:32px;font-size:15px;">🌅</td></tr></table>
                  </td>
                  <td style="padding-left:14px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;color:#2a2420;">Honest Verdict</p>
                    <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:#8a7e72;">Is tomorrow's sunrise worth the early alarm, or should you sleep in? No sugarcoating.</p>
                  </td>
                </tr>
              </table>

              <!-- Feature 2 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FDF5EE" style="width:32px;height:32px;border:1px solid #E8D5C0;text-align:center;line-height:32px;font-size:15px;">🌤️</td></tr></table>
                  </td>
                  <td style="padding-left:14px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;color:#2a2420;">What You'll Actually See</p>
                    <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:#8a7e72;">Specific sky colors, light quality, and beach atmosphere — so you're never disappointed.</p>
                  </td>
                </tr>
              </table>

              <!-- Feature 3 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FDF5EE" style="width:32px;height:32px;border:1px solid #E8D5C0;text-align:center;line-height:32px;font-size:15px;">🏖️</td></tr></table>
                  </td>
                  <td style="padding-left:14px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;color:#2a2420;">Beach Comparison</p>
                    <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:#8a7e72;">All 4 Chennai beaches rated — or honestly told "none are great today" when that's the truth.</p>
                  </td>
                </tr>
              </table>

              <!-- Feature 4 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;">
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FDF5EE" style="width:32px;height:32px;border:1px solid #E8D5C0;text-align:center;line-height:32px;font-size:15px;">📸</td></tr></table>
                  </td>
                  <td style="padding-left:14px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;color:#2a2420;">Photography Tips</p>
                    <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:#8a7e72;">Camera settings and composition tips — with explanations of why each setting works for the day's conditions.</p>
                  </td>
                </tr>
              </table>

            </td></tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:28px 40px;">
              <div style="height:1px;background-color:#E8DDD0;"></div>
            </td></tr>
          </table>

          <!-- First forecast callout -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#FDF5EE" style="border:1px solid #E8D5C0;padding:22px 24px;text-align:center;">
                  <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:600;color:#2a2420;">Your first forecast arrives tomorrow</p>
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:#8a7e72;">4:00 AM IST · If conditions are good, set your alarm for 5:30 AM to catch the peak color window.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>

        </td></tr>

        <!-- ═══ FOOTER ═══ -->
        <tr><td bgcolor="#F0E8DE" style="padding:28px 40px;text-align:center;border-top:1px solid #E0D5C8;">

          <p style="margin:0 0 6px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;font-weight:500;color:#8a7e72;">Seaside Beacon · Made with ☀️ in Chennai</p>
          <p style="margin:0 0 10px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;color:#a09888;">You're subscribed to daily sunrise forecasts for ${beachDisplay}.</p>
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;">
            <a href="${unsubscribeUrl}" style="color:#C4733A;text-decoration:none;">Unsubscribe</a>
            <span style="color:#d0c8c0;margin:0 8px;">·</span>
            <a href="${APP_URL}" style="color:#C4733A;text-decoration:none;">Visit Website</a>
          </p>

        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
    };

    const info = await sendEmail(mailOptions);
    console.log(`✅ Welcome email sent to ${subscriberEmail} via ${EMAIL_PROVIDER}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Welcome email error:', error.message);
    throw error;
  }
}

/**
 * Send daily prediction email
 * General audience first, photography secondary
 * LIGHT MODE: warm tones, email-safe CSS, works on ALL clients
 */
async function sendDailyPredictionEmail(subscriberEmail, weatherData, photographyInsights) {
  try {
    const unsubscribeUrl = getUnsubscribeUrl(subscriberEmail);

    const { beach, forecast, prediction } = weatherData;
    const beachDisplayNames = weatherData.allBeachNames || {};
    const { score, verdict, atmosphericLabels } = prediction;
    const { cloudCover, humidity, visibility, windSpeed, temperature, precipProbability } = forecast;

    // Score-dependent colors — all visible on white/light bg
    const statusColor = score >= 85 ? '#059669' : score >= 70 ? '#0284c7' : score >= 55 ? '#D97706' : score >= 40 ? '#EA580C' : '#DC2626';
    const statusBg = score >= 85 ? '#ECFDF5' : score >= 70 ? '#EFF6FF' : score >= 55 ? '#FFFBEB' : score >= 40 ? '#FFF7ED' : '#FEF2F2';
    const statusBorder = score >= 85 ? '#A7F3D0' : score >= 70 ? '#BFDBFE' : score >= 55 ? '#FDE68A' : score >= 40 ? '#FED7AA' : '#FECACA';
    const headerBg = score >= 85 ? '#059669' : score >= 70 ? '#C4733A' : score >= 55 ? '#C4733A' : score >= 40 ? '#8B6040' : '#7A5A4A';
    const verdictEmoji = score >= 85 ? '🔥' : score >= 70 ? '🌅' : score >= 55 ? '☀️' : score >= 40 ? '☁️' : '🌫️';

    // Extract insights
    const insight = photographyInsights.insight || '';
    const greeting = photographyInsights.greeting || '';
    const goldenHour = photographyInsights.goldenHour || { start: 'N/A', peak: 'N/A', end: 'N/A', quality: 'N/A' };
    const sunriseExp = photographyInsights.sunriseExperience || {};
    const dslrSettings = photographyInsights.dslr?.cameraSettings || {};
    const dslrTips = photographyInsights.dslr?.compositionTips || [];
    const beachComp = photographyInsights.beachComparison || null;

    // Cloud label
    const cloudLabel = atmosphericLabels?.cloudLabel || (cloudCover >= 30 && cloudCover <= 60 ? 'Optimal' : cloudCover < 30 ? 'Too Clear' : 'Overcast');

    const includePhotography = score >= 40;

    // Recommendation
    let recLabel, recColor, recBg, recBorder;
    if (score >= 70) { recLabel = '✓ Worth the early alarm'; recColor = '#059669'; recBg = '#ECFDF5'; recBorder = '#A7F3D0'; }
    else if (score >= 50) { recLabel = '~ Pleasant, not spectacular'; recColor = '#D97706'; recBg = '#FFFBEB'; recBorder = '#FDE68A'; }
    else if (score >= 30) { recLabel = '✗ Underwhelming sunrise expected'; recColor = '#EA580C'; recBg = '#FFF7ED'; recBorder = '#FED7AA'; }
    else { recLabel = '— Sunrise likely not visible'; recColor = '#DC2626'; recBg = '#FEF2F2'; recBorder = '#FECACA'; }

    // Condition badge colors
    const cloudBadgeColor = cloudCover >= 30 && cloudCover <= 75 ? '#059669' : cloudCover < 30 ? '#B45A06' : '#B91C1C';
    const cloudBadgeBg = cloudCover >= 30 && cloudCover <= 75 ? '#ECFDF5' : cloudCover < 30 ? '#FFFBEB' : '#FEF2F2';
    const humidBadgeColor = humidity <= 55 ? '#059669' : humidity <= 70 ? '#B45A06' : '#B91C1C';
    const humidBadgeBg = humidity <= 55 ? '#ECFDF5' : humidity <= 70 ? '#FFFBEB' : '#FEF2F2';
    const visBadgeColor = visibility >= 8 ? '#059669' : visibility >= 5 ? '#B45A06' : '#B91C1C';
    const visBadgeBg = visibility >= 8 ? '#ECFDF5' : visibility >= 5 ? '#FFFBEB' : '#FEF2F2';

    const mailOptions = {
      from: { name: 'Seaside Beacon', address: process.env.SENDER_EMAIL || 'forecast@seasidebeacon.com' },
      to: subscriberEmail,
      subject: `${verdictEmoji} ${verdict} Sunrise This Morning — ${beach} (${score}/100)`,
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
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <!--[if mso]><style>*{font-family:Arial,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f5f0ea;-webkit-text-size-adjust:none;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f0ea">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- ═══ HEADER ═══ -->
        <tr><td bgcolor="${headerBg}" style="padding:44px 40px 24px;text-align:center;">

          <p style="margin:0 0 24px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2.5px;color:#a09080;">Seaside Beacon · ${beach}</p>
          <p style="margin:0 0 10px;font-size:40px;line-height:1;">${verdictEmoji}</p>
          <h1 style="margin:0 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${verdict}</h1>
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;color:#8a7e72;">This Morning's Sunrise Forecast</p>

        </td></tr>

        <!-- ═══ SCORE ═══ -->
        <tr><td bgcolor="#ffffff" style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:32px 40px;text-align:center;">

              <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:72px;font-weight:700;color:${statusColor};line-height:1;letter-spacing:-2px;">${score}</p>
              <p style="margin:4px 0 16px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#8a7e72;">Sunrise Quality Score / 100</p>

              <!-- Recommendation badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr><td bgcolor="${recBg}" style="border:1px solid ${recBorder};padding:7px 18px;">
                  <span style="font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;font-weight:600;color:${recColor};">${recLabel}</span>
                </td></tr>
              </table>

              ${score >= 50 ? `
              <!-- Golden hour -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0;">
                <tr><td bgcolor="#FDF5EE" style="border:1px solid #E8D5C0;padding:10px 20px;">
                  <span style="font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:600;color:#c4733a;">⏰ Peak Color: ${goldenHour.peak || goldenHour.start} · Window: ${goldenHour.start} – ${goldenHour.end}</span>
                </td></tr>
              </table>` : ''}

            </td></tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px;">
              <div style="height:1px;background-color:#E8DDD0;"></div>
            </td></tr>
          </table>

          <!-- ═══ INSIGHT ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:28px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#FDF5EE" style="border:1px solid #E8D5C0;padding:20px 22px;">
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.7;color:#6b6058;"><strong style="color:#2a2420;">${greeting}</strong><br>${insight}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>

          ${sunriseExp.whatYoullSee || sunriseExp.beachVibes ? `
          <!-- ═══ WHAT TO EXPECT ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 24px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:#a09080;">🌅 What to Expect</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:20px 22px;">
                  ${sunriseExp.whatYoullSee ? `<p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#a09080;">What you'll see</p><p style="margin:0 0 ${sunriseExp.beachVibes ? '16px' : '0'};font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.65;color:#6b6058;">${sunriseExp.whatYoullSee}</p>` : ''}
                  ${sunriseExp.beachVibes ? `<p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#a09080;">Beach vibes</p><p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.65;color:#6b6058;">${sunriseExp.beachVibes}</p>` : ''}
                </td></tr>
              </table>
            </td></tr>
          </table>` : ''}

          ${sunriseExp.worthWakingUp ? `
          <!-- ═══ WORTH WAKING UP ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="${recBg}" style="border:1px solid ${recBorder};padding:18px 22px;">
                  <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:600;color:${recColor};">Worth waking up?</p>
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.6;color:#6b6058;">${sunriseExp.worthWakingUp}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>` : ''}

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:4px 40px 24px;">
              <div style="height:1px;background-color:#E8DDD0;"></div>
            </td></tr>
          </table>

          <!-- ═══ CONDITIONS 2x2 ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 24px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:#a09080;">🌤️ Atmospheric Conditions</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="48%" style="padding:0 6px 10px 0;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:14px 16px;">
                        <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#a09080;">☁️ Cloud Cover</p>
                        <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:#2a2420;">${cloudCover}%</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${cloudBadgeBg}" style="padding:2px 8px;"><span style="font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;color:${cloudBadgeColor};">${cloudLabel}</span></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                  <td width="48%" style="padding:0 0 10px 6px;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:14px 16px;">
                        <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#a09080;">💧 Humidity</p>
                        <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:#2a2420;">${humidity}%</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${humidBadgeBg}" style="padding:2px 8px;"><span style="font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;color:${humidBadgeColor};">${atmosphericLabels?.humidityLabel || (humidity <= 55 ? 'Very Good' : humidity <= 70 ? 'Moderate' : 'High')}</span></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td width="48%" style="padding:0 6px 0 0;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:14px 16px;">
                        <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#a09080;">👁️ Visibility</p>
                        <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:#2a2420;">${visibility}km</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${visBadgeBg}" style="padding:2px 8px;"><span style="font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;color:${visBadgeColor};">${atmosphericLabels?.visibilityLabel || (visibility >= 10 ? 'Excellent' : visibility >= 8 ? 'Good' : 'Fair')}</span></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                  <td width="48%" style="padding:0 0 0 6px;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:14px 16px;">
                        <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#a09080;">🌡️ Temperature</p>
                        <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:#2a2420;">${temperature}°C</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ECFDF5" style="padding:2px 8px;"><span style="font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;color:#059669;">At Sunrise</span></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          ${beachComp ? `
          <!-- ═══ BEST BEACH ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 24px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:#a09080;">🏖️ Today's Best Beach</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#ECFDF5" style="border:1px solid #A7F3D0;padding:18px 22px;">
                  <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:600;color:#059669;">⭐ Recommended</p>
                  <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;font-weight:600;color:#2a2420;">${beachDisplayNames[beachComp.todaysBest] || beach}</p>
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:#8a7e72;">${beachComp.reason || ''}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>` : ''}

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:4px 40px 24px;">
              <div style="height:1px;background-color:#E8DDD0;"></div>
            </td></tr>
          </table>

          ${includePhotography ? `
          <!-- ═══ PHOTOGRAPHY 2x2 ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 20px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:#a09080;">📷 Photography Settings</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="48%" style="padding:0 6px 10px 0;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:14px 16px;text-align:center;">
                        <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#a09080;">ISO</p>
                        <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:#2a2420;">${dslrSettings.iso || '200'}</p>
                      </td></tr>
                    </table>
                  </td>
                  <td width="48%" style="padding:0 0 10px 6px;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:14px 16px;text-align:center;">
                        <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#a09080;">Shutter</p>
                        <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:#2a2420;">${dslrSettings.shutterSpeed || '1/125s'}</p>
                      </td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td width="48%" style="padding:0 6px 0 0;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:14px 16px;text-align:center;">
                        <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#a09080;">Aperture</p>
                        <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:#2a2420;">${dslrSettings.aperture || 'f/8'}</p>
                      </td></tr>
                    </table>
                  </td>
                  <td width="48%" style="padding:0 0 0 6px;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:14px 16px;text-align:center;">
                        <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#a09080;">White Balance</p>
                        <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:#2a2420;">${dslrSettings.whiteBalance || '5500K'}</p>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          ${dslrTips.length ? `
          <!-- ═══ TIPS ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 28px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:#a09080;">💡 Composition Tips</p>
              ${dslrTips.map(tip => `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:12px 16px;">
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.6;color:#6b6058;">📸 ${tip}</p>
                </td></tr>
              </table>`).join('')}
            </td></tr>
          </table>` : ''}
          ` : `
          <!-- ═══ PHOTOGRAPHY SKIPPED ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#FAF8F5" style="border:1px solid #E8E0D5;padding:22px 24px;text-align:center;">
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.6;color:#8a7e72;">Photography section skipped — conditions aren't favorable enough today. We'll include camera settings when the sky is worth shooting. 📷</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
          `}

        </td></tr>

        <!-- ═══ FOOTER ═══ -->
        <tr><td bgcolor="#F0E8DE" style="padding:24px 40px;text-align:center;border-top:1px solid #E0D5C8;">

          <p style="margin:0 0 5px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;font-weight:500;color:#8a7e72;">Seaside Beacon · Daily at 4:00 AM IST · <a href="${APP_URL}" style="color:#C4733A;text-decoration:none;">seasidebeacon.com</a></p>
          <p style="margin:0 0 8px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;color:#a09888;">You're receiving this because you subscribed for ${beach} forecasts.</p>
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;">
            <a href="${unsubscribeUrl}" style="color:#C4733A;text-decoration:none;">Unsubscribe</a>
          </p>

        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
    };

    const info = await sendEmail(mailOptions);
    console.log(`✅ Daily prediction sent to ${subscriberEmail} via ${EMAIL_PROVIDER}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Daily email error:', error.message);
    throw error;
  }
}

/**
 * Test email — sends a quick test to verify provider works
 */
async function sendTestEmail(toEmail) {
  const mailOptions = {
    from: { name: 'Seaside Beacon', address: process.env.SENDER_EMAIL || 'forecast@seasidebeacon.com' },
    to: toEmail,
    subject: '🧪 Seaside Beacon — Email Test',
    headers: { 'List-Unsubscribe': `<${getUnsubscribeUrl(toEmail)}>` },
    text: `This is a test email from Seaside Beacon.\nProvider: ${EMAIL_PROVIDER}\nTimestamp: ${new Date().toISOString()}\n\nIf you received this, the email system is working correctly.`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f5f0ea;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f0ea">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="500" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;width:100%;">
        <tr><td bgcolor="#ffffff" style="padding:32px;text-align:center;">
          <h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;color:#2a2420;">🧪 Email Test — Passed!</h2>
          <p style="margin:0 0 12px;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:14px;color:#6b6058;">This is a test email from <strong style="color:#c4733a;">Seaside Beacon</strong>.</p>
          <p style="margin:0 0 12px;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:13px;color:#8a7e72;">Provider: <strong style="color:#2a2420;">${EMAIL_PROVIDER}</strong><br>Timestamp: <strong style="color:#2a2420;">${new Date().toISOString()}</strong></p>
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:14px;font-weight:600;color:#059669;">✅ Email system working correctly.</p>
        </td></tr>
        <tr><td bgcolor="#F0E8DE" style="padding:16px;text-align:center;border-top:1px solid #E0D5C8;">
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,sans-serif;font-size:12px;color:#8a7e72;">Seaside Beacon · <a href="${APP_URL}" style="color:#C4733A;text-decoration:none;">seasidebeacon.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  };

  const info = await sendEmail(mailOptions);
  console.log(`✅ Test email sent to ${toEmail} via ${EMAIL_PROVIDER}`);
  return { success: true, messageId: info.messageId, provider: EMAIL_PROVIDER };
}

module.exports = { sendWelcomeEmail, sendDailyPredictionEmail, sendTestEmail };