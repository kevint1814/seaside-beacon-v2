// ═══════════════════════════════════════════════
// SEASIDE BEACON
// Liquid Glass · Beach Sunrise · Ultra Premium
// ═══════════════════════════════════════════════

const CONFIG = {
  API_URL: (window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://seaside-beacon.onrender.com/api'
};

const state = {
  beach:'marina', weather:null, photography:null, loading:false,
  _loadInterval:null, _coldInterval:null
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
  initScrollReveal();
});

// ═════════════════════════════════════════════════════
// SUNRISE CANVAS — real pre-dawn beach sky physics
// ═════════════════════════════════════════════════════
function initSunriseCanvas() {
  const canvas = document.getElementById('sunriseCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H;

  // Stable star positions — seeded, not random each frame
  const STARS = Array.from({length:110}, (_,i) => ({
    x: pseudoRand(i*17+3),
    y: pseudoRand(i*7+11) * 0.7,  // only upper 70% of sky
    r: 0.4 + pseudoRand(i*31+7) * 1.1,
    twinkleSpeed: 0.0008 + pseudoRand(i*13) * 0.0016,
    twinklePhase: pseudoRand(i*19) * Math.PI * 2,
    brightness: 0.2 + pseudoRand(i*23) * 0.7
  }));

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  function draw(t) {
    // Very slow breathing — full cycle ~40s
    // Simulates the gradual lightening before dawn
    const phase   = t * 0.000022;
    const light   = 0.5 + 0.5 * Math.sin(phase);      // 0=darkest, 1=brightest pre-dawn
    const warmth  = 0.5 + 0.5 * Math.sin(phase * 0.7); // horizon warmth slightly offset

    // ── Sky gradient ──────────────────────────
    // Zenith: deep indigo-black
    // Mid: violet-blue (scattered light from below horizon)
    // Horizon: warm copper-rose glow of imminent dawn
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    const r1 = 4  + light * 6;
    const g1 = 4  + light * 5;
    const b1 = 12 + light * 16;
    sky.addColorStop(0,    `rgb(${r1},${g1},${b1})`);
    sky.addColorStop(0.22, `rgb(${7+light*8},${6+light*8},${22+light*18})`);
    sky.addColorStop(0.5,  `rgb(${10+light*10},${8+light*9},${28+light*22})`);
    sky.addColorStop(0.72, `rgb(${18+warmth*24},${10+warmth*10},${28+warmth*12})`);
    sky.addColorStop(0.88, `rgb(${28+warmth*38},${12+warmth*14},${18+warmth*8})`);
    sky.addColorStop(1,    `rgb(${38+warmth*46},${14+warmth*16},${10})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.75);

    // ── Horizon glow — the sub-horizon light ──
    // This is what makes a dawn sky feel alive:
    // light wells up from below the horizon before sun appears
    const horizonY = H * 0.72;
    const glowR = ctx.createRadialGradient(W*0.5, horizonY, 0, W*0.5, horizonY, W * 0.65);
    glowR.addColorStop(0,   `rgba(196,105,50,${0.18 + warmth*0.22})`);
    glowR.addColorStop(0.28,`rgba(160,70,60,${0.10 + warmth*0.12})`);
    glowR.addColorStop(0.55,`rgba(100,40,70,${0.05 + warmth*0.06})`);
    glowR.addColorStop(1,   `rgba(0,0,0,0)`);
    ctx.fillStyle = glowR;
    ctx.fillRect(0, 0, W, H * 0.75);

    // ── Sea ───────────────────────────────────
    const seaGrad = ctx.createLinearGradient(0, H*0.72, 0, H);
    seaGrad.addColorStop(0, `rgb(${6+warmth*10},${5+warmth*6},${12+warmth*6})`);
    seaGrad.addColorStop(1, `rgb(3,4,9)`);
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, H*0.72, W, H * 0.28);

    // ── Sea reflection — light column ─────────
    // The horizon glow reflects as a shimmering column on the water
    const refX = W * 0.5;
    const reflW = W * (0.08 + warmth*0.06);
    const refGrad = ctx.createLinearGradient(refX - reflW, 0, refX + reflW, 0);
    refGrad.addColorStop(0,   'rgba(0,0,0,0)');
    refGrad.addColorStop(0.3, `rgba(196,120,60,${0.04 + warmth*0.06})`);
    refGrad.addColorStop(0.5, `rgba(212,140,70,${0.08 + warmth*0.10})`);
    refGrad.addColorStop(0.7, `rgba(196,120,60,${0.04 + warmth*0.06})`);
    refGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = refGrad;
    ctx.fillRect(0, H*0.72, W, H*0.28);

    // ── Stars ─────────────────────────────────
    // Fade out as dawn brightens
    const starAlpha = Math.max(0, 1 - light * 0.6);
    STARS.forEach(s => {
      const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);
      const a = starAlpha * s.brightness * (0.4 + twinkle * 0.6);
      if (a < 0.01) return;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(228,224,255,${a})`;
      ctx.fill();
    });

    // ── Cloud wisps ───────────────────────────
    // Very faint, slow-moving cloud streaks catching dawn light
    // Only visible near horizon where the glow is strongest
    for (let c = 0; c < 4; c++) {
      const cy  = H * (0.58 + c * 0.04);
      const cwx = (t * (0.0001 + c*0.00005) + c * 0.6) % 1.4 - 0.2;
      const cw  = W * (0.3 + pseudoRand(c*7) * 0.25);
      const cAlpha = (0.03 + warmth * 0.05) * (1 - c * 0.18);
      const cGrad = ctx.createLinearGradient(cwx*W, 0, cwx*W + cw, 0);
      cGrad.addColorStop(0,   'rgba(0,0,0,0)');
      cGrad.addColorStop(0.3, `rgba(200,120,80,${cAlpha})`);
      cGrad.addColorStop(0.7, `rgba(180,100,70,${cAlpha * 0.7})`);
      cGrad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = cGrad;
      ctx.fillRect(cwx*W, cy - 4, cw, 10);
    }

    // ── Sea wave shimmer ─────────────────────
    for (let w = 0; w < 5; w++) {
      const wy   = H * (0.73 + w * 0.05);
      const amp  = 5 - w * 0.7;
      const freq = 0.005 + w * 0.0018;
      const spd  = 0.00045 + w * 0.00015;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = wy + amp * Math.sin(x * freq + t * spd + w * 1.2);
        x===0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(196,130,70,${(0.04 + warmth*0.04) * (1-w*0.15)})`;
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
  show('fmasterIdle'); hide('fmasterLoading'); hide('fmasterResult'); hide('deepPanel');
  document.getElementById('forecastMaster').classList.remove('loaded');
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
  const coldTimer = setTimeout(showColdStart, 4000);
  try {
    const data = await fetchTimeout(`${CONFIG.API_URL}/predict/${state.beach}`, 70000);
    clearTimeout(coldTimer); hideColdStart();
    if (!data.success) throw new Error(data.message||'Prediction failed');
    if (!data.data.weather.available) { showUnavailable(data.data.weather.timeUntilAvailable); return; }
    state.weather = data.data.weather;
    state.photography = data.data.photography;
    renderForecast();
  } catch(err) {
    clearTimeout(coldTimer); hideColdStart();
    showToast(err.message||'Unable to fetch — please try again');
    console.error(err);
  } finally {
    state.loading = false; setLoadingState(false);
  }
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
    hide('fmasterIdle'); hide('fmasterResult'); show('fmasterLoading');
    const msgs = ['Reading the atmosphere…','Analysing cloud patterns…','Calculating visibility…','Generating photography guide…'];
    let i=0;
    state._loadInterval = setInterval(()=>{
      i=(i+1)%msgs.length;
      const el=document.getElementById('fmlLabel');
      if(el) el.textContent=msgs[i];
    },2800);
  } else {
    clearInterval(state._loadInterval); hide('fmasterLoading');
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
    {lbl:'Cloud',    val:`${f.cloudCover}%`,    sub:labels.cloudLabel    ||(f.cloudCover>=30&&f.cloudCover<=60?'Optimal':f.cloudCover<30?'Clear':'Heavy')},
    {lbl:'Humidity', val:`${f.humidity}%`,       sub:labels.humidityLabel ||(f.humidity<=55?'Low':'High')},
    {lbl:'Visibility',val:`${f.visibility}km`,   sub:labels.visibilityLabel||(f.visibility>=10?'Excellent':'Good')},
    {lbl:'Wind',     val:`${f.windSpeed}km/h`,   sub:labels.windLabel     ||(f.windSpeed<=15?'Calm':'Breezy')}
  ].map(c=>`<div class="cond-item"><div class="cond-label">${c.lbl}</div><div class="cond-val">${c.val}</div><div class="cond-sub">${c.sub}</div></div>`).join('');

  document.getElementById('fmriInsight').textContent = p?.insight||`${pred.verdict} conditions forecast for ${w.beach} at dawn.`;

  renderAnalysisPanel(f, pred, p, w.beach);
  setTimeout(()=>document.getElementById('forecastMaster').scrollIntoView({behavior:'smooth',block:'nearest'}),150);
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
// COLD START
// ─────────────────────────────────────────────
function showColdStart() {
  show('coldOverlay'); let p=0;
  state._coldInterval=setInterval(()=>{
    p=Math.min(p+1.6,92);
    const bar=document.getElementById('coldBar'),timer=document.getElementById('coldTimer');
    if(bar)bar.style.width=p+'%';
    if(timer)timer.textContent=`~${Math.ceil((92-p)/1.6)}s remaining`;
  },1500);
}
function hideColdStart() {
  clearInterval(state._coldInterval);
  const bar=document.getElementById('coldBar');
  if(bar)bar.style.width='100%';
  setTimeout(()=>hide('coldOverlay'),500);
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
// HELPERS
// ─────────────────────────────────────────────
function show(id){ document.getElementById(id)?.classList.remove('hidden'); }
function hide(id){ document.getElementById(id)?.classList.add('hidden'); }
function showToast(msg,ms=3500){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),ms);
}