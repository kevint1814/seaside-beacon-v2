// ==========================================
// Weather Service - AccuWeather + Open-Meteo Integration
// Research-backed sunrise quality scoring (v5.2)
//
// v3: Added Open-Meteo AOD, cloud ceiling analysis,
//     seasonal solar angle, improved post-rain detection
// v4: Added multi-level cloud cover (high/mid/low) from Open-Meteo GFS,
//     pressure tendency (midnight→6AM), replaces ceiling with multi-level when available
// v5: Full weight rebalance — promoted multi-level clouds, pressure tendency,
//     and AOD from additive adjustments into base weights.
// v5.1: Chennai ground-truth calibration (Feb 20, 2026 audit).
//     - OM primary data source for cloud/humidity/visibility (AW fallback)
//     - Humidity curve recalibrated for tropical dawn (85-92% baseline)
//     - Multi-level cloud: softened 50-65% low cloud scoring (band ≠ blanket)
//     - Synergy: recalibrated thresholds for tropical coastal dawn
// v5.2: Scientific predictive hierarchy rebalance (Corfidi/NOAA research).
//     Corfidi: "Clean air is the main ingredient common to brightly colored sunrises."
//     CHANGES:
//     - AOD promoted to 16pts (#1 factor per science, R²≈0.65-0.70)
//       + Goldilocks curve: AOD 0.05-0.15 = peak, not <0.1 (Mie forward scattering)
//     - Cloud Layers promoted to 20pts (#2 factor, WHERE > HOW MUCH)
//     - Cloud Cover demoted to 18pts (amount is secondary to altitude)
//     - Humidity reduced to 15pts (partially redundant with AOD)
//     - Visibility reduced to 5pts (largely redundant with AOD, coarse backup only)
//     - Pressure raised to 11pts (clearing fronts = reliable dramatic sunrises)
//     - Wind raised to 5pts + curve fix (8-20 km/h optimal, not ≤10)
//     - Post-rain raised to +8 (aerosol scavenging = strongest exceptional-morning signal)
//     CALIBRATION TARGET: Feb 20, 2026 = 48-53 ("okayish" per ground truth)
//
// v5.2 Base Weights (96 pts + synergy ±4 = 100 max):
//   AOD 16 | CloudLayers 20 | CloudCover 18 | Humidity 15 | Pressure 11 | Vis 5 | Weather 5 | Wind 5 | Synergy ±4
// Adjustments: PostRain +8 | Solar ±2
// Data sources: Cloud/Humidity/Visibility → OM primary (AW fallback) | Layers/Pressure/AOD → OM | Weather/Wind/Precip → AW
// ==========================================

const axios = require('axios');
const metrics = require('./metricsCollector');

const ACCUWEATHER_API_KEY = process.env.ACCUWEATHER_API_KEY;
// Cloudflare Worker proxy URL — bypasses Render's shared-IP rate limits on Open-Meteo
// e.g. https://openmeteo-proxy.YOUR_SUBDOMAIN.workers.dev
const OPENMETEO_PROXY = process.env.OPENMETEO_PROXY_URL || null;
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
 * Cached per locationKey — all Chennai beaches share 206671,
 * so one API call serves every beach for 30 minutes.
 *
 * Resilience layers:
 *   1. Positive cache (30-min TTL) — serves repeated requests
 *   2. Negative cache (2-min TTL) — prevents hammering when API is down
 *   3. Retry with backoff (2 attempts) — handles transient failures
 *   4. Stale cache fallback — returns expired data if API fails
 */
const _hourlyCache = {};
const _hourlyFailCache = {};

async function fetchAccuWeatherHourly(locationKey) {
  // Layer 1: positive cache (30-min TTL)
  const cached = _hourlyCache[locationKey];
  if (cached && (Date.now() - cached.fetchedAt < 30 * 60 * 1000)) {
    console.log('⚡ Using cached hourly forecast (AccuWeather)');
    metrics.trackAPICall('accuWeatherHourly', true);
    return cached.data;
  }

  // Layer 2: negative cache (2-min TTL) — don't retry if we just failed
  const failCached = _hourlyFailCache[locationKey];
  if (failCached && (Date.now() - failCached.failedAt < 2 * 60 * 1000)) {
    console.warn('⏸️  AccuWeather hourly skipped (recent failure, using stale cache or null)');
    metrics.trackAPICall('accuWeatherHourly', true);
    return cached?.data || null;
  }

  // Layer 3: retry with backoff
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = `https://dataservice.accuweather.com/forecasts/v1/hourly/12hour/${locationKey}`;
      const response = await axios.get(url, {
        params: { apikey: ACCUWEATHER_API_KEY, details: true, metric: true },
        timeout: 10000
      });
      console.log(`✅ Fetched ${response.data.length} hours of forecast data`);
      metrics.trackAPICall('accuWeatherHourly', false);

      // Cache it
      _hourlyCache[locationKey] = { data: response.data, fetchedAt: Date.now() };
      delete _hourlyFailCache[locationKey];

      return response.data;
    } catch (error) {
      const status = error.response?.status;
      console.error(`❌ AccuWeather hourly attempt ${attempt + 1}/${MAX_RETRIES}: ${status || error.message}`);
      metrics.trackAPIError('accuWeatherHourly', `${status || error.message}`);

      // Don't retry on 401/403 (auth issues) — immediate fail
      if (status === 401 || status === 403) break;

      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
      }
    }
  }

  // All retries failed — mark negative cache
  _hourlyFailCache[locationKey] = { failedAt: Date.now() };

  // Layer 4: stale cache fallback — better to show slightly old data than nothing
  if (cached?.data) {
    const staleMinutes = Math.round((Date.now() - cached.fetchedAt) / 60000);
    console.warn(`🔄 AccuWeather failed, serving stale hourly cache (${staleMinutes}min old)`);
    return cached.data;
  }

  throw new Error('AccuWeather API failed and no cached data available');
}

/**
 * Fetch 1-day daily forecast from AccuWeather
 * Returns Sun.Rise, Sun.Set and daily summary
 * Cached per locationKey — sunrise times identical across all Chennai beaches
 *
 * Same resilience pattern as hourly: positive cache → negative cache → retry → stale fallback
 */
const _dailyCache = {};
const _dailyFailCache = {};

async function fetchAccuWeatherDaily(locationKey) {
  // Layer 1: positive cache (2-hour TTL — sunrise/sunset don't change within hours)
  const cached = _dailyCache[locationKey];
  if (cached && (Date.now() - cached.fetchedAt < 2 * 60 * 60 * 1000)) {
    console.log('🌅 Using cached daily forecast');
    metrics.trackAPICall('accuWeatherDaily', true);
    return cached.data;
  }

  // Layer 2: negative cache (2-min TTL)
  const failCached = _dailyFailCache[locationKey];
  if (failCached && (Date.now() - failCached.failedAt < 2 * 60 * 1000)) {
    console.warn('⏸️  AccuWeather daily skipped (recent failure)');
    metrics.trackAPICall('accuWeatherDaily', true);
    return cached?.data || null;
  }

  // Layer 3: retry with backoff
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = `https://dataservice.accuweather.com/forecasts/v1/daily/1day/${locationKey}`;
      const response = await axios.get(url, {
        params: { apikey: ACCUWEATHER_API_KEY, details: true, metric: true },
        timeout: 10000
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
        nightHoursOfRain: daily.Night?.HoursOfRain || 0
      };

      // Cache it
      _dailyCache[locationKey] = { data: result, fetchedAt: Date.now() };
      delete _dailyFailCache[locationKey];
      metrics.trackAPICall('accuWeatherDaily', false);

      return result;
    } catch (error) {
      const status = error.response?.status;
      console.warn(`⚠️ AccuWeather daily attempt ${attempt + 1}/${MAX_RETRIES}: ${status || error.message}`);
      metrics.trackAPIError('accuWeatherDaily', `${status || error.message}`);
      if (status === 401 || status === 403) break;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
      }
    }
  }

  // All retries failed
  _dailyFailCache[locationKey] = { failedAt: Date.now() };

  // Layer 4: stale cache fallback
  if (cached?.data) {
    const staleMinutes = Math.round((Date.now() - cached.fetchedAt) / 60000);
    console.warn(`🔄 AccuWeather daily failed, serving stale cache (${staleMinutes}min old)`);
    return cached.data;
  }

  return null;
}

// ==========================================
// OPEN-METEO AIR QUALITY (v3 — free, no API key)
// Aerosol Optical Depth is a physics-based proxy
// for atmospheric light scattering — far more
// accurate than visibility alone.
// ==========================================

const _aodCache = {};
const _aodFailCache = {};
const _aodInFlight = {};
/**
 * Fetch aerosol data from Open-Meteo (free, no API key)
 * Returns { aod, pm25 } at 6 AM IST, or null if unavailable
 * Same 3-layer protection as fetchOpenMeteoForecast.
 */
async function fetchOpenMeteoAirQuality(lat, lon) {
  const roundedLat = Math.round(lat * 10) / 10;
  const roundedLon = Math.round(lon * 10) / 10;
  const cacheKey = `${roundedLat},${roundedLon}`;

  // CAMS air quality model updates every 12 hours (not 6h like GFS).
  // 8h TTL avoids wasting calls on identical data while still catching every cycle.
  // API budget: ~12 calls/day (was ~16 with 6h) out of 10,000 free tier.
  const OM_AQ_TTL = 8 * 60 * 60 * 1000; // 8 hours
  const cached = _aodCache[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt < OM_AQ_TTL)) {
    console.log('🌫️ Using cached AOD data');
    return cached.data;
  }

  const failCached = _aodFailCache[cacheKey];
  if (failCached && (Date.now() - failCached.failedAt < 90 * 1000)) {
    console.log('🌫️ Skipping Open-Meteo AQ (recent 429) — using fallback');
    return null;
  }

  if (_aodInFlight[cacheKey]) {
    console.log('🌫️ Waiting for in-flight Open-Meteo AQ request...');
    return _aodInFlight[cacheKey];
  }

  const fetchPromise = (async () => {
  try {
    const url = OPENMETEO_PROXY
      ? `${OPENMETEO_PROXY}/air-quality`
      : 'https://air-quality-api.open-meteo.com/v1/air-quality';
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await axios.get(url, {
          params: {
            latitude: roundedLat,
            longitude: roundedLon,
            hourly: 'pm2_5,pm10,aerosol_optical_depth',
            timezone: 'Asia/Kolkata',
            forecast_days: 2
          },
          timeout: 6000
        });
        break;
      } catch (err) {
        if (err.response?.status === 429 && attempt < 2) {
          console.warn(`⚠️ Open-Meteo AQ 429 rate limit — retry ${attempt + 1}/2 after ${(attempt + 1) * 5}s`);
          await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
          continue;
        }
        if (err.response?.status === 429) {
          _aodFailCache[cacheKey] = { failedAt: Date.now() };
        }
        throw err;
      }
    }

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
  })();

  _aodInFlight[cacheKey] = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    delete _aodInFlight[cacheKey];
  }
}

// ==========================================
// OPEN-METEO FORECAST (v4 — multi-level clouds + pressure)
// Separate endpoint from air quality API.
// Provides cloud_cover_low/mid/high and pressure_msl
// hourly — the two variables SunsetWx has that we didn't.
// ==========================================

const _forecastCache = {};
const _forecastFailCache = {};  // Negative cache: prevents cascading 429 retries
const _forecastInFlight = {};   // In-flight dedup: same cache key waits for first request
/**
 * Fetch multi-level cloud cover + pressure from Open-Meteo forecast API (free, no key)
 * Returns { highCloud, midCloud, lowCloud, pressureMsl[] } at 6 AM IST, or null
 *
 * Three layers of protection against Open-Meteo 429 rate limiting:
 * 1. Coordinate rounding — all Chennai beaches share one cache key
 * 2. In-flight deduplication — parallel requests wait for the first one
 * 3. Negative cache — after a 429, skip retries for 90 seconds
 */
async function fetchOpenMeteoForecast(lat, lon) {
  // Round to 1 decimal (~11km grid) so all Chennai beaches share one cached result.
  // GFS resolution is 0.25° (~28km) — data is identical within a city.
  const roundedLat = Math.round(lat * 10) / 10;
  const roundedLon = Math.round(lon * 10) / 10;
  const cacheKey = `${roundedLat},${roundedLon}`;

  // Layer 1: positive cache (2-hour TTL)
  // GFS updates every 6h (00Z/06Z/12Z/18Z) but takes ~3.5-5h to process.
  // Critical path: 18Z run → available ~03:30-05:00 IST → must be served by 4-5 AM user check.
  // 2h TTL ensures we pick up every new GFS run within 2h of OM availability,
  // especially the 18Z run that lands right before Chennai sunrise.
  // API budget: ~40 calls/day (was ~16) out of 10,000 free tier — negligible.
  const OM_FORECAST_TTL = 2 * 60 * 60 * 1000; // 2 hours
  const cached = _forecastCache[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt < OM_FORECAST_TTL)) {
    console.log('🌥️ Using cached Open-Meteo forecast data');
    return cached.data;
  }

  // Layer 2: negative cache — skip if recently 429'd (90s TTL)
  const failCached = _forecastFailCache[cacheKey];
  if (failCached && (Date.now() - failCached.failedAt < 90 * 1000)) {
    console.log('🌥️ Skipping Open-Meteo forecast (recent 429) — using fallback');
    return null;
  }

  // Layer 3: in-flight dedup — wait for existing request instead of firing a new one
  if (_forecastInFlight[cacheKey]) {
    console.log('🌥️ Waiting for in-flight Open-Meteo forecast request...');
    return _forecastInFlight[cacheKey];
  }

  const fetchPromise = (async () => {
    try {
      const url = OPENMETEO_PROXY
        ? `${OPENMETEO_PROXY}/forecast`
        : 'https://api.open-meteo.com/v1/forecast';
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await axios.get(url, {
            params: {
              latitude: roundedLat,
              longitude: roundedLon,
              hourly: 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,visibility,relative_humidity_2m',
              timezone: 'Asia/Kolkata',
              forecast_days: 2
            },
            timeout: 8000
          });
          break; // success
        } catch (err) {
          if (err.response?.status === 429 && attempt < 2) {
            console.warn(`⚠️ Open-Meteo 429 rate limit — retry ${attempt + 1}/2 after ${(attempt + 1) * 5}s`);
            await new Promise(r => setTimeout(r, (attempt + 1) * 5000)); // 5s, 10s backoff
            continue;
          }
          if (err.response?.status === 429) {
            // Final 429 — cache the failure so other beaches don't retry
            _forecastFailCache[cacheKey] = { failedAt: Date.now() };
            console.warn('⚠️ Open-Meteo forecast 429 persists — negative-cached for 90s');
          }
          throw err;
        }
      }

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
      cloudCover: hourly.cloud_cover?.[useIdx] ?? null,         // v5.1: OM total cloud %
      visibility: hourly.visibility?.[useIdx] ?? null,           // v5.1: OM visibility (meters)
      humidity: hourly.relative_humidity_2m?.[useIdx] ?? null,   // v5.1: OM humidity %
      pressureMsl,  // array: [midnight, 1AM, 2AM, 3AM, 4AM, 5AM, 6AM]
      time: hourly.time[useIdx]
    };

    console.log(`🌥️ Cloud levels at 6 AM — High: ${result.highCloud}% Mid: ${result.midCloud}% Low: ${result.lowCloud}%`);
    if (result.cloudCover != null) console.log(`☁️ OM total cloud: ${result.cloudCover}% | OM visibility: ${result.visibility != null ? (result.visibility / 1000).toFixed(1) + 'km' : 'N/A'} | OM humidity: ${result.humidity ?? 'N/A'}%`);
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
  })();

  _forecastInFlight[cacheKey] = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    delete _forecastInFlight[cacheKey];
  }
}

/**
 * AOD SCORE (max 16 points — v5.2, promoted from 8pts)
 * Corfidi (NOAA SPC): "Clean air is the main ingredient common to brightly colored sunrises."
 * R² ≈ 0.65-0.70 with observed color quality — highest single-variable predictor.
 *
 * v5.2 GOLDILOCKS CURVE (Mie forward scattering physics):
 * Particles ~0.5μm radius amplify red wavelengths through forward Mie scattering
 * at low solar elevation angles. Too-clean air (AOD <0.05) = insufficient scattering
 * particles, producing pale yellows. Moderate aerosols (0.05-0.15) = peak color.
 * Heavy aerosols (>0.4) = attenuation dominates, washing out all color.
 *
 * AOD < 0.05:  Crystal clear but pale (insufficient Mie scattering)
 * AOD 0.05-0.15: GOLDILOCKS ZONE — peak color (optimal forward scattering)
 * AOD 0.15-0.3: Clean, vivid colors with slight softening
 * AOD 0.3-0.5: Mild haze, colors noticeably muted
 * AOD 0.5-0.8: Heavy haze, colors substantially washed
 * AOD 0.8-1.0: Very heavy haze
 * AOD > 1.0:   Dust/pollution event — no color
 *
 * Graceful degradation: returns 8/16 (neutral) when no AOD data available.
 */
function scoreAOD(aod) {
  if (aod == null || aod < 0) return 8;  // Neutral default — assume moderate

  if (aod < 0.05) return 13;  // Crystal clear — vivid but slightly pale (too clean for peak Mie)
  if (aod < 0.10) return 16;  // Goldilocks low end — near-perfect clarity + some scattering
  if (aod < 0.15) return 16;  // Goldilocks peak — optimal forward Mie scattering
  if (aod < 0.20) return 14;  // Very clean — excellent colors
  if (aod < 0.30) return 12;  // Clean — vivid, slight softening
  if (aod < 0.40) return 9;   // Mild haze — colors present but noticeably muted
  if (aod < 0.50) return 6;   // Moderate haze — colors substantially reduced
  if (aod < 0.70) return 4;   // Heavy haze — colors faint
  if (aod < 1.00) return 2;   // Very heavy haze — minimal color
  return 0;                     // Dust/pollution event — no color visible
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
 * IMPROVED POST-RAIN BONUS (0 or +8 points — v5.2, raised from +5)
 *
 * Research (ScienceDirect, Aerosol & Air Quality Research): Rain removes aerosol
 * particles through impaction scavenging. ≥1mm rainfall creates the cleanest air
 * possible — AOD drops to 0.02-0.05. Post-rain mornings are the single most
 * reliable predictor of exceptional sunrises. Recovery: 12-48 hours.
 *
 * v5.2: Raised from +5 to +8 to match research importance (~12% of score).
 * Post-rain + moderate clouds = the "unicorn scenario" for sunrise photography.
 *
 * PRIMARY signal (temporal): Previous night had rain but 6 AM is dry
 * FALLBACK signal (heuristic): High visibility + moderate cloud + elevated humidity
 */
function getImprovedPostRainBonus(forecastRaw, dailyData) {
  const precipProb = forecastRaw.PrecipitationProbability || 0;

  // PRIMARY: Temporal signal from AccuWeather daily forecast
  if (dailyData && dailyData.nightHoursOfRain > 0 && precipProb <= 20) {
    console.log(`🌧️ Post-rain temporal signal: ${dailyData.nightHoursOfRain}h rain last night, 6AM precip ${precipProb}%`);
    return 8;
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
    return 8;
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
 * MULTI-LEVEL CLOUD SCORE (max 20 points — v5.2, promoted from 15)
 * Corfidi (NOAA): "High clouds intercept unadulterated sunlight" — cloud altitude
 * is the #2 predictor of sunrise color quality (R² ≈ 0.58-0.65).
 * WHERE clouds sit matters MORE than HOW MUCH cloud exists.
 *
 * High clouds (cirrus, >6000m): Catch pre-sunrise light → vivid orange/red canvas
 * Mid clouds (2000-6000m): Moderate canvas, some light passes through
 * Low clouds (<2000m): Block horizon → grey wall, worst for sunrise
 *
 * v5.2: Promoted to 20pts (above cloud cover at 18pts) because cloud altitude
 * is more predictive than total coverage. A sky with 40% high cirrus is spectacular;
 * 40% low stratus is grey. The altitude distinction captures this.
 *
 * Graceful degradation:
 *   - If multi-level data unavailable but ceiling exists → estimate from ceiling
 *   - If no data at all → 10/20 (neutral)
 */
function scoreMultiLevelCloud(highCloud, midCloud, lowCloud, ceilingMeters, cloudCover) {
  // ── NO MULTI-LEVEL DATA: try ceiling fallback ──
  if (highCloud == null) {
    if (ceilingMeters != null && cloudCover >= 25) {
      if (ceilingMeters >= 6000) return 17;   // High cirrus likely
      if (ceilingMeters >= 4000) return 14;   // Mid-high
      if (ceilingMeters > 2000) return 10;    // Mid-altitude — neutral
      if (ceilingMeters > 1000) return 5;     // Low — blocks horizon
      return 2;                                // Very low / fog territory
    }
    return 10;  // Neutral default — no data
  }

  // ── BEST CASE: High clouds present, low clouds minimal ──
  // "Vivid sunrise" signature: cirrus canvas + clear horizon
  if (highCloud >= 30 && lowCloud < 40) {
    if (midCloud < 30) return 20;   // Pure high cloud canvas — ideal
    if (midCloud < 60) return 17;   // High + some mid — still great
    return 14;                       // High + heavy mid — good but less contrast
  }

  // ── HIGH CLOUDS WITH LOW CLOUD INTERFERENCE ──
  if (highCloud >= 30 && lowCloud >= 40) {
    if (lowCloud >= 75) return 6;   // High clouds exist but horizon mostly blocked
    return 11;                       // Mixed — some light gets through gaps
  }

  // ── MINIMAL HIGH CLOUDS ──
  // v5.1: 50-65% low cloud scored as "band with gaps" not blanket.
  // v5.2: Scores stretched across wider 20-pt range for better discrimination.
  if (highCloud < 30) {
    if (lowCloud >= 75) return 1;    // Thick low stratus, no canvas above → worst
    if (lowCloud >= 65) return 3;    // Heavy low cover, limited ceiling view
    if (lowCloud >= 50) return 5;    // Moderate low band — gaps likely, some light through
    if (midCloud >= 50) return 9;    // Mid clouds provide some canvas
    return 6;                         // Mostly clear — no canvas, but no blockage
  }

  return 10;  // Neutral fallthrough
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
 * PRESSURE TREND SCORE (max 11 points — v5.2, raised from 10)
 * SunsetWx's #2 factor. Input: array of hourly pressure_msl values from midnight to 6 AM IST.
 *
 * Research (NOAA, SunsetWx): Clearing fronts are one of the most reliable
 * predictors of dramatic sunrises. Falling pressure 2-5 hPa/6h → cloud breakup
 * with vivid color through gaps. Raised from 10 to 11 to better reflect this.
 *
 * Graceful degradation: returns 5/11 (neutral, assume stable) when no data.
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
    return 11;  // Best scenario — approaching front with clearing patterns
  }

  // Slight fall (1-2 hPa) → weak system, some instability → interesting skies
  if (change < -1) {
    console.log(`📊 Pressure slightly falling (${change.toFixed(1)} hPa): mild instability`);
    return 9;
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
 * CLOUD COVER SCORE (max 18 points — v5.2, reduced from 25)
 * Research: 30-70% is OPTIMAL for dramatic sunrise colors (Corfidi/NOAA).
 * Demoted because WHERE clouds sit (altitude, scored in multi-level factor)
 * is more predictive than HOW MUCH cloud exists. 60% high cirrus is spectacular;
 * 60% low stratus is grey. This factor only measures total amount.
 *
 * "Without clouds, you won't get spectacular reds, pinks, oranges" (Corfidi)
 * "Most memorable sunrises tend to have at least a few clouds" (NOAA)
 */
function scoreCloudCover(cloudCover) {
  let score;

  if (cloudCover >= 30 && cloudCover <= 60) {
    // OPTIMAL: Peak drama at 45%. Clouds act as canvas for red/orange reflection.
    score = 15 + Math.round(3 * (1 - Math.abs(cloudCover - 45) / 15));
  } else if (cloudCover > 60 && cloudCover <= 75) {
    // Decent but increasingly blocked light
    const dropoff = (cloudCover - 60) / 15;
    score = Math.round(15 - dropoff * 5);
  } else if (cloudCover > 75 && cloudCover <= 90) {
    // Heavy overcast — most light blocked
    const dropoff = (cloudCover - 75) / 15;
    score = Math.round(10 - dropoff * 7);
  } else if (cloudCover > 90) {
    // Total overcast — almost no light gets through
    score = Math.round(3 - ((cloudCover - 90) / 10) * 3);
  } else if (cloudCover >= 25 && cloudCover < 30) {
    // Approaching optimal — decent potential
    score = 10 + Math.round((cloudCover - 25) / 5 * 5);
  } else if (cloudCover >= 15 && cloudCover < 25) {
    // Some scattered clouds — limited canvas for color
    score = 7 + Math.round((cloudCover - 15) / 10 * 3);
  } else {
    // 0-15%: Clear sky — pleasant sunrise glow, but no dramatic canvas.
    score = 5 + Math.round((cloudCover / 15) * 2);
  }

  return Math.max(0, Math.min(18, score));
}

/**
 * VISIBILITY SCORE (max 5 points — v5.2, reduced from 10)
 * Largely redundant with AOD (now 16pts). Visibility depends on RH + PM2.5 + AOD,
 * making it a COMPOSITE signal that overlaps heavily with factors already scored.
 * Kept as a coarse backup signal only — catches fog/mist scenarios AOD might miss.
 *
 * Research: JGR (2018) shows PM2.5 explains 50% of visibility variance,
 * and RH explains much of the rest. Once AOD + humidity are scored separately,
 * visibility adds very little independent information.
 */
function scoreVisibility(visibilityKm) {
  if (visibilityKm >= 15) return 5;   // Clear — full marks
  if (visibilityKm >= 10) return 4;   // Good
  if (visibilityKm >= 6)  return 3;   // Decent
  if (visibilityKm >= 3)  return 2;   // Reduced haze
  if (visibilityKm >= 1)  return 1;   // Poor — mist
  return 0;                             // Fog
}

/**
 * HUMIDITY SCORE (max 15 points — v5.2, reduced from 20)
 * Reduced because humidity effect partially overlaps with AOD (now 16pts) —
 * high humidity causes hygroscopic aerosol growth, which AOD already measures.
 * Still important as an independent factor for Mie scattering from water droplets.
 *
 * Research: ACP (2013) shows scattering enhancement f(RH) = 1.28-3.41 at 85% RH.
 * The relationship is exponential, not linear.
 *
 * v5.1 Chennai calibration preserved: 80-92% is baseline, not penalty territory.
 * Photos from 88% mornings show visible colour (peach, salmon, amber).
 */
function scoreHumidity(humidity) {
  let score;

  if (humidity <= 55) {
    score = 15;    // Exceptional — rare at dawn, vivid crisp colors
  } else if (humidity <= 65) {
    score = 15 - Math.round((humidity - 55) / 10 * 3);  // 15→12
  } else if (humidity <= 75) {
    score = 12 - Math.round((humidity - 65) / 10 * 3);  // 12→9
  } else if (humidity <= 82) {
    score = 9 - Math.round((humidity - 75) / 7 * 2);    // 9→7
  } else if (humidity <= 88) {
    // Chennai baseline — colours visible, horizon hazy, pastels common
    score = 7 - Math.round((humidity - 82) / 6 * 2);    // 7→5
  } else if (humidity <= 93) {
    score = 5 - Math.round((humidity - 88) / 5 * 2);    // 5→3
  } else if (humidity <= 97) {
    score = 3 - Math.round((humidity - 93) / 4 * 2);    // 3→1
  } else {
    score = Math.max(0, 1 - Math.round((humidity - 97) / 3));
  }

  return Math.max(0, Math.min(15, score));
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
 * WIND SCORE (max 5 points — v5.2, raised from 3)
 * Research (Penn State METEO 300): Light breeze (8-20 km/h) is OPTIMAL, not calm.
 * - Dead calm (<5 km/h) traps boundary-layer haze at low altitude
 * - Light breeze structures clouds into ripples/billows that catch light beautifully
 * - Strong wind (>25 km/h) disperses aerosol layers and clouds vertically
 *
 * v5.2: Curve inverted from v5.1 — peak at 8-20 km/h, not ≤10.
 */
function scoreWind(windSpeedKmh) {
  if (windSpeedKmh >= 8 && windSpeedKmh <= 20) return 5;   // Optimal — structures clouds, clears low haze
  if (windSpeedKmh >= 5 && windSpeedKmh < 8) return 4;     // Light — good
  if (windSpeedKmh > 20 && windSpeedKmh <= 25) return 4;   // Moderate — still decent
  if (windSpeedKmh < 5) return 3;                            // Dead calm — traps boundary haze
  if (windSpeedKmh <= 35) return 2;                          // Gusty — dispersing clouds
  return 1;                                                   // Strong — too disruptive
}

/**
 * SYNERGY ADJUSTMENT (±4 points — v5.1, recalibrated for tropical coastal dawn)
 * Captures interactions between factors that independent scoring misses.
 *
 * v5.1 RECALIBRATION (Feb 20, 2026 ground-truth audit):
 * Old thresholds were calibrated for temperate climates:
 *   - Bonus required humidity < 75% → NEVER happens at Chennai 6 AM (always 80-92%)
 *   - Penalty at humidity > 85% → ALWAYS fires at Chennai 6 AM
 *   - Net effect: Chennai started every day at -2 synergy with +4 permanently locked out.
 *
 * New thresholds recognize that tropical coastal dawn humidity 80-90% is baseline,
 * not a penalty condition. Colours survive in this range (confirmed by photos).
 * Penalties now only fire in extreme conditions (>93% = near-fog).
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

  // Very high humidity + sparse clouds — washed-out and boring
  // v5.1: raised threshold from >85 to >93 (near-fog territory)
  if (humidity > 93 && cloudCover < 25) {
    adjustment -= 2;
  }

  // Very clear sky — limited drama without clouds as canvas
  if (cloudCover < 15 && humidity < 70) {
    adjustment -= 2; // Vivid but boring — needs clouds for drama
  } else if (cloudCover < 15 && humidity >= 70) {
    adjustment -= 1; // Clear + humid = bland, but slightly less penalty
  }

  // Near-fog humidity washes out colors even with good cloud canvas
  // v5.1: raised from >85 to >93. At 85-92% (Chennai baseline), colours survive.
  if (humidity > 93 && cloudCover >= 30) {
    adjustment -= 2; // Near-fog: clouds are there but colours truly washed out
  }

  // ── BONUSES ──

  // v5.1: Recalibrated for tropical coastal conditions.
  // Low humidity (for Chennai) + optimal clouds — the dream combo
  if (humidity < 80 && cloudCover >= 30 && cloudCover <= 60) {
    adjustment += 4; // Unusually dry dawn + good cloud canvas = vivid
  } else if (humidity < 85 && cloudCover >= 25 && cloudCover <= 65) {
    adjustment += 3; // Dry-ish dawn for Chennai + good canvas = great
  } else if (humidity < 90 && cloudCover >= 25 && cloudCover <= 65) {
    adjustment += 1; // Normal Chennai dawn + good canvas = slight boost
  }

  // Good visibility + optimal cloud + reasonable humidity — strong combo
  // v5.1: humidity threshold raised from <75 to <90 (reachable in Chennai)
  if (visibilityKm >= 15 && cloudCover >= 25 && cloudCover <= 65 && humidity < 90) {
    adjustment += 2;
  } else if (visibilityKm >= 10 && cloudCover >= 20 && cloudCover <= 70 && humidity < 92) {
    adjustment += 1;
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
  const awCloudCover = forecastRaw.CloudCover || 0;
  const awHumidity = forecastRaw.RelativeHumidity || 50;
  const precipProb = forecastRaw.PrecipitationProbability || 0;
  const hasPrecip = forecastRaw.HasPrecipitation || false;
  const windSpeed = forecastRaw.Wind?.Speed?.Value || 0;
  const weatherDesc = forecastRaw.IconPhrase || '';

  // AccuWeather returns visibility in miles when metric=false, km when metric=true
  const awVisRaw = forecastRaw.Visibility?.Value || 10;
  const awVisUnit = forecastRaw.Visibility?.Unit || 'km';
  const awVisKm = awVisUnit === 'mi' ? awVisRaw * 1.60934 : awVisRaw;

  const { dailyData, airQuality, openMeteoForecast } = extras;

  // ── v5.1: DATA SOURCE SELECTION (OM primary, AW fallback) ──
  // Ground-truth audit (Feb 20, 2026): AW over-reports cloud (+35%), under-reports
  // visibility (-75%), and over-reports humidity (+7%) for Chennai compared to
  // Open-Meteo GFS, which matched photographic evidence almost exactly.
  const omCloud = openMeteoForecast?.cloudCover;
  const omVisM = openMeteoForecast?.visibility;          // meters from OM
  const omVisKm = omVisM != null ? omVisM / 1000 : null; // convert to km
  const omHumidity = openMeteoForecast?.humidity;

  // Cloud: use OM when available (Feb 20 audit: AW 94% vs OM 60%, reality ~60%)
  const cloudCover = omCloud != null ? omCloud : awCloudCover;
  const cloudSource = omCloud != null ? 'OM' : 'AW';

  // Humidity: use OM when available (Feb 20 audit: AW 95% vs OM 88%, reality ~88%)
  const humidity = omHumidity != null ? omHumidity : awHumidity;
  const humiditySource = omHumidity != null ? 'OM' : 'AW';

  // Visibility: use OM when available (Feb 20 audit: AW 6km vs OM 24km, effective ~15km)
  const visibilityKm = omVisKm != null ? omVisKm : awVisKm;
  const visSource = omVisKm != null ? 'OM' : 'AW';

  if (omCloud != null) {
    console.log(`📡 v5.1 data sources — Cloud: ${cloudSource}(${cloudCover}%) [AW:${awCloudCover}%] | Humidity: ${humiditySource}(${humidity}%) [AW:${awHumidity}%] | Vis: ${visSource}(${visibilityKm.toFixed(1)}km) [AW:${awVisKm.toFixed(1)}km]`);
  }

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

  // ── BASE FACTOR 3: Humidity (max 15) ──
  const humidScore = scoreHumidity(humidity);

  // ── BASE FACTOR 4: Pressure Trend (max 11) ──
  let pressureTrend = null;
  const pressureMsl = openMeteoForecast?.pressureMsl || null;
  if (pressureMsl?.length >= 2) {
    pressureTrend = Math.round((pressureMsl[pressureMsl.length - 1] - pressureMsl[0]) * 10) / 10;
  }
  const pressureScore = scorePressureTrend(pressureMsl);

  // ── BASE FACTOR 5: Aerosol Optical Depth (max 16 — v5.2 #1 factor) ──
  const aodValue = airQuality?.aod ?? null;
  const aodScore = scoreAOD(aodValue);

  // ── BASE FACTOR 6: Visibility (max 5 — coarse backup to AOD) ──
  const visScore = scoreVisibility(visibilityKm);

  // ── BASE FACTOR 7: Weather Conditions (max 5) ──
  const weatherScore = scoreWeatherConditions(precipProb, hasPrecip, weatherDesc);

  // ── BASE FACTOR 8: Wind (max 5 — v5.2 light breeze optimal) ──
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

  console.log(`\n📊 SCORING BREAKDOWN (v5.2 — Corfidi/NOAA scientific hierarchy):`);
  console.log(`  🌫️  AOD (${aodValue?.toFixed(3) ?? 'N/A'}): ${aodScore}/16  ← #1 factor`);
  console.log(`  🌥️  Cloud Layers (H:${highCloud ?? '?'}% M:${midCloud ?? '?'}% L:${lowCloud ?? '?'}%): ${multiLevelScore}/20  ← #2 factor`);
  console.log(`  ☁️  Cloud Cover [${cloudSource}] (${cloudCover}%): ${cloudScore}/18`);
  console.log(`  💧 Humidity [${humiditySource}] (${humidity}%): ${humidScore}/15`);
  console.log(`  📊 Pressure Trend (Δ${pressureTrend != null ? (pressureTrend >= 0 ? '+' : '') + pressureTrend : '?'}hPa): ${pressureScore}/11`);
  console.log(`  👁️  Visibility [${visSource}] (${visibilityKm.toFixed(1)}km): ${visScore}/5`);
  console.log(`  🌤️  Weather (${precipProb}% precip): ${weatherScore}/5`);
  console.log(`  💨 Wind (${windSpeed}km/h): ${windScore}/5`);
  console.log(`  🔗 Synergy: ${synergy >= 0 ? '+' : ''}${synergy}/±4`);
  if (postRainBonus > 0) console.log(`  🌧️  Post-rain bonus: +${postRainBonus}`);
  if (solarBonus !== 0) console.log(`  🌐 Solar angle: ${solarBonus >= 0 ? '+' : ''}${solarBonus}/±2`);
  console.log(`  🎯 TOTAL: ${finalScore}/100`);

  return {
    score: finalScore,
    breakdown: {
      cloudCover: { value: cloudCover, score: cloudScore, maxScore: 18 },
      multiLevelCloud: {
        high: highCloud,
        mid: midCloud,
        low: lowCloud,
        score: multiLevelScore,
        maxScore: 20
      },
      humidity: { value: humidity, score: humidScore, maxScore: 15 },
      pressureTrend: {
        value: pressureTrend,
        pressureMsl: pressureMsl,
        score: pressureScore,
        maxScore: 11
      },
      aod: {
        value: aodValue,
        score: aodScore,
        maxScore: 16
      },
      visibility: { value: Math.round(visibilityKm * 10) / 10, score: visScore, maxScore: 5 },
      weather: { value: precipProb, score: weatherScore, maxScore: 5 },
      wind: { value: windSpeed, score: windScore, maxScore: 5 },
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
    humidityLabel: humidity <= 55 ? 'Excellent' : humidity <= 65 ? 'Very Good' : humidity <= 75 ? 'Good' : humidity <= 82 ? 'Decent' : humidity <= 88 ? 'Normal' : humidity <= 93 ? 'High' : 'Very High',
    visibilityLabel: visibility >= 18 ? 'Exceptional' : visibility >= 12 ? 'Excellent' : visibility >= 8 ? 'Good' : visibility >= 5 ? 'Fair' : 'Poor',
    windLabel: windSpeed <= 10 ? 'Calm' : windSpeed <= 20 ? 'Light' : windSpeed <= 30 ? 'Moderate' : 'Strong',

    // ── NEW v5 LABELS ──
    cloudLayerLabel: highCloud != null
      ? (highCloud >= 30 && lowCloud < 40 ? 'High Canvas'
         : highCloud >= 30 && lowCloud >= 40 ? 'Mixed Layers'
         : lowCloud >= 75 ? 'Low Overcast'
         : lowCloud >= 65 ? 'Heavy Low'
         : lowCloud >= 50 ? 'Low Band'    // v5.1: 50-65% = band with gaps, not blanket
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
      : humidity <= 82
      ? 'Moderate humidity — some color muting possible'
      : humidity <= 90
      ? 'Typical coastal dawn humidity — colours softened but visible'  // v5.1
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
         : lowCloud >= 50
         ? 'Low cloud band at the horizon with gaps — light may punch through'  // v5.1
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

  // ── v5.1: SYNC forecast values with what the scorer ACTUALLY used ──
  // The scorer may override AW values with OM data. The forecast object
  // must reflect the SCORED values, otherwise AI insights and frontend
  // labels will contradict the score (e.g. AI says "grey" when score says GOOD).
  if (breakdown.cloudCover?.value != null) weatherData.cloudCover = breakdown.cloudCover.value;
  if (breakdown.humidity?.value != null) weatherData.humidity = breakdown.humidity.value;
  if (breakdown.visibility?.value != null) weatherData.visibility = breakdown.visibility.value;

  // Track which data source was used for each key metric
  const dataSources = {
    cloudCover: openMeteoForecast?.cloudCover != null ? 'Open-Meteo' : 'AccuWeather',
    humidity: openMeteoForecast?.humidity != null ? 'Open-Meteo' : 'AccuWeather',
    visibility: openMeteoForecast?.visibility != null ? 'Open-Meteo' : 'AccuWeather',
    cloudLayers: 'Open-Meteo',
    pressureTrend: 'Open-Meteo',
    aod: 'Open-Meteo',
    weather: 'AccuWeather',
    wind: 'AccuWeather'
  };

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
    source: 'AccuWeather',
    dataSources  // v5.1: per-metric data source tracking
  };
}

// ==========================================
// SCHEDULED CACHE WARMUP (v5.2)
// ==========================================
//
// Proactively fetches fresh Open-Meteo data aligned to GFS/CAMS model run availability.
// This ensures the cache is always populated with the latest model run BEFORE
// the daily email (4 AM IST) and before users check the site (4-5 AM IST).
//
// GFS model runs → Open-Meteo availability (IST):
//   18Z (23:30 IST) → available ~03:30-05:00 IST  ← CRITICAL for sunrise
//   00Z (05:30 IST) → available ~09:00-11:00 IST
//   06Z (11:30 IST) → available ~15:00-16:45 IST
//   12Z (17:30 IST) → available ~21:00-22:45 IST
//
// CAMS air quality runs every 12h:
//   00Z → available ~06:00-08:00 IST
//   12Z → available ~18:00-20:00 IST
//
// Schedule (IST, via node-cron):
//   03:40  — Pre-dawn forecast warmup (catch early 18Z arrivals)
//   03:55  — Pre-email forecast warmup (final refresh before 4 AM email)
//   04:20  — Post-email warmup (catch late 18Z arrivals for 4-5 AM website users)
//   09:30  — Catch 00Z GFS run
//   15:30  — Catch 06Z GFS run
//   21:30  — Catch 12Z GFS run
//   07:00  — CAMS 00Z air quality warmup
//   19:00  — CAMS 12Z air quality warmup
//
// API budget impact: ~24 forecast + ~8 AQ = ~32 calls/day total (out of 10,000 free tier)
// ==========================================

const cron = require('node-cron');

const CACHE_WARMUP_COORDS = [
  { label: 'Chennai center', lat: 13.0, lon: 80.3 },  // Marina/Elliot's/Thiruvanmiyur
  { label: 'Covelong area',  lat: 12.8, lon: 80.3 }    // Covelong
];

/**
 * Warm up forecast cache (cloud layers, pressure, humidity, visibility)
 * Called on schedule aligned to GFS model run availability
 */
async function warmUpForecastCache(trigger = 'scheduled') {
  console.log(`\n🔥 [${trigger}] Warming forecast cache...`);
  const delay = () => new Promise(r => setTimeout(r, 5000)); // 5s between calls

  for (const coord of CACHE_WARMUP_COORDS) {
    try {
      // Force cache refresh by checking if existing cache is older than 30 min
      // (if it's fresh enough, the fetch function will return cached data — that's fine)
      const result = await fetchOpenMeteoForecast(coord.lat, coord.lon);
      console.log(result
        ? `  ✅ Forecast ${coord.label}: H${result.highCloud}% M${result.midCloud}% L${result.lowCloud}% Cloud${result.cloudCover ?? '?'}%`
        : `  ⚠️ Forecast ${coord.label}: returned null`);
    } catch (e) {
      console.warn(`  ❌ Forecast ${coord.label}: ${e.message}`);
    }
    await delay();
  }
}

/**
 * Warm up air quality cache (AOD — our #1 scoring factor)
 * Called on schedule aligned to CAMS 12-hourly model runs
 */
async function warmUpAQCache(trigger = 'scheduled') {
  console.log(`\n🔥 [${trigger}] Warming AQ/AOD cache...`);
  const delay = () => new Promise(r => setTimeout(r, 5000));

  for (const coord of CACHE_WARMUP_COORDS) {
    try {
      const result = await fetchOpenMeteoAirQuality(coord.lat, coord.lon);
      console.log(result
        ? `  ✅ AOD ${coord.label}: ${result.aod?.toFixed(3) ?? 'N/A'} | PM2.5: ${result.pm25?.toFixed(1) ?? 'N/A'}`
        : `  ⚠️ AOD ${coord.label}: returned null`);
    } catch (e) {
      console.warn(`  ❌ AOD ${coord.label}: ${e.message}`);
    }
    await delay();
  }
}

/**
 * Full warmup — both forecast and AQ (used on boot and for the critical pre-dawn window)
 */
async function warmUpAllCaches(trigger = 'boot') {
  console.log(`\n🔥 [${trigger}] Full cache warmup starting... ${OPENMETEO_PROXY ? '(via CF Worker proxy)' : '(direct)'}`);
  await warmUpForecastCache(trigger);
  await warmUpAQCache(trigger);
  console.log(`🔥 [${trigger}] Full cache warmup complete\n`);
}

/**
 * Initialize scheduled cache warmup cron jobs
 * All times are IST (Asia/Kolkata)
 */
function initializeCacheWarmup() {
  const TZ = { timezone: 'Asia/Kolkata' };

  // ── PRE-DAWN CRITICAL WINDOW (catch GFS 18Z for sunrise) ──
  // 18Z run → available ~03:30-05:00 IST. Email goes at 4:00 AM.
  // Three attempts to ensure the freshest possible data:
  cron.schedule('40 3 * * *', () => warmUpForecastCache('pre-dawn-1 (03:40 IST, catch early 18Z)'), TZ);
  cron.schedule('55 3 * * *', () => warmUpAllCaches('pre-email (03:55 IST, final refresh before 4AM email)'), TZ);
  cron.schedule('20 4 * * *', () => warmUpForecastCache('post-email (04:20 IST, catch late 18Z for web users)'), TZ);

  // ── DAYTIME GFS RUNS (keep cache fresh for afternoon/evening checks) ──
  cron.schedule('30 9 * * *',  () => warmUpForecastCache('GFS-00Z (09:30 IST)'), TZ);
  cron.schedule('30 15 * * *', () => warmUpForecastCache('GFS-06Z (15:30 IST)'), TZ);
  cron.schedule('30 21 * * *', () => warmUpForecastCache('GFS-12Z (21:30 IST)'), TZ);

  // ── CAMS AIR QUALITY (12-hourly model, AOD is our #1 factor) ──
  cron.schedule('0 7 * * *',  () => warmUpAQCache('CAMS-00Z (07:00 IST)'), TZ);
  cron.schedule('0 19 * * *', () => warmUpAQCache('CAMS-12Z (19:00 IST)'), TZ);

  console.log('📅 Cache warmup schedule initialized (IST):');
  console.log('   🌅 Pre-dawn:  03:40, 03:55 (full), 04:20');
  console.log('   🌤️  Daytime:   09:30, 15:30, 21:30');
  console.log('   🌫️  AQ/AOD:    07:00, 19:00');
}

// Fire boot warmup (non-blocking — 10s delay so server is online first)
setTimeout(() => {
  warmUpAllCaches('boot').catch(e => console.warn('⚠️ Boot warmup failed:', e.message));
}, 10000);

// Initialize cron schedule (runs immediately on module load)
initializeCacheWarmup();

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