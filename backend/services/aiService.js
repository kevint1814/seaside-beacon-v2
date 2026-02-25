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
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || process.env.GROQ_MAX_TOKENS) || 3000;
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
      toneInstruction = 'Exceptional morning. Be genuinely excited. Describe the full unfolding scene: the dark horizon glowing orange, color spreading fast across the clouds, the sun breaking the horizon as a sharp golden-white disc too bright to stare at, a shimmering golden trail stretching across the water toward the viewer, long shadows on the sand, fishing boats or landmarks silhouetted against the glow. This is the kind of morning where you stop walking and just watch. Use the CONTEXT for beach-specific details.';
    } else if (score >= 70) {
      toneInstruction = 'Good morning. Confident and warm. Paint the scene: warm amber light building on the horizon, the sun appearing as a bright golden disc, orange and pink tones spreading through the clouds, a clear golden reflection path on the water. Mention how the light hits the beach — the sand turning warm gold, the water catching the color. Worth setting the alarm for.';
    } else if (score >= 55) {
      toneInstruction = 'Decent morning — pleasant, not spectacular. Describe specifically: Will the sun appear as a warm amber disc through light haze, or be partially hidden by cloud? Will there be soft peach or orange tones near the horizon? The water will likely have a gentle warm glow rather than a sharp golden trail. Mention the quiet beach at that hour — waves, cool breeze, few people around. Set honest expectations but make the scene feel real.';
    } else if (score >= 40) {
      toneInstruction = 'Mixed morning. Honest but not dismissive. Describe the actual scene: Will the sun punch through cloud gaps as a soft orange disc? Will there be warm grey with hints of peach at the horizon? The water may have a subtle glow even on grey mornings. Acknowledge what IS there — the peaceful empty beach, the sound of waves, cool air, soft early light even without vivid color. The experience of being at the beach at dawn matters, even when the sky doesn\'t perform.';
    } else if (score >= 25) {
      toneInstruction = 'Poor morning for color. Be straight: the sky will shift from dark to flat grey, the horizon just gradually brightening. No defined sun disc moment, no warm colors — just the world slowly getting lighter. But describe the beach itself — the quiet, the waves, the cool pre-dawn air. A walk is still pleasant even without the sky show.';
    } else {
      toneInstruction = 'Unfavorable. The sunrise won\'t be visible — thick grey from horizon to horizon, like someone slowly turning up a dimmer switch. No sun disc, no warm tones. Be brief about the sky (there\'s nothing to describe). If they still want to go, mention the beach at dawn is still calm and quiet — just don\'t expect to see a sunrise.';
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

    // ── v5.3: DYNAMIC AI GUARDRAILS ──
    // Build CONSTRAINTS block from computed weather facts so AI can't contradict displayed data.
    // These mirror the same conditions used by rule-based fallback logic.
    const constraints = [];

    // Cloud cover guardrails
    if (cloudCover >= 90) {
      constraints.push('Cloud cover is >= 90%. Do NOT use words like "scattered", "broken", "gaps in the clouds", "intermittent", or "partly". The sky is heavily overcast.');
    } else if (cloudCover >= 75) {
      constraints.push('Cloud cover is >= 75%. Do NOT say "partly cloudy" or "scattered clouds". It is mostly overcast — use "overcast", "heavy cloud", "thick cloud layer".');
    } else if (cloudCover <= 15) {
      constraints.push('Cloud cover is <= 15%. Do NOT mention "cloud canvas" or "clouds catching color". The sky is mostly clear — focus on the horizon glow and sun disc.');
    }

    // Low cloud blocker guardrails
    if (lowCloud != null && lowCloud >= 70 && (highCloud == null || highCloud < 20)) {
      constraints.push(`Low cloud is ${lowCloud}% with minimal high cloud. Do NOT describe vivid colors "across the sky" or "painting the clouds". Low stratus blocks the horizon — at best the sun punches through gaps as a muted disc.`);
    }
    if (lowCloud != null && lowCloud >= 50 && lowCloud < 70) {
      constraints.push(`Low cloud is ${lowCloud}%. The horizon will be partially blocked. If you mention color, specify it may only appear in gaps or above the low cloud band.`);
    }

    // Fog / low visibility guardrails
    if (visibility < 2) {
      constraints.push('Visibility is under 2 km — foggy conditions. Do NOT describe "clear views", "sharp sun disc", or "vivid colors". Visibility is very poor.');
    } else if (visibility < 5) {
      constraints.push('Visibility is under 5 km — hazy/misty. Do NOT say "crystal clear" or "sharp". The air is thick with haze or mist.');
    }

    // AOD guardrails
    if (aodValue != null && aodValue >= 0.7) {
      constraints.push(`AOD is ${aodValue.toFixed(2)} — very hazy/polluted air. Do NOT describe "vivid" or "saturated" or "intense" colors. The air quality is poor and colors will be heavily muted.`);
    } else if (aodValue != null && aodValue < 0.10) {
      constraints.push('AOD is very low — exceptionally clean air. You CAN describe sharp, vivid, saturated colors if cloud conditions support it.');
    }

    // Precipitation guardrails
    if (precipProbability >= 70) {
      constraints.push(`Precipitation probability is ${precipProbability}%. There is a HIGH chance of rain at sunrise. Do NOT describe a clear or colorful sunrise without heavily caveating rain likelihood.`);
    } else if (precipProbability >= 40) {
      constraints.push(`Precipitation probability is ${precipProbability}%. Rain is possible — mention this risk when describing the sunrise.`);
    }

    // Humidity guardrails
    if (humidity >= 95) {
      constraints.push('Humidity is >= 95% — near-saturation. Colors will be heavily washed out. Do NOT describe "crisp" or "vivid" colors.');
    }

    // High cloud canvas guardrails
    if (highCloud != null && highCloud >= 40 && lowCloud != null && lowCloud < 30) {
      constraints.push('High cloud coverage is strong with clear horizon — this is a genuine color-canvas scenario. You CAN be enthusiastic about cloud-lit colors.');
    }

    // Post-rain guardrails
    if (isPostRain) {
      constraints.push('Post-rain conditions confirmed. Air is exceptionally clean. You SHOULD mention the unusual clarity.');
    }

    const constraintsBlock = constraints.length > 0
      ? `\nCONSTRAINTS (you MUST follow these — they are computed from actual data):\n${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`
      : '';

    const prompt = `Score: ${score}/100 (${verdict}). ${currentMonth}.

TONE: ${toneInstruction}

CONDITIONS: Cloud ${cloudCover}%, Humidity ${humidity}%, Visibility ${visibility}km, Wind ${windSpeed}km/h, ${temperature}°C, Precip ${precipProbability}%, ${weatherDescription}.
CLOUD LAYERS: ${highCloud != null ? `High ${highCloud}% Mid ${midCloud}% Low ${lowCloud}%` : 'N/A'}.
AIR CLARITY (AOD): ${aodValue != null ? `${aodValue.toFixed(2)} (${aodLabel})` : 'N/A'}.
PRESSURE TREND: ${pressureTrend != null ? `Δ${pressureTrend >= 0 ? '+' : ''}${pressureTrend}hPa (${pressureLabel})` : 'N/A'}.
POST-RAIN: ${isPostRain ? 'Yes — recent rain washed the air clean' : 'No'}.
${constraintsBlock}
${goldenHourInstruction}

BEACH: ${beach}
CONTEXT: ${context}
${comparisonContext}

WRITING STYLE:
- Talk like a friend texting about this morning's sunrise. Say "this morning" or "today", NEVER "tomorrow".
- Plain words: "orange and pink streaks", "grey and flat", "soft warm glow". No weather numbers.
- Bad days: honest and brief. Good days: genuinely excited.
- NEVER use: "spectacular", "breathtaking", "nature's canvas", "painted sky", "serene", "magical", "treat yourself", "every sunrise is unique."
- Keep greeting and insight concise (1-2 sentences). The sunriseExperience fields can be a bit more descriptive (2-3 sentences each).
- Beach comparisons: keep each beach reason to 1 sentence.

JSON response:
{
  "greeting": "One friendly sentence. Match tone to score. Say 'this morning' not 'tomorrow'.",
  "insight": "2 sentences. What the sky will look like and feel like. Plain language.",
  "sunriseExperience": {
    "whatYoullSee": "2-3 sentences painting a picture. What colors, where in the sky, how it builds as the sun comes up. No technical terms.",
    "beachVibes": "2 sentences about what ${beach} feels like at dawn — temperature, breeze, crowds, sounds. Use specific details from CONTEXT.",
    "worthWakingUp": "${score >= 70 ? 'Yes — 1-2 enthusiastic sentences about why' : score >= 40 ? 'Maybe — 2 sentences, honest about what you will and won\'t get. Don\'t say it\'s not worth it.' : 'Probably not for sunrise — but 1-2 sentences about whether the beach walk itself is nice'}"
  },
  "photographyBrief": {
    "lightQuality": "2-3 sentences for photographers about the quality and character of light this morning. Describe: direction, warmth, harshness vs softness, how it changes during the window. Mention if light is flat, directional, golden, diffused, or dramatic. Be specific — photographers need to plan their approach.",
    "bestShots": "2-3 sentences suggesting specific shot types that work best in these conditions. Examples: silhouettes against the glow, reflections in wet sand, long exposure waves, moody B&W, wide golden landscapes, close-up textures in soft light, sun-star through clouds. Be creative and specific to ${beach}'s features.",
    "colorPalette": "1-2 sentences describing the exact color palette photographers should expect — warm oranges and golds, muted pastels, cool greys, vivid reds, etc. This helps them plan white balance and post-processing.",
    "challenges": "1-2 sentences about photography challenges this morning and how to handle them — e.g. high dynamic range, lens flare from clear sun, flat light needing creative composition, wind affecting stability, haze reducing contrast."
  },
  "goldenHour": {
    "quality": "${score >= 85 ? 'Excellent' : score >= 70 ? 'Very Good' : score >= 55 ? 'Good' : score >= 40 ? 'Fair' : 'Poor'}",
    "tip": "One sentence — when to arrive and what to look for."
  },
  "beachComparison": ${beachKeys.length > 1 ? `{
    "todaysBest": "MUST be one of: ${beachKeys.join(', ')}",
    "reason": "1 sentence why this beach wins today.",
    "beaches": {
      ${beachKeys.map(k => `"${k}": {
        "suitability": "Best/Good/Fair/Poor",
        "reason": "1 sentence. What's different about this beach for today's conditions."
      }`).join(',\n      ')}
    }
  }` : 'null'}
}

Beach keys MUST be exactly: ${beachKeys.length > 1 ? beachKeys.join(', ') : 'N/A'}. NOT full names like "Marina Beach".`;


    const systemPrompt = `You are Beacon — a friendly sunrise guide for Chennai beaches. Talk like a friend who was just at the beach describing what someone will see THIS morning. Simple words, no jargon. Excited when good, honest when bad. BE CONCISE — keep every field short. Always respond with valid JSON only.

KEY SCIENCE (inform your descriptions, NEVER use these terms directly):
- High clouds (cirrus) = color canvas, catch pre-sunrise light → vivid orange/red. More high cloud = more color.
- Low clouds (stratus) = horizon blockers → grey wall. BUT sun often punches through gaps as a bright disc with golden water reflection when low cloud is 40-80%.
- Low AOD = crystal clear air → vivid, saturated colors. High AOD = hazy → washed out, muted, milky.
- Falling pressure (2-5 hPa) = clearing front → dramatic cloud breakup. >5 hPa = storm.
- Post-rain = exceptionally clear air → often the best mornings.

DESCRIBE AS A PERSON STANDING ON THE BEACH:
You are painting a scene for someone about to walk onto the sand. Describe what unfolds in front of their eyes:
- THE SKY: What they see when they look east over the water — the colors, the cloud shapes, how it changes as time passes (dark → first glow → color spreading → sun appearing).
- THE SUN: How the sun disc itself appears — sharp bright disc casting shadows (clear), soft orange ball you can briefly look at (haze), hidden behind grey/bright spot behind cloud (overcast). Don't skip this.
- THE WATER: The reflection — a sharp golden trail on clear mornings, a broad warm glow on hazy ones, nothing on overcast ones.
- THE BEACH: Use the CONTEXT provided — mention specific landmarks (lighthouse, fishing boats, rocks, temple) and how the light interacts with them. Wet sand reflecting color, silhouettes against the glow, shadows stretching across the beach.
- THE FEEL: Not just visual — the cool sand underfoot, the salt breeze, the sound of waves, the warmth when first light hits your face. Weave 1-2 sensory details naturally into descriptions.
- THE SEQUENCE: Sunrise is not a static image. Describe it unfolding: "first you'll see... then as the sun... by the time it clears the horizon..."

NEVER describe weather data. Describe what a PERSON SEES and FEELS.`;

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

    const finishReason = completion.choices[0]?.finish_reason;
    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) throw new Error(`Empty response from ${provider.name}`);

    // Detect truncated responses (hit max_tokens limit)
    if (finishReason === 'length') {
      console.warn(`⚠️  ${provider.name} response truncated (hit max_tokens=${AI_MAX_TOKENS}). First 200 chars: ${responseText.substring(0, 200)}`);
      throw new Error(`Response truncated (finish_reason=length) — increase AI_MAX_TOKENS`);
    }

    const cleanText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let aiData;
    try {
      aiData = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error(`❌ ${provider.name} JSON parse failed. finish_reason=${finishReason}. First 300 chars: ${cleanText.substring(0, 300)}`);
      throw parseErr;
    }
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
      photographyBrief: aiData.photographyBrief || null,
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

  // ── Insight — what you'll experience, not weather data ──
  let insight;
  if (cloudCover >= 30 && cloudCover <= 60) {
    if (humidity <= 55) {
      insight = `The kind of morning where you stop walking and stare — the sky will light up vivid orange and deep pink, and the colors will look sharp and saturated because the air is so clean.${highCloud != null && highCloud >= 30 && lowCloud < 40 ? ' The clouds are high up where they catch the best light.' : ''} One of those mornings you remember.`;
    } else if (humidity <= 70) {
      insight = `You'll see warm amber and soft orange tones as the sun comes up — nice colors, just slightly softened by the moisture in the air. The kind of morning that looks beautiful in person even if it's not the most vivid sunrise possible.`;
    } else {
      insight = `There'll be some warm tones near the horizon, but the heavy moisture in the air will soften and fade everything. More of a hazy warm glow than sharp, vivid colors. Still pleasant to watch, just don't expect the sky to pop.`;
    }
  } else if (cloudCover < 30) {
    insight = `Mostly clear sky this morning — which means the sunrise will be a clean golden glow at the horizon rather than a colorful sky-wide show. Without clouds to catch the light, expect pale yellows and soft blues. Pretty, but quiet.`;
  } else if (cloudCover <= 75) {
    const pressureNote = pressureTrend != null && pressureTrend < -2
      ? ' The clouds may be breaking apart — watch for vivid color bursting through the gaps.'
      : '';
    insight = `Cloudy sky, so it's a bit of a gamble — if the sun finds a gap near the horizon, you could get a nice moment of warm color breaking through. Otherwise it'll be soft, diffused light.${pressureNote}`;
  } else {
    insight = `Thick cloud cover this morning — the sky will just gradually brighten from dark grey to lighter grey. No warm colors breaking through. The beach will be quiet and moody in that flat early light.`;
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

  // ── Photography brief (photographer-specific insights) ──
  const photographyBrief = generatePhotographyBrief(score, cloudCover, humidity, visibility, windSpeed, beach, breakdown);

  return {
    source: 'rules',
    greeting,
    insight,
    sunriseExperience,
    photographyBrief,
    goldenHour,
    atmosphericAnalysis,
    dslr,
    mobile,
    beachComparison
  };
}

// ==========================================
// PHOTOGRAPHY BRIEF — For Photographers tab
// Detailed insights for serious photographers
// ==========================================

function generatePhotographyBrief(score, cloudCover, humidity, visibility, windSpeed, beach, breakdown) {
  const highCloud = breakdown?.multiLevelCloud?.high ?? breakdown?.highCloud ?? null;
  const lowCloud = breakdown?.multiLevelCloud?.low ?? breakdown?.lowCloud ?? null;
  const aodValue = breakdown?.aod?.value ?? null;
  const isHazy = aodValue != null && aodValue >= 0.4;
  const isPostRain = breakdown?.isPostRain ?? false;

  // Light quality assessment
  let lightQuality;
  if (score >= 85) {
    lightQuality = isPostRain
      ? 'Exceptional light this morning — post-rain clarity means razor-sharp golden light with intense color saturation. The light will be strongly directional from the east, creating defined shadows and vivid warm tones across everything it touches. Best natural light conditions you can ask for.'
      : `Strong golden directional light expected. ${hasHighCanvas() ? 'High cloud cover creates a natural diffuser above while leaving the horizon clear — you get both warm direct light AND soft fill from the cloud canvas.' : 'Clear air means hard, contrasty light once the sun clears the horizon — beautiful for dramatic shadow work.'} Colors will peak in the 5 minutes bracketing sunrise.`;
  } else if (score >= 70) {
    lightQuality = `Good quality warm light with a mix of direct and diffused. ${cloudCover >= 30 && cloudCover <= 60 ? 'Partial cloud acts as a giant softbox — the light will be warm but not harsh, great for portraits and landscapes alike.' : 'The light will transition from soft amber pre-sunrise to stronger golden tones as the sun clears.'} Expect usable shooting light for 15-20 minutes around sunrise.`;
  } else if (score >= 55) {
    lightQuality = isHazy
      ? 'Soft, diffused light filtered through atmospheric haze. This is actually good for even lighting without harsh shadows — think natural beauty dish effect. Colors will be muted pastels. The sun disc itself will be a soft amber ball you can shoot directly without blinding flare.'
      : `Mixed light conditions — some warmth near the horizon but filtered through ${cloudCover > 60 ? 'heavy cloud, giving flat, even illumination with no strong directional quality' : 'moderate cloud, creating intermittent warm patches when gaps align with the sun'}. Work with what the sky gives you rather than waiting for a specific moment.`;
  } else if (score >= 40) {
    lightQuality = 'Flat, even light with minimal color temperature variation. The diffused illumination eliminates harsh shadows — useful for detail shots, textures, and compositions where you want even exposure across the frame. Not a golden hour morning, but the soft light has its uses.';
  } else {
    lightQuality = 'Very flat, low-contrast light — the sky acts as one massive softbox. Minimal color, minimal shadow. This is challenging for sunrise photography but ideal for moody, atmospheric work. Lean into the grey — it can produce powerful images if you compose intentionally.';
  }

  // Best shots recommendation
  let bestShots;
  if (score >= 70) {
    bestShots = `Wide golden landscapes with the full color show, sun-star effects as the disc peeks over the horizon, silhouettes of ${beach === 'marina' ? 'the lighthouse and fishing boats' : beach === 'covelong' ? 'rock formations against the golden sky' : beach === 'thiruvanmiyur' ? 'the breakwater with golden water trails' : 'walkers and landmarks'} against the warm glow. Wet sand reflections will mirror the sky — get low for maximum impact. Golden water trail shots from a slightly elevated position.`;
  } else if (score >= 55) {
    if (isHazy) {
      bestShots = `The hazy light is perfect for minimalist compositions — isolated subjects against soft gradients. Telephoto compression shots of the muted sun disc work beautifully. ${beach === 'covelong' ? 'The rock formations will look incredible as dark shapes in the warm haze.' : beach === 'marina' ? 'Fishing boat silhouettes against the soft amber horizon.' : 'Simple foreground subjects against the layered atmosphere.'} Also great for abstract water texture close-ups.`;
    } else {
      bestShots = `Focus on compositional photography rather than sky-dominant shots. ${beach === 'marina' ? 'The lighthouse makes a strong anchor for rule-of-thirds compositions. Fishing nets and boats add human interest.' : beach === 'covelong' ? 'Rock formations and tidal pools are your foreground — use the moderate sky color as background.' : beach === 'thiruvanmiyur' ? 'Tidal pools reflecting whatever color is available. Breakwater lines create leading lines.' : 'Find strong foreground elements to anchor your compositions.'} Mid-range focal lengths (35-70mm) will serve you best.`;
    }
  } else {
    bestShots = `Moody black and white is your friend this morning — the grey tones and atmospheric depth convert beautifully. Long exposure waves (10-30 seconds with ND filter) create ethereal water against ${beach === 'covelong' ? 'the rock formations' : beach === 'marina' ? 'the lighthouse silhouette' : 'dark sand and structures'}. Close-up textures — wet sand patterns, shells, seaweed — benefit from the even light. High contrast B&W processing will make these pop.`;
  }

  // Color palette
  let colorPalette;
  if (score >= 85) {
    colorPalette = isPostRain
      ? 'Expect vivid, saturated oranges, deep amber, and intense golden-yellow — the clean air means colors will be punchy and true. Set white balance to Daylight (5200-5500K) to preserve the natural warmth without over-cooking it.'
      : `Rich warm tones — deep orange at the horizon fading through amber to soft pink. ${hasHighCanvas() ? 'The cloud canvas will pick up reds and violets higher up.' : 'Concentrated color band at the horizon with clean blue sky above.'} Shoot in RAW — the dynamic range of colors will reward careful processing.`;
  } else if (score >= 55) {
    colorPalette = isHazy
      ? 'Muted pastels — soft peach, faded apricot, pale lavender. The haze desaturates everything. Lean into the muted palette rather than fighting it in post. White balance at 6000-6500K adds subtle warmth.'
      : `Moderate warm tones — soft orange and amber near the horizon, ${cloudCover > 60 ? 'with cooler grey-blue tones dominating the upper sky. The contrast between warm and cool creates interesting split-tone opportunities.' : 'fading to warm yellows. Not vivid but genuinely pleasant color.'}`;
  } else {
    colorPalette = 'Cool greys with possible warm hints near the horizon. This is a desaturated palette — work with it. Blue-grey tones, steel water, muted sand. Consider shooting for B&W from the start, or embrace the cool tones for a moody color grade.';
  }

  // Challenges
  let challenges;
  if (score >= 80 && cloudCover < 30) {
    challenges = 'High dynamic range is the main challenge — the bright sun disc against darker foreground will blow highlights easily. Use graduated ND filter or bracket exposures (-2, 0, +2 EV). Direct sun will also cause lens flare — use your lens hood and consider using it creatively rather than avoiding it.';
  } else if (isHazy) {
    challenges = `Atmospheric haze reduces contrast and sharpness. Use a circular polarizer to cut through scatter. In post, Dehaze slider is your best friend (+30-50). Focus manually — autofocus may hunt in the low-contrast hazy conditions. ${windSpeed > 15 ? `Wind at ${windSpeed}km/h adds camera stability concerns — brace firmly or use a tripod.` : ''}`;
  } else if (cloudCover > 70) {
    challenges = `Flat light makes everything look same-y — you need to create visual interest through composition, not light. ${windSpeed > 20 ? `Strong wind will test your tripod stability and may kick up sand near your gear. Protect your front element.` : ''} Expose for the brightest part of the sky to retain what little tonal variation exists.`;
  } else if (windSpeed > 20) {
    challenges = `Wind at ${windSpeed}km/h is the main concern — tripod shots below 1/60s will need solid footing. Sand particles may hit your front lens element, so use a UV filter as protection and wipe frequently. The upside: wind creates dramatic wave action for long exposures.`;
  } else {
    challenges = `Moderate conditions — no major challenges. Main thing to watch is the transition speed: the best color window is short (5-8 minutes), so have your composition set up before the color peaks. ${humidity > 70 ? 'High humidity may cause lens fogging if you step from an air-conditioned car — arrive 5 minutes early to acclimate.' : ''}`;
  }

  function hasHighCanvas() {
    return highCloud != null && highCloud >= 30;
  }

  return { lightQuality, bestShots, colorPalette, challenges };
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
    whatYoullSee = `When you get to ${beach}, the eastern sky will already be glowing deep orange above the water. ${hasHighCanvas ? 'Clouds high up will be lit from below — streaks of orange and red spreading wide across the sky.' : 'The clear sky near the horizon will be a band of vivid gold fading to warm pink above.'} As the sun breaks the horizon, it\'ll come up as a bright golden-white disc — intense enough that you\'ll squint. A sharp golden trail will stretch across the water straight toward you on the sand.${aodValue != null && aodValue < 0.2 ? ' The air is clean this morning, so everything will look extra sharp and vivid.' : ''}`;
  } else if (score >= 70) {
    if (hasHighCanvas && cloudCover >= 30 && cloudCover <= 60) {
      whatYoullSee = `You\'ll see a warm glow building on the horizon as you walk toward the water. The clouds above will start catching color — orange and gold spreading across them. ${lowCloud < 30 ? 'The horizon is clear, so you\'ll see the sun come up as a bright golden disc with a clear reflection path on the water.' : 'Some low cloud near the horizon may hide the sun briefly, but the color above will be the real show.'} The whole beach will turn warm gold once the sun clears.`;
    } else {
      whatYoullSee = `Looking east from ${beach}, the sky will warm up gradually — first a pale glow, then amber and soft orange tones building at the horizon. The sun will appear as a warm golden disc, and you\'ll see a reflection path on the water stretching toward the shore. The sand and everything around you will shift from cool blue-grey to warm gold as the light fills in.`;
    }
  } else if (score >= 55) {
    if (isLowStratus) {
      whatYoullSee = `Looking out from ${beach}, you\'ll see a flat grey layer sitting low over the water — the kind that blocks the horizon. Above it, there may be soft peach or salmon tones where the light leaks through, but the sun itself will be hidden behind that grey band. The water below will stay dark without much reflection. It\'s a muted scene, not the colorful one.`;
    } else if (isHazy) {
      whatYoullSee = `The horizon will look milky and soft — there\'s haze in the air blurring the line between water and sky. The sun will appear as a soft amber ball rather than a sharp disc, with a diffused warm glow around it. Colors will be pastel — think faded peach and soft orange rather than vivid reds. The water will have a broad, gentle warm sheen rather than a crisp golden trail.`;
    } else {
      whatYoullSee = `You\'ll see some warm color at the horizon as the sun comes up — soft oranges and peach tones rather than vivid reds. ${cloudCover > 60 ? 'The heavier cloud will filter the light, giving a gentler, diffused glow across the sky.' : cloudCover < 30 ? 'With mostly clear sky, the color stays concentrated near the horizon — pale yellows and soft blues above.' : 'Some clouds will catch the warm light, adding a bit of color to the scene.'} The water will reflect a gentle warm tone back at you.`;
    }
  } else if (score >= 40) {
    if (isLowStratus) {
      whatYoullSee = `Standing at ${beach}, the sky over the water will be a low grey layer — but watch for the moment the sun finds a gap. You may see it punch through briefly as a soft orange disc, throwing a short-lived warm glow across the water. Even if it doesn\'t, there\'s something to the soft grey light and the way the beach looks in that quiet early hour.`;
    } else if (cloudCover > 70 && isVeryHumid) {
      whatYoullSee = `The sky will be heavy and grey from the water to overhead. No sharp sunrise moment — just the world slowly getting brighter, the grey shifting from dark to lighter. There may be a brief warm hint near the horizon where the sun is trying to push through, but don\'t expect it to break free. The beach feels still and quiet in this kind of light.`;
    } else if (isHazy && isVeryHumid) {
      whatYoullSee = `Haze and moisture make the horizon look milky — you won\'t see a clear line between water and sky. The sun may appear as a faint warm spot, and there could be a soft glow on the water where it rises. Colors will be muted pastels at best. The scene is more about the quiet atmosphere than the sky itself.`;
    } else {
      whatYoullSee = `The sky will be muted this morning — ${cloudCover > 70 ? 'thick cloud filtering out most color, just the grey slowly brightening.' : 'the moisture in the air softening everything.'} You may catch a brief warm hint near the horizon where the sun is, but it won\'t be the colorful show. The beach in that soft early light is still a nice place to be.`;
    }
  } else {
    if (cloudCover > 80 && lowCloud != null && lowCloud >= 50) {
      whatYoullSee = `The sky over ${beach} will be a thick grey blanket — from the water to overhead, no breaks. It\'ll just shift from dark grey to lighter grey as morning happens. No sun disc, no warm colors, no golden water. ${isVeryHumid ? 'The air will feel heavy and damp.' : ''} The beach will still be dim even well after the official sunrise time.`;
    } else {
      whatYoullSee = `You won\'t see a sunrise this morning — the sky will just gradually get lighter, going from dark to a flat, uniform grey. ${isHazy ? 'Thick haze' : 'Heavy cloud'} makes the horizon indistinguishable from the sky. No sun disc, no warm tones. Just the world slowly waking up in grey light.`;
    }
  }

  // Beach vibes — the physical experience of being there
  let beachVibes;
  if (windSpeed <= 10) {
    beachVibes = `The air will feel still at ${temperature}°C — you\'ll hear the waves clearly without any wind noise. The sand will be cool underfoot, and ${beach} will be nearly empty at this hour. A calm, quiet setting.`;
  } else if (windSpeed <= 20) {
    beachVibes = `A gentle breeze coming off the water at ${temperature}°C — you\'ll feel it on your face as you walk along the shore. The waves will have a steady rhythm. ${beach} will be peaceful with just a few early walkers.`;
  } else {
    beachVibes = `You\'ll feel the wind as soon as you step onto the sand — ${windSpeed}km/h makes ${temperature}°C feel cooler than it is. The sea will be active, waves louder than usual. Hair and clothes blowing around kind of morning.`;
  }

  // Worth waking up — the honest human recommendation
  let worthWakingUp;
  if (score >= 70) {
    worthWakingUp = 'Yes — this is the kind of morning where you\'ll stand there watching and lose track of time. The sky will put on a real show. Set the alarm.';
  } else if (score >= 55) {
    worthWakingUp = 'If you\'re up for it, it\'ll be a pleasant morning at the beach. The sunrise will have some nice color — nothing jaw-dropping, but the whole experience of being there at dawn makes it worth it.';
  } else if (score >= 40) {
    worthWakingUp = 'The sky won\'t be the star this morning — colors will be subtle at best. But the beach at dawn has its own thing going on: quiet water, cool air, soft light, barely anyone around. If you enjoy that, it\'s still a nice outing.';
  } else {
    worthWakingUp = 'Not for the sunrise — there won\'t be much to see in the sky. But if you\'re already awake and nearby, a dawn beach walk in the grey light is its own kind of peaceful. Just don\'t set an alarm expecting color.';
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