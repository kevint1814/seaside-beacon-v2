// ═══════════════════════════════════════════════
// SEASIDE BEACON
// Liquid Glass · Beach Sunrise · Ultra Premium
// ═══════════════════════════════════════════════

const CONFIG = {
  API_URL: (window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://api.seasidebeacon.com/api'
};

const state = {
  beach:'marina', weather:null, photography:null, loading:false,
  _loadInterval:null, _pipeTimeouts:[]
};

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initIntro();
  initSunriseCanvas();
  initScrollProgress();
  initNav();
  initBeachSelector();
  initForecast();
  initTabs();
  initDeepPanel();
  initModals();
  initSubscribeForms();
  initCommunity();
  initShare();
  initScrollReveal();
  initMetrics();
  initCinemaMode();
});

// ═════════════════════════════════════════════════════
// CINEMATIC INTRO
// ═════════════════════════════════════════════════════
function initIntro() {
  const veil = document.getElementById('introVeil');
  if (!veil) return;
  document.documentElement.classList.add('loading');

  // Activate: mark fades in
  requestAnimationFrame(() => {
    veil.classList.add('active');
  });

  // After 1.8s, fade out veil and reveal page
  setTimeout(() => {
    veil.classList.add('fade-out');
    document.documentElement.classList.remove('loading');
    // Remove from DOM after transition
    setTimeout(() => veil.remove(), 900);
  }, 1800);
}

// ═════════════════════════════════════════════════════
// SUNRISE CANVAS — real pre-dawn beach sky physics
// ═════════════════════════════════════════════════════
function initSunriseCanvas() {
  const canvas = document.getElementById('sunriseCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H;
  let scrollProgress = 0; // 0 = deep night, 1 = full morning

  // Stable star positions
  const STARS = Array.from({length:110}, (_,i) => ({
    x: pseudoRand(i*17+3),
    y: pseudoRand(i*7+11) * 0.7,
    r: 0.4 + pseudoRand(i*31+7) * 1.1,
    twinkleSpeed: 0.0008 + pseudoRand(i*13) * 0.0016,
    twinklePhase: pseudoRand(i*19) * Math.PI * 2,
    brightness: 0.2 + pseudoRand(i*23) * 0.7
  }));

  // Scroll listener — maps page scroll to sunrise progress
  function updateScroll() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const raw = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    // Map first 85% of page scroll to the full sunrise (0→1)
    // Sunrise keeps progressing through most of the page
    scrollProgress = Math.min(1, raw / 0.85);
  }

  let scrollTick = false;
  window.addEventListener('scroll', () => {
    if (!scrollTick) {
      scrollTick = true;
      requestAnimationFrame(() => { updateScroll(); scrollTick = false; });
    }
  }, { passive: true });
  updateScroll(); // initial

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x to save GPU
    const cssW = canvas.offsetWidth;
    const cssH = canvas.offsetHeight;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    W = canvas.width;
    H = canvas.height;
  }

  // Easing — smooth the scroll transitions
  function ease(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

  // Interpolate between two RGB colors
  function lerpColor(a, b, t) {
    return [
      Math.round(a[0] + (b[0]-a[0]) * t),
      Math.round(a[1] + (b[1]-a[1]) * t),
      Math.round(a[2] + (b[2]-a[2]) * t)
    ];
  }

  // Multi-stop color interpolation
  function multiLerp(stops, t) {
    if (t <= 0) return stops[0][1];
    if (t >= 1) return stops[stops.length-1][1];
    for (let i = 0; i < stops.length-1; i++) {
      if (t >= stops[i][0] && t <= stops[i+1][0]) {
        const local = (t - stops[i][0]) / (stops[i+1][0] - stops[i][0]);
        return lerpColor(stops[i][1], stops[i+1][1], local);
      }
    }
    return stops[stops.length-1][1];
  }

  /*
   * Sky color palettes across sunrise phases:
   *   0.00 = deep pre-dawn (existing dark indigo)
   *   0.20 = civil twilight (purple/violet horizon)
   *   0.40 = golden hour (warm amber/peach) — PEAK DRAMA
   *   0.55 = sun clearing horizon (golden afterglow)
   *   0.70 = early morning (warm blue emerging)
   *   0.85 = morning established (vibrant warm blue sky)
   *   1.00 = settled morning (deep sky blue, still warm)
   */

  // Zenith — punchier purples, warm-tinted blues that stay rich
  const zenithStops = [
    [0.0,  [8, 6, 22]],
    [0.10, [16, 12, 42]],
    [0.22, [38, 24, 72]],
    [0.34, [62, 38, 96]],
    [0.44, [72, 45, 88]],
    [0.56, [48, 62, 105]],
    [0.68, [38, 72, 118]],
    [0.80, [45, 88, 148]],
    [0.90, [58, 108, 168]],
    [1.0,  [72, 125, 185]]
  ];

  // Mid-sky — richer magentas, warm blue that holds colour
  const midStops = [
    [0.0,  [12, 10, 35]],
    [0.12, [32, 22, 68]],
    [0.24, [88, 40, 88]],
    [0.34, [148, 58, 78]],
    [0.44, [192, 92, 68]],
    [0.52, [168, 80, 62]],
    [0.62, [108, 68, 78]],
    [0.74, [72, 68, 105]],
    [0.86, [58, 65, 108]],
    [1.0,  [52, 62, 102]]
  ];

  // Horizon — vivid fire, amber lingers to the very end
  const horizonStops = [
    [0.0,  [75, 32, 20]],
    [0.10, [138, 55, 24]],
    [0.22, [218, 88, 32]],
    [0.32, [252, 125, 42]],
    [0.42, [255, 175, 62]],
    [0.52, [255, 158, 55]],
    [0.62, [218, 118, 48]],
    [0.74, [178, 100, 50]],
    [0.86, [148, 85, 45]],
    [1.0,  [118, 78, 48]]
  ];

  // Glow — amber-orange, stays alive through the full page
  const glowStops = [
    [0.0,  [248, 138, 58]],
    [0.15, [255, 168, 62]],
    [0.28, [255, 195, 72]],
    [0.40, [255, 210, 82]],
    [0.52, [255, 188, 68]],
    [0.65, [245, 158, 62]],
    [0.78, [208, 128, 58]],
    [0.90, [158, 95, 52]],
    [1.0,  [115, 72, 42]]
  ];

  // Sea — warm reflections held, deeper but never dead
  const seaStops = [
    [0.0,  [6, 8, 18]],
    [0.15, [12, 18, 38]],
    [0.28, [18, 28, 52]],
    [0.40, [22, 35, 58]],
    [0.52, [20, 32, 55]],
    [0.65, [18, 30, 52]],
    [0.80, [16, 28, 48]],
    [1.0,  [14, 25, 45]]
  ];

  // Cloud color — golden lit during peak, warm-tinted later (not grey)
  const cloudColorStops = [
    [0,    [140, 72, 42]],
    [0.25, [218, 128, 55]],
    [0.40, [255, 210, 115]],
    [0.55, [248, 195, 108]],
    [0.70, [178, 138, 92]],
    [0.85, [118, 98, 78]],
    [1.0,  [82, 72, 62]]
  ];

  // Volumetric cloud configs — wisps + puffy cumulus
  const wispConfigs = [
    { yBase: 0.35, thick: 5,  speed: 0.000065, phase: 0.0,  wMul: 0.32 },
    { yBase: 0.40, thick: 7,  speed: 0.000050, phase: 0.9,  wMul: 0.26 },
    { yBase: 0.45, thick: 9,  speed: 0.000080, phase: 1.6,  wMul: 0.30 },
    { yBase: 0.50, thick: 11, speed: 0.000060, phase: 0.3,  wMul: 0.38 },
    { yBase: 0.54, thick: 9,  speed: 0.000095, phase: 2.1,  wMul: 0.28 },
    { yBase: 0.58, thick: 14, speed: 0.000045, phase: 1.1,  wMul: 0.42 },
    { yBase: 0.62, thick: 16, speed: 0.000038, phase: 0.6,  wMul: 0.45 },
    { yBase: 0.66, thick: 12, speed: 0.000072, phase: 1.8,  wMul: 0.35 },
  ];

  // Puffy cloud bank configs — larger, softer, appear mid-sunrise
  const puffConfigs = [
    // Original 5 — boosted sizes
    { cx: 0.18, cy: 0.28, rx: 0.14, ry: 0.030, phase: 0.0,  speed: 0.000025 },
    { cx: 0.72, cy: 0.32, rx: 0.16, ry: 0.035, phase: 1.2,  speed: 0.000020 },
    { cx: 0.42, cy: 0.22, rx: 0.12, ry: 0.025, phase: 2.4,  speed: 0.000030 },
    { cx: 0.85, cy: 0.26, rx: 0.11, ry: 0.026, phase: 0.7,  speed: 0.000028 },
    { cx: 0.28, cy: 0.38, rx: 0.13, ry: 0.032, phase: 1.8,  speed: 0.000022 },
    // 5 new cloud banks — varied altitudes
    { cx: 0.55, cy: 0.18, rx: 0.15, ry: 0.028, phase: 3.1,  speed: 0.000018 },
    { cx: 0.08, cy: 0.35, rx: 0.10, ry: 0.024, phase: 0.4,  speed: 0.000032 },
    { cx: 0.92, cy: 0.20, rx: 0.13, ry: 0.026, phase: 2.0,  speed: 0.000024 },
    { cx: 0.35, cy: 0.42, rx: 0.11, ry: 0.022, phase: 1.5,  speed: 0.000026 },
    { cx: 0.65, cy: 0.15, rx: 0.17, ry: 0.032, phase: 0.9,  speed: 0.000015 },
  ];

  // 24 rays for denser god-ray fan
  const rayConfigs = [
    { angle: -0.68, width: 12, lenMul: 0.70 },
    { angle: -0.58, width: 22, lenMul: 0.88 },
    { angle: -0.50, width: 34, lenMul: 1.05 },
    { angle: -0.42, width: 16, lenMul: 0.78 },
    { angle: -0.35, width: 40, lenMul: 1.12 },
    { angle: -0.28, width: 20, lenMul: 0.85 },
    { angle: -0.22, width: 46, lenMul: 1.18 },
    { angle: -0.15, width: 26, lenMul: 0.92 },
    { angle: -0.09, width: 50, lenMul: 1.20 },
    { angle: -0.03, width: 18, lenMul: 0.82 },
    { angle:  0.03, width: 48, lenMul: 1.18 },
    { angle:  0.09, width: 22, lenMul: 0.88 },
    { angle:  0.15, width: 44, lenMul: 1.15 },
    { angle:  0.22, width: 28, lenMul: 0.95 },
    { angle:  0.28, width: 38, lenMul: 1.10 },
    { angle:  0.35, width: 14, lenMul: 0.75 },
    { angle:  0.42, width: 32, lenMul: 1.02 },
    { angle:  0.50, width: 24, lenMul: 0.90 },
    { angle:  0.58, width: 16, lenMul: 0.78 },
    { angle:  0.65, width: 28, lenMul: 0.85 },
    { angle:  0.72, width: 10, lenMul: 0.68 },
    { angle: -0.45, width: 8,  lenMul: 0.60 },
    { angle:  0.48, width: 10, lenMul: 0.65 },
    { angle: -0.02, width: 55, lenMul: 1.22 },
  ];

  // ── Airplane configs — blinking lights crossing the sky ──
  // ── Cinematic text — single Apple-ad sequence, cinema mode only ──
  // Appears after sun is fully up (sp > 0.65)

  function draw(t) {
    const sp = ease(scrollProgress);

    const breathAmp = 1 - sp * 0.8;
    const breath = 0.5 + 0.5 * Math.sin(t * 0.000022);
    const warmth = breath * breathAmp * 0.18;

    // ── Sky gradient ──────────────────────────
    const zenith  = multiLerp(zenithStops, sp);
    const mid     = multiLerp(midStops, sp);
    const horizon = multiLerp(horizonStops, sp);

    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    // 10 stops for butter-smooth pre-dawn blending — no visible banding
    const zm1 = lerpColor(zenith, mid, 0.18);
    const zm2 = lerpColor(zenith, mid, 0.42);
    const zm3 = lerpColor(zenith, mid, 0.68);
    const mh1 = lerpColor(mid, horizon, 0.25);
    const mh2 = lerpColor(mid, horizon, 0.55);
    const mh3 = lerpColor(mid, horizon, 0.80);
    sky.addColorStop(0,    `rgb(${zenith[0]},${zenith[1]},${zenith[2]})`);
    sky.addColorStop(0.10, `rgb(${zm1[0]},${zm1[1]},${zm1[2]})`);
    sky.addColorStop(0.22, `rgb(${zm2[0]},${zm2[1]},${zm2[2]})`);
    sky.addColorStop(0.36, `rgb(${zm3[0]},${zm3[1]},${zm3[2]})`);
    sky.addColorStop(0.48, `rgb(${mid[0]},${mid[1]},${mid[2]})`);
    sky.addColorStop(0.58, `rgb(${mh1[0]},${mh1[1]},${mh1[2]})`);
    sky.addColorStop(0.70, `rgb(${mh2[0]},${mh2[1]},${mh2[2]})`);
    sky.addColorStop(0.82, `rgb(${mh3[0]},${mh3[1]},${mh3[2]})`);
    sky.addColorStop(0.92, `rgb(${Math.round(horizon[0]*0.92+mid[0]*0.08)},${Math.round(horizon[1]*0.92+mid[1]*0.08)},${Math.round(horizon[2]*0.92+mid[2]*0.08)})`);
    sky.addColorStop(1,    `rgb(${horizon[0]},${horizon[1]},${horizon[2]})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.75);

    // ── Horizon glow — bigger, brighter ──
    const gc = multiLerp(glowStops, sp);
    const glowPeak = sp < 0.5 ? sp * 2 : Math.max(0.15, 2 - sp * 2.1);
    const glowIntensity = 0.18 + glowPeak * 0.58 + warmth;
    const horizonY = H * 0.72;

    const glowR = ctx.createRadialGradient(W*0.5, horizonY, 0, W*0.5, horizonY, W * (0.55 + sp*0.35));
    glowR.addColorStop(0,    `rgba(${gc[0]},${gc[1]},${gc[2]},${glowIntensity})`);
    glowR.addColorStop(0.18, `rgba(${gc[0]},${gc[1]},${gc[2]},${glowIntensity*0.68})`);
    glowR.addColorStop(0.42, `rgba(${Math.max(0,gc[0]-35)},${Math.max(0,gc[1]-25)},${Math.max(0,gc[2]-12)},${glowIntensity*0.32})`);
    glowR.addColorStop(0.70, `rgba(${Math.max(0,gc[0]-65)},${Math.max(0,gc[1]-45)},${Math.max(0,gc[2]-22)},${glowIntensity*0.10})`);
    glowR.addColorStop(1,    `rgba(0,0,0,0)`);
    ctx.fillStyle = glowR;
    ctx.fillRect(0, 0, W, H * 0.75);

    // ── Warm atmospheric wash — stronger, wider ──
    if (sp > 0.15) {
      const washPeak = sp < 0.50 ? (sp - 0.15) / 0.35 : Math.max(0.12, 1 - (sp - 0.50) / 0.55);
      const washStr = washPeak * 0.10;
      const wash = ctx.createRadialGradient(W*0.5, horizonY * 0.55, 0, W*0.5, horizonY * 0.55, W * 0.90);
      wash.addColorStop(0,   `rgba(195,118,58,${washStr})`);
      wash.addColorStop(0.4, `rgba(155,82,42,${washStr * 0.5})`);
      wash.addColorStop(1,   `rgba(0,0,0,0)`);
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W, H * 0.75);
    }

    // ── Puffy volumetric clouds — fade in from ~20%, lit by sun ──
    if (sp > 0.20) {
      const cloudFade = Math.min(1, (sp - 0.20) / 0.20);
      const cCol = multiLerp(cloudColorStops, sp);
      // Later in sunrise, clouds get a blue-white top-light
      const blueBlend = Math.max(0, (sp - 0.65) / 0.35);
      const cR = Math.round(cCol[0] + (200 - cCol[0]) * blueBlend * 0.4);
      const cG = Math.round(cCol[1] + (210 - cCol[1]) * blueBlend * 0.4);
      const cB = Math.round(cCol[2] + (225 - cCol[2]) * blueBlend * 0.5);

      for (let p = 0; p < puffConfigs.length; p++) {
        const pc = puffConfigs[p];
        const drift = (t * pc.speed + pc.phase) % 2.0 - 0.3;
        const px = (pc.cx + drift) * W;
        const py = pc.cy * H * 0.75;
        const rx = pc.rx * W;
        const ry = pc.ry * H;
        // Distance from sun center affects brightness
        const distSun = Math.abs((pc.cx + drift) - 0.5);
        const litFactor = Math.max(0.3, 1 - distSun * 1.5);
        const pAlpha = cloudFade * 0.22 * litFactor;

        ctx.save();
        ctx.translate(px, py);
        ctx.scale(1, ry / rx);
        const pGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        pGrad.addColorStop(0,   `rgba(${cR},${cG},${cB},${pAlpha * 1.2})`);
        pGrad.addColorStop(0.3, `rgba(${cR},${cG},${cB},${pAlpha * 0.8})`);
        pGrad.addColorStop(0.6, `rgba(${cCol[0]},${cCol[1]},${cCol[2]},${pAlpha * 0.35})`);
        pGrad.addColorStop(1,   `rgba(0,0,0,0)`);
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Sun disc (appears after 18% scroll) — bigger, more layered ──
    if (sp > 0.18) {
      const sunProgress = Math.min(1, (sp - 0.18) / 0.58);
      const sunEased = ease(sunProgress);
      const sunY = horizonY - sunEased * H * 0.38;
      const sunR = 42 + sunEased * 38;
      const sunAlpha = Math.min(1, sunProgress * 2.2);

      // Layer 1: atmospheric haze — enormous
      const hazeR = sunR * 22;
      const haze = ctx.createRadialGradient(W*0.5, sunY, 0, W*0.5, sunY, hazeR);
      haze.addColorStop(0,    `rgba(255,218,138,${sunAlpha * 0.26})`);
      haze.addColorStop(0.10, `rgba(255,195,108,${sunAlpha * 0.18})`);
      haze.addColorStop(0.28, `rgba(255,168,78,${sunAlpha * 0.08})`);
      haze.addColorStop(0.50, `rgba(255,148,58,${sunAlpha * 0.03})`);
      haze.addColorStop(1,    `rgba(255,132,42,0)`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);

      // Layer 2: far corona — wider
      const coronaR = sunR * 8;
      const corona = ctx.createRadialGradient(W*0.5, sunY, sunR * 0.4, W*0.5, sunY, coronaR);
      corona.addColorStop(0,   `rgba(255,232,158,${sunAlpha * 0.55})`);
      corona.addColorStop(0.18,`rgba(255,205,115,${sunAlpha * 0.32})`);
      corona.addColorStop(0.42,`rgba(255,175,82,${sunAlpha * 0.14})`);
      corona.addColorStop(1,   `rgba(255,152,62,0)`);
      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(W*0.5, sunY, coronaR, 0, Math.PI*2);
      ctx.fill();

      // Layer 3: inner glow
      const innerGlow = ctx.createRadialGradient(W*0.5, sunY, 0, W*0.5, sunY, sunR * 3);
      innerGlow.addColorStop(0,   `rgba(255,252,235,${sunAlpha * 0.72})`);
      innerGlow.addColorStop(0.22,`rgba(255,238,178,${sunAlpha * 0.45})`);
      innerGlow.addColorStop(0.50,`rgba(255,215,125,${sunAlpha * 0.18})`);
      innerGlow.addColorStop(1,   `rgba(255,192,88,0)`);
      ctx.fillStyle = innerGlow;
      ctx.beginPath();
      ctx.arc(W*0.5, sunY, sunR * 3, 0, Math.PI*2);
      ctx.fill();

      // Layer 4: sun disc — hot white center, amber edge
      const sunDisc = ctx.createRadialGradient(W*0.5, sunY, 0, W*0.5, sunY, sunR);
      sunDisc.addColorStop(0,    `rgba(255,255,248,${sunAlpha * 0.99})`);
      sunDisc.addColorStop(0.25, `rgba(255,248,215,${sunAlpha * 0.97})`);
      sunDisc.addColorStop(0.55, `rgba(255,225,148,${sunAlpha * 0.93})`);
      sunDisc.addColorStop(0.80, `rgba(255,195,98,${sunAlpha * 0.72})`);
      sunDisc.addColorStop(1,    `rgba(255,172,65,${sunAlpha * 0.22})`);
      ctx.fillStyle = sunDisc;
      ctx.beginPath();
      ctx.arc(W*0.5, sunY, sunR, 0, Math.PI*2);
      ctx.fill();

      // Layer 5: lens flare streak — amber tint
      if (sunAlpha > 0.3) {
        const flareStr = (sunAlpha - 0.3) * 0.12;
        const flareGrad = ctx.createLinearGradient(W*0.5 - sunR*6, sunY, W*0.5 + sunR*6, sunY);
        flareGrad.addColorStop(0,   `rgba(255,195,118,0)`);
        flareGrad.addColorStop(0.3, `rgba(255,215,148,${flareStr * 0.3})`);
        flareGrad.addColorStop(0.5, `rgba(255,238,192,${flareStr})`);
        flareGrad.addColorStop(0.7, `rgba(255,215,148,${flareStr * 0.3})`);
        flareGrad.addColorStop(1,   `rgba(255,195,118,0)`);
        ctx.fillStyle = flareGrad;
        ctx.fillRect(W*0.5 - sunR*6, sunY - 2, sunR*12, 4);
      }
    }

    // ── Sea — brightens as sun rises (real physics) ────
    const seaC = multiLerp(seaStops, sp);
    // Mix sky color into sea as light increases
    const skyBlend = Math.min(0.35, sp * 0.45); // water picks up sky colour
    const litSea = [
      Math.round(seaC[0] + (zenith[0] * 0.3 + horizon[0] * 0.2) * skyBlend),
      Math.round(seaC[1] + (zenith[1] * 0.3 + horizon[1] * 0.2) * skyBlend),
      Math.round(seaC[2] + (zenith[2] * 0.3 + horizon[2] * 0.2) * skyBlend)
    ];
    const seaGrad = ctx.createLinearGradient(0, H*0.72, 0, H);
    seaGrad.addColorStop(0, `rgb(${litSea[0]},${litSea[1]},${litSea[2]})`);
    seaGrad.addColorStop(0.4, `rgb(${Math.round(litSea[0]*0.92)},${Math.round(litSea[1]*0.92)},${Math.round(litSea[2]*0.95)})`);
    seaGrad.addColorStop(1, `rgb(${Math.max(0,litSea[0]-6)},${Math.max(0,litSea[1]-5)},${Math.max(0,litSea[2]-3)})`);
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, H*0.72, W, H * 0.28);

    // ── Diffuse sky reflection on water — whole surface lightens ──
    if (sp > 0.30) {
      const diffuse = Math.min(0.12, (sp - 0.30) * 0.20);
      const diffGrad = ctx.createLinearGradient(0, H*0.72, 0, H);
      diffGrad.addColorStop(0, `rgba(${zenith[0]},${zenith[1]},${zenith[2]},${diffuse})`);
      diffGrad.addColorStop(0.5, `rgba(${mid[0]},${mid[1]},${mid[2]},${diffuse * 0.5})`);
      diffGrad.addColorStop(1, `rgba(0,0,0,0)`);
      ctx.fillStyle = diffGrad;
      ctx.fillRect(0, H*0.72, W, H * 0.28);
    }

    // ── Sea reflection — bigger, brighter ─────────
    const reflC = multiLerp(glowStops, sp);
    const reflIntensity = 0.08 + glowPeak * 0.30 + warmth;
    const refX = W * 0.5;
    const reflW = W * (0.12 + sp * 0.20);
    const seaTop = H * 0.72;
    const seaH = H * 0.28;

    ctx.save();
    ctx.translate(refX, seaTop);
    ctx.scale(1, seaH / reflW);
    const reflRadial = ctx.createRadialGradient(0, 0, 0, 0, 0, reflW);
    reflRadial.addColorStop(0,    `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.95})`);
    reflRadial.addColorStop(0.12, `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.70})`);
    reflRadial.addColorStop(0.32, `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.38})`);
    reflRadial.addColorStop(0.58, `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.14})`);
    reflRadial.addColorStop(0.82, `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.04})`);
    reflRadial.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = reflRadial;
    ctx.beginPath();
    ctx.arc(0, 0, reflW, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bright horizon kiss
    if (sp > 0.25) {
      const coreP = Math.min(1, (sp - 0.25) / 0.28);
      const coreFade = sp > 0.72 ? Math.max(0.15, 1 - (sp - 0.72) / 0.3) : 1;
      const coreStr = coreP * coreFade * 0.35;
      if (coreStr > 0.01) {
        const coreRx = reflW * 0.75;
        const coreRy = H * 0.07;
        ctx.save();
        ctx.translate(refX, seaTop + 2);
        ctx.scale(1, coreRy / coreRx);
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRx);
        coreGrad.addColorStop(0,   `rgba(255,245,190,${coreStr})`);
        coreGrad.addColorStop(0.28,`rgba(255,222,140,${coreStr * 0.5})`);
        coreGrad.addColorStop(0.65,`rgba(255,198,95,${coreStr * 0.12})`);
        coreGrad.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, 0, coreRx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Scattered shimmer fragments — scale with sun brightness
    if (sp > 0.20) {
      const shimBase = Math.min(1, (sp - 0.20) / 0.22);
      const shimmerAlpha = shimBase * Math.max(0.25, glowPeak);
      for (let s = 0; s < 26; s++) {
        const sx = refX + (pseudoRand(s*31+5) - 0.5) * reflW * 3.2;
        const sy = H * (0.735 + pseudoRand(s*17+3) * 0.22);
        const sw = 5 + pseudoRand(s*23) * 28;
        const sh = 1 + pseudoRand(s*11) * 2;
        const flickerSpeed = 0.0012 + pseudoRand(s*7) * 0.005;
        const flicker = 0.2 + 0.8 * Math.abs(Math.sin(t * flickerSpeed + s * 2.1));
        const distFade = 1 - (sy - H*0.73) / (H*0.24);
        const sa = shimmerAlpha * flicker * 0.14 * Math.max(0, distFade);
        if (sa < 0.004) continue;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, sh / sw);
        const shimGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sw);
        shimGrad.addColorStop(0,   `rgba(${reflC[0]},${Math.min(255,reflC[1]+40)},${Math.min(255,reflC[2]+30)},${sa})`);
        shimGrad.addColorStop(0.45,`rgba(${reflC[0]},${Math.min(255,reflC[1]+22)},${Math.min(255,reflC[2]+18)},${sa * 0.4})`);
        shimGrad.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = shimGrad;
        ctx.beginPath();
        ctx.arc(0, 0, sw, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Sky/sea transition — seamless blend ──
    // Paint a soft gradient that bridges the horizon color into the sea
    {
      const transH = H * 0.08;
      const transY = H * 0.72 - transH * 0.35;
      const hc = multiLerp(horizonStops, sp);
      const sc = multiLerp(seaStops, sp);
      const transGrad = ctx.createLinearGradient(0, transY, 0, transY + transH);
      transGrad.addColorStop(0, `rgba(${hc[0]},${hc[1]},${hc[2]},0)`);
      transGrad.addColorStop(0.35, `rgba(${Math.round((hc[0]+sc[0])*0.5)},${Math.round((hc[1]+sc[1])*0.5)},${Math.round((hc[2]+sc[2])*0.5)},0.35)`);
      transGrad.addColorStop(0.65, `rgba(${sc[0]},${sc[1]},${sc[2]},0.25)`);
      transGrad.addColorStop(1, `rgba(${sc[0]},${sc[1]},${sc[2]},0)`);
      ctx.fillStyle = transGrad;
      ctx.fillRect(0, transY, W, transH);
    }

    // ── Lens flare — sun-centered bloom + soft radial rays ──
    if (sp > 0.25) {
      const sunY = H * (0.72 - sp * 0.35);
      const sunX = W * 0.5;
      const sunR = W * (0.04 + sp * 0.06);
      const flarePeak = sp < 0.55 ? (sp - 0.25) / 0.30 : Math.max(0.25, 1 - (sp - 0.55) / 0.55);

      // Large soft bloom around the sun
      const bloomR = sunR * (3.5 + flarePeak * 2);
      const bloomAlpha = flarePeak * 0.28;
      const bloom = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, bloomR);
      bloom.addColorStop(0, `rgba(255,250,230,${bloomAlpha})`);
      bloom.addColorStop(0.3, `rgba(255,240,200,${bloomAlpha * 0.5})`);
      bloom.addColorStop(0.6, `rgba(255,225,170,${bloomAlpha * 0.15})`);
      bloom.addColorStop(1, `rgba(255,210,150,0)`);
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(sunX, sunY, bloomR, 0, Math.PI * 2);
      ctx.fill();

      // Soft radial rays from sun — varied length, thin, natural
      if (flarePeak > 0.15) {
        const rayAlpha = (flarePeak - 0.15) * 0.16;
        ctx.save();
        ctx.translate(sunX, sunY);
        for (let r = 0; r < 12; r++) {
          const angle = (r / 12) * Math.PI * 2 + 0.18;
          const len = sunR * (2.2 + pseudoRand(r * 7 + 3) * 3.5);
          const width = 1 + pseudoRand(r * 11) * 2;
          const rAlpha = rayAlpha * (0.4 + pseudoRand(r * 13) * 0.6);

          ctx.save();
          ctx.rotate(angle);
          const rGrad = ctx.createLinearGradient(sunR * 0.7, 0, len, 0);
          rGrad.addColorStop(0, `rgba(255,248,220,${rAlpha})`);
          rGrad.addColorStop(0.3, `rgba(255,238,195,${rAlpha * 0.4})`);
          rGrad.addColorStop(0.7, `rgba(255,228,175,${rAlpha * 0.08})`);
          rGrad.addColorStop(1, `rgba(255,220,160,0)`);
          ctx.fillStyle = rGrad;
          ctx.fillRect(sunR * 0.7, -width * 0.5, len - sunR * 0.7, width);
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // ── Cinematic color grading — warm tint overlay ──
    {
      // Warm amber wash — stronger across the whole sunrise
      const gradeWarm = sp < 0.5 ? sp * 0.14 : Math.max(0.03, 0.07 - (sp - 0.5) * 0.06);
      if (gradeWarm > 0.005) {
        ctx.fillStyle = `rgba(200,110,35,${gradeWarm})`;
        ctx.fillRect(0, 0, W, H);
      }
      // Secondary golden wash — concentrated around horizon
      const horizGold = sp < 0.55 ? sp * 0.10 : Math.max(0.02, 0.055 - (sp - 0.55) * 0.05);
      if (horizGold > 0.005) {
        const goldG = ctx.createLinearGradient(0, H * 0.4, 0, H * 0.85);
        goldG.addColorStop(0, `rgba(220,140,40,0)`);
        goldG.addColorStop(0.4, `rgba(220,140,40,${horizGold})`);
        goldG.addColorStop(0.7, `rgba(200,100,30,${horizGold * 0.6})`);
        goldG.addColorStop(1, `rgba(180,80,25,0)`);
        ctx.fillStyle = goldG;
        ctx.fillRect(0, H * 0.4, W, H * 0.45);
      }
      // Cool blue vignette on edges — cinematic framing
      const vigStr = 0.12 + sp * 0.06;
      const vigR = Math.max(W, H) * 0.75;
      const vig = ctx.createRadialGradient(W * 0.5, H * 0.45, vigR * 0.45, W * 0.5, H * 0.45, vigR);
      vig.addColorStop(0, `rgba(0,0,0,0)`);
      vig.addColorStop(0.7, `rgba(0,0,0,0)`);
      vig.addColorStop(1, `rgba(8,10,25,${vigStr})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Fishermen boat silhouettes — cinematic horizon spread ──
    if (sp > 0.12) {
      const boatAlpha = Math.min(1, (sp - 0.12) / 0.25);
      ctx.save();

      // 7 boats: 2 large center-horizon, 3 medium flanking, 2 small distant
      // Spread to frame the sun — nothing dead center to keep the glow clear
      const boats = [
        // Large trawlers — center horizon, flanking the sun path
        { x: 0.38, y: 0.718, scale: 1.0,  bobSpeed: 0.0006, bobPhase: 0.0,  type: 'trawler', driftSpeed: 0.00003, driftRange: 0.04 },
        { x: 0.62, y: 0.716, scale: 0.92, bobSpeed: 0.0007, bobPhase: 2.2,  type: 'trawler', driftSpeed: 0.000025, driftRange: 0.035 },
        // Medium boats — wider spread
        { x: 0.22, y: 0.724, scale: 0.65, bobSpeed: 0.0008, bobPhase: 1.0,  type: 'sail', driftSpeed: 0.000035, driftRange: 0.05 },
        { x: 0.50, y: 0.720, scale: 0.55, bobSpeed: 0.0009, bobPhase: 3.0,  type: 'sail', driftSpeed: 0.000028, driftRange: 0.04 },
        { x: 0.76, y: 0.725, scale: 0.60, bobSpeed: 0.0010, bobPhase: 0.7,  type: 'sail', driftSpeed: 0.000032, driftRange: 0.045 },
        // Small distant boats — edges
        { x: 0.12, y: 0.728, scale: 0.32, bobSpeed: 0.0012, bobPhase: 1.5,  type: 'small', driftSpeed: 0.00004, driftRange: 0.055 },
        { x: 0.88, y: 0.729, scale: 0.28, bobSpeed: 0.0013, bobPhase: 4.0,  type: 'small', driftSpeed: 0.000038, driftRange: 0.06 },
      ];

      for (const b of boats) {
        const driftX = Math.sin(t * b.driftSpeed + b.bobPhase * 2) * b.driftRange * W;
        const bx = b.x * W + driftX;
        const bob = Math.sin(t * b.bobSpeed + b.bobPhase) * 2.5 * b.scale;
        const by = b.y * H + bob;
        const s = b.scale;

        ctx.fillStyle = `rgba(4,5,12,${boatAlpha * 0.88})`;

        if (b.type === 'trawler') {
          // Larger fishing trawler — wider hull, cabin, tall mast
          const hw = 28 * s;
          const hh = 5 * s;

          // Hull
          ctx.beginPath();
          ctx.moveTo(bx - hw, by);
          ctx.quadraticCurveTo(bx - hw * 0.7, by + hh * 1.1, bx - hw * 0.1, by + hh);
          ctx.lineTo(bx + hw * 0.3, by + hh);
          ctx.quadraticCurveTo(bx + hw * 0.8, by + hh * 0.8, bx + hw, by + hh * 0.2);
          ctx.lineTo(bx + hw * 0.95, by);
          ctx.closePath();
          ctx.fill();

          // Cabin block
          const cabX = bx - hw * 0.15;
          const cabW = 10 * s;
          const cabH = 7 * s;
          ctx.fillRect(cabX, by - cabH, cabW, cabH);
          // Cabin roof
          ctx.fillRect(cabX - 1*s, by - cabH - 1.5*s, cabW + 2*s, 1.5*s);

          // Main mast
          const mastH = 26 * s;
          const mastX = bx + 4 * s;
          ctx.beginPath();
          ctx.moveTo(mastX, by - 1);
          ctx.lineTo(mastX, by - mastH);
          ctx.strokeStyle = `rgba(4,5,12,${boatAlpha * 0.82})`;
          ctx.lineWidth = 1.5 * s;
          ctx.stroke();

          // Boom/crossbar
          ctx.beginPath();
          ctx.moveTo(mastX, by - mastH * 0.65);
          ctx.lineTo(mastX + 14 * s, by - mastH * 0.55);
          ctx.lineWidth = 1 * s;
          ctx.stroke();

          // Rigging lines — thin
          ctx.beginPath();
          ctx.moveTo(mastX, by - mastH);
          ctx.lineTo(bx - hw * 0.5, by);
          ctx.moveTo(mastX, by - mastH);
          ctx.lineTo(bx + hw * 0.7, by);
          ctx.strokeStyle = `rgba(4,5,12,${boatAlpha * 0.35})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Fisherman figures — 1-2 on trawlers
          ctx.fillStyle = `rgba(4,5,12,${boatAlpha * 0.85})`;
          const fx1 = bx - hw * 0.4;
          ctx.fillRect(fx1 - 1, by - 9*s, 2.2, 6*s);
          ctx.beginPath(); ctx.arc(fx1, by - 10.5*s, 2*s, 0, Math.PI*2); ctx.fill();

          if (s > 0.95) {
            const fx2 = bx + hw * 0.3;
            ctx.fillRect(fx2 - 1, by - 8*s, 2, 5.5*s);
            ctx.beginPath(); ctx.arc(fx2, by - 9.5*s, 1.8*s, 0, Math.PI*2); ctx.fill();
          }

        } else {
          // Sail boat / small — original style
          const hw = 22 * s;
          const hh = 4 * s;

          ctx.beginPath();
          ctx.moveTo(bx - hw, by);
          ctx.quadraticCurveTo(bx - hw * 0.8, by + hh, bx, by + hh * 0.7);
          ctx.quadraticCurveTo(bx + hw * 0.8, by + hh, bx + hw, by);
          ctx.quadraticCurveTo(bx + hw * 0.5, by - hh * 0.3, bx, by - hh * 0.2);
          ctx.quadraticCurveTo(bx - hw * 0.5, by - hh * 0.3, bx - hw, by);
          ctx.fill();

          // Mast
          const mastH = 18 * s;
          const mastX = bx + 2 * s;
          ctx.beginPath();
          ctx.moveTo(mastX, by - hh * 0.2);
          ctx.lineTo(mastX, by - mastH);
          ctx.strokeStyle = `rgba(4,5,12,${boatAlpha * 0.80})`;
          ctx.lineWidth = 1.2 * s;
          ctx.stroke();

          // Sail
          if (b.type === 'sail') {
            ctx.beginPath();
            ctx.moveTo(mastX, by - mastH);
            ctx.lineTo(mastX + 10 * s, by - mastH * 0.4);
            ctx.lineTo(mastX, by - mastH * 0.25);
            ctx.closePath();
            ctx.fillStyle = `rgba(4,5,12,${boatAlpha * 0.60})`;
            ctx.fill();
          }

          // Fisherman on medium boats
          if (s > 0.5) {
            ctx.fillStyle = `rgba(4,5,12,${boatAlpha * 0.82})`;
            const fx = bx - 4 * s;
            ctx.fillRect(fx - 1, by - hh*0.2 - 7*s, 1.8, 5*s);
            ctx.beginPath(); ctx.arc(fx, by - hh*0.2 - 8.5*s, 1.6*s, 0, Math.PI*2); ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    // ── Stars ──
    const starAlpha = Math.max(0, 1 - sp * 2.2);
    const parallaxOffset = scrollProgress * H * 0.08;
    if (starAlpha > 0.01) {
      STARS.forEach(s => {
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);
        const a = starAlpha * s.brightness * (0.4 + twinkle * 0.6);
        if (a < 0.01) return;
        const sy = s.y * H - parallaxOffset * (0.3 + s.brightness * 0.7);
        if (sy < -5 || sy > H * 0.7) return;
        ctx.beginPath();
        ctx.arc(s.x * W, sy, s.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(228,224,255,${a})`;
        ctx.fill();
      });
    }

    // ── Cloud wisps — 8 layers, brighter ──
    const cloudBright = sp < 0.28 ? sp / 0.28 : sp < 0.62 ? 1 : 1 - (sp-0.62)/0.38;
    const cloudColor = multiLerp(cloudColorStops, sp);

    for (let c = 0; c < wispConfigs.length; c++) {
      const cc = wispConfigs[c];
      const cy  = H * cc.yBase;
      const cwx = (t * cc.speed + cc.phase) % 1.5 - 0.25;
      const cw  = W * (cc.wMul + pseudoRand(c*7) * 0.15);
      const distFromHorizon = 1 - Math.abs(cc.yBase - 0.58) / 0.25;
      const cAlpha = (0.018 + cloudBright * 0.12) * Math.max(0.25, distFromHorizon);

      const cGrad = ctx.createLinearGradient(cwx*W, 0, cwx*W + cw, 0);
      cGrad.addColorStop(0,    'rgba(0,0,0,0)');
      cGrad.addColorStop(0.12, `rgba(${cloudColor[0]},${cloudColor[1]},${cloudColor[2]},${cAlpha * 0.35})`);
      cGrad.addColorStop(0.38, `rgba(${cloudColor[0]},${cloudColor[1]},${cloudColor[2]},${cAlpha})`);
      cGrad.addColorStop(0.62, `rgba(${cloudColor[0]},${cloudColor[1]},${cloudColor[2]},${cAlpha * 0.82})`);
      cGrad.addColorStop(0.88, `rgba(${cloudColor[0]},${cloudColor[1]},${cloudColor[2]},${cAlpha * 0.25})`);
      cGrad.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = cGrad;
      ctx.fillRect(cwx*W, cy - cc.thick/2, cw, cc.thick);
    }

    // ── Crepuscular rays — 24 rays, screen blended ──
    if (sp > 0.12 && sp < 0.94) {
      const rayIntensity = sp < 0.48 ? (sp-0.12)/0.36 : (0.94-sp)/0.46;
      const baseAlpha = rayIntensity * 0.13;

      const sunYForRays = sp > 0.18 ? horizonY - ease(Math.min(1,(sp-0.18)/0.58)) * H * 0.38 : horizonY;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for (let r = 0; r < rayConfigs.length; r++) {
        const rc = rayConfigs[r];
        const sway = Math.sin(t * 0.000020 + r * 1.9) * 0.020;
        const shimmer = 0.50 + 0.50 * Math.sin(t * 0.000038 + r * 2.7);
        const angle = rc.angle + sway;
        const rayLen = H * 0.75 * rc.lenMul;
        const x2 = W*0.5 + Math.sin(angle) * rayLen;
        const y2 = sunYForRays - Math.cos(angle) * rayLen;
        const rayAlpha = baseAlpha * shimmer * (0.45 + pseudoRand(r*13) * 0.55);

        if (rayAlpha < 0.003) continue;

        const rayGrad = ctx.createLinearGradient(W*0.5, sunYForRays, x2, y2);
        rayGrad.addColorStop(0,    `rgba(255,208,115,${rayAlpha * 1.3})`);
        rayGrad.addColorStop(0.18, `rgba(255,185,88,${rayAlpha * 0.75})`);
        rayGrad.addColorStop(0.42, `rgba(255,165,68,${rayAlpha * 0.32})`);
        rayGrad.addColorStop(0.68, `rgba(255,148,55,${rayAlpha * 0.10})`);
        rayGrad.addColorStop(1,    `rgba(255,135,48,0)`);
        ctx.strokeStyle = rayGrad;
        ctx.lineWidth = rc.width;
        ctx.beginPath();
        ctx.moveTo(W*0.5, sunYForRays);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // ── Sea waves — 18 layers, visible and alive ───
    const waveColor = multiLerp(glowStops, sp);
    // Waves much more visible
    const daylight = Math.min(1, sp * 1.5);
    const waveAlpha = 0.05 + glowPeak * 0.12 + daylight * 0.06;
    // Late waves pick up sky/blue tint
    const waveBlueMix = Math.max(0, (sp - 0.6) / 0.4);
    const wR = Math.round(waveColor[0] * (1 - waveBlueMix * 0.4) + zenith[0] * waveBlueMix * 0.4);
    const wG = Math.round(waveColor[1] * (1 - waveBlueMix * 0.3) + zenith[1] * waveBlueMix * 0.3);
    const wB = Math.round(waveColor[2] * (1 - waveBlueMix * 0.2) + zenith[2] * waveBlueMix * 0.5);

    // Primary wave lines — long horizontal ripples
    for (let w = 0; w < 18; w++) {
      const wy   = H * (0.73 + w * 0.015);
      const amp  = 4.5 - w * 0.18;
      const freq = 0.003 + w * 0.001;
      const spd  = 0.0004 + w * 0.00008;
      const wPhase = w * 1.4 + (w % 2 === 0 ? 0 : Math.PI * 0.6);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = wy + amp * Math.sin(x * freq + t * spd + wPhase)
                     + amp * 0.35 * Math.sin(x * freq * 2.3 + t * spd * 1.7 + w);
        x===0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const distFromTop = w / 18;
      ctx.strokeStyle = `rgba(${wR},${wG},${wB},${waveAlpha * (1 - distFromTop * 0.5)})`;
      ctx.lineWidth = 1.2 - distFromTop * 0.4;
      ctx.stroke();
    }

    // Secondary fine ripples — shorter, faster, fill in between
    if (sp > 0.15) {
      const rippleAlpha = waveAlpha * 0.35;
      for (let r = 0; r < 12; r++) {
        const ry = H * (0.735 + r * 0.020 + pseudoRand(r * 7) * 0.008);
        const rAmp = 1.5 + pseudoRand(r * 13) * 2;
        const rFreq = 0.008 + pseudoRand(r * 3) * 0.006;
        const rSpd = 0.0006 + pseudoRand(r * 11) * 0.0004;
        const rLen = W * (0.15 + pseudoRand(r * 19) * 0.25);
        const rStart = pseudoRand(r * 23) * (W - rLen);

        ctx.beginPath();
        for (let x = rStart; x <= rStart + rLen; x += 3) {
          const localX = (x - rStart) / rLen;
          const fade = Math.sin(localX * Math.PI); // fade edges
          const y = ry + rAmp * fade * Math.sin(x * rFreq + t * rSpd + r * 2.7);
          x === rStart ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${Math.min(255, wR + 30)},${Math.min(255, wG + 20)},${Math.min(255, wB + 15)},${rippleAlpha})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // ── Sun reflection on water — bright golden ripple lines in the sun's column ──
    if (sp > 0.20) {
      const sunX = W * 0.5;
      const reflWidth = W * (0.08 + sp * 0.14); // widens as sun rises
      const reflAlpha = Math.min(0.35, (sp - 0.20) * 0.55);
      const reflC = multiLerp(glowStops, sp);

      for (let r = 0; r < 22; r++) {
        const ry = H * (0.725 + r * 0.012);
        const distFromHorizon = r / 22;
        // Reflection narrows and fades further from horizon
        const localWidth = reflWidth * (1 - distFromHorizon * 0.6);
        const localAlpha = reflAlpha * (1 - distFromHorizon * 0.7);
        const rAmp = 2 + pseudoRand(r * 17) * 3;
        const rFreq = 0.006 + pseudoRand(r * 7) * 0.008;
        const rSpd = 0.0005 + pseudoRand(r * 11) * 0.0003;

        // Only draw within the sun's reflection column
        const startX = sunX - localWidth;
        const endX = sunX + localWidth;

        ctx.beginPath();
        for (let x = startX; x <= endX; x += 3) {
          const normalX = (x - startX) / (endX - startX); // 0→1
          const fade = Math.sin(normalX * Math.PI); // fade at edges
          const y = ry + rAmp * fade * Math.sin(x * rFreq + t * rSpd + r * 1.9);
          x === startX ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${Math.min(255, reflC[0] + 40)},${Math.min(255, reflC[1] + 30)},${Math.min(255, reflC[2] + 20)},${localAlpha})`;
        ctx.lineWidth = 1.2 - distFromHorizon * 0.6;
        ctx.stroke();
      }
    }

    // ── Airplane silhouettes — cinematic sun-crossing flights ──
    if (sp > 0.15) {
      const planeAlpha = Math.min(0.75, (sp - 0.15) / 0.25);
      const skyH = H * 0.72; // sea starts at 72%

      const planes = [
        // Fixed altitude bands in the sky — NOT tied to sun
        { startX: -0.10, yFrac: 0.35, speed: 0.000028, phase: 0.0,    scale: 0.45, angle: -0.03 },
        { startX: 1.10,  yFrac: 0.25, speed: -0.000016, phase: 15000, scale: 0.55, angle: 0.02 },
        { startX: -0.15, yFrac: 0.15, speed: 0.000024, phase: 32000, scale: 0.4, angle: -0.02 },
        // Sun-crosser — flies right through the sun disc
        { startX: -0.08, yFrac: 0.48, speed: 0.000019, phase: 8000, scale: 0.85, angle: -0.01 },
      ];

      ctx.save();
      for (const pl of planes) {
        const cycle = ((t + pl.phase) * Math.abs(pl.speed)) % 1.35;
        const px = pl.speed > 0
          ? (pl.startX + cycle) * W
          : (pl.startX - cycle + 1.35) * W;
        // Fixed y in the sky band — tiny wobble for realism, NOT scroll-dependent
        const py = skyH * pl.yFrac + Math.sin(t * 0.00005 + pl.phase) * 4;
        const s = pl.scale;
        const dir = pl.speed > 0 ? 1 : -1;

        if (px < -50 || px > W + 50) continue;

        ctx.save();
        ctx.translate(px, py);
        ctx.scale(dir, 1);
        ctx.rotate(pl.angle);

        ctx.fillStyle = `rgba(4,5,12,${planeAlpha * 0.78})`;

        // Fuselage
        ctx.beginPath();
        ctx.ellipse(0, 0, 18 * s, 2 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Nose cone
        ctx.beginPath();
        ctx.moveTo(18 * s, 0);
        ctx.lineTo(22 * s, -0.5 * s);
        ctx.lineTo(22 * s, 0.5 * s);
        ctx.closePath();
        ctx.fill();

        // Main wings — swept back
        ctx.beginPath();
        ctx.moveTo(-2 * s, 0);
        ctx.lineTo(-8 * s, -14 * s);
        ctx.lineTo(-5 * s, -14 * s);
        ctx.lineTo(4 * s, -1 * s);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-2 * s, 0);
        ctx.lineTo(-8 * s, 14 * s);
        ctx.lineTo(-5 * s, 14 * s);
        ctx.lineTo(4 * s, 1 * s);
        ctx.closePath();
        ctx.fill();

        // Tail fin — vertical stabilizer
        ctx.beginPath();
        ctx.moveTo(-16 * s, 0);
        ctx.lineTo(-20 * s, -7 * s);
        ctx.lineTo(-17 * s, -6 * s);
        ctx.lineTo(-14 * s, 0);
        ctx.closePath();
        ctx.fill();

        // Tail wings — horizontal stabilizers
        ctx.beginPath();
        ctx.moveTo(-15 * s, 0); ctx.lineTo(-19 * s, -5 * s); ctx.lineTo(-17 * s, -4.5 * s); ctx.lineTo(-13 * s, 0);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-15 * s, 0); ctx.lineTo(-19 * s, 5 * s); ctx.lineTo(-17 * s, 4.5 * s); ctx.lineTo(-13 * s, 0);
        ctx.closePath(); ctx.fill();

        // Contrails — dual fading lines
        if (sp > 0.3) {
          const trailAlpha = planeAlpha * 0.2;
          const trailLen = 65 * s;
          const trailGrad = ctx.createLinearGradient(-22 * s, 0, -22 * s - trailLen, 0);
          trailGrad.addColorStop(0, `rgba(210,210,220,${trailAlpha})`);
          trailGrad.addColorStop(0.4, `rgba(210,210,220,${trailAlpha * 0.35})`);
          trailGrad.addColorStop(1, `rgba(210,210,220,0)`);
          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = 1 * s;
          ctx.beginPath(); ctx.moveTo(-22 * s, -1.5 * s); ctx.lineTo(-22 * s - trailLen, -1.5 * s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-22 * s, 1.5 * s); ctx.lineTo(-22 * s - trailLen, 1.5 * s); ctx.stroke();
        }

        ctx.restore();
      }
      ctx.restore();
    }

    // ── Cinematic text — Apple-ad style, cinema mode only, after sun rises ──
    if (document.body.classList.contains('cinema-mode') && sp > 0.65) {
      const textEntry = Math.min(1, (sp - 0.65) / 0.15); // fades in between sp 0.65–0.80

      // Three lines appear in staggered sequence
      const line1Alpha = Math.min(1, textEntry * 1.8);                         // first to appear
      const line2Alpha = Math.max(0, Math.min(1, (textEntry - 0.3) * 1.8));   // slight delay
      const tagAlpha   = Math.max(0, Math.min(1, (textEntry - 0.55) * 2.0));  // last

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const sunYApprox = H * (0.72 - sp * 0.35);
      const centerY = sunYApprox + H * 0.12;

      // Line 1 — "Some mornings stop you cold."
      const l1Size = Math.min(44, Math.max(22, Math.round(W * 0.045)));
      ctx.font = `italic 600 ${l1Size}px 'Cormorant Garamond', Georgia, serif`;
      ctx.fillStyle = `rgba(255,250,240,${line1Alpha * 0.88})`;
      ctx.fillText('Some mornings stop you cold.', W * 0.5, centerY);

      // Line 2 — "Seaside Beacon finds them for you."
      const l2Size = Math.min(30, Math.max(15, Math.round(W * 0.030)));
      ctx.font = `italic 600 ${l2Size}px 'Cormorant Garamond', Georgia, serif`;
      ctx.fillStyle = `rgba(222,195,160,${line2Alpha * 0.72})`;
      ctx.fillText('Seaside Beacon finds them for you.', W * 0.5, centerY + l1Size * 1.35);

      // Tagline — "TOMORROW'S SKY, READ TONIGHT"
      const tagSize = Math.min(17, Math.max(9, Math.round(W * 0.014)));
      ctx.font = `500 ${tagSize}px 'Instrument Sans', -apple-system, sans-serif`;
      ctx.fillStyle = `rgba(210,175,130,${tagAlpha * 0.72})`;
      ctx.fillText('T O M O R R O W \u2019 S   S K Y ,   R E A D   T O N I G H T', W * 0.5, centerY + l1Size * 1.35 + l2Size * 1.8);

      ctx.restore();
    }

    requestAnimationFrame(draw);
  }

  function pseudoRand(n) {
    const x = Math.sin(n + 1) * 43758.5453;
    return x - Math.floor(x);
  }

  window.addEventListener('resize', resize);
  // Double-rAF ensures browser has completed layout before first resize + draw
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resize();
      requestAnimationFrame(draw);
    });
  });
}

// ─────────────────────────────────────────────
// SCROLL PROGRESS
// ─────────────────────────────────────────────
function initScrollProgress() {
  const bar = document.getElementById('scrollProgress');
  const nav = document.getElementById('nav');

  // Sync progress bar width to nav capsule width
  function syncWidth() {
    if (nav) bar.style.setProperty('--nav-width', nav.offsetWidth + 'px');
  }
  syncWidth();
  window.addEventListener('resize', syncWidth, {passive:true});

  window.addEventListener('scroll', () => {
    const pct = (window.scrollY/(document.body.scrollHeight-window.innerHeight)*100);
    bar.style.setProperty('--scroll-pct', pct + '%');
  }, {passive:true});
}

// ─────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────
function initNav() {
  const nav = document.getElementById('nav');
  const ham = document.getElementById('navHamburger');
  const drawer = document.getElementById('navDrawer');
  const indicator = document.getElementById('navIndicator');
  const navLinksContainer = document.querySelector('.nav-links');
  const navLinks = document.querySelectorAll('.nav-link[data-section]');

  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, {passive:true});

  ham?.addEventListener('click', () => {
    const open = ham.classList.toggle('open');
    drawer.classList.toggle('open', open);
    drawer.classList.toggle('hidden', !open);
  });
  document.querySelectorAll('.drawer-link').forEach(l => l.addEventListener('click', () => {
    ham?.classList.remove('open');
    drawer?.classList.remove('open');
    drawer?.classList.add('hidden');
  }));

  // ── Sliding indicator ──
  if (!indicator || !navLinksContainer || !navLinks.length) return;

  function moveIndicator(link) {
    if (!link) {
      indicator.classList.remove('active');
      return;
    }
    const containerRect = navLinksContainer.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    indicator.style.left = (linkRect.left - containerRect.left) + 'px';
    indicator.style.width = linkRect.width + 'px';
    indicator.style.top = ((linkRect.top - containerRect.top) + (linkRect.height - 30) / 2) + 'px';
    indicator.classList.add('active');

    // Update active class on links
    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
  }

  // IntersectionObserver — detect which section is in view
  const sections = [];
  navLinks.forEach(link => {
    const id = link.dataset.section;
    const el = document.getElementById(id);
    if (el) sections.push({ el, link });
  });

  let currentSection = null;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const match = sections.find(s => s.el === entry.target);
        if (match && match.link !== currentSection) {
          currentSection = match.link;
          moveIndicator(match.link);
        }
      }
    });
  }, {
    rootMargin: '-20% 0px -60% 0px', // trigger when section is in upper-middle of viewport
    threshold: 0
  });

  sections.forEach(s => observer.observe(s.el));

  // When at very top (hero), hide indicator
  window.addEventListener('scroll', () => {
    if (window.scrollY < 200) {
      currentSection = null;
      indicator.classList.remove('active');
      navLinks.forEach(l => l.classList.remove('active'));
    }
  }, {passive: true});

  // Recalculate on resize
  window.addEventListener('resize', () => {
    if (currentSection) moveIndicator(currentSection);
  }, {passive: true});
}

// ─────────────────────────────────────────────
// BEACH SELECTOR
// ─────────────────────────────────────────────
function initBeachSelector() {
  document.querySelectorAll('.bsel').forEach(btn => {
    btn.addEventListener('click', () => {
      const beach = btn.dataset.beach;
      if (beach===state.beach && state.weather) return;
      document.querySelectorAll('.bsel').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.beach = beach;
      if (state.weather) resetForecast();
    });
  });
}

function resetForecast() {
  state.weather = null; state.photography = null;
  show('fmasterIdle'); hide('fmasterLoading'); hide('fmasterResult'); hide('experiencePanel'); hide('deepPanel'); hide('shareBar');
  const master = document.getElementById('forecastMaster');
  master.classList.remove('loaded','tone-great','tone-good','tone-meh','tone-poor');
}
// ─────────────────────────────────────────────
// AVAILABILITY
// ─────────────────────────────────────────────
function isAvailable() {
  const ist = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const h = ist.getHours();
  return h>=18 || h<6;
}
function countdownTo6PM() {
  const ist = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const h=ist.getHours(), m=ist.getMinutes();
  if (h<18) { const hrs=17-h, mins=60-m; return mins===60?`${hrs}h`:`${hrs}h ${mins}m`; }
  return null;
}

// ─────────────────────────────────────────────
// FORECAST
// ─────────────────────────────────────────────
function initForecast() {
  document.getElementById('predictBtn')?.addEventListener('click', handlePredict);
  document.getElementById('unavailSubscribeBtn')?.addEventListener('click', openModal);
}

async function handlePredict() {
  if (state.loading) return;
  if (!isAvailable()) { showUnavailable(); return; }
  state.loading = true;
  setLoadingState(true);

  // Run API fetch and pipeline animation in parallel
  // Results only render after BOTH are done (minimum 5s visual)
  const pipelinePromise = runPipeline();
  let data, error;

  try {
    data = await fetchTimeout(`${CONFIG.API_URL}/predict/${state.beach}`, 70000);
  } catch(err) {
    error = err;
  }

  // Wait for pipeline to finish its full animation
  await pipelinePromise;

  if (error) {
    showToast(error.message||'Unable to fetch — please try again');
    console.error(error);
    state.loading = false; setLoadingState(false);
    return;
  }

  if (!data.success) {
    showToast(data.message||'Prediction failed');
    state.loading = false; setLoadingState(false);
    return;
  }

  if (!data.data.weather.available) {
    setLoadingState(false);
    showUnavailable(data.data.weather.timeUntilAvailable);
    state.loading = false;
    return;
  }

  state.weather = data.data.weather;
  state.photography = data.data.photography;
  state.loading = false;
  setLoadingState(false);
  renderForecast();
}

async function fetchTimeout(url, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(()=>ctrl.abort(), ms);
  try {
    const res = await fetch(url, {signal:ctrl.signal});
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch(e) {
    clearTimeout(id);
    if (e.name==='AbortError') throw new Error('Request timed out. Server may be waking up — try again in a moment.');
    throw e;
  }
}

function setLoadingState(on) {
  if (on) {
    hide('fmasterIdle'); hide('fmasterResult'); hide('experiencePanel'); hide('deepPanel');
    show('fmasterLoading');
    // Reset all pipeline steps
    for (let i = 0; i < 5; i++) {
      const step = document.getElementById(`pipeStep${i}`);
      if (step) { step.classList.remove('active','done'); }
      const line = document.getElementById(`pipeLine${i}`);
      if (line) { line.classList.remove('filled'); }
    }
    const statusEl = document.getElementById('pipeStatus');
    if (statusEl) statusEl.textContent = '';
  } else {
    // Clear any pending timeouts
    (state._pipeTimeouts || []).forEach(clearTimeout);
    state._pipeTimeouts = [];
    hide('fmasterLoading');
  }
}

/**
 * Runs the 5-step pipeline animation over exactly 5 seconds.
 * Returns a promise that resolves when "Done" has displayed.
 */
function runPipeline() {
  return new Promise(resolve => {
    const steps = [
      { at: 0,    step: 0, status: 'Connecting to forecast engine…' },
      { at: 1000, step: 1, status: 'Reading atmospheric data…' },
      { at: 2200, step: 2, status: 'Analysing cloud, humidity & visibility…' },
      { at: 3500, step: 3, status: 'Generating sunrise insights…' },
      { at: 4600, step: 4, status: 'Preparing your forecast…' },
    ];

    state._pipeTimeouts = steps.map(s =>
      setTimeout(() => advancePipeline(s.step, s.status), s.at)
    );

    // Resolve after full animation completes (5s total)
    state._pipeTimeouts.push(setTimeout(resolve, 5200));
  });
}

function advancePipeline(stepIndex, statusText) {
  // Mark all previous steps as done
  for (let i = 0; i < stepIndex; i++) {
    const step = document.getElementById(`pipeStep${i}`);
    if (step) { step.classList.remove('active'); step.classList.add('done'); }
    const line = document.getElementById(`pipeLine${i}`);
    if (line) { line.classList.add('filled'); }
  }
  // Mark current step as active
  const current = document.getElementById(`pipeStep${stepIndex}`);
  if (current) { current.classList.remove('done'); current.classList.add('active'); }
  // Update status text
  if (statusText) {
    const el = document.getElementById('pipeStatus');
    if (el) el.textContent = statusText;
  }
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function renderForecast() {
  const w=state.weather, p=state.photography, f=w.forecast, pred=w.prediction;
  hide('fmasterIdle'); hide('fmasterLoading');
  show('fmasterResult');
  document.getElementById('forecastMaster').classList.add('loaded');

  // ── Visual tone matching — score-dependent colors ──
  applyScoreTone(pred.score);

  document.getElementById('fmrBeachName').textContent = w.beach;
  animateRing(pred.score);
  countUp('ringScore', 0, pred.score, 1100);

  const vEl = document.getElementById('scoreVerdict');
  vEl.textContent = pred.verdict;
  vEl.className = 'score-verdict sv-' + pred.verdict.toLowerCase().replace(/\s+/g,'-');

  const gh = p?.goldenHour||{};
  document.getElementById('fmrgTime').textContent = `${gh.start||'--'} — ${gh.end||'--'}`;
  document.getElementById('fmrgPeak').textContent = gh.peak||gh.start||'--';

  const labels = pred.atmosphericLabels||{};
  const bd = pred.breakdown||{};
  const condItems = [
    {lbl:'Cloud Cover',val:`${f.cloudCover}%`,    sub:labels.cloudLabel    ||(f.cloudCover>=30&&f.cloudCover<=60?'Optimal':f.cloudCover<30?'Clear':'Heavy')},
    {lbl:'Humidity', val:`${f.humidity}%`,       sub:labels.humidityLabel ||(f.humidity<=55?'Low':'High')},
    {lbl:'Visibility',val:`${f.visibility}km`,   sub:labels.visibilityLabel||(f.visibility>=18?'Exceptional':f.visibility>=12?'Excellent':f.visibility>=8?'Good':'Fair')},
    {lbl:'Wind',     val:`${f.windSpeed}km/h`,   sub:labels.windLabel     ||(f.windSpeed<=15?'Calm':'Breezy')}
  ];
  // v5: Add cloud layers if available
  const hc = bd.multiLevelCloud?.high ?? bd.highCloud ?? null;
  const mc = bd.multiLevelCloud?.mid ?? bd.midCloud ?? null;
  const lc = bd.multiLevelCloud?.low ?? bd.lowCloud ?? null;
  if (hc != null) {
    condItems.push({lbl:'Cloud Layers', val:`H${hc}% M${mc}% L${lc}%`, sub:labels.cloudLayers||(hc>=30&&lc<40?'Ideal':'Mixed')});
  }
  // v5: Add air clarity (AOD) if available
  const aodVal = bd.aod?.value ?? null;
  if (aodVal != null) {
    condItems.push({lbl:'Air Clarity', val:aodVal.toFixed(2), sub:labels.aod||(aodVal<0.2?'Very Clean':aodVal<0.4?'Clean':aodVal<0.7?'Hazy':'Polluted')});
  }
  // v5: Add pressure trend if available
  const pTrend = bd.pressureTrend?.value ?? null;
  if (pTrend != null) {
    condItems.push({lbl:'Pressure', val:`${pTrend>=0?'+':''}${pTrend.toFixed(1)}hPa`, sub:labels.pressureTrend||(pTrend<-2?'Clearing':pTrend<=0.5?'Stable':'Rising')});
  }
  document.getElementById('conditionsStrip').innerHTML = condItems
    .map(c=>`<div class="cond-item"><div class="cond-label">${c.lbl}</div><div class="cond-val">${c.val}</div><div class="cond-sub">${c.sub}</div></div>`).join('');

  const greetingText = p?.greeting || '';
  const insightText = p?.insight || `${pred.verdict} conditions forecast for ${w.beach} at dawn.`;
  document.getElementById('fmriInsight').textContent = greetingText ? `${greetingText} ${insightText}` : insightText;

  // Render sunrise experience panel (general audience)
  renderExperiencePanel(pred.score, p, w.beach);

  // Show share bar
  show('shareBar');
  updateShareLinks(w.beach, pred.score, pred.verdict);

  renderAnalysisPanel(f, pred, p, w.beach);
  setTimeout(()=>document.getElementById('forecastMaster').scrollIntoView({behavior:'smooth',block:'nearest'}),150);
}

/**
 * Visual tone matching — shift ring gradient, card accent, and
 * glow based on score tier so the UI "feels" like the forecast
 */
function applyScoreTone(score) {
  const master = document.getElementById('forecastMaster');
  // Remove previous tone classes
  master.classList.remove('tone-great','tone-good','tone-meh','tone-poor');

  // Gradient stops for the ring SVG
  const stops = document.querySelectorAll('#ringGrad stop');
  const ring = document.getElementById('ringFill');

  if (score >= 70) {
    // Great — warm golden sunrise palette
    master.classList.add('tone-great');
    if (stops[0]) stops[0].setAttribute('stop-color', '#d4542b');
    if (stops[1]) stops[1].setAttribute('stop-color', '#e8944a');
    if (stops[2]) stops[2].setAttribute('stop-color', '#f0c040');
    ring.style.filter = 'drop-shadow(0 0 12px rgba(232,148,74,0.6))';
  } else if (score >= 50) {
    // Decent — muted amber
    master.classList.add('tone-good');
    if (stops[0]) stops[0].setAttribute('stop-color', '#8a3d5a');
    if (stops[1]) stops[1].setAttribute('stop-color', '#c4733a');
    if (stops[2]) stops[2].setAttribute('stop-color', '#c9a055');
    ring.style.filter = 'drop-shadow(0 0 10px rgba(196,115,58,0.5))';
  } else if (score >= 30) {
    // Underwhelming — cool muted tones
    master.classList.add('tone-meh');
    if (stops[0]) stops[0].setAttribute('stop-color', '#6b5b73');
    if (stops[1]) stops[1].setAttribute('stop-color', '#8a7b6a');
    if (stops[2]) stops[2].setAttribute('stop-color', '#9e9585');
    ring.style.filter = 'drop-shadow(0 0 6px rgba(138,123,106,0.3))';
  } else {
    // Poor — desaturated grey
    master.classList.add('tone-poor');
    if (stops[0]) stops[0].setAttribute('stop-color', '#5a5a6a');
    if (stops[1]) stops[1].setAttribute('stop-color', '#6e6e7a');
    if (stops[2]) stops[2].setAttribute('stop-color', '#82828e');
    ring.style.filter = 'drop-shadow(0 0 4px rgba(100,100,120,0.2))';
  }
}

function renderExperiencePanel(score, p, beachName) {
  const exp = p?.sunriseExperience;
  if (!exp) { hide('experiencePanel'); return; }

  show('experiencePanel');

  // Time-aware: "this morning" before 10 AM IST, "tomorrow" after 6 PM, neutral midday
  const istHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
  const timeLabel = istHour < 10 ? "this morning's" : istHour >= 18 ? "tomorrow's" : "the next";
  document.getElementById('expTitle').textContent = `What ${timeLabel} sunrise will look like at ${beachName}`;

  // Recommendation badge
  const recEl = document.getElementById('expRecommendation');
  const recIcon = document.getElementById('expRecIcon');
  const recText = document.getElementById('expRecText');

  recEl.className = 'exp-recommendation';
  if (score >= 70) {
    recEl.classList.add('exp-rec-go');
    recIcon.textContent = '✓';
    recText.textContent = 'Worth the early alarm';
  } else if (score >= 50) {
    recEl.classList.add('exp-rec-maybe');
    recIcon.textContent = '~';
    recText.textContent = 'Pleasant, not spectacular';
  } else if (score >= 30) {
    recEl.classList.add('exp-rec-skip');
    recIcon.textContent = '✗';
    recText.textContent = 'Underwhelming sunrise expected';
  } else {
    recEl.classList.add('exp-rec-no');
    recIcon.textContent = '—';
    recText.textContent = 'Sunrise likely not visible';
  }

  document.getElementById('expWhatYoullSee').textContent = exp.whatYoullSee || '';
  document.getElementById('expBeachVibes').textContent = exp.beachVibes || '';
  document.getElementById('expWorthItText').textContent = exp.worthWakingUp || '';
}

function animateRing(score) {
  const circ = 289.03, ring = document.getElementById('ringFill');
  ring.style.transition='none'; ring.style.strokeDashoffset=circ;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    ring.style.transition='stroke-dashoffset 1.4s cubic-bezier(0,0,0.2,1)';
    ring.style.strokeDashoffset = circ*(1-score/100);
  }));
}

function countUp(id, from, to, ms) {
  const el=document.getElementById(id); if(!el) return;
  const start=performance.now();
  (function step(now){
    const t=Math.min((now-start)/ms,1), e=1-Math.pow(1-t,3);
    el.textContent=Math.round(from+(to-from)*e);
    if(t<1) requestAnimationFrame(step);
  })(performance.now());
}

// ─────────────────────────────────────────────
// ANALYSIS PANEL
// ─────────────────────────────────────────────
function renderAnalysisPanel(f,pred,p,beachName) {
  // Time-aware subtitle
  const istH = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
  const morningLabel = istH < 10 ? 'This morning' : istH >= 18 ? 'Tomorrow morning' : 'Next sunrise';
  document.getElementById('deepSubtitle').textContent = `For ${beachName} · ${morningLabel}`;
  show('deepPanel');
  renderConditionsTab(f,pred,p);
  renderDSLRTab(p);
  renderMobileTab(p);
  renderCompositionTab(p);
}


function renderConditionsTab(f,pred,p) {
  const labels=pred.atmosphericLabels||{}, atm=p?.atmosphericAnalysis||{};
  const bd = pred.breakdown||{};
  const items=[
    {lbl:'Cloud Cover',val:`${f.cloudCover}%`,
     rating:labels.cloudLabel||(f.cloudCover>=30&&f.cloudCover<=60?'Optimal':f.cloudCover<30?'Too Clear':'Heavy'),
     cls:f.cloudCover>=30&&f.cloudCover<=60?'ab-good':f.cloudCover<=75?'ab-ok':'ab-bad',
     body:atm.cloudCover?.impact||(f.cloudCover>=30&&f.cloudCover<=60
       ?`At ${f.cloudCover}%, clouds sit in the photographic sweet spot — thick enough to catch the sub-horizon light, thin enough to let colour through. Expect reds and golds.`
       :f.cloudCover<30?`At ${f.cloudCover}%, mostly clear sky. Clean but potentially flat — the dramatic fire sky needs cloud texture to ignite.`
       :`At ${f.cloudCover}%, heavy cover. Colours will likely be muted and diffused. Look for gaps where light breaks through.`)},
    {lbl:'Humidity',val:`${f.humidity}%`,
     rating:labels.humidityLabel||(f.humidity<=55?'Excellent':f.humidity<=65?'Very Good':f.humidity<=75?'Good':f.humidity<=85?'Moderate':'High'),
     cls:f.humidity<=65?'ab-good':f.humidity<=80?'ab-ok':'ab-bad',
     body:atm.humidity?.impact||(f.humidity<=55
       ?`At ${f.humidity}%, the atmosphere is exceptionally dry for dawn. Light travels cleanly — colours will be saturated, contrast strong, and shadows crisp.`
       :f.humidity<=70
       ?`At ${f.humidity}%, good moisture levels for sunrise. Colours will be clear with only slight softening — a strong morning for photography.`
       :f.humidity<=82
       ?`At ${f.humidity}%, typical coastal dawn humidity. Expect moderately muted colours — warm tones will soften and the horizon may appear hazy.`
       :f.humidity<=93
       ?`At ${f.humidity}%, high moisture is scattering light significantly. Colours will appear washed out and pastel rather than vivid. The horizon will look milky.`
       :`At ${f.humidity}%, near-saturation humidity. Fog or heavy mist is likely — sunrise colours will be severely muted if visible at all.`)},
    {lbl:'Visibility',val:`${f.visibility}km`,
     rating:labels.visibilityLabel||(f.visibility>=18?'Exceptional':f.visibility>=12?'Excellent':f.visibility>=8?'Good':'Fair'),
     cls:f.visibility>=8?'ab-good':f.visibility>=5?'ab-ok':'ab-bad',
     body:atm.visibility?.impact||(f.visibility>=18
       ?`${f.visibility}km — post-rain crystal clarity. Distant elements will render sharply with strong colour separation across the sky.`
       :f.visibility>=12
       ?`${f.visibility}km — excellent morning clarity. Clean atmospheric conditions will allow vivid colour intensity and good contrast.`
       :f.visibility>=8
       ?`${f.visibility}km — decent visibility. Some atmospheric haze may soften the horizon and add warmth, but colours will still come through.`
       :f.visibility>=5
       ?`${f.visibility}km — reduced visibility from haze or mist. Colours will be muted and the horizon diffused. Contrast will be low.`
       :`${f.visibility}km — poor visibility. Heavy haze, mist or fog will significantly obscure the sunrise. Expect flat, grey tones.`)},
    {lbl:'Wind',val:`${f.windSpeed}km/h`,
     rating:labels.windLabel||(f.windSpeed<=10?'Calm':f.windSpeed<=20?'Light':f.windSpeed<=30?'Moderate':'Strong'),
     cls:f.windSpeed<=20?'ab-good':f.windSpeed<=30?'ab-ok':'ab-bad',
     body:atm.wind?.impact||(f.windSpeed<=10
       ?`Calm at ${f.windSpeed}km/h. Cloud formations will hold their shape. Long exposures of 20–30 seconds are fully viable.`
       :`${f.windSpeed}km/h will drift cloud formations across the sky. Keep exposures under 5 seconds for sharp cloud edges, or embrace the motion blur deliberately.`)}
  ];

  // v5: Cloud Structure card (if multi-level data available)
  const cs = atm.cloudStructure;
  const hc = bd.multiLevelCloud?.high ?? bd.highCloud ?? null;
  const mc2 = bd.multiLevelCloud?.mid ?? bd.midCloud ?? null;
  const lc2 = bd.multiLevelCloud?.low ?? bd.lowCloud ?? null;
  if (hc != null || cs) {
    const csRating = cs?.rating || (hc>=30&&lc2<40?'Ideal':lc2>=75?'Blocked':lc2>=50?'Heavy Low':'Mixed');
    const csCls = (hc>=30&&lc2<40)?'ab-good':lc2>=50?'ab-bad':'ab-ok';
    items.push({
      lbl:'Cloud Layers', val:`High ${hc??'?'}% · Mid ${mc2??'?'}% · Low ${lc2??'?'}%`,
      rating:csRating, cls:csCls,
      body: cs?.impact || (hc>=30&&lc2<40
        ? `High clouds at ${hc}% act as the primary colour canvas — thin cirrus catches pre-sunrise light and glows vivid orange and red. Low clouds at ${lc2}% leave the horizon clear.`
        : lc2>=75
        ? `Low clouds at ${lc2}% form a thick blanket blocking the horizon. Even high clouds above won't produce visible colour through this barrier.`
        : `Mixed cloud layers — high at ${hc}%, mid at ${mc2}%, low at ${lc2}%. Results will depend on how the layers interact at sunrise.`)
    });
  }

  // v5: Air Clarity / AOD card
  const ac = atm.airClarity;
  const aodVal = bd.aod?.value ?? null;
  if (aodVal != null || ac) {
    const acRating = ac?.rating || (aodVal<0.2?'Very Clean':aodVal<0.4?'Clean':aodVal<0.7?'Hazy':'Polluted');
    const acCls = aodVal!=null&&aodVal<0.2?'ab-good':aodVal!=null&&aodVal<0.4?'ab-ok':'ab-bad';
    items.push({
      lbl:'Air Clarity (AOD)', val:aodVal!=null?aodVal.toFixed(2):'N/A',
      rating:acRating, cls:acCls,
      body: ac?.impact || (aodVal<0.2
        ? `Very clean air — minimal aerosols mean sunrise colours will look vivid and saturated with a sharp, contrasty horizon.`
        : aodVal<0.4
        ? `Mild aerosol presence — colours will be slightly softened but still vibrant. A thin warm haze near the horizon can add depth.`
        : `Significant haze (AOD ${aodVal?.toFixed(2)}) — sunrise colours will be visibly muted and washed out. The horizon will appear soft and milky.`)
    });
  }

  // v5: Pressure Pattern card
  const pp = atm.pressurePattern;
  const pTrend = bd.pressureTrend?.value ?? null;
  if (pTrend != null || pp) {
    const ppRating = pp?.rating || (pTrend<-5?'Storm Risk':pTrend<-2?'Clearing Front':pTrend<-0.5?'Slight Fall':pTrend<=0.5?'Stable':'Rising');
    const ppCls = (pTrend!=null&&pTrend<-2&&pTrend>=-5)?'ab-good':pTrend!=null&&(pTrend<-5||pTrend>2)?'ab-bad':'ab-ok';
    items.push({
      lbl:'Pressure Trend', val:pTrend!=null?`${pTrend>=0?'+':''}${pTrend.toFixed(1)} hPa`:'N/A',
      rating:ppRating, cls:ppCls,
      body: pp?.impact || (pTrend<-5
        ? `Rapidly falling pressure signals a major weather system — heavy cloud and possible rain, but if skies clear near dawn, dramatic cloud formations are possible.`
        : pTrend<-2
        ? `Falling pressure signals an approaching front — the best setup for dramatic sunrises. Cloud breakup with vivid colour through gaps creates high-contrast skies.`
        : pTrend<=0.5
        ? `Stable pressure indicates calm, predictable conditions. The sky will be consistent but may lack dramatic cloud dynamics.`
        : `Rising pressure (+${pTrend?.toFixed(1)} hPa) indicates high pressure building — clear and calm conditions. Good for gentle colour but unlikely to produce dramatic formations.`)
    });
  }

  document.getElementById('atmGrid').innerHTML = items.map(d=>`
    <div class="atm-card reveal">
      <div class="atm-top"><span class="atm-lbl">${d.lbl}</span><span class="atm-badge ${d.cls}">${d.rating}</span></div>
      <div class="atm-val">${d.val}</div>
      <div class="atm-body">${d.body}</div>
    </div>`).join('');

  const pattern = document.getElementById('patternBox');
  const overall = p?.atmosphericAnalysis?.overallPattern||p?.insight||'';
  pattern.innerHTML = overall?`<strong>Sky pattern</strong><br>${overall}`:'';
  pattern.style.display = overall?'':'none';
  setTimeout(observeReveal, 50);
}

function renderDSLRTab(p) {
  const cs=p?.dslr?.cameraSettings||{};
  document.getElementById('dslrGrid').innerHTML = [
    {lbl:'ISO',          val:cs.iso||'200–400',      why:cs.isoWhy||''},
    {lbl:'Shutter',      val:cs.shutterSpeed||'1/125s', why:cs.shutterWhy||''},
    {lbl:'Aperture',     val:cs.aperture||'f/8–f/11',  why:cs.apertureWhy||''},
    {lbl:'White Balance',val:cs.whiteBalance||'5500K',  why:cs.wbWhy||''}
  ].map(s=>`<div class="setting-card"><div class="sc-label">${s.lbl}</div><div class="sc-val">${s.val}</div>${s.why?`<div class="sc-why">${s.why}</div>`:''}</div>`).join('');
  renderTips('dslrProTips', p?.dslr?.proTips||[], 'Pro tips');
  renderTips('dslrCompTips', p?.dslr?.compositionTips||[], 'Composition');
}

function renderMobileTab(p) {
  const ps=p?.mobile?.phoneSettings||{};
  document.getElementById('mobileGrid').innerHTML = [
    {lbl:'Night Mode',val:ps.nightMode||'Off',                  why:ps.nightModeWhy||''},
    {lbl:'HDR',       val:ps.hdr||'Auto',                       why:ps.hdrWhy||''},
    {lbl:'Exposure',  val:ps.exposure||'0',                     why:ps.exposureWhy||''},
    {lbl:ps.additionalSetting||'Grid', val:'On',                why:ps.additionalWhy||'Align the horizon on the lower third.'}
  ].map(s=>`<div class="setting-card"><div class="sc-label">${s.lbl}</div><div class="sc-val">${s.val}</div>${s.why?`<div class="sc-why">${s.why}</div>`:''}</div>`).join('');
  renderTips('mobileProTips', p?.mobile?.proTips||[], 'Pro tips');
  renderTips('mobileCompTips', p?.mobile?.compositionTips||[], 'Composition');
}

function renderTips(id, tips, heading) {
  const el=document.getElementById(id); if(!el||!tips.length){if(el)el.innerHTML='';return;}
  el.innerHTML=`<div class="tips-heading">${heading}</div>`+
    tips.map((t,i)=>`<div class="tip-row"><div class="tip-n">${i+1}</div><span>${t}</span></div>`).join('');
}

function renderCompositionTab(p) {
  const comp=p?.beachComparison||{}, beaches=comp.beaches||{};
  const meta={
    marina:        {name:'Marina Beach',    sub:'Lighthouse · Fishing boats'},
    elliot:        {name:"Elliot's Beach",  sub:'Karl Schmidt Memorial'},
    covelong:      {name:'Covelong Beach',  sub:'Rock formations · Tidal pools'},
    thiruvanmiyur: {name:'Thiruvanmiyur',   sub:'Breakwater · Reflections'}
  };
  const suitCls={Best:'cs-best',Good:'cs-good',Fair:'cs-fair',Poor:'cs-poor'};
  const hasData = Object.keys(beaches).length > 0;

  if (!hasData) {
    document.getElementById('beachCompareGrid').innerHTML=
      `<div class="cc-no-data">Beach comparison data unavailable — only the selected beach was loaded.</div>`;
    return;
  }

  document.getElementById('beachCompareGrid').innerHTML=
    Object.keys(meta).map(key=>{
      const m=meta[key], d=beaches[key]||{}, suit=d.suitability||'Fair', isBest=key===comp.todaysBest;
      const reason = d.reason || (d.suitability ? `${m.name} has ${suit.toLowerCase()} conditions this morning.` : `Data unavailable for ${m.name}.`);
      return `<div class="comp-card ${isBest?'best-today':''}">
        <div class="cc-header">
          <div class="cc-name">${m.name}</div>
          <span class="cc-suit ${suitCls[suit]||'cs-fair'}">${suit}</span>
        </div>
        <div class="cc-meta">${m.sub}</div>
        <div class="cc-reason">${reason}</div>
      </div>`;
    }).join('');
}

// ─────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.ap-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.ap-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.ap-pane').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
    });
  });
}

// ─────────────────────────────────────────────
// DEEP PANEL
// ─────────────────────────────────────────────
function initDeepPanel() {
  document.getElementById('deepCollapse')?.addEventListener('click', function(){
    const collapsed=this.classList.toggle('collapsed');
    const panel=document.getElementById('deepPanel');
    const hide_els=[panel.querySelector('.ap-tabs'),...panel.querySelectorAll('.ap-pane')];
    hide_els.forEach(el=>el&&(el.style.display=collapsed?'none':''));
  });
  document.getElementById('btnViewAnalysis')?.addEventListener('click',()=>{
    document.getElementById('deepPanel').scrollIntoView({behavior:'smooth',block:'start'});
  });
}

// ─────────────────────────────────────────────
// UNAVAILABLE
// ─────────────────────────────────────────────
function showUnavailable(td) {
  show('unavailCard');

  function updateCountdown() {
    const t = td ? `${td.hours}h ${td.minutes}m` : (countdownTo6PM() || '—');
    document.getElementById('unavailCountdown').textContent = t;
  }

  updateCountdown();
  // Tick every 60s so the countdown stays live without a refresh
  if (!state._unavailInterval) {
    state._unavailInterval = setInterval(() => {
      // If we've passed 6 PM, stop ticking
      if (isAvailable()) {
        clearInterval(state._unavailInterval);
        state._unavailInterval = null;
        document.getElementById('unavailCountdown').textContent = 'Ready';
        return;
      }
      updateCountdown();
    }, 60000);
  }
}

// ─────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────
function openModal() { const m=document.getElementById('emailModal'); m.classList.add('active'); m.setAttribute('aria-hidden','false'); }
function closeModalFn() {
  const modal = document.getElementById('emailModal');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden','true');
  // Reset flip animation so modal is clean on reopen
  const panel = modal.querySelector('.modal-panel');
  if (panel) {
    panel.classList.remove('sub-success-active');
    const face = panel.querySelector('.sub-success-face');
    if (face) face.remove();
  }
}
function initModals() {
  document.getElementById('closeModal')?.addEventListener('click', closeModalFn);
  document.getElementById('emailModal')?.addEventListener('click', e=>{ if(e.target.id==='emailModal') closeModalFn(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModalFn(); });
  ['navSubscribeBtn','heroSubscribeBtn','drawerSubscribeBtn'].forEach(id=>
    document.getElementById(id)?.addEventListener('click', openModal)
  );
}

// ─────────────────────────────────────────────
// SUBSCRIBE
// ─────────────────────────────────────────────
function initSubscribeForms() {
  document.getElementById('subscriptionForm')?.addEventListener('submit', async e=>{
    e.preventDefault();
    await submitSub(
      document.getElementById('emailInput').value.trim(),
      document.getElementById('beachSelect').value,
      'subscribeMessage','subscribeBtn'
    );
  });
  document.getElementById('stripSubscribeBtn')?.addEventListener('click', async ()=>{
    await submitSub(
      document.getElementById('stripEmail').value.trim(),
      document.getElementById('stripBeach').value,
      'stripMessage','stripSubscribeBtn'
    );
  });
}
async function submitSub(email,beach,msgId,btnId) {
  if(!email){showMsg(msgId,'Please enter your email.',false);return;}
  const btn=document.getElementById(btnId), orig=btn.innerHTML;
  btn.disabled=true; btn.innerHTML='Subscribing…';
  try {
    const res=await fetch(`${CONFIG.API_URL}/subscribe`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,preferredBeach:beach})
    });
    const d=await res.json();
    if(d.success){
      showMsg(msgId,d.message||'✓ Subscribed — see you at 4 AM.',true);
      // GPay-style card flip success
      const card = document.getElementById(btnId)?.closest('.sub-form-card');
      if (card) {
        // Build success face
        const face = document.createElement('div');
        face.className = 'sub-success-face';

        // Particles
        const particles = document.createElement('div');
        particles.className = 'success-particles';
        const colors = ['#34d399','#6ee7b7','#a7f3d0','#fbbf24','#f59e0b','#ffffff'];
        for (let i = 0; i < 12; i++) {
          const p = document.createElement('div');
          p.className = 'success-particle';
          const angle = (i / 12) * Math.PI * 2;
          const dist = 60 + Math.random() * 40;
          p.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
          p.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
          p.style.background = colors[i % colors.length];
          p.style.animationDelay = `${0.3 + Math.random() * 0.2}s`;
          particles.appendChild(p);
        }
        face.appendChild(particles);

        // Checkmark ring
        const ring = document.createElement('div');
        ring.className = 'success-check-ring';
        ring.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
        face.appendChild(ring);

        // Text
        const title = document.createElement('p');
        title.className = 'success-title';
        title.textContent = 'You\'re in.';
        face.appendChild(title);

        const sub = document.createElement('p');
        sub.className = 'success-subtitle';
        sub.textContent = 'First forecast arrives tomorrow at 4 AM.\nSee you at sunrise.';
        face.appendChild(sub);

        card.appendChild(face);

        // Trigger crossfade
        requestAnimationFrame(() => {
          card.classList.add('sub-success-active');
        });
      }
      const inp=document.getElementById('emailInput'); if(inp)inp.value='';
      setTimeout(closeModalFn,4000);
    } else showMsg(msgId,d.message||'Something went wrong.',false);
  } catch{ showMsg(msgId,'Network error. Please try again.',false); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}
function showMsg(id,msg,ok) {
  const el=document.getElementById(id); if(!el)return;
  el.textContent=msg; el.className='form-message '+(ok?'success':'error');
}

// ─────────────────────────────────────────────
// COMMUNITY — PHOTO UPLOAD + FEEDBACK
// ─────────────────────────────────────────────
function initCommunity() {
  // Photo upload preview
  const fileInput = document.getElementById('photoFile');
  const uploadArea = document.getElementById('photoUploadArea');
  if (fileInput && uploadArea) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      uploadArea.classList.add('has-file');
      // Show preview
      const existing = uploadArea.querySelector('.photo-upload-preview');
      if (existing) existing.remove();
      const reader = new FileReader();
      reader.onload = e => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'photo-upload-preview';
        uploadArea.querySelector('svg').style.display = 'none';
        uploadArea.querySelector('.photo-upload-text').textContent = file.name;
        uploadArea.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  }

  // Set default date to today
  const dateInput = document.getElementById('photoDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Photo form submit
  document.getElementById('photoForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const file = document.getElementById('photoFile').files[0];
    if (!file) { showMsg('photoMessage', 'Please select a photo.', false); return; }

    const btn = document.getElementById('photoSubmitBtn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Uploading…';

    try {
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('beach', document.getElementById('photoBeach').value);
      formData.append('date', document.getElementById('photoDate').value);
      formData.append('name', document.getElementById('photoName').value.trim());

      const res = await fetch(`${CONFIG.API_URL}/sunrise-submission`, {
        method: 'POST',
        body: formData
      });
      const d = await res.json();
      if (d.success) {
        showMsg('photoMessage', 'Thank you — your sunrise has been received.', true);
        document.getElementById('photoForm').reset();
        uploadArea.classList.remove('has-file');
        const preview = uploadArea.querySelector('.photo-upload-preview');
        if (preview) preview.remove();
        uploadArea.querySelector('svg').style.display = '';
        uploadArea.querySelector('.photo-upload-text').textContent = 'Tap to choose a photo';
      } else {
        showMsg('photoMessage', d.message || 'Something went wrong.', false);
      }
    } catch {
      showMsg('photoMessage', 'Network error. Please try again.', false);
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  });

  // Feedback form submit
  document.getElementById('feedbackForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const rating = document.querySelector('input[name="rating"]:checked');
    if (!rating) { showMsg('feedbackMessage', 'Please select a rating.', false); return; }

    const btn = document.getElementById('feedbackSubmitBtn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Sending…';

    try {
      const res = await fetch(`${CONFIG.API_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: rating.value,
          comment: document.getElementById('feedbackComment').value.trim(),
          beach: document.getElementById('feedbackBeach').value
        })
      });
      const d = await res.json();
      if (d.success) {
        showMsg('feedbackMessage', 'Noted — this makes every forecast better. Thank you.', true);
        document.getElementById('feedbackForm').reset();
      } else {
        showMsg('feedbackMessage', d.message || 'Something went wrong.', false);
      }
    } catch {
      showMsg('feedbackMessage', 'Network error. Please try again.', false);
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  });

  // ── Community share buttons ──
  const siteUrl = 'https://www.seasidebeacon.com';
  const shareTextGeneral = `Found something interesting — there's a website that scores tomorrow's sunrise 0 to 100 and tells you if it's actually worth waking up for. Built for Chennai beaches. Free daily forecast at 4 AM.\n${siteUrl}`;
  const shareTextX = `This website scores tomorrow's sunrise 0–100 and tells you if it's worth the 5 AM alarm. Built for Chennai beaches. Kind of obsessed with it. ${siteUrl} 🌅`;
  const shareTextIG = `If you're in Chennai and love sunrises, check out seasidebeacon.com — they score tomorrow's sky 0 to 100 and tell you honestly if it's worth waking up for. Free 4 AM forecast. 🌅`;

  document.getElementById('comShareWA')?.addEventListener('click', e => {
    e.preventDefault();
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareTextGeneral)}`, '_blank');
  });

  document.getElementById('comShareX')?.addEventListener('click', e => {
    e.preventDefault();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTextX)}`, '_blank');
  });

  document.getElementById('comShareReddit')?.addEventListener('click', e => {
    e.preventDefault();
    window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(siteUrl)}&title=${encodeURIComponent('This website scores tomorrow\'s sunrise 0–100 and tells you if it\'s worth waking up for (Chennai beaches)')}`, '_blank');
  });

  document.getElementById('comShareFB')?.addEventListener('click', e => {
    e.preventDefault();
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}`, '_blank');
  });

  document.getElementById('comShareIG')?.addEventListener('click', e => {
    e.preventDefault();
    navigator.clipboard.writeText(shareTextIG).then(() => {
      const btn = e.currentTarget;
      const origText = btn.querySelector('span').textContent;
      btn.querySelector('span').textContent = 'Copied!';
      btn.style.borderColor = 'rgba(52,180,80,0.5)';
      setTimeout(() => {
        btn.querySelector('span').textContent = origText;
        btn.style.borderColor = '';
      }, 2000);
    });
  });
}
function initScrollReveal() {
  // Section headings
  document.querySelectorAll('.section-eyebrow, .section-heading, .section-note').forEach(el => {
    el.classList.add('reveal');
  });
  document.querySelectorAll('.craft-card').forEach((el,i)=>{
    el.classList.add('reveal',`reveal-delay-${i%3+1}`);
  });
  // Story section reveal
  const storyEl = document.querySelector('.story-narrative');
  if (storyEl) storyEl.classList.add('reveal','reveal-delay-1');
  document.querySelectorAll('.sn-photo').forEach((el,i)=>{
    el.classList.add('reveal',`reveal-delay-${i%2+1}`);
  });
  // Case study cards reveal
  document.querySelectorAll('.case-card').forEach((el,i)=>{
    el.classList.add('reveal',`reveal-delay-${i%3+1}`);
  });
  // Subscribe section
  document.querySelectorAll('.sub-heading, .sub-body, .sub-form-card').forEach((el,i) => {
    el.classList.add('reveal', `reveal-delay-${i%3+1}`);
  });
  // Community section
  document.querySelectorAll('.community-card').forEach((el,i) => {
    el.classList.add('reveal', `reveal-delay-${i%2+1}`);
  });
  const comLetter = document.querySelector('.community-letter');
  if (comLetter) comLetter.classList.add('reveal', 'reveal-delay-1');
  // Contact section
  document.querySelectorAll('.contact-card').forEach((el,i) => {
    el.classList.add('reveal', `reveal-delay-${i%2+1}`);
  });
  const contactClosing = document.querySelector('.contact-closing');
  if (contactClosing) contactClosing.classList.add('reveal', 'reveal-delay-1');
  observeReveal();
}
function observeReveal() {
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('visible'); obs.unobserve(e.target); } });
  },{threshold:0.1,rootMargin:'0px 0px -20px 0px'});
  document.querySelectorAll('.reveal:not(.visible)').forEach(el=>obs.observe(el));
}

// ─────────────────────────────────────────────
// SHARE
// ─────────────────────────────────────────────
function initShare() {
  document.getElementById('shareWhatsApp')?.addEventListener('click', () => shareVia('whatsapp'));
  document.getElementById('shareTwitter')?.addEventListener('click', () => shareVia('twitter'));
  document.getElementById('shareCopy')?.addEventListener('click', () => shareVia('copy'));
  document.getElementById('shareNative')?.addEventListener('click', () => shareVia('native'));

  // Show native share button only if Web Share API is available
  if (navigator.share) {
    document.getElementById('shareNative').style.display = 'flex';
  }
}

function updateShareLinks(beach, score, verdict) {
  state._shareText = `Tomorrow's sunrise at ${beach}: ${score}/100 (${verdict}). Check the forecast on Seaside Beacon`;
  state._shareUrl = 'https://www.seasidebeacon.com';
}

function shareVia(platform) {
  const text = state._shareText || 'Check out Seaside Beacon — honest sunrise forecasts for Chennai beaches';
  const url = state._shareUrl || 'https://www.seasidebeacon.com';

  switch (platform) {
    case 'whatsapp':
      window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`, '_blank');
      break;
    case 'twitter':
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
      break;
    case 'copy':
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('shareCopy');
        btn.classList.add('copied');
        showToast('Link copied!');
        setTimeout(() => btn.classList.remove('copied'), 2000);
      });
      break;
    case 'native':
      if (navigator.share) {
        navigator.share({ title: 'Seaside Beacon', text: text, url: url }).catch(() => {});
      }
      break;
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function show(id){ document.getElementById(id)?.classList.remove('hidden'); }
function hide(id){ document.getElementById(id)?.classList.add('hidden'); }
function showToast(msg,ms=3500){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),ms);
}

// ═════════════════════════════════════════════════════
// LIVE METRICS — fetch stats + animated count-up
// ═════════════════════════════════════════════════════
function initMetrics() {
  const strip = document.getElementById('metricsStrip');
  if (!strip) return;

  let hasAnimated = false;

  // Fetch stats from API
  async function fetchStats() {
    try {
      const res = await fetch(`${CONFIG.API_URL}/stats`);
      const json = await res.json();
      if (json.success && json.data) {
        // Set targets on each metric element
        strip.querySelectorAll('.metric-val').forEach(el => {
          const key = el.dataset.key;
          if (key && json.data[key] !== undefined) {
            el.dataset.target = json.data[key];
          }
        });
      }
    } catch (e) {
      // API failed — show zeros rather than fake estimates
      // SiteStats is the source of truth; no point guessing
      console.warn('Stats API unavailable, metrics will show 0');
    }
  }

  // Animated count-up with easing
  function animateCountUp(el, target) {
    const duration = 1800; // ms
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      el.textContent = current.toLocaleString('en-IN');
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  // Trigger count-up when strip scrolls into view
  function checkVisibility() {
    if (hasAnimated) return;
    const rect = strip.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85 && rect.bottom > 0) {
      hasAnimated = true;
      strip.querySelectorAll('.metric-val').forEach(el => {
        const target = parseInt(el.dataset.target) || 0;
        if (target > 0) {
          animateCountUp(el, target);
        }
      });
    }
  }

  // Load stats then watch scroll
  fetchStats().then(() => {
    checkVisibility();
    window.addEventListener('scroll', checkVisibility, { passive: true });
  });
}

// ═════════════════════════════════════════════════════
// CINEMA MODE — immersive sunrise toggle
// ═════════════════════════════════════════════════════
function initCinemaMode() {
  const btn = document.getElementById('cinemaToggle');
  if (!btn) return;
  const label = btn.querySelector('.cinema-label');

  btn.addEventListener('click', () => {
    const active = document.body.classList.toggle('cinema-mode');
    label.textContent = active ? 'Exit' : 'Cinema';
    // Scroll to top for best view when entering
    if (active) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // ESC key to exit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('cinema-mode')) {
      document.body.classList.remove('cinema-mode');
      label.textContent = 'Cinema';
    }
  });
}