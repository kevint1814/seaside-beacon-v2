// ==========================================
// Admin Notifications v3 — Daily 8 AM Digest
// ==========================================
// ONE summary email per day at 8:00 AM IST:
//   24h: new subs, unsubs, visits, forecasts
//   Lifetime: totals for all of the above
//   7-day table for trend spotting
// Instant alerts ONLY for feedback + photo uploads
// ==========================================

const cron = require('node-cron');
const Subscriber = require('../models/Subscriber');
const { getStats, getTodayIST } = require('./visitTracker');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@seasidebeacon.com';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'forecast@seasidebeacon.com';
const BREVO_API_KEY = process.env.BREVO_API_KEY;

const BEACH_NAMES = {
  marina: 'Marina Beach',
  elliot: "Elliot's Beach",
  covelong: 'Covelong Beach',
  thiruvanmiyur: 'Thiruvanmiyur Beach'
};

// ══════════════════════════════════════════
// Core email sender
// ══════════════════════════════════════════
async function sendAdminEmail(subject, bodyHtml, bodyText) {
  if (!BREVO_API_KEY) {
    console.warn('⚠️ BREVO_API_KEY not set, skipping admin email');
    return;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Seaside Beacon', email: SENDER_EMAIL },
        to: [{ email: ADMIN_EMAIL }],
        subject,
        htmlContent: bodyHtml,
        textContent: bodyText
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn(`⚠️ Admin email failed: ${res.status} ${err}`);
    }
  } catch (err) {
    console.warn(`⚠️ Admin email error: ${err.message}`);
  }
}

// ══════════════════════════════════════════
// DAILY DIGEST — 8:00 AM IST
// ══════════════════════════════════════════
async function sendDailyDigest() {
  try {
    console.log('📊 Generating daily admin digest...');

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // ── Subscriber data from MongoDB ──
    const newSubs = await Subscriber.find({
      createdAt: { $gte: twentyFourHoursAgo },
      isActive: true
    }).select('email preferredBeach createdAt -_id').lean();

    const totalActiveSubs = await Subscriber.countDocuments({ isActive: true });

    // ── Visit + analytics data from DailyVisit ──
    const stats = await getStats();

    // ── Format date ──
    const dateStr = now.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // ── Build subscriber rows ──
    let subRows = '';
    if (newSubs.length > 0) {
      subRows = newSubs.map(s => {
        const beach = BEACH_NAMES[s.preferredBeach] || s.preferredBeach;
        const time = new Date(s.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#D64828;">${s.email}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#555;">${beach}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#999;">${time}</td>
        </tr>`;
      }).join('');
    }

    // ── 7-day trend table ──
    let weekRows = '';
    if (stats.week.length > 0) {
      weekRows = stats.week.map(d => {
        const dayLabel = new Date(d.date + 'T12:00:00+05:30').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
        return `<tr>
          <td style="padding:5px 10px;font-size:12px;color:#777;">${dayLabel}</td>
          <td style="padding:5px 10px;font-size:12px;color:#333;font-weight:600;text-align:center;">${d.visits}</td>
          <td style="padding:5px 10px;font-size:12px;color:#333;text-align:center;">${d.uniqueVisits || 0}</td>
          <td style="padding:5px 10px;font-size:12px;color:#333;text-align:center;">${d.predictions || 0}</td>
          <td style="padding:5px 10px;font-size:12px;color:#059669;text-align:center;">+${d.newSubs || 0}</td>
          <td style="padding:5px 10px;font-size:12px;color:#dc2626;text-align:center;">-${d.unsubs || 0}</td>
        </tr>`;
      }).join('');
    }

    // ══════════════════════════════════════
    // HTML email template
    // ══════════════════════════════════════
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;background:#f5f5f5;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:24px 28px;">
      <p style="color:#E8834A;font-size:11px;font-weight:700;letter-spacing:1.5px;margin:0 0 4px 0;">DAILY DIGEST</p>
      <h1 style="color:white;margin:0;font-size:20px;font-weight:600;">☀️ Seaside Beacon</h1>
      <p style="color:rgba(255,255,255,0.45);margin:4px 0 0 0;font-size:12px;">${dateStr}</p>
    </div>

    <div style="padding:24px 28px;">

      <!-- ━━ 24-HOUR STATS ━━ -->
      <p style="font-size:10px;font-weight:700;color:#bbb;letter-spacing:1.5px;margin:0 0 12px 0;">LAST 24 HOURS</p>
      <table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin:0 0 20px 0;">
        <tr>
          <td style="padding:14px 8px;background:#f0fdf4;border-radius:10px;text-align:center;">
            <p style="font-size:26px;font-weight:700;color:#059669;margin:0;">+${newSubs.length}</p>
            <p style="font-size:10px;color:#059669;margin:3px 0 0 0;font-weight:600;">Subs</p>
          </td>
          <td style="padding:14px 8px;background:#fef2f2;border-radius:10px;text-align:center;">
            <p style="font-size:26px;font-weight:700;color:#dc2626;margin:0;">-${stats.today.unsubs}</p>
            <p style="font-size:10px;color:#dc2626;margin:3px 0 0 0;font-weight:600;">Unsubs</p>
          </td>
          <td style="padding:14px 8px;background:#eff6ff;border-radius:10px;text-align:center;">
            <p style="font-size:26px;font-weight:700;color:#2563eb;margin:0;">${stats.today.visits}</p>
            <p style="font-size:10px;color:#2563eb;margin:3px 0 0 0;font-weight:600;">Visits</p>
          </td>
          <td style="padding:14px 8px;background:#fdf4ff;border-radius:10px;text-align:center;">
            <p style="font-size:26px;font-weight:700;color:#9333ea;margin:0;">${stats.today.predictions}</p>
            <p style="font-size:10px;color:#9333ea;margin:3px 0 0 0;font-weight:600;">Forecasts</p>
          </td>
        </tr>
      </table>

      <!-- ━━ LIFETIME STATS ━━ -->
      <div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:0 0 20px 0;border:1px solid #f0f0f0;">
        <p style="font-size:10px;font-weight:700;color:#bbb;letter-spacing:1.5px;margin:0 0 10px 0;">LIFETIME</p>
        <table style="width:100%;">
          <tr>
            <td style="font-size:13px;color:#555;padding:3px 0;">Active Subscribers</td>
            <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;padding:3px 0;">${totalActiveSubs}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#555;padding:3px 0;">Total Subscribers Gained</td>
            <td style="font-size:13px;color:#059669;font-weight:700;text-align:right;padding:3px 0;">+${stats.lifetime.newSubs}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#555;padding:3px 0;">Total Unsubscribes</td>
            <td style="font-size:13px;color:#dc2626;font-weight:700;text-align:right;padding:3px 0;">-${stats.lifetime.unsubs}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#555;padding:3px 0;">Total Page Visits</td>
            <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;padding:3px 0;">${stats.lifetime.visits.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#555;padding:3px 0;">Total Unique Visitors</td>
            <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;padding:3px 0;">${stats.lifetime.unique.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#555;padding:3px 0;">Total Forecasts Served</td>
            <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;padding:3px 0;">${stats.lifetime.predictions.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#555;padding:3px 0;">Days Live</td>
            <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;padding:3px 0;">${stats.lifetime.days}</td>
          </tr>
        </table>
      </div>

      ${newSubs.length > 0 ? `
      <!-- ━━ NEW SUBSCRIBERS ━━ -->
      <p style="font-size:10px;font-weight:700;color:#bbb;letter-spacing:1.5px;margin:0 0 8px 0;">NEW SUBSCRIBERS</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px 0;">
        <thead><tr style="background:#f9f9f9;">
          <th style="padding:6px 10px;text-align:left;font-size:10px;color:#999;font-weight:600;">Email</th>
          <th style="padding:6px 10px;text-align:left;font-size:10px;color:#999;font-weight:600;">Beach</th>
          <th style="padding:6px 10px;text-align:left;font-size:10px;color:#999;font-weight:600;">Time</th>
        </tr></thead>
        <tbody>${subRows}</tbody>
      </table>` : '<p style="color:#bbb;font-size:12px;margin:0 0 16px 0;">No new subscribers yesterday.</p>'}

      ${weekRows ? `
      <!-- ━━ 7-DAY TREND ━━ -->
      <p style="font-size:10px;font-weight:700;color:#bbb;letter-spacing:1.5px;margin:0 0 8px 0;">7-DAY TREND</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px 0;">
        <thead><tr style="background:#f9f9f9;">
          <th style="padding:5px 10px;text-align:left;font-size:10px;color:#999;">Day</th>
          <th style="padding:5px 10px;text-align:center;font-size:10px;color:#999;">Visits</th>
          <th style="padding:5px 10px;text-align:center;font-size:10px;color:#999;">Unique</th>
          <th style="padding:5px 10px;text-align:center;font-size:10px;color:#999;">Forecasts</th>
          <th style="padding:5px 10px;text-align:center;font-size:10px;color:#999;">Subs</th>
          <th style="padding:5px 10px;text-align:center;font-size:10px;color:#999;">Unsubs</th>
        </tr></thead>
        <tbody>${weekRows}</tbody>
      </table>` : ''}

    </div>

    <!-- Footer -->
    <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #f0f0f0;">
      <p style="color:#bbb;font-size:10px;margin:0;text-align:center;">Seaside Beacon · Admin Digest · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
    </div>

  </div>
</body></html>`;

    const text = [
      `Seaside Beacon Daily Digest — ${dateStr}`,
      `24h: +${newSubs.length} subs, -${stats.today.unsubs} unsubs, ${stats.today.visits} visits, ${stats.today.predictions} forecasts`,
      `Lifetime: ${totalActiveSubs} active subs, ${stats.lifetime.visits} visits, ${stats.lifetime.predictions} forecasts, ${stats.lifetime.days} days live`
    ].join('\n');

    const emoji = newSubs.length > 0 ? '📈' : '📊';
    await sendAdminEmail(
      `${emoji} +${newSubs.length} subs, ${stats.today.visits} visits — ${getTodayIST()}`,
      html, text
    );

    console.log(`📧 Digest sent: +${newSubs.length} subs, -${stats.today.unsubs} unsubs, ${stats.today.visits} visits`);

  } catch (err) {
    console.error('❌ Daily digest error:', err.message);
  }
}

// ══════════════════════════════════════════
// Feedback alert (instant — rare)
// ══════════════════════════════════════════
function notifyNewFeedback(rating, comment, beach) {
  const beachDisplay = BEACH_NAMES[beach] || beach;
  const ratingMap = { 'spot-on': '🎯 Spot-on', 'close': '👌 Close', 'missed': '😕 Missed' };
  const ratingDisplay = ratingMap[rating] || rating;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;padding:40px;background:#f5f5f5;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <p style="font-size:28px;margin:0 0 6px 0;">💬</p>
    <h2 style="color:#1a1a1a;margin:0 0 14px 0;font-size:18px;">New Feedback!</h2>
    <div style="background:#f9f9f9;border-radius:8px;padding:14px;margin:0 0 16px 0;">
      <p style="margin:0 0 5px 0;font-size:13px;"><strong>Rating:</strong> ${ratingDisplay}</p>
      <p style="margin:0 0 5px 0;font-size:13px;"><strong>Beach:</strong> ${beachDisplay}</p>
      ${comment ? `<p style="margin:0;font-size:13px;"><strong>Comment:</strong> "${comment}"</p>` : '<p style="margin:0;font-size:13px;color:#999;">No comment.</p>'}
    </div>
    <p style="color:#ccc;font-size:10px;margin:0;">Seaside Beacon · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
  </div>
</body></html>`;

  sendAdminEmail(`💬 ${ratingDisplay} — ${beachDisplay}`, html,
    `Feedback: ${rating} for ${beachDisplay}${comment ? ' — "' + comment + '"' : ''}`);
}

// ══════════════════════════════════════════
// Photo submission alert (instant — rare)
// ══════════════════════════════════════════
function notifyNewPhotoSubmission(name, beach, date, photoUrl) {
  const beachDisplay = BEACH_NAMES[beach] || beach;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;padding:40px;background:#f5f5f5;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <p style="font-size:28px;margin:0 0 6px 0;">📸</p>
    <h2 style="color:#1a1a1a;margin:0 0 14px 0;font-size:18px;">New Sunrise Photo!</h2>
    <div style="background:#f9f9f9;border-radius:8px;padding:14px;margin:0 0 16px 0;">
      <p style="margin:0 0 5px 0;font-size:13px;"><strong>Name:</strong> ${name || 'Anonymous'}</p>
      <p style="margin:0 0 5px 0;font-size:13px;"><strong>Beach:</strong> ${beachDisplay}</p>
      <p style="margin:0;font-size:13px;"><strong>Date:</strong> ${date || 'Not specified'}</p>
    </div>
    ${photoUrl ? `<img src="${photoUrl}" style="width:100%;border-radius:8px;margin-top:8px;" alt="Sunrise"/>` : ''}
    <p style="color:#ccc;font-size:10px;margin:12px 0 0 0;">Seaside Beacon · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
  </div>
</body></html>`;

  sendAdminEmail(`📸 Photo from ${name || 'Anonymous'} — ${beachDisplay}`, html,
    `New photo: ${name || 'Anonymous'} at ${beachDisplay} (${date})`);
}

// ══════════════════════════════════════════
// Cron — 8:00 AM IST every day
// ══════════════════════════════════════════
function initializeDailyDigest() {
  cron.schedule('0 8 * * *', () => {
    console.log('⏰ 8:00 AM IST — Running daily admin digest');
    sendDailyDigest();
  }, { timezone: 'Asia/Kolkata' });

  console.log('📊 Daily admin digest scheduled → 8:00 AM IST');
}

module.exports = {
  initializeDailyDigest,
  sendDailyDigest,           // Manual trigger for testing
  notifyNewFeedback,
  notifyNewPhotoSubmission
};