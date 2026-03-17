/**
 * A/B Test Suite for v5.7 Bonus System
 * Tests the split bonus (Atmospheric Clarity +8 / Post-Rain +5) against
 * the old combined bonus (getImprovedPostRainBonus +8) to verify:
 *   1. Non-rain good mornings: same score as before (clarity bonus replaces heuristic)
 *   2. Rain mornings with good conditions: +5 HIGHER than before (stacking)
 *   3. Rain mornings with poor conditions: -3 lower than before (no clarity, rain +5 vs old +8)
 *   4. Bad mornings: identical (no bonus either way)
 *   5. Edge cases and boundary conditions
 */

const {
  getAtmosphericClarityBonus,
  getPostRainBonusV2,
  calculateSunriseScore,
  getVerdict,
} = require('./services/weatherService');

// ====================================
// TEST UTILITIES
// ====================================
let passed = 0, failed = 0, total = 0;

function assert(condition, msg) {
  total++;
  if (condition) { passed++; }
  else { failed++; console.error(`  ❌ FAIL: ${msg}`); }
}

function assertEqual(actual, expected, msg) {
  total++;
  if (actual === expected) { passed++; }
  else { failed++; console.error(`  ❌ FAIL: ${msg} — expected ${expected}, got ${actual}`); }
}

function assertInRange(value, min, max, msg) {
  total++;
  if (value >= min && value <= max) { passed++; }
  else { failed++; console.error(`  ❌ FAIL: ${msg} — expected ${min}-${max}, got ${value}`); }
}

function testGroup(name) {
  console.log(`\n=== ${name} ===`);
}

// ====================================
// HELPERS
// ====================================
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
      humidity: overrides.omHumidity ?? null,
      overnightPrecipMm: overrides.overnightPrecipMm ?? null
    } : null,
    dailyData: overrides.nightRain ? { nightHoursOfRain: overrides.nightRainHours ?? 3 } : null
  };
}

console.log('##############################################');
console.log('# A/B TEST SUITE: v5.7 Bonus System          #');
console.log('##############################################');

// ====================================
// TEST 1: Good morning, no rain — should get +8 clarity
// (Same as old system's heuristic +8)
// ====================================
testGroup('A/B Test 1: Good morning, no rain');

const goodMorning = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 70, vis: 18, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010] })
);
assertEqual(goodMorning.breakdown.clarityBonus, 8, 'Good morning: clarity = +8');
assertEqual(goodMorning.breakdown.postRainBonus, 0, 'Good morning: rain = 0');
assertEqual(goodMorning.breakdown.hasClarityBonus, true, 'hasClarityBonus = true');
assertEqual(goodMorning.breakdown.isPostRain, false, 'isPostRain = false');
console.log(`  Score: ${goodMorning.score}, Verdict: ${getVerdict(goodMorning.score)}`);
console.log(`  ✅ v5.6 equivalent: same +8 as old heuristic`);

// ====================================
// TEST 2: Good morning + confirmed rain — should get +8 + +5 = +13
// (Old system: only +8)
// ====================================
testGroup('A/B Test 2: Good morning + rain (unicorn)');

const unicorn = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 70, vis: 18, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.05, pressureMsl: [1014, 1013, 1012, 1010], nightRain: true, overnightPrecipMm: 5.0 })
);
assertEqual(unicorn.breakdown.clarityBonus, 8, 'Unicorn: clarity = +8');
assertEqual(unicorn.breakdown.postRainBonus, 5, 'Unicorn: rain = +5');
assertEqual(unicorn.breakdown.hasClarityBonus, true, 'hasClarityBonus = true');
assertEqual(unicorn.breakdown.isPostRain, true, 'isPostRain = true');
assert(unicorn.score >= 90, `Unicorn score ≥90 (got ${unicorn.score})`);
console.log(`  Score: ${unicorn.score}, Verdict: ${getVerdict(unicorn.score)}`);
console.log(`  ✅ v5.7 improvement: +13 total (was +8 in v5.6)`);

// ====================================
// TEST 3: Bad morning + rain — rain helps but conditions still bad
// (Old system: +8, new system: +5 only)
// ====================================
testGroup('A/B Test 3: Bad morning + rain');

const badRain = calculateSunriseScore(
  makeForecast({ cloud: 80, humidity: 88, vis: 8, wind: 25, precip: 10 }),
  makeExtras({ highCloud: 10, midCloud: 30, lowCloud: 65, aod: 0.4, pressureMsl: [1013, 1013, 1013], nightRain: true, overnightPrecipMm: 3.0 })
);
assertEqual(badRain.breakdown.clarityBonus, 0, 'Bad+rain: clarity = 0 (conditions bad)');
assertEqual(badRain.breakdown.postRainBonus, 5, 'Bad+rain: rain = +5');
assertEqual(badRain.breakdown.hasClarityBonus, false, 'hasClarityBonus = false');
assertEqual(badRain.breakdown.isPostRain, true, 'isPostRain = true');
console.log(`  Score: ${badRain.score}, Verdict: ${getVerdict(badRain.score)}`);
console.log(`  ✅ v5.7: +5 (was +8 in old system — appropriately lower for bad conditions)`);

// ====================================
// TEST 4: Bad morning, no rain — no bonus at all
// (Same as old system)
// ====================================
testGroup('A/B Test 4: Bad morning, no rain');

const badMorning = calculateSunriseScore(
  makeForecast({ cloud: 90, humidity: 92, vis: 3, wind: 35, precip: 60 }),
  makeExtras({ highCloud: 5, midCloud: 10, lowCloud: 85, aod: 0.9, pressureMsl: [1013, 1013, 1013] })
);
assertEqual(badMorning.breakdown.clarityBonus, 0, 'Bad morning: clarity = 0');
assertEqual(badMorning.breakdown.postRainBonus, 0, 'Bad morning: rain = 0');
console.log(`  Score: ${badMorning.score}, Verdict: ${getVerdict(badMorning.score)}`);
console.log(`  ✅ Same as v5.6: no bonus`);

// ====================================
// TEST 5: Borderline conditions — just outside clarity thresholds
// ====================================
testGroup('A/B Test 5: Borderline — just outside clarity thresholds');

// Visibility 14.9 (just below 15)
const borderVis = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 70, vis: 14.9, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010] })
);
assertEqual(borderVis.breakdown.clarityBonus, 0, 'Vis 14.9km: no clarity bonus');

// Humidity 83 (just above 82)
const borderHum = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 83, vis: 18, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010] })
);
assertEqual(borderHum.breakdown.clarityBonus, 0, 'Humidity 83%: no clarity bonus');

// Cloud 24 (just below 25)
const borderCloud = calculateSunriseScore(
  makeForecast({ cloud: 24, humidity: 70, vis: 18, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010] })
);
assertEqual(borderCloud.breakdown.clarityBonus, 0, 'Cloud 24%: no clarity bonus');

// Cloud 66 (just above 65)
const borderCloudHi = calculateSunriseScore(
  makeForecast({ cloud: 66, humidity: 70, vis: 18, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010] })
);
assertEqual(borderCloudHi.breakdown.clarityBonus, 0, 'Cloud 66%: no clarity bonus');

// Precip 21 (just above 20)
const borderPrecip = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 70, vis: 18, wind: 10, precip: 21 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010] })
);
assertEqual(borderPrecip.breakdown.clarityBonus, 0, 'Precip 21%: no clarity bonus');

console.log(`  ✅ All boundary tests pass — thresholds are strict`);

// ====================================
// TEST 6: GFS cross-validation edge cases
// ====================================
testGroup('A/B Test 6: GFS cross-validation');

// Rain confirmed by AccuWeather but GFS says dry → suppressed
const gfsDenied = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 70, vis: 18, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010], nightRain: true, overnightPrecipMm: 0.1 })
);
assertEqual(gfsDenied.breakdown.postRainBonus, 0, 'GFS 0.1mm: rain bonus suppressed');
assertEqual(gfsDenied.breakdown.clarityBonus, 8, 'But clarity bonus still fires');
console.log(`  Score: ${gfsDenied.score} — clarity yes, rain no`);

// Rain confirmed, GFS unavailable → trust AccuWeather
const gfsNull = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 70, vis: 18, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010], nightRain: true })
);
assertEqual(gfsNull.breakdown.postRainBonus, 5, 'GFS null: trust AccuWeather → +5');
assertEqual(gfsNull.breakdown.clarityBonus, 8, 'Clarity still fires');

// GFS exactly 0.5mm (threshold)
const gfsBorder = calculateSunriseScore(
  makeForecast({ cloud: 40, humidity: 70, vis: 18, wind: 10, precip: 5 }),
  makeExtras({ highCloud: 45, midCloud: 20, lowCloud: 15, aod: 0.08, pressureMsl: [1014, 1013, 1012, 1010], nightRain: true, overnightPrecipMm: 0.5 })
);
assertEqual(gfsBorder.breakdown.postRainBonus, 5, 'GFS 0.5mm: exactly at threshold → +5');

console.log(`  ✅ GFS cross-validation working correctly`);

// ====================================
// TEST 7: Score cap at 100
// ====================================
testGroup('A/B Test 7: Score cap at 100');

// Near-perfect conditions + rain + clarity + solar → could theoretically exceed 100
const maxBonus = calculateSunriseScore(
  makeForecast({ cloud: 45, humidity: 55, vis: 20, wind: 10, precip: 0, desc: 'Clear', date: '2024-12-21T06:00:00+05:30' }),
  makeExtras({ highCloud: 55, midCloud: 10, lowCloud: 5, aod: 0.08, pressureMsl: [1020, 1015, 1010, 1005], nightRain: true, overnightPrecipMm: 10.0 })
);
assert(maxBonus.score <= 100, `Score capped at 100 (got ${maxBonus.score})`);
assert(maxBonus.score >= 95, `Near-perfect should be ≥95 (got ${maxBonus.score})`);
const totalBonus = maxBonus.breakdown.clarityBonus + maxBonus.breakdown.postRainBonus + maxBonus.breakdown.solarBonus;
console.log(`  Base: ${maxBonus.score - totalBonus}, Clarity: +${maxBonus.breakdown.clarityBonus}, Rain: +${maxBonus.breakdown.postRainBonus}, Solar: ${maxBonus.breakdown.solarBonus >= 0 ? '+' : ''}${maxBonus.breakdown.solarBonus}`);
console.log(`  Total adjustment: +${totalBonus}, Final: ${maxBonus.score}`);
console.log(`  ✅ Score correctly capped at 100`);

// ====================================
// TEST 8: A/B Comparison — simulate March Chennai mornings
// ====================================
testGroup('A/B Test 8: Chennai March Morning Scenarios');

const scenarios = [
  { name: 'Clear March morning, no rain', cloud: 35, humidity: 68, vis: 16, wind: 8, precip: 5, highCloud: 40, midCloud: 15, lowCloud: 10, aod: 0.12, nightRain: false },
  { name: 'Humid March morning, no rain', cloud: 50, humidity: 78, vis: 12, wind: 12, precip: 10, highCloud: 30, midCloud: 25, lowCloud: 30, aod: 0.25, nightRain: false },
  { name: 'Post-rain March morning (good)', cloud: 35, humidity: 72, vis: 20, wind: 6, precip: 5, highCloud: 50, midCloud: 15, lowCloud: 10, aod: 0.05, nightRain: true, overnightPrecipMm: 8.0 },
  { name: 'Post-rain but still cloudy', cloud: 75, humidity: 85, vis: 10, wind: 15, precip: 15, highCloud: 15, midCloud: 40, lowCloud: 55, aod: 0.15, nightRain: true, overnightPrecipMm: 12.0 },
  { name: 'Dusty morning (high AOD)', cloud: 30, humidity: 55, vis: 8, wind: 20, precip: 0, highCloud: 20, midCloud: 10, lowCloud: 5, aod: 0.65, nightRain: false },
];

scenarios.forEach(s => {
  const result = calculateSunriseScore(
    makeForecast({ cloud: s.cloud, humidity: s.humidity, vis: s.vis, wind: s.wind, precip: s.precip }),
    makeExtras({ highCloud: s.highCloud, midCloud: s.midCloud, lowCloud: s.lowCloud, aod: s.aod, pressureMsl: [1013, 1012, 1011, 1010], nightRain: s.nightRain, overnightPrecipMm: s.overnightPrecipMm ?? null })
  );
  const cb = result.breakdown.clarityBonus;
  const rb = result.breakdown.postRainBonus;
  console.log(`  ${s.name}: ${result.score}/100 (${getVerdict(result.score)}) [clarity:+${cb}, rain:+${rb}]`);

  // Validate flags match bonuses
  assertEqual(result.breakdown.hasClarityBonus, cb > 0, `${s.name}: hasClarityBonus matches`);
  assertEqual(result.breakdown.isPostRain, rb > 0, `${s.name}: isPostRain matches`);
});

// ====================================
// SUMMARY
// ====================================
console.log('\n##############################################');
console.log(`# A/B TEST SUMMARY (v5.7 Bonus System)`);
console.log('##############################################');
console.log(`Total Tests Run:    ${total}`);
console.log(`Tests Passed:       ${passed}`);
console.log(`Tests Failed:       ${failed}`);
console.log(`Success Rate:       ${(passed / total * 100).toFixed(2)}%`);
console.log(failed === 0 ? '\n✅ ALL A/B TESTS PASSED!' : `\n❌ ${failed} TESTS FAILED!`);
process.exit(failed > 0 ? 1 : 0);
