// ==========================================
// Email Service - Brevo (primary) / SendGrid (backup)
// General-audience-first, honest tone
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
      throw primaryErr; // throw original error
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
<body style="margin:0;padding:0;background:#08070d;-webkit-text-size-adjust:none;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#08070d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- ═══ HEADER — Sunrise gradient with brand ═══ -->
        <tr><td style="background:linear-gradient(180deg,#1a1208 0%,#2d1a0e 40%,#4a2818 70%,#6b3520 100%);border-radius:20px 20px 0 0;padding:52px 40px 42px;text-align:center;">

          <!-- Sun icon -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
            <tr><td style="width:44px;height:44px;border-radius:50%;background:radial-gradient(circle,rgba(255,210,120,0.3) 0%,rgba(196,115,58,0.12) 60%,transparent 100%);text-align:center;line-height:44px;">
              <span style="font-size:22px;">☀️</span>
            </td></tr>
          </table>

          <!-- Brand -->
          <p style="margin:0 0 6px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,0.45);">Welcome to</p>
          <h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:600;color:rgba(255,252,245,0.95);letter-spacing:-0.5px;">Seaside Beacon</h1>
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:rgba(255,255,255,0.50);letter-spacing:0.3px;">Honest sunrise forecasts for Chennai beaches</p>

        </td></tr>

        <!-- ═══ BODY — Dark glass card ═══ -->
        <tr><td style="background:#0f0e14;padding:0;">

          <!-- Beach badge -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:36px 40px 0;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr><td style="background:rgba(196,115,58,0.10);border:1px solid rgba(196,115,58,0.25);border-radius:50px;padding:8px 22px;">
                  <span style="font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:500;color:#c4733a;letter-spacing:0.3px;">📍 ${beachDisplay}</span>
                </td></tr>
              </table>
            </td></tr>
          </table>

          <!-- Main message -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:28px 40px 0;text-align:center;">
              <h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:rgba(255,252,245,0.92);letter-spacing:-0.3px;">You're all set.</h2>
              <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.75;color:rgba(255,255,255,0.55);">Every morning at <strong style="color:rgba(255,255,255,0.80);">4:00 AM IST</strong>, we study the atmosphere and send you an honest forecast — what tomorrow's sky will actually look like at your beach, and whether it's worth the early alarm.</p>
            </td></tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:32px 40px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(196,115,58,0.18),transparent);"></div>
            </td></tr>
          </table>

          <!-- What you'll get — 4 items stacked -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px;">
              <p style="margin:0 0 20px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.35);">What you'll get</p>

              <!-- Feature 1 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px;">
                    <div style="width:32px;height:32px;border-radius:10px;background:rgba(196,115,58,0.08);border:1px solid rgba(196,115,58,0.15);text-align:center;line-height:32px;font-size:15px;">🌅</div>
                  </td>
                  <td style="padding-left:14px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;color:rgba(255,252,245,0.88);">Honest Verdict</p>
                    <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.42);">Is tomorrow's sunrise worth the early alarm, or should you sleep in? No sugarcoating.</p>
                  </td>
                </tr>
              </table>

              <!-- Feature 2 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px;">
                    <div style="width:32px;height:32px;border-radius:10px;background:rgba(196,115,58,0.08);border:1px solid rgba(196,115,58,0.15);text-align:center;line-height:32px;font-size:15px;">🌤️</div>
                  </td>
                  <td style="padding-left:14px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;color:rgba(255,252,245,0.88);">What You'll Actually See</p>
                    <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.42);">Specific sky colors, light quality, and beach atmosphere — so you're never disappointed.</p>
                  </td>
                </tr>
              </table>

              <!-- Feature 3 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px;">
                    <div style="width:32px;height:32px;border-radius:10px;background:rgba(196,115,58,0.08);border:1px solid rgba(196,115,58,0.15);text-align:center;line-height:32px;font-size:15px;">🏖️</div>
                  </td>
                  <td style="padding-left:14px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;color:rgba(255,252,245,0.88);">Beach Comparison</p>
                    <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.42);">All 4 Chennai beaches rated — or honestly told "none are great today" when that's the truth.</p>
                  </td>
                </tr>
              </table>

              <!-- Feature 4 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;">
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px;">
                    <div style="width:32px;height:32px;border-radius:10px;background:rgba(196,115,58,0.08);border:1px solid rgba(196,115,58,0.15);text-align:center;line-height:32px;font-size:15px;">📸</div>
                  </td>
                  <td style="padding-left:14px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;color:rgba(255,252,245,0.88);">Photography Tips</p>
                    <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.42);">Camera settings and composition tips — with explanations of why each setting works for the day's conditions.</p>
                  </td>
                </tr>
              </table>

            </td></tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:28px 40px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(196,115,58,0.18),transparent);"></div>
            </td></tr>
          </table>

          <!-- First forecast callout -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(196,115,58,0.06);border:1px solid rgba(196,115,58,0.14);border-radius:14px;">
                <tr><td style="padding:22px 24px;text-align:center;">
                  <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:600;color:rgba(255,252,245,0.90);">Your first forecast arrives tomorrow</p>
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.45);">4:00 AM IST · If conditions are good, set your alarm for 5:30 AM to catch the peak color window.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>

        </td></tr>

        <!-- ═══ FOOTER ═══ -->
        <tr><td style="background:#0a0913;border-radius:0 0 20px 20px;padding:28px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.04);">

          <p style="margin:0 0 6px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;font-weight:500;color:rgba(255,255,255,0.35);">Seaside Beacon · Made with ☀️ in Chennai</p>
          <p style="margin:0 0 10px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;color:rgba(255,255,255,0.25);">You're subscribed to daily sunrise forecasts for ${beachDisplay}.</p>
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;">
            <a href="${unsubscribeUrl}" style="color:rgba(196,115,58,0.65);text-decoration:none;">Unsubscribe</a>
            <span style="color:rgba(255,255,255,0.15);margin:0 8px;">·</span>
            <a href="${APP_URL}" style="color:rgba(196,115,58,0.65);text-decoration:none;">Visit Website</a>
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
 * Conditionally shorter on poor days
 */
async function sendDailyPredictionEmail(subscriberEmail, weatherData, photographyInsights) {
  try {
    const unsubscribeUrl = getUnsubscribeUrl(subscriberEmail);

    const { beach, forecast, prediction } = weatherData;
    const beachDisplayNames = weatherData.allBeachNames || {};
    const { score, verdict, atmosphericLabels } = prediction;
    const { cloudCover, humidity, visibility, windSpeed, temperature, precipProbability } = forecast;

    const statusColor = score >= 85 ? '#059669' : score >= 70 ? '#0284c7' : score >= 55 ? '#D97706' : score >= 40 ? '#EA580C' : '#DC2626';
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
<body style="margin:0;padding:0;background:#08070d;-webkit-text-size-adjust:none;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#08070d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- ═══ HEADER — Score-colored sunrise gradient ═══ -->
        <tr><td style="background:linear-gradient(180deg,#1a1208 0%,${score >= 70 ? '#1a2818' : score >= 50 ? '#2d1a0e' : '#1a1015'} 50%,${score >= 70 ? '#1e3a1e' : score >= 50 ? '#4a2818' : '#2a1520'} 100%);border-radius:20px 20px 0 0;padding:44px 40px 20px;text-align:center;">

          <!-- Brand -->
          <p style="margin:0 0 24px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,0.35);">Seaside Beacon · ${beach}</p>

          <!-- Verdict emoji -->
          <p style="margin:0 0 10px;font-size:40px;line-height:1;">${verdictEmoji}</p>

          <!-- Verdict text -->
          <h1 style="margin:0 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:700;color:rgba(255,252,245,0.95);letter-spacing:-0.5px;">${verdict}</h1>
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;color:rgba(255,255,255,0.40);">This Morning's Sunrise Forecast</p>

        </td></tr>

        <!-- ═══ SCORE SECTION ═══ -->
        <tr><td style="background:#0f0e14;padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:32px 40px;text-align:center;">

              <!-- Score number -->
              <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:72px;font-weight:700;color:${statusColor};line-height:1;letter-spacing:-2px;">${score}</p>
              <p style="margin:4px 0 16px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.30);">Sunrise Quality Score / 100</p>

              <!-- Recommendation badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr><td style="background:${recColor}12;border:1px solid ${recColor}35;border-radius:50px;padding:7px 18px;">
                  <span style="font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;font-weight:600;color:${recColor};">${recLabel}</span>
                </td></tr>
              </table>

              ${score >= 50 ? `
              <!-- Golden hour -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0;">
                <tr><td style="background:rgba(196,115,58,0.08);border:1px solid rgba(196,115,58,0.18);border-radius:12px;padding:10px 20px;">
                  <span style="font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:600;color:#c4733a;">⏰ Peak Color: ${goldenHour.peak || goldenHour.start} · Window: ${goldenHour.start} – ${goldenHour.end}</span>
                </td></tr>
              </table>` : ''}

            </td></tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(196,115,58,0.15),transparent);"></div>
            </td></tr>
          </table>

          <!-- ═══ INSIGHT BOX ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:28px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(196,115,58,0.05);border:1px solid rgba(196,115,58,0.12);border-radius:14px;">
                <tr><td style="padding:20px 22px;">
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.55);"><strong style="color:rgba(255,252,245,0.88);">${greeting}</strong><br>${insight}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>

          ${sunriseExp.whatYoullSee || sunriseExp.beachVibes ? `
          <!-- ═══ WHAT TO EXPECT ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 24px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.30);">🌅 What to Expect</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;">
                <tr><td style="padding:20px 22px;">
                  ${sunriseExp.whatYoullSee ? `<p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.30);">What you'll see</p><p style="margin:0 0 ${sunriseExp.beachVibes ? '16px' : '0'};font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.65;color:rgba(255,255,255,0.55);">${sunriseExp.whatYoullSee}</p>` : ''}
                  ${sunriseExp.beachVibes ? `<p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.30);">Beach vibes</p><p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.65;color:rgba(255,255,255,0.55);">${sunriseExp.beachVibes}</p>` : ''}
                </td></tr>
              </table>
            </td></tr>
          </table>` : ''}

          ${sunriseExp.worthWakingUp ? `
          <!-- ═══ WORTH WAKING UP ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${recColor}08;border:1px solid ${recColor}20;border-radius:14px;">
                <tr><td style="padding:18px 22px;">
                  <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:600;color:${recColor};">Worth waking up?</p>
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.55);">${sunriseExp.worthWakingUp}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>` : ''}

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:4px 40px 24px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(196,115,58,0.12),transparent);"></div>
            </td></tr>
          </table>

          <!-- ═══ ATMOSPHERIC CONDITIONS — 2x2 grid ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 24px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.30);">🌤️ Atmospheric Conditions</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="48%" style="padding:0 6px 10px 0;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;">
                      <tr><td style="padding:14px 16px;">
                        <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.30);">☁️ Cloud Cover</p>
                        <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:rgba(255,252,245,0.90);">${cloudCover}%</p>
                        <span style="font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;padding:2px 8px;border-radius:8px;background:${cloudCover >= 30 && cloudCover <= 75 ? 'rgba(16,185,129,0.12);color:#34d399' : cloudCover < 30 ? 'rgba(245,158,11,0.12);color:#fbbf24' : 'rgba(239,68,68,0.12);color:#f87171'};">${cloudLabel}</span>
                      </td></tr>
                    </table>
                  </td>
                  <td width="48%" style="padding:0 0 10px 6px;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;">
                      <tr><td style="padding:14px 16px;">
                        <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.30);">💧 Humidity</p>
                        <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:rgba(255,252,245,0.90);">${humidity}%</p>
                        <span style="font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;padding:2px 8px;border-radius:8px;background:${humidity <= 55 ? 'rgba(16,185,129,0.12);color:#34d399' : humidity <= 70 ? 'rgba(245,158,11,0.12);color:#fbbf24' : 'rgba(239,68,68,0.12);color:#f87171'};">${atmosphericLabels?.humidityLabel || (humidity <= 55 ? 'Very Good' : humidity <= 70 ? 'Moderate' : 'High')}</span>
                      </td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td width="48%" style="padding:0 6px 0 0;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;">
                      <tr><td style="padding:14px 16px;">
                        <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.30);">👁️ Visibility</p>
                        <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:rgba(255,252,245,0.90);">${visibility}km</p>
                        <span style="font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;padding:2px 8px;border-radius:8px;background:${visibility >= 8 ? 'rgba(16,185,129,0.12);color:#34d399' : visibility >= 5 ? 'rgba(245,158,11,0.12);color:#fbbf24' : 'rgba(239,68,68,0.12);color:#f87171'};">${atmosphericLabels?.visibilityLabel || (visibility >= 10 ? 'Excellent' : visibility >= 8 ? 'Very Good' : 'Good')}</span>
                      </td></tr>
                    </table>
                  </td>
                  <td width="48%" style="padding:0 0 0 6px;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;">
                      <tr><td style="padding:14px 16px;">
                        <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.30);">🌡️ Temperature</p>
                        <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:rgba(255,252,245,0.90);">${temperature}°C</p>
                        <span style="font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;padding:2px 8px;border-radius:8px;background:rgba(16,185,129,0.12);color:#34d399;">At Sunrise</span>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          ${beachComp ? `
          <!-- ═══ TODAY'S BEST BEACH ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 24px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.30);">🏖️ Today's Best Beach</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:14px;">
                <tr><td style="padding:18px 22px;">
                  <p style="margin:0 0 2px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:600;color:#34d399;">⭐ Recommended</p>
                  <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;font-weight:600;color:rgba(255,252,245,0.90);">${beachDisplayNames[beachComp.todaysBest] || beach}</p>
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.42);">${beachComp.reason || ''}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>` : ''}

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:4px 40px 24px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(196,115,58,0.12),transparent);"></div>
            </td></tr>
          </table>

          ${includePhotography ? `
          <!-- ═══ PHOTOGRAPHY SETTINGS — 2x2 dark cards ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 20px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.30);">📷 Photography Settings</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="48%" style="padding:0 6px 10px 0;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.06);border-radius:12px;">
                      <tr><td style="padding:14px 16px;text-align:center;">
                        <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.30);">ISO</p>
                        <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:rgba(255,252,245,0.92);">${dslrSettings.iso || '200'}</p>
                      </td></tr>
                    </table>
                  </td>
                  <td width="48%" style="padding:0 0 10px 6px;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.06);border-radius:12px;">
                      <tr><td style="padding:14px 16px;text-align:center;">
                        <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.30);">Shutter</p>
                        <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:rgba(255,252,245,0.92);">${dslrSettings.shutterSpeed || '1/125s'}</p>
                      </td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td width="48%" style="padding:0 6px 0 0;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.06);border-radius:12px;">
                      <tr><td style="padding:14px 16px;text-align:center;">
                        <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.30);">Aperture</p>
                        <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:rgba(255,252,245,0.92);">${dslrSettings.aperture || 'f/8'}</p>
                      </td></tr>
                    </table>
                  </td>
                  <td width="48%" style="padding:0 0 0 6px;vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.06);border-radius:12px;">
                      <tr><td style="padding:14px 16px;text-align:center;">
                        <p style="margin:0 0 4px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.30);">White Balance</p>
                        <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:rgba(255,252,245,0.92);">${dslrSettings.whiteBalance || '5500K'}</p>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          ${dslrTips.length ? `
          <!-- ═══ COMPOSITION TIPS ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 28px;">
              <p style="margin:0 0 14px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.30);">💡 Composition Tips</p>
              ${dslrTips.map(tip => `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                <tr><td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px 16px;">
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.50);">📸 ${tip}</p>
                </td></tr>
              </table>`).join('')}
            </td></tr>
          </table>` : ''}
          ` : `
          <!-- ═══ PHOTOGRAPHY SKIPPED ═══ -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:14px;">
                <tr><td style="padding:22px 24px;text-align:center;">
                  <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.35);">Photography section skipped — conditions aren't favorable enough today. We'll include camera settings when the sky is worth shooting. 📷</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
          `}

        </td></tr>

        <!-- ═══ FOOTER ═══ -->
        <tr><td style="background:#0a0913;border-radius:0 0 20px 20px;padding:24px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.04);">

          <p style="margin:0 0 5px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;font-weight:500;color:rgba(255,255,255,0.32);">Seaside Beacon · Daily at 4:00 AM IST · <a href="${APP_URL}" style="color:rgba(196,115,58,0.60);text-decoration:none;">seasidebeacon.com</a></p>
          <p style="margin:0 0 8px;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;color:rgba(255,255,255,0.22);">You're receiving this because you subscribed for ${beach} forecasts.</p>
          <p style="margin:0;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;">
            <a href="${unsubscribeUrl}" style="color:rgba(196,115,58,0.55);text-decoration:none;">Unsubscribe</a>
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
<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: -apple-system, sans-serif; padding: 40px;">
  <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.1);">
    <h2 style="color: #D64828; margin: 0 0 16px 0;">🧪 Email Test — Passed!</h2>
    <p style="color: #555; line-height: 1.6;">This is a test email from <strong>Seaside Beacon</strong>.</p>
    <p style="color: #555; line-height: 1.6;">Provider: <strong>${EMAIL_PROVIDER}</strong><br>Timestamp: <strong>${new Date().toISOString()}</strong></p>
    <p style="color: #059669; font-weight: 600;">✅ If you received this, the email system is working correctly.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="color: #999; font-size: 12px;">Seaside Beacon · <a href="${APP_URL}" style="color: #E8834A;">seasidebeacon.com</a></p>
  </div>
</body></html>`
  };

  const info = await sendEmail(mailOptions);
  console.log(`✅ Test email sent to ${toEmail} via ${EMAIL_PROVIDER}`);
  return { success: true, messageId: info.messageId, provider: EMAIL_PROVIDER };
}

module.exports = { sendWelcomeEmail, sendDailyPredictionEmail, sendTestEmail };