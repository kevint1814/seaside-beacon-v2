// ==========================================
// Admin Notifications — Email alerts for user actions
// Sends to hello@seasidebeacon.com via Brevo
// ==========================================

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@seasidebeacon.com';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'forecast@seasidebeacon.com';
const BREVO_API_KEY = process.env.BREVO_API_KEY;

async function notifyAdmin(subject, bodyHtml, bodyText) {
  if (!BREVO_API_KEY) {
    console.warn('⚠️ BREVO_API_KEY not set, skipping admin notification');
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
        sender: { name: 'Seaside Beacon Alerts', email: SENDER_EMAIL },
        to: [{ email: ADMIN_EMAIL }],
        subject,
        htmlContent: bodyHtml,
        textContent: bodyText
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`⚠️ Admin notification failed: ${res.status} ${err}`);
    }
  } catch (err) {
    // Silent fail — don't break user-facing flow
    console.warn(`⚠️ Admin notification error: ${err.message}`);
  }
}

function wrapHtml(emoji, title, content) {
  return `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;padding:40px;background:#f5f5f5;">
  <div style="max-width:500px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <p style="font-size:32px;margin:0 0 8px 0;">${emoji}</p>
    <h2 style="color:#1a1a1a;margin:0 0 16px 0;font-size:20px;">${title}</h2>
    ${content}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="color:#999;font-size:11px;margin:0;">Seaside Beacon · Admin Alert · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
  </div>
</body></html>`;
}

// ── New Subscriber ──────────────────────────
function notifyNewSubscriber(email, beach) {
  const beachNames = {
    marina: 'Marina Beach',
    elliot: "Elliot's Beach",
    covelong: 'Covelong Beach',
    thiruvanmiyur: 'Thiruvanmiyur Beach'
  };
  const beachDisplay = beachNames[beach] || beach;

  const html = wrapHtml('🌅', 'New Subscriber!', `
    <p style="color:#555;line-height:1.6;margin:0 0 12px 0;font-size:14px;">Someone just subscribed to daily forecasts.</p>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:12px 0;">
      <p style="margin:0 0 6px 0;font-size:13px;"><strong>Email:</strong> <span style="color:#D64828;">${email}</span></p>
      <p style="margin:0;font-size:13px;"><strong>Beach:</strong> ${beachDisplay}</p>
    </div>
  `);

  notifyAdmin(`🌅 New subscriber: ${email}`, html, `New subscriber: ${email} → ${beachDisplay}`);
}

// ── New Feedback ────────────────────────────
function notifyNewFeedback(rating, comment, beach) {
  const stars = '⭐'.repeat(Math.min(rating, 5));
  const beachNames = {
    marina: 'Marina Beach',
    elliot: "Elliot's Beach",
    covelong: 'Covelong Beach',
    thiruvanmiyur: 'Thiruvanmiyur Beach'
  };
  const beachDisplay = beachNames[beach] || beach;

  const html = wrapHtml('💬', 'New Feedback!', `
    <p style="color:#555;line-height:1.6;margin:0 0 12px 0;font-size:14px;">Someone just left feedback.</p>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:12px 0;">
      <p style="margin:0 0 6px 0;font-size:13px;"><strong>Rating:</strong> ${stars} (${rating}/5)</p>
      <p style="margin:0 0 6px 0;font-size:13px;"><strong>Beach:</strong> ${beachDisplay}</p>
      ${comment ? `<p style="margin:0;font-size:13px;"><strong>Comment:</strong> "${comment}"</p>` : '<p style="margin:0;font-size:13px;color:#999;">No comment left.</p>'}
    </div>
  `);

  notifyAdmin(`💬 Feedback: ${stars} for ${beachDisplay}`, html, `Feedback: ${rating}/5 for ${beachDisplay}${comment ? ' — "' + comment + '"' : ''}`);
}

// ── New Photo Submission ────────────────────
function notifyNewPhotoSubmission(name, beach, date, photoUrl) {
  const beachNames = {
    marina: 'Marina Beach',
    elliot: "Elliot's Beach",
    covelong: 'Covelong Beach',
    thiruvanmiyur: 'Thiruvanmiyur Beach'
  };
  const beachDisplay = beachNames[beach] || beach;

  const html = wrapHtml('📸', 'New Sunrise Photo!', `
    <p style="color:#555;line-height:1.6;margin:0 0 12px 0;font-size:14px;">Someone submitted a sunrise photo.</p>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:12px 0;">
      <p style="margin:0 0 6px 0;font-size:13px;"><strong>Name:</strong> ${name || 'Anonymous'}</p>
      <p style="margin:0 0 6px 0;font-size:13px;"><strong>Beach:</strong> ${beachDisplay}</p>
      <p style="margin:0 0 6px 0;font-size:13px;"><strong>Date:</strong> ${date || 'Not specified'}</p>
    </div>
    ${photoUrl ? `<img src="${photoUrl}" style="width:100%;border-radius:8px;margin-top:12px;" alt="Sunrise photo"/>` : ''}
  `);

  notifyAdmin(`📸 Sunrise photo from ${name || 'Anonymous'} at ${beachDisplay}`, html, `New photo: ${name || 'Anonymous'} at ${beachDisplay} (${date})`);
}

// ── Unsubscribe ─────────────────────────────
function notifyUnsubscribe(email) {
  const html = wrapHtml('👋', 'Subscriber Left', `
    <p style="color:#555;line-height:1.6;margin:0 0 12px 0;font-size:14px;">Someone unsubscribed from daily forecasts.</p>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:12px 0;">
      <p style="margin:0;font-size:13px;"><strong>Email:</strong> <span style="color:#999;">${email}</span></p>
    </div>
  `);

  notifyAdmin(`👋 Unsubscribed: ${email}`, html, `Unsubscribed: ${email}`);
}

module.exports = {
  notifyNewSubscriber,
  notifyNewFeedback,
  notifyNewPhotoSubmission,
  notifyUnsubscribe
};
