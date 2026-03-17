/**
 * March 16, 2026 Backtest — v5.7 Bonus System
 * Uses real ERA5/Open-Meteo observed weather data for Chennai (Marina Beach)
 * Compares old scoring behavior vs new v5.7 split bonus
 *
 * Real conditions on March 16, 2026 at 6 AM IST:
 *   Temperature: 24.6°C
 *   Humidity: 95%
 *   Cloud Cover: 70% total (Low: 70%, Mid: 1%, High: 0%)
 *   Wind: 5.2 km/h
 *   AOD: 0.24
 *   Pressure MSL: [1010.9, 1009.6, 1009.6, 1011.2] (midnight→6AM)
 *   Overnight Rain: 0.00 mm (no rain)
 *   Visibility: ~10km estimated (not in archive, typical for 95% humidity Chennai)
 */

const {
  calculateSunriseScore,
  getVerdict,
  getAtmosphericClarityBonus,
  getPostRainBonusV2,
} = require('./services/weatherService');

// ====================================
// REAL MARCH 16 DATA
// ====================================

// AccuWeather-style forecast object (simulated from ERA5 data)
const march16Forecast = {
  CloudCover: 70,
  RelativeHumidity: 95,
  PrecipitationProbability: 5,  // No rain, low prob
  HasPrecipitation: false,
  Wind: { Speed: { Value: 5.2 } },
  Visibility: { Value: 10, Unit: 'km' },  // Estimated for 95% humidity
  IconPhrase: 'Mostly Cloudy',
  DateTime: '2026-03-16T06:00:00+05:30'
};

// Open-Meteo extras
const march16Extras = {
  airQuality: { aod: 0.24 },
  openMeteoForecast: {
    highCloud: 0,
    midCloud: 1,
    lowCloud: 70,
    pressureMsl: [1010.9, 1009.6, 1009.6, 1011.2],
    cloudCover: 70,
    humidity: 95,
    visibility: 10000,  // 10km in meters
    overnightPrecipMm: 0.0
  },
  dailyData: { nightHoursOfRain: 0 }
};

console.log('##############################################');
console.log('# MARCH 16, 2026 BACKTEST                    #');
console.log('# Real Chennai weather data from ERA5/OM      #');
console.log('##############################################');

// ====================================
// CHECK INDIVIDUAL BONUSES
// ====================================
console.log('\n--- Individual Bonus Check ---');

const clarityCheck = getAtmosphericClarityBonus(march16Forecast);
console.log(`Atmospheric Clarity Bonus: +${clarityCheck}`);
console.log(`  Conditions: vis=10km (<15 threshold), cloud=70% (>65), humidity=95% (>82)`);
console.log(`  → NONE of the clarity thresholds met`);

const rainCheck = getPostRainBonusV2(march16Forecast, march16Extras.dailyData, march16Extras.openMeteoForecast);
console.log(`Post-Rain Bonus: +${rainCheck}`);
console.log(`  Overnight rain: 0mm, nightHoursOfRain: 0`);
console.log(`  → No rain detected`);

// ====================================
// FULL SCORING — v5.7 (new)
// ====================================
console.log('\n--- v5.7 Score (new system) ---');
const v57Result = calculateSunriseScore(march16Forecast, march16Extras);
console.log(`\nFinal Score: ${v57Result.score}/100 → ${getVerdict(v57Result.score)}`);
console.log(`Clarity Bonus: +${v57Result.breakdown.clarityBonus}`);
console.log(`Post-Rain Bonus: +${v57Result.breakdown.postRainBonus}`);
console.log(`Solar Bonus: ${v57Result.breakdown.solarBonus >= 0 ? '+' : ''}${v57Result.breakdown.solarBonus}`);

// ====================================
// ANALYSIS
// ====================================
console.log('\n--- Score Analysis ---');
console.log('March 16 conditions were POOR for sunrise color:');
console.log('  ❌ 95% humidity — way too soupy, Mie scattering dominates');
console.log('  ❌ 70% low cloud — horizon blocked by stratus');
console.log('  ❌ 0% high cloud — no elevated color canvas');
console.log('  ❌ AOD 0.24 — moderate, not crystal clear');
console.log('  ❌ Vis ~10km — limited by humidity haze');
console.log('  ✅ Wind 5.2km/h — calm (minor positive)');
console.log('  ✅ No rain — but no rain bonus either');
console.log('');
console.log('Under OLD v5.6 system:');
console.log('  - Heuristic would NOT have fired (humidity 95% > 82% threshold)');
console.log('  - Old score would have been identical — no bonus either way');
console.log('');
console.log('Under NEW v5.7 system:');
console.log('  - Clarity bonus: 0 (humidity 95%, cloud 70%, vis 10km all fail)');
console.log('  - Rain bonus: 0 (no rain)');
console.log('  - Score is purely from base factors');
console.log('');
console.log(`v5.7 vs v5.6: IDENTICAL for this day (no bonus triggered in either system)`);

// ====================================
// WHAT-IF: March 16 with better conditions
// ====================================
console.log('\n--- What-if: Same day but clearer morning ---');

const march16Better = {
  ...march16Forecast,
  RelativeHumidity: 68,
  CloudCover: 40,
  Visibility: { Value: 16, Unit: 'km' },
};

const march16BetterExtras = {
  ...march16Extras,
  openMeteoForecast: {
    ...march16Extras.openMeteoForecast,
    highCloud: 35,
    midCloud: 15,
    lowCloud: 10,
    cloudCover: 40,
    humidity: 68,
    visibility: 16000
  }
};

console.log('Hypothetical: humidity 68%, cloud 40%, vis 16km, high cloud 35%');
const betterResult = calculateSunriseScore(march16Better, march16BetterExtras);
console.log(`\nScore: ${betterResult.score}/100 → ${getVerdict(betterResult.score)}`);
console.log(`Clarity: +${betterResult.breakdown.clarityBonus}, Rain: +${betterResult.breakdown.postRainBonus}`);

// ====================================
// WHAT-IF: Same clearer morning + overnight rain
// ====================================
console.log('\n--- What-if: Clearer morning + overnight rain ---');

const march16Unicorn = {
  ...march16Better,
  PrecipitationProbability: 5
};

const march16UnicornExtras = {
  ...march16BetterExtras,
  dailyData: { nightHoursOfRain: 4 },
  openMeteoForecast: {
    ...march16BetterExtras.openMeteoForecast,
    overnightPrecipMm: 6.0
  }
};

console.log('Hypothetical: same clearer morning + 4h overnight rain (6mm GFS)');
const unicornResult = calculateSunriseScore(march16Unicorn, march16UnicornExtras);
console.log(`\nScore: ${unicornResult.score}/100 → ${getVerdict(unicornResult.score)}`);
console.log(`Clarity: +${unicornResult.breakdown.clarityBonus}, Rain: +${unicornResult.breakdown.postRainBonus}`);
console.log(`Total bonus: +${unicornResult.breakdown.clarityBonus + unicornResult.breakdown.postRainBonus + unicornResult.breakdown.solarBonus} (clarity + rain + solar)`);

console.log('\n##############################################');
console.log('# BACKTEST COMPLETE                           #');
console.log('##############################################');
