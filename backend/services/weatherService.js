// ==========================================
// Weather Service - AccuWeather Integration
// Research-backed sunrise quality scoring
//
// KEY FINDING: Cloud cover 30-60% = OPTIMAL
// (previously scored 0% as best - scientifically incorrect)
//
// Weights: Cloud 35 | Humidity 25 | Vis 20 | Weather 10 | Wind 5 | Synergy ±5
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
      moonPhase: daily.Moon?.Phase || null
    };

    // Cache it
    _dailyCache[locationKey] = { data: result, fetchedAt: Date.now() };

    return result;
  } catch (error) {
    console.warn('⚠️ AccuWeather daily forecast failed:', error.message);
    return null;
  }
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
// SUNRISE-CALIBRATED SCORING FUNCTIONS (v2)
// Sources: NOAA/Corfidi, SunsetWx, PhotoWeather, Alpenglow,
//          Live Science, Wikipedia, 12+ photographer guides
//
// Weights: Cloud 35 | Humidity 25 | Vis 20 | Weather 10 | Wind 5 | Synergy ±5
//
// Key differences from v1:
//   - Humidity curve shifted for sunrise (morning RH is naturally higher)
//   - Visibility weight reduced (morning air is already cleaner)
//   - Cloud cover below 30% penalized more realistically
//   - Synergy bonus/penalty for factor interactions
// ==========================================

/**
 * CLOUD COVER SCORE (max 35 points)
 * Research: 30-60% is OPTIMAL for dramatic sunrise colors.
 * "Without clouds, you won't get spectacular reds, pinks, oranges" (24HoursLayover)
 * "Most memorable sunrises tend to have at least a few clouds" (NOAA/Corfidi)
 * Sunrise color is more focused around the sun (Live Science) — clouds
 * as canvas matter even MORE for sunrise than sunset.
 */
function scoreCloudCover(cloudCover) {
  let score;

  if (cloudCover >= 30 && cloudCover <= 60) {
    // OPTIMAL: Peak drama at 45%. Clouds act as canvas for red/orange reflection.
    score = 30 + Math.round(5 * (1 - Math.abs(cloudCover - 45) / 15));
  } else if (cloudCover > 60 && cloudCover <= 75) {
    // Decent but increasingly blocked light
    const dropoff = (cloudCover - 60) / 15;
    score = Math.round(30 - dropoff * 12);
  } else if (cloudCover > 75 && cloudCover <= 90) {
    // Heavy overcast — most light blocked
    const dropoff = (cloudCover - 75) / 15;
    score = Math.round(18 - dropoff * 12);
  } else if (cloudCover > 90) {
    // Total overcast — almost no light gets through
    score = Math.round(6 - ((cloudCover - 90) / 10) * 6);
  } else if (cloudCover >= 25 && cloudCover < 30) {
    // Approaching optimal — decent potential
    score = 20 + Math.round((cloudCover - 25) / 5 * 10);
  } else if (cloudCover >= 15 && cloudCover < 25) {
    // Some scattered clouds — limited canvas for color
    score = 13 + Math.round((cloudCover - 15) / 10 * 7);
  } else {
    // 0-15%: Clear sky — pleasant sunrise glow, but no dramatic canvas.
    // At a beach, unobstructed horizon gives some interest, so not zero.
    score = 8 + Math.round((cloudCover / 15) * 5);
  }

  return Math.max(0, Math.min(35, score));
}

/**
 * VISIBILITY SCORE (max 20 points — reduced from v1's 30)
 * Research: "The higher the better" — but it's a supporting factor.
 * SunsetWx doesn't even use visibility in their core three (cloud, moisture, pressure).
 * NOAA/Corfidi: "Clean air is the main ingredient" — visibility is the proxy.
 *
 * Sunrise-specific: Morning air is naturally cleaner than evening (Wikipedia,
 * Live Science, Alpenglow). High visibility at dawn is baseline, not exceptional.
 */
function scoreVisibility(visibilityKm) {
  let score;

  if (visibilityKm >= 18) {
    score = 20; // Post-rain crystal clarity — full marks
  } else if (visibilityKm >= 12) {
    // Good to excellent — baseline good morning
    score = 14 + Math.round((visibilityKm - 12) / 6 * 6);
  } else if (visibilityKm >= 8) {
    // Decent atmospheric clarity
    score = 9 + Math.round((visibilityKm - 8) / 4 * 5);
  } else if (visibilityKm >= 5) {
    // Reduced — some haze
    score = 5 + Math.round((visibilityKm - 5) / 3 * 4);
  } else if (visibilityKm >= 2) {
    // Poor — significant haze or mist
    score = 2 + Math.round((visibilityKm - 2) / 3 * 3);
  } else {
    // Very poor — fog territory
    score = Math.round(visibilityKm / 2 * 2);
  }

  return Math.max(0, Math.min(20, score));
}

/**
 * HUMIDITY SCORE (max 25 points — increased from v1's 20)
 * Research: "Less humidity = more crisp, dramatic" (all sources).
 * "Higher humidity gives a milky look" (NOAA — Mie scattering from water droplets).
 * SunsetWx: Moisture is one of their top 3 variables.
 *
 * SUNRISE-SPECIFIC CALIBRATION (critical):
 * Relative humidity peaks at dawn (temperature at daily minimum → closer to dew point).
 * Chennai coastal 6AM humidity is routinely 80-90%.
 * v1 gave ≤40% full marks — unreachable at a Chennai dawn, making the factor
 * meaningless for differentiation. v2 shifts the curve upward.
 *
 * Alpenglow: "Morning dew and higher humidity can create magical effects,
 * with water droplets reflecting warm sunrise colors." So it's not purely negative.
 */
function scoreHumidity(humidity) {
  let score;

  if (humidity <= 55) {
    // Exceptional for sunrise — rare at dawn, vivid crisp colors
    score = 25;
  } else if (humidity <= 65) {
    // Excellent — sharp, saturated sunrise colors
    score = 25 - Math.round((humidity - 55) / 10 * 6);
  } else if (humidity <= 75) {
    // Good — typical dry-season Chennai morning
    score = 19 - Math.round((humidity - 65) / 10 * 6);
  } else if (humidity <= 85) {
    // Moderate — noticeable color muting begins
    score = 13 - Math.round((humidity - 75) / 10 * 7);
  } else if (humidity <= 93) {
    // High — milky horizon, washed-out pastels
    score = 6 - Math.round((humidity - 85) / 8 * 4);
  } else {
    // Very high — fog/mist territory, colors severely muted
    score = Math.max(0, 2 - Math.round((humidity - 93) / 7 * 2));
  }

  return Math.max(0, Math.min(25, score));
}

/**
 * WEATHER CONDITIONS SCORE (max 10 points)
 * Precipitation probability + active weather penalty
 */
function scoreWeatherConditions(precipProbability, hasPrecipitation, weatherDescription) {
  let score = 10;

  // Precipitation probability
  if (precipProbability > 70) score -= 8;
  else if (precipProbability > 50) score -= 6;
  else if (precipProbability > 30) score -= 3;
  else if (precipProbability > 15) score -= 1;

  // Active precipitation
  if (hasPrecipitation) score -= 4;

  // Description-based adjustments
  const desc = (weatherDescription || '').toLowerCase();
  if (desc.includes('thunder') || desc.includes('storm')) score -= 4;
  if (desc.includes('fog') || desc.includes('mist')) score -= 3;
  if (desc.includes('haze')) score -= 2;
  if (desc.includes('sunny') || desc.includes('clear')) score += 1;

  return Math.max(0, Math.min(10, score));
}

/**
 * WIND SCORE (max 5 points)
 * Research: Calm wind maintains atmospheric layers.
 * <10 km/h = ideal; >30 km/h = disperses clouds too fast
 */
function scoreWind(windSpeedKmh) {
  if (windSpeedKmh <= 10) return 5;
  if (windSpeedKmh <= 20) return 4;
  if (windSpeedKmh <= 30) return 3;
  if (windSpeedKmh <= 40) return 2;
  return 1;
}

/**
 * SYNERGY ADJUSTMENT (±5 points)
 * Captures interactions between factors that independent scoring misses.
 *
 * Research basis:
 * - High humidity + low cloud = worst combo (no canvas AND washed-out light)
 * - Low humidity + optimal cloud = best combo (vivid colors on dramatic canvas)
 * - Very high humidity negates even optimal cloud cover (colors wash out regardless)
 */
function getSynergyAdjustment(cloudCover, humidity, visibilityKm) {
  let adjustment = 0;

  // PENALTY: High humidity + sparse clouds — washed-out and boring
  if (humidity > 85 && cloudCover < 25) {
    adjustment -= 3;
  } else if (humidity > 80 && cloudCover < 20) {
    adjustment -= 2;
  }

  // PENALTY: Very clear sky — even with perfect vis/humidity, limited drama
  if (cloudCover < 15 && humidity < 70) {
    adjustment -= 3; // Vivid but boring — needs clouds for drama
  } else if (cloudCover < 15) {
    adjustment -= 2; // Clear + humid = bland
  }

  // PENALTY: Very high humidity washes out colors even with good cloud canvas
  // (NOAA: "Higher humidity gives a milky look" — Mie scattering from water droplets)
  if (humidity > 85 && cloudCover >= 30) {
    adjustment -= 3; // Clouds are there but colors are muted to pastels
  }

  // BONUS: Low humidity + optimal clouds — the dream combo
  if (humidity < 70 && cloudCover >= 30 && cloudCover <= 60) {
    adjustment += 4;
  } else if (humidity < 75 && cloudCover >= 25 && cloudCover <= 65) {
    adjustment += 2;
  }

  // PENALTY: Very high humidity negates visibility advantage
  if (humidity > 90 && visibilityKm > 10) {
    adjustment -= 2;
  }

  return Math.max(-5, Math.min(5, adjustment));
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
 * MASTER SCORING FUNCTION
 * Weights: Cloud 35 | Humidity 25 | Vis 20 | Weather 10 | Wind 5 | Synergy ±5 = 100
 */
function calculateSunriseScore(forecastRaw) {
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

  // Individual factor scores
  const cloudScore = scoreCloudCover(cloudCover);
  const visScore = scoreVisibility(visibilityKm);
  const humidScore = scoreHumidity(humidity);
  const weatherScore = scoreWeatherConditions(precipProb, hasPrecip, weatherDesc);
  const windScore = scoreWind(windSpeed);
  const synergy = getSynergyAdjustment(cloudCover, humidity, visibilityKm);

  const baseScore = cloudScore + visScore + humidScore + weatherScore + windScore + synergy;

  // Post-rain bonus (max 5 extra points)
  const postRainBonus = getPostRainBonus({
    precipProbability: precipProb,
    humidity,
    visibility: visibilityKm,
    cloudCover
  });

  const finalScore = Math.max(0, Math.min(100, baseScore + postRainBonus));

  console.log(`\n📊 SCORING BREAKDOWN (v2 — sunrise-calibrated):`);
  console.log(`  ☁️  Cloud Cover (${cloudCover}%): ${cloudScore}/35`);
  console.log(`  👁️  Visibility (${visibilityKm.toFixed(1)}km): ${visScore}/20`);
  console.log(`  💧 Humidity (${humidity}%): ${humidScore}/25`);
  console.log(`  🌤️  Weather (${precipProb}% precip): ${weatherScore}/10`);
  console.log(`  💨 Wind (${windSpeed}km/h): ${windScore}/5`);
  console.log(`  🔗 Synergy: ${synergy >= 0 ? '+' : ''}${synergy}/±5`);
  if (postRainBonus > 0) console.log(`  🌧️  Post-rain bonus: +${postRainBonus}`);
  console.log(`  🎯 TOTAL: ${finalScore}/100`);

  return {
    score: finalScore,
    breakdown: {
      cloudCover: { value: cloudCover, score: cloudScore, maxScore: 35 },
      visibility: { value: Math.round(visibilityKm * 10) / 10, score: visScore, maxScore: 20 },
      humidity: { value: humidity, score: humidScore, maxScore: 25 },
      weather: { value: precipProb, score: weatherScore, maxScore: 10 },
      wind: { value: windSpeed, score: windScore, maxScore: 5 },
      synergy,
      postRainBonus
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
 * Get atmospheric quality labels for UI display
 */
function getAtmosphericLabels(forecast) {
  const cloudCover = forecast.cloudCover;
  const humidity = forecast.humidity;
  const visibility = forecast.visibility;
  const windSpeed = forecast.windSpeed;

  return {
    cloudLabel: cloudCover >= 30 && cloudCover <= 60
      ? 'Optimal'
      : cloudCover < 30 ? 'Too Clear' : cloudCover <= 75 ? 'Partly Overcast' : 'Overcast',
    humidityLabel: humidity <= 55 ? 'Excellent' : humidity <= 65 ? 'Very Good' : humidity <= 75 ? 'Good' : humidity <= 85 ? 'Moderate' : 'High',
    visibilityLabel: visibility >= 18 ? 'Exceptional' : visibility >= 12 ? 'Excellent' : visibility >= 8 ? 'Good' : visibility >= 5 ? 'Fair' : 'Poor',
    windLabel: windSpeed <= 10 ? 'Calm' : windSpeed <= 20 ? 'Light' : windSpeed <= 30 ? 'Moderate' : 'Strong',
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
      : 'Reduced visibility softens colors and contrast'
  };
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

  // Fetch hourly + daily in parallel
  const [hourlyData, dailyData] = await Promise.all([
    fetchAccuWeatherHourly(beach.locationKey),
    fetchAccuWeatherDaily(beach.locationKey)
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

  const { score, breakdown } = calculateSunriseScore(forecast6AM);
  const verdict = getVerdict(score);
  const recommendation = getRecommendation(score);
  const atmosphericLabels = getAtmosphericLabels(weatherData);

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
        humidity: atmosphericLabels.humidityLabel,
        visibility: atmosphericLabels.visibilityLabel,
        wind: atmosphericLabels.windLabel
      }
    },
    source: 'AccuWeather'
  };
}

module.exports = {
  getTomorrow6AMForecast,
  getBeaches,
  isPredictionTimeAvailable,
  getTimeUntilAvailable
};