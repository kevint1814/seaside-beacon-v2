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
  initSunriseCanvas();
  initScrollProgress();
  initNav();
  initBeachSelector();
  initForecast();
  initTabs();
  initDeepPanel();
  initModals();
  initSubscribeForms();
  initShare();
  initScrollReveal();
  initMetrics();
});

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
    // Map first 55% of page scroll to the full sunrise (0→1)
    // After 55%, the sky stays in "morning" state
    scrollProgress = Math.min(1, raw / 0.55);
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
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
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
   *   0.25 = civil twilight (purple/violet horizon)
   *   0.50 = golden hour (warm amber/peach) — PEAK
   *   0.75 = post-sunrise (golden afterglow lingers, NOT blue)
   *   1.00 = settled morning (dark warm, blends with glass UI)
   *
   * KEY DESIGN RULE: never go cold/clinical blue. The glass UI needs
   * a warm, muted backdrop at all scroll positions. The golden afterglow
   * should linger well past 50% — don't rush to neutral.
   */

  // Zenith (top of sky) — blue sky emerges when sun is up
  const zenithStops = [
    [0.0,  [6, 6, 16]],        // deep night indigo
    [0.15, [8, 7, 22]],        // barely lighter
    [0.3,  [16, 12, 38]],      // twilight deep
    [0.45, [28, 20, 50]],      // twilight violet
    [0.6,  [38, 28, 48]],      // muted purple dawn
    [0.72, [26, 34, 58]],      // blue coming through
    [0.85, [20, 36, 62]],      // clear morning blue
    [1.0,  [16, 34, 60]]       // settled: dark sky blue
  ];

  // Mid-sky — warm rose blooms then slowly fades, blue at end
  const midStops = [
    [0.0,  [10, 10, 30]],
    [0.2,  [18, 14, 42]],
    [0.35, [40, 22, 52]],
    [0.5,  [105, 55, 50]],     // warm rose peak
    [0.6,  [95, 52, 48]],      // rose lingers
    [0.72, [58, 40, 50]],      // fading warm with blue hint
    [0.85, [30, 32, 48]],      // blue tint
    [1.0,  [20, 28, 46]]       // settled: warm blue
  ];

  // Horizon — amber fire → golden → warm afterglow lingers → dark
  const horizonStops = [
    [0.0,  [40, 16, 12]],      // faint ember
    [0.18, [70, 28, 16]],      // deepening warm
    [0.35, [160, 72, 28]],     // amber fire building
    [0.5,  [220, 140, 55]],    // peak golden
    [0.62, [200, 125, 52]],    // golden lingers
    [0.75, [145, 85, 45]],     // warm afterglow
    [0.88, [75, 50, 35]],      // fading ember
    [1.0,  [35, 26, 22]]       // settled: dark warm
  ];

  // Glow color stops (radial glow at horizon)
  const glowStops = [
    [0.0,  [196, 105, 50]],
    [0.25, [220, 125, 48]],
    [0.45, [250, 175, 65]],    // intense golden
    [0.6,  [235, 160, 72]],    // golden lingers
    [0.75, [180, 115, 60]],    // warm afterglow
    [0.9,  [110, 70, 42]],
    [1.0,  [55, 38, 28]]       // warm dim
  ];

  // Sea — dark → warm tinted → dark warm
  const seaStops = [
    [0.0,  [6, 5, 12]],        // near black
    [0.25, [10, 8, 18]],
    [0.45, [28, 18, 24]],      // warm purple-tinted
    [0.6,  [35, 25, 28]],      // peak warm sea
    [0.75, [28, 22, 25]],      // cooling slowly
    [1.0,  [14, 12, 16]]       // settled: very dark warm
  ];

  function draw(t) {
    const sp = ease(scrollProgress);

    // Small breathing still present, but subtler as scroll progresses
    const breathAmp = 1 - sp * 0.8; // breathing fades as sunrise progresses
    const breath = 0.5 + 0.5 * Math.sin(t * 0.000022);
    const warmth = breath * breathAmp * 0.15; // very subtle pulsing

    // ── Sky gradient ──────────────────────────
    const zenith  = multiLerp(zenithStops, sp);
    const mid     = multiLerp(midStops, sp);
    const horizon = multiLerp(horizonStops, sp);

    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    sky.addColorStop(0,    `rgb(${zenith[0]},${zenith[1]},${zenith[2]})`);
    sky.addColorStop(0.25, `rgb(${Math.round(zenith[0]*0.7+mid[0]*0.3)},${Math.round(zenith[1]*0.7+mid[1]*0.3)},${Math.round(zenith[2]*0.7+mid[2]*0.3)})`);
    sky.addColorStop(0.5,  `rgb(${mid[0]},${mid[1]},${mid[2]})`);
    sky.addColorStop(0.72, `rgb(${Math.round(mid[0]*0.4+horizon[0]*0.6)},${Math.round(mid[1]*0.4+horizon[1]*0.6)},${Math.round(mid[2]*0.4+horizon[2]*0.6)})`);
    sky.addColorStop(0.88, `rgb(${Math.round(horizon[0]*0.8+mid[0]*0.2)},${Math.round(horizon[1]*0.8+mid[1]*0.2)},${Math.round(horizon[2]*0.8+mid[2]*0.2)})`);
    sky.addColorStop(1,    `rgb(${horizon[0]},${horizon[1]},${horizon[2]})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.75);

    // ── Horizon glow — intensifies then fades ──
    const gc = multiLerp(glowStops, sp);
    const glowPeak = sp < 0.5 ? sp * 2 : Math.max(0, 2 - sp * 2.2);
    const glowIntensity = 0.15 + glowPeak * 0.50 + warmth;
    const horizonY = H * 0.72;

    const glowR = ctx.createRadialGradient(W*0.5, horizonY, 0, W*0.5, horizonY, W * (0.5 + sp*0.3));
    glowR.addColorStop(0,    `rgba(${gc[0]},${gc[1]},${gc[2]},${glowIntensity})`);
    glowR.addColorStop(0.22, `rgba(${gc[0]},${gc[1]},${gc[2]},${glowIntensity*0.65})`);
    glowR.addColorStop(0.48, `rgba(${Math.max(0,gc[0]-40)},${Math.max(0,gc[1]-30)},${Math.max(0,gc[2]-15)},${glowIntensity*0.28})`);
    glowR.addColorStop(0.75, `rgba(${Math.max(0,gc[0]-70)},${Math.max(0,gc[1]-50)},${Math.max(0,gc[2]-25)},${glowIntensity*0.08})`);
    glowR.addColorStop(1,    `rgba(0,0,0,0)`);
    ctx.fillStyle = glowR;
    ctx.fillRect(0, 0, W, H * 0.75);

    // ── Warm atmospheric wash — prevents cold sky at any scroll ──
    // Faint warm overlay that covers the entire sky, strongest at mid-phase
    if (sp > 0.2) {
      const washPeak = sp < 0.55 ? (sp - 0.2) / 0.35 : Math.max(0.15, 1 - (sp - 0.55) / 0.6);
      const washStr = washPeak * 0.07;
      const wash = ctx.createRadialGradient(W*0.5, horizonY * 0.6, 0, W*0.5, horizonY * 0.6, W * 0.85);
      wash.addColorStop(0,   `rgba(180,110,55,${washStr})`);
      wash.addColorStop(0.5, `rgba(140,75,40,${washStr * 0.5})`);
      wash.addColorStop(1,   `rgba(0,0,0,0)`);
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W, H * 0.75);
    }

    // ── Sun disc (appears after 30% scroll) — BIG, layered ──
    if (sp > 0.30) {
      const sunProgress = Math.min(1, (sp - 0.30) / 0.45); // 0→1 over 30-75% scroll
      const sunEased = ease(sunProgress);
      const sunY = horizonY - sunEased * H * 0.22; // rises higher
      const sunR = 38 + sunEased * 32; // much bigger disc
      const sunAlpha = Math.min(1, sunProgress * 2.0);

      // Layer 1: atmospheric haze — enormous soft warm wash
      const hazeR = sunR * 18;
      const haze = ctx.createRadialGradient(W*0.5, sunY, 0, W*0.5, sunY, hazeR);
      haze.addColorStop(0,    `rgba(255,215,130,${sunAlpha * 0.14})`);
      haze.addColorStop(0.15, `rgba(255,190,100,${sunAlpha * 0.08})`);
      haze.addColorStop(0.35, `rgba(255,160,70,${sunAlpha * 0.035})`);
      haze.addColorStop(0.6,  `rgba(255,140,50,${sunAlpha * 0.012})`);
      haze.addColorStop(1,    `rgba(255,130,40,0)`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);

      // Layer 2: far corona
      const coronaR = sunR * 6;
      const corona = ctx.createRadialGradient(W*0.5, sunY, sunR * 0.6, W*0.5, sunY, coronaR);
      corona.addColorStop(0,   `rgba(255,225,150,${sunAlpha * 0.35})`);
      corona.addColorStop(0.25,`rgba(255,200,110,${sunAlpha * 0.18})`);
      corona.addColorStop(0.5, `rgba(255,170,80,${sunAlpha * 0.07})`);
      corona.addColorStop(1,   `rgba(255,150,60,0)`);
      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(W*0.5, sunY, coronaR, 0, Math.PI*2);
      ctx.fill();

      // Layer 3: inner bright glow (tight around disc)
      const innerGlow = ctx.createRadialGradient(W*0.5, sunY, 0, W*0.5, sunY, sunR * 2.5);
      innerGlow.addColorStop(0,   `rgba(255,248,225,${sunAlpha * 0.55})`);
      innerGlow.addColorStop(0.3, `rgba(255,230,170,${sunAlpha * 0.30})`);
      innerGlow.addColorStop(0.6, `rgba(255,210,120,${sunAlpha * 0.10})`);
      innerGlow.addColorStop(1,   `rgba(255,190,90,0)`);
      ctx.fillStyle = innerGlow;
      ctx.beginPath();
      ctx.arc(W*0.5, sunY, sunR * 2.5, 0, Math.PI*2);
      ctx.fill();

      // Layer 4: sun disc body — hot white center, amber edge
      const sunDisc = ctx.createRadialGradient(W*0.5, sunY, 0, W*0.5, sunY, sunR);
      sunDisc.addColorStop(0,    `rgba(255,254,245,${sunAlpha * 0.99})`);
      sunDisc.addColorStop(0.35, `rgba(255,245,210,${sunAlpha * 0.97})`);
      sunDisc.addColorStop(0.65, `rgba(255,225,150,${sunAlpha * 0.90})`);
      sunDisc.addColorStop(0.85, `rgba(255,200,100,${sunAlpha * 0.65})`);
      sunDisc.addColorStop(1,    `rgba(255,175,65,${sunAlpha * 0.18})`);
      ctx.fillStyle = sunDisc;
      ctx.beginPath();
      ctx.arc(W*0.5, sunY, sunR, 0, Math.PI*2);
      ctx.fill();
    }

    // ── Sea ───────────────────────────────────
    const seaC = multiLerp(seaStops, sp);
    const seaGrad = ctx.createLinearGradient(0, H*0.72, 0, H);
    seaGrad.addColorStop(0, `rgb(${seaC[0]},${seaC[1]},${seaC[2]})`);
    seaGrad.addColorStop(1, `rgb(${Math.max(0,seaC[0]-4)},${Math.max(0,seaC[1]-3)},${Math.max(0,seaC[2]-5)})`);
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, H*0.72, W, H * 0.28);

    // ── Sea reflection — soft radial glow, no hard edges ─────────
    const reflC = multiLerp(glowStops, sp);
    const reflIntensity = 0.06 + glowPeak * 0.24 + warmth;
    const refX = W * 0.5;
    const reflW = W * (0.10 + sp * 0.14);
    const seaTop = H * 0.72;
    const seaH = H * 0.28;

    // Primary reflection: radial ellipse centered at horizon, fading in all directions
    // Using save/restore + scale to create an elliptical radial gradient
    ctx.save();
    ctx.translate(refX, seaTop);
    ctx.scale(1, seaH / reflW); // squash vertically to make an ellipse
    const reflRadial = ctx.createRadialGradient(0, 0, 0, 0, 0, reflW);
    reflRadial.addColorStop(0,    `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.9})`);
    reflRadial.addColorStop(0.15, `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.65})`);
    reflRadial.addColorStop(0.35, `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.35})`);
    reflRadial.addColorStop(0.6,  `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.12})`);
    reflRadial.addColorStop(0.85, `rgba(${reflC[0]},${reflC[1]},${reflC[2]},${reflIntensity * 0.03})`);
    reflRadial.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = reflRadial;
    ctx.beginPath();
    ctx.arc(0, 0, reflW, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bright horizon kiss — radial glow right where sun meets water
    if (sp > 0.28) {
      const coreP = Math.min(1, (sp - 0.28) / 0.3);
      const coreFade = sp > 0.75 ? Math.max(0, 1 - (sp - 0.75) / 0.2) : 1;
      const coreStr = coreP * coreFade * 0.3;
      if (coreStr > 0.01) {
        const coreRx = reflW * 0.7;
        const coreRy = H * 0.06;
        ctx.save();
        ctx.translate(refX, seaTop + 2);
        ctx.scale(1, coreRy / coreRx);
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRx);
        coreGrad.addColorStop(0,   `rgba(255,240,180,${coreStr})`);
        coreGrad.addColorStop(0.3, `rgba(255,215,130,${coreStr * 0.5})`);
        coreGrad.addColorStop(0.7, `rgba(255,190,90,${coreStr * 0.12})`);
        coreGrad.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, 0, coreRx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Scattered shimmer fragments — small soft ellipses, not rectangles
    if (sp > 0.22) {
      const shimmerAlpha = Math.min(1, (sp - 0.22) / 0.25) * glowPeak;
      for (let s = 0; s < 18; s++) {
        const sx = refX + (pseudoRand(s*31+5) - 0.5) * reflW * 2.8;
        const sy = H * (0.735 + pseudoRand(s*17+3) * 0.20);
        const sw = 4 + pseudoRand(s*23) * 22; // half-width
        const sh = 1 + pseudoRand(s*11) * 1.5; // half-height
        const flickerSpeed = 0.0015 + pseudoRand(s*7) * 0.004;
        const flicker = 0.2 + 0.8 * Math.abs(Math.sin(t * flickerSpeed + s * 2.1));
        const distFade = 1 - (sy - H*0.73) / (H*0.24);
        const sa = shimmerAlpha * flicker * 0.12 * Math.max(0, distFade);
        if (sa < 0.004) continue;
        // Soft elliptical shimmer using radial gradient
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, sh / sw);
        const shimGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sw);
        shimGrad.addColorStop(0,   `rgba(${reflC[0]},${Math.min(255,reflC[1]+35)},${Math.min(255,reflC[2]+25)},${sa})`);
        shimGrad.addColorStop(0.5, `rgba(${reflC[0]},${Math.min(255,reflC[1]+20)},${Math.min(255,reflC[2]+15)},${sa * 0.4})`);
        shimGrad.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = shimGrad;
        ctx.beginPath();
        ctx.arc(0, 0, sw, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Stars — fade out as sunrise progresses ──
    const starAlpha = Math.max(0, 1 - sp * 2.2); // gone by ~45% scroll
    if (starAlpha > 0.01) {
      STARS.forEach(s => {
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);
        const a = starAlpha * s.brightness * (0.4 + twinkle * 0.6);
        if (a < 0.01) return;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(228,224,255,${a})`;
        ctx.fill();
      });
    }

    // ── Cloud wisps — brighten during golden hour, stay warm ──
    const cloudBright = sp < 0.3 ? sp / 0.3 : sp < 0.65 ? 1 : 1 - (sp-0.65)/0.35;
    const cloudConfigs = [
      { yBase: 0.42, thick: 6,  speed: 0.00008, phase: 0.0,  wMul: 0.35 }, // high wisp
      { yBase: 0.48, thick: 8,  speed: 0.00006, phase: 0.8,  wMul: 0.28 }, // high wisp
      { yBase: 0.53, thick: 10, speed: 0.00010, phase: 1.5,  wMul: 0.32 },
      { yBase: 0.57, thick: 12, speed: 0.00007, phase: 0.4,  wMul: 0.40 },
      { yBase: 0.61, thick: 10, speed: 0.00012, phase: 2.2,  wMul: 0.30 },
      { yBase: 0.65, thick: 14, speed: 0.00005, phase: 1.0,  wMul: 0.38 }, // near horizon — thickest
    ];
    const cloudColorStops = [
      [0, [160, 85, 50]], [0.35, [220, 140, 65]], [0.5, [245, 195, 105]],
      [0.7, [200, 140, 80]], [0.9, [100, 70, 50]], [1, [55, 40, 32]]
    ];
    const cloudColor = multiLerp(cloudColorStops, sp);

    for (let c = 0; c < cloudConfigs.length; c++) {
      const cc = cloudConfigs[c];
      const cy  = H * cc.yBase;
      const cwx = (t * cc.speed + cc.phase) % 1.4 - 0.2;
      const cw  = W * (cc.wMul + pseudoRand(c*7) * 0.15);
      const distFromHorizon = 1 - Math.abs(cc.yBase - 0.60) / 0.20; // brightest near horizon
      const cAlpha = (0.015 + cloudBright * 0.09) * Math.max(0.3, distFromHorizon);

      const cGrad = ctx.createLinearGradient(cwx*W, 0, cwx*W + cw, 0);
      cGrad.addColorStop(0,   'rgba(0,0,0,0)');
      cGrad.addColorStop(0.15, `rgba(${cloudColor[0]},${cloudColor[1]},${cloudColor[2]},${cAlpha * 0.4})`);
      cGrad.addColorStop(0.4, `rgba(${cloudColor[0]},${cloudColor[1]},${cloudColor[2]},${cAlpha})`);
      cGrad.addColorStop(0.6, `rgba(${cloudColor[0]},${cloudColor[1]},${cloudColor[2]},${cAlpha * 0.85})`);
      cGrad.addColorStop(0.85, `rgba(${cloudColor[0]},${cloudColor[1]},${cloudColor[2]},${cAlpha * 0.3})`);
      cGrad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = cGrad;
      ctx.fillRect(cwx*W, cy - cc.thick/2, cw, cc.thick);
    }

    // ── Crepuscular rays — 16 rays, screen blended, wide fan ──
    if (sp > 0.15 && sp < 0.92) {
      const rayIntensity = sp < 0.5 ? (sp-0.15)/0.35 : (0.92-sp)/0.42;
      const baseAlpha = rayIntensity * 0.10;

      const sunYForRays = sp > 0.30 ? horizonY - ease(Math.min(1,(sp-0.30)/0.45)) * H * 0.22 : horizonY;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // 16 rays with varied width, length, and gentle sway
      const rayConfigs = [
        { angle: -0.60, width: 14, lenMul: 0.75 },
        { angle: -0.50, width: 24, lenMul: 0.92 },
        { angle: -0.40, width: 32, lenMul: 1.05 },
        { angle: -0.30, width: 18, lenMul: 0.82 },
        { angle: -0.22, width: 38, lenMul: 1.10 },
        { angle: -0.13, width: 22, lenMul: 0.88 },
        { angle: -0.05, width: 42, lenMul: 1.15 },
        { angle:  0.02, width: 28, lenMul: 0.95 },
        { angle:  0.10, width: 45, lenMul: 1.12 },
        { angle:  0.18, width: 20, lenMul: 0.85 },
        { angle:  0.26, width: 36, lenMul: 1.08 },
        { angle:  0.34, width: 16, lenMul: 0.78 },
        { angle:  0.42, width: 30, lenMul: 1.00 },
        { angle:  0.50, width: 25, lenMul: 0.90 },
        { angle:  0.58, width: 12, lenMul: 0.72 },
        { angle:  0.65, width: 20, lenMul: 0.80 },
      ];

      for (let r = 0; r < rayConfigs.length; r++) {
        const rc = rayConfigs[r];
        const sway = Math.sin(t * 0.000022 + r * 1.9) * 0.018;
        const shimmer = 0.55 + 0.45 * Math.sin(t * 0.00004 + r * 2.7);
        const angle = rc.angle + sway;
        const rayLen = H * 0.72 * rc.lenMul;
        const x2 = W*0.5 + Math.sin(angle) * rayLen;
        const y2 = sunYForRays - Math.cos(angle) * rayLen;
        const rayAlpha = baseAlpha * shimmer * (0.5 + pseudoRand(r*13) * 0.5);

        if (rayAlpha < 0.003) continue;

        const rayGrad = ctx.createLinearGradient(W*0.5, sunYForRays, x2, y2);
        rayGrad.addColorStop(0,    `rgba(255,220,130,${rayAlpha * 1.2})`);
        rayGrad.addColorStop(0.2,  `rgba(255,200,100,${rayAlpha * 0.7})`);
        rayGrad.addColorStop(0.45, `rgba(255,180,80,${rayAlpha * 0.3})`);
        rayGrad.addColorStop(0.7,  `rgba(255,165,65,${rayAlpha * 0.08})`);
        rayGrad.addColorStop(1,    `rgba(255,150,55,0)`);
        ctx.strokeStyle = rayGrad;
        ctx.lineWidth = rc.width;
        ctx.beginPath();
        ctx.moveTo(W*0.5, sunYForRays);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // ── Sea wave shimmer ─────────────────────
    const waveColor = multiLerp(glowStops, sp);
    const waveAlpha = 0.025 + glowPeak * 0.07;
    for (let w = 0; w < 7; w++) {
      const wy   = H * (0.73 + w * 0.035);
      const amp  = 4.5 - w * 0.45;
      const freq = 0.004 + w * 0.0015;
      const spd  = 0.0004 + w * 0.00012;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = wy + amp * Math.sin(x * freq + t * spd + w * 1.2);
        x===0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${waveColor[0]},${waveColor[1]},${waveColor[2]},${(waveAlpha) * (1-w*0.11)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  function pseudoRand(n) {
    const x = Math.sin(n + 1) * 43758.5453;
    return x - Math.floor(x);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
}

// ─────────────────────────────────────────────
// SCROLL PROGRESS
// ─────────────────────────────────────────────
function initScrollProgress() {
  const bar = document.getElementById('scrollProgress');
  window.addEventListener('scroll', () => {
    bar.style.width = (window.scrollY/(document.body.scrollHeight-window.innerHeight)*100)+'%';
  }, {passive:true});
}

// ─────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────
function initNav() {
  const nav = document.getElementById('nav');
  const ham = document.getElementById('navHamburger');
  const drawer = document.getElementById('navDrawer');

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
  document.getElementById('fmrgTime').textContent = `${gh.start||'5:38 AM'} — ${gh.end||'6:20 AM'}`;
  document.getElementById('fmrgPeak').textContent = gh.peak||gh.start||'5:50 AM';

  const labels = pred.atmosphericLabels||{};
  document.getElementById('conditionsStrip').innerHTML = [
    {lbl:'Cloud Cover',val:`${f.cloudCover}%`,    sub:labels.cloudLabel    ||(f.cloudCover>=30&&f.cloudCover<=60?'Optimal':f.cloudCover<30?'Clear':'Heavy')},
    {lbl:'Humidity', val:`${f.humidity}%`,       sub:labels.humidityLabel ||(f.humidity<=55?'Low':'High')},
    {lbl:'Visibility',val:`${f.visibility}km`,   sub:labels.visibilityLabel||(f.visibility>=10?'Excellent':'Good')},
    {lbl:'Wind',     val:`${f.windSpeed}km/h`,   sub:labels.windLabel     ||(f.windSpeed<=15?'Calm':'Breezy')}
  ].map(c=>`<div class="cond-item"><div class="cond-label">${c.lbl}</div><div class="cond-val">${c.val}</div><div class="cond-sub">${c.sub}</div></div>`).join('');

  document.getElementById('fmriInsight').textContent = p?.insight||`${pred.verdict} conditions forecast for ${w.beach} at dawn.`;

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

  document.getElementById('expTitle').textContent = `What tomorrow's sunrise will look like at ${beachName}`;

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
  document.getElementById('deepSubtitle').textContent = `For ${beachName} · Tomorrow morning`;
  show('deepPanel');
  renderConditionsTab(f,pred,p);
  renderDSLRTab(p);
  renderMobileTab(p);
  renderCompositionTab(p);
}


function renderConditionsTab(f,pred,p) {
  const labels=pred.atmosphericLabels||{}, atm=p?.atmosphericAnalysis||{};
  const items=[
    {lbl:'Cloud Cover',val:`${f.cloudCover}%`,
     rating:labels.cloudLabel||(f.cloudCover>=30&&f.cloudCover<=60?'Optimal':f.cloudCover<30?'Too Clear':'Heavy'),
     cls:f.cloudCover>=30&&f.cloudCover<=60?'ab-good':f.cloudCover<=75?'ab-ok':'ab-bad',
     body:atm.cloudCover?.impact||(f.cloudCover>=30&&f.cloudCover<=60
       ?`At ${f.cloudCover}%, clouds sit in the photographic sweet spot — thick enough to catch the sub-horizon light, thin enough to let colour through. Expect reds and golds.`
       :f.cloudCover<30?`At ${f.cloudCover}%, mostly clear sky. Clean but potentially flat — the dramatic fire sky needs cloud texture to ignite.`
       :`At ${f.cloudCover}%, heavy cover. Colours will likely be muted and diffused. Look for gaps where light breaks through.`)},
    {lbl:'Humidity',val:`${f.humidity}%`,
     rating:labels.humidityLabel||(f.humidity<=40?'Excellent':f.humidity<=55?'Very Good':f.humidity<=70?'Moderate':'High'),
     cls:f.humidity<=55?'ab-good':f.humidity<=70?'ab-ok':'ab-bad',
     body:atm.humidity?.impact||(f.humidity<=55
       ?`At ${f.humidity}%, the atmosphere is dry. Light travels cleanly — colours will be saturated, contrast strong, and shadows crisp.`
       :`At ${f.humidity}%, moderate moisture in the air. Expect slightly warmer, hazier tones — the sea horizon may soften slightly.`)},
    {lbl:'Visibility',val:`${f.visibility}km`,
     rating:labels.visibilityLabel||(f.visibility>=15?'Exceptional':f.visibility>=10?'Excellent':f.visibility>=8?'Very Good':'Moderate'),
     cls:f.visibility>=8?'ab-good':f.visibility>=5?'ab-ok':'ab-bad',
     body:atm.visibility?.impact||`${f.visibility}km — ${f.visibility>=10?'exceptional clarity. Distant elements will render sharply. Strong colour separation across the sky.':'good conditions with some atmospheric haze, which can soften the horizon and add warmth to long exposures.'}`},
    {lbl:'Wind',val:`${f.windSpeed}km/h`,
     rating:labels.windLabel||(f.windSpeed<=10?'Calm':f.windSpeed<=20?'Light':f.windSpeed<=30?'Moderate':'Strong'),
     cls:f.windSpeed<=20?'ab-good':f.windSpeed<=30?'ab-ok':'ab-bad',
     body:atm.wind?.impact||(f.windSpeed<=10
       ?`Calm at ${f.windSpeed}km/h. Cloud formations will hold their shape. Long exposures of 20–30 seconds are fully viable.`
       :`${f.windSpeed}km/h will drift cloud formations across the sky. Keep exposures under 5 seconds for sharp cloud edges, or embrace the motion blur deliberately.`)}
  ];
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
  document.getElementById('beachCompareGrid').innerHTML=
    Object.keys(meta).map(key=>{
      const m=meta[key], d=beaches[key]||{}, suit=d.suitability||'Fair', isBest=key===comp.todaysBest;
      return `<div class="comp-card ${isBest?'best-today':''}">
        <div class="cc-header">
          <div class="cc-name">${m.name}</div>
          <span class="cc-suit ${suitCls[suit]||'cs-fair'}">${suit}</span>
        </div>
        <div class="cc-meta">${m.sub}</div>
        <div class="cc-reason">${d.reason||`Conditions at ${m.name} for tomorrow's dawn.`}</div>
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
function openModal() { document.getElementById('emailModal').classList.add('active'); }
function closeModalFn() { document.getElementById('emailModal').classList.remove('active'); }
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
      const inp=document.getElementById('emailInput'); if(inp)inp.value='';
      setTimeout(closeModalFn,2400);
    } else showMsg(msgId,d.message||'Something went wrong.',false);
  } catch{ showMsg(msgId,'Network error. Please try again.',false); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}
function showMsg(id,msg,ok) {
  const el=document.getElementById(id); if(!el)return;
  el.textContent=msg; el.className='form-message '+(ok?'success':'error');
}

// ─────────────────────────────────────────────
// SCROLL REVEAL
// ─────────────────────────────────────────────
function initScrollReveal() {
  document.querySelectorAll('.craft-card').forEach((el,i)=>{
    el.classList.add('reveal',`reveal-delay-${i%3+1}`);
  });
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
  state._shareUrl = 'https://seasidebeacon.com';
}

function shareVia(platform) {
  const text = state._shareText || 'Check out Seaside Beacon — honest sunrise forecasts for Chennai beaches';
  const url = state._shareUrl || 'https://seasidebeacon.com';

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
      // Fallback: calculate from launch date
      const launch = new Date('2026-02-16');
      const now = new Date();
      const days = Math.max(1, Math.floor((now - launch) / (1000 * 60 * 60 * 24)));
      const fallback = {
        forecastsGenerated: days * 4,    // 4 beaches/day
        consecutiveDays: days,
        dataPointsProcessed: days * 24   // 6 factors × 4 beaches
      };
      strip.querySelectorAll('.metric-val').forEach(el => {
        const key = el.dataset.key;
        if (key && fallback[key] !== undefined) {
          el.dataset.target = fallback[key];
        }
      });
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