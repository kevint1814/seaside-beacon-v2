// ==========================================
// test-email.js — Run this to verify Brevo works
// Place in backend/ folder, run: node test-email.js your@email.com
// ==========================================

// Load env from .env if present
try { require('dotenv').config(); } catch(e) {}

const { sendTestEmail } = require('./services/emailService');

const testTo = process.argv[2];

if (!testTo) {
  console.error('Usage: node test-email.js <your-email-address>');
  console.error('Example: node test-email.js kevin@example.com');
  process.exit(1);
}

if (!process.env.BREVO_API_KEY && !process.env.SENDGRID_API_KEY) {
  console.error('❌ No email provider configured.');
  console.error('Set BREVO_API_KEY in .env or environment variables.');
  process.exit(1);
}

console.log(`\n📧 Sending test email to: ${testTo}`);
console.log(`📡 Provider: ${(process.env.EMAIL_PROVIDER || 'brevo').toLowerCase()}`);
console.log(`🔑 API key: ${(process.env.BREVO_API_KEY || '').slice(0, 12)}...`);
console.log('');

sendTestEmail(testTo)
  .then(result => {
    console.log('\n✅ SUCCESS!');
    console.log(`   Provider: ${result.provider}`);
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`\n   Check your inbox (and spam folder) for the test email.`);
    console.log(`   If it arrived → Brevo is working. Ready to deploy.\n`);
  })
  .catch(err => {
    console.error('\n❌ FAILED:', err.message);
    console.error('\nCommon fixes:');
    console.error('  1. Check BREVO_API_KEY is correct (starts with "xkeysib-")');
    console.error('  2. Make sure you verified your sender domain in Brevo dashboard');
    console.error('  3. Check SENDER_EMAIL matches a verified sender in Brevo');
    console.error('  4. If 403 error: transactional platform may need activation\n');
    process.exit(1);
  });