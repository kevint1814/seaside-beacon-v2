// ==========================================
// Seaside Beacon — Telegram AI Chatbot
// Gemini-powered sunrise & photography assistant
// ==========================================

const { GoogleGenerativeAI } = require('@google/generative-ai');
const weatherService = require('./weatherService');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash';

const genAI = GEMINI_KEY ? new GoogleGenerativeAI(GEMINI_KEY) : null;

// ─── Per-user conversation memory (in-memory, resets on restart) ───
const chatHistory = new Map();    // chatId → [{ role, parts }]
const HISTORY_LIMIT = 20;         // keep last 20 messages per user
const HISTORY_TTL = 2 * 60 * 60 * 1000; // clear after 2hr inactivity
const lastActivity = new Map();

// ─── System prompt: the soul of the chatbot ───
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
- Use occasional emojis naturally (☀️ 🌅 📸) but don't overdo it
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

// Format weather context into readable text for the AI
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

// ─── Main chat function ───
async function chat(chatId, userMessage, userName) {
  if (!genAI) {
    return 'The AI assistant is not configured yet. Please try again later.';
  }

  try {
    const chatIdStr = String(chatId);

    // Manage conversation history
    if (!chatHistory.has(chatIdStr)) {
      chatHistory.set(chatIdStr, []);
    }
    lastActivity.set(chatIdStr, Date.now());

    const history = chatHistory.get(chatIdStr);

    // Fetch live weather for context (cached internally by weatherService)
    let weatherContext = '';
    const needsWeather = /today|tomorrow|forecast|score|beach|sunrise|weather|morning|golden|cloud|humidity|wind|predict|how.*look/i.test(userMessage);
    if (needsWeather) {
      try {
        const liveData = await getLiveWeatherContext();
        weatherContext = '\n\n' + formatWeatherForAI(liveData);
      } catch (err) {
        weatherContext = '\n\nLive weather data temporarily unavailable.';
      }
    }

    // Build the model
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_PROMPT
    });

    // Build conversation with context
    const contextMessage = weatherContext
      ? `[User: ${userName || 'Premium User'}]${weatherContext}\n\nUser question: ${userMessage}`
      : `[User: ${userName || 'Premium User'}]\n\nUser question: ${userMessage}`;

    // Add user message to history
    history.push({ role: 'user', parts: [{ text: contextMessage }] });

    // Trim history if too long
    while (history.length > HISTORY_LIMIT) {
      history.shift();
    }

    // Create chat session with history
    const chatSession = model.startChat({
      history: history.slice(0, -1), // all except the latest message
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.7,
      }
    });

    // Send the latest message
    const result = await chatSession.sendMessage(contextMessage);
    const response = result.response.text();

    // Add assistant response to history (store without weather context for cleaner history)
    history.push({ role: 'model', parts: [{ text: response }] });

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
}, 30 * 60 * 1000); // check every 30 min

module.exports = { chat };
