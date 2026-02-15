// ==========================================
// Weather Service - AccuWeather Integration
// Research-backed sunrise quality scoring
//
// KEY FINDING: Cloud cover 30-60% = OPTIMAL
// (previously scored 0% as best - scientifically incorrect)
//
// Weights: Cloud 35% | Visibility 30% | Humidity 20% | Weather 10% | Wind 5%
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
    coordinates: { lat: 13.0499, lon: 80.2824 }
  },
  elliot: {
    name: "Elliot's Beach",
    key: 'elliot',
    locationKey: CHENNAI_LOCATION_KEY,
    coordinates: { lat: 13.0067, lon: 80.2669 }
  },
  covelong: {
    name: 'Covelong Beach',
    key: 'covelong',
    locationKey: CHENNAI_LOCATION_KEY,
    coordinates: { lat: 12.7925, lon: 80.2514 }
  },
  thiruvanmiyur: {
    name: 'Thiruvanmiyur Beach',
    key: 'thiruvanmiyur',
    locationKey: CHENNAI_LOCATION_KEY,
    coordinates: { lat: 12.9826, lon: 80.2589 }
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
    coordinates: beach.coordinates
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
// RESEARCH-BACKED SCORING FUNCTIONS
// Source: PhotoWeather, NOAA, Penn State Meteorology
// ==========================================

/**
 * CLOUD COVER SCORE (max 35 points)
 * Research finding: 30-60% is OPTIMAL for dramatic colors
 * Clear skies = boring, no canvas; overcast = blocked light
 */
function scoreCloudCover(cloudCover) {
  let score;

  if (cloudCover >= 30 && cloudCover <= 60) {
    // OPTIMAL RANGE: Acts as canvas for orange/red reflection
    // More cloud in this range = more drama (peak at ~45%)
    score = 30 + Math.round(5 * (1 - Math.abs(cloudCover - 45) / 15));
  } else if (cloudCover > 60 && cloudCover <= 75) {
    // Still decent: some blocked light but enough gaps
    const dropoff = (cloudCover - 60) / 15;
    score = Math.round(30 - dropoff * 10);
  } else if (cloudCover > 75) {
    // Overcast: Light severely blocked
    const dropoff = (cloudCover - 75) / 25;
    score = Math.round(20 - dropoff * 20);
  } else if (cloudCover >= 20 && cloudCover < 30) {
    // Thin cover: Some color but lacks drama
    score = 22 + Math.round((cloudCover - 20) / 10 * 8);
  } else {
    // 0-20%: Clear but boring - faded pale colors
    score = Math.round(15 + (cloudCover / 20) * 7);
  }

  return Math.max(0, Math.min(35, score));
}

/**
 * VISIBILITY SCORE (max 30 points)
 * Research finding: 8-25 km optimal (PhotoWeather)
 * Post-rain 15-20 km = exceptional clarity
 */
function scoreVisibility(visibilityKm) {
  // AccuWeather returns miles - convert if needed
  // Assuming already in km since we request metric: true
  let score;

  if (visibilityKm >= 15) {
    score = 30; // Exceptional clarity
  } else if (visibilityKm >= 10) {
    score = 27 + Math.round((visibilityKm - 10) / 5 * 3);
  } else if (visibilityKm >= 8) {
    score = 22 + Math.round((visibilityKm - 8) / 2 * 5);
  } else if (visibilityKm >= 5) {
    score = 12 + Math.round((visibilityKm - 5) / 3 * 10);
  } else if (visibilityKm >= 3) {
    score = 5 + Math.round((visibilityKm - 3) / 2 * 7);
  } else {
    score = Math.round(visibilityKm / 3 * 5); // Very poor
  }

  return Math.max(0, Math.min(30, score));
}

/**
 * HUMIDITY SCORE (max 20 points)
 * Research finding: High humidity = muted, washed-out colors
 * <40% = vibrant; >85% = dull
 */
function scoreHumidity(humidity) {
  let score;

  if (humidity <= 40) {
    score = 20; // Excellent: Vibrant, crisp colors
  } else if (humidity <= 55) {
    score = 18 - Math.round((humidity - 40) / 15 * 3);
  } else if (humidity <= 70) {
    score = 15 - Math.round((humidity - 55) / 15 * 5);
  } else if (humidity <= 85) {
    score = 10 - Math.round((humidity - 70) / 15 * 6);
  } else {
    // >85%: Dull, washed-out, colors severely muted
    score = Math.max(0, 4 - Math.round((humidity - 85) / 15 * 4));
  }

  return Math.max(0, Math.min(20, score));
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
 * Research finding: Calm wind maintains atmospheric layers
 * <10 km/h = ideal; >30 km/h = blows clouds away too fast
 */
function scoreWind(windSpeedKmh) {
  if (windSpeedKmh <= 10) return 5;
  if (windSpeedKmh <= 20) return 4;
  if (windSpeedKmh <= 30) return 3;
  if (windSpeedKmh <= 40) return 2;
  return 1;
}

/**
 * POST-RAIN BONUS (max +10 points)
 * After rain: clearest air (15-20km visibility), broken clouds remain at 30-60%
 * Detected via: recent precipitation + now clearing description
 */
function getPostRainBonus(forecast, weatherDescription) {
  const desc = (weatherDescription || '').toLowerCase();
  const precipProb = forecast.precipProbability || 0;

  // Post-frontal clearing patterns
  const clearingPatterns = ['clearing', 'partly cloudy', 'mostly cloudy', 'clouds'];
  const isClearing = clearingPatterns.some(p => desc.includes(p));

  // Low current precipitation but description suggests recent rain
  if (precipProb <= 20 && isClearing && (forecast.humidity > 60 && forecast.humidity < 85)) {
    console.log('🌧️ Post-rain conditions detected: +8 bonus');
    return 8;
  }

  return 0;
}

/**
 * MASTER SCORING FUNCTION
 * Weights: Cloud 35 | Visibility 30 | Humidity 20 | Weather 10 | Wind 5 = 100
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
  // Convert miles to km if unit is mi
  const visibilityUnit = forecastRaw.Visibility?.Unit || 'km';
  const visibilityKm = visibilityUnit === 'mi' ? visibilityRaw * 1.60934 : visibilityRaw;

  // Individual factor scores
  const cloudScore = scoreCloudCover(cloudCover);
  const visScore = scoreVisibility(visibilityKm);
  const humidScore = scoreHumidity(humidity);
  const weatherScore = scoreWeatherConditions(precipProb, hasPrecip, weatherDesc);
  const windScore = scoreWind(windSpeed);

  const baseScore = cloudScore + visScore + humidScore + weatherScore + windScore;

  // Post-rain bonus (max 10 extra points)
  const postRainBonus = getPostRainBonus(
    { precipProbability: precipProb, humidity },
    weatherDesc
  );

  const finalScore = Math.min(100, baseScore + postRainBonus);

  console.log(`\n📊 SCORING BREAKDOWN:`);
  console.log(`  ☁️  Cloud Cover (${cloudCover}%): ${cloudScore}/35`);
  console.log(`  👁️  Visibility (${visibilityKm.toFixed(1)}km): ${visScore}/30`);
  console.log(`  💧 Humidity (${humidity}%): ${humidScore}/20`);
  console.log(`  🌤️  Weather (${precipProb}% precip): ${weatherScore}/10`);
  console.log(`  💨 Wind (${windSpeed}km/h): ${windScore}/5`);
  if (postRainBonus > 0) console.log(`  🌧️  Post-rain bonus: +${postRainBonus}`);
  console.log(`  🎯 TOTAL: ${finalScore}/100`);

  return {
    score: finalScore,
    breakdown: {
      cloudCover: { value: cloudCover, score: cloudScore, maxScore: 35 },
      visibility: { value: Math.round(visibilityKm * 10) / 10, score: visScore, maxScore: 30 },
      humidity: { value: humidity, score: humidScore, maxScore: 20 },
      weather: { value: precipProb, score: weatherScore, maxScore: 10 },
      wind: { value: windSpeed, score: windScore, maxScore: 5 },
      postRainBonus
    }
  };
}

/**
 * Verdict based on research-adjusted thresholds
 * Lowered EXCELLENT from 90→85 (more achievable, PhotoWeather "Fiery Sky" = 80+)
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
    humidityLabel: humidity <= 40 ? 'Excellent' : humidity <= 55 ? 'Very Good' : humidity <= 70 ? 'Moderate' : humidity <= 85 ? 'High' : 'Very High',
    visibilityLabel: visibility >= 15 ? 'Exceptional' : visibility >= 10 ? 'Excellent' : visibility >= 8 ? 'Very Good' : visibility >= 5 ? 'Good' : 'Poor',
    windLabel: windSpeed <= 10 ? 'Calm' : windSpeed <= 20 ? 'Light' : windSpeed <= 30 ? 'Moderate' : 'Strong',
    cloudContext: cloudCover >= 30 && cloudCover <= 60
      ? 'Acts as canvas for orange and red sky reflections'
      : cloudCover < 30
      ? 'Clear skies produce pale, less dramatic colors'
      : cloudCover <= 75
      ? 'Some gaps allow light through, moderate color potential'
      : 'Dense coverage blocks most light and color',
    humidityContext: humidity <= 55
      ? 'Low humidity = crisp, vibrant, saturated colors'
      : humidity <= 70
      ? 'Moderate humidity may slightly mute sky colors'
      : 'High humidity scatters light, washing out colors',
    visibilityContext: visibility >= 10
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

  const hourlyData = await fetchAccuWeatherHourly(beach.locationKey);
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

  return {
    available: true,
    beach: beach.name,
    beachKey: beach.key,
    coordinates: beach.coordinates,
    forecast: {
      ...weatherData,
      forecastTime: istTime.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'short'
      })
    },
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