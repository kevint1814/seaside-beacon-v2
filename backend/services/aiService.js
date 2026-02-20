// ==========================================
// AI Service - Multi-Provider Sunrise Insights
// 3-tier failover: Gemini Flash → Groq → Flash-Lite → rule-based
//
// ZERO hardcoded beach content — AI generates
// everything from weather data + beach context.
// Golden hour computed from real AccuWeather
// sunrise time, not hardcoded.
// ==========================================

const Groq = require('groq-sdk');
const OpenAI = require('openai');

// ── Provider config ──────────────────────────────────
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash';
const GEMINI_LITE_MODEL = process.env.GEMINI_LITE_MODEL || 'gemini-2.5-flash-lite';
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || process.env.GROQ_MAX_TOKENS) || 1200;
const AI_TEMPERATURE = parseFloat(process.env.AI_TEMPERATURE || process.env.GROQ_TEMPERATURE) || 0.7;

// ── Initialize providers ─────────────────────────────
let groqClient;
let geminiFlashClient;
let geminiLiteClient;

// Provider 1: Gemini 2.5 Flash (primary — high quality, 250 RPD)
try {
  if (process.env.GEMINI_API_KEY) {
    geminiFlashClient = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
    console.log(`✅ Gemini Flash initialized (model: ${GEMINI_FLASH_MODEL})`);
  }
} catch (error) {
  console.warn('⚠️  Gemini Flash initialization failed');
}

// Provider 2: Groq Llama 3.3 70B (secondary — high quality, 51 calls/day TPD)
try {
  if (process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log(`✅ Groq initialized (model: ${GROQ_MODEL})`);
  }
} catch (error) {
  console.warn('⚠️  Groq initialization failed');
}

// Provider 3: Gemini 2.5 Flash-Lite (safety net — decent quality, 1000 RPD)
try {
  if (process.env.GEMINI_API_KEY) {
    geminiLiteClient = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
    console.log(`✅ Gemini Flash-Lite initialized (model: ${GEMINI_LITE_MODEL})`);
  }
} catch (error) {
  console.warn('⚠️  Gemini Flash-Lite initialization failed');
}

const AI_PROVIDERS = [
  geminiFlashClient && { name: 'gemini-flash', client: geminiFlashClient, model: GEMINI_FLASH_MODEL },
  groqClient && { name: 'groq', client: groqClient, model: GROQ_MODEL, isGroq: true },
  geminiLiteClient && { name: 'gemini-flash-lite', client: geminiLiteClient, model: GEMINI_LITE_MODEL }
].filter(Boolean);

if (AI_PROVIDERS.length === 0) {
  console.warn('⚠️  No AI providers configured — using rule-based fallback only');
} else {
  console.log(`🤖 AI provider chain: ${AI_PROVIDERS.map(p => p.name).join(' → ')} → rule-based`);
}

/**
 * Generate sunrise insights (general audience + photography)
 * 3-tier failover: Gemini Flash → Groq → Flash-Lite → rule-based
 */
async function generatePhotographyInsights(weatherData, allWeatherData = {}) {
  // Try each AI provider in priority order — no retries within a provider,
  // just fail fast and move to the next one. This is faster than retry loops.
  for (const provider of AI_PROVIDERS) {
    try {
      const result = await callAIProvider(provider, weatherData, allWeatherData);
      return result;
    } catch (error) {
      const errorCode = error.status || error.code || '';
      console.warn(`⚠️  ${provider.name} failed (${errorCode}): ${error.message?.substring(0, 120)}`);
      // Continue to next provider
    }
  }

  // All AI providers exhausted — fall back to rule-based
  if (AI_PROVIDERS.length > 0) {
    console.error('❌ All AI providers failed — using rule-based fallback');
  }
  return generateRuleBasedInsights(weatherData, allWeatherData);
}

/**
 * Call a single AI provider (Gemini or Groq) — OpenAI-compatible format
 * Throws on failure so the failover chain can continue
 */
async function callAIProvider(provider, weatherData, allWeatherData = {}) {
  try {
    console.log(`🤖 Calling ${provider.name} (${provider.model}) for insights...`);

    const { beach, forecast, prediction, beachContext, goldenHour, sunTimes } = weatherData;
    const { cloudCover, humidity, visibility, windSpeed, temperature, precipProbability, weatherDescription } = forecast;
    const { score, verdict, atmosphericLabels, breakdown } = prediction;

    // Extract v5 breakdown fields for the prompt
    const highCloud = breakdown?.multiLevelCloud?.high ?? breakdown?.highCloud ?? null;
    const midCloud = breakdown?.multiLevelCloud?.mid ?? breakdown?.midCloud ?? null;
    const lowCloud = breakdown?.multiLevelCloud?.low ?? breakdown?.lowCloud ?? null;
    const aodValue = breakdown?.aod?.value ?? null;
    const aodLabel = atmosphericLabels?.aod ?? 'N/A';
    const pressureTrend = breakdown?.pressureTrend?.value ?? null;
    const pressureLabel = atmosphericLabels?.pressureTrend ?? 'N/A';
    const isPostRain = breakdown?.isPostRain ?? false;

    // Use context from weatherService BEACHES config (single source of truth)
    const context = beachContext || 'Beach with natural foreground elements and ocean horizon.';

    // Use real golden hour from AccuWeather, or signal AI to estimate
    let goldenHourInstruction;
    if (goldenHour) {
      goldenHourInstruction = `ACTUAL SUNRISE DATA (from AccuWeather):
- Sunrise: ${goldenHour.sunriseExact}
- Golden Hour Start (20 min before sunrise): ${goldenHour.start}
- Golden Hour Peak (10 min before sunrise): ${goldenHour.peak}
- Golden Hour End (30 min after sunrise): ${goldenHour.end}
Use these EXACT times in your response. Do NOT estimate or make up times.`;
    } else {
      goldenHourInstruction = 'Sunrise time data unavailable. Estimate based on the current month and latitude (~13°N). Be explicit that times are estimates.';
    }

    // Determine honesty tier so the AI knows what tone to use
    // ALIGNED with verdict thresholds: 85 EXCELLENT / 70 VERY GOOD / 55 GOOD / 40 FAIR / 25 POOR / <25 UNFAVORABLE
    let toneInstruction;
    if (score >= 85) {
      toneInstruction = 'This is an exceptional morning — one of the best possible. Be genuinely enthusiastic. Describe the vivid, specific colors and dramatic sky people can expect. Strongly encourage going.';
    } else if (score >= 70) {
      toneInstruction = 'This is a genuinely good morning for sunrise. Be confident and encouraging — expect vivid colors and a satisfying experience. Not the rarest show, but clearly worth the effort for anyone interested.';
    } else if (score >= 55) {
      toneInstruction = 'This is a decent morning — pleasant but not spectacular. Set realistic expectations. Describe what will be nice and what will be limited. Don\'t oversell it.';
    } else if (score >= 40) {
      toneInstruction = 'This is a mixed morning — not great for sunrise color, but not a total washout either. Be honest but not dismissive. There may be some soft color or brief warm tones, just nothing vivid. Mention what they might realistically see (soft peach, muted warm glow, grey patches). The beach at dawn is still peaceful — acknowledge that. Don\'t oversell the sky, but don\'t make it sound pointless either.';
    } else if (score >= 25) {
      toneInstruction = 'This is a poor morning for sunrise. Be straightforward — sunrise will likely not be visible or will be completely washed out. Do NOT romanticize this.';
    } else {
      toneInstruction = 'This is an unfavorable morning. The sunrise will almost certainly not be visible. Be direct — overcast grey sky, no color, flat light. If someone still wants to go for a walk, that\'s fine, but there is no sunrise spectacle.';
    }

    // Build comparison context from all beaches if available
    let comparisonContext = '';
    const beachKeys = Object.keys(allWeatherData);
    if (beachKeys.length > 1) {
      comparisonContext = '\nOTHER BEACHES TODAY (for comparison):\n';
      beachKeys.forEach(key => {
        const d = allWeatherData[key];
        if (d && d.forecast && d.prediction) {
          comparisonContext += `- ${d.beach}: Score ${d.prediction.score}/100, Cloud ${d.forecast.cloudCover}%, Humidity ${d.forecast.humidity}%, Visibility ${d.forecast.visibility}km, Wind ${d.forecast.windSpeed}km/h. Context: ${d.beachContext || 'N/A'}\n`;
        }
      });
    }

    // Dynamic month reference
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const currentMonth = monthNames[new Date().getMonth()];

    const prompt = `Score: ${score}/100 (${verdict}). ${currentMonth}.

TONE: ${toneInstruction}

CONDITIONS: Cloud ${cloudCover}%, Humidity ${humidity}%, Visibility ${visibility}km, Wind ${windSpeed}km/h, ${temperature}°C, Precip ${precipProbability}%, ${weatherDescription}.
CLOUD LAYERS: ${highCloud != null ? `High ${highCloud}% Mid ${midCloud}% Low ${lowCloud}%` : 'N/A'}.
AIR CLARITY (AOD): ${aodValue != null ? `${aodValue.toFixed(2)} (${aodLabel})` : 'N/A'}.
PRESSURE TREND: ${pressureTrend != null ? `Δ${pressureTrend >= 0 ? '+' : ''}${pressureTrend}hPa (${pressureLabel})` : 'N/A'}.
POST-RAIN: ${isPostRain ? 'Yes — recent rain washed the air clean' : 'No'}.

${goldenHourInstruction}

BEACH: ${beach}
CONTEXT: ${context}
${comparisonContext}

WRITING STYLE:
- Talk like a friend texting someone about this morning's sunrise (emails go out at 4 AM, sunrise is ~6:30 AM same day). Say "this morning" or "today", NEVER "tomorrow". Simple, warm, honest.
- Describe what the sky will LOOK like in plain words anyone understands: "orange and pink streaks across the clouds", "grey and flat, no color", "soft warm glow near the horizon."
- Do NOT use weather numbers in your text (no "45% cloud cover" or "87% humidity"). The data is shown separately — your job is to describe the EXPERIENCE.
- On bad days: be honest and brief. "The sky will be mostly grey this morning — not much color expected." Don't try to make it sound better than it is.
- On good days: be genuinely excited. "This is the kind of morning that makes you glad you woke up early."
- NEVER use: "spectacular", "breathtaking", "nature's canvas", "painted sky", "embrace the mood", "serene", "magical", "treat yourself", "every sunrise is unique."
- Beach comparisons: mention what makes each beach DIFFERENT (the lighthouse at Marina, the quiet at Elliot's, the rocks at Covelong) and whether today's sky helps or hurts that spot specifically.

JSON response:
{
  "greeting": "One friendly, honest sentence. Like texting a friend: 'This morning's looking really good at Marina — set that alarm' or 'Quiet morning at Marina — some soft color possible but nothing dramatic.' Match the tone to the score. IMPORTANT: Say 'this morning' or 'today', NEVER 'tomorrow'.",
  "insight": "Two sentences describing what the sky will look like and feel like. Plain language — someone's grandma should understand it.",
  "sunriseExperience": {
    "whatYoullSee": "2-3 sentences painting a picture anyone can visualize. What colors, where in the sky, how it changes as the sun comes up. No technical terms.",
    "beachVibes": "1-2 sentences about what being at ${beach} feels like at dawn — temperature, breeze, crowds, sounds. Use specific details from CONTEXT like the fishing boats or the memorial.",
    "worthWakingUp": "${score >= 70 ? 'Yes — one enthusiastic sentence about why' : score >= 40 ? 'Maybe — honest about what you will and won\'t get. Don\'t say it\'s not worth it.' : 'Probably not for the sunrise — but say if the beach walk itself is still nice'}"
  },
  "goldenHour": {
    "quality": "${score >= 85 ? 'Excellent' : score >= 70 ? 'Very Good' : score >= 55 ? 'Good' : score >= 40 ? 'Fair' : 'Poor'}",
    "tip": "One simple sentence — when to get there and what to look for, in plain language."
  },
  "beachComparison": ${beachKeys.length > 1 ? `{
    "todaysBest": "MUST be exactly one of: ${beachKeys.join(', ')}",
    "reason": "1-2 friendly sentences. Why this beach is the best pick today — or if they're all similar, say that honestly.",
    "beaches": {
      ${beachKeys.map(k => `"${k}": {
        "suitability": "Best/Good/Fair/Poor",
        "reason": "1-2 sentences. What makes THIS beach different from the others for this morning's conditions? Mention a specific feature from CONTEXT. Must be UNIQUE — don't repeat the same thing for every beach."
      }`).join(',\n      ')}
    }
  }` : 'null'}
}

Beach keys MUST be exactly: ${beachKeys.length > 1 ? beachKeys.join(', ') : 'N/A'}. NOT full names like "Marina Beach".`;


    const systemPrompt = `You are Beacon — a friendly, straight-talking sunrise guide for Chennai beaches. You talk like a local friend who checks the sky every morning and texts you whether it's worth waking up. Simple language, no jargon, no weather-nerd talk. When it's good, you're excited but specific about what people will see. When it's bad, you say so plainly without padding. You describe what the sky LOOKS like in everyday words anyone understands — 'orange and pink streaks', 'grey and flat', 'soft warm glow' — not cloud percentages or humidity numbers. Always respond with valid JSON only.

KEY SCIENCE (use to inform your descriptions, but NEVER use the technical terms):
- High clouds (>6km altitude, cirrus) = the color canvas. They catch pre-sunrise light and glow vivid orange/red. More high clouds = more color.
- Low clouds (<2km, stratus) = horizon blockers. They sit in front of the sunrise and turn everything grey.
- Low AOD (Aerosol Optical Depth) = crystal clear air. Colors look vivid, saturated, intense. Think post-rain clarity.
- High AOD = hazy, polluted air. Colors look washed out, muted, milky.
- Falling pressure (2-5 hPa drop) = clearing front approaching. Often produces the MOST dramatic skies — cloud breakup with vivid color through gaps.
- Rapidly falling pressure (>5 hPa) = storm. Too much cloud and rain.
- Post-rain conditions = exceptionally clear air (aerosol washout). Often the best possible mornings.`;

    // Build request options — OpenAI-compatible format works for both Gemini and Groq
    const requestOptions = {
      model: provider.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: AI_TEMPERATURE,
      max_tokens: AI_MAX_TOKENS
    };

    // Both Groq and Gemini (via OpenAI-compat endpoint) support response_format
    requestOptions.response_format = { type: "json_object" };

    const completion = await provider.client.chat.completions.create(requestOptions);

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) throw new Error(`Empty response from ${provider.name}`);

    const cleanText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const aiData = JSON.parse(cleanText);
    console.log(`✅ ${provider.name} AI insights generated (model: ${provider.model})`);

    // If AI returned beach comparison, use it directly.
    // If not (single beach call), generate deterministic comparison.
    let beachComparison = aiData.beachComparison;
    if (!beachComparison && Object.keys(allWeatherData).length > 1) {
      console.warn(`⚠️  ${provider.name} returned no beachComparison — using rule-based fallback`);
      beachComparison = generateBeachComparison(allWeatherData);
    }

    // Validate AI beach comparison — ensure all beach keys are present with reasons.
    // AI sometimes uses wrong keys (e.g. "Marina Beach" instead of "marina") or omits beaches.
    if (beachComparison && beachComparison.beaches) {
      const expectedKeys = Object.keys(allWeatherData);
      const fallbackComp = generateBeachComparison(allWeatherData);
      let patchCount = 0;
      expectedKeys.forEach(key => {
        if (!beachComparison.beaches[key] || !beachComparison.beaches[key].reason) {
          patchCount++;
          // Fill missing beach from deterministic fallback
          beachComparison.beaches[key] = fallbackComp?.beaches?.[key] || {
            suitability: 'Fair',
            reason: `Conditions are mixed at this beach — check the score breakdown for details.`
          };
        }
      });
      if (patchCount > 0) {
        console.warn(`⚠️  Patched ${patchCount}/${expectedKeys.length} beach comparisons from ${provider.name} (missing keys or reasons). AI returned keys: ${Object.keys(beachComparison.beaches || {}).join(', ')}`);
      }
      // Validate todaysBest is a real key
      if (!expectedKeys.includes(beachComparison.todaysBest)) {
        beachComparison.todaysBest = fallbackComp?.todaysBest || expectedKeys[0];
      }
    }

    // Ensure golden hour uses real AccuWeather data, not AI-generated times
    const goldenHourFinal = goldenHour
      ? {
          start: goldenHour.start,
          peak: goldenHour.peak,
          end: goldenHour.end,
          quality: aiData.goldenHour?.quality || (score >= 85 ? 'Excellent' : score >= 70 ? 'Very Good' : score >= 55 ? 'Good' : score >= 40 ? 'Fair' : 'Poor'),
          tip: aiData.goldenHour?.tip || `Arrive by ${goldenHour.start} for the best color window.`
        }
      : aiData.goldenHour || null;

    // Camera settings and atmospheric analysis come from deterministic code
    // — they're formulaic (if cloud>60 → ISO 400-800) and don't benefit from AI
    const dslr = generateDSLRSettings(cloudCover, humidity, visibility, windSpeed, score, breakdown);
    const mobile = generateMobileSettings(cloudCover, humidity, visibility, windSpeed, score, breakdown);
    const atmosphericAnalysis = generateAtmosphericAnalysis(cloudCover, humidity, visibility, windSpeed, breakdown);

    return {
      source: provider.name,
      model: provider.model,
      greeting: aiData.greeting,
      insight: aiData.insight,
      sunriseExperience: aiData.sunriseExperience,
      goldenHour: goldenHourFinal,
      atmosphericAnalysis,
      dslr,
      mobile,
      beachComparison
    };

  } catch (error) {
    console.error(`❌ ${provider.name} AI error:`, error.message);
    throw error;
  }
}

// ==========================================
// RULE-BASED FALLBACK
// Generic — no hardcoded beach names.
// Uses beach context from weatherService config.
// ==========================================

function generateRuleBasedInsights(weatherData, allWeatherData = {}) {
  const { forecast, prediction, beach, goldenHour: realGoldenHour, beachContext } = weatherData;
  const { cloudCover, humidity, visibility, windSpeed, temperature, precipProbability } = forecast;
  const { score, verdict, atmosphericLabels, breakdown } = prediction;

  // Extract v5 breakdown fields
  const highCloud = breakdown?.multiLevelCloud?.high ?? breakdown?.highCloud ?? null;
  const midCloud = breakdown?.multiLevelCloud?.mid ?? breakdown?.midCloud ?? null;
  const lowCloud = breakdown?.multiLevelCloud?.low ?? breakdown?.lowCloud ?? null;
  const aodValue = breakdown?.aod?.value ?? null;
  const pressureTrend = breakdown?.pressureTrend?.value ?? null;
  const isPostRain = breakdown?.isPostRain ?? false;

  // ── Greeting — friendly, direct, like texting a friend ──
  // Enhanced with v5 factor awareness
  let greeting;
  if (score >= 85) {
    const postRainNote = isPostRain ? ' The air is crystal clear after the rain — colors will be extra vivid.' : '';
    greeting = `This morning's looking really good at ${beach} — the kind of morning where the whole sky lights up orange and pink. Set that alarm.${postRainNote}`;
  } else if (score >= 70) {
    const clearAirNote = aodValue != null && aodValue < 0.2 ? ' The air is super clean today, so colors should pop.' : '';
    greeting = `Solid morning ahead at ${beach} — you should see some nice warm colors across the sky. Worth the early wake-up.${clearAirNote}`;
  } else if (score >= 55) {
    greeting = `This morning at ${beach} will be pleasant but nothing dramatic. You'll see some color near the horizon, just don't expect the sky to light up.`;
  } else if (score >= 40) {
    const lowCloudNote = lowCloud != null && lowCloud >= 60 ? ' Low clouds may limit the horizon color.' : '';
    greeting = `Quiet morning ahead at ${beach} — don't expect vivid colors, but there may be some soft warm tones near the horizon.${lowCloudNote} A peaceful time for a beach walk either way.`;
  } else if (score >= 25) {
    greeting = `This morning's sunrise at ${beach} won't have much to show — the sky will be washed out and grey. Not worth the early alarm for the view.`;
  } else {
    greeting = `No real sunrise to see at ${beach} this morning — overcast and grey. Save your sleep.`;
  }

  // ── Insight — plain language anyone understands ──
  // Enhanced with cloud layer, AOD, and pressure awareness
  let insight;
  if (cloudCover >= 30 && cloudCover <= 60) {
    if (humidity <= 55) {
      const layerDetail = highCloud != null && highCloud >= 30 && lowCloud < 40
        ? ' High-altitude clouds are perfectly positioned to catch the earliest pre-sunrise light.'
        : '';
      insight = `There are enough clouds in the sky to catch the sunrise light, and the air is clear enough that the colors will look really vivid — think deep oranges and warm pinks.${layerDetail} One of the better combinations you can get.`;
    } else if (humidity <= 70) {
      insight = `The clouds should pick up some nice warm colors as the sun comes up, though the moisture in the air will soften things a bit. Expect warm amber tones rather than intense fiery reds.`;
    } else {
      insight = `There are clouds in the right spots to catch color, but the heavy moisture in the air will fade everything out. You'll see some warmth near the horizon, but it'll look hazy and soft rather than sharp.`;
    }
  } else if (cloudCover < 30) {
    insight = `The sky is mostly clear, which sounds good but actually means less color — the sunrise needs clouds to bounce light off of. Expect pale yellows and light blues, pleasant but not the colorful show you might be hoping for.`;
  } else if (cloudCover <= 75) {
    const pressureNote = pressureTrend != null && pressureTrend < -2
      ? ' A shifting weather front could break the clouds apart near sunrise — watch for dramatic color through the gaps.'
      : '';
    insight = `The sky is pretty cloudy, so the sunrise will be hit or miss. If the sun finds a gap in the clouds you might get a nice burst of color, but mostly it'll be soft, diffused light.${pressureNote}`;
  } else {
    insight = `The clouds are too thick for any real sunrise color to come through. The sky will just gradually get lighter — from dark grey to lighter grey — without the warm colors you'd normally see.`;
  }

  // ── Sunrise experience (general audience) ──
  const sunriseExperience = generateSunriseExperience(score, cloudCover, humidity, visibility, windSpeed, temperature, beach, breakdown);

  // ── Golden hour — use real data or fallback ──
  const goldenHour = realGoldenHour
    ? {
        start: realGoldenHour.start,
        peak: realGoldenHour.peak,
        end: realGoldenHour.end,
        quality: score >= 85 ? 'Excellent' : score >= 70 ? 'Very Good' : score >= 55 ? 'Good' : score >= 40 ? 'Fair' : 'Poor',
        tip: score >= 55
          ? `Be at the beach by ${realGoldenHour.start} — the richest colors appear 10-15 minutes before the sun clears the horizon.`
          : `Color window will be limited this morning. If you go, aim for around ${realGoldenHour.peak} for whatever light is available.`
      }
    : {
        start: 'N/A',
        peak: 'N/A',
        end: 'N/A',
        quality: score >= 85 ? 'Excellent' : score >= 70 ? 'Very Good' : score >= 55 ? 'Good' : score >= 40 ? 'Fair' : 'Poor',
        tip: 'Sunrise time unavailable — arrive 20 minutes before expected sunrise for best color window.'
      };

  // ── Atmospheric analysis ──
  const atmosphericAnalysis = generateAtmosphericAnalysis(cloudCover, humidity, visibility, windSpeed, breakdown);

  // ── DSLR settings (generic, no beach-specific hardcoding) ──
  const dslr = generateDSLRSettings(cloudCover, humidity, visibility, windSpeed, score, breakdown);

  // ── Mobile settings (generic, no beach-specific hardcoding) ──
  const mobile = generateMobileSettings(cloudCover, humidity, visibility, windSpeed, score, breakdown);

  // ── Beach comparison ──
  const beachComparison = Object.keys(allWeatherData).length > 1
    ? generateBeachComparison(allWeatherData)
    : null;

  return {
    source: 'rules',
    greeting,
    insight,
    sunriseExperience,
    goldenHour,
    atmosphericAnalysis,
    dslr,
    mobile,
    beachComparison
  };
}

// ==========================================
// SUNRISE EXPERIENCE — General audience
// No hardcoded beach names — uses beach param
// ==========================================

function generateSunriseExperience(score, cloudCover, humidity, visibility, windSpeed, temperature, beach, breakdown) {
  // v5.3: Use breakdown for atmosphere-aware descriptions
  const highCloud = breakdown?.multiLevelCloud?.high ?? breakdown?.highCloud ?? null;
  const midCloud = breakdown?.multiLevelCloud?.mid ?? breakdown?.midCloud ?? null;
  const lowCloud = breakdown?.multiLevelCloud?.low ?? breakdown?.lowCloud ?? null;
  const aodValue = breakdown?.aod?.value ?? null;
  const isLowStratus = highCloud != null && (highCloud + (midCloud || 0)) < 15 && lowCloud > 40;
  const hasHighCanvas = highCloud != null && highCloud >= 30;
  const isHazy = aodValue != null && aodValue >= 0.4;
  const isVeryHumid = humidity >= 88;

  let whatYoullSee;
  if (score >= 85) {
    whatYoullSee = `The sky should light up with vivid oranges and reds as sunlight catches ${hasHighCanvas ? 'high clouds acting as a color canvas' : 'scattered clouds'} across the sky. Expect a dramatic build of color starting about 15 minutes before sunrise, peaking as the sun nears the horizon.${aodValue != null && aodValue < 0.2 ? ' Clean air means the colors will be sharp and intense.' : ''}`;
  } else if (score >= 70) {
    if (hasHighCanvas && cloudCover >= 30 && cloudCover <= 60) {
      whatYoullSee = `Good conditions — high clouds at ${highCloud}% will catch pre-sunrise light and glow orange and gold. With ${lowCloud < 30 ? 'a clear horizon, colors will be vivid and well-defined' : 'some low cloud near the horizon, the color may be partially blocked but still visible above'}. A rewarding sunrise to catch.`;
    } else {
      whatYoullSee = `Pleasant warm tones across the sky with ${visibility}km visibility to the horizon. ${cloudCover >= 30 && cloudCover <= 60 ? 'Clouds at ' + cloudCover + '% will reflect some nice color.' : 'Conditions are solid for a satisfying sunrise.'} Expect oranges and golds that build gradually.`;
    }
  } else if (score >= 55) {
    if (isLowStratus) {
      whatYoullSee = `The cloud amount looks decent at ${cloudCover}%, but it's mostly low-level stratus — a flat grey layer rather than the high clouds that produce vivid color. You may see soft peach or salmon tones above the cloud band, but don't expect intense reds or oranges. Any color will be subtle and diffused.`;
    } else if (isHazy) {
      whatYoullSee = `Haze in the air will soften the sunrise — expect washed-out warm tones rather than vivid color. ${hasHighCanvas ? 'There are high clouds to catch light, but the haze will mute the contrast.' : 'Colors will be pastel at best.'} The horizon may look milky rather than crisp.`;
    } else {
      whatYoullSee = `You'll see some color in the sky — likely softer warm tones rather than intense reds and oranges. ${cloudCover > 60 ? 'Heavier cloud cover will filter the light, giving a diffused, gentler glow.' : cloudCover < 30 ? 'Clear skies mean mostly pale yellows and soft blues — pleasant but not dramatic.' : 'Moderate clouds will reflect some color, though it won\'t be a show-stopper.'}`;
    }
  } else if (score >= 40) {
    if (isLowStratus) {
      whatYoullSee = `Low clouds will cover much of the sky, so don't expect vivid color — but you may catch a moment of soft peach or warm grey as the sun brightens behind the cloud layer. The light can be gentle and atmospheric in its own way.`;
    } else if (cloudCover > 70 && isVeryHumid) {
      whatYoullSee = `Heavy cloud at ${cloudCover}% with ${humidity}% humidity means muted tones this morning. The sky will brighten gradually rather than light up with color — but there may be brief moments of soft warmth near the horizon as conditions shift.`;
    } else if (isHazy && isVeryHumid) {
      whatYoullSee = `Haze and humidity will soften things — expect muted, pastel tones rather than vivid color. The horizon may look milky, but there could be a gentle warm glow where the sun rises. Subtle rather than dramatic.`;
    } else {
      whatYoullSee = `The sky will likely be muted this morning — ${cloudCover > 70 ? `heavier cloud at ${cloudCover}% will filter out most vivid color.` : `humidity at ${humidity}% will soften the tones.`} You may still catch some brief warm light near the horizon. A quiet, gentle sunrise.`;
    }
  } else {
    if (cloudCover > 80 && lowCloud != null && lowCloud >= 50) {
      whatYoullSee = `Thick low cloud cover at ${cloudCover}% will block the sun entirely. The sky will shift from dark to overcast grey without any color. ${isVeryHumid ? 'Extreme humidity adds a damp, grey haze to everything.' : ''} The beach will still be dim well after the official sunrise time.`;
    } else {
      whatYoullSee = `The sunrise will likely not be visible this morning. ${isHazy ? 'Heavy haze' : 'Poor atmospheric conditions'} combined with ${cloudCover > 70 ? 'thick cloud cover' : 'high moisture'} will make the horizon indistinguishable. The sky will just gradually get lighter without any warm tones.`;
    }
  }

  // Beach vibes — generic, no hardcoded beach name checks
  let beachVibes;
  if (windSpeed <= 10) {
    beachVibes = `At ${temperature}°C with barely any wind, the beach will feel calm and quiet at dawn. Expect a peaceful setting with minimal foot traffic at this early hour.`;
  } else if (windSpeed <= 20) {
    beachVibes = `${temperature}°C with a light breeze off the water — comfortable for a morning walk. The beach will be peaceful at this hour with the sound of gentle waves.`;
  } else {
    beachVibes = `A noticeable wind at ${windSpeed}km/h will keep things breezy — ${temperature}°C will feel cooler than usual. The sea will be more active with audible wave energy.`;
  }

  // Worth waking up — the key honest recommendation
  let worthWakingUp;
  if (score >= 70) {
    worthWakingUp = 'Yes — conditions are genuinely strong for a beautiful sunrise. This is the kind of morning that rewards the early alarm.';
  } else if (score >= 55) {
    worthWakingUp = 'If you\'re already a morning person or nearby, it\'ll be a pleasant outing. The sunrise will have some color but won\'t be spectacular — go for the full beach experience, not just the sky.';
  } else if (score >= 40) {
    worthWakingUp = 'The sunrise colors will be subtle this morning — don\'t expect a vivid sky. But the beach at dawn is always peaceful, and there may be some soft warm tones worth seeing. If you enjoy the quiet morning atmosphere, it\'s still a nice outing.';
  } else {
    worthWakingUp = 'No, not for the sunrise — it likely won\'t be visible. If you happen to be awake and nearby, a dawn beach walk is still calming, but don\'t set an alarm expecting sky colors.';
  }

  return { whatYoullSee, beachVibes, worthWakingUp };
}

// ==========================================
// ATMOSPHERIC ANALYSIS
// No hardcoded city/season references
// ==========================================

function generateAtmosphericAnalysis(cloudCover, humidity, visibility, windSpeed, breakdown) {
  // v5.3: account for low-stratus — "Optimal" only with elevated canvas
  const highCloud = breakdown?.multiLevelCloud?.high ?? breakdown?.highCloud ?? null;
  const midCloud = breakdown?.multiLevelCloud?.mid ?? breakdown?.midCloud ?? null;
  const lowCloud = breakdown?.multiLevelCloud?.low ?? breakdown?.lowCloud ?? null;
  const isLowStratus = highCloud != null && (highCloud + (midCloud || 0)) < 15 && lowCloud > 40;
  const cloudRating = (cloudCover >= 30 && cloudCover <= 60)
    ? (isLowStratus ? 'Low Stratus' : 'Optimal')
    : cloudCover < 30 ? 'Too Clear' : cloudCover <= 75 ? 'Partly Overcast' : 'Overcast';

  // Dynamic month reference
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const currentMonth = monthNames[new Date().getMonth()];

  // v5 fields already extracted above (highCloud, midCloud, lowCloud)
  const aodValue = breakdown?.aod?.value ?? null;
  const pressureTrend = breakdown?.pressureTrend?.value ?? null;
  const isPostRain = breakdown?.isPostRain ?? false;

  const analysis = {
    cloudCover: {
      value: cloudCover,
      rating: cloudRating,
      impact: cloudCover >= 30 && cloudCover <= 60
        ? (isLowStratus
          ? `At ${cloudCover}%, the cloud amount looks ideal on paper — but it's all low stratus (${lowCloud}% below 2km). Low stratus acts as a flat grey blanket, not a reflective canvas. Without elevated clouds, there's little surface to catch the pre-sunrise color from below the horizon.`
          : `At ${cloudCover}%, clouds sit in the ideal range — they act as a reflective canvas, catching orange and red light from below the horizon. This is the range that produces the most colorful sunrises.`)
        : cloudCover < 30
        ? `With only ${cloudCover}% cloud cover, there's very little canvas for the sun's colors to reflect off. The sky will be mostly pale yellows and blues — clean but lacking the dramatic color that clouds create.`
        : cloudCover <= 75
        ? `At ${cloudCover}%, cloud cover is heavier than ideal. Some gaps may let color through, but much of the light will be blocked or diffused. Expect patchy, muted tones rather than a full color display.`
        : `At ${cloudCover}%, dense cloud cover will block most direct sunlight. The sunrise will likely not produce visible color — the sky will brighten gradually from dark grey to lighter grey without the warm tones of a clear sunrise.`
    },
    // v5 NEW: Cloud structure (multi-level analysis)
    cloudStructure: highCloud != null ? {
      high: highCloud,
      mid: midCloud,
      low: lowCloud,
      rating: highCloud >= 30 && lowCloud < 40 ? 'Ideal' : highCloud >= 30 && lowCloud >= 40 ? 'Mixed' : lowCloud >= 75 ? 'Blocked' : lowCloud >= 50 ? 'Heavy Low' : 'Limited',
      impact: highCloud >= 30 && lowCloud < 40
        ? `High clouds at ${highCloud}% provide an excellent color canvas — thin cirrus catches the earliest pre-sunrise light and glows vivid orange and red while the horizon stays clear. ${midCloud < 30 ? 'With minimal mid-level clouds, the view is unobstructed.' : `Mid-level clouds at ${midCloud}% add additional layers of color.`}`
        : highCloud >= 30 && lowCloud >= 40
        ? `High clouds are present at ${highCloud}% (good for color), but low clouds at ${lowCloud}% will partially block the horizon. You may see vivid colors above with a grey band at the horizon line.`
        : lowCloud >= 75
        ? `Low clouds at ${lowCloud}% form a thick blanket below 2km altitude, blocking the horizon almost entirely. Even with high clouds above, the sunrise will struggle to show through this barrier.`
        : lowCloud >= 50
        ? `Low clouds at ${lowCloud}% are heavy enough to reduce horizon visibility. Limited high cloud coverage at ${highCloud}% means less color canvas above.`
        : `Minimal cloud structure overall — high clouds at ${highCloud}% don't provide much canvas for color. ${midCloud >= 50 ? `Mid-level clouds at ${midCloud}% offer some canvas.` : 'The sky will be relatively plain.'}`
    } : null,
    humidity: {
      value: humidity,
      rating: humidity <= 55 ? 'Excellent' : humidity <= 65 ? 'Very Good' : humidity <= 75 ? 'Good' : humidity <= 82 ? 'Decent' : humidity <= 88 ? 'Normal' : humidity <= 93 ? 'High' : 'Very High',
      impact: humidity <= 55
        ? `At ${humidity}% humidity, the air is dry — colors will appear crisp, vivid and well-saturated. Low humidity is one of the key ingredients behind the best sunrise conditions.`
        : humidity <= 70
        ? `At ${humidity}% humidity, atmospheric moisture will slightly soften and diffuse the light. Colors will be present but noticeably less saturated than on drier mornings — think warm pastels rather than vivid fire.`
        : humidity <= 82
        ? `At ${humidity}% humidity, moderate moisture will soften colors and add a warm haze to the horizon. Colours will be muted but still visible.`
        : humidity <= 90
        ? `At ${humidity}% humidity, typical coastal dawn moisture is scattering light. Colours will appear softened — warm tones visible but not vivid. The horizon may look hazy.`
        : `At ${humidity}% humidity, significant moisture in the air will scatter and absorb light. Colors will appear visibly washed out and pale. The horizon will look milky rather than sharp.`
    },
    // v5 NEW: Air clarity / AOD
    airClarity: aodValue != null ? {
      value: aodValue,
      rating: aodValue < 0.1 ? 'Crystal Clear' : aodValue < 0.2 ? 'Very Clean' : aodValue < 0.4 ? 'Clean' : aodValue < 0.7 ? 'Hazy' : aodValue < 1.0 ? 'Very Hazy' : 'Polluted',
      impact: aodValue < 0.1
        ? `Aerosol levels are exceptionally low (${aodValue.toFixed(2)}) — this is post-rain or rare crystal-clear air. Colors will be the most vivid and saturated possible, with a sharp, contrasty horizon. These are the mornings that produce the best photos.`
        : aodValue < 0.2
        ? `Very clean air (AOD ${aodValue.toFixed(2)}) — minimal particles means sunrise colors will look vivid and well-saturated. The horizon will appear sharp with good contrast between sky and sea.`
        : aodValue < 0.4
        ? `Mild aerosol presence (AOD ${aodValue.toFixed(2)}) — colors will be slightly softened but still vibrant. A thin warm haze near the horizon can actually add depth to photographs.`
        : aodValue < 0.7
        ? `Noticeable haze in the air (AOD ${aodValue.toFixed(2)}) — sunrise colors will be visibly muted and diffused. The horizon will appear soft and washed rather than sharp. Reds and oranges will fade to dull amber.`
        : `Heavy aerosol load (AOD ${aodValue.toFixed(2)}) — significant dust or pollution in the air will severely mute all colors. The sunrise will appear as a pale disc behind a grey-brown haze. ${isPostRain ? 'This is unusual after rain — check if conditions improve by morning.' : 'This is typical of dusty or high-pollution days.'}`
    } : null,
    // v5 NEW: Pressure pattern
    pressurePattern: pressureTrend != null ? {
      value: pressureTrend,
      rating: pressureTrend < -5 ? 'Storm Risk' : pressureTrend < -2 ? 'Clearing Front' : pressureTrend < -0.5 ? 'Slight Fall' : pressureTrend <= 0.5 ? 'Stable' : pressureTrend <= 2 ? 'Rising' : 'Strong Rise',
      impact: pressureTrend < -5
        ? `Pressure is dropping rapidly (${pressureTrend.toFixed(1)} hPa over 6 hours) — this signals a significant weather system approaching. Expect heavy cloud, possible rain, and poor sunrise visibility. However, if skies clear near dawn, the dramatic cloud formations can produce exceptional — though risky — sunrise conditions.`
        : pressureTrend < -2
        ? `Falling pressure (${pressureTrend.toFixed(1)} hPa over 6 hours) signals an approaching frontal system — and this is actually the BEST setup for dramatic sunrises. As clouds break up ahead of the front, sunlight pierces through gaps creating vivid color bands against darker cloud backgrounds. High-contrast, dramatic skies.`
        : pressureTrend < -0.5
        ? `Slight pressure drop (${pressureTrend.toFixed(1)} hPa) suggests mild atmospheric instability — enough to create some interesting cloud textures without the risk of heavy weather. The sky may have more character than a stable-pressure morning.`
        : pressureTrend <= 0.5
        ? `Pressure is stable (${pressureTrend >= 0 ? '+' : ''}${pressureTrend.toFixed(1)} hPa) — indicating high pressure dominance. Conditions are predictable and calm, but the sky may lack the dramatic cloud dynamics that pressure changes create. Solid but not spectacular.`
        : `Rising pressure (+${pressureTrend.toFixed(1)} hPa) indicates high pressure building — clear, stable conditions. The sky will be predictable and calm, good for consistent gentle color but unlikely to produce dramatic cloud formations.`
    } : null,
    visibility: {
      value: visibility,
      rating: visibility >= 18 ? 'Exceptional' : visibility >= 12 ? 'Excellent' : visibility >= 8 ? 'Good' : visibility >= 5 ? 'Fair' : 'Poor',
      impact: visibility >= 10
        ? `${visibility}km visibility means excellent atmospheric clarity — the horizon will be sharp, and colors will have strong contrast and intensity.`
        : visibility >= 8
        ? `${visibility}km visibility provides good clarity with slight atmospheric haze, which can add a warm glow to the horizon.`
        : `${visibility}km visibility means noticeable haze or particles in the air, softening the horizon and reducing color contrast. The sunrise will appear muted.`
    },
    wind: {
      value: windSpeed,
      rating: windSpeed <= 10 ? 'Calm' : windSpeed <= 20 ? 'Light' : windSpeed <= 30 ? 'Moderate' : 'Strong',
      impact: windSpeed <= 10
        ? `Calm at ${windSpeed}km/h — cloud formations will hold their shape, and the sea surface will be relatively flat, potentially creating reflections on wet sand.`
        : windSpeed <= 20
        ? `Light wind at ${windSpeed}km/h will gently move cloud formations. The beach will feel pleasantly breezy at dawn.`
        : `Wind at ${windSpeed}km/h will keep clouds moving and the sea choppy. You'll feel the breeze, and sand may be kicked up occasionally.`
    },
    overallPattern: `${currentMonth} conditions: ${isPostRain ? 'Post-rain clarity is the highlight today — the air has been washed clean, creating ideal conditions for vivid colors.' : humidity <= 55 && visibility >= 10 ? 'Dry air and good visibility are working in your favor today.' : humidity > 70 ? 'Elevated humidity is limiting what could otherwise be stronger sunrise conditions.' : 'Conditions today are mixed — some factors are favorable while others will limit the sunrise quality.'}`
  };

  return analysis;
}

// ==========================================
// DSLR SETTINGS — generic, condition-based
// No beach-specific hardcoding
// ==========================================

function generateDSLRSettings(cloudCover, humidity, visibility, windSpeed, score, breakdown) {
  const iso = cloudCover > 60 ? '400-800' : cloudCover > 30 ? '200-400' : '100-200';
  const shutter = cloudCover < 30 ? '1/125–1/250s' : cloudCover < 60 ? '1/60–1/125s' : '1/30–1/60s';
  const aperture = 'f/8–f/11';
  const wb = cloudCover < 30 ? '5500K' : '6000–6500K';

  return {
    cameraSettings: {
      iso,
      isoWhy: cloudCover > 60
        ? 'Higher ISO compensates for reduced light through cloud cover. ISO 400-800 keeps shutter fast enough to avoid camera shake without needing a tripod for every shot.'
        : 'ISO 200-400 balances sensitivity for dawn\'s low light while keeping digital noise minimal. RAW format will let you push exposure in post if needed.',
      shutterSpeed: shutter,
      shutterWhy: cloudCover < 30
        ? 'Faster shutter at 1/125s+ freezes crisp cloud edges and reflections. Clear skies provide enough light for confident use of faster speeds.'
        : 'Medium shutter speed captures slight cloud movement naturally. For silky water effects, use a neutral density filter and extend to 10-30 seconds.',
      aperture,
      apertureWhy: 'f/8-f/11 is the optical sweet spot for most lenses — sharp from foreground to horizon without diffraction softening at f/16+.',
      whiteBalance: wb,
      wbWhy: cloudCover < 30
        ? '5500K (daylight) preserves natural warm tones without adding artificial warmth that looks fake on clear skies.'
        : '6000-6500K adds slight warmth to enhance the orange-red tones in cloudy dawn light, making colors feel more intentional in-camera.'
    },
    proTips: [
      'Shoot in RAW — dawn\'s extreme dynamic range (bright sky vs dark foreground) needs the 12+ stops of latitude that RAW provides. JPEG will blow highlights or crush shadows.',
      cloudCover >= 30 && cloudCover <= 60
        ? 'Bracket exposures: shoot 3 frames at -1, 0, +1 EV and blend in post. The cloud texture in highlights will benefit from this.'
        : cloudCover < 30
        ? 'Use a 2-stop graduated ND filter to balance the bright sky with the darker foreground — especially effective at low sun angles.'
        : score < 40
        ? 'On overcast mornings like this, even exposure across the frame makes it a good day to practice composition and focus technique without worrying about blown highlights.'
        : 'Focus on composition over exposure when clouds are heavy — HDR blending in post can recover shadow and highlight detail.',
      windSpeed <= 15
        ? 'Wind is calm — perfect for 10-30 second exposures with an ND filter to smooth water into a glass-like surface.'
        : 'Bracket focus as well as exposure — shoot at different focal distances to ensure both foreground elements and the horizon are tack sharp.',
      // v5: AOD-based post-processing tip
      ...(breakdown?.aod?.value != null ? [
        breakdown.aod.value < 0.2
          ? 'Air clarity is exceptional — minimal post-processing needed. Boost vibrance +10-15 and clarity +10 to bring out the natural saturation.'
          : breakdown.aod.value >= 0.7
          ? 'Heavy haze today — use a dehaze filter aggressively in post (+40-60). A polarizing filter on-camera can cut through some of the atmospheric scatter.'
          : breakdown.aod.value >= 0.4
          ? 'Moderate haze in the air — apply +20-30 dehaze in Lightroom/Camera Raw. A light CPL filter can help cut atmospheric scatter.'
          : 'Clean air with slight haze near the horizon — minimal dehaze (+10-15) in post will sharpen the horizon line without making the sky look artificial.'
      ] : [])
    ],
    compositionTips: [
      'Use a prominent foreground element to anchor the composition and create depth.',
      'Place the horizon in the lower third to emphasize whatever sky conditions are present.',
      'Look for wet sand or tidal pools to reflect available light and add visual interest.'
    ]
  };
}

// ==========================================
// MOBILE SETTINGS — generic, condition-based
// No beach-specific hardcoding
// ==========================================

function generateMobileSettings(cloudCover, humidity, visibility, windSpeed, score, breakdown) {
  const nightMode = cloudCover > 70 ? 'On' : 'Off';
  const hdr = cloudCover > 20 ? 'Auto' : 'On';
  const exposure = cloudCover > 60 ? '+0.3' : cloudCover > 30 ? '0.0' : '-0.3';

  return {
    phoneSettings: {
      nightMode,
      nightModeWhy: cloudCover > 70
        ? 'Night Mode ON — overcast dawn is genuinely dark. Multi-frame stacking captures more detail without grain.'
        : 'Night Mode OFF — it over-brightens and over-processes dawn\'s natural warm tones. The sky will look washed out and artificial.',
      hdr,
      hdrWhy: 'HDR AUTO lets your phone blend multiple exposures when needed. At dawn, the sky is much brighter than the foreground — HDR bridges this gap automatically.',
      exposure,
      exposureWhy: cloudCover < 30
        ? 'Dial exposure down -0.3 to protect sky color. Clear dawn skies are bright enough that slight underexposure actually produces richer, deeper tones.'
        : cloudCover > 60
        ? 'Slight +0.3 lifts the foreground without fully blowing the sky. Overcast light narrows the dynamic range, so this is safe.'
        : 'Neutral exposure works here — moderate cloud cover balances sky vs foreground contrast naturally.',
      additionalSetting: 'Gridlines: ON (Rule of Thirds)',
      additionalWhy: 'Place the horizon on the lower third line for sky-dominant shots, or upper third for foreground-dominant. This single habit dramatically improves composition.'
    },
    proTips: [
      windSpeed <= 15
        ? 'Use the 3-second self-timer after tapping to focus — eliminates hand-shake for the crispest possible image.'
        : `Wind at ${windSpeed}km/h creates subtle vibration. Brace your elbows against your body and exhale before shooting, or lean against something fixed.`,
      score >= 55
        ? 'Best moment: the 3-5 minutes as the sun disk clears the horizon — use burst mode during this window.'
        : 'Timing is less critical on overcast mornings — the light changes gradually rather than in a brief dramatic window. Take your time with composition.',
      humidity <= 55
        ? 'Minimal post-processing needed — just bump clarity +10 and vibrance +15 in Snapseed or Lightroom Mobile.'
        : 'In Snapseed: reduce haze with +Clarity, pull back +Warmth to compensate for humidity\'s grey cast. Lift Highlights slightly to recover what sky color exists.',
      // v5: AOD-based mobile post-processing
      ...(breakdown?.aod?.value != null && breakdown.aod.value >= 0.4 ? [
        'Hazy air today — in Snapseed, use Structure +30 and HDR Scape to cut through the atmospheric haze. In Lightroom Mobile, try Dehaze +30-50.'
      ] : [])
    ],
    compositionTips: [
      'Tap to lock focus and exposure on a mid-tone element, not the bright sky.',
      'Try landscape orientation to maximize the horizon and sky.',
      'Find reflections in wet sand or tidal pools — they add interest regardless of sky conditions.'
    ]
  };
}

// ==========================================
// BEACH COMPARISON — deterministic scoring
// Uses allWeatherData, no hardcoded beach names
// ==========================================

function generateBeachComparison(allWeatherData) {
  const beachKeys = Object.keys(allWeatherData);
  if (beachKeys.length < 2) return null;

  function scoreBeach(key) {
    const d = allWeatherData[key];
    if (!d || !d.forecast) return { score: 0 };
    const c = d.forecast;
    const isCalm = (c.windSpeed || 0) <= 15;
    const isOptCloud = (c.cloudCover || 0) >= 30 && (c.cloudCover || 0) <= 60;
    const isGoodVis = (c.visibility || 0) >= 8;
    const isLowHumid = (c.humidity || 0) <= 55;

    let score = 50;
    if (isOptCloud) score += 20;
    else if ((c.cloudCover || 0) < 30 || (c.cloudCover || 0) > 75) score -= 10;
    if (isGoodVis) score += 15;
    if (isCalm) score += 10;
    if (isLowHumid) score += 5;
    return { score, isCalm, isOptCloud, isGoodVis, isLowHumid };
  }

  function suitLabel(score) {
    if (score >= 80) return 'Best';
    if (score >= 65) return 'Good';
    if (score >= 45) return 'Fair';
    return 'Poor';
  }

  function genericReason(key, scoreData) {
    const d = allWeatherData[key];
    const beachName = d?.beach || key;
    const context = d?.beachContext || '';

    // Extract a short identifying feature from beachContext
    let feature = '';
    if (context.includes('lighthouse')) feature = 'the lighthouse and fishing boats';
    else if (context.includes('Karl Schmidt')) feature = 'the Karl Schmidt Memorial and calm waters';
    else if (context.includes('rock formations')) feature = 'the rock formations and tidal pools';
    else if (context.includes('breakwater')) feature = 'the breakwater rocks and tidal pools';
    else if (context.includes('surf')) feature = 'the surf and cliffs';

    if (scoreData.score < 40) {
      return feature
        ? `Conditions are poor at ${beachName} — limited sunrise visibility expected, though ${feature} still make for a scenic walk.`
        : `Conditions are poor at ${beachName} — limited sunrise visibility expected.`;
    }

    const strengths = [];
    if (scoreData.isOptCloud) strengths.push('optimal cloud coverage');
    if (scoreData.isGoodVis) strengths.push('good visibility');
    if (scoreData.isCalm) strengths.push('calm wind');
    if (scoreData.isLowHumid) strengths.push('low humidity');

    const weatherPart = strengths.length > 0
      ? `benefits from ${strengths.join(', ')}`
      : 'has mixed conditions';

    // Combine weather + beach character for unique descriptions
    if (feature) {
      return `${beachName} ${weatherPart} this morning — ${feature} provide strong foreground interest for the conditions.`;
    }
    return `${beachName} ${weatherPart} this morning.`;
  }

  const scores = {};
  beachKeys.forEach(k => { scores[k] = scoreBeach(k); });

  // Find best beach
  let bestBeach = beachKeys[0];
  let bestScore = -1;
  Object.entries(scores).forEach(([k, v]) => {
    if (v.score > bestScore) { bestScore = v.score; bestBeach = k; }
  });

  const beaches = {};
  beachKeys.forEach(k => {
    beaches[k] = {
      suitability: suitLabel(scores[k].score),
      reason: genericReason(k, scores[k])
    };
  });

  // If ALL beaches are poor, acknowledge it honestly
  const allPoor = Object.values(scores).every(s => s.score < 40);
  const compReason = allPoor
    ? 'Conditions are poor across all beaches this morning — none are particularly recommended for sunrise viewing. If you still want to go, choose the closest one for convenience.'
    : genericReason(bestBeach, scores[bestBeach]);

  return {
    todaysBest: bestBeach,
    reason: compReason,
    beaches
  };
}

module.exports = { generatePhotographyInsights };