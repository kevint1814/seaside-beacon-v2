// ==========================================
// Forecast Calibration Service — MOS Auto-Calibration
// v5.6: Per-beach rolling correction factors
// ==========================================
// Computes bias corrections from predicted vs observed weather data.
// Applied ONLY to beaches with autoCalibrate: true (not Chennai).
//
// Safeguards:
//   1. Minimum 14 days of data before corrections activate
//   2. Per-variable correction caps (prevent wild swings)
//   3. Confidence ramp-in (50% → 75% → 100% over 14-28 days)
//   4. Outlier exclusion (IQR-based, drops storm/freak days)
//   5. Weighted recency (exponential decay, recent days count more)
//   6. Regime detection (3-day vs 14-day divergence → throttle corrections)
//   7. Staleness check (no corrections if latest data > 3 days old)
// ==========================================

const ForecastVerification = require('../models/ForecastVerification');

// ── CORRECTION CAPS (max adjustment per variable) ──
const CORRECTION_CAPS = {
  cloudCover:   12,   // ±12%
  highCloud:    10,   // ±10%
  midCloud:     10,   // ±10%
  lowCloud:     10,   // ±10%
  humidity:      8,   // ±8%
  visibility:    5,   // ±5 km
  windSpeed:     5,   // ±5 km/h
  pressureMsl:   2    // ±2 hPa
};

// ── CONFIGURATION ──
const MIN_DAYS_FOR_CORRECTION = 14;
const ROLLING_WINDOW_DAYS = 30;        // Max days to look back
const RECENCY_DECAY = 0.93;            // Weight = 0.93^daysAgo (half-life ~10 days)
const REGIME_DIVERGENCE_THRESHOLD = 2;  // 3-day mean diverges by >2× IQR → regime shift
const STALENESS_LIMIT_DAYS = 3;         // Skip corrections if newest data is older than this
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (aligned with OM forecast cache)

// ── IN-MEMORY CACHE ──
const _correctionCache = {};  // { beachKey: { corrections, computedAt } }

// ── VARIABLES WE TRACK ──
const TRACKED_VARIABLES = ['cloudCover', 'highCloud', 'midCloud', 'lowCloud', 'humidity', 'visibility', 'windSpeed', 'pressureMsl'];

/**
 * Get correction factors for a beach.
 * Returns null if not enough data or corrections shouldn't be applied.
 * @param {string} beachKey
 * @returns {Promise<{factors: Object, strength: number, daysOfData: number, regimeShift: boolean}|null>}
 */
async function getBeachCorrections(beachKey) {
  // Check cache first
  const cached = _correctionCache[beachKey];
  if (cached && (Date.now() - cached.computedAt) < CACHE_TTL_MS) {
    return cached.corrections;
  }

  try {
    const corrections = await computeCorrections(beachKey);
    _correctionCache[beachKey] = { corrections, computedAt: Date.now() };
    return corrections;
  } catch (err) {
    console.error(`⚠️ MOS correction computation failed for ${beachKey}:`, err.message);
    return null;
  }
}

/**
 * Core correction computation with all safeguards.
 */
async function computeCorrections(beachKey) {
  // Fetch rolling window of verification data (newest first)
  const docs = await ForecastVerification.find({ beachKey })
    .sort({ date: -1 })
    .limit(ROLLING_WINDOW_DAYS)
    .lean();

  // Safeguard 7: Staleness check
  if (docs.length === 0) return null;
  const newestDate = new Date(docs[0].date + 'T00:00:00+05:30');
  const daysSinceLatest = (Date.now() - newestDate.getTime()) / (24 * 60 * 60 * 1000);
  if (daysSinceLatest > STALENESS_LIMIT_DAYS) {
    console.log(`📊 MOS ${beachKey}: latest data is ${daysSinceLatest.toFixed(1)} days old (>${STALENESS_LIMIT_DAYS}d) — corrections disabled`);
    return null;
  }

  // Filter to docs that have both predicted and observed data
  const validDocs = docs.filter(d => d.predicted && d.observed && d.deltas);
  if (validDocs.length < MIN_DAYS_FOR_CORRECTION) {
    console.log(`📊 MOS ${beachKey}: ${validDocs.length}/${MIN_DAYS_FOR_CORRECTION} days collected — corrections not yet active`);
    return null;
  }

  // Safeguard 1: Outlier exclusion (IQR-based per variable)
  const cleanDocs = excludeOutliers(validDocs);

  if (cleanDocs.length < MIN_DAYS_FOR_CORRECTION) {
    console.log(`📊 MOS ${beachKey}: only ${cleanDocs.length} days after outlier exclusion (need ${MIN_DAYS_FOR_CORRECTION}) — corrections not yet active`);
    return null;
  }

  // Safeguard 5: Weighted recency median
  const factors = {};
  for (const variable of TRACKED_VARIABLES) {
    const rawCorrection = weightedMedian(cleanDocs, variable);
    // Safeguard 2: Correction caps
    const cap = CORRECTION_CAPS[variable];
    factors[variable] = Math.max(-cap, Math.min(cap, rawCorrection));
  }

  // Safeguard 3: Confidence ramp-in
  const daysOfData = validDocs.length;
  let strength;
  if (daysOfData >= 28) {
    strength = 1.0;
  } else if (daysOfData >= 21) {
    strength = 0.75;
  } else {
    strength = 0.5;
  }

  // Safeguard 6: Regime detection
  const regimeShift = detectRegimeShift(validDocs);
  if (regimeShift) {
    strength = Math.min(strength, 0.25);
    console.log(`⚠️ MOS ${beachKey}: regime shift detected — corrections throttled to 25%`);
  }

  // Apply strength to all factors
  const scaledFactors = {};
  for (const variable of TRACKED_VARIABLES) {
    scaledFactors[variable] = Math.round(factors[variable] * strength * 100) / 100;
  }

  const result = { factors: scaledFactors, strength, daysOfData, regimeShift };

  console.log(`🔧 MOS ${beachKey}: ${daysOfData} days, ${Math.round(strength * 100)}% strength${regimeShift ? ' (REGIME SHIFT)' : ''} → cloud ${fmtDelta(scaledFactors.cloudCover)}%, humidity ${fmtDelta(scaledFactors.humidity)}%, vis ${fmtDelta(scaledFactors.visibility)}km, wind ${fmtDelta(scaledFactors.windSpeed)}km/h`);

  return result;
}

/**
 * Weighted median — recent days count more via exponential decay.
 * Uses RECENCY_DECAY^daysAgo as weight (yesterday = 1, 10 days ago = ~0.48).
 */
function weightedMedian(docs, variable) {
  // Build weighted pairs: { delta, weight }
  const pairs = [];
  for (let i = 0; i < docs.length; i++) {
    const delta = docs[i].deltas?.[variable];
    if (delta == null || isNaN(delta)) continue;
    const weight = Math.pow(RECENCY_DECAY, i); // docs are sorted newest-first, so i = daysAgo
    pairs.push({ delta, weight });
  }

  if (pairs.length === 0) return 0;

  // Sort by delta value
  pairs.sort((a, b) => a.delta - b.delta);

  // Find weighted median: first delta where cumulative weight >= 50% of total
  const totalWeight = pairs.reduce((sum, p) => sum + p.weight, 0);
  let cumWeight = 0;
  for (const pair of pairs) {
    cumWeight += pair.weight;
    if (cumWeight >= totalWeight / 2) {
      return pair.delta;
    }
  }

  return pairs[pairs.length - 1].delta;
}

/**
 * Outlier exclusion — IQR method per variable.
 * A doc is excluded if ANY of its variable deltas fall outside 1.5× IQR.
 * This drops storm/cyclone/freak days that would poison the rolling average.
 */
function excludeOutliers(docs) {
  if (docs.length < 7) return docs; // Need enough data for IQR to be meaningful

  // Compute IQR per variable
  const bounds = {};
  for (const variable of TRACKED_VARIABLES) {
    const values = docs
      .map(d => d.deltas?.[variable])
      .filter(v => v != null && !isNaN(v))
      .sort((a, b) => a - b);

    if (values.length < 4) {
      bounds[variable] = null; // Not enough data for IQR
      continue;
    }

    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;
    bounds[variable] = {
      lower: q1 - 1.5 * iqr,
      upper: q3 + 1.5 * iqr
    };
  }

  return docs.filter(doc => {
    for (const variable of TRACKED_VARIABLES) {
      const delta = doc.deltas?.[variable];
      const b = bounds[variable];
      if (delta == null || !b) continue;
      if (delta < b.lower || delta > b.upper) {
        return false; // Outlier — exclude entire doc
      }
    }
    return true;
  });
}

/**
 * Regime detection — compares 3-day running mean vs 14-day baseline.
 * If any key variable's 3-day mean diverges by > REGIME_DIVERGENCE_THRESHOLD × IQR,
 * a regime shift is signaled → corrections get throttled to 25%.
 *
 * Key variables: cloudCover, humidity (the two biggest swing factors).
 */
function detectRegimeShift(docs) {
  const keyVars = ['cloudCover', 'humidity'];

  for (const variable of keyVars) {
    const allDeltas = docs
      .map(d => d.deltas?.[variable])
      .filter(v => v != null && !isNaN(v));

    if (allDeltas.length < MIN_DAYS_FOR_CORRECTION) continue;

    // 3-day recent mean (docs are newest-first)
    const recent3 = allDeltas.slice(0, Math.min(3, allDeltas.length));
    const mean3 = recent3.reduce((s, v) => s + v, 0) / recent3.length;

    // 14-day baseline median
    const baseline = allDeltas.slice(0, MIN_DAYS_FOR_CORRECTION);
    const sorted = [...baseline].sort((a, b) => a - b);
    const median14 = sorted[Math.floor(sorted.length / 2)];

    // IQR of the baseline
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    // If IQR is very small (stable weather), use a minimum threshold
    const effectiveIqr = Math.max(iqr, 3); // At least 3% / 3km / 3km/h / 3hPa

    const divergence = Math.abs(mean3 - median14);
    if (divergence > REGIME_DIVERGENCE_THRESHOLD * effectiveIqr) {
      console.log(`🔄 MOS regime shift detected on ${variable}: 3-day mean=${mean3.toFixed(1)}, 14-day median=${median14.toFixed(1)}, divergence=${divergence.toFixed(1)} > ${(REGIME_DIVERGENCE_THRESHOLD * effectiveIqr).toFixed(1)}`);
      return true;
    }
  }

  return false;
}

/**
 * Invalidate cache for a specific beach (called after new verification data stored)
 */
function invalidateCache(beachKey) {
  delete _correctionCache[beachKey];
}

/**
 * Invalidate all cached corrections
 */
function invalidateAllCaches() {
  for (const key of Object.keys(_correctionCache)) {
    delete _correctionCache[key];
  }
}

/** Format delta with +/- sign for logging */
function fmtDelta(val) {
  if (val == null) return 'N/A';
  return (val >= 0 ? '+' : '') + val.toFixed(1);
}

module.exports = {
  getBeachCorrections,
  invalidateCache,
  invalidateAllCaches,
  TRACKED_VARIABLES,
  // Exported for testing
  computeCorrections,
  weightedMedian,
  excludeOutliers,
  detectRegimeShift
};
