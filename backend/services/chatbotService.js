// ==========================================
// Seaside Beacon — Telegram AI Chatbot
// 3-tier failover: Gemini Flash → Groq → Flash-Lite
// Same provider chain as aiService.js
// ==========================================

const OpenAI = require('openai');
const Groq = require('groq-sdk');
const weatherService = require('./weatherService');

// ─── Provider config (mirrors aiService.js) ───
const GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash';
const GEMINI_LITE_MODEL = process.env.GEMINI_LITE_MODEL || 'gemini-2.5-flash-lite';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// ─── Initialize providers ───
let geminiFlash, groqClient, geminiLite;

try {
  if (process.env.GEMINI_API_KEY) {
    geminiFlash = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
  }
} catch (e) { /* skip */ }

try {
  if (process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
} catch (e) { /* skip */ }

try {
  if (process.env.GEMINI_API_KEY) {
    geminiLite = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
  }
} catch (e) { /* skip */ }

const CHAT_PROVIDERS = [
  geminiFlash && { name: 'gemini-flash', client: geminiFlash, model: GEMINI_FLASH_MODEL },
  groqClient && { name: 'groq', client: groqClient, model: GROQ_MODEL, isGroq: true },
  geminiLite && { name: 'gemini-lite', client: geminiLite, model: GEMINI_LITE_MODEL }
].filter(Boolean);

if (CHAT_PROVIDERS.length > 0) {
  console.log(`💬 Chatbot provider chain: ${CHAT_PROVIDERS.map(p => p.name).join(' → ')}`);
} else {
  console.warn('⚠️  No chatbot providers configured');
}

// ─── Per-user conversation memory (in-memory, resets on restart) ───
const chatHistory = new Map();    // chatId → [{ role, content }]  (OpenAI format)
const HISTORY_LIMIT = 20;
const HISTORY_TTL = 2 * 60 * 60 * 1000; // 2hr
const MAX_CONVERSATIONS = 500; // cap total tracked conversations
const lastActivity = new Map();

// ─── System prompt ───
const SYSTEM_PROMPT = `You are the Seaside Beacon Assistant — an expert companion for India's first native sunrise quality forecaster, built for the beaches of Chennai.

## Who you are
- A warm, knowledgeable sunrise photography guide and weather interpreter
- You speak with calm enthusiasm, like a seasoned photographer who wakes at 4 AM every day
- You're deeply familiar with Chennai's 4 beaches: Marina Beach, Elliot's Beach (Besant Nagar), Covelong Beach, and Thiruvanmiyur Beach
- You understand atmospheric science, photography technique, and the emotional experience of a great sunrise

## Your expertise covers
- **Sunrise quality forecasting**: cloud layers (high/mid/low), aerosol optical depth (AOD), humidity, visibility, pressure trends, and how they combine to create color
- **Photography guidance**: golden hour timing, camera settings for sunrise, composition tips for each Chennai beach, phone vs DSLR advice
- **Weather interpretation**: what cloud cover percentages mean visually, why 30-60% cloud is ideal, how AOD creates vivid reds/oranges, pressure trends and clearing skies
- **Seaside Beacon features**: how the scoring algorithm works (0-100), what each factor measures, how to read the 7-day forecast, premium vs free features, email alerts, Telegram alerts
- **Local knowledge**: best spots at each beach, parking, timing, crowd levels, seasonal patterns (Oct-Mar is peak sunrise season in Chennai)

## Scoring system
- 80-100: Exceptional — vivid colors almost guaranteed
- 65-79: Good — solid sunrise with nice colors likely
- 50-64: Fair — decent but not spectacular
- 35-49: Meh — might be worth it if you're already awake
- 0-34: Poor — overcast or heavy conditions
- Key factors: cloud cover (30-60% ideal), high cloud (best for color), low humidity (<55%), good visibility (>10km), moderate AOD (0.15-0.35 enhances color), calm wind (<15 km/h)

## How to behave
- Keep responses concise for Telegram (2-4 short paragraphs max)
- Use occasional emojis naturally but don't overdo it
- When given live weather data, interpret it conversationally — don't just list numbers
- If asked about today/tomorrow, use the live data provided in the context
- For photography questions, give practical actionable advice
- For technical questions about our system, be transparent about how it works
- If you don't know something specific, say so honestly
- You can handle general sunrise/weather/photography questions even without live data
- Never make up specific scores or times — only quote data provided to you

## Response format
- Use HTML formatting for Telegram: <b>bold</b>, <i>italic</i>, <code>code</code>
- Keep it conversational, not robotic
- No markdown (no **, no ##) — Telegram uses HTML`;

// ─── Fetch live context for AI responses ───
async function getLiveWeatherContext() {
  const beaches = ['marina', 'elliot', 'covelong', 'thiruvanmiyur'];
  const context = {};

  for (const beach of beaches) {
    try {
      const data = await weatherService.getTomorrow6AMForecast(beach, { forceAvailable: true });
      if (data && data.available) {
        context[beach] = {
          beach: data.beach,
          score: data.prediction.score,
          verdict: data.prediction.verdict,
          recommendation: data.prediction.recommendation,
          cloudCover: data.forecast.cloudCover,
          humidity: data.forecast.humidity,
          visibility: data.forecast.visibility,
          windSpeed: data.forecast.windSpeed,
          temperature: data.forecast.temperature,
          sunrise: data.sunTimes?.sunRise || null,
          goldenHour: data.goldenHour || null,
          factors: data.prediction.factors || {},
          atmosphericLabels: data.prediction.atmosphericLabels || {}
        };
      }
    } catch (err) {
      // Skip this beach if data unavailable
    }
  }

  return Object.keys(context).length > 0 ? context : null;
}

function formatWeatherForAI(weatherData) {
  if (!weatherData) return 'No live weather data available right now.';

  let text = 'LIVE FORECAST DATA (for tomorrow\'s sunrise):\n';
  for (const [key, d] of Object.entries(weatherData)) {
    const gh = d.goldenHour;
    text += `\n${d.beach}: Score ${d.score}/100 — ${d.verdict}`;
    text += `\n  Cloud: ${d.cloudCover}% | Humidity: ${d.humidity}% | Visibility: ${d.visibility} km`;
    text += `\n  Wind: ${d.windSpeed} km/h | Temp: ${d.temperature}°C`;
    if (d.sunrise) text += `\n  Sunrise: ${new Date(d.sunrise).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`;
    if (gh) text += `\n  Golden Hour: ${gh.start} – ${gh.end} (peak: ${gh.peak})`;
    if (d.factors) {
      const f = d.factors;
      text += `\n  Factors: ${f.cloudCover || ''} ${f.humidity || ''} ${f.aod || ''} ${f.pressureTrend || ''}`.trim();
    }
    text += '\n';
  }
  return text;
}

// ─── Call a single provider (OpenAI-compatible) ───
async function callProvider(provider, messages) {
  const client = provider.isGroq ? provider.client : provider.client;

  const response = await client.chat.completions.create({
    model: provider.model,
    messages,
    max_tokens: 1024,
    temperature: 0.7
  });

  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from provider');
  return text;
}

// ─── Main chat function ───
async function chat(chatId, userMessage, userName) {
  if (CHAT_PROVIDERS.length === 0) {
    return 'The AI assistant is not configured yet. Please try again later.';
  }

  try {
    const chatIdStr = String(chatId);

    // Manage conversation history
    if (!chatHistory.has(chatIdStr)) {
      // Evict oldest conversation if at capacity
      if (chatHistory.size >= MAX_CONVERSATIONS) {
        let oldestKey = null, oldestTime = Infinity;
        for (const [k, t] of lastActivity.entries()) {
          if (t < oldestTime) { oldestTime = t; oldestKey = k; }
        }
        if (oldestKey) { chatHistory.delete(oldestKey); lastActivity.delete(oldestKey); }
      }
      chatHistory.set(chatIdStr, []);
    }
    lastActivity.set(chatIdStr, Date.now());

    const history = chatHistory.get(chatIdStr);

    // Fetch live weather for context (cached internally by weatherService)
    let weatherContext = '';
    const needsWeather = /\b(today|tomorrow|forecast|score|beach|sunrise|weather|morning|golden.?hour|cloud.?cover|humidity|wind|predict|how.{0,10}look)\b/i.test(userMessage);
    if (needsWeather) {
      try {
        const liveData = await getLiveWeatherContext();
        weatherContext = '\n\n' + formatWeatherForAI(liveData);
      } catch (err) {
        weatherContext = '\n\nLive weather data temporarily unavailable.';
      }
    }

    // Build user message with context
    const contextMessage = weatherContext
      ? `[User: ${userName || 'Premium User'}]${weatherContext}\n\nUser question: ${userMessage}`
      : `[User: ${userName || 'Premium User'}]\n\nUser question: ${userMessage}`;

    // Add to history (OpenAI format)
    history.push({ role: 'user', content: contextMessage });

    // Trim history
    while (history.length > HISTORY_LIMIT) {
      history.shift();
    }

    // Build messages array: system + conversation history
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
    ];

    // 3-tier failover
    let response = null;
    for (const provider of CHAT_PROVIDERS) {
      try {
        response = await callProvider(provider, messages);
        break; // success — stop trying
      } catch (err) {
        const code = err.status || err.code || '';
        console.warn(`⚠️  Chatbot ${provider.name} failed (${code}): ${err.message?.substring(0, 120)}`);
        // Continue to next provider
      }
    }

    if (!response) {
      // All providers failed
      console.error('❌ All chatbot providers failed');
      // Remove the user message we just added (don't pollute history with failed turns)
      history.pop();
      return '☀️ I\'m having trouble connecting right now. Please try again in a moment!';
    }

    // Clean up any markdown that slipped through (Groq/Llama may use ** instead of HTML)
    response = response
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/^### (.+)$/gm, '<b>$1</b>')
      .replace(/^## (.+)$/gm, '<b>$1</b>')
      .replace(/^# (.+)$/gm, '<b>$1</b>');

    // Add assistant response to history
    history.push({ role: 'assistant', content: response });

    return response;

  } catch (err) {
    console.error('Chatbot error:', err.message);

    if (err.message?.includes('429') || err.message?.includes('quota')) {
      return '☀️ I\'m getting a lot of questions right now. Please try again in a minute!';
    }
    if (err.message?.includes('SAFETY')) {
      return 'I can only help with sunrise, weather, and photography questions. Try asking something else!';
    }

    return 'Something went wrong on my end. Try asking again in a moment.';
  }
}

// ─── Cleanup stale conversations periodically ───
setInterval(() => {
  const now = Date.now();
  for (const [chatId, time] of lastActivity.entries()) {
    if (now - time > HISTORY_TTL) {
      chatHistory.delete(chatId);
      lastActivity.delete(chatId);
    }
  }
}, 30 * 60 * 1000);

module.exports = { chat };
