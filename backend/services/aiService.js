// ==========================================
// AI Service - Groq AI Sunrise Insights
// Balanced, honest, general-audience-first
// Photography tips as secondary layer
// Model: llama-3.3-70b-versatile
// ==========================================

const Groq = require('groq-sdk');

let groqClient;
try {
  if (process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log('✅ Groq AI initialized');
  } else {
    console.warn('⚠️  Groq API not configured, using fallback');
  }
} catch (error) {
  console.warn('⚠️  Groq AI initialization failed, using fallback');
}

/**
 * Generate sunrise insights (general audience + photography)
 */
async function generatePhotographyInsights(weatherData, allWeatherData = {}) {
  try {
    if (groqClient && process.env.GROQ_API_KEY) {
      return await generateGroqInsights(weatherData, allWeatherData);
    } else {
      return generateRuleBasedInsights(weatherData, allWeatherData);
    }
  } catch (error) {
    console.error('AI generation error:', error.message);
    return generateRuleBasedInsights(weatherData, allWeatherData);
  }
}

/**
 * AI-powered insights using Groq (Llama 3.3 70B)
 * Dual-audience: general sunrise experience + photography
 * Honest, balanced tone — sets accurate expectations
 */
async function generateGroqInsights(weatherData, allWeatherData = {}) {
  try {
    console.log('🤖 Calling Groq AI for insights...');

    const { beach, forecast, prediction } = weatherData;
    const { cloudCover, humidity, visibility, windSpeed, temperature, precipProbability, weatherDescription } = forecast;
    const { score, verdict, atmosphericLabels } = prediction;

    const beachContextMap = {
      'Marina Beach': 'The world\'s longest urban beach. Key elements: lighthouse (north end), fishing boats (colorful vallamkaran boats launch at dawn), the pier, long flat sand, urban Chennai skyline as backdrop, large tidal pools during low tide.',
      "Elliot's Beach": 'Quieter, upscale Besant Nagar beach. Key elements: Karl Schmidt Memorial (stone structure on beach), clean white sand, Ashtalakshmi Temple visible in background, fewer crowds, calm water.',
      'Covelong Beach': 'Secluded surf beach 40km south. Key elements: natural rock formations and tidal pools, rolling waves, dramatic cliffs to the south, isolated and pristine, minimal urban intrusion.',
      'Thiruvanmiyur Beach': 'Residential neighborhood beach. Key elements: tidal pools, natural breakwater rocks, calmer than Marina, accessible parking and walkways.'
    };

    const beachContext = beachContextMap[beach] || 'Chennai beach with natural foreground elements and Bay of Bengal horizon.';

    // Determine honesty tier so the AI knows what tone to use
    let toneInstruction;
    if (score >= 75) {
      toneInstruction = 'This is genuinely a great morning. Be enthusiastic but grounded — describe the specific colors and experience people can expect. It is okay to encourage people to go.';
    } else if (score >= 55) {
      toneInstruction = 'This is a decent morning — pleasant but not spectacular. Set realistic expectations. Describe what will be nice and what will be limited. Don\'t oversell it.';
    } else if (score >= 35) {
      toneInstruction = 'This is a below-average morning for sunrise viewing. Be honest — the sky will likely be underwhelming. If someone goes, tell them what they will realistically see (muted colors, grey horizon, etc). Do NOT spin this as "dramatic" or "moody" or find silver linings. A beach walk might still be pleasant for other reasons, but the sunrise itself won\'t be impressive.';
    } else {
      toneInstruction = 'This is a poor morning for sunrise. Be straightforward — the sunrise will likely not be visible or will be completely washed out. Describe what someone would actually see: overcast grey sky, no color, flat light. Do NOT romanticize this. If someone still wants to go for a walk, that\'s fine, but they should not expect any sunrise spectacle.';
    }

    const prompt = `You are a knowledgeable local guide for Chennai's beaches who gives honest, balanced sunrise forecasts. Your audience is GENERAL PUBLIC first (people wondering "should I wake up early?") and photography enthusiasts second.

YOUR CORE PRINCIPLE: Set accurate expectations. If someone follows your advice, they should never be disappointed. On great days, help them appreciate what makes it special. On bad days, tell them exactly what they'll see so they can decide for themselves.

TONE INSTRUCTION FOR TODAY (score: ${score}/100):
${toneInstruction}

ATMOSPHERIC CONDITIONS:
- Temperature: ${temperature}°C
- Cloud Cover: ${cloudCover}% (${atmosphericLabels?.cloudLabel || 'measured'})
- Humidity: ${humidity}% (${atmosphericLabels?.humidityLabel || 'measured'})
- Visibility: ${visibility} km (${atmosphericLabels?.visibilityLabel || 'measured'})
- Wind: ${windSpeed} km/h (${atmosphericLabels?.windLabel || 'measured'})
- Precipitation Probability: ${precipProbability}%
- Conditions: ${weatherDescription}
- Sunrise Score: ${score}/100 (${verdict})

BEACH CONTEXT:
${beachContext}

CRITICAL RULES:
1. NEVER use phrases like "every sunrise is unique", "you might still catch something beautiful", "embrace the mood", or any positive spin on objectively poor conditions.
2. For cloud cover: 30-60% is OPTIMAL (acts as canvas for color). Clear skies (under 20%) = pale, underwhelming. Over 75% = sunrise likely not visible.
3. For humidity: Under 55% = vibrant colors. Over 70% = visibly muted and washed out.
4. The "greeting" must match the score honestly. A 30/100 greeting should NOT sound exciting.
5. The "sunriseExperience" section is for general audience — describe what they'll SEE, FEEL, and experience in plain language.
6. Photography sections should include "why" explanations for all settings.
7. Golden hour peak is 10-15 MINUTES BEFORE official sunrise (6:00 AM).
8. February-March: Post-monsoon clarity, winter air = Chennai's best sunrise season.

Respond ONLY with valid JSON (no markdown, no code blocks, no extra text):
{
  "greeting": "One honest sentence setting expectations for this morning's sunrise at ${beach}",
  "insight": "Two sentences describing what someone will actually see and experience at the beach this morning. Be specific about expected sky colors, light quality, and overall atmosphere. Match honesty to the ${score}/100 score.",
  "sunriseExperience": {
    "whatYoullSee": "2-3 sentences painting an honest picture of the visual experience — sky colors, cloud behavior, light quality. Be specific and grounded.",
    "beachVibes": "1-2 sentences about the non-visual experience — temperature feel, wind on skin, crowd level, sounds of the beach at dawn. This stays pleasant regardless of sky conditions since it's about the beach itself.",
    "worthWakingUp": "${score >= 70 ? 'Yes — explain why this is genuinely worth the early alarm' : score >= 50 ? 'Conditionally — it will be pleasant but not spectacular. Good if you are already a morning person or nearby.' : 'For the sunrise alone, probably not. But if you enjoy early morning beach walks regardless of sky conditions, the beach is always peaceful at dawn.'}"
  },
  "goldenHour": {
    "start": "5:40 AM",
    "peak": "5:50 AM",
    "end": "6:20 AM",
    "quality": "Excellent/Very Good/Good/Fair/Poor — match honestly to conditions",
    "tip": "One sentence on when to be there for the best light, appropriate to conditions"
  },
  "atmosphericAnalysis": {
    "cloudCover": {
      "value": ${cloudCover},
      "rating": "Optimal/Good/Fair/Poor",
      "impact": "Two sentences explaining what this cloud % physically does to sunrise colors. Be scientifically accurate (30-60% = best canvas)."
    },
    "humidity": {
      "value": ${humidity},
      "rating": "Excellent/Very Good/Moderate/High/Very High",
      "impact": "Two sentences on how this humidity level affects what you'll see — color saturation, haze, atmospheric clarity."
    },
    "visibility": {
      "value": ${visibility},
      "rating": "Exceptional/Excellent/Very Good/Good/Poor",
      "impact": "One sentence on how visibility affects the horizon and color intensity."
    },
    "wind": {
      "value": ${windSpeed},
      "rating": "Calm/Light/Moderate/Strong",
      "impact": "One sentence on how wind affects clouds and the overall beach experience."
    },
    "overallPattern": "Two sentences about today's weather pattern and what it means for the sunrise at Chennai beaches."
  },
  "dslr": {
    "cameraSettings": {
      "iso": "recommended ISO value",
      "isoWhy": "Why this ISO for these conditions",
      "shutterSpeed": "recommended shutter speed",
      "shutterWhy": "Why this shutter speed",
      "aperture": "recommended aperture",
      "apertureWhy": "Why this aperture",
      "whiteBalance": "recommended white balance in Kelvin",
      "wbWhy": "Why this WB setting"
    },
    "proTips": [
      "Specific technical tip for these conditions",
      "Specific technique tip for these conditions",
      "Advanced tip relevant to today's exact conditions"
    ],
    "compositionTips": [
      "Specific composition using a named element at ${beach}",
      "Framing or leading line technique using ${beach}'s geography",
      "Light and shadow opportunity for these conditions at ${beach}"
    ]
  },
  "mobile": {
    "phoneSettings": {
      "nightMode": "On or Off",
      "nightModeWhy": "Why — specific to these light conditions",
      "hdr": "On, Off, or Auto",
      "hdrWhy": "Why — specific to today's dynamic range",
      "exposure": "adjustment value like -0.3 or +0.3",
      "exposureWhy": "Why this compensation",
      "additionalSetting": "One more relevant setting",
      "additionalWhy": "Why it helps today"
    },
    "proTips": [
      "Stability or technique tip for these conditions",
      "Timing tip for the best moment to shoot",
      "Post-processing tip for today's specific light"
    ],
    "compositionTips": [
      "Phone-specific composition at ${beach}",
      "Orientation decision for today's sky conditions",
      "Foreground or reflection technique for ${beach}"
    ]
  },
  "beachComparison": null
}`;

    const completion = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a knowledgeable, honest local guide for Chennai's Bay of Bengal beaches. You give balanced sunrise forecasts — enthusiastic on great days, straightforward on poor days. Your priority is setting accurate expectations so people are never disappointed. You understand atmospheric science, photography, and what makes a sunrise worth seeing. Always respond with valid JSON only, no markdown or code blocks."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) throw new Error('Empty response from Groq');

    const cleanText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const aiData = JSON.parse(cleanText);
    console.log('✅ Groq AI insights generated');

    // Always override beachComparison with deterministic calculation
    const beachComparison = generateBeachComparison(
      beach, cloudCover, windSpeed, visibility, humidity, allWeatherData
    );

    return {
      source: 'groq',
      model: 'llama-3.3-70b',
      ...aiData,
      beachComparison
    };

  } catch (error) {
    console.error('❌ Groq AI error:', error.message);
    throw error;
  }
}

// ==========================================
// RULE-BASED FALLBACK
// Honest, balanced, dual-audience
// ==========================================

function generateRuleBasedInsights(weatherData, allWeatherData = {}) {
  const { forecast, prediction, beach } = weatherData;
  const { cloudCover, humidity, visibility, windSpeed, temperature, precipProbability } = forecast;
  const { score, verdict, atmosphericLabels } = prediction;

  // ── Greeting — honest, matches score ──
  let greeting;
  if (score >= 85) {
    greeting = `Tomorrow's looking exceptional at ${beach} — this is a sunrise worth setting an alarm for.`;
  } else if (score >= 70) {
    greeting = `Strong conditions shaping up at ${beach} this morning — expect vivid colors across the sky.`;
  } else if (score >= 55) {
    greeting = `Decent morning ahead at ${beach} — pleasant conditions, though the sky won't be the most dramatic.`;
  } else if (score >= 40) {
    greeting = `Tomorrow's sunrise at ${beach} will be fairly muted — limited color expected due to atmospheric conditions.`;
  } else if (score >= 25) {
    greeting = `Not a great morning for sunrise at ${beach} — heavy cloud cover and haze will block most of the color.`;
  } else {
    greeting = `Tomorrow's sunrise at ${beach} will likely not be visible — overcast skies and poor visibility expected.`;
  }

  // ── Insight — what you'll actually see ──
  let insight;
  if (cloudCover >= 30 && cloudCover <= 60) {
    if (humidity <= 55) {
      insight = `Cloud cover at ${cloudCover}% sits in the sweet spot — clouds will catch orange and red light from below the horizon, painting the sky with vivid color. Low humidity at ${humidity}% means those colors will look crisp and saturated.`;
    } else if (humidity <= 70) {
      insight = `Clouds at ${cloudCover}% will act as a canvas for sunrise colors, though ${humidity}% humidity will soften the saturation somewhat. Expect warm tones that are pleasant but not intensely vivid.`;
    } else {
      insight = `Cloud cover is in the optimal range at ${cloudCover}%, but high humidity at ${humidity}% will noticeably wash out the colors. You'll see warm tones, but they'll appear muted and hazy rather than crisp.`;
    }
  } else if (cloudCover < 30) {
    insight = `At only ${cloudCover}% cloud cover, the sky is mostly clear — expect soft pastel yellows and blues rather than dramatic oranges and reds. Clear skies lack the cloud canvas that creates those fiery sunrise photos you see online.`;
  } else if (cloudCover <= 75) {
    insight = `Cloud cover at ${cloudCover}% is on the heavy side. Some color may break through gaps in the clouds, but it will be patchy and diffused rather than a full-sky display. The light will be soft and even.`;
  } else {
    insight = `Heavy cloud cover at ${cloudCover}% will block most direct sunlight. The horizon will likely stay grey with minimal color. If any light breaks through, it will be brief and muted — don't expect the classic sunrise glow.`;
  }

  // ── Sunrise experience (general audience) ──
  const sunriseExperience = generateSunriseExperience(score, cloudCover, humidity, visibility, windSpeed, temperature, beach);

  // ── Golden hour ──
  const goldenHour = {
    start: '5:38 AM',
    peak: '5:50 AM',
    end: '6:20 AM',
    quality: score >= 75 ? 'Very Good' : score >= 55 ? 'Good' : score >= 35 ? 'Fair' : 'Poor',
    tip: score >= 55
      ? 'Be at the beach by 5:35 AM — the richest colors appear 10-15 minutes before the sun clears the horizon.'
      : 'Color window will be limited this morning. If you go, aim for 5:45-6:00 AM for whatever light is available.'
  };

  // ── Atmospheric analysis ──
  const atmosphericAnalysis = generateAtmosphericAnalysis(cloudCover, humidity, visibility, windSpeed);

  // ── DSLR settings ──
  const dslr = generateDSLRSettings(beach, cloudCover, humidity, visibility, windSpeed, score);

  // ── Mobile settings ──
  const mobile = generateMobileSettings(beach, cloudCover, humidity, visibility, windSpeed, score);

  // ── Beach comparison ──
  const beachComparison = generateBeachComparison(beach, cloudCover, windSpeed, visibility, humidity, allWeatherData);

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
// ==========================================

function generateSunriseExperience(score, cloudCover, humidity, visibility, windSpeed, temperature, beach) {
  let whatYoullSee;
  if (score >= 75) {
    if (cloudCover >= 30 && cloudCover <= 60) {
      whatYoullSee = `The sky should light up with warm oranges and reds as sunlight catches the underside of scattered clouds. Expect a gradual build of color starting about 15 minutes before sunrise, peaking as the sun nears the horizon. With ${visibility}km visibility, the horizon will be sharp and the colors well-defined.`;
    } else {
      whatYoullSee = `Good atmospheric conditions overall — expect pleasant warm tones across the sky with ${visibility}km of clear sightlines to the horizon. The color intensity will depend on cloud positioning, but the fundamentals are strong for a satisfying sunrise.`;
    }
  } else if (score >= 55) {
    whatYoullSee = `You'll see some color in the sky — likely softer warm tones rather than intense reds and oranges. ${cloudCover > 60 ? 'Heavier cloud cover will filter the light, giving a diffused, gentler glow rather than sharp color bands.' : cloudCover < 30 ? 'Clear skies mean the color will mostly be pale yellows and soft blues — pleasant but not dramatic.' : 'Moderate cloud coverage means some color reflection, though humidity may soften the vibrancy.'} It will be a nice morning, just not a show-stopper.`;
  } else if (score >= 35) {
    whatYoullSee = `Realistically, the sky will be mostly grey or washed out near the horizon. ${cloudCover > 70 ? `At ${cloudCover}% cloud cover, the sun may not be visible at all when it rises — you'll notice the sky gradually brightening from dark grey to lighter grey.` : `High humidity at ${humidity}% will haze out most color, giving the sky a flat, milky appearance.`} If any color appears, it will be brief and faint.`;
  } else {
    whatYoullSee = `The sunrise will likely not be visible this morning. ${cloudCover > 80 ? 'Thick cloud cover will block the sun entirely — the sky will shift from dark to overcast grey without any color.' : 'A combination of poor visibility and atmospheric moisture will make the horizon indistinguishable.'} The beach will still be dim well after the official sunrise time.`;
  }

  // Beach vibes — always honest but acknowledges the beach itself is pleasant
  let beachVibes;
  if (windSpeed <= 10) {
    beachVibes = `At ${temperature}°C with barely any wind, the beach will feel calm and quiet at dawn. ${beach === 'Covelong Beach' || beach === "Elliot's Beach" ? 'Expect very few people around at this hour.' : 'Early risers and fishermen will be the only company.'}`;
  } else if (windSpeed <= 20) {
    beachVibes = `${temperature}°C with a light breeze off the water — comfortable for a morning walk. The beach will be peaceful at this hour with the sound of gentle waves.`;
  } else {
    beachVibes = `A noticeable wind at ${windSpeed}km/h will keep things breezy — ${temperature}°C will feel cooler than usual. The sea will be more active with audible wave energy.`;
  }

  // Worth waking up — the key honest recommendation
  let worthWakingUp;
  if (score >= 75) {
    worthWakingUp = 'Yes — conditions are genuinely strong for a beautiful sunrise. This is the kind of morning that rewards the early alarm.';
  } else if (score >= 55) {
    worthWakingUp = 'If you\'re already a morning person or nearby, it\'ll be a pleasant outing. The sunrise will have some color but won\'t be spectacular — go for the full beach experience, not just the sky.';
  } else if (score >= 35) {
    worthWakingUp = 'For the sunrise alone, probably not worth the early alarm. The sky will be underwhelming. That said, the beach at dawn is always peaceful — if you enjoy the quiet morning atmosphere regardless of sky conditions, go for the walk.';
  } else {
    worthWakingUp = 'No, not for the sunrise — it likely won\'t be visible. If you happen to be awake and nearby, a dawn beach walk is still calming, but don\'t set an alarm expecting sky colors.';
  }

  return { whatYoullSee, beachVibes, worthWakingUp };
}

// ==========================================
// ATMOSPHERIC ANALYSIS
// ==========================================

function generateAtmosphericAnalysis(cloudCover, humidity, visibility, windSpeed) {
  const cloudRating = (cloudCover >= 30 && cloudCover <= 60) ? 'Optimal' : cloudCover < 30 ? 'Too Clear' : cloudCover <= 75 ? 'Partly Overcast' : 'Overcast';

  return {
    cloudCover: {
      value: cloudCover,
      rating: cloudRating,
      impact: cloudCover >= 30 && cloudCover <= 60
        ? `At ${cloudCover}%, clouds sit in the ideal range — they act as a reflective canvas, catching orange and red light from below the horizon. This is the range that produces the most colorful sunrises.`
        : cloudCover < 30
        ? `With only ${cloudCover}% cloud cover, there's very little canvas for the sun's colors to reflect off. The sky will be mostly pale yellows and blues — clean but lacking the dramatic color that clouds create.`
        : cloudCover <= 75
        ? `At ${cloudCover}%, cloud cover is heavier than ideal. Some gaps may let color through, but much of the light will be blocked or diffused. Expect patchy, muted tones rather than a full color display.`
        : `At ${cloudCover}%, dense cloud cover will block most direct sunlight. The sunrise will likely not produce visible color — the sky will brighten gradually from dark grey to lighter grey without the warm tones of a clear sunrise.`
    },
    humidity: {
      value: humidity,
      rating: humidity <= 40 ? 'Excellent' : humidity <= 55 ? 'Very Good' : humidity <= 70 ? 'Moderate' : humidity <= 85 ? 'High' : 'Very High',
      impact: humidity <= 55
        ? `At ${humidity}% humidity, the air is dry — colors will appear crisp, vivid and well-saturated. Low humidity is one of the key ingredients behind Chennai's best winter sunrises.`
        : humidity <= 70
        ? `At ${humidity}% humidity, atmospheric moisture will slightly soften and diffuse the light. Colors will be present but noticeably less saturated than on drier mornings — think warm pastels rather than vivid fire.`
        : `At ${humidity}% humidity, significant moisture in the air will scatter and absorb light. Colors will appear visibly washed out and hazy. The horizon may look milky rather than sharp.`
    },
    visibility: {
      value: visibility,
      rating: visibility >= 15 ? 'Exceptional' : visibility >= 10 ? 'Excellent' : visibility >= 8 ? 'Very Good' : visibility >= 5 ? 'Good' : 'Poor',
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
    overallPattern: `February marks Chennai's best sunrise season — post-northeast monsoon departure leaves cleaner air, and winter high-pressure systems reduce humidity to annual lows. ${humidity <= 55 && visibility >= 10 ? 'Today\'s conditions reflect this — dry air and good visibility are working in your favor.' : humidity > 70 ? 'However, humidity remains elevated today, limiting what would otherwise be Chennai\'s strongest sunrise conditions.' : 'Conditions today are mixed — some factors are favorable while others will limit the sunrise quality.'}`
  };
}

// ==========================================
// DSLR SETTINGS
// ==========================================

function generateDSLRSettings(beach, cloudCover, humidity, visibility, windSpeed, score) {
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
        : 'Bracket focus as well as exposure — shoot at different focal distances to ensure both foreground elements and the horizon are tack sharp.'
    ],
    compositionTips: getBeachDSLRCompositionTips(beach, cloudCover, windSpeed, score)
  };
}

// ==========================================
// MOBILE SETTINGS
// ==========================================

function generateMobileSettings(beach, cloudCover, humidity, visibility, windSpeed, score) {
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
        ? 'Best moment: the 3-5 minutes as the sun disk clears the horizon (around 5:58-6:03 AM) — use burst mode during this window.'
        : 'Timing is less critical on overcast mornings — the light changes gradually rather than in a brief dramatic window. Take your time with composition.',
      humidity <= 55
        ? 'Minimal post-processing needed — just bump clarity +10 and vibrance +15 in Snapseed or Lightroom Mobile.'
        : 'In Snapseed: reduce haze with +Clarity, pull back +Warmth to compensate for humidity\'s grey cast. Lift Highlights slightly to recover what sky color exists.'
    ],
    compositionTips: getBeachMobileCompositionTips(beach, cloudCover, windSpeed, score)
  };
}

// ==========================================
// BEACH-SPECIFIC COMPOSITION — DSLR
// ==========================================

function getBeachDSLRCompositionTips(beach, cloudCover, windSpeed, score) {
  const tips = {
    'Marina Beach': [
      'Position the lighthouse in the left third with the horizon low — it creates a strong silhouette anchor regardless of sky conditions.',
      'Fishing boats (vallamkaran) launch between 5:30-6:00 AM — time a 1/500s shot to freeze a boat mid-launch against whatever light is available.',
      score >= 55
        ? 'The lighthouse casts a long shadow across wet sand at this angle — use it as a leading line toward the dawn sky.'
        : 'On flat-light mornings like this, the lighthouse and boats become your primary subjects rather than the sky. Focus on strong foreground composition.'
    ],
    "Elliot's Beach": [
      'The Karl Schmidt Memorial provides a natural frame — shoot through or beside it with the dawn sky as background.',
      'Clean sand and few crowds mean you can get low-angle shots with wet sand reflections — even on grey mornings, reflections add visual interest.',
      score >= 55
        ? 'The Ashtalakshmi Temple dome catches early light — a long lens (200mm) compression shot with temple and sky together works well when there\'s color.'
        : 'Elliot\'s clean, minimal environment suits overcast conditions better than busier beaches — lean into the minimalism with simple foreground-horizon compositions.'
    ],
    'Covelong Beach': [
      'Rock formations on the south end offer natural framing — shoot between rocks to add depth regardless of sky conditions.',
      windSpeed <= 15
        ? 'Calm water means 20-30 second exposures on tidal pools will create glass-smooth reflections — even a grey sky reflected can look striking.'
        : 'Wave action is photogenic in this wind — use 1/500s to freeze a wave crest against the sky for dynamic energy.',
      'The natural cove shape concentrates attention — stand at the curve\'s apex and use the bay\'s arc as a sweeping leading line.'
    ],
    'Thiruvanmiyur Beach': [
      'Tidal pools near the breakwater rocks are the signature here — position a rock with the sky reflected in the pool behind it.',
      'Breakwater rocks provide reliable foreground interest — compose with rule of thirds to create depth from rock to horizon.',
      score >= 55
        ? 'Calm inshore water here creates good horizon reflections. Shoot wide and near water level.'
        : 'On grey mornings, the rocks and pools become your subjects — focus on textures and shapes rather than chasing sky color.'
    ]
  };

  return tips[beach] || [
    'Use a prominent foreground element to anchor the composition and create depth.',
    'Place the horizon in the lower third to emphasize whatever sky conditions are present.',
    'Look for wet sand or tidal pools to reflect available light and add visual interest.'
  ];
}

// ==========================================
// BEACH-SPECIFIC COMPOSITION — MOBILE
// ==========================================

function getBeachMobileCompositionTips(beach, cloudCover, windSpeed, score) {
  const tips = {
    'Marina Beach': [
      'Tap the lighthouse to lock focus and exposure — your phone will correctly meter the scene from this mid-tone anchor.',
      score >= 55
        ? 'Walk to the waterline and shoot landscape orientation — wet sand reflections double the sky and make the image feel grander.'
        : 'On flat-light mornings, try Portrait mode with the lighthouse as subject — the shallow depth effect gives interest even without dramatic sky color.',
      'Landscape orientation works best here — Marina\'s long flat beach needs horizontal space.'
    ],
    "Elliot's Beach": [
      'Tap to expose on the sky just above the horizon — this preserves whatever sky color exists while the foreground goes slightly darker, which looks intentional.',
      'Portrait orientation works well — the beach is narrow and tall, and the clean sand acts as a leading line to the sky.',
      'Minimalist compositions (sky, thin sand strip, waterline) play to Elliot\'s strengths and phone sensors alike.'
    ],
    'Covelong Beach': [
      'Tap on a mid-tone rock to lock exposure — your phone will balance sky and rock. Avoid tapping the sky directly (underexposes everything else).',
      'Landscape orientation is essential here — the cove and rock formations need horizontal space.',
      windSpeed <= 15
        ? 'Squat low near a tidal pool, phone near the water surface, tap a sky reflection to expose it correctly — works well even on overcast mornings.'
        : 'Waves + rocks: use burst mode, shoot 20+ frames, pick the one where wave position is most dynamic.'
    ],
    'Thiruvanmiyur Beach': [
      'Get close to a tidal pool — 15-20cm from the surface — and tap the sky reflection. Both portrait and landscape work for this intimate shot.',
      score >= 55
        ? 'Live Photos (iPhone) or Motion Photos (Samsung) capture gentle tidal pool ripples beautifully in the calm dawn.'
        : 'Less dramatic skies make this a good morning to experiment with both orientations and find what works — there\'s no pressure to capture a fleeting color window.',
      'Thiruvanmiyur\'s calm conditions suit deliberate, patient phone photography — take time framing each shot.'
    ]
  };

  return tips[beach] || [
    'Tap to lock focus and exposure on a mid-tone element, not the bright sky.',
    'Try landscape orientation to maximize the horizon and sky.',
    'Find reflections in wet sand or tidal pools — they add interest regardless of sky conditions.'
  ];
}

// ==========================================
// BEACH COMPARISON — uses real per-beach data
// Honest: can recommend "none" on bad days
// ==========================================

function generateBeachComparison(currentBeach, cloudCover, windSpeed, visibility, humidity, allWeatherData = {}) {

  function getBeachConditions(key) {
    const d = allWeatherData[key];
    if (d && d.forecast) {
      return {
        cloudCover: d.forecast.cloudCover,
        windSpeed: d.forecast.windSpeed,
        visibility: d.forecast.visibility,
        humidity: d.forecast.humidity
      };
    }
    return { cloudCover, windSpeed, visibility, humidity };
  }

  function scoreBeach(key) {
    const c = getBeachConditions(key);
    const isCalm = c.windSpeed <= 15;
    const isOptCloud = c.cloudCover >= 30 && c.cloudCover <= 60;
    const isGoodVis = c.visibility >= 8;
    const isLowHumid = c.humidity <= 55;

    let score = 50;
    if (isOptCloud) score += 20;
    else if (c.cloudCover < 30 || c.cloudCover > 75) score -= 10;
    if (isGoodVis) score += 15;
    if (isCalm) score += 10;
    if (isLowHumid) score += 5;
    return { score, isCalm, isOptCloud, isGoodVis, c };
  }

  const scores = {};
  ['marina', 'elliot', 'covelong', 'thiruvanmiyur'].forEach(k => { scores[k] = scoreBeach(k); });

  function suitLabel(score) {
    if (score >= 80) return 'Best';
    if (score >= 65) return 'Good';
    if (score >= 45) return 'Fair';
    return 'Poor';
  }

  // Honest beach reasons — no silver lining on genuinely poor conditions
  function beachReason(key) {
    const { isCalm, isOptCloud, isGoodVis, c, score } = scores[key];

    if (score < 40) {
      const reasons = {
        marina: 'Conditions are poor across Chennai — Marina\'s lighthouse still works as a subject, but don\'t expect sky color.',
        elliot: 'Conditions are poor — Elliot\'s clean environment won\'t compensate for the lack of color in the sky.',
        covelong: 'Not worth the 40km drive in these conditions — save Covelong for a day when the sky will reward the trip.',
        thiruvanmiyur: 'Below-average conditions. Thiruvanmiyur\'s tidal pools won\'t have much sky color to reflect.'
      };
      return reasons[key] || 'Poor conditions expected — limited sunrise visibility.';
    }

    const reasons = {
      marina: isOptCloud && isGoodVis
        ? 'Optimal clouds + the lighthouse silhouette = strong potential for a dramatic sunrise. Marina shines brightest when skies are dynamic.'
        : c.cloudCover < 30
        ? 'Clear skies at Marina — the lighthouse makes a clean silhouette, but the sky itself will be pale rather than fiery.'
        : 'Heavy clouds reduce Marina\'s drama. The lighthouse and fishing boats remain solid subjects regardless.',
      elliot: isCalm
        ? 'Calm wind means flat wet-sand reflections. Elliot\'s clean foreground makes it well-suited for reflection compositions today.'
        : 'Elliot\'s clean, uncrowded environment works in most conditions. The Karl Schmidt Memorial provides a reliable anchor point.',
      covelong: isCalm && isOptCloud
        ? 'Calm water + optimal clouds at Covelong is a strong combination — tidal pool reflections under a colorful sky.'
        : isCalm
        ? 'Calm water at Covelong enables smooth reflections in the tidal pools. Worth the drive if you want a quiet, natural setting.'
        : 'Wind will keep the water choppy at Covelong — better for wave photography than long-exposure reflections.',
      thiruvanmiyur: isCalm
        ? 'Thiruvanmiyur\'s calm, accessible setting with rocks and tidal pools makes it a solid choice for a relaxed morning.'
        : 'Thiruvanmiyur is accessible and crowd-free — a good low-effort option, though wind may limit reflection opportunities.'
    };
    return reasons[key] || 'Conditions are adequate for a visit.';
  }

  // Find best beach
  let bestBeach = 'marina';
  let bestScore = -1;
  Object.entries(scores).forEach(([k, v]) => {
    if (v.score > bestScore) { bestScore = v.score; bestBeach = k; }
  });

  const beaches = {};
  ['marina', 'elliot', 'covelong', 'thiruvanmiyur'].forEach(k => {
    beaches[k] = {
      suitability: suitLabel(scores[k].score),
      reason: beachReason(k)
    };
  });

  // If ALL beaches are poor, acknowledge it honestly
  const allPoor = Object.values(scores).every(s => s.score < 40);
  const compReason = allPoor
    ? 'Conditions are poor across all Chennai beaches this morning — none are particularly recommended for sunrise viewing. If you still want to go, choose the closest one for convenience.'
    : beachReason(bestBeach);

  return {
    todaysBest: bestBeach,
    reason: compReason,
    beaches
  };
}

module.exports = { generatePhotographyInsights };