// ==========================================
// Weather Service - AccuWeather + Open-Meteo Integration
// Research-backed sunrise quality scoring (v5)
//
// v3: Added Open-Meteo AOD, cloud ceiling analysis,
//     seasonal solar angle, improved post-rain detection
// v4: Added multi-level cloud cover (high/mid/low) from Open-Meteo GFS,
//     pressure tendency (midnight→6AM), replaces ceiling with multi-level when available
// v5: Full weight rebalance — promoted multi-level clouds (#1 SunsetWx),
//     pressure tendency (#2 SunsetWx), and AOD (NOAA Mie scattering)
//     from additive adjustments into base weights. Research-aligned architecture.
//
// KEY FINDING: Cloud cover 30-60% = OPTIMAL
// (previously scored 0% as best - scientifically incorrect)
//
// v5 Base Weights (96 pts + synergy ±4 = 100 max):
//   Cloud 25 | MultiLevel 15 | Humidity 20 | Pressure 10 | AOD 8 | Vis 10 | Weather 5 | Wind 3 | Synergy ±4
// Adjustments (minor additive): PostRain +5 | Solar ±2
// ==========================================

const axios = require('axios');

const ACCUWEATHER_API_KEY = process.env.ACCUWEATHER_API_KEY;
const CHENNAI_LOCATION_KEY = '206671';

// Beach configurations
const BEACHES = {
  marina: {
    name: 'Marina Beach',
    key: 'marina',
    locationKey: CHENNAI_LOCATION_KEY,
    coordinates: { lat: 13.0499, lon: 80.2824 },
    context: 'The world\'s longest urban beach. Key elements: lighthouse (north end), fishing boats (colorful vallamkaran boats launch at dawn), the pier, long flat sand, urban Chennai skyline as backdrop, large tidal pools during low tide.'
  },
  elliot: {
    name: "Elliot's Beach",
    key: 'elliot',
    locationKey: CHENNAI_LOCATION_KEY,
    coordinates: { lat: 13.0067, lon: 80.2669 },
    context: 'Quieter, upscale Besant Nagar beach. Key elements: Karl Schmidt Memorial (stone structure on beach), clean white sand, Ashtalakshmi Temple visible in background, fewer crowds, calm water.'
  },
  covelong: {
    name: 'Covelong Beach',
    key: 'covelong',
    locationKey: CHENNAI_LOCATION_KEY,
    coordinates: { lat: 12.7925, lon: 80.2514 },
    context: 'Secluded surf beach 40km south. Key elements: natural rock formations and tidal pools, rolling waves, dramatic cliffs to the south, isolated and pristine, minimal urban intrusion.'
  },
  thiruvanmiyur: {
    name: 'Thiruvanmiyur Beach',
    key: 'thiruvanmiyur',
    locationKey: CHENNAI_LOCATION_KEY,
    coordinates: { lat: 12.9826, lon: 80.2589 },
    context: 'Residential neighborhood beach. Key elements: tidal pools, natural breakwater rocks, calmer than Marina, accessible parking and walkways.'
  }
};

/**
 * Check if predictions are available (6 PM - 6 AM IST window)
 */
function isPredictionTimeAvailable() {
  const now = new Date();
  const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const currentHour = istTime.getHours();
  return currentHour >= 18 || currentHour < 6;
}

/**
 * Get time until predictions are available
 */
function getTimeUntilAvailable() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const currentHour = istTime.getUTCHours();
  const currentMinute = istTime.getUTCMinutes();

  if (currentHour >= 18 || currentHour < 6) {
    return { available: true, hoursLeft: 0, minutesLeft: 0 };
  }

  const hoursLeft = 17 - currentHour;
  const minutesLeft = 60 - currentMinute;

  return { available: false, hoursLeft, minutesLeft };
}

/**
 * Get list of all beaches
 */
function getBeaches() {
  return Object.values(BEACHES).map(beach => ({
    key: beach.key,
    name: beach.name,
    coordinates: beach.coordinates,
    context: beach.context || ''
  }));
}

/**
 * Fetch 12-hour hourly forecast from AccuWeather
 */
async function fetchAccuWeatherHourly(locationKey) {
  try {
    const url = `http://dataservice.accuweather.com/forecasts/v1/hourly/12hour/${locationKey}`;
    const response = await axios.get(url, {
      params: { apikey: ACCUWEATHER_API_KEY, details: true, metric: true }
    });
    console.log(`✅ Fetched ${response.data.length} hours of forecast data`);
    return response.data;
  } catch (error) {
    console.error('❌ AccuWeather API Error:', error.response?.data || error.message);
    throw new Error(`AccuWeather API failed: ${error.message}`);
  }
}

/**
 * Fetch 1-day daily forecast from AccuWeather
 * Returns Sun.Rise, Sun.Set and daily summary
 * Cached per locationKey — sunrise is the same for all beaches in the same city
 */
const _dailyCache = {};
async function fetchAccuWeatherDaily(locationKey) {
  // Return cached result if fetched within last 2 hours
  const cached = _dailyCache[locationKey];
  if (cached && (Date.now() - cached.fetchedAt < 2 * 60 * 60 * 1000)) {
    console.log('🌅 Using cached daily forecast');
    return cached.data;
  }

  try {
    const url = `http://dataservice.accuweather.com/forecasts/v1/daily/1day/${locationKey}`;
    const response = await axios.get(url, {
      params: { apikey: ACCUWEATHER_API_KEY, details: true, metric: true }
    });
    const daily = response.data?.DailyForecasts?.[0];
    if (!daily) return null;

    const sunRiseRaw = daily.Sun?.Rise;
    const sunSetRaw = daily.Sun?.Set;

    const sunRise = sunRiseRaw ? new Date(sunRiseRaw) : null;
    const sunSet = sunSetRaw ? new Date(sunSetRaw) : null;

    console.log(`🌅 Sunrise: ${sunRise ? sunRise.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }) : 'N/A'}`);
    console.log(`🌇 Sunset: ${sunSet ? sunSet.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }) : 'N/A'}`);

    const result = {
      sunRise,
      sunSet,
      hoursOfSun: daily.HoursOfSun || null,
      moonPhase: daily.Moon?.Phase || null,
      nightHoursOfRain: daily.Night?.HoursOfRain || 0  // v3: temporal post-rain signal
    };

    // Cache it
    _dailyCache[locationKey] = { data: result, fetchedAt: Date.now() };

    return result;
  } catch (error) {
    console.warn('⚠️ AccuWeather daily forecast failed:', error.message);
    return null;
  }
}

// ==========================================
// OPEN-METEO AIR QUALITY (v3 — free, no API key)
// Aerosol Optical Depth is a physics-based proxy
// for atmospheric light scattering — far more
// accurate than visibility alone.
// ==========================================

const _aodCache = {};
/**
 * Fetch aerosol data from Open-Meteo (free, no API key)
 * Returns { aod, pm25 } at 6 AM IST, or null if unavailable
 */
async function fetchOpenMeteoAirQuality(lat, lon) {
  const cacheKey = `${lat},${lon}`;
  const cached = _aodCache[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt < 2 * 60 * 60 * 1000)) {
    console.log('🌫️ Using cached AOD data');
    return cached.data;
  }

  try {
    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality';
    const response = await axios.get(url, {
      params: {
        latitude: lat,
        longitude: lon,
        hourly: 'pm2_5,pm10,aerosol_optical_depth',
        timezone: 'Asia/Kolkata',
        forecast_days: 2
      },
      timeout: 3000 // 3s timeout — don't block main request
    });

    const hourly = response.data?.hourly;
    if (!hourly || !hourly.time || !hourly.aerosol_optical_depth) {
      console.warn('⚠️ Open-Meteo returned no AOD data');
      return null;
    }

    // Find the hour closest to 6 AM IST tomorrow
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(now.getTime() + istOffset);
    const currentHour = nowIST.getUTCHours();

    // Target: next 6 AM IST
    let targetDate = new Date(nowIST);
    if (currentHour >= 6) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }
    const targetStr = `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDate.getUTCDate()).padStart(2, '0')}T06:00`;

    const idx = hourly.time.indexOf(targetStr);
    const useIdx = idx >= 0 ? idx : hourly.time.findIndex(t => t.includes('T06:00'));

    if (useIdx < 0) {
      console.warn('⚠️ Could not find 6 AM in Open-Meteo data');
      return null;
    }

    const result = {
      aod: hourly.aerosol_optical_depth[useIdx],
      pm25: hourly.pm2_5?.[useIdx] || null,
      pm10: hourly.pm10?.[useIdx] || null,
      time: hourly.time[useIdx]
    };

    console.log(`🌫️ AOD at 6 AM: ${result.aod?.toFixed(3) ?? 'N/A'} | PM2.5: ${result.pm25?.toFixed(1) ?? 'N/A'}`);
    _aodCache[cacheKey] = { data: result, fetchedAt: Date.now() };
    return result;
  } catch (error) {
    console.warn(`⚠️ Open-Meteo AOD unavailable: ${error.message} — using visibility alone`);
    return null;
  }
}

// ==========================================
// OPEN-METEO FORECAST (v4 — multi-level clouds + pressure)
// Separate endpoint from air quality API.
// Provides cloud_cover_low/mid/high and pressure_msl
// hourly — the two variables SunsetWx has that we didn't.
// ==========================================

const _forecastCache = {};
/**
 * Fetch multi-level cloud cover + pressure from Open-Meteo forecast API (free, no key)
 * Returns { highCloud, midCloud, lowCloud, pressureMsl[] } at 6 AM IST, or null
 */
async function fetchOpenMeteoForecast(lat, lon) {
  const cacheKey = `${lat},${lon}`;
  const cached = _forecastCache[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt < 2 * 60 * 60 * 1000)) {
    console.log('🌥️ Using cached Open-Meteo forecast data');
    return cached.data;
  }

  try {
    const url = 'https://api.open-meteo.com/v1/forecast';
    const response = await axios.get(url, {
      params: {
        latitude: lat,
        longitude: lon,
        hourly: 'cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl',
        timezone: 'Asia/Kolkata',
        forecast_days: 2
      },
      timeout: 3000
    });

    const hourly = response.data?.hourly;
    if (!hourly || !hourly.time || !hourly.cloud_cover_high) {
      console.warn('⚠️ Open-Meteo forecast returned no cloud level data');
      return null;
    }

    // Find 6 AM IST tomorrow (same logic as AOD function)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(now.getTime() + istOffset);
    const currentHour = nowIST.getUTCHours();

    let targetDate = new Date(nowIST);
    if (currentHour >= 6) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }
    const targetStr = `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDate.getUTCDate()).padStart(2, '0')}T06:00`;

    const idx6AM = hourly.time.indexOf(targetStr);
    const useIdx = idx6AM >= 0 ? idx6AM : hourly.time.findIndex(t => t.includes('T06:00'));

    if (useIdx < 0) {
      console.warn('⚠️ Could not find 6 AM in Open-Meteo forecast data');
      return null;
    }

    // Extract midnight pressure for trend calculation (6 hours before 6 AM)
    const idxMidnight = useIdx - 6;
    const pressureMsl = [];
    if (idxMidnight >= 0) {
      for (let i = idxMidnight; i <= useIdx; i++) {
        pressureMsl.push(hourly.pressure_msl[i]);
      }
    }

    const result = {
      highCloud: hourly.cloud_cover_high[useIdx],
      midCloud: hourly.cloud_cover_mid[useIdx],
      lowCloud: hourly.cloud_cover_low[useIdx],
      pressureMsl,  // array: [midnight, 1AM, 2AM, 3AM, 4AM, 5AM, 6AM]
      time: hourly.time[useIdx]
    };

    console.log(`🌥️ Cloud levels at 6 AM — High: ${result.highCloud}% Mid: ${result.midCloud}% Low: ${result.lowCloud}%`);
    if (pressureMsl.length >= 2) {
      const pChange = pressureMsl[pressureMsl.length - 1] - pressureMsl[0];
      console.log(`📊 Pressure: ${pressureMsl[0]?.toFixed(1)} → ${pressureMsl[pressureMsl.length - 1]?.toFixed(1)} hPa (Δ${pChange >= 0 ? '+' : ''}${pChange.toFixed(1)})`);
    }

    _forecastCache[cacheKey] = { data: result, fetchedAt: Date.now() };
    return result;
  } catch (error) {
    console.warn(`⚠️ Open-Meteo forecast unavailable: ${error.message} — using ceiling fallback`);
    return null;
  }
}

/**
 * AOD SCORE (max 8 points — v5 base factor, promoted from v4's ±4 adjustment)
 * AOD is a direct measurement of light-scattering particles in the atmosphere.
 * Research: NOAA, NASA MODIS — AOD correlates directly with color muting via Mie scattering.
 * Promoted to base weight because it's the physics gold standard for atmospheric clarity.
 *
 * AOD < 0.1:  Post-rain crystal clarity (rare, exceptional)
 * AOD 0.1-0.2: Clean air (typical good morning)
 * AOD 0.2-0.4: Slight aerosol load (mild haze)
 * AOD 0.4-0.7: Moderate haze
 * AOD 0.7-1.0: Heavy haze
 * AOD > 1.0:  Dust/pollution event
 *
 * Graceful degradation: returns 4/8 (neutral) when no AOD data available.
 */
function scoreAOD(aod) {
  if (aod == null || aod < 0) return 4;  // Neutral default — assume moderate

  if (aod < 0.1) return 8;   // Exceptional clarity — full marks
  if (aod < 0.2) return 7;   // Very clean air
  if (aod < 0.3) return 6;   // Clean, slight aerosol
  if (aod < 0.4) return 5;   // Good, mild haze
  if (aod < 0.7) return 3;   // Noticeable haze — below neutral
  if (aod < 1.0) return 1;   // Heavy haze
  return 0;                    // Dust/pollution event
}

// Legacy wrapper for backward compatibility (test files, etc.)
function getAODAdjustment(aod) {
  if (aod == null || aod < 0) return 0;
  if (aod < 0.1) return 4;
  if (aod < 0.2) return 3;
  if (aod < 0.4) return 1;
  if (aod < 0.7) return -1;
  if (aod < 1.0) return -2;
  return -4;
}

// ==========================================
// CLOUD CEILING ANALYSIS (v3)
// High clouds (cirrus, >6000m) catch pre-sunrise
// light first — best canvas for reds/oranges.
// Low clouds (<2000m) block the horizon.
// ==========================================

/**
 * CLOUD CEILING ADJUSTMENT (±3 points)
 * AccuWeather Ceiling = base height of lowest cloud layer (meters)
 *
 * High clouds are scientifically better for sunrise color because:
 * 1. They catch sunlight while it's still below the observer's horizon
 * 2. Thin cirrus at 6000m+ acts as an ideal reflective canvas
 * 3. Low stratus/fog blocks direct line of sight to the horizon
 */
function getCloudCeilingAdjustment(ceilingMeters, cloudCover) {
  if (ceilingMeters == null) return 0;

  // If sky is mostly clear, ceiling is less relevant
  if (cloudCover < 25) return 0;

  if (ceilingMeters > 6000) return 3;   // High cirrus — ideal
  if (ceilingMeters > 4000) return 2;   // Mid-high — good
  if (ceilingMeters > 2000) return 1;   // Mid-altitude — fair
  if (ceilingMeters > 1000) return -1;  // Low — blocks horizon
  return -3;                             // Very low / fog territory
}

// ==========================================
// SEASONAL SOLAR ANGLE (v3)
// Lower sun angle at sunrise = longer atmospheric
// path = more Rayleigh scattering = more vivid reds.
// Nov-Feb best, May-Jul worst for Chennai (13°N).
// ==========================================

/**
 * Calculate solar declination for a given date
 * Simplified astronomical formula (±0.5° accuracy, sufficient for scoring)
 */
function getSolarDeclination(date) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  return 23.44 * Math.sin(((dayOfYear - 81) * Math.PI) / 182.5);
}

/**
 * SEASONAL SOLAR ANGLE BONUS (±2 points)
 *
 * At Chennai (13.08°N):
 *   Nov-Feb: sun rises at a low angle → long atmospheric path → vivid reds
 *   May-Jul: sun rises at a steep angle → short path → less scattering
 *
 * We use solar declination as a proxy for the sunrise elevation angle.
 * Negative declination (winter) = low sunrise angle = bonus.
 * Large positive declination (summer) = high angle = penalty.
 */
function getSolarAngleBonus(date) {
  const dec = getSolarDeclination(date);
  // At 13°N: when declination is negative (Oct-Feb), sunrise is low and slow
  // When declination is large positive (May-Jul), sunrise is high and fast

  if (dec < -10) return 2;   // Deep winter (Nov-Jan) — best for reds
  if (dec < 0)   return 1;   // Late autumn/early spring — good
  if (dec < 10)  return 0;   // Neutral (Mar-Apr, Aug-Sep)
  if (dec < 20)  return -1;  // Approaching summer — less scattering
  return -2;                  // Peak summer (May-Jul) — steepest angle
}

// ==========================================
// IMPROVED POST-RAIN DETECTION (v3)
// Uses AccuWeather Night.HoursOfRain temporal
// signal instead of heuristic data signature.
// ==========================================

/**
 * IMPROVED POST-RAIN BONUS (0 or +5 points)
 *
 * Post-rain conditions produce the clearest air (aerosol washout)
 * and often leave broken clouds at ideal 30-60% coverage.
 *
 * PRIMARY signal (temporal): Previous night had rain but 6 AM is dry
 * FALLBACK signal (heuristic): High visibility + moderate cloud + elevated humidity
 */
function getImprovedPostRainBonus(forecastRaw, dailyData) {
  const precipProb = forecastRaw.PrecipitationProbability || 0;

  // PRIMARY: Temporal signal from AccuWeather daily forecast
  if (dailyData && dailyData.nightHoursOfRain > 0 && precipProb <= 20) {
    console.log(`🌧️ Post-rain temporal signal: ${dailyData.nightHoursOfRain}h rain last night, 6AM precip ${precipProb}%`);
    return 5;
  }

  // FALLBACK: Data signature heuristic (when daily data unavailable)
  const humidity = forecastRaw.RelativeHumidity || 0;
  const visibilityRaw = forecastRaw.Visibility?.Value || 0;
  const visibilityUnit = forecastRaw.Visibility?.Unit || 'km';
  const visibility = visibilityUnit === 'mi' ? visibilityRaw * 1.60934 : visibilityRaw;
  const cloudCover = forecastRaw.CloudCover || 0;

  const isPostRainSignature =
    precipProb <= 20 &&
    visibility >= 15 &&
    cloudCover >= 25 && cloudCover <= 65 &&
    humidity >= 60 && humidity <= 82;

  if (isPostRainSignature) {
    console.log('🌧️ Post-rain data signature detected (heuristic fallback)');
    return 5;
  }

  return 0;
}

// ==========================================
// MULTI-LEVEL CLOUD SCORING (v4)
// SunsetWx's #1 factor: high clouds catch
// pre-sunrise light → ideal color canvas.
// Low clouds block the horizon entirely.
// Replaces ceiling adjustment when available.
// ==========================================

/**
 * MULTI-LEVEL CLOUD SCORE (max 15 points — v5 base factor, promoted from v4's ±5 adjustment)
 * SunsetWx's #1 factor. Uses Open-Meteo's cloud_cover_low/mid/high from GFS model.
 *
 * High clouds (cirrus, >6000m): Thin, wispy → catch red/orange light while
 *   sun is still below horizon. SunsetWx: "high clouds are weighted the most
 *   and are necessary for a Vivid sunset."
 * Mid clouds (2000-6000m): Moderate canvas, some light passes through.
 * Low clouds (<2000m): Block horizon, worst for sunrise viewing.
 *
 * Scoring philosophy: reward high cloud presence, penalize low cloud dominance.
 *
 * Graceful degradation:
 *   - If multi-level data unavailable but ceiling exists → estimate from ceiling
 *   - If no data at all → 8/15 (neutral)
 */
function scoreMultiLevelCloud(highCloud, midCloud, lowCloud, ceilingMeters, cloudCover) {
  // ── NO MULTI-LEVEL DATA: try ceiling fallback ──
  if (highCloud == null) {
    if (ceilingMeters != null && cloudCover >= 25) {
      // Estimate from AccuWeather ceiling (less granular)
      if (ceilingMeters >= 6000) return 13;   // High cirrus likely
      if (ceilingMeters >= 4000) return 11;   // Mid-high
      if (ceilingMeters > 2000) return 8;    // Mid-altitude — neutral
      if (ceilingMeters > 1000) return 4;    // Low — blocks horizon
      return 2;                               // Very low / fog territory
    }
    return 8;  // Neutral default — no data
  }

  // ── BEST CASE: High clouds present, low clouds minimal ──
  // "Vivid sunrise" signature: cirrus canvas + clear horizon
  if (highCloud >= 30 && lowCloud < 40) {
    if (midCloud < 30) return 15;   // Pure high cloud canvas — ideal
    if (midCloud < 60) return 13;   // High + some mid — still great
    return 11;                       // High + heavy mid — good but less contrast
  }

  // ── HIGH CLOUDS WITH LOW CLOUD INTERFERENCE ──
  if (highCloud >= 30 && lowCloud >= 40) {
    if (lowCloud >= 75) return 5;   // High clouds exist but horizon is blocked
    return 9;                        // Mixed — some light gets through gaps
  }

  // ── MINIMAL HIGH CLOUDS ──
  if (highCloud < 30) {
    if (lowCloud >= 75) return 1;    // Thick low stratus, no canvas above → worst
    if (lowCloud >= 50) return 3;    // Heavy low cover, limited ceiling view
    if (midCloud >= 50) return 7;    // Mid clouds provide some canvas
    return 5;                         // Mostly clear — no canvas, but no blockage
  }

  return 8;  // Neutral fallthrough
}

// Legacy wrapper for backward compatibility
function getMultiLevelCloudAdjustment(highCloud, midCloud, lowCloud) {
  if (highCloud == null) return 0;
  if (highCloud >= 30 && lowCloud < 40) {
    if (midCloud < 30) return 5;
    if (midCloud < 60) return 4;
    return 3;
  }
  if (highCloud >= 30 && lowCloud >= 40) {
    if (lowCloud >= 75) return -1;
    return 1;
  }
  if (highCloud < 30) {
    if (lowCloud >= 75) return -3;
    if (lowCloud >= 50) return -2;
    if (midCloud >= 50) return 0;
    return -1;
  }
  return 0;
}

// ==========================================
// PRESSURE TENDENCY (v4)
// SunsetWx's #2 factor: falling pressure
// signals approaching front → dramatic
// cloud breakup and clearing patterns.
// ==========================================

/**
 * PRESSURE TREND SCORE (max 10 points — v5 base factor, promoted from v4's ±3 adjustment)
 * SunsetWx's #2 factor. Input: array of hourly pressure_msl values from midnight to 6 AM IST.
 *
 * Meteorological basis (SunsetWx, NOAA):
 *   Falling 2-5 hPa over 6h → cold front approaching → cloud breakup,
 *   dramatic clearing patterns, vivid color through cloud gaps.
 *   Rapidly falling >5 hPa → severe weather → too much cloud/rain.
 *   Stable/rising → high pressure dominance → predictable but less dramatic.
 *
 * Graceful degradation: returns 5/10 (neutral, assume stable) when no data.
 */
function scorePressureTrend(pressureMsl) {
  if (!pressureMsl || pressureMsl.length < 2) return 5;  // Neutral default

  const pStart = pressureMsl[0];
  const pEnd = pressureMsl[pressureMsl.length - 1];

  if (pStart == null || pEnd == null) return 5;  // Neutral default

  const change = pEnd - pStart;  // positive = rising, negative = falling

  // Rapidly falling (>5 hPa in 6h) → severe weather approaching
  if (change < -5) {
    console.log(`📊 Pressure rapidly falling (${change.toFixed(1)} hPa): storm risk`);
    return 2;  // Bad but not zero — storms sometimes clear fast
  }

  // Moderate fall (2-5 hPa) → clearing front → dramatic skies
  if (change < -2) {
    console.log(`📊 Pressure falling (${change.toFixed(1)} hPa): clearing front — dramatic skies`);
    return 10;  // Best scenario — approaching front with clearing patterns
  }

  // Slight fall (1-2 hPa) → weak system, some instability → interesting skies
  if (change < -1) {
    console.log(`📊 Pressure slightly falling (${change.toFixed(1)} hPa): mild instability`);
    return 8;
  }

  // Very slight fall (0.5-1 hPa) → marginal instability
  if (change < -0.5) {
    return 7;
  }

  // Stable (-0.5 to +0.5 hPa) → high pressure, predictable
  if (change <= 0.5) {
    return 5;
  }

  // Rising (>0.5 hPa) → high pressure building, very stable, less dramatic
  if (change <= 2) {
    return 4;
  }

  // Rapidly rising (>2 hPa) → strong high pressure, clear but boring
  return 3;
}

// Legacy wrapper for backward compatibility
function getPressureTrendAdjustment(pressureMsl) {
  if (!pressureMsl || pressureMsl.length < 2) return 0;
  const pStart = pressureMsl[0];
  const pEnd = pressureMsl[pressureMsl.length - 1];
  if (pStart == null || pEnd == null) return 0;
  const change = pEnd - pStart;
  if (change < -5) return -3;
  if (change < -2) return 3;
  if (change < -0.5) return 1;
  return 0;
}

/**
 * Calculate golden hour times from actual sunrise
 * Start = 20 min before sunrise (first color)
 * Peak = 10 min before sunrise (richest light)
 * End = 30 min after sunrise (warm light fading)
 */
function calculateGoldenHour(sunRise) {
  if (!sunRise) return null;

  const start = new Date(sunRise.getTime() - 20 * 60 * 1000);
  const peak = new Date(sunRise.getTime() - 10 * 60 * 1000);
  const end = new Date(sunRise.getTime() + 30 * 60 * 1000);

  const fmt = (d) => d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toUpperCase();

  return {
    start: fmt(start),
    peak: fmt(peak),
    end: fmt(end),
    sunriseExact: fmt(sunRise)
  };
}

/**
 * Find next 6 AM IST forecast
 */
function findNext6AM(hourlyData) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(now.getTime() + istOffset);
  const currentHour = nowIST.getUTCHours();

  console.log(`🕐 Current IST hour: ${currentHour}`);

  let target6AM_IST = new Date(nowIST);

  if (currentHour >= 6) {
    // After 6 AM: show tomorrow's 6 AM
    target6AM_IST.setUTCDate(target6AM_IST.getUTCDate() + 1);
    console.log('⏰ After 6 AM: Showing tomorrow\'s 6 AM forecast');
  } else {
    console.log('⏰ Before 6 AM: Showing today\'s 6 AM forecast');
  }

  target6AM_IST.setUTCHours(6, 0, 0, 0);
  const targetForComparison = new Date(target6AM_IST.getTime() - istOffset);

  let closestForecast = hourlyData[0];
  let smallestDiff = Math.abs(new Date(hourlyData[0].DateTime) - targetForComparison);

  hourlyData.forEach((forecast, index) => {
    const diff = Math.abs(new Date(forecast.DateTime) - targetForComparison);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestForecast = forecast;
      console.log(`📍 Index ${index}: ${new Date(forecast.DateTime).toISOString()} (diff: ${(diff/1000/60).toFixed(0)} min)`);
    }
  });

  console.log(`✅ Selected: ${new Date(closestForecast.DateTime).toISOString()}`);
  return closestForecast;
}

// ==========================================
// SUNRISE-CALIBRATED SCORING FUNCTIONS (v5)
// Sources: NOAA/Corfidi, SunsetWx, PhotoWeather, Alpenglow,
//          Live Science, Wikipedia, 12+ photographer guides
//
// v5 Base Weights: Cloud 25 | MultiLevel 15 | Humidity 20 | Pressure 10 | AOD 8 | Vis 10 | Weather 5 | Wind 3 | Synergy ±4
//
// Key changes from v4:
//   - Multi-level clouds promoted from ±5 adjustment to 15-pt base (#1 SunsetWx factor)
//   - Pressure tendency promoted from ±3 adjustment to 10-pt base (#2 SunsetWx factor)
//   - AOD promoted from ±4 adjustment to 8-pt base (NOAA Mie scattering gold standard)
//   - Visibility halved (20→10) — supporting factor, not core
//   - All new base factors have graceful degradation (neutral defaults when data unavailable)
// ==========================================

/**
 * CLOUD COVER SCORE (max 25 points — v5, reduced from v4's 35)
 * Research: 30-60% is OPTIMAL for dramatic sunrise colors.
 * Reduced weight because multi-level cloud distribution (now a separate 15-pt base factor)
 * captures cloud quality more precisely. This factor now measures total coverage only.
 *
 * "Without clouds, you won't get spectacular reds, pinks, oranges" (24HoursLayover)
 * "Most memorable sunrises tend to have at least a few clouds" (NOAA/Corfidi)
 */
function scoreCloudCover(cloudCover) {
  let score;

  if (cloudCover >= 30 && cloudCover <= 60) {
    // OPTIMAL: Peak drama at 45%. Clouds act as canvas for red/orange reflection.
    score = 21 + Math.round(4 * (1 - Math.abs(cloudCover - 45) / 15));
  } else if (cloudCover > 60 && cloudCover <= 75) {
    // Decent but increasingly blocked light
    const dropoff = (cloudCover - 60) / 15;
    score = Math.round(21 - dropoff * 8);
  } else if (cloudCover > 75 && cloudCover <= 90) {
    // Heavy overcast — most light blocked
    const dropoff = (cloudCover - 75) / 15;
    score = Math.round(13 - dropoff * 9);
  } else if (cloudCover > 90) {
    // Total overcast — almost no light gets through
    score = Math.round(4 - ((cloudCover - 90) / 10) * 4);
  } else if (cloudCover >= 25 && cloudCover < 30) {
    // Approaching optimal — decent potential
    score = 14 + Math.round((cloudCover - 25) / 5 * 7);
  } else if (cloudCover >= 15 && cloudCover < 25) {
    // Some scattered clouds — limited canvas for color
    score = 9 + Math.round((cloudCover - 15) / 10 * 5);
  } else {
    // 0-15%: Clear sky — pleasant sunrise glow, but no dramatic canvas.
    score = 6 + Math.round((cloudCover / 15) * 3);
  }

  return Math.max(0, Math.min(25, score));
}

/**
 * VISIBILITY SCORE (max 10 points — v5, reduced from v4's 20)
 * Research: "The higher the better" — but it's a supporting factor only.
 * SunsetWx doesn't use visibility in their core three (cloud, moisture, pressure).
 * AOD (now a separate 8-pt base factor) measures atmospheric scattering directly.
 * Visibility is now a coarse backup signal.
 *
 * Sunrise-specific: Morning air is naturally cleaner than evening.
 * High visibility at dawn is baseline, not exceptional.
 */
function scoreVisibility(visibilityKm) {
  let score;

  if (visibilityKm >= 18) {
    score = 10; // Post-rain crystal clarity — full marks
  } else if (visibilityKm >= 12) {
    // Good to excellent — baseline good morning
    score = 7 + Math.round((visibilityKm - 12) / 6 * 3);
  } else if (visibilityKm >= 8) {
    // Decent atmospheric clarity
    score = 5 + Math.round((visibilityKm - 8) / 4 * 2);
  } else if (visibilityKm >= 5) {
    // Reduced — some haze
    score = 3 + Math.round((visibilityKm - 5) / 3 * 2);
  } else if (visibilityKm >= 2) {
    // Poor — significant haze or mist
    score = 1 + Math.round((visibilityKm - 2) / 3 * 2);
  } else {
    // Very poor — fog territory
    score = Math.round(visibilityKm / 2 * 1);
  }

  return Math.max(0, Math.min(10, score));
}

/**
 * HUMIDITY SCORE (max 20 points — v5, reduced from v4's 25)
 * Research: "Less humidity = more crisp, dramatic" (all sources).
 * "Higher humidity gives a milky look" (NOAA — Mie scattering from water droplets).
 * SunsetWx: Moisture is one of their top 3 variables.
 *
 * SUNRISE-SPECIFIC CALIBRATION (critical):
 * Relative humidity peaks at dawn (temperature at daily minimum → closer to dew point).
 * Chennai coastal 6AM humidity is routinely 80-90%.
 * Curve shifted upward from v1 so it differentiates within Chennai's actual range.
 */
function scoreHumidity(humidity) {
  let score;

  if (humidity <= 55) {
    // Exceptional for sunrise — rare at dawn, vivid crisp colors
    score = 20;
  } else if (humidity <= 65) {
    // Excellent — sharp, saturated sunrise colors
    score = 20 - Math.round((humidity - 55) / 10 * 5);
  } else if (humidity <= 75) {
    // Good — typical dry-season Chennai morning
    score = 15 - Math.round((humidity - 65) / 10 * 5);
  } else if (humidity <= 85) {
    // Moderate — noticeable color muting begins
    score = 10 - Math.round((humidity - 75) / 10 * 5);
  } else if (humidity <= 93) {
    // High — milky horizon, washed-out pastels
    score = 5 - Math.round((humidity - 85) / 8 * 3);
  } else {
    // Very high — fog/mist territory, colors severely muted
    score = Math.max(0, 2 - Math.round((humidity - 93) / 7 * 2));
  }

  return Math.max(0, Math.min(20, score));
}

/**
 * WEATHER CONDITIONS SCORE (max 5 points — v5, reduced from v4's 10)
 * Binary factor: essentially "is active weather ruining the sunrise?"
 * Precipitation probability + active weather penalty.
 * Reduced because this is a go/no-go gate, not a quality gradient.
 */
function scoreWeatherConditions(precipProbability, hasPrecipitation, weatherDescription) {
  let score = 5;

  // Precipitation probability
  if (precipProbability > 70) score -= 4;
  else if (precipProbability > 50) score -= 3;
  else if (precipProbability > 30) score -= 2;
  else if (precipProbability > 15) score -= 1;

  // Active precipitation
  if (hasPrecipitation) score -= 2;

  // Description-based adjustments
  const desc = (weatherDescription || '').toLowerCase();
  if (desc.includes('thunder') || desc.includes('storm')) score -= 2;
  if (desc.includes('fog') || desc.includes('mist')) score -= 2;
  if (desc.includes('haze')) score -= 1;
  if (desc.includes('sunny') || desc.includes('clear')) score += 1;

  return Math.max(0, Math.min(5, score));
}

/**
 * WIND SCORE (max 3 points — v5, reduced from v4's 5)
 * Research: Calm wind maintains atmospheric layers.
 * Minor factor — wind rarely makes or breaks a sunrise.
 * <10 km/h = ideal; >30 km/h = disperses clouds too fast
 */
function scoreWind(windSpeedKmh) {
  if (windSpeedKmh <= 10) return 3;
  if (windSpeedKmh <= 20) return 2;
  if (windSpeedKmh <= 30) return 1;
  return 0;
}

/**
 * SYNERGY ADJUSTMENT (±4 points — v5, reduced from v4's ±5)
 * Captures interactions between factors that independent scoring misses.
 *
 * Research basis:
 * - High humidity + low cloud = worst combo (no canvas AND washed-out light)
 * - Low humidity + optimal cloud = best combo (vivid colors on dramatic canvas)
 * - Very high humidity negates even optimal cloud cover (colors wash out regardless)
 */
function getSynergyAdjustment(cloudCover, humidity, visibilityKm) {
  let adjustment = 0;

  // ── HARD OVERRIDE: Fog/heavy mist — nothing else matters if you can't see ──
  if (visibilityKm < 3) {
    return -4; // Fog: complete override, no bonuses
  } else if (visibilityKm < 5) {
    return -3; // Heavy mist: severely limits any color display, no bonuses
  }

  // ── PENALTIES ──

  // High humidity + sparse clouds — washed-out and boring
  if (humidity > 85 && cloudCover < 25) {
    adjustment -= 2;
  } else if (humidity > 80 && cloudCover < 20) {
    adjustment -= 2;
  }

  // Very clear sky — even with perfect vis/humidity, limited drama
  if (cloudCover < 15 && humidity < 70) {
    adjustment -= 2; // Vivid but boring — needs clouds for drama
  } else if (cloudCover < 15) {
    adjustment -= 2; // Clear + humid = bland
  }

  // Very high humidity washes out colors even with good cloud canvas
  if (humidity > 85 && cloudCover >= 30) {
    adjustment -= 2; // Clouds are there but colors are muted to pastels
  }

  // ── BONUSES ──

  // Low humidity + optimal clouds — the dream combo
  if (humidity < 70 && cloudCover >= 30 && cloudCover <= 60) {
    adjustment += 4;
  } else if (humidity < 75 && cloudCover >= 25 && cloudCover <= 65) {
    adjustment += 2;
  }

  // Very high humidity negates visibility advantage
  if (humidity > 90 && visibilityKm > 10) {
    adjustment -= 2;
  }

  return Math.max(-4, Math.min(4, adjustment));
}

/**
 * POST-RAIN BONUS (max +5 points)
 * After rain: clearest air (15-20km visibility), broken clouds remain at 30-60%
 *
 * DETECTION: We only have a single hour's data (6 AM), so we can't check
 * "was it raining earlier?" directly. Instead we look for the DATA SIGNATURE
 * of post-rain conditions: unusually high visibility + moderate cloud + elevated humidity.
 * This combination (vis≥15 + cloud 25-65 + humidity 60-82) almost never occurs
 * UNLESS rain recently washed the air clean and clouds are breaking up.
 *
 * Previous approach matched IconPhrase text like "Partly cloudy" — but that's
 * AccuWeather's most common description and triggered on ~70% of forecasts.
 * Now detection is purely data-driven with no text matching.
 */
function getPostRainBonus(forecast) {
  const precipProb = forecast.precipProbability || 0;
  const humidity = forecast.humidity || 0;
  const visibility = forecast.visibility || 0;
  const cloudCover = forecast.cloudCover || 0;

  // Post-rain data signature:
  // - Low current precip probability (rain has stopped)
  // - High visibility (rain washed aerosols from air → crystal clarity)
  // - Moderate cloud (30-65%: clouds breaking up but still providing canvas)
  // - Elevated humidity (60-82%: moisture from recent rain, but not soupy)
  const isPostRain =
    precipProb <= 20 &&
    visibility >= 15 &&
    cloudCover >= 25 && cloudCover <= 65 &&
    humidity >= 60 && humidity <= 82;

  if (isPostRain) {
    console.log('🌧️ Post-rain data signature detected: +5 bonus');
    return 5;
  }

  return 0;
}

/**
 * MASTER SCORING FUNCTION (v5 — research-aligned weight architecture)
 *
 * BASE (96 pts + synergy ±4 = 100 max):
 *   Cloud 25 | MultiLevel 15 | Humidity 20 | Pressure 10 | AOD 8 | Vis 10 | Weather 5 | Wind 3 | Synergy ±4
 *
 * ADJUSTMENTS (minor additive on top):
 *   PostRain +5 | Solar ±2
 *
 * @param {Object} forecastRaw — AccuWeather hourly forecast object
 * @param {Object} extras — { dailyData, airQuality, openMeteoForecast } from parallel fetches
 */
function calculateSunriseScore(forecastRaw, extras = {}) {
  const cloudCover = forecastRaw.CloudCover || 0;
  const humidity = forecastRaw.RelativeHumidity || 50;
  const precipProb = forecastRaw.PrecipitationProbability || 0;
  const hasPrecip = forecastRaw.HasPrecipitation || false;
  const windSpeed = forecastRaw.Wind?.Speed?.Value || 0;
  const weatherDesc = forecastRaw.IconPhrase || '';

  // AccuWeather returns visibility in miles when metric=false, km when metric=true
  const visibilityRaw = forecastRaw.Visibility?.Value || 10;
  const visibilityUnit = forecastRaw.Visibility?.Unit || 'km';
  const visibilityKm = visibilityUnit === 'mi' ? visibilityRaw * 1.60934 : visibilityRaw;

  const { dailyData, airQuality, openMeteoForecast } = extras;

  // ── BASE FACTOR 1: Cloud Cover (max 25) ──
  const cloudScore = scoreCloudCover(cloudCover);

  // ── BASE FACTOR 2: Multi-Level Cloud Distribution (max 15) ──
  let highCloud = null, midCloud = null, lowCloud = null;
  let ceilingMeters = null;

  if (openMeteoForecast?.highCloud != null) {
    highCloud = openMeteoForecast.highCloud;
    midCloud = openMeteoForecast.midCloud;
    lowCloud = openMeteoForecast.lowCloud;
  }

  // Get ceiling for fallback scoring
  const ceilingRaw = forecastRaw.Ceiling?.Value;
  const ceilingUnit = forecastRaw.Ceiling?.Unit || 'm';
  ceilingMeters = ceilingRaw != null
    ? (ceilingUnit === 'ft' ? ceilingRaw * 0.3048 : ceilingRaw)
    : null;

  const multiLevelScore = scoreMultiLevelCloud(highCloud, midCloud, lowCloud, ceilingMeters, cloudCover);

  // ── BASE FACTOR 3: Humidity (max 20) ──
  const humidScore = scoreHumidity(humidity);

  // ── BASE FACTOR 4: Pressure Trend (max 10) ──
  let pressureTrend = null;
  const pressureMsl = openMeteoForecast?.pressureMsl || null;
  if (pressureMsl?.length >= 2) {
    pressureTrend = Math.round((pressureMsl[pressureMsl.length - 1] - pressureMsl[0]) * 10) / 10;
  }
  const pressureScore = scorePressureTrend(pressureMsl);

  // ── BASE FACTOR 5: Aerosol Optical Depth (max 8) ──
  const aodValue = airQuality?.aod ?? null;
  const aodScore = scoreAOD(aodValue);

  // ── BASE FACTOR 6: Visibility (max 10) ──
  const visScore = scoreVisibility(visibilityKm);

  // ── BASE FACTOR 7: Weather Conditions (max 5) ──
  const weatherScore = scoreWeatherConditions(precipProb, hasPrecip, weatherDesc);

  // ── BASE FACTOR 8: Wind (max 3) ──
  const windScore = scoreWind(windSpeed);

  // ── BASE FACTOR 9: Synergy (±4) ──
  const synergy = getSynergyAdjustment(cloudCover, humidity, visibilityKm);

  // ── ASSEMBLE BASE SCORE (max 100) ──
  const baseScore = cloudScore + multiLevelScore + humidScore + pressureScore + aodScore + visScore + weatherScore + windScore + synergy;

  // ── MINOR ADJUSTMENTS (additive on top of base) ──
  const postRainBonus = getImprovedPostRainBonus(forecastRaw, dailyData);
  const forecastDate = forecastRaw.DateTime ? new Date(forecastRaw.DateTime) : new Date();
  const solarBonus = getSolarAngleBonus(forecastDate);

  const totalAdjustment = postRainBonus + solarBonus;
  const finalScore = Math.max(0, Math.min(100, baseScore + totalAdjustment));

  // ── DETERMINE POST-RAIN STATUS ──
  const isPostRain = postRainBonus > 0;

  console.log(`\n📊 SCORING BREAKDOWN (v5 — research-aligned base weights):`);
  console.log(`  ☁️  Cloud Cover (${cloudCover}%): ${cloudScore}/25`);
  console.log(`  🌥️  Multi-Level Cloud (H:${highCloud ?? '?'}% M:${midCloud ?? '?'}% L:${lowCloud ?? '?'}%): ${multiLevelScore}/15`);
  console.log(`  💧 Humidity (${humidity}%): ${humidScore}/20`);
  console.log(`  📊 Pressure Trend (Δ${pressureTrend != null ? (pressureTrend >= 0 ? '+' : '') + pressureTrend : '?'}hPa): ${pressureScore}/10`);
  console.log(`  🌫️  AOD (${aodValue?.toFixed(3) ?? 'N/A'}): ${aodScore}/8`);
  console.log(`  👁️  Visibility (${visibilityKm.toFixed(1)}km): ${visScore}/10`);
  console.log(`  🌤️  Weather (${precipProb}% precip): ${weatherScore}/5`);
  console.log(`  💨 Wind (${windSpeed}km/h): ${windScore}/3`);
  console.log(`  🔗 Synergy: ${synergy >= 0 ? '+' : ''}${synergy}/±4`);
  if (postRainBonus > 0) console.log(`  🌧️  Post-rain bonus: +${postRainBonus}`);
  if (solarBonus !== 0) console.log(`  🌐 Solar angle: ${solarBonus >= 0 ? '+' : ''}${solarBonus}/±2`);
  console.log(`  🎯 TOTAL: ${finalScore}/100`);

  return {
    score: finalScore,
    breakdown: {
      cloudCover: { value: cloudCover, score: cloudScore, maxScore: 25 },
      multiLevelCloud: {
        high: highCloud,
        mid: midCloud,
        low: lowCloud,
        score: multiLevelScore,
        maxScore: 15
      },
      humidity: { value: humidity, score: humidScore, maxScore: 20 },
      pressureTrend: {
        value: pressureTrend,
        pressureMsl: pressureMsl,
        score: pressureScore,
        maxScore: 10
      },
      aod: {
        value: aodValue,
        score: aodScore,
        maxScore: 8
      },
      visibility: { value: Math.round(visibilityKm * 10) / 10, score: visScore, maxScore: 10 },
      weather: { value: precipProb, score: weatherScore, maxScore: 5 },
      wind: { value: windSpeed, score: windScore, maxScore: 3 },
      synergy,
      postRainBonus,
      isPostRain,
      solarBonus,
      // v5 structured fields (replaces flat v4 fields)
      highCloud,
      midCloud,
      lowCloud
    }
  };
}

/**
 * Verdict based on score thresholds
 */
function getVerdict(score) {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'VERY GOOD';
  if (score >= 55) return 'GOOD';
  if (score >= 40) return 'FAIR';
  if (score >= 25) return 'POOR';
  return 'UNFAVORABLE';
}

/**
 * Actionable recommendation — clear, honest, tier-based
 * Used by frontend badge + email subject
 */
function getRecommendation(score) {
  if (score >= 70) return 'GO';
  if (score >= 50) return 'MAYBE';
  if (score >= 30) return 'SKIP';
  return 'NO';
}

/**
 * Get atmospheric quality labels for UI display (v5 — expanded with new factors)
 */
function getAtmosphericLabels(forecast, breakdown) {
  const cloudCover = forecast.cloudCover;
  const humidity = forecast.humidity;
  const visibility = forecast.visibility;
  const windSpeed = forecast.windSpeed;

  // Extract new v5 fields from breakdown (nullable)
  const highCloud = breakdown?.multiLevelCloud?.high ?? breakdown?.highCloud ?? null;
  const midCloud = breakdown?.multiLevelCloud?.mid ?? breakdown?.midCloud ?? null;
  const lowCloud = breakdown?.multiLevelCloud?.low ?? breakdown?.lowCloud ?? null;
  const aodValue = breakdown?.aod?.value ?? breakdown?.aodValue ?? null;
  const pressureTrend = breakdown?.pressureTrend?.value ?? breakdown?.pressureTrend ?? null;

  const labels = {
    // ── EXISTING LABELS (updated) ──
    cloudLabel: cloudCover >= 30 && cloudCover <= 60
      ? 'Optimal'
      : cloudCover < 30 ? 'Too Clear' : cloudCover <= 75 ? 'Partly Overcast' : 'Overcast',
    humidityLabel: humidity <= 55 ? 'Excellent' : humidity <= 65 ? 'Very Good' : humidity <= 75 ? 'Good' : humidity <= 85 ? 'Moderate' : 'High',
    visibilityLabel: visibility >= 18 ? 'Exceptional' : visibility >= 12 ? 'Excellent' : visibility >= 8 ? 'Good' : visibility >= 5 ? 'Fair' : 'Poor',
    windLabel: windSpeed <= 10 ? 'Calm' : windSpeed <= 20 ? 'Light' : windSpeed <= 30 ? 'Moderate' : 'Strong',

    // ── NEW v5 LABELS ──
    cloudLayerLabel: highCloud != null
      ? (highCloud >= 30 && lowCloud < 40 ? 'High Canvas'
         : highCloud >= 30 && lowCloud >= 40 ? 'Mixed Layers'
         : lowCloud >= 75 ? 'Low Overcast'
         : lowCloud >= 50 ? 'Heavy Low'
         : midCloud >= 50 ? 'Mid Canvas'
         : 'Minimal')
      : 'N/A',

    aodLabel: aodValue != null
      ? (aodValue < 0.1 ? 'Crystal Clear'
         : aodValue < 0.2 ? 'Very Clean'
         : aodValue < 0.4 ? 'Clean'
         : aodValue < 0.7 ? 'Hazy'
         : aodValue < 1.0 ? 'Very Hazy'
         : 'Polluted')
      : 'N/A',

    pressureLabel: pressureTrend != null
      ? (pressureTrend < -5 ? 'Storm Risk'
         : pressureTrend < -2 ? 'Clearing Front'
         : pressureTrend < -0.5 ? 'Slight Fall'
         : pressureTrend <= 0.5 ? 'Stable'
         : pressureTrend <= 2 ? 'Rising'
         : 'Strong Rise')
      : 'N/A',

    // ── CONTEXT STRINGS ──
    cloudContext: cloudCover >= 30 && cloudCover <= 60
      ? 'Acts as canvas for orange and red sky reflections'
      : cloudCover < 30
      ? 'Limited cloud canvas — colors focused near sun only'
      : cloudCover <= 75
      ? 'Some gaps allow light through, moderate color potential'
      : 'Dense coverage blocks most light and color',
    humidityContext: humidity <= 65
      ? 'Low morning humidity — crisp, vibrant, saturated colors'
      : humidity <= 80
      ? 'Moderate humidity — some color muting possible'
      : 'High humidity scatters light, producing softer pastel tones',
    visibilityContext: visibility >= 12
      ? 'Excellent clarity enhances color intensity and contrast'
      : visibility >= 8
      ? 'Good atmospheric scattering boosts warm tones'
      : 'Reduced visibility softens colors and contrast',

    // ── NEW v5 CONTEXT STRINGS ──
    cloudLayerContext: highCloud != null
      ? (highCloud >= 30 && lowCloud < 40
         ? 'High cirrus clouds catch pre-sunrise light — ideal color canvas'
         : highCloud >= 30 && lowCloud >= 40
         ? 'High clouds above, but low clouds partially block the horizon'
         : lowCloud >= 75
         ? 'Thick low clouds block the horizon — minimal sunrise visibility'
         : midCloud >= 50
         ? 'Mid-level clouds provide a moderate canvas for color'
         : 'Minimal cloud structure — limited canvas for dramatic color')
      : 'Cloud layer data unavailable',

    aodContext: aodValue != null
      ? (aodValue < 0.2
         ? 'Very clean air — vivid, saturated sunrise colors expected'
         : aodValue < 0.4
         ? 'Mild aerosols — colors slightly softened but still vibrant'
         : aodValue < 0.7
         ? 'Noticeable haze — colors will be muted and diffused'
         : 'Heavy aerosol load — significant color muting')
      : 'Air clarity data unavailable',

    pressureContext: pressureTrend != null
      ? (pressureTrend < -5
         ? 'Rapidly falling pressure — storm approaching, excessive cloud/rain risk'
         : pressureTrend < -2
         ? 'Falling pressure signals clearing front — dramatic sky potential'
         : pressureTrend < -0.5
         ? 'Slight pressure drop — mild atmospheric instability'
         : pressureTrend <= 0.5
         ? 'Stable pressure — predictable, calm conditions'
         : 'Rising pressure — high pressure building, clear but less dramatic')
      : 'Pressure trend data unavailable'
  };

  return labels;
}

/**
 * Get tomorrow's 6 AM IST forecast for a beach
 */
async function getTomorrow6AMForecast(beachKey) {
  const beach = BEACHES[beachKey];
  if (!beach) {
    throw new Error(`Beach '${beachKey}' not found`);
  }

  const timeCheck = getTimeUntilAvailable();
  if (!timeCheck.available) {
    return {
      available: false,
      timeUntilAvailable: { hours: timeCheck.hoursLeft, minutes: timeCheck.minutesLeft },
      message: 'Predictions available after 6 PM IST',
      beach: beach.name,
      beachKey: beach.key
    };
  }

  console.log(`\n📡 Fetching AccuWeather data for ${beach.name}...`);

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const currentIST = new Date(now.getTime() + istOffset);
  console.log(`🕐 Current IST: ${currentIST.toISOString()}`);

  // Fetch hourly + daily + Open-Meteo (AOD + forecast) in parallel — all non-blocking
  const [hourlyData, dailyData, airQuality, openMeteoForecast] = await Promise.all([
    fetchAccuWeatherHourly(beach.locationKey),
    fetchAccuWeatherDaily(beach.locationKey),
    fetchOpenMeteoAirQuality(beach.coordinates.lat, beach.coordinates.lon).catch(() => null),
    fetchOpenMeteoForecast(beach.coordinates.lat, beach.coordinates.lon).catch(() => null)
  ]);

  const forecast6AM = findNext6AM(hourlyData);

  const forecastTime = new Date(forecast6AM.DateTime);
  const istTime = new Date(forecastTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  console.log(`✅ Forecast for ${istTime.toLocaleString('en-IN')}`);

  // Visibility unit handling
  const visibilityRaw = forecast6AM.Visibility?.Value || 10;
  const visibilityUnit = forecast6AM.Visibility?.Unit || 'km';
  const visibilityKm = visibilityUnit === 'mi' ? visibilityRaw * 1.60934 : visibilityRaw;

  const weatherData = {
    temperature: Math.round(forecast6AM.Temperature.Value),
    feelsLike: Math.round(forecast6AM.RealFeelTemperature.Value),
    cloudCover: forecast6AM.CloudCover || 0,
    humidity: forecast6AM.RelativeHumidity || 0,
    windSpeed: Math.round(forecast6AM.Wind.Speed.Value),
    windDirection: forecast6AM.Wind.Direction.Localized,
    visibility: Math.round(visibilityKm * 10) / 10,
    uvIndex: forecast6AM.UVIndex || 0,
    precipProbability: forecast6AM.PrecipitationProbability || 0,
    weatherDescription: forecast6AM.IconPhrase,
    hasPrecipitation: forecast6AM.HasPrecipitation || false
  };

  const { score, breakdown } = calculateSunriseScore(forecast6AM, { dailyData, airQuality, openMeteoForecast });
  const verdict = getVerdict(score);
  const recommendation = getRecommendation(score);
  const atmosphericLabels = getAtmosphericLabels(weatherData, breakdown);

  // Calculate golden hour from actual sunrise time
  const goldenHour = dailyData?.sunRise ? calculateGoldenHour(dailyData.sunRise) : null;

  return {
    available: true,
    beach: beach.name,
    beachKey: beach.key,
    beachContext: beach.context || '',
    coordinates: beach.coordinates,
    forecast: {
      ...weatherData,
      forecastTime: istTime.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'short'
      })
    },
    sunTimes: dailyData ? {
      sunRise: dailyData.sunRise,
      sunSet: dailyData.sunSet,
      hoursOfSun: dailyData.hoursOfSun,
      moonPhase: dailyData.moonPhase
    } : null,
    goldenHour,
    prediction: {
      score,
      verdict,
      recommendation,
      breakdown,
      atmosphericLabels,
      factors: {
        cloudCover: atmosphericLabels.cloudLabel,
        cloudLayers: atmosphericLabels.cloudLayerLabel,
        humidity: atmosphericLabels.humidityLabel,
        visibility: atmosphericLabels.visibilityLabel,
        wind: atmosphericLabels.windLabel,
        aod: atmosphericLabels.aodLabel,
        pressureTrend: atmosphericLabels.pressureLabel
      }
    },
    source: 'AccuWeather'
  };
}

module.exports = {
  getTomorrow6AMForecast,
  getBeaches,
  isPredictionTimeAvailable,
  getTimeUntilAvailable,
  // Exposed for testing (v5)
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
};