/**
 * Comprehensive Test Suite for Sunrise Scoring Functions (v5.3)
 * Tests all scoring functions from weatherService.js
 * Imports directly from weatherService.js — no duplicate implementations
 * 300+ assertions covering all functions, edge cases, and graceful degradation
 *
 * v5.3: Physics corrections (low-stratus discount, pressure thresholds, synergy canvas check, humidity tightening)
 *   - AOD promoted to #1 factor (16pts, Goldilocks curve 0.05-0.15)
 *   - Cloud Layers promoted to #2 (20pts)
 *   - Cloud Cover reduced (18pts)
 *   - Humidity reduced (15pts, Chennai calibration preserved)
 *   - Pressure raised (11pts)
 *   - Visibility reduced (5pts, redundant with AOD)
 *   - Wind raised + curve inverted (5pts, peak 8-20 km/h)
 *   - Post-rain raised (+8, aerosol scavenging research)
 *   - Feb 20 ground truth recalibrated: "okayish" → 48-53 (FAIR/MAYBE)
 */

const {
  scoreCloudCover,
  scoreMultiLevelCloud,
  scoreHumidity,
  scorePressureTrend,
  scoreAOD,
  scoreVisibility,
  scoreWeatherConditions,
  scoreWind,
  getSynergyAdjustment,
  getSolarAngleBonus,
  getImprovedPostRainBonus,
  calculateSunriseScore,
  getVerdict,
  getRecommendation,
  getAtmosphericLabels
} = require('./services/weatherService');

// ====================================
// TEST UTILITIES
// ====================================

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
  } else {
    testsFailed++;
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${expected}, got ${actual})`);
}

function assertInRange(value, min, max, message) {
  assert(value >= min && value <= max, `${message} (expected ${min}-${max}, got ${value})`);
}

function testGroup(name) {
  console.log(`\n=== ${name} ===`);
}

// ====================================
// TESTS START HERE
// ====================================

console.log('\n################################');
console.log('# SUNRISE SCORING TEST SUITE v5.2');
console.log('################################');

// ====================================
// 1. scoreCloudCover (max 18)
// ====================================
testGroup('scoreCloudCover (max 18)');

// Clear sky range (0-15%)
assertInRange(scoreCloudCover(0), 5, 7, 'Cloud 0%: clear sky base');
assertInRange(scoreCloudCover(10), 5, 8, 'Cloud 10%: clear sky');
assertInRange(scoreCloudCover(15), 7, 10, 'Cloud 15%: boundary');

// Approaching optimal (15-30%)
assertInRange(scoreCloudCover(20), 7, 11, 'Cloud 20%: scattered');
assertInRange(scoreCloudCover(25), 10, 15, 'Cloud 25%: approaching optimal');

// Optimal range (30-60%) — should score highest
assertInRange(scoreCloudCover(30), 15, 18, 'Cloud 30%: optimal start');
assertInRange(scoreCloudCover(45), 17, 18, 'Cloud 45%: optimal peak');
assertInRange(scoreCloudCover(60), 15, 18, 'Cloud 60%: optimal end');
assert(scoreCloudCover(45) >= scoreCloudCover(30), 'Peak at 45% >= 30%');
assert(scoreCloudCover(45) >= scoreCloudCover(60), 'Peak at 45% >= 60%');

// Above optimal (60-90%)
assert(scoreCloudCover(70) < scoreCloudCover(60), 'Cloud 70% < 60% (declining)');
assert(scoreCloudCover(80) < scoreCloudCover(70), 'Cloud 80% < 70% (declining)');
assertInRange(scoreCloudCover(75), 7, 15, 'Cloud 75%: partly overcast');

// Heavy overcast (>90%)
assert(scoreCloudCover(95) < 4, 'Cloud 95%: near-total overcast very low');
assertInRange(scoreCloudCover(100), 0, 3, 'Cloud 100%: total overcast');

// Bounds check
for (let cc = 0; cc <= 100; cc += 5) {
  assertInRange(scoreCloudCover(cc), 0, 18, `Cloud ${cc}% within [0, 18]`);
}

// ====================================
// 2. scoreMultiLevelCloud (max 20) — v5.2 PROMOTED
// ====================================
testGroup('scoreMultiLevelCloud (max 20)');

// Best case: high clouds present, low minimal
assertEqual(scoreMultiLevelCloud(40, 20, 20, null, 50), 20, 'High 40%, low 20%, mid 20% = 20 (ideal)');
assertEqual(scoreMultiLevelCloud(35, 45, 30, null, 50), 17, 'High 35%, mid 45%, low 30% = 17');
assertEqual(scoreMultiLevelCloud(50, 65, 30, null, 50), 14, 'High 50%, mid 65%, low 30% = 14');

// High clouds with low cloud interference
assertEqual(scoreMultiLevelCloud(40, 50, 50, null, 50), 11, 'High 40%, low 50% (mixed) = 11');
assertEqual(scoreMultiLevelCloud(40, 50, 80, null, 50), 6, 'High 40%, low 80% (blocked) = 6');

// Minimal high clouds
assertEqual(scoreMultiLevelCloud(20, 55, 40, null, 50), 9, 'High 20%, mid 55% = 9 (mid canvas)');
assertEqual(scoreMultiLevelCloud(20, 30, 30, null, 50), 6, 'High 20%, no canvas = 6');
// v5.1: Low 50-65% now scores 5 (moderate band with gaps), not 3
assertEqual(scoreMultiLevelCloud(20, 30, 59, null, 50), 5, 'High 20%, low 59% = 5 (v5.1: moderate band)');
assertEqual(scoreMultiLevelCloud(20, 30, 65, null, 50), 3, 'High 20%, low 65% = 3 (heavy low)');
assertEqual(scoreMultiLevelCloud(20, 30, 80, null, 50), 1, 'High 20%, low 80% = 1 (worst)');

// Graceful degradation — no multi-level data
assertEqual(scoreMultiLevelCloud(null, null, null, null, 50), 10, 'No data at all → 10 (neutral)');
assertEqual(scoreMultiLevelCloud(null, null, null, 7000, 50), 17, 'Ceiling 7000m fallback → 17');
assertEqual(scoreMultiLevelCloud(null, null, null, 5000, 50), 14, 'Ceiling 5000m fallback → 14');
assertEqual(scoreMultiLevelCloud(null, null, null, 2500, 50), 10, 'Ceiling 2500m fallback → 10');
assertEqual(scoreMultiLevelCloud(null, null, null, 1500, 50), 5, 'Ceiling 1500m fallback → 5');
assertEqual(scoreMultiLevelCloud(null, null, null, 500, 50), 2, 'Ceiling 500m fallback → 2');
assertEqual(scoreMultiLevelCloud(null, null, null, 8000, 10), 10, 'Ceiling with low cloud cover → 10 (neutral)');

// Bounds check
for (const h of [0, 20, 40, 60, 80, 100]) {
  for (const l of [0, 30, 60, 90]) {
    const score = scoreMultiLevelCloud(h, 30, l, null, 50);
    assertInRange(score, 0, 20, `MultiLevel H:${h}% L:${l}% within [0, 20]`);
  }
}

// ====================================
// 3. scoreHumidity (max 15)
// ====================================
testGroup('scoreHumidity (max 15)');

assertEqual(scoreHumidity(30), 15, 'Humidity 30% = 15 (max, exceptional)');
assertEqual(scoreHumidity(55), 15, 'Humidity 55% = 15 (boundary)');
assertInRange(scoreHumidity(60), 12, 15, 'Humidity 60%: excellent');
assertInRange(scoreHumidity(70), 8, 12, 'Humidity 70%: good');
assertInRange(scoreHumidity(80), 7, 10, 'Humidity 80%: decent');
// v5.1 Chennai calibration preserved: 85-90% = 5-7 (not penalty)
assertInRange(scoreHumidity(85), 5, 8, 'Humidity 85%: Chennai baseline');
assertInRange(scoreHumidity(88), 4, 7, 'Humidity 88%: typical Chennai dawn (v5.3 tightened)');
assertInRange(scoreHumidity(90), 3, 6, 'Humidity 90%: high end of baseline');
assertInRange(scoreHumidity(93), 2, 5, 'Humidity 93%: high (v5.3 tightened)');
assertInRange(scoreHumidity(95), 1, 4, 'Humidity 95%: very high');
assertInRange(scoreHumidity(100), 0, 2, 'Humidity 100%: fog territory');

// Monotonic decrease
assert(scoreHumidity(50) >= scoreHumidity(60), 'Lower humidity → higher score');
assert(scoreHumidity(60) >= scoreHumidity(70), 'Humidity curve monotonic');
assert(scoreHumidity(70) >= scoreHumidity(80), 'Humidity curve monotonic');
assert(scoreHumidity(80) >= scoreHumidity(90), 'Humidity curve monotonic');

// Bounds
for (let h = 0; h <= 100; h += 10) {
  assertInRange(scoreHumidity(h), 0, 15, `Humidity ${h}% within [0, 15]`);
}

// ====================================
// 4. scorePressureTrend (max 11) — v5.2 RAISED
// ====================================
testGroup('scorePressureTrend (max 11)');

// Best case: moderate fall (clearing front)
assertEqual(scorePressureTrend([1013, 1012, 1010, 1009]), 11, 'Δ-4hPa (clearing front) = 11');
assertEqual(scorePressureTrend([1020, 1018, 1016, 1015.5]), 11, 'Δ-4.5hPa (clearing front) = 11');

// Good: slight fall
assertInRange(scorePressureTrend([1013, 1012, 1011.5]), 7, 9, 'Δ-1.5hPa (slight fall)');

// Neutral: stable
assertEqual(scorePressureTrend([1013, 1013, 1013]), 5, 'Δ0hPa (stable) = 5');
assertEqual(scorePressureTrend([1013, 1013.2, 1013.3]), 5, 'Δ+0.3hPa (barely rising) = 5');

// Storm: rapid fall
assertEqual(scorePressureTrend([1013, 1008, 1005, 1002]), 2, 'Δ-11hPa (storm) = 2');
assertEqual(scorePressureTrend([1015, 1010, 1007, 1005]), 2, 'Δ-10hPa (severe storm) = 2');

// Rising pressure
assertInRange(scorePressureTrend([1010, 1011, 1012]), 3, 4, 'Δ+2hPa (rising)');
assertInRange(scorePressureTrend([1005, 1010, 1015]), 3, 3, 'Δ+10hPa (rapidly rising) = 3');

// Graceful degradation
assertEqual(scorePressureTrend(null), 5, 'Null → 5 (neutral)');
assertEqual(scorePressureTrend([]), 5, 'Empty array → 5 (neutral)');
assertEqual(scorePressureTrend([1013]), 5, 'Single value → 5 (neutral)');
assertEqual(scorePressureTrend([null, 1013]), 5, 'Null start → 5 (neutral)');

// ====================================
// 5. scoreAOD (max 16) — v5.2 #1 FACTOR, GOLDILOCKS CURVE
// ====================================
testGroup('scoreAOD (max 16)');

// Goldilocks zone (0.05-0.15): peak Mie forward scattering
assertEqual(scoreAOD(0.05), 16, 'AOD 0.05 (Goldilocks low end) = 16');
assertEqual(scoreAOD(0.10), 16, 'AOD 0.10 (Goldilocks peak) = 16');
assertEqual(scoreAOD(0.12), 16, 'AOD 0.12 (Goldilocks peak) = 16');

// Too clean — pale, less Mie scattering
assertEqual(scoreAOD(0.03), 13, 'AOD 0.03 (too clean, slightly pale) = 13');

// Excellent but outside Goldilocks
assertEqual(scoreAOD(0.17), 14, 'AOD 0.17 (very clean) = 14');
assertEqual(scoreAOD(0.25), 12, 'AOD 0.25 (clean) = 12');

// Haze territory
assertEqual(scoreAOD(0.35), 9, 'AOD 0.35 (mild haze) = 9');
assertEqual(scoreAOD(0.45), 6, 'AOD 0.45 (moderate haze) = 6');
assertEqual(scoreAOD(0.6), 4, 'AOD 0.6 (heavy haze) = 4');
assertEqual(scoreAOD(0.8), 2, 'AOD 0.8 (very heavy haze) = 2');
assertEqual(scoreAOD(1.5), 0, 'AOD 1.5 (dust event) = 0');

// Graceful degradation
assertEqual(scoreAOD(null), 8, 'AOD null → 8 (neutral)');
assertEqual(scoreAOD(-1), 8, 'AOD negative → 8 (neutral)');
assertEqual(scoreAOD(undefined), 8, 'AOD undefined → 8 (neutral)');

// Monotonic decrease (after Goldilocks zone)
assert(scoreAOD(0.10) >= scoreAOD(0.20), 'AOD Goldilocks → decline');
assert(scoreAOD(0.20) >= scoreAOD(0.30), 'AOD monotonic decline');
assert(scoreAOD(0.30) >= scoreAOD(0.50), 'AOD monotonic decline');
assert(scoreAOD(0.50) >= scoreAOD(0.80), 'AOD monotonic decline');
assert(scoreAOD(0.80) >= scoreAOD(1.50), 'AOD monotonic decline');

// Goldilocks > too-clean
assert(scoreAOD(0.08) > scoreAOD(0.03), 'Goldilocks (0.08) > too-clean (0.03)');

// ====================================
// 6. scoreVisibility (max 5)
// ====================================
testGroup('scoreVisibility (max 5)');

assertEqual(scoreVisibility(20), 5, 'Vis 20km = 5 (max)');
assertEqual(scoreVisibility(15), 5, 'Vis 15km = 5 (full marks)');
assertEqual(scoreVisibility(12), 4, 'Vis 12km = 4');
assertEqual(scoreVisibility(10), 4, 'Vis 10km = 4');
assertEqual(scoreVisibility(8), 3, 'Vis 8km = 3');
assertEqual(scoreVisibility(6), 3, 'Vis 6km = 3');
assertEqual(scoreVisibility(4), 2, 'Vis 4km = 2');
assertEqual(scoreVisibility(2), 1, 'Vis 2km = 1');
assertEqual(scoreVisibility(0.5), 0, 'Vis 0.5km = 0 (fog)');

// Bounds
for (let v = 0; v <= 25; v += 2) {
  assertInRange(scoreVisibility(v), 0, 5, `Vis ${v}km within [0, 5]`);
}

// ====================================
// 7. scoreWeatherConditions (max 5)
// ====================================
testGroup('scoreWeatherConditions (max 5)');

// Clear conditions
assertInRange(scoreWeatherConditions(0, false, 'Clear'), 5, 5, 'Clear sky = 5');
assertInRange(scoreWeatherConditions(0, false, 'Sunny'), 5, 5, 'Sunny = 5');
assertInRange(scoreWeatherConditions(10, false, 'Partly Cloudy'), 4, 5, 'Partly cloudy low precip');

// Moderate conditions
assertInRange(scoreWeatherConditions(40, false, 'Cloudy'), 2, 3, '40% precip cloudy');

// Bad conditions
assertInRange(scoreWeatherConditions(80, true, 'Rain'), 0, 1, '80% precip + active rain');
assertEqual(scoreWeatherConditions(100, true, 'Thunderstorm'), 0, 'Thunderstorm = 0');
assertInRange(scoreWeatherConditions(20, false, 'Fog'), 1, 3, 'Fog penalty');

// Bounds
for (const precip of [0, 20, 40, 60, 80, 100]) {
  assertInRange(scoreWeatherConditions(precip, false, 'Cloudy'), 0, 5, `Weather ${precip}% within [0, 5]`);
}

// ====================================
// 8. scoreWind (max 5) — v5.2 INVERTED CURVE
// ====================================
testGroup('scoreWind (max 5)');

// Optimal: 8-20 km/h (structures clouds, clears haze)
assertEqual(scoreWind(10), 5, 'Wind 10 km/h = 5 (optimal)');
assertEqual(scoreWind(15), 5, 'Wind 15 km/h = 5 (optimal)');
assertEqual(scoreWind(20), 5, 'Wind 20 km/h = 5 (optimal boundary)');

// Good: 5-8 and 20-25
assertEqual(scoreWind(6), 4, 'Wind 6 km/h = 4 (light)');
assertEqual(scoreWind(22), 4, 'Wind 22 km/h = 4 (moderate)');

// Dead calm: traps boundary haze
assertEqual(scoreWind(0), 3, 'Wind 0 km/h = 3 (dead calm, traps haze)');
assertEqual(scoreWind(3), 3, 'Wind 3 km/h = 3 (dead calm)');

// Gusty
assertEqual(scoreWind(30), 2, 'Wind 30 km/h = 2 (gusty)');
assertEqual(scoreWind(35), 2, 'Wind 35 km/h = 2 (gusty boundary)');

// Strong
assertEqual(scoreWind(40), 1, 'Wind 40 km/h = 1 (strong)');
assertEqual(scoreWind(50), 1, 'Wind 50 km/h = 1 (strong)');

// ====================================
// 9. getSynergyAdjustment (±4)
// ====================================
testGroup('getSynergyAdjustment (±4)');

// Fog override
assertEqual(getSynergyAdjustment(50, 70, 2), -4, 'Fog (<3km) → -4');
assertEqual(getSynergyAdjustment(50, 70, 4), -3, 'Heavy mist (<5km) → -3');

// v5.1: Recalibrated for tropical coastal dawn
assertInRange(getSynergyAdjustment(45, 60, 15), 3, 4, 'Optimal cloud + low humidity');
assertInRange(getSynergyAdjustment(45, 75, 15), 2, 4, 'Optimal cloud + dry-ish humidity');

// v5.1: Chennai baseline humidity (85-90%) should NOT be penalized
assertInRange(getSynergyAdjustment(45, 88, 15), 0, 4, 'Good cloud + Chennai baseline hum = no penalty');
assert(getSynergyAdjustment(45, 88, 15) >= 0, 'v5.1: 88% humidity + good cloud = not negative');
assert(getSynergyAdjustment(50, 85, 12) >= 0, 'v5.1: 85% humidity + good cloud = not negative');

// Only penalize near-fog conditions (>93%)
assert(getSynergyAdjustment(50, 95, 12) < 0, 'Near-fog humidity (95%) + cloud → penalty');
assert(getSynergyAdjustment(10, 60, 15) < 0, 'Very clear sky penalty');

// v5.1: Feb 20 ground-truth scenario
assert(getSynergyAdjustment(60, 88, 24) >= 0, 'v5.1 Feb 20 ground truth: NOT negative');

// Bounds check
for (const c of [0, 30, 50, 80, 100]) {
  for (const h of [40, 70, 95]) {
    for (const v of [1, 5, 15]) {
      assertInRange(getSynergyAdjustment(c, h, v), -4, 4, `Synergy(${c},${h},${v}) within ±4`);
    }
  }
}

// ====================================
// 10. getSolarAngleBonus (±2)
// ====================================
testGroup('getSolarAngleBonus (±2)');

const winterDate = new Date(2024, 11, 21);
const summerDate = new Date(2024, 5, 21);
const equinoxDate = new Date(2024, 2, 21);

assertInRange(getSolarAngleBonus(winterDate), 1, 2, 'Winter → bonus (low angle)');
assertInRange(getSolarAngleBonus(summerDate), -2, 0, 'Summer → penalty or neutral');
assertInRange(getSolarAngleBonus(equinoxDate), -1, 1, 'Equinox → near neutral');

// Bounds
for (let m = 0; m < 12; m++) {
  assertInRange(getSolarAngleBonus(new Date(2024, m, 15)), -2, 2, `Month ${m + 1} within ±2`);
}

// ====================================
// 11. getImprovedPostRainBonus — v5.2: +8 (was +5)
// ====================================
testGroup('getImprovedPostRainBonus (+8)');

// Temporal signal: night rain + dry morning
const forecastDry = { PrecipitationProbability: 10 };
assertEqual(
  getImprovedPostRainBonus(forecastDry, { nightHoursOfRain: 3 }),
  8,
  'Night rain + dry 6AM → +8 (v5.2)'
);

// No rain at all
assertEqual(
  getImprovedPostRainBonus(forecastDry, { nightHoursOfRain: 0 }),
  0,
  'No night rain → 0'
);

// Still raining
const forecastWet = { PrecipitationProbability: 50 };
assertEqual(
  getImprovedPostRainBonus(forecastWet, { nightHoursOfRain: 3 }),
  0,
  'Night rain but still raining → 0'
);

// Heuristic fallback
const forecastHeuristic = {
  PrecipitationProbability: 10,
  Visibility: { Value: 18, Unit: 'km' },
  CloudCover: 40,
  RelativeHumidity: 70
};
assertEqual(
  getImprovedPostRainBonus(forecastHeuristic, null),
  8,
  'Post-rain heuristic signature → +8 (v5.2)'
);

// No heuristic match
const forecastNormal = {
  PrecipitationProbability: 10,
  Visibility: { Value: 10, Unit: 'km' },
  CloudCover: 40,
  RelativeHumidity: 70
};
assertEqual(
  getImprovedPostRainBonus(forecastNormal, null),
  0,
  'Normal conditions → 0'
);

// ====================================
// 12. calculateSunriseScore — Full Integration (v5.2)
// ====================================
testGroup('calculateSunriseScore — v5.2 Integration');

// Helper: create AccuWeather-style forecast object
function makeForecast(overrides = {}) {
  return {
    CloudCover: overrides.cloud ?? 45,
    RelativeHumidity: overrides.humidity ?? 65,
    PrecipitationProbability: overrides.precip ?? 5,
    HasPrecipitation: overrides.hasPrecip ?? false,
    Wind: { Speed: { Value: overrides.wind ?? 8 } },
    Visibility: { Value: overrides.vis ?? 15, Unit: 'km' },
    IconPhrase: overrides.desc ?? 'Partly Cloudy',
    DateTime: overrides.date ?? '2024-12-15T06:00:00+05:30',
    Ceiling: overrides.ceiling ? { Value: overrides.ceiling, Unit: 'm' } : undefined
  };
}

function makeExtras(overrides = {}) {
  return {
    airQuality: overrides.aod != null ? { aod: overrides.aod } : null,
    openMeteoForecast: overrides.highCloud != null ? {
      highCloud: overrides.highCloud,
      midCloud: overrides.midCloud ?? 30,
      lowCloud: overrides.lowCloud ?? 20,
      pressureMsl: overrides.pressureMsl ?? [1013, 1012, 1011, 1010],
      cloudCover: overrides.omCloud ?? null,
      visibility: overrides.omVisM ?? null,
      humidity: overrides.omHumidity ?? null
    } : null,
    dailyData: overrides.nightRain ? { nightHoursOfRain: 3 } : null
  };
}

// Scenario 1: Perfect conditions
const perfect = calculateSunriseScore(
  makeForecast({ cloud: 45, humidity: 55, vis: 20, wind: 10, precip: 0, desc: 'Clear' }),
  makeExtras({ highCloud: 50, midCloud: 10, lowCloud: 10, aod: 0.08, pressureMsl: [1013, 1012, 1010, 1009] })
);
assert(perfect.score >= 85, `Perfect conditions score ≥85 (got ${perfect.score})`);
assertEqual(perfect.breakdown.multiLevelCloud.score, 20, 'Perfect: multiLevel = 20');
assertEqual(perfect.breakdown.aod.score, 16, 'Perfect: AOD = 16 (Goldilocks)');
assertEqual(perfect.breakdown.pressureTrend.score, 11, 'Perfect: pressure = 11');

// Scenario 2: Good conditions (typical good Chennai winter morning)
const good = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 72, vis: 14, wind: 12 }),
  makeExtras({ highCloud: 35, midCloud: 25, lowCloud: 25, aod: 0.15, pressureMsl: [1013, 1013, 1013] })
);
assertInRange(good.score, 55, 90, `Good conditions: ${good.score}`);

// Scenario 3: Poor conditions (heavy overcast, humid, low vis, bad AOD)
const poor = calculateSunriseScore(
  makeForecast({ cloud: 90, humidity: 92, vis: 3, wind: 35, precip: 60 }),
  makeExtras({ highCloud: 5, midCloud: 10, lowCloud: 85, aod: 0.9, pressureMsl: [1013, 1013, 1013] })
);
assert(poor.score < 25, `Poor conditions score <25 (got ${poor.score})`);

// Scenario 4: Storm (rapidly falling pressure)
const storm = calculateSunriseScore(
  makeForecast({ cloud: 80, humidity: 88, vis: 5, wind: 30, precip: 70, desc: 'Thunderstorm' }),
  makeExtras({ highCloud: 10, midCloud: 30, lowCloud: 70, aod: 0.5, pressureMsl: [1020, 1015, 1010, 1005] })
);
assert(storm.score < 35, `Storm score <35 (got ${storm.score})`);

// Scenario 5: Post-rain magic
const postRain = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 70, vis: 18, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010], nightRain: true })
);
assert(postRain.score >= 85, `Post-rain magic score ≥85 (got ${postRain.score})`);
assertEqual(postRain.breakdown.postRainBonus, 8, 'Post-rain bonus = 8 (v5.2)');
assertEqual(postRain.breakdown.isPostRain, true, 'isPostRain flag set');

// Scenario 6: No Open-Meteo data (graceful degradation)
const noOpenMeteo = calculateSunriseScore(
  makeForecast({ cloud: 45, humidity: 58, vis: 12, wind: 10, ceiling: 6000 }),
  { airQuality: null, openMeteoForecast: null, dailyData: null }
);
assertInRange(noOpenMeteo.score, 50, 90, `No Open-Meteo: reasonable score ${noOpenMeteo.score}`);
assertEqual(noOpenMeteo.breakdown.multiLevelCloud.score, 17, 'Ceiling 6000m fallback → 17');
assertEqual(noOpenMeteo.breakdown.pressureTrend.score, 5, 'No pressure data → 5 (neutral)');
assertEqual(noOpenMeteo.breakdown.aod.score, 8, 'No AOD data → 8 (neutral)');

// Scenario 7: Completely empty extras
const noExtras = calculateSunriseScore(
  makeForecast({ cloud: 50, humidity: 75, vis: 10, wind: 15 }),
  {}
);
assertInRange(noExtras.score, 35, 75, `No extras: reasonable score ${noExtras.score}`);

// Scenario 8: Clear sky with high clouds (dawn photographer's good day)
const clearHighCloud = calculateSunriseScore(
  makeForecast({ cloud: 35, humidity: 60, vis: 16, wind: 10 }),
  makeExtras({ highCloud: 60, midCloud: 10, lowCloud: 5, aod: 0.10, pressureMsl: [1013, 1012, 1011] })
);
assert(clearHighCloud.score >= 75, `Clear+high clouds ≥75 (got ${clearHighCloud.score})`);

// Scenario 9: Low cloud blanket (worst for sunrise)
const lowBlanket = calculateSunriseScore(
  makeForecast({ cloud: 85, humidity: 88, vis: 5, wind: 20 }),
  makeExtras({ highCloud: 5, midCloud: 10, lowCloud: 90, aod: 0.6, pressureMsl: [1013, 1013, 1013] })
);
assert(lowBlanket.score <= 35, `Low cloud blanket ≤35 (got ${lowBlanket.score})`);

// Scenario 10: Fog (very low vis + high humidity = synergy penalty dominates)
const fog = calculateSunriseScore(
  makeForecast({ cloud: 50, humidity: 95, vis: 1, wind: 2, desc: 'Fog' }),
  makeExtras({ highCloud: 10, midCloud: 20, lowCloud: 60, aod: 0.6, pressureMsl: [1013, 1013, 1013] })
);
assert(fog.score <= 45, `Fog score ≤45 (got ${fog.score})`);

// Scenario 11: Hazy Chennai summer
const hazySummer = calculateSunriseScore(
  makeForecast({ cloud: 20, humidity: 82, vis: 8, wind: 15, date: '2024-06-15T06:00:00+05:30' }),
  makeExtras({ highCloud: 10, midCloud: 20, lowCloud: 15, aod: 0.7, pressureMsl: [1010, 1010, 1010] })
);
assertInRange(hazySummer.score, 15, 45, `Hazy summer: ${hazySummer.score}`);

// Scenario 12: Stable high pressure winter
const stableWinter = calculateSunriseScore(
  makeForecast({ cloud: 30, humidity: 60, vis: 16, wind: 10, date: '2024-12-15T06:00:00+05:30' }),
  makeExtras({ highCloud: 25, midCloud: 30, lowCloud: 10, aod: 0.15, pressureMsl: [1018, 1018, 1018, 1018] })
);
assertInRange(stableWinter.score, 55, 85, `Stable winter: ${stableWinter.score}`);

// Scenario 13: Clearing front approaching — dramatic sky potential
const clearingFront = calculateSunriseScore(
  makeForecast({ cloud: 50, humidity: 65, vis: 14, wind: 12 }),
  makeExtras({ highCloud: 40, midCloud: 30, lowCloud: 25, aod: 0.10, pressureMsl: [1018, 1016, 1014, 1012] })
);
assert(clearingFront.score >= 75, `Clearing front ≥75 (got ${clearingFront.score})`);

// Scenario 14: Dust/pollution event
const dustEvent = calculateSunriseScore(
  makeForecast({ cloud: 30, humidity: 60, vis: 6, wind: 15 }),
  makeExtras({ highCloud: 20, midCloud: 15, lowCloud: 10, aod: 1.5, pressureMsl: [1013, 1013, 1013] })
);
assertInRange(dustEvent.score, 20, 60, `Dust event: ${dustEvent.score}`);
assertEqual(dustEvent.breakdown.aod.score, 0, 'Dust: AOD = 0');

// Scenario 15: Edge case — all neutral/default
const allNeutral = calculateSunriseScore(
  makeForecast({ cloud: 50, humidity: 75, vis: 10, wind: 15 }),
  makeExtras({ highCloud: 25, midCloud: 25, lowCloud: 25, aod: 0.3, pressureMsl: [1013, 1013, 1013] })
);
assertInRange(allNeutral.score, 35, 75, `All neutral: ${allNeutral.score}`);

// ====================================
// v5.2: GROUND-TRUTH SCENARIOS
// ====================================
testGroup('v5.2 Ground-Truth Scenarios');

// Scenario 16: Feb 20, 2026 — THE CALIBRATION DAY
// User said: "i won't say today was good. it was okayish to me."
// → Target: 48-53 (FAIR/MAYBE territory), not 65 (GOOD)
// Alpenglow scored 51%. Photos showed soft colour, sun punch-through at 6:48.
// OM data: cloud 60%, humidity 88%, vis 24km, H17/M0/L59, AOD 0.35
const feb20 = calculateSunriseScore(
  makeForecast({ cloud: 94, humidity: 95, vis: 6, wind: 12, precip: 10 }),
  makeExtras({
    highCloud: 17, midCloud: 0, lowCloud: 59,
    aod: 0.35, pressureMsl: [1013, 1013, 1013.1],
    omCloud: 60, omHumidity: 88, omVisM: 24100
  })
);
assertInRange(feb20.score, 40, 62, `v5.2 Feb 20 ground truth: ${feb20.score} (target: ~48-55, "okayish")`);
// Verify OM data was used (cloud score should reflect 60% not 94%)
assert(feb20.breakdown.cloudCover.score >= 12, `Feb 20: cloud score from OM 60% should be ≥12 (got ${feb20.breakdown.cloudCover.score})`);
assert(feb20.breakdown.cloudCover.value === 60, `Feb 20: cloud value should be 60 (OM) not 94 (AW)`);
// AOD 0.35 should score lower than Goldilocks zone → pulls down from v5.1's 65
assertEqual(feb20.breakdown.aod.score, 9, 'Feb 20: AOD 0.35 = 9 (mild haze, not Goldilocks)');

// Scenario 17: Same day WITHOUT OM data — should fall back to AW (low score)
const feb20noOM = calculateSunriseScore(
  makeForecast({ cloud: 94, humidity: 95, vis: 6, wind: 12, precip: 10 }),
  { airQuality: { aod: 0.35 }, openMeteoForecast: null, dailyData: null }
);
assert(feb20noOM.score < 45, `Feb 20 without OM: falls back to AW, score <45 (got ${feb20noOM.score})`);

// Scenario 18: Chennai typical good winter morning with OM data
const typicalGoodOM = calculateSunriseScore(
  makeForecast({ cloud: 70, humidity: 88, vis: 8, wind: 10, date: '2024-12-15T06:00:00+05:30' }),
  makeExtras({
    highCloud: 40, midCloud: 15, lowCloud: 20,
    aod: 0.12, pressureMsl: [1015, 1014, 1013, 1012],
    omCloud: 45, omHumidity: 82, omVisM: 18000
  })
);
assert(typicalGoodOM.score >= 65, `Typical good Chennai winter (OM data) ≥65 (got ${typicalGoodOM.score})`);

// Scenario 19: Chennai monsoon morning — genuinely bad, should still score low
const monsoon = calculateSunriseScore(
  makeForecast({ cloud: 95, humidity: 98, vis: 2, wind: 25, precip: 80, desc: 'Rain' }),
  makeExtras({
    highCloud: 5, midCloud: 20, lowCloud: 90,
    aod: 0.8, pressureMsl: [1008, 1007, 1006, 1005],
    omCloud: 95, omHumidity: 97, omVisM: 3000
  })
);
assert(monsoon.score < 25, `Monsoon morning: genuinely bad <25 (got ${monsoon.score})`);

// Scenario 20: Verify OM data priority — when OM cloud is very different from AW
const dataConflict = calculateSunriseScore(
  makeForecast({ cloud: 90, humidity: 92, vis: 5 }),  // AW: bad
  makeExtras({
    highCloud: 45, midCloud: 10, lowCloud: 15,
    aod: 0.10, pressureMsl: [1015, 1013, 1011],
    omCloud: 40, omHumidity: 75, omVisM: 20000       // OM: great
  })
);
// Should trust OM: cloud 40% (optimal), humidity 75% (good), vis 20km (excellent)
assert(dataConflict.score >= 70, `OM override: AW bad but OM great → ≥70 (got ${dataConflict.score})`);
assert(dataConflict.breakdown.cloudCover.value === 40, 'OM cloud value used (40 not 90)');

// Scenario 21: v5.2 AOD Goldilocks vs hazy — the differentiator
// Same conditions but AOD 0.10 vs 0.50: should create significant score gap
const aodClean = calculateSunriseScore(
  makeForecast({ cloud: 45, humidity: 70, vis: 15, wind: 12 }),
  makeExtras({ highCloud: 35, midCloud: 20, lowCloud: 15, aod: 0.10, pressureMsl: [1013, 1013, 1013] })
);
const aodHazy = calculateSunriseScore(
  makeForecast({ cloud: 45, humidity: 70, vis: 15, wind: 12 }),
  makeExtras({ highCloud: 35, midCloud: 20, lowCloud: 15, aod: 0.50, pressureMsl: [1013, 1013, 1013] })
);
const aodGap = aodClean.score - aodHazy.score;
assert(aodGap >= 8, `AOD Goldilocks vs hazy gap ≥8 (got ${aodGap}): clean=${aodClean.score}, hazy=${aodHazy.score}`);

// ====================================
// v5.3: PHYSICS-CORRECTED SCENARIOS
// ====================================
testGroup('v5.3 Physics Corrections');

// Scenario A: All-low-stratus — cloud cover discount should apply
// Marina Feb 21: H:0% M:0% L:51%, cloud 51%, humidity 91%, AOD 0.43
const allLowStratus = calculateSunriseScore(
  makeForecast({ cloud: 51, humidity: 91, vis: 24, wind: 10, precip: 0, desc: 'Partly Cloudy' }),
  makeExtras({
    highCloud: 0, midCloud: 0, lowCloud: 51,
    aod: 0.43, pressureMsl: [1012.7, 1012.4, 1012.1, 1011.7, 1011.2, 1010.5, 1011.1],
    omCloud: 51, omHumidity: 91, omVisM: 24140
  })
);
assertInRange(allLowStratus.score, 40, 58, `v5.3 All-low-stratus (Marina Feb 21): ${allLowStratus.score} — should be "decent, not dramatic"`);
assert(allLowStratus.breakdown.cloudCover.lowStratusDiscount > 0, 'v5.3: low-stratus discount applied');
assert(allLowStratus.breakdown.cloudCover.score < 12, `v5.3: cloud score discounted (got ${allLowStratus.breakdown.cloudCover.score})`);

// Scenario B: Same cloud amount but WITH high canvas — should score higher
const highCanvas51 = calculateSunriseScore(
  makeForecast({ cloud: 51, humidity: 91, vis: 24, wind: 10, precip: 0 }),
  makeExtras({
    highCloud: 35, midCloud: 10, lowCloud: 10,
    aod: 0.43, pressureMsl: [1012.7, 1012.4, 1012.1, 1011.7, 1011.2, 1010.5, 1011.1],
    omCloud: 51, omHumidity: 91, omVisM: 24140
  })
);
assert(highCanvas51.score > allLowStratus.score, `v5.3: Same cloud% but with high canvas scores higher (${highCanvas51.score} > ${allLowStratus.score})`);
assertEqual(highCanvas51.breakdown.cloudCover.lowStratusDiscount, 0, 'v5.3: No discount when high canvas present');

// Scenario C: Covelong Feb 21 — H:66% L:58%, heavy low under high
const covelongFeb21 = calculateSunriseScore(
  makeForecast({ cloud: 86, humidity: 96, vis: 24, wind: 10, precip: 0 }),
  makeExtras({
    highCloud: 66, midCloud: 0, lowCloud: 58,
    aod: 0.43, pressureMsl: [1012.8, 1012.5, 1012.1, 1011.7, 1011.2, 1010.6, 1011.1],
    omCloud: 86, omHumidity: 96, omVisM: 24140
  })
);
assertInRange(covelongFeb21.score, 30, 50, `v5.3 Covelong Feb 21: ${covelongFeb21.score} (heavy overcast + humid)`);
// Multi-level should reflect heavy low under high (v5.3: 9, was 11)
assertInRange(covelongFeb21.breakdown.multiLevelCloud.score, 6, 10, `v5.3 Covelong multi-level: ${covelongFeb21.breakdown.multiLevelCloud.score}`);

// Scenario D: Pressure -1.6 should NOT get max score
const pressureNormal = calculateSunriseScore(
  makeForecast({ cloud: 45, humidity: 70, vis: 15, wind: 10 }),
  makeExtras({ highCloud: 40, midCloud: 10, lowCloud: 15, aod: 0.15, pressureMsl: [1012.7, 1011.1] })
);
assert(pressureNormal.breakdown.pressureTrend.score < 11, `v5.3: Δ-1.6 hPa pressure < 11 (got ${pressureNormal.breakdown.pressureTrend.score})`);

// Scenario E: Synergy should NOT reward all-low-stratus even with "optimal" cloud%
const synergyAllLow = getSynergyAdjustment(45, 85, 20, { highCloud: 0, midCloud: 0, lowCloud: 45 });
const synergyHighCanvas = getSynergyAdjustment(45, 85, 20, { highCloud: 30, midCloud: 10, lowCloud: 10 });
assert(synergyHighCanvas > synergyAllLow, `v5.3: Synergy rewards high canvas (${synergyHighCanvas}) > all-low (${synergyAllLow})`);
assertEqual(synergyAllLow, 0, `v5.3: All-low-stratus gets no synergy bonus`);
assert(synergyHighCanvas >= 2, `v5.3: High canvas gets synergy bonus (got ${synergyHighCanvas})`);

// Scenario F: Marina Feb 21 should score 12-18 pts LOWER than same conditions with high canvas
const gapLowVsHigh = highCanvas51.score - allLowStratus.score;
assert(gapLowVsHigh >= 8, `v5.3: High canvas vs all-low gap ≥8 (got ${gapLowVsHigh})`);

// ====================================
// 13. Breakdown structure verification (v5.2)
// ====================================
testGroup('Breakdown structure (v5.2)');

const result = calculateSunriseScore(
  makeForecast(),
  makeExtras({ highCloud: 40, midCloud: 20, lowCloud: 15, aod: 0.15, pressureMsl: [1013, 1012, 1011] })
);

const bd = result.breakdown;
assert(bd.cloudCover && bd.cloudCover.maxScore === 18, 'breakdown.cloudCover.maxScore = 18');
assert(bd.multiLevelCloud && bd.multiLevelCloud.maxScore === 20, 'breakdown.multiLevelCloud.maxScore = 20');
assert(bd.humidity && bd.humidity.maxScore === 15, 'breakdown.humidity.maxScore = 15');
assert(bd.pressureTrend && bd.pressureTrend.maxScore === 11, 'breakdown.pressureTrend.maxScore = 11');
assert(bd.aod && bd.aod.maxScore === 16, 'breakdown.aod.maxScore = 16');
assert(bd.visibility && bd.visibility.maxScore === 5, 'breakdown.visibility.maxScore = 5');
assert(bd.weather && bd.weather.maxScore === 5, 'breakdown.weather.maxScore = 5');
assert(bd.wind && bd.wind.maxScore === 5, 'breakdown.wind.maxScore = 5');
assert(typeof bd.synergy === 'number', 'breakdown.synergy is number');
assert(typeof bd.postRainBonus === 'number', 'breakdown.postRainBonus is number');
assert(typeof bd.solarBonus === 'number', 'breakdown.solarBonus is number');
assert(typeof bd.isPostRain === 'boolean', 'breakdown.isPostRain is boolean');
assert(bd.multiLevelCloud.high != null, 'breakdown.multiLevelCloud.high present');
assert(bd.multiLevelCloud.mid != null, 'breakdown.multiLevelCloud.mid present');
assert(bd.multiLevelCloud.low != null, 'breakdown.multiLevelCloud.low present');
assert(bd.pressureTrend.value != null, 'breakdown.pressureTrend.value present');
assert(bd.aod.value != null, 'breakdown.aod.value present');

// v5.2: Verify base sum = 95 (18+20+15+11+16+5+5+5) + synergy ±4 + postRain + solar
const baseSum = bd.cloudCover.maxScore + bd.multiLevelCloud.maxScore + bd.humidity.maxScore +
  bd.pressureTrend.maxScore + bd.aod.maxScore + bd.visibility.maxScore + bd.weather.maxScore + bd.wind.maxScore;
assertEqual(baseSum, 95, `v5.2 base sum = 95 (got ${baseSum})`);

// ====================================
// 14. getVerdict
// ====================================
testGroup('getVerdict');

assertEqual(getVerdict(95), 'EXCELLENT', '95 = EXCELLENT');
assertEqual(getVerdict(85), 'EXCELLENT', '85 = EXCELLENT');
assertEqual(getVerdict(75), 'VERY GOOD', '75 = VERY GOOD');
assertEqual(getVerdict(70), 'VERY GOOD', '70 = VERY GOOD');
assertEqual(getVerdict(60), 'GOOD', '60 = GOOD');
assertEqual(getVerdict(55), 'GOOD', '55 = GOOD');
assertEqual(getVerdict(45), 'FAIR', '45 = FAIR');
assertEqual(getVerdict(40), 'FAIR', '40 = FAIR');
assertEqual(getVerdict(30), 'POOR', '30 = POOR');
assertEqual(getVerdict(25), 'POOR', '25 = POOR');
assertEqual(getVerdict(20), 'UNFAVORABLE', '20 = UNFAVORABLE');
assertEqual(getVerdict(0), 'UNFAVORABLE', '0 = UNFAVORABLE');

// ====================================
// 15. getRecommendation
// ====================================
testGroup('getRecommendation');

assertEqual(getRecommendation(90), 'GO', '90 = GO');
assertEqual(getRecommendation(70), 'GO', '70 = GO');
assertEqual(getRecommendation(60), 'MAYBE', '60 = MAYBE');
assertEqual(getRecommendation(50), 'MAYBE', '50 = MAYBE');
assertEqual(getRecommendation(40), 'SKIP', '40 = SKIP');
assertEqual(getRecommendation(30), 'SKIP', '30 = SKIP');
assertEqual(getRecommendation(20), 'NO', '20 = NO');
assertEqual(getRecommendation(10), 'NO', '10 = NO');

// ====================================
// 16. getAtmosphericLabels (v5)
// ====================================
testGroup('getAtmosphericLabels (v5)');

const labels = getAtmosphericLabels(
  { cloudCover: 45, humidity: 60, visibility: 16, windSpeed: 8 },
  { multiLevelCloud: { high: 50, mid: 20, low: 10 }, aod: { value: 0.12 }, pressureTrend: { value: -3 } }
);

assertEqual(labels.cloudLabel, 'Optimal', 'Cloud 45% = Optimal');
assertEqual(labels.humidityLabel, 'Very Good', 'Humidity 60% = Very Good');
assertEqual(labels.visibilityLabel, 'Excellent', 'Vis 16km = Excellent');
assertEqual(labels.windLabel, 'Calm', 'Wind 8km/h = Calm');
assertEqual(labels.cloudLayerLabel, 'High Canvas', 'High clouds + low clear = High Canvas');
assertEqual(labels.aodLabel, 'Very Clean', 'AOD 0.12 = Very Clean');
assertEqual(labels.pressureLabel, 'Clearing Front', 'Δ-3 = Clearing Front');

// Test N/A for missing data
const labelsNoData = getAtmosphericLabels(
  { cloudCover: 45, humidity: 60, visibility: 16, windSpeed: 8 },
  {}
);
assertEqual(labelsNoData.cloudLayerLabel, 'N/A', 'No cloud layer data = N/A');
assertEqual(labelsNoData.aodLabel, 'N/A', 'No AOD data = N/A');
assertEqual(labelsNoData.pressureLabel, 'N/A', 'No pressure data = N/A');

// Context strings exist
assert(labels.cloudContext.length > 10, 'Cloud context exists');
assert(labels.humidityContext.length > 10, 'Humidity context exists');
assert(labels.visibilityContext.length > 10, 'Visibility context exists');
assert(labels.cloudLayerContext.length > 10, 'Cloud layer context exists');
assert(labels.aodContext.length > 10, 'AOD context exists');
assert(labels.pressureContext.length > 10, 'Pressure context exists');

// ====================================
// 17. Score clamping and edge cases
// ====================================
testGroup('Score clamping and edge cases');

// Score must always be 0-100
for (let i = 0; i < 10; i++) {
  const extremeForecast = makeForecast({
    cloud: Math.random() * 100,
    humidity: Math.random() * 100,
    vis: Math.random() * 25,
    wind: Math.random() * 60,
    precip: Math.random() * 100
  });
  const extremeExtras = makeExtras({
    highCloud: Math.random() * 100,
    midCloud: Math.random() * 100,
    lowCloud: Math.random() * 100,
    aod: Math.random() * 2,
    pressureMsl: [1013 + (Math.random() - 0.5) * 20, 1013 + (Math.random() - 0.5) * 20]
  });
  const r = calculateSunriseScore(extremeForecast, extremeExtras);
  assertInRange(r.score, 0, 100, `Random scenario ${i + 1}: score ${r.score.toFixed(1)} in [0, 100]`);
}

// ====================================
// SUMMARY
// ====================================
console.log('\n################################');
console.log('# TEST SUMMARY (v5.3)');
console.log('################################');
console.log(`Total Tests Run:    ${testsRun}`);
console.log(`Tests Passed:       ${testsPassed}`);
console.log(`Tests Failed:       ${testsFailed}`);
const successRate = ((testsPassed / testsRun) * 100).toFixed(2);
console.log(`Success Rate:       ${successRate}%`);

if (testsFailed === 0) {
  console.log('\n✅ ALL TESTS PASSED!');
  process.exit(0);
} else {
  console.log(`\n❌ ${testsFailed} TEST(S) FAILED:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
