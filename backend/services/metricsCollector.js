// ==========================================
// Metrics Collector — In-Memory Telemetry
// ==========================================
// Lightweight counters for the admin dashboard.
// All data is volatile (lost on restart) — this
// is by design. Historical data comes from MongoDB.
// ==========================================

const os = require('os');

// ── Counters (reset on restart) ──────────────
const _counters = {
  // API call counts
  accuWeatherHourly:   { calls: 0, cacheHits: 0, errors: 0, lastCall: null, lastError: null },
  accuWeatherDaily:    { calls: 0, cacheHits: 0, errors: 0, lastCall: null, lastError: null },
  openMeteoForecast:   { calls: 0, cacheHits: 0, errors: 0, lastCall: null, lastError: null },
  openMeteoAQ:         { calls: 0, cacheHits: 0, errors: 0, lastCall: null, lastError: null },
  aiProvider:          { calls: 0, cacheHits: 0, errors: 0, fallbacks: 0, lastCall: null, lastError: null, providers: {} },

  // Prediction cache
  predictionCache:     { hits: 0, misses: 0 },

  // Email
  emailsSent:          { success: 0, failed: 0, lastSent: null, lastError: null },

  // Request tracking
  requests:            { total: 0, predict: 0, subscribe: 0, unsubscribe: 0, errors: 0 },

  // Server
  startedAt: Date.now()
};

// ── Recent errors log (circular buffer, last 50) ──
const _recentErrors = [];
const MAX_ERRORS = 50;

// ── Response time tracking (last 100 predict requests) ──
const _responseTimes = [];
const MAX_RESPONSE_TIMES = 100;

// ── Public API ──────────────────────────────

function trackAPICall(service, wasCache = false) {
  const c = _counters[service];
  if (!c) return;
  if (wasCache) {
    c.cacheHits++;
  } else {
    c.calls++;
    c.lastCall = Date.now();
  }
}

function trackAPIError(service, errorMsg) {
  const c = _counters[service];
  if (!c) return;
  c.errors++;
  c.lastError = Date.now();

  _recentErrors.push({
    service,
    message: errorMsg,
    timestamp: Date.now()
  });
  if (_recentErrors.length > MAX_ERRORS) _recentErrors.shift();
}

function trackGroqFallback() {
  _counters.aiProvider.fallbacks++;
}

function trackAIProviderUsage(providerName) {
  if (!_counters.aiProvider.providers[providerName]) {
    _counters.aiProvider.providers[providerName] = 0;
  }
  _counters.aiProvider.providers[providerName]++;
}

function trackPredictionCache(wasHit) {
  if (wasHit) {
    _counters.predictionCache.hits++;
  } else {
    _counters.predictionCache.misses++;
  }
}

function trackEmail(success, errorMsg) {
  if (success) {
    _counters.emailsSent.success++;
    _counters.emailsSent.lastSent = Date.now();
  } else {
    _counters.emailsSent.failed++;
    _counters.emailsSent.lastError = Date.now();
    _recentErrors.push({
      service: 'email',
      message: errorMsg,
      timestamp: Date.now()
    });
    if (_recentErrors.length > MAX_ERRORS) _recentErrors.shift();
  }
}

function trackRequest(type) {
  _counters.requests.total++;
  if (type && _counters.requests[type] !== undefined) {
    _counters.requests[type]++;
  }
}

function trackRequestError() {
  _counters.requests.errors++;
}

function trackResponseTime(ms) {
  _responseTimes.push({ ms, timestamp: Date.now() });
  if (_responseTimes.length > MAX_RESPONSE_TIMES) _responseTimes.shift();
}

/**
 * Get full metrics snapshot for the admin dashboard
 */
function getMetricsSnapshot() {
  const mem = process.memoryUsage();
  const uptimeSec = process.uptime();

  // Calculate average response time
  const avgResponseTime = _responseTimes.length > 0
    ? Math.round(_responseTimes.reduce((sum, r) => sum + r.ms, 0) / _responseTimes.length)
    : 0;

  // Calculate p95 response time
  const p95ResponseTime = _responseTimes.length > 0
    ? (() => {
        const sorted = [..._responseTimes].sort((a, b) => a.ms - b.ms);
        return sorted[Math.floor(sorted.length * 0.95)]?.ms || 0;
      })()
    : 0;

  return {
    server: {
      uptime: uptimeSec,
      uptimeFormatted: formatUptime(uptimeSec),
      startedAt: _counters.startedAt,
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024)
      },
      cpu: os.loadavg()[0],
      nodeVersion: process.version,
      platform: `${os.type()} ${os.release()}`
    },
    apis: {
      accuWeatherHourly: { ..._counters.accuWeatherHourly },
      accuWeatherDaily:  { ..._counters.accuWeatherDaily },
      openMeteoForecast: { ..._counters.openMeteoForecast },
      openMeteoAQ:       { ..._counters.openMeteoAQ },
      aiProvider:        { ..._counters.aiProvider, providers: { ..._counters.aiProvider.providers } }
    },
    cache: {
      prediction: { ..._counters.predictionCache },
      accuWeatherHourlyCacheRate: calcCacheRate(_counters.accuWeatherHourly),
      accuWeatherDailyCacheRate:  calcCacheRate(_counters.accuWeatherDaily),
      openMeteoForecastCacheRate: calcCacheRate(_counters.openMeteoForecast),
      openMeteoAQCacheRate:       calcCacheRate(_counters.openMeteoAQ),
      predictionCacheRate: calcPredCacheRate(_counters.predictionCache)
    },
    emails: { ..._counters.emailsSent },
    requests: { ..._counters.requests },
    performance: {
      avgResponseTime,
      p95ResponseTime,
      recentSamples: _responseTimes.length
    },
    recentErrors: _recentErrors.slice(-20)
  };
}

function calcCacheRate(counter) {
  const total = counter.calls + counter.cacheHits;
  if (total === 0) return '0%';
  return Math.round((counter.cacheHits / total) * 100) + '%';
}

function calcPredCacheRate(counter) {
  const total = counter.hits + counter.misses;
  if (total === 0) return '0%';
  return Math.round((counter.hits / total) * 100) + '%';
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

module.exports = {
  trackAPICall,
  trackAPIError,
  trackGroqFallback,
  trackAIProviderUsage,
  trackPredictionCache,
  trackEmail,
  trackRequest,
  trackRequestError,
  trackResponseTime,
  getMetricsSnapshot
};
