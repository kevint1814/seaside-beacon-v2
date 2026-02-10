// ==========================================
// AI Service - Groq AI Photography Insights
// Expanded educational content generation
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
 * Generate AI photography recommendations
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
    return generateRuleBasedInsights(weatherData);
  }
}

/**
 * AI-powered insights using Groq (Llama 3.3 70B)
 * Expanded prompt for educational photography platform
 */
async function generateGroqInsights(weatherData, allWeatherData = {}) {
  try {
    console.log('🤖 Calling Groq AI for insights...');

    const { beach, forecast, prediction } = weatherData;
    const { cloudCover, humidity, visibility, windSpeed, temperature, precipProbability, weatherDescription } = forecast;
    const { score, verdict, atmosphericLabels } = prediction;

    const beachContextMap = {
      'Marina Beach': 'The world\'s longest urban beach. Key elements: lighthouse (north end), fishing boats (colorful vallamkaran boats launch at dawn), the pier, long flat sand ideal for leading lines, urban Chennai skyline as backdrop, large tidal pools during low tide.',
      "Elliot's Beach": 'Quieter, upscale Besant Nagar beach. Key elements: Karl Schmidt Memorial (stone structure on beach), clean white sand without clutter, Ashtalakshmi Temple visible in background, fewer crowds = clean foreground, calm water perfect for reflections.',
      'Covelong Beach': 'Secluded surf beach 40km south. Key elements: natural rock formations and tidal pools, rolling waves (great for long exposure motion blur), dramatic cliffs to the south, isolated = pristine natural compositions, minimal urban intrusion.',
      'Thiruvanmiyur Beach': 'Residential neighborhood beach. Key elements: tidal pools ideal for long exposure reflections, natural breakwater rocks, calmer than Marina, good for minimalist compositions, accessible parking and walkways.'
    };

    const beachContext = beachContextMap[beach] || 'Chennai beach with natural foreground elements and Bay of Bengal horizon.';

    const prompt = `You are an expert sunrise photography educator specializing in Chennai's Bay of Bengal beaches. Generate comprehensive, educational photography insights for ${beach} tomorrow at 6 AM IST.

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

CRITICAL INSTRUCTIONS:
1. For cloud cover: Remember 30-60% is OPTIMAL (acts as canvas for color). Clear skies = boring pale colors. Explain this accurately.
2. For humidity: Under 55% = vibrant colors. Over 70% = muted/washed out. Always explain WHY.
3. All DSLR settings must include a "why" explanation - photographers learn better this way.
4. All mobile settings must include a "why" explanation.
5. Composition tips must reference ACTUAL elements at ${beach} specifically.
6. Golden hour peak is 10-15 MINUTES BEFORE official sunrise (6:00 AM), not during.
7. February-March context: Post-monsoon clarity, winter air = Chennai's best sunrise season.

Respond ONLY with valid JSON (no markdown, no code blocks, no extra text):
{
  "greeting": "One punchy sentence capturing tomorrow's specific photographic opportunity",
  "insight": "Two sentences explaining what makes these exact atmospheric conditions special or challenging for photography",
  "goldenHour": {
    "start": "5:40 AM",
    "peak": "5:50 AM",
    "end": "6:20 AM",
    "quality": "Excellent/Very Good/Good/Fair/Poor",
    "tip": "One sentence on when exactly to be shooting for maximum color impact"
  },
  "atmosphericAnalysis": {
    "cloudCover": {
      "value": ${cloudCover},
      "rating": "Optimal/Good/Fair/Poor",
      "impact": "Two sentences: what this cloud % physically does to sunrise colors and light, using scientific accuracy (30-60% = best canvas)"
    },
    "humidity": {
      "value": ${humidity},
      "rating": "Excellent/Very Good/Moderate/High/Very High",
      "impact": "Two sentences: how this humidity level affects color saturation and atmospheric clarity"
    },
    "visibility": {
      "value": ${visibility},
      "rating": "Exceptional/Excellent/Very Good/Good/Poor",
      "impact": "One sentence: how this visibility affects color intensity and contrast in the photograph"
    },
    "wind": {
      "value": ${windSpeed},
      "rating": "Calm/Light/Moderate/Strong",
      "impact": "One sentence: how wind affects cloud stability and long exposure photography"
    },
    "overallPattern": "Two sentences about the overall weather pattern today (Feb = post-monsoon, winter dry season) and what it means for photography at Chennai beaches specifically"
  },
  "dslr": {
    "cameraSettings": {
      "iso": "recommended ISO value",
      "isoWhy": "Why this ISO - explain exposure triangle tradeoff for these exact conditions",
      "shutterSpeed": "recommended shutter speed",
      "shutterWhy": "Why this shutter - explain motion blur/freezing impact on clouds and water",
      "aperture": "recommended aperture",
      "apertureWhy": "Why this aperture - explain depth of field and sharpness tradeoff",
      "whiteBalance": "recommended white balance in Kelvin",
      "wbWhy": "Why this WB - explain how it affects warm vs cool rendering of dawn light"
    },
    "proTips": [
      "Specific tip about shooting in RAW format and why it matters for these conditions",
      "Specific tip about bracketing/exposure technique for this cloud cover",
      "Advanced tip about filters or technique relevant to today's exact conditions"
    ],
    "compositionTips": [
      "Specific composition using a named element at ${beach} as foreground anchor",
      "Rule of thirds or leading line technique using ${beach}'s specific geography",
      "Light and shadow opportunity unique to these atmospheric conditions at ${beach}"
    ]
  },
  "mobile": {
    "phoneSettings": {
      "nightMode": "On or Off",
      "nightModeWhy": "Why - explain how night mode processes this specific light level and whether it helps or hurts",
      "hdr": "On, Off, or Auto",
      "hdrWhy": "Why - explain the dynamic range challenge for today's sky vs foreground",
      "exposure": "adjustment value like -0.3 or +0.3",
      "exposureWhy": "Why - explain what this prevents (blown highlights or crushed shadows)",
      "additionalSetting": "One more setting (Gridlines/ProMode/etc)",
      "additionalWhy": "Why this setting helps for this shoot"
    },
    "proTips": [
      "Stability tip specific to these wind conditions",
      "Timing tip - when exactly during the golden hour to take the hero shot",
      "Post-processing tip for phone photos in these specific conditions"
    ],
    "compositionTips": [
      "Phone-specific composition at ${beach} - reference a named landmark or feature",
      "Portrait vs landscape orientation decision for today's sky conditions",
      "Reflection or foreground technique suited to ${beach}'s specific water/sand"
    ]
  },
  "beachComparison": null
}`;

    const completion = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a professional sunrise photography educator with deep knowledge of atmospheric physics, Chennai's Bay of Bengal beaches, and both DSLR and smartphone photography. You explain the WHY behind every recommendation. Always respond with valid JSON only, no markdown or code blocks."
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
    console.log('✅ Groq AI educational insights generated');

    // Always override beachComparison with deterministic calculation
    // so it uses real per-beach weather, never AI guesswork
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

/**
 * Rule-based fallback insights (research-corrected)
 */
function generateRuleBasedInsights(weatherData, allWeatherData = {}) {
  const { forecast, prediction, beach } = weatherData;
  const { cloudCover, humidity, visibility, windSpeed, temperature, precipProbability } = forecast;
  const { score, verdict, atmosphericLabels } = prediction;

  // Greeting
  let greeting;
  if (score >= 85) greeting = `🔥 Exceptional conditions lining up at ${beach} tomorrow!`;
  else if (score >= 70) greeting = `🌅 Very promising sunrise ahead at ${beach} — worth the early wake-up.`;
  else if (score >= 55) greeting = `☀️ Decent conditions at ${beach} — a good morning for practice shots.`;
  else if (score >= 40) greeting = `☁️ Moody, atmospheric light at ${beach} — low-key compositions could shine.`;
  else greeting = `🌫️ Challenging conditions at ${beach}, but interesting if you love drama.`;

  // Insight (research-corrected cloud interpretation)
  let insight;
  if (cloudCover >= 30 && cloudCover <= 60) {
    insight = `Cloud cover at ${cloudCover}% sits in the sweet spot — clouds act as a canvas, reflecting oranges and reds across the sky. Combined with ${visibility}km visibility, expect vibrant, textured colors.`;
  } else if (cloudCover < 30) {
    insight = `At only ${cloudCover}% cloud cover, the sky is quite clear — expect softer, pastel tones rather than dramatic fiery colors. Low cloud coverage means less canvas for color reflection.`;
  } else if (cloudCover <= 75) {
    insight = `Cloud cover at ${cloudCover}% is on the heavy side — expect soft, diffused light with occasional color breaks through gaps. Great for minimalist, moody compositions.`;
  } else {
    insight = `Heavy cloud cover at ${cloudCover}% will block most direct light. Colors will be subdued, but the overcast creates beautiful even lighting ideal for portrait-style beach scenes.`;
  }

  // Golden hour (peak is 10-15 min BEFORE official 6 AM)
  const goldenHour = {
    start: '5:38 AM',
    peak: '5:50 AM',
    end: '6:20 AM',
    quality: score >= 70 ? 'Very Good' : score >= 55 ? 'Good' : 'Fair',
    tip: 'Position yourself by 5:35 AM — the richest colors appear 10-15 minutes before the sun clears the horizon.'
  };

  // Atmospheric analysis (research-backed)
  const cloudRating = (cloudCover >= 30 && cloudCover <= 60) ? 'Optimal' : cloudCover < 30 ? 'Too Clear' : cloudCover <= 75 ? 'Fair' : 'Poor';
  const atmosphericAnalysis = {
    cloudCover: {
      value: cloudCover,
      rating: cloudRating,
      impact: cloudCover >= 30 && cloudCover <= 60
        ? `At ${cloudCover}%, clouds act as a reflective canvas — orange and red light from below the horizon bounces dramatically across their undersides. This is the scientifically proven optimal range for fiery sky colors.`
        : cloudCover < 30
        ? `With only ${cloudCover}% cloud cover, there's minimal canvas for the sun's colors to reflect off. Expect pale yellows and blues rather than the deep oranges and reds of a dramatic sunrise.`
        : `At ${cloudCover}% coverage, heavy clouds filter and scatter too much light. Some color may break through gaps, but overall intensity will be reduced compared to the optimal 30-60% range.`
    },
    humidity: {
      value: humidity,
      rating: humidity <= 40 ? 'Excellent' : humidity <= 55 ? 'Very Good' : humidity <= 70 ? 'Moderate' : humidity <= 85 ? 'High' : 'Very High',
      impact: humidity <= 55
        ? `At ${humidity}% humidity, atmospheric moisture is low — colors appear crisp, vivid and saturated. Low humidity is one of the key factors behind Chennai's spectacular winter sunrises.`
        : humidity <= 70
        ? `At ${humidity}% humidity, moisture begins to scatter and diffuse light subtly. Colors may appear slightly softer and less saturated than ideal, but still pleasing.`
        : `At ${humidity}% humidity, significant atmospheric moisture scatters and absorbs light. Expect noticeably muted, washed-out colors — the camera will struggle to capture vibrancy.`
    },
    visibility: {
      value: visibility,
      rating: visibility >= 15 ? 'Exceptional' : visibility >= 10 ? 'Excellent' : visibility >= 8 ? 'Very Good' : visibility >= 5 ? 'Good' : 'Poor',
      impact: `${visibility}km visibility means ${visibility >= 10 ? 'excellent atmospheric clarity — light travels cleanly, producing sharp contrast and saturated color intensity' : visibility >= 8 ? 'good clarity with slight atmospheric haze enhancing warm tones through Rayleigh scattering' : 'reduced clarity from haze or particles, softening contrast and color intensity'}.`
    },
    wind: {
      value: windSpeed,
      rating: windSpeed <= 10 ? 'Calm' : windSpeed <= 20 ? 'Light' : windSpeed <= 30 ? 'Moderate' : 'Strong',
      impact: windSpeed <= 10
        ? `At ${windSpeed}km/h, wind is calm — clouds hold their position beautifully, and long exposures up to 30 seconds are perfectly viable for silky water effects.`
        : windSpeed <= 20
        ? `Light wind at ${windSpeed}km/h maintains cloud formations with minor drift. Long exposures under 10 seconds should be stable, keep tripod legs low.`
        : `Moderate wind at ${windSpeed}km/h will move clouds during longer exposures. Stick to shutter speeds under 1/30s if you want sharp cloud edges, or embrace the motion blur artistically.`
    },
    overallPattern: `February marks Chennai's peak photography season — post-northeast monsoon departure leaves cleaner air, and winter high-pressure systems reduce humidity to annual lows. The Bay of Bengal's morning thermal gradients create dynamic cloud formations at this time of year, making Chennai beaches some of the best sunrise locations on India's east coast.`
  };

  // DSLR Settings (research-corrected, with WHY)
  const iso = cloudCover > 60 ? '400-800' : cloudCover > 30 ? '200-400' : '100-200';
  const shutter = cloudCover < 30 ? '1/125–1/250s' : cloudCover < 60 ? '1/60–1/125s' : '1/30–1/60s';
  const aperture = 'f/8–f/11';
  const wb = cloudCover < 30 ? '5500K' : '6000–6500K';

  const dslr = {
    cameraSettings: {
      iso,
      isoWhy: cloudCover > 60
        ? 'Higher ISO compensates for reduced light through cloud cover. ISO 400-800 keeps shutter fast enough to freeze cloud edges without requiring a tripod for every shot.'
        : 'ISO 200-400 balances sensitivity for dawn\'s low light while keeping digital noise minimal. RAW format will let you push exposure in post if needed.',
      shutterSpeed: shutter,
      shutterWhy: cloudCover < 30
        ? 'Faster shutter at 1/125s+ freezes crisp cloud edges and sharp reflections. Clear skies allow confident use of faster speeds without blur concerns.'
        : 'Medium shutter speed captures slight cloud movement for natural look. For 30-second+ exposures, use a neutral density filter to create that silky water effect.',
      aperture,
      apertureWhy: 'f/8-f/11 hits the optical sweet spot for most lenses — front-to-back sharpness from nearby rocks or boats all the way to the horizon without diffraction softening at f/16+.',
      whiteBalance: wb,
      wbWhy: cloudCover < 30
        ? '5500K (daylight) preserves natural warm tones of clear dawn light without adding artificial warmth that looks fake on clear skies.'
        : '6000-6500K adds slight warmth to enhance the orange-red tones already present in cloudy dawn light, making colors feel more dramatic in-camera.'
    },
    proTips: [
      'Shoot in RAW format — dawn\'s extreme dynamic range (bright sky vs dark foreground) needs the 12+ stops latitude that RAW provides. JPEG will blow highlights or crush shadows.',
      cloudCover >= 30 && cloudCover <= 60
        ? 'Bracket exposures: shoot 3 frames at -1, 0, +1 EV and blend in post. Cloud texture in the highlights will thank you.'
        : cloudCover < 30
        ? 'Use a 2-stop graduated neutral density filter to balance the bright sky with the darker foreground — especially effective at sunrise elevation angles.'
        : 'Focus on composition over exposure when clouds are heavy — HDR blending in post can recover shadow and highlight detail.',
      windSpeed <= 15
        ? 'Wind is calm — perfect for 10-30 second exposures with an ND filter to smooth water into a mirror-like glass surface against any beach element.'
        : 'Bracket focus as well as exposure — shoot at different focal distances to ensure the foreground element AND the horizon are both tack sharp.'
    ],
    compositionTips: getBeachDSLRCompositionTips(beach, cloudCover, windSpeed)
  };

  // Mobile Settings (with WHY)
  const nightMode = cloudCover > 70 ? 'On' : 'Off';
  const hdr = cloudCover > 20 ? 'Auto' : 'On';
  const exposure = cloudCover > 60 ? '+0.3' : cloudCover > 30 ? '0.0' : '-0.3';

  const mobile = {
    phoneSettings: {
      nightMode,
      nightModeWhy: cloudCover > 70
        ? 'Night Mode ON: Overcast dawn is genuinely dark — Night Mode\'s multi-frame stacking captures more detail without increasing grain.'
        : 'Night Mode OFF: It over-brightens and over-processes dawn\'s natural warm tones. The sky will look washed out and artificial. Use standard Photo mode.',
      hdr,
      hdrWhy: 'HDR AUTO lets your phone decide when to blend multiple exposures. At dawn, sky is always much brighter than the foreground — HDR bridges this gap automatically without over-processing either zone.',
      exposure,
      exposureWhy: cloudCover < 30
        ? 'Dial exposure down -0.3 to -0.7 to protect sky color saturation. Clear dawn skies are bright enough that underexposure actually helps — richer, deeper colors.'
        : cloudCover > 60
        ? 'Slight +0.3 exposure compensation lifts the foreground without fully blowing the sky. The overcast acts as natural diffusion, so the dynamic range is narrower than usual.'
        : 'Neutral exposure (0.0) works here — the 30-60% cloud cover balances the sky vs foreground contrast naturally. Trust your phone\'s metering.',
      additionalSetting: 'Gridlines: ON (Rule of Thirds)',
      additionalWhy: 'Place the horizon on the lower third line (sky-dominant composition) or upper third line (foreground-dominant). This single habit transforms phone photos from tourist snaps to intentional compositions.'
    },
    proTips: [
      windSpeed <= 15
        ? 'Camera is steady: use the 3-second self-timer after tapping to focus — eliminates all hand-shake for the crispest possible image.'
        : `Wind at ${windSpeed}km/h creates subtle vibration. Brace your elbows against your body, exhale before shooting, or lean against a fixed surface for stability.`,
      'Hero shot timing: The 3-5 minutes just as the sun disk clears the horizon (around 5:58-6:03 AM) — shoot burst mode during this exact window.',
      humidity <= 55
        ? 'Minimal post-processing needed: just bump clarity +10 and vibrance +15 in Lightroom Mobile or Snapseed. The natural atmosphere does the heavy lifting.'
        : 'In Snapseed: reduce haze with +Clarity, pull back +Warmth to compensate for humidity\'s grey tint. Lift Highlights slightly to recover sky color.'
    ],
    compositionTips: getBeachMobileCompositionTips(beach, cloudCover, windSpeed)
  };

  // Beach comparison — uses real per-beach weather data when available
  const beachComparison = generateBeachComparison(beach, cloudCover, windSpeed, visibility, humidity, allWeatherData);

  return {
    source: 'rules',
    greeting,
    insight,
    goldenHour,
    atmosphericAnalysis,
    dslr,
    mobile,
    beachComparison
  };
}

/**
 * Beach-specific DSLR composition tips
 */
function getBeachDSLRCompositionTips(beach, cloudCover, windSpeed) {
  const tips = {
    'Marina Beach': [
      'Position the lighthouse in the left third with the horizon low — leads the eye from the lighthouse silhouette across the entire sky canvas above.',
      'Fishing boats (vallamkaran) launch between 5:30-6:00 AM — time a 1/500s shot to freeze a boat mid-launch against the lit horizon for a timeless image.',
      cloudCover >= 30 ? 'The lighthouse casts a long shadow across wet sand at this light angle — use it as a leading line toward the breaking dawn.' : 'Use the long flat beach as a geometric leading line toward the sun\'s rise point on the horizon.'
    ],
    "Elliot's Beach": [
      'The Karl Schmidt Memorial (stone arch structure) provides a natural frame — shoot through or beside it with the dawn sky as your background.',
      'Clean, crowd-free sand in early morning means perfect reflections in the wet zone — use low angle (near ground level) to double the sky in reflections.',
      cloudCover >= 30 ? 'Overcast light at Elliot\'s creates beautiful even illumination on the memorial — no harsh shadows, perfect for architectural details against the sky.' : 'The Ashtalakshmi Temple dome catches first light beautifully — long lens (200mm) compression shot with temple and sunrise together.'
    ],
    'Covelong Beach': [
      'Rock formations on the south end offer multiple natural framing options — shoot between rocks to frame the sunrise point with depth and texture.',
      windSpeed <= 15 ? 'Calm conditions mean perfect 20-30 second exposures on the tidal pools — creates glass-smooth water that reflects the sky like a mirror.' : 'Wave action at Covelong is photogenic in moderate wind — use 1/500s to freeze a wave\'s crest against the orange sky for dynamic energy.',
      'The natural cove shape concentrates attention — stand at the curve\'s apex and use the bay\'s arc as a sweeping leading line toward the horizon.'
    ],
    'Thiruvanmiyur Beach': [
      'Tidal pools near the breakwater rocks are this beach\'s signature — position a rock in the foreground with the reflection of the dawn sky in the pool behind it.',
      'Breakwater rocks make excellent foreground interest — stack them with the rule of thirds to create depth from rock to horizon.',
      cloudCover >= 30 ? 'Overcast at Thiruvanmiyur + long exposure = ultra-smooth water surface that makes the sky\'s reflection perfectly clean and mirror-like.' : 'On clear mornings, the calm inshore water here creates exceptional horizon reflections. Use a wide angle and shoot near water level.'
    ]
  };

  return tips[beach] || [
    'Use a prominent foreground element to anchor the composition and create depth',
    'Place the horizon in the lower third to emphasize dramatic sky conditions',
    'Look for wet sand or tidal pools to reflect the dawn sky colors and double the color impact'
  ];
}

/**
 * Beach-specific Mobile composition tips
 */
function getBeachMobileCompositionTips(beach, cloudCover, windSpeed) {
  const tips = {
    'Marina Beach': [
      'Tap the lighthouse to lock focus and exposure — your phone will correctly expose the scene around this mid-tone anchor point rather than blowing the bright sky.',
      'Try Portrait mode with the lighthouse as subject — the shallow depth of field blurs foreground sand softly and makes the lighthouse pop against the sky.',
      'Walk to the waterline and shoot landscape orientation — the wet sand reflection doubles your sky and makes the image feel much grander on a phone screen.'
    ],
    "Elliot's Beach": [
      'Tap to expose on the sky just above the horizon — this preserves sky color while the foreground goes slightly darker, which looks intentional and dramatic.',
      'Portrait orientation works well here — the beach is narrow and tall, and the clean sand acts as a natural leading line straight to the sky.',
      'No clutter means clean negative space — minimalist compositions (just sky, thin sand strip, water line) work exceptionally well on phone sensors.'
    ],
    'Covelong Beach': [
      'Tap on a mid-tone rock in the foreground to lock exposure — your phone will balance sky and rock correctly. Avoid tapping the sky directly (underexposes everything).',
      'Landscape orientation mandatory here — the wider cove shape and rock formations need horizontal space. Portrait wastes the scenic width.',
      windSpeed <= 15 ? 'Tidal pools: squat low, phone near the water surface, tap a sky reflection in the pool to expose the reflection correctly — surreal, award-worthy phone photos.' : 'Waves + rocks: switch to burst mode (hold shutter), shoot 20+ frames, pick the one where the wave position is most dynamic.'
    ],
    'Thiruvanmiyur Beach': [
      'Get close to a tidal pool — 15-20cm from the water surface — and tap the sky reflection. Portrait or landscape both work here for this intimate foreground shot.',
      'The calmer conditions here are ideal for live photos (iPhone) or motion photos (Samsung) — a gentle 3-second ripple in a tidal pool is mesmerizing.',
      'Less dramatic than other beaches but perfect for practicing — experiment with both landscape (maximizes horizon) and portrait (emphasizes sky height) to see which works for conditions.'
    ]
  };

  return tips[beach] || [
    'Tap to lock focus and exposure on a mid-tone element, not the bright sky',
    'Try landscape orientation to maximize the horizon and sky canvas',
    'Find a reflection in wet sand or tidal pools to create a symmetrical composition'
  ];
}

/**
 * Generate beach comparison for all 4 beaches
 */
/**
 * Generate beach comparison using REAL per-beach weather data.
 * allWeatherData = { marina: weatherData, elliot: weatherData, ... }
 * Falls back to single-beach estimation if parallel data unavailable.
 */
function generateBeachComparison(currentBeach, cloudCover, windSpeed, visibility, humidity, allWeatherData = {}) {

  // Score each beach from its own actual weather, or fall back to selected beach conditions
  function getBeachConditions(key) {
    const d = allWeatherData[key];
    if (d && d.forecast) {
      return {
        cloudCover:  d.forecast.cloudCover,
        windSpeed:   d.forecast.windSpeed,
        visibility:  d.forecast.visibility,
        humidity:    d.forecast.humidity
      };
    }
    // Fallback: use selected beach conditions
    return { cloudCover, windSpeed, visibility, humidity };
  }

  function scoreBeach(key) {
    const c = getBeachConditions(key);
    const isCalm      = c.windSpeed  <= 15;
    const isOptCloud  = c.cloudCover >= 30 && c.cloudCover <= 60;
    const isGoodVis   = c.visibility >= 8;
    const isLowHumid  = c.humidity   <= 55;

    // Numeric score 0–100 mirroring the main prediction logic
    let score = 50;
    if (isOptCloud)  score += 20;
    else if (c.cloudCover < 30 || c.cloudCover > 75) score -= 10;
    if (isGoodVis)   score += 15;
    if (isCalm)      score += 10;
    if (isLowHumid)  score += 5;
    return { score, isCalm, isOptCloud, isGoodVis, c };
  }

  const BEACH_NAMES = {
    marina: 'Marina Beach',
    elliot: "Elliot's Beach",
    covelong: 'Covelong Beach',
    thiruvanmiyur: 'Thiruvanmiyur Beach'
  };

  // Compute real scores for all 4
  const scores = {};
  ['marina','elliot','covelong','thiruvanmiyur'].forEach(k => { scores[k] = scoreBeach(k); });

  // Suitability label from score
  function suitLabel(score) {
    if (score >= 80) return 'Best';
    if (score >= 65) return 'Good';
    if (score >= 45) return 'Fair';
    return 'Poor';
  }

  // Beach-specific reason using its own real conditions
  function beachReason(key) {
    const { isCalm, isOptCloud, isGoodVis, c } = scores[key];
    const reasons = {
      marina: isOptCloud && isGoodVis
        ? 'Optimal clouds + the lighthouse silhouette = textbook dramatic sunrise. Marina shines brightest when skies are dynamic.'
        : c.cloudCover < 30
        ? 'Clear skies at Marina — the lighthouse still makes a great silhouette, but sky drama will be limited.'
        : 'Heavy clouds reduce Marina\'s drama advantage. Still worth it for the lighthouse as a composition anchor.',
      elliot: isCalm
        ? 'Calm wind means perfect flat wet-sand reflections. Elliot\'s clean foreground makes it excellent for reflection compositions today.'
        : 'Elliot\'s clean environment suits most conditions. The Karl Schmidt Memorial gives you a compositional anchor regardless of sky quality.',
      covelong: isCalm && isOptCloud
        ? 'Covelong with optimal clouds and calm wind is a rare perfect combination — tidal pool reflections + dramatic sky = portfolio-worthy image.'
        : isCalm
        ? 'Calm water at Covelong enables stunning long exposures on the tidal pools. Worth the drive if you\'re serious about the shot.'
        : 'Moderate wind at Covelong creates wave energy — good for action shots but harder to do long-exposure tidal pool work.',
      thiruvanmiyur: c.humidity > 70
        ? 'Thiruvanmiyur\'s calm, intimate setting handles hazy conditions well — the foreground interest of rocks and pools compensates for sky quality.'
        : 'Thiruvanmiyur suits moody, atmospheric conditions. Accessible and crowd-free \u2014 ideal for practice shoots or intimate compositions.'
    };
    return reasons[key] || 'Conditions are suitable for photography at this beach.';
  }

  // Find the true best: highest score, with beach character as tiebreaker
  let bestBeach = 'marina';
  let bestScore = -1;
  Object.entries(scores).forEach(([k, v]) => {
    if (v.score > bestScore) { bestScore = v.score; bestBeach = k; }
  });

  const beaches = {};
  ['marina','elliot','covelong','thiruvanmiyur'].forEach(k => {
    beaches[k] = {
      suitability: suitLabel(scores[k].score),
      reason: beachReason(k)
    };
  });

  return {
    todaysBest: bestBeach,
    reason: beachReason(bestBeach),
    beaches
  };
}

module.exports = { generatePhotographyInsights };