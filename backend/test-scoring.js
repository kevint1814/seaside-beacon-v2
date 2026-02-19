/**
 * Comprehensive Test Suite for Sunrise Scoring Functions (v5)
 * Tests all scoring functions from weatherService.js
 * Imports directly from weatherService.js — no duplicate implementations
 * 250+ assertions covering all functions, edge cases, and graceful degradation
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
console.log('# SUNRISE SCORING TEST SUITE v5');
console.log('################################');

// ====================================
// 1. scoreCloudCover (max 25)
// ====================================
testGroup('scoreCloudCover (max 25)');

// Clear sky range (0-15%)
assertInRange(scoreCloudCover(0), 6, 9, 'Cloud 0%: clear sky base');
assertInRange(scoreCloudCover(10), 6, 11, 'Cloud 10%: clear sky');
assertInRange(scoreCloudCover(15), 9, 14, 'Cloud 15%: boundary');

// Approaching optimal (15-30%)
assertInRange(scoreCloudCover(20), 9, 14, 'Cloud 20%: scattered');
assertInRange(scoreCloudCover(25), 14, 18, 'Cloud 25%: approaching optimal');

// Optimal range (30-60%) — should score highest
assertInRange(scoreCloudCover(30), 21, 25, 'Cloud 30%: optimal start');
assertInRange(scoreCloudCover(45), 24, 25, 'Cloud 45%: optimal peak');
assertInRange(scoreCloudCover(60), 21, 25, 'Cloud 60%: optimal end');
assert(scoreCloudCover(45) >= scoreCloudCover(30), 'Peak at 45% >= 30%');
assert(scoreCloudCover(45) >= scoreCloudCover(60), 'Peak at 45% >= 60%');

// Above optimal (60-90%)
assert(scoreCloudCover(70) < scoreCloudCover(60), 'Cloud 70% < 60% (declining)');
assert(scoreCloudCover(80) < scoreCloudCover(70), 'Cloud 80% < 70% (declining)');
assertInRange(scoreCloudCover(75), 10, 21, 'Cloud 75%: partly overcast');

// Heavy overcast (>90%)
assert(scoreCloudCover(95) < 5, 'Cloud 95%: near-total overcast very low');
assertInRange(scoreCloudCover(100), 0, 4, 'Cloud 100%: total overcast');

// Bounds check
for (let cc = 0; cc <= 100; cc += 5) {
  assertInRange(scoreCloudCover(cc), 0, 25, `Cloud ${cc}% within [0, 25]`);
}

// ====================================
// 2. scoreMultiLevelCloud (max 15) — NEW v5 BASE FACTOR
// ====================================
testGroup('scoreMultiLevelCloud (max 15)');

// Best case: high clouds present, low minimal
assertEqual(scoreMultiLevelCloud(40, 20, 20, null, 50), 15, 'High 40%, low 20%, mid 20% = 15 (ideal)');
assertEqual(scoreMultiLevelCloud(35, 45, 30, null, 50), 13, 'High 35%, mid 45%, low 30% = 13');
assertEqual(scoreMultiLevelCloud(50, 65, 30, null, 50), 11, 'High 50%, mid 65%, low 30% = 11');

// High clouds with low cloud interference
assertEqual(scoreMultiLevelCloud(40, 50, 50, null, 50), 9, 'High 40%, low 50% (mixed) = 9');
assertEqual(scoreMultiLevelCloud(40, 50, 80, null, 50), 5, 'High 40%, low 80% (blocked) = 5');

// Minimal high clouds
assertEqual(scoreMultiLevelCloud(20, 55, 40, null, 50), 7, 'High 20%, mid 55% = 7 (mid canvas)');
assertEqual(scoreMultiLevelCloud(20, 30, 30, null, 50), 5, 'High 20%, no canvas = 5');
assertEqual(scoreMultiLevelCloud(20, 30, 60, null, 50), 3, 'High 20%, low 60% = 3');
assertEqual(scoreMultiLevelCloud(20, 30, 80, null, 50), 1, 'High 20%, low 80% = 1 (worst)');

// Graceful degradation — no multi-level data
assertEqual(scoreMultiLevelCloud(null, null, null, null, 50), 8, 'No data at all → 8 (neutral)');
assertEqual(scoreMultiLevelCloud(null, null, null, 7000, 50), 13, 'Ceiling 7000m fallback → 13');
assertEqual(scoreMultiLevelCloud(null, null, null, 5000, 50), 11, 'Ceiling 5000m fallback → 11');
assertEqual(scoreMultiLevelCloud(null, null, null, 2500, 50), 8, 'Ceiling 2500m fallback → 8');
assertEqual(scoreMultiLevelCloud(null, null, null, 1500, 50), 4, 'Ceiling 1500m fallback → 4');
assertEqual(scoreMultiLevelCloud(null, null, null, 500, 50), 2, 'Ceiling 500m fallback → 2');
assertEqual(scoreMultiLevelCloud(null, null, null, 8000, 10), 8, 'Ceiling with low cloud cover → 8 (neutral)');

// Bounds check
for (const h of [0, 20, 40, 60, 80, 100]) {
  for (const l of [0, 30, 60, 90]) {
    const score = scoreMultiLevelCloud(h, 30, l, null, 50);
    assertInRange(score, 0, 15, `MultiLevel H:${h}% L:${l}% within [0, 15]`);
  }
}

// ====================================
// 3. scoreHumidity (max 20)
// ====================================
testGroup('scoreHumidity (max 20)');

assertEqual(scoreHumidity(30), 20, 'Humidity 30% = 20 (max, exceptional)');
assertEqual(scoreHumidity(55), 20, 'Humidity 55% = 20 (boundary)');
assertInRange(scoreHumidity(60), 15, 19, 'Humidity 60%: excellent');
assertInRange(scoreHumidity(70), 10, 15, 'Humidity 70%: good');
assertInRange(scoreHumidity(80), 5, 10, 'Humidity 80%: moderate');
assertInRange(scoreHumidity(90), 2, 5, 'Humidity 90%: high');
assertInRange(scoreHumidity(95), 0, 2, 'Humidity 95%: very high');
assertInRange(scoreHumidity(100), 0, 2, 'Humidity 100%: fog territory');

// Monotonic decrease
assert(scoreHumidity(50) >= scoreHumidity(60), 'Lower humidity → higher score');
assert(scoreHumidity(60) >= scoreHumidity(70), 'Humidity curve monotonic');
assert(scoreHumidity(70) >= scoreHumidity(80), 'Humidity curve monotonic');
assert(scoreHumidity(80) >= scoreHumidity(90), 'Humidity curve monotonic');

// Bounds
for (let h = 0; h <= 100; h += 10) {
  assertInRange(scoreHumidity(h), 0, 20, `Humidity ${h}% within [0, 20]`);
}

// ====================================
// 4. scorePressureTrend (max 10) — NEW v5 BASE FACTOR
// ====================================
testGroup('scorePressureTrend (max 10)');

// Best case: moderate fall (clearing front)
assertEqual(scorePressureTrend([1013, 1012, 1010, 1009]), 10, 'Δ-4hPa (clearing front) = 10');
assertEqual(scorePressureTrend([1020, 1018, 1016, 1015.5]), 10, 'Δ-4.5hPa (clearing front) = 10');

// Good: slight fall
assertInRange(scorePressureTrend([1013, 1012, 1011.5]), 7, 8, 'Δ-1.5hPa (slight fall)');

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
// 5. scoreAOD (max 8) — NEW v5 BASE FACTOR
// ====================================
testGroup('scoreAOD (max 8)');

assertEqual(scoreAOD(0.05), 8, 'AOD 0.05 (exceptional clarity) = 8');
assertEqual(scoreAOD(0.15), 7, 'AOD 0.15 (very clean) = 7');
assertEqual(scoreAOD(0.25), 6, 'AOD 0.25 (clean) = 6');
assertEqual(scoreAOD(0.35), 5, 'AOD 0.35 (mild haze) = 5');
assertEqual(scoreAOD(0.5), 3, 'AOD 0.5 (noticeable haze) = 3');
assertEqual(scoreAOD(0.8), 1, 'AOD 0.8 (heavy haze) = 1');
assertEqual(scoreAOD(1.5), 0, 'AOD 1.5 (dust event) = 0');

// Graceful degradation
assertEqual(scoreAOD(null), 4, 'AOD null → 4 (neutral)');
assertEqual(scoreAOD(-1), 4, 'AOD negative → 4 (neutral)');
assertEqual(scoreAOD(undefined), 4, 'AOD undefined → 4 (neutral)');

// Monotonic decrease
assert(scoreAOD(0.05) >= scoreAOD(0.15), 'AOD monotonic decrease');
assert(scoreAOD(0.15) >= scoreAOD(0.25), 'AOD monotonic decrease');
assert(scoreAOD(0.25) >= scoreAOD(0.5), 'AOD monotonic decrease');
assert(scoreAOD(0.5) >= scoreAOD(0.8), 'AOD monotonic decrease');
assert(scoreAOD(0.8) >= scoreAOD(1.5), 'AOD monotonic decrease');

// ====================================
// 6. scoreVisibility (max 10)
// ====================================
testGroup('scoreVisibility (max 10)');

assertEqual(scoreVisibility(20), 10, 'Vis 20km = 10 (max)');
assertEqual(scoreVisibility(18), 10, 'Vis 18km = 10 (full marks)');
assertInRange(scoreVisibility(15), 7, 10, 'Vis 15km: good-excellent');
assertInRange(scoreVisibility(10), 5, 7, 'Vis 10km: decent');
assertInRange(scoreVisibility(5), 3, 5, 'Vis 5km: reduced');
assertInRange(scoreVisibility(3), 1, 3, 'Vis 3km: poor');
assertInRange(scoreVisibility(1), 0, 1, 'Vis 1km: very poor');

// Bounds
for (let v = 0; v <= 25; v += 2) {
  assertInRange(scoreVisibility(v), 0, 10, `Vis ${v}km within [0, 10]`);
}

// ====================================
// 7. scoreWeatherConditions (max 5)
// ====================================
testGroup('scoreWeatherConditions (max 5)');

// Clear conditions
assertInRange(scoreWeatherConditions(0, false, 'Clear'), 5, 5, 'Clear sky = 5 (max + bonus capped)');
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
// 8. scoreWind (max 3)
// ====================================
testGroup('scoreWind (max 3)');

assertEqual(scoreWind(0), 3, 'Wind 0 km/h = 3 (ideal)');
assertEqual(scoreWind(5), 3, 'Wind 5 km/h = 3');
assertEqual(scoreWind(10), 3, 'Wind 10 km/h = 3');
assertEqual(scoreWind(15), 2, 'Wind 15 km/h = 2');
assertEqual(scoreWind(20), 2, 'Wind 20 km/h = 2');
assertEqual(scoreWind(25), 1, 'Wind 25 km/h = 1');
assertEqual(scoreWind(30), 1, 'Wind 30 km/h = 1');
assertEqual(scoreWind(35), 0, 'Wind 35 km/h = 0');
assertEqual(scoreWind(50), 0, 'Wind 50 km/h = 0');

// ====================================
// 9. getSynergyAdjustment (±4)
// ====================================
testGroup('getSynergyAdjustment (±4)');

// Fog override
assertEqual(getSynergyAdjustment(50, 70, 2), -4, 'Fog (<3km) → -4');
assertEqual(getSynergyAdjustment(50, 70, 4), -3, 'Heavy mist (<5km) → -3');

// Best combo: low humidity + optimal clouds
assertEqual(getSynergyAdjustment(45, 60, 15), 4, 'Optimal cloud + low humidity = +4');

// Good combo
assertInRange(getSynergyAdjustment(30, 70, 12), 2, 4, 'Good cloud + ok humidity');

// Bad combos
assert(getSynergyAdjustment(90, 90, 12) < 0, 'High humidity + high cloud + good vis < 0');
assert(getSynergyAdjustment(10, 60, 15) < 0, 'Very clear sky penalty');

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
// 11. getImprovedPostRainBonus
// ====================================
testGroup('getImprovedPostRainBonus');

// Temporal signal: night rain + dry morning
const forecastDry = { PrecipitationProbability: 10 };
assertEqual(
  getImprovedPostRainBonus(forecastDry, { nightHoursOfRain: 3 }),
  5,
  'Night rain + dry 6AM → +5'
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

// Heuristic fallback: high vis + moderate cloud + elevated humidity
const forecastHeuristic = {
  PrecipitationProbability: 10,
  Visibility: { Value: 18, Unit: 'km' },
  CloudCover: 40,
  RelativeHumidity: 70
};
assertEqual(
  getImprovedPostRainBonus(forecastHeuristic, null),
  5,
  'Post-rain heuristic signature → +5'
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
// 12. calculateSunriseScore — Full Integration (v5)
// ====================================
testGroup('calculateSunriseScore — v5 Integration');

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
      pressureMsl: overrides.pressureMsl ?? [1013, 1012, 1011, 1010]
    } : null,
    dailyData: overrides.nightRain ? { nightHoursOfRain: 3 } : null
  };
}

// Scenario 1: Perfect conditions
const perfect = calculateSunriseScore(
  makeForecast({ cloud: 45, humidity: 55, vis: 20, wind: 5, precip: 0, desc: 'Clear' }),
  makeExtras({ highCloud: 50, midCloud: 10, lowCloud: 10, aod: 0.05, pressureMsl: [1013, 1012, 1010, 1009] })
);
assert(perfect.score >= 85, `Perfect conditions score ≥85 (got ${perfect.score})`);
assert(perfect.breakdown.multiLevelCloud.score === 15, 'Perfect: multiLevel = 15');
assert(perfect.breakdown.aod.score === 8, 'Perfect: AOD = 8');
assert(perfect.breakdown.pressureTrend.score === 10, 'Perfect: pressure = 10');

// Scenario 2: Good conditions (typical good Chennai winter morning)
const good = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 72, vis: 14, wind: 10 }),
  makeExtras({ highCloud: 35, midCloud: 25, lowCloud: 25, aod: 0.2, pressureMsl: [1013, 1013, 1013] })
);
assertInRange(good.score, 55, 85, `Good conditions: ${good.score}`);

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
assert(storm.score < 30, `Storm score <30 (got ${storm.score})`);

// Scenario 5: Post-rain magic
const postRain = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 70, vis: 18, wind: 5, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010], nightRain: true })
);
assert(postRain.score >= 80, `Post-rain magic score ≥80 (got ${postRain.score})`);
assertEqual(postRain.breakdown.postRainBonus, 5, 'Post-rain bonus applied');
assertEqual(postRain.breakdown.isPostRain, true, 'isPostRain flag set');

// Scenario 6: No Open-Meteo data (graceful degradation)
const noOpenMeteo = calculateSunriseScore(
  makeForecast({ cloud: 45, humidity: 58, vis: 12, wind: 8, ceiling: 6000 }),
  { airQuality: null, openMeteoForecast: null, dailyData: null }
);
assertInRange(noOpenMeteo.score, 50, 90, `No Open-Meteo: reasonable score ${noOpenMeteo.score}`);
assertEqual(noOpenMeteo.breakdown.multiLevelCloud.score, 13, 'Ceiling 6000m fallback → 13');
assertEqual(noOpenMeteo.breakdown.pressureTrend.score, 5, 'No pressure data → 5 (neutral)');
assertEqual(noOpenMeteo.breakdown.aod.score, 4, 'No AOD data → 4 (neutral)');

// Scenario 7: Completely empty extras
const noExtras = calculateSunriseScore(
  makeForecast({ cloud: 50, humidity: 75, vis: 10, wind: 15 }),
  {}
);
assertInRange(noExtras.score, 35, 75, `No extras: reasonable score ${noExtras.score}`);

// Scenario 8: Clear sky with high clouds (dawn photographer's good day)
const clearHighCloud = calculateSunriseScore(
  makeForecast({ cloud: 35, humidity: 60, vis: 16, wind: 5 }),
  makeExtras({ highCloud: 60, midCloud: 10, lowCloud: 5, aod: 0.12, pressureMsl: [1013, 1012, 1011] })
);
assert(clearHighCloud.score >= 70, `Clear+high clouds ≥70 (got ${clearHighCloud.score})`);

// Scenario 9: Low cloud blanket (worst for sunrise)
const lowBlanket = calculateSunriseScore(
  makeForecast({ cloud: 85, humidity: 88, vis: 5, wind: 20 }),
  makeExtras({ highCloud: 5, midCloud: 10, lowCloud: 90, aod: 0.6, pressureMsl: [1013, 1013, 1013] })
);
assert(lowBlanket.score < 35, `Low cloud blanket <35 (got ${lowBlanket.score})`);

// Scenario 10: Fog (very low vis + high humidity = synergy penalty dominates)
const fog = calculateSunriseScore(
  makeForecast({ cloud: 50, humidity: 95, vis: 1, wind: 2, desc: 'Fog' }),
  makeExtras({ highCloud: 10, midCloud: 20, lowCloud: 60, aod: 0.6, pressureMsl: [1013, 1013, 1013] })
);
assert(fog.score < 45, `Fog score <45 (got ${fog.score})`);

// Scenario 11: Hazy Chennai summer
const hazySummer = calculateSunriseScore(
  makeForecast({ cloud: 20, humidity: 82, vis: 8, wind: 15, date: '2024-06-15T06:00:00+05:30' }),
  makeExtras({ highCloud: 10, midCloud: 20, lowCloud: 15, aod: 0.7, pressureMsl: [1010, 1010, 1010] })
);
assertInRange(hazySummer.score, 15, 45, `Hazy summer: ${hazySummer.score}`);

// Scenario 12: Stable high pressure winter
const stableWinter = calculateSunriseScore(
  makeForecast({ cloud: 30, humidity: 60, vis: 16, wind: 5, date: '2024-12-15T06:00:00+05:30' }),
  makeExtras({ highCloud: 25, midCloud: 30, lowCloud: 10, aod: 0.15, pressureMsl: [1018, 1018, 1018, 1018] })
);
assertInRange(stableWinter.score, 55, 85, `Stable winter: ${stableWinter.score}`);

// Scenario 13: Clearing front approaching — dramatic sky potential
const clearingFront = calculateSunriseScore(
  makeForecast({ cloud: 50, humidity: 65, vis: 14, wind: 12 }),
  makeExtras({ highCloud: 40, midCloud: 30, lowCloud: 25, aod: 0.1, pressureMsl: [1018, 1016, 1014, 1012] })
);
assert(clearingFront.score >= 70, `Clearing front ≥70 (got ${clearingFront.score})`);

// Scenario 14: Dust/pollution event
const dustEvent = calculateSunriseScore(
  makeForecast({ cloud: 30, humidity: 60, vis: 6, wind: 15 }),
  makeExtras({ highCloud: 20, midCloud: 15, lowCloud: 10, aod: 1.5, pressureMsl: [1013, 1013, 1013] })
);
assertInRange(dustEvent.score, 30, 70, `Dust event: ${dustEvent.score}`);
assertEqual(dustEvent.breakdown.aod.score, 0, 'Dust: AOD = 0');

// Scenario 15: Edge case — all neutral/default
const allNeutral = calculateSunriseScore(
  makeForecast({ cloud: 50, humidity: 75, vis: 10, wind: 15 }),
  makeExtras({ highCloud: 25, midCloud: 25, lowCloud: 25, aod: 0.3, pressureMsl: [1013, 1013, 1013] })
);
assertInRange(allNeutral.score, 35, 65, `All neutral: ${allNeutral.score}`);

// ====================================
// 13. Breakdown structure verification
// ====================================
testGroup('Breakdown structure (v5)');

const result = calculateSunriseScore(
  makeForecast(),
  makeExtras({ highCloud: 40, midCloud: 20, lowCloud: 15, aod: 0.15, pressureMsl: [1013, 1012, 1011] })
);

const bd = result.breakdown;
assert(bd.cloudCover && bd.cloudCover.maxScore === 25, 'breakdown.cloudCover.maxScore = 25');
assert(bd.multiLevelCloud && bd.multiLevelCloud.maxScore === 15, 'breakdown.multiLevelCloud.maxScore = 15');
assert(bd.humidity && bd.humidity.maxScore === 20, 'breakdown.humidity.maxScore = 20');
assert(bd.pressureTrend && bd.pressureTrend.maxScore === 10, 'breakdown.pressureTrend.maxScore = 10');
assert(bd.aod && bd.aod.maxScore === 8, 'breakdown.aod.maxScore = 8');
assert(bd.visibility && bd.visibility.maxScore === 10, 'breakdown.visibility.maxScore = 10');
assert(bd.weather && bd.weather.maxScore === 5, 'breakdown.weather.maxScore = 5');
assert(bd.wind && bd.wind.maxScore === 3, 'breakdown.wind.maxScore = 3');
assert(typeof bd.synergy === 'number', 'breakdown.synergy is number');
assert(typeof bd.postRainBonus === 'number', 'breakdown.postRainBonus is number');
assert(typeof bd.solarBonus === 'number', 'breakdown.solarBonus is number');
assert(typeof bd.isPostRain === 'boolean', 'breakdown.isPostRain is boolean');
assert(bd.multiLevelCloud.high != null, 'breakdown.multiLevelCloud.high present');
assert(bd.multiLevelCloud.mid != null, 'breakdown.multiLevelCloud.mid present');
assert(bd.multiLevelCloud.low != null, 'breakdown.multiLevelCloud.low present');
assert(bd.pressureTrend.value != null, 'breakdown.pressureTrend.value present');
assert(bd.aod.value != null, 'breakdown.aod.value present');

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
console.log('# TEST SUMMARY (v5)');
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
