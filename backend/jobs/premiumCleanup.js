// ==========================================
// Premium Cleanup Job
// Runs daily at 2:00 AM IST
// Cleans up stale cancelled/expired/pending
// premium records after 5-day grace window
// ==========================================

const cron = require('node-cron');
const PremiumUser = require('../models/PremiumUser');

const STALE_DAYS = 5;

/**
 * Clean up premium users whose subscriptions have been
 * cancelled, expired, or stuck in pending for 5+ days.
 *
 * - cancelled (no grace): 5 days after cancelledAt
 * - cancelled (with grace): 5 days after currentPeriodEnd
 * - expired: 5 days after currentPeriodEnd
 * - pending: 5 days after createdAt (never activated)
 *
 * "Cleanup" means setting status → 'expired' and clearing
 * sensitive tokens. We do NOT delete records (audit trail).
 */
async function runPremiumCleanup() {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

    // 1. Cancelled without grace — 5 days since cancelledAt
    const cancelledNoGrace = await PremiumUser.find({
      status: 'cancelled',
      cancelledWithGrace: { $ne: true },
      cancelledAt: { $lte: cutoff }
    });

    // 2. Cancelled with grace — grace period ended 5+ days ago
    const cancelledWithGrace = await PremiumUser.find({
      status: 'cancelled',
      cancelledWithGrace: true,
      currentPeriodEnd: { $lte: cutoff }
    });

    // 3. Expired but not yet fully cleaned — currentPeriodEnd passed 5+ days ago
    //    Skip records already cleaned (authToken already null) to avoid re-processing
    const expired = await PremiumUser.find({
      status: 'expired',
      currentPeriodEnd: { $lte: cutoff },
      $or: [
        { authToken: { $ne: null } },
        { cancelledWithGrace: true }
      ]
    });

    // 4. Pending — stuck in pending for 5+ days (never activated)
    const stalePending = await PremiumUser.find({
      status: 'pending',
      createdAt: { $lte: cutoff }
    });

    const allStale = [...cancelledNoGrace, ...cancelledWithGrace, ...expired, ...stalePending];

    if (allStale.length === 0) {
      console.log('🧹 Premium cleanup: No stale records found');
      return { cleaned: 0 };
    }

    let cleaned = 0;
    for (const user of allStale) {
      const prevStatus = user.status;
      user.status = 'expired';
      user.authToken = null;
      user.authTokenExpiry = null;
      user.cancelledWithGrace = false;
      await user.save();
      cleaned++;
      console.log(`🧹 Cleaned up ${user.email} (was: ${prevStatus})`);
    }

    console.log(`🧹 Premium cleanup complete: ${cleaned} record(s) expired`);
    return { cleaned };
  } catch (error) {
    console.error('❌ Premium cleanup error:', error.message);
    return { cleaned: 0, error: error.message };
  }
}

/**
 * Initialize the daily cleanup cron job.
 * Runs at 2:00 AM IST (20:30 UTC previous day).
 */
function initializeCleanupJob() {
  // 2:00 AM IST = UTC-5:30 offset → cron in IST via TZ option
  cron.schedule('0 2 * * *', async () => {
    console.log('🧹 Running daily premium cleanup...');
    await runPremiumCleanup();
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('🧹 Premium cleanup job scheduled (daily 2:00 AM IST)');
}

module.exports = { initializeCleanupJob, runPremiumCleanup };
