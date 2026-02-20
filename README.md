# Seaside Beacon

**AI-powered sunrise quality prediction for Chennai beaches.**

Seaside Beacon analyzes 9 atmospheric factors across 4 Chennai beaches to predict how colorful tomorrow's sunrise will be. It combines AccuWeather forecasts, Open-Meteo satellite data, and a 3-tier AI system (Gemini Flash → Groq → Flash-Lite) to deliver a single 0–100 score with photography-specific insights — delivered to your inbox at 4 AM every morning.

**Live:** [seasidebeacon.com](https://seasidebeacon.com)
**Status:** Production (soft-launched February 14, 2026)
**Cost:** ~$3.30/month total infrastructure

---

## How It Works

Every morning at 4 AM IST, Seaside Beacon:

1. Fetches hourly weather data from **AccuWeather** (cloud cover, humidity, visibility, wind, precipitation)
2. Fetches multi-level cloud layers, pressure trends, and aerosol data from **Open-Meteo** (GFS + Air Quality APIs)
3. Runs a **9-factor scoring algorithm** (v5) that weights each atmospheric condition based on peer-reviewed sunrise color research
4. Generates **AI-powered insights** via 3-tier failover (Gemini 2.5 Flash → Groq Llama 3.3 70B → Gemini Flash-Lite → rule-based) — natural language descriptions, DSLR settings, mobile tips
5. Sends personalized **email forecasts** to subscribers via Brevo (with SendGrid fallback)
6. Stores scores in **MongoDB** for historical tracking

Users can also check predictions anytime on the website, which features real-time scoring, atmospheric analysis cards, and camera setting recommendations.

---

## The Algorithm (v5)

The v5 scoring engine assigns up to **100 points** across 9 base factors plus synergy adjustments. The weight distribution is aligned with [SunsetWx](https://sunsetwx.com) research (Penn State meteorologists) and NOAA atmospheric optics literature.

### Base Factors (96 points)

| Factor | Max | Source | Why It Matters |
|--------|-----|--------|----------------|
| Cloud Cover | 25 | AccuWeather | 30–60% is optimal — clouds act as the color canvas |
| Humidity | 20 | AccuWeather | Dry air produces vivid, saturated colors |
| Multi-Level Cloud | 15 | Open-Meteo GFS | High cirrus catches light first; low clouds block the horizon |
| Visibility | 10 | AccuWeather | Ground-level atmospheric clarity confirmation |
| Pressure Trend | 10 | Open-Meteo GFS | Falling pressure (clearing fronts) creates the most dramatic skies |
| Aerosol Optical Depth | 8 | Open-Meteo AQ | Mie scattering proxy — low AOD = crystal clear, high = milky haze |
| Weather Conditions | 5 | AccuWeather | Rain/storm go/no-go gate |
| Wind Speed | 3 | AccuWeather | Calm air = stable clouds, easier photography |

### Adjustments

| Adjustment | Range | Trigger |
|------------|-------|---------|
| Synergy | ±4 pts | Bonus when humidity + cloud + visibility align; penalty when they conflict |
| Post-Rain Bonus | +5 pts | Detected aerosol washout after overnight rain |
| Solar Angle | ±2 pts | Seasonal Rayleigh scattering at 13°N latitude |

### Verdict Scale

| Score | Verdict | Recommendation |
|-------|---------|----------------|
| 85–100 | EXCELLENT | GO — set that alarm |
| 70–84 | VERY GOOD | GO — worth the early wake-up |
| 55–69 | GOOD | MAYBE — pleasant but not dramatic |
| 40–54 | FAIR | MAYBE — mostly flat sky |
| 25–39 | POOR | SKIP — washed out and grey |
| 0–24 | UNFAVORABLE | NO — save your sleep |

### Graceful Degradation

When Open-Meteo is unavailable, the three satellite-dependent factors default to neutral scores (Multi-Level Cloud 8/15, Pressure Trend 5/10, AOD 4/8) so predictions never break due to a single API outage.

---

## Architecture

```
                     ┌──────────────────────────────┐
                     │         Frontend              │
                     │   Vanilla JS + CSS (Vercel)   │
                     └──────────────┬───────────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │          Backend              │
                     │   Node.js + Express (Render)  │
                     └──┬────────┬────────┬────────┬┘
                        │        │        │        │
               ┌────────▼──┐ ┌──▼─────┐ ┌▼──────┐ ┌▼──────────┐
               │AccuWeather │ │Open-   │ │Gemini/│ │Brevo /    │
               │  (weather) │ │Meteo   │ │Groq   │ │SendGrid   │
               │            │ │(GFS+AQ)│ │(AI)   │ │(email)    │
               └────────────┘ └────────┘ └───────┘ └───────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │       MongoDB Atlas           │
                     │  (scores, subscribers, stats) │
                     └──────────────────────────────┘
```

### Stack

- **Frontend:** Vanilla JS (ES6+), HTML5, CSS3 — hosted on Vercel CDN
- **Backend:** Node.js 18+, Express 4.x — hosted on Render (free plan)
- **Database:** MongoDB Atlas M0 (free, 512 MB) — 6 collections
- **Weather APIs:** AccuWeather (hourly/daily, $2/mo) + Open-Meteo GFS & AQ (free, no key)
- **AI:** 3-tier failover — Gemini 2.5 Flash (250 RPD) → Groq Llama 3.3 70B (51/day) → Gemini Flash-Lite (1000 RPD) → rule-based
- **Email:** Brevo (primary, 300/day free) + SendGrid (backup, 100/day free)
- **Images:** Cloudinary (community photo uploads, free tier)
- **DNS:** Cloudflare (seasidebeacon.com, ~₹1,300/yr)
- **Monitoring:** UptimeRobot (5-min health checks, free)

---

## Beaches

| Beach | Location | Photography Context |
|-------|----------|-------------------|
| Marina Beach | 13.05°N, 80.28°E | Lighthouse, fishing boats, urban skyline backdrop |
| Elliot's Beach | 13.01°N, 80.27°E | Karl Schmidt Memorial, clean sand, Ashtalakshmi Temple |
| Covelong Beach | 12.79°N, 80.25°E | Rock formations, tidal pools, dramatic cliffs |
| Thiruvanmiyur Beach | 12.98°N, 80.26°E | Natural breakwater rocks, tidal pools, calm waters |

---

## Features

### Sunrise Scoring
- 9-factor v5 algorithm with research-aligned weights
- Real-time scoring for all 4 beaches with sub-second API response
- Score breakdown showing points earned per factor
- Color-coded verdict badges and recommendation text

### AI Insights (Multi-Provider)
- Natural language greeting and photography insight
- Golden hour timing with quality rating
- DSLR settings (ISO, shutter speed, aperture, white balance) adapted to conditions
- Mobile settings (night mode, HDR, exposure) with 6 composition tips per device
- AOD-based post-processing recommendations
- 3-tier failover chain: Gemini Flash → Groq → Flash-Lite → deterministic rule-based system

### Email System
- Daily forecast at 4 AM IST via node-cron
- Personalized per subscriber's preferred beach
- HTML template with score visualization, conditions grid, camera settings
- Brevo primary → SendGrid automatic failover
- One-click unsubscribe (RFC 8058 / GDPR compliant)
- Admin digest at 8 AM IST with analytics

### Frontend
- OLED-optimized dark theme (#0F0F0F) with bronze accents
- Procedural sunrise canvas animation (scroll-responsive)
- 4-tab photography mode (DSLR / Mobile / Golden Hour / Tips)
- Atmospheric analysis cards (cloud structure, air clarity, pressure pattern)
- Community photo submissions via Cloudinary
- Native share API (mobile) with clipboard fallback
- Smart time logic: 12–6 AM shows today, 6 AM–6 PM shows countdown, 6 PM–12 AM shows tomorrow
- 95+ Lighthouse score, mobile-first responsive design

### Data Pipeline
- Parallel weather fetching with `Promise.allSettled()` for resilience
- 2-hour in-memory caching for AccuWeather and Open-Meteo data
- Historical score archival in MongoDB (DailyScore collection with citySlug indexing)
- Visit tracking middleware (non-blocking via `setImmediate()`)
- Site stats singleton with public metrics API

---

## Project Structure

```
seaside-beacon/
├── backend/
│   ├── server.js                 # Express entry point, routes, middleware, cron jobs
│   ├── package.json
│   ├── .env                      # API keys (not committed)
│   ├── routes/
│   │   ├── predict.js            # /api/beaches, /api/predict/:beach, /api/stats
│   │   ├── subscribe.js          # /api/subscribe, /api/unsubscribe
│   │   └── community.js          # /api/sunrise-submission, /api/feedback
│   ├── services/
│   │   ├── weatherService.js     # v5 scoring algorithm (1,383 lines)
│   │   ├── aiService.js          # Multi-provider AI (Gemini/Groq) + rule-based fallback
│   │   ├── emailService.js       # Brevo + SendGrid email delivery
│   │   ├── notifyAdmin.js        # Admin digest email
│   │   └── visitTracker.js       # Analytics middleware
│   ├── models/
│   │   ├── Subscriber.js         # Email subscriptions
│   │   ├── DailyScore.js         # Historical forecast archive
│   │   ├── DailyVisit.js         # Daily analytics
│   │   ├── SiteStats.js          # Global counters (singleton)
│   │   ├── Feedback.js           # User ratings
│   │   └── SunriseSubmission.js  # Community photos
│   ├── jobs/
│   │   └── dailyEmail.js         # 4 AM cron job
│   ├── test-scoring.js           # 327 test assertions
│   └── test-email.js             # Email delivery tests
├── frontend/
│   ├── index.html                # Single-page app (65 KB, SEO optimized)
│   ├── script.js                 # UI logic (2,253 lines, vanilla JS)
│   ├── styles.css                # Styling (2,782 lines)
│   ├── robots.txt
│   ├── sitemap.xml
│   └── vercel.json               # Vercel deployment config
├── Dockerfile
├── DEPLOYMENT.md
└── README.md
```

---

## API Endpoints

### `GET /api/beaches`
Returns all supported beaches with coordinates.

### `GET /api/predict/:beach`
Returns full prediction for a beach. Includes score, verdict, breakdown, weather data, AI insights (greeting, photography tips, camera settings), and comparison with other beaches.

**Parameters:** `beach` — one of `marina`, `elliot`, `covelong`, `thiruvanmiyur`

### `POST /api/subscribe`
Subscribe to daily email forecasts.

**Body:** `{ "email": "user@example.com", "beach": "marina" }`

### `POST /api/unsubscribe`
Unsubscribe from emails.

**Body:** `{ "email": "user@example.com" }`

### `GET /api/unsubscribe?email=...`
One-click email unsubscribe (renders confirmation page).

### `GET /api/stats`
Public site metrics (forecasts generated, days live, emails sent).

### `POST /api/sunrise-submission`
Upload a community sunrise photo (multipart form, 10 MB limit, stored on Cloudinary).

### `POST /api/feedback`
Submit prediction accuracy feedback (`spot-on`, `close`, or `missed`).

### `GET /health`
Health check for monitoring services.

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (free M0 cluster)
- API keys: AccuWeather, Gemini (Google AI), Groq, Brevo (or SendGrid), Cloudinary

### Setup

```bash
# Clone
git clone https://github.com/kevint1814/Seaside-Beacon.git
cd Seaside-Beacon

# Backend
cd backend
npm install
cp .env.example .env   # Fill in your API keys (see below)
npm start              # Starts on port 3000

# Frontend
cd ../frontend
# No build step — open index.html locally or deploy to Vercel
```

### Environment Variables

Create `backend/.env` with:

```env
# Weather
ACCUWEATHER_API_KEY=your_key

# AI (3-tier: Gemini Flash → Groq → Flash-Lite → rule-based)
GEMINI_API_KEY=your_google_ai_key
GROQ_API_KEY=your_groq_key
GEMINI_FLASH_MODEL=gemini-2.5-flash
GEMINI_LITE_MODEL=gemini-2.5-flash-lite

# Email (primary)
BREVO_API_KEY=your_key
EMAIL_PROVIDER=brevo
SENDER_EMAIL=forecast@yourdomain.com

# Email (backup)
SENDGRID_API_KEY=your_key

# Database
MONGODB_URI=mongodb+srv://...

# Images
CLOUDINARY_CLOUD_NAME=your_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret

# Server
PORT=3000
NODE_ENV=development
TZ=Asia/Kolkata
FRONTEND_URL=http://localhost:5500
ADMIN_EMAIL=your@email.com
```

### Running Tests

```bash
cd backend
node test-scoring.js   # 327 assertions, should show 327/327 passed
```

---

## Deployment

| Component | Platform | Trigger |
|-----------|----------|---------|
| Backend | Render (free plan) | Push to `main` branch |
| Frontend | Vercel (free) | Push to `main` branch |
| Database | MongoDB Atlas M0 | Always running |
| Monitoring | UptimeRobot | 5-min health checks at `/health` |

The backend runs a daily cron job at 4:00 AM IST for email delivery. UptimeRobot's health checks prevent Render's free-tier cold starts from delaying the job.

---

## Costs

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| AccuWeather API | Paid | $2/mo (~₹168) |
| Cloudflare domain | Paid | ~₹108/mo (₹1,300/yr) |
| Render | Free | $0 |
| Vercel | Free | $0 |
| MongoDB Atlas | Free (M0) | $0 |
| Open-Meteo | Free | $0 |
| Gemini AI (Flash + Lite) | Free | $0 |
| Groq AI | Free | $0 |
| Brevo | Free (300/day) | $0 |
| SendGrid | Free (100/day) | $0 |
| Cloudinary | Free | $0 |
| UptimeRobot | Free | $0 |
| **Total** | | **~$3.30/mo** |

---

## Competitive Landscape

Seaside Beacon is the only sunrise prediction platform built specifically for the Indian market. Key differentiators:

- **Aerosol Optical Depth (AOD):** No competitor uses satellite aerosol data for sunrise scoring
- **9-factor research-aligned algorithm:** Most competitors use 3–5 undisclosed factors
- **AI-generated natural language insights:** Dynamic daily descriptions, not static templates
- **Per-day camera settings:** DSLR and mobile tips adapt to actual AOD, humidity, and cloud conditions
- **Beach-specific context:** Composition tips reference actual landmarks (Marina lighthouse, Covelong rock formations)

### Competitors

| Platform | Based In | Scoring | AOD | India Focus |
|----------|----------|---------|-----|-------------|
| [SunsetWx](https://sunsetwx.com) | USA (Penn State) | ~20 factors (undisclosed) | No | GFS 13km fallback |
| [Alpenglow](https://alpenglow.app) | USA | Uses SunsetWx data | No | No |
| [SkyCandy](https://skycandy.app) | USA/AU/UK | 5+ factors | No | No |
| [ClearOutside](https://clearoutside.com) | UK | Astronomy, not sunrise | No | Basic |
| **Seaside Beacon** | **India (Chennai)** | **9 base + synergy** | **Yes (8 pts)** | **Native** |

---

## Performance

- **Lighthouse:** 95+ (Performance, Accessibility, Best Practices, SEO)
- **API response:** 200–400ms (800ms–1.2s with AI generation)
- **Cold start:** 30–50s (Render free tier, mitigated by UptimeRobot)
- **Email delivery:** <5s per batch
- **Test coverage:** 327/327 assertions passing (100%)
- **Uptime:** 99.9% (monitored)

---

## Technical Challenges Solved

**Timezone handling:** `toLocaleString()` produces corrupted dates on Render servers. Solved with manual UTC+5:30 offset calculation for all IST time logic.

**SMTP port blocking:** Render blocks outbound SMTP ports 25/465/587. Solved by using Brevo and SendGrid HTTP APIs instead of SMTP transport.

**Cold start reliability:** Render free tier sleeps after inactivity. UptimeRobot 5-minute pings + GitHub Actions 3:30 AM wake-up ensure the server is warm before the 4 AM email job.

**Multi-source weather resilience:** AccuWeather and Open-Meteo can fail independently. `Promise.allSettled()` with graceful degradation defaults ensures scoring never breaks, even with partial data.

**AI reliability:** Individual providers (Gemini, Groq) can hit rate limits or return malformed JSON. 3-tier failover chain (Gemini Flash → Groq → Flash-Lite) with deterministic rule-based final fallback guarantees 100% insight availability. Combined capacity: ~1,300 calls/day vs ~288 daily demand.

---

## Roadmap

- **Phase 0 (Now):** Chennai 4 beaches — prove accuracy, build community
- **Phase 1 (Q2 2026):** Marketing push — Instagram, Reddit, SEO, accuracy tracking
- **Phase 2 (Q3 2026):** Expand to Pondicherry, Visakhapatnam, Puri
- **Phase 3 (Q4 2026):** Premium tier (₹99/mo), push notifications, multi-city frontend
- **Phase 4 (2027):** All major Indian coastal cities, React Native mobile app
- **Phase 5 (2027+):** Southeast Asia, Australia — API licensing, international expansion

---

## About

Built by **Kevin T** — CS undergrad at VIT Chennai (CGPA 8.98), General Secretary of AI Club.

- Portfolio: [kevintportfolio.in](https://kevintportfolio.in)
- GitHub: [github.com/kevint1814](https://github.com/kevint1814)
- LinkedIn: [linkedin.com/in/kevint1813](https://linkedin.com/in/kevint1813)
- Email: kdrive1813@gmail.com

---

## License

MIT

---

## Acknowledgments

- [AccuWeather](https://developer.accuweather.com) — hourly weather forecasts
- [Open-Meteo](https://open-meteo.com) — GFS cloud layers, pressure, and AOD data (free, no key required)
- [Google Gemini](https://ai.google.dev) — Gemini 2.5 Flash & Flash-Lite inference
- [Groq](https://groq.com) — Llama 3.3 70B inference
- [Brevo](https://brevo.com) — transactional email delivery
- [SendGrid](https://sendgrid.com) — email failover
- [MongoDB Atlas](https://mongodb.com/atlas) — database hosting
- [Render](https://render.com) — backend hosting
- [Vercel](https://vercel.com) — frontend CDN
- [Cloudinary](https://cloudinary.com) — image hosting
- [UptimeRobot](https://uptimerobot.com) — uptime monitoring

---

*Built for Chennai beach lovers who want to know if tomorrow's sunrise is worth the alarm.*
