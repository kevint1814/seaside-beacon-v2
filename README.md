# Seaside Beacon

**India's first AI-powered sunrise quality forecast for Chennai beaches.**

Seaside Beacon analyzes 9 atmospheric factors across 5 beaches (4 Chennai + Mahabalipuram) to predict how colorful tomorrow's sunrise will be. It combines AccuWeather forecasts, Open-Meteo satellite data, and a 3-tier AI system (Gemini Flash, Groq Llama, Flash-Lite) to deliver a single 0 to 100 score with photography-specific insights, delivered to your inbox at 4 AM every morning. New beaches auto-calibrate their forecasts using MOS (Model Output Statistics) bias correction.

**Live:** [seasidebeacon.com](https://seasidebeacon.com)
**Status:** Production v7.3 (launched February 14, 2026)
**Monthly cost:** ~INR 275 (~$3.30)

---

## The Story

I moved to Chennai from Rajapalayam (a small town in Tamil Nadu) for my studies. Standing at Marina Beach one morning, watching a sky that went from flat grey to full copper in twenty minutes, I realized there was no way to know beforehand whether a sunrise would be worth the early alarm. Some mornings the sky ignites, some mornings it doesn't. Weather apps tell you temperature and rain probability, nobody tells you if the sunrise will be breathtaking.

That question became Seaside Beacon. Over a year of research into atmospheric optics, cloud physics, and color scattering, months of frontend/backend iteration, and hundreds of mornings comparing predictions to actual sunrise photos. Today it covers 5 beaches across Chennai and Mahabalipuram, predicting sunrise quality using the same atmospheric factors that peer-reviewed meteorological research identifies as color determinants.

---

## How It Works

Every evening at 6 PM IST, the forecast unlocks for tomorrow's sunrise. Every morning at 4 AM IST, Seaside Beacon:

1. Fetches hourly weather data from **AccuWeather** (cloud cover, humidity, visibility, wind, precipitation)
2. Fetches multi-level cloud layers, pressure trends, and aerosol data from **Open-Meteo** (GFS + Air Quality APIs)
3. Applies **MOS bias corrections** for auto-calibrating beaches (Mahabalipuram and future expansions) using rolling 30-day predicted-vs-observed deltas
4. Runs a **9-factor scoring algorithm** (v5.6) that weights each atmospheric condition based on peer-reviewed sunrise color research
5. Generates **AI-powered insights** via 3-tier failover (Gemini 2.5 Flash, Groq Llama 3.3 70B, Gemini Flash-Lite, rule-based) with natural language descriptions, DSLR settings, and mobile tips
6. Sends personalized **email forecasts** to subscribers via Brevo (with SendGrid failover)
7. Sends **Telegram alerts** to premium subscribers with the AI chatbot
8. Stores scores in **MongoDB** for historical tracking and accuracy analysis
9. At 7:30 AM, runs **forecast verification** — fetches ERA5 observed weather from Open-Meteo Archive API and computes prediction deltas for MOS calibration

---

## The Scoring Algorithm (v5.6)

The scoring engine assigns up to **100 points** across 9 base factors plus synergy adjustments. The weight distribution is aligned with [SunsetWx](https://sunsetwx.com) research (Penn State meteorologists) and NOAA atmospheric optics literature.

### Base Factors (96 points)

| Factor | Max | Source | Why It Matters |
|--------|-----|--------|----------------|
| Aerosol Optical Depth | 16 | Open-Meteo AQ | The #1 sunrise color predictor. Mie scattering proxy. Low AOD = crystal clear, high = milky haze |
| Cloud Cover | 14 | AccuWeather | 30 to 60% is optimal. Clouds act as the color canvas |
| Multi-Level Cloud | 14 | Open-Meteo GFS | High cirrus catches light first; low clouds block the horizon |
| Humidity | 14 | AccuWeather | Dry air produces vivid, saturated colors |
| Pressure Trend | 12 | Open-Meteo GFS | Falling pressure (clearing fronts) creates the most dramatic skies |
| Visibility | 12 | AccuWeather | Ground-level atmospheric clarity confirmation |
| Weather Conditions | 8 | AccuWeather | Rain/storm go or no-go gate |
| Wind Speed | 6 | AccuWeather | Calm air = stable clouds, easier photography |

### Adjustments

| Adjustment | Range | Trigger |
|------------|-------|---------|
| Synergy | +/- 4 pts | Bonus when humidity + cloud + visibility align; penalty when they conflict |
| Post-Rain Bonus | +8 pts | Detected aerosol washout after overnight rain |
| Solar Angle | +/- 2 pts | Seasonal Rayleigh scattering at 13 degrees N latitude |

### Verdict Scale

| Score | Verdict | Recommendation |
|-------|---------|----------------|
| 85 to 100 | EXCELLENT | GO. Set that alarm |
| 70 to 84 | VERY GOOD | GO. Worth the early wake-up |
| 55 to 69 | GOOD | MAYBE. Pleasant but not dramatic |
| 40 to 54 | FAIR | MAYBE. Mostly flat sky |
| 25 to 39 | POOR | SKIP. Washed out and grey |
| 0 to 24 | UNFAVORABLE | NO. Save your sleep |

### Graceful Degradation

When Open-Meteo is unavailable, the three satellite-dependent factors default to neutral scores (Multi-Level Cloud 8/15, Pressure Trend 5/10, AOD 4/8) so predictions never break due to a single API outage.

### MOS Auto-Calibration (v5.6)

New beaches (Mahabalipuram and future expansions) self-calibrate using Model Output Statistics (MOS). Chennai's hand-tuned scoring is untouched. Each day at 7:30 AM IST, the system fetches ERA5 reanalysis data (what actually happened) and compares it to what was predicted. After 14+ days of data, rolling corrections are computed and applied automatically before scoring runs.

7 safeguards protect correction quality: minimum data threshold (14 days), per-variable correction caps, confidence ramp-in (50% at 14 days, 75% at 21, 100% at 28), IQR-based outlier exclusion, exponential recency weighting (0.93^daysAgo decay), regime shift detection (3-day vs 14-day divergence throttles corrections to 25%), and staleness checks (corrections disabled if observed data is >3 days old).

---

## Features

### Free Tier
- **Sunrise scoring** for all 5 beaches with sub-second API response
- **9-factor breakdown** showing points earned per factor
- **Atmospheric analysis** with natural language explanations for each condition
- **Beach comparison** across all 5 beaches with suitability ratings
- **Daily 4 AM email** with score, verdict, and conditions
- **Sample forecast preview** showing yesterday's full forecast during the time-locked window (7 AM to 6 PM) so users can see what they're subscribing for
- **Community photo gallery** with sunrise submissions from real users

### Premium (INR 49/mo or INR 399/yr via Razorpay)
- **Anytime forecast access** (bypass the 6 PM time lock)
- **7-day sunrise calendar** with scored forecasts for the week ahead
- **AI photography insights** with detailed sunrise experience narrative
- **DSLR camera settings** (ISO, shutter, aperture, white balance) adapted to conditions
- **Mobile camera settings** (night mode, HDR, exposure) with composition tips
- **Evening preview email** at customizable time (6 PM to 10 PM)
- **Special alerts** when score hits 70+ (7 PM notification)
- **Telegram AI chatbot** that answers sunrise and photography questions in real-time
- **Push notifications** via Firebase Cloud Messaging

### Frontend
- OLED-optimized dark theme (#0F0F0F) with bronze accents (#C4733A)
- Procedural sunrise canvas animation (scroll-responsive, section-tuned)
- Liquid glass design system with backdrop-filter effects
- 5-tab atmospheric analysis (Conditions, Photographers, DSLR, Mobile, Beach Comparison)
- Sunrise experience panel with AI-generated narrative
- Community photo submissions via Cloudinary
- Native share API (mobile) with clipboard fallback
- Smart time logic: context-aware labels throughout the day
- 95+ Lighthouse score, mobile-first responsive design, ~65 KB HTML

### Email System
- **4 AM morning forecast** for all subscribers (free and premium)
- **Evening preview** for premium users (customizable 6 PM to 10 PM window, runs every 30 min)
- **Special 70+ alert** at 7 PM for premium users
- **Admin digest** at 8 AM with daily analytics
- Brevo primary (300/day free) with SendGrid automatic failover (100/day free)
- One-click unsubscribe (RFC 8058 / GDPR compliant)
- HTML template with score visualization, conditions grid, camera settings

### Telegram Bot
- AI-powered chatbot for premium users
- Conversation memory with 2-hour TTL
- Daily morning alerts with sunrise scores
- Integrated with the same AI providers as the main platform

### Data Pipeline
- Parallel weather fetching with graceful degradation for resilience
- 2-hour in-memory caching for Open-Meteo data (aligned to GFS model runs)
- 10-minute prediction cache per beach (eliminates duplicate API + AI calls)
- Cache warmup schedule aligned to GFS model run availability (03:40, 03:55, 04:20, 09:30, 15:30, 21:30 IST)
- Historical score archival in MongoDB (DailyScore collection)
- Sample forecast storage for time-locked user previews
- MOS forecast verification pipeline (7:30 AM primary + 8:30 AM retry)
- 2-hour correction cache per beach (aligned with Open-Meteo forecast TTL)
- Visit tracking middleware (non-blocking)
- Metrics collector with live public API

---

## Architecture

```
                     +------------------------------+
                     |          Frontend             |
                     |  Vanilla JS + CSS (Vercel)    |
                     +-------------+----------------+
                                   |
                     +-------------v----------------+
                     |           Backend             |
                     |  Node.js + Express (Render)   |
                     +--+-------+-------+-------+---+
                        |       |       |       |
               +--------v-+ +--v-----+ +v------+ +v----------+
               |AccuWeather| |Open-   | |Gemini/| |Brevo /    |
               | (weather) | |Meteo   | |Groq   | |SendGrid   |
               |           | |(GFS+AQ)| |(AI)   | |(email)    |
               +-----------+ +--------+ +-------+ +-----------+
                                   |
                     +-------------v----------------+
                     |       MongoDB Atlas           |
                     | (scores, users, stats, subs)  |
                     +------------------------------+
                                   |
              +--------------------+--------------------+
              |                    |                     |
     +--------v-------+  +--------v-------+  +----------v-----+
     | Razorpay       |  | Telegram Bot   |  | Firebase FCM    |
     | (payments)     |  | (AI chatbot)   |  | (push notifs)   |
     +----------------+  +----------------+  +------------------+
```

### Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 | Vercel CDN, zero frameworks, ~11K lines |
| Backend | Node.js 18+, Express 4.x | Render free plan |
| Database | MongoDB Atlas M0 | Free tier, 512 MB, 11 collections |
| Weather | AccuWeather + Open-Meteo | GFS cloud layers, pressure, AOD |
| AI | Gemini 2.5 Flash, Groq Llama 3.3 70B, Gemini Flash-Lite | 3-tier failover + rule-based |
| Email | Brevo (primary) + SendGrid (failover) | 400 emails/day combined |
| Payments | Razorpay | INR 49/mo or INR 399/yr |
| Bot | Telegram Bot API | AI chatbot for premium users |
| Push | Firebase Cloud Messaging | Morning and special alerts |
| Images | Cloudinary | Community photo uploads |
| DNS/CDN | Cloudflare | seasidebeacon.com |
| Monitoring | UptimeRobot | 5-min health checks |

---

## Beaches

| Beach | Location | Photography Context | Calibration |
|-------|----------|-------------------|-------------|
| Marina Beach | 13.05 N, 80.28 E | Lighthouse, fishing boats, urban skyline. World's longest urban beach | Hand-tuned |
| Elliot's Beach | 13.01 N, 80.27 E | Karl Schmidt Memorial, Ashtalakshmi Temple, clean sand | Hand-tuned |
| Covelong Beach | 12.79 N, 80.25 E | ECR 40km south, rock formations, tidal pools, surf beach | Hand-tuned |
| Thiruvanmiyur Beach | 12.98 N, 80.26 E | Natural breakwater rocks, tidal pools, calm waters | Hand-tuned |
| Mahabalipuram Beach | 12.62 N, 80.19 E | UNESCO Shore Temple, Five Rathas, rock-cut architecture | MOS auto-calibrated |

---

## Project Structure

```
seaside-beacon/
+-- backend/
|   +-- server.js                 # Express entry point, routes, middleware, cron init
|   +-- package.json
|   +-- .env                      # API keys (not committed)
|   +-- routes/
|   |   +-- predict.js            # /api/predict/:beach, /api/predict/sample/:beach, /api/stats
|   |   +-- subscribe.js          # /api/subscribe, /api/unsubscribe
|   |   +-- community.js          # /api/sunrise-submission, /api/feedback
|   |   +-- auth.js               # Premium authentication, Razorpay webhook
|   |   +-- payment.js            # Razorpay order creation, verification
|   |   +-- telegram.js           # Telegram bot webhook, chatbot
|   |   +-- device.js             # FCM device token registration
|   |   +-- admin.js              # Admin dashboard, analytics API
|   +-- services/
|   |   +-- weatherService.js     # v5.6 scoring algorithm (2,300 lines)
|   |   +-- aiService.js          # Multi-provider AI (Gemini/Groq) + rule-based fallback
|   |   +-- emailService.js       # Brevo + SendGrid email delivery
|   |   +-- chatbotService.js     # Telegram AI chatbot with conversation memory
|   |   +-- telegramService.js    # Telegram alerts and message delivery
|   |   +-- firebaseAdmin.js      # FCM push notification service
|   |   +-- forecastCalibration.js # MOS correction computation engine (7 safeguards)
|   |   +-- metricsCollector.js   # Live metrics, cache hit rates, response times
|   |   +-- notifyAdmin.js        # Admin digest email with analytics
|   |   +-- pushNotifications.js  # Push notification orchestration
|   |   +-- visitTracker.js       # Visit analytics middleware
|   +-- models/
|   |   +-- PremiumUser.js        # Premium subscriptions, auth tokens, Razorpay
|   |   +-- Subscriber.js         # Free email subscriptions
|   |   +-- DailyScore.js         # Historical forecast archive
|   |   +-- SampleForecast.js     # Yesterday's full forecast for preview
|   |   +-- DailyVisit.js         # Daily analytics
|   |   +-- SiteStats.js          # Global counters (singleton)
|   |   +-- DeviceToken.js        # FCM push notification tokens
|   |   +-- Feedback.js           # User ratings with email
|   |   +-- SunriseSubmission.js  # Community photos with email
|   |   +-- SupportTicket.js      # User support tickets
|   |   +-- ForecastVerification.js # MOS predicted-vs-observed weather data
|   +-- jobs/
|   |   +-- dailyEmail.js         # 4 AM forecast, evening preview, 70+ alerts
|   |   +-- forecastVerification.js # 7:30 AM MOS verification cron + 8:30 AM retry
|   +-- admin/
|   |   +-- dashboard.html        # Admin analytics dashboard
|   +-- test-scoring.js           # 240 test assertions
|   +-- test-email.js             # Email delivery tests
+-- frontend/
|   +-- index.html                # Single-page app (1,935 lines, SEO optimized)
|   +-- script.js                 # UI logic (4,792 lines, vanilla JS)
|   +-- styles.css                # Styling (4,314 lines)
|   +-- favicon.svg               # Sun icon favicon
|   +-- og-image.jpg              # Social media preview
|   +-- robots.txt
|   +-- sitemap.xml
|   +-- privacy.html              # Privacy policy
|   +-- terms.html                # Terms of service
|   +-- vercel.json               # Vercel deployment config
|   +-- logo/                     # Brand assets (SVG + PNG)
|   +-- screenshots/              # Marketing screenshots
+-- cloudflare-worker/            # CF Worker for Open-Meteo proxy (rate limit bypass)
+-- Dockerfile
+-- README.md
```

---

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/beaches` | All supported beaches with coordinates |
| GET | `/api/predict/:beach` | Full prediction (score, breakdown, AI insights, comparison) |
| GET | `/api/predict/sample/:beach` | Yesterday's forecast for preview during time-locked hours |
| GET | `/api/stats` | Public site metrics |
| POST | `/api/subscribe` | Subscribe to daily emails |
| POST | `/api/unsubscribe` | Unsubscribe from emails |
| GET | `/api/unsubscribe?email=...` | One-click email unsubscribe |
| POST | `/api/sunrise-submission` | Upload community sunrise photo (multipart, 10 MB) |
| POST | `/api/feedback` | Submit prediction accuracy feedback |
| GET | `/health` | Health check |

### Premium (requires auth token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forecast/7day/:beach` | 7-day scored forecast calendar |
| POST | `/api/auth/login` | Premium user login (email + OTP) |
| POST | `/api/payment/create-order` | Create Razorpay order |
| POST | `/api/payment/verify` | Verify Razorpay payment |
| POST | `/api/telegram/webhook` | Telegram bot message handler |
| POST | `/api/device/register` | Register FCM device token |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin` | Analytics dashboard |
| GET | `/admin/api/stats` | Detailed admin metrics |

---

## Technical Challenges Solved

**Timezone handling:** `toLocaleString()` produces corrupted dates on Render servers. Solved with manual UTC+5:30 offset calculation for all IST time logic.

**SMTP port blocking:** Render blocks outbound SMTP ports 25/465/587. Solved by using Brevo and SendGrid HTTP APIs instead of SMTP transport.

**Cold start reliability:** Render free tier sleeps after inactivity. UptimeRobot 5-minute pings + scheduled 3:30 AM wake-up ensure the server is warm before the 4 AM email job.

**Multi-source weather resilience:** AccuWeather and Open-Meteo can fail independently. Graceful degradation defaults ensure scoring never breaks, even with partial data.

**AI reliability:** Individual providers (Gemini, Groq) can hit rate limits or return malformed JSON. 3-tier failover chain with deterministic rule-based final fallback guarantees 100% insight availability. Combined capacity: ~1,300 calls/day vs ~288 daily demand.

**Open-Meteo rate limiting:** Free API with aggressive rate limits. Solved with a Cloudflare Worker proxy that adds caching headers and retries, plus GFS model-run-aligned cache warmup schedule.

**Razorpay KYC for solo dev:** Required visible pricing, refund policy, contact info, and PAN verification. Built dedicated pricing, terms, and privacy pages before applying. Activation completed in 2 to 3 days.

**Scaling to new beaches without manual tuning:** Chennai's scoring was hand-tuned over hundreds of mornings, but that doesn't scale. Solved with an MOS (Model Output Statistics) auto-calibration system that collects predicted-vs-observed weather deltas daily, computes rolling bias corrections, and applies them automatically after 14+ days of data. Seven safeguards (correction caps, confidence ramp-in, outlier exclusion, recency weighting, regime detection, staleness checks) prevent overcorrection during unusual weather patterns.

---

## Costs

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| AccuWeather API | Paid | ~INR 168 |
| Cloudflare domain | Paid | ~INR 108 (INR 1,300/yr) |
| Render | Free | INR 0 |
| Vercel | Free | INR 0 |
| MongoDB Atlas | Free (M0) | INR 0 |
| Open-Meteo | Free | INR 0 |
| Gemini AI | Free | INR 0 |
| Groq AI | Free | INR 0 |
| Brevo | Free (300/day) | INR 0 |
| SendGrid | Free (100/day) | INR 0 |
| Cloudinary | Free | INR 0 |
| UptimeRobot | Free | INR 0 |
| Razorpay | Free (per-txn fee) | INR 0 |
| Firebase FCM | Free | INR 0 |
| Telegram Bot API | Free | INR 0 |
| **Total** | | **~INR 275/mo** |

---

## Performance

| Metric | Value |
|--------|-------|
| Lighthouse | 95+ across all categories |
| API response | 200 to 400ms (800ms to 1.2s with AI generation) |
| Prediction cache | 10-min TTL per beach, ~80% hit rate |
| Cold start | 30 to 50s (mitigated by scheduled wake-ups) |
| Email delivery | Under 5s per batch |
| Test coverage | 240 assertions (100%) |
| Uptime | 99.9% (monitored) |

---

## Competitive Landscape

Seaside Beacon is the only sunrise prediction platform built specifically for the Indian market.

| Platform | Based In | Scoring | AOD | India Focus |
|----------|----------|---------|-----|-------------|
| [SunsetWx](https://sunsetwx.com) | USA (Penn State) | ~20 factors (undisclosed) | No | GFS 13km fallback |
| [Alpenglow](https://alpenglow.app) | USA | Uses SunsetWx data | No | No |
| [SkyCandy](https://skycandy.app) | USA/AU/UK | 5+ factors | No | No |
| [ClearOutside](https://clearoutside.com) | UK | Astronomy, not sunrise | No | Basic |
| **Seaside Beacon** | **India (Chennai)** | **9 base + synergy** | **Yes (16 pts)** | **Native** |

Key differentiators: AOD as the top-weighted factor (no competitor uses satellite aerosol data), MOS auto-calibration for scaling to new beaches without manual tuning, beach-specific composition tips referencing actual landmarks, AI-generated camera settings adapted to real-time conditions, and a premium tier with Telegram chatbot and 7-day calendar.

---

## Roadmap

| Phase | Timeline | Focus |
|-------|----------|-------|
| Phase 0 (Current) | Now | 5 beaches (4 Chennai + Mahabalipuram), prove accuracy, build community, MOS auto-calibration |
| Phase 1 | Q2 2026 | Marketing push: Instagram, Reddit, SEO, accuracy tracking |
| Phase 2 | Q3 2026 | Expand to Pondicherry, Visakhapatnam, Puri (MOS auto-calibrates new beaches) |
| Phase 3 | Q4 2026 | Multi-city frontend, React Native mobile app |
| Phase 4 | 2027+ | All major Indian coastal cities, Southeast Asia, API licensing |

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (free M0 cluster)
- API keys: AccuWeather, Gemini (Google AI), Groq, Brevo, Cloudinary, Razorpay

### Setup

```bash
# Clone
git clone https://github.com/kevint1814/Seaside-Beacon.git
cd Seaside-Beacon

# Backend
cd backend
npm install
cp .env.example .env   # Fill in your API keys
npm start              # Starts on port 3000

# Frontend
cd ../frontend
# No build step. Open index.html locally or deploy to Vercel
```

### Environment Variables

Create `backend/.env` with:

```env
# Weather
ACCUWEATHER_API_KEY=your_key

# AI (3-tier failover)
GEMINI_API_KEY=your_google_ai_key
GROQ_API_KEY=your_groq_key

# Email
BREVO_API_KEY=your_key
SENDGRID_API_KEY=your_key

# Database
MONGODB_URI=mongodb+srv://...

# Payments
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret

# Telegram
TELEGRAM_BOT_TOKEN=your_token

# Firebase
FIREBASE_PROJECT_ID=your_project
FIREBASE_CLIENT_EMAIL=your_email
FIREBASE_PRIVATE_KEY=your_key

# Images
CLOUDINARY_CLOUD_NAME=your_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret

# Payments (webhook)
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Server
PORT=3000
NODE_ENV=development
TZ=Asia/Kolkata
FRONTEND_URL=http://localhost:5500
ADMIN_EMAIL=your@email.com
ADMIN_USER=admin
ADMIN_PASS=your_admin_password
```

### Running Tests

```bash
cd backend
node test-scoring.js   # 240 assertions, should show all passed
```

---

## Deployment

| Component | Platform | Trigger |
|-----------|----------|---------|
| Backend | Render (free plan) | Push to main branch |
| Frontend | Vercel (free) | Push to main branch |
| Database | MongoDB Atlas M0 | Always running |
| CF Worker | Cloudflare Workers | Manual deploy |
| Monitoring | UptimeRobot | 5-min health checks at /health |

---

## About

Built by **Kevin T** from Rajapalayam, Tamil Nadu. CS undergrad, sunrise chaser, and the person who thought "what if weather data could tell you whether tomorrow's sky will be copper or grey."

- Website: [seasidebeacon.com](https://seasidebeacon.com)
- Portfolio: [kevintportfolio.in](https://kevintportfolio.in)
- GitHub: [github.com/kevint1814](https://github.com/kevint1814)
- LinkedIn: [linkedin.com/in/kevint1813](https://linkedin.com/in/kevint1813)
- Email: kevin.t1302@gmail.com

---

## License

This project is proprietary. The source code is not open source. This README is shared publicly for educational and portfolio purposes.

---

## Acknowledgments

- [AccuWeather](https://developer.accuweather.com) for hourly weather forecasts
- [Open-Meteo](https://open-meteo.com) for GFS cloud layers, pressure, and AOD data
- [Google Gemini](https://ai.google.dev) for Gemini 2.5 Flash and Flash-Lite inference
- [Groq](https://groq.com) for Llama 3.3 70B inference
- [Brevo](https://brevo.com) and [SendGrid](https://sendgrid.com) for email delivery
- [Razorpay](https://razorpay.com) for payment processing
- [MongoDB Atlas](https://mongodb.com/atlas) for database hosting
- [Render](https://render.com) for backend hosting
- [Vercel](https://vercel.com) for frontend CDN
- [Cloudinary](https://cloudinary.com) for image hosting
- [Cloudflare](https://cloudflare.com) for DNS and Workers
- [UptimeRobot](https://uptimerobot.com) for uptime monitoring

---

*Built for Chennai beach lovers who want to know if tomorrow's sunrise is worth the alarm.*
