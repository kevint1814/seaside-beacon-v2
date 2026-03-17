# Seaside Beacon

**India's first AI-powered sunrise quality forecast for Chennai beaches.**

Seaside Beacon analyzes 9 atmospheric factors across 5 beaches (4 Chennai + Mahabalipuram) to predict how colorful tomorrow's sunrise will be. It combines weather APIs, satellite data, and a multi-tier AI system to deliver a single 0–100 score with photography-specific insights. New beaches auto-calibrate using MOS (Model Output Statistics) bias correction.

**Live:** [seasidebeacon.com](https://seasidebeacon.com)
**Status:** Production v7.3 | Algorithm v5.6 | Launched February 14, 2026

---

## Quick Start

```bash
# Backend
cd backend
npm install
cp .env.example .env   # fill in API keys
npm start              # runs on port 3000

# Frontend
# Serve frontend/ via any static server, or deploy to Vercel
```

### Environment Variables

The backend requires these env vars (see `.env.example`):

| Variable | Service |
|----------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `ACCUWEATHER_API_KEY` | AccuWeather API |
| `GEMINI_API_KEY` | Google Gemini AI |
| `GROQ_API_KEY` | Groq AI |
| `BREVO_API_KEY` | Brevo email (primary) |
| `SENDGRID_API_KEY` | SendGrid email (failover) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay payments |
| `TELEGRAM_BOT_TOKEN` | Telegram bot |
| `FIREBASE_*` | Firebase Cloud Messaging |
| `CLOUDINARY_*` | Cloudinary image hosting |
| `ADMIN_PASSWORD` | Admin panel access |

---

## Project Structure

```
seaside-beacon/
├── backend/
│   ├── server.js              # Express app entry point (246 lines)
│   ├── models/                # Mongoose schemas (11 collections)
│   │   ├── DailyScore.js      # Stored sunrise scores per day
│   │   ├── DailyVisit.js      # Analytics tracking
│   │   ├── DeviceToken.js     # FCM push notification tokens
│   │   ├── Feedback.js        # User feedback submissions
│   │   ├── ForecastVerification.js  # MOS predicted-vs-observed deltas
│   │   ├── PremiumUser.js     # Premium subscription records
│   │   ├── SampleForecast.js  # Cached sample forecasts for preview
│   │   ├── SiteStats.js       # Aggregate site statistics
│   │   ├── Subscriber.js      # Email subscriber records
│   │   ├── SunriseSubmission.js  # Community photo submissions
│   │   └── SupportTicket.js   # User support tickets
│   ├── routes/
│   │   ├── predict.js         # Core scoring + AI insights endpoint
│   │   ├── subscribe.js       # Email subscription management
│   │   ├── payment.js         # Razorpay webhook + subscription handling
│   │   ├── admin.js           # Admin panel API
│   │   ├── auth.js            # Premium authentication
│   │   ├── community.js       # Photo gallery endpoints
│   │   ├── device.js          # FCM token registration
│   │   └── telegram.js        # Telegram bot webhook
│   ├── services/
│   │   ├── weatherService.js  # 9-factor scoring algorithm (v5.6)
│   │   ├── aiService.js       # 3-tier AI failover chain
│   │   ├── chatbotService.js  # Telegram AI chatbot logic
│   │   ├── emailService.js    # Brevo/SendGrid dual-provider
│   │   ├── forecastCalibration.js  # MOS auto-calibration engine
│   │   ├── firebaseAdmin.js   # FCM push notification service
│   │   ├── metricsCollector.js  # Performance metrics
│   │   ├── notifyAdmin.js     # Admin alert emails
│   │   ├── telegramService.js # Telegram bot API wrapper
│   │   ├── visitTracker.js    # Visit analytics
│   │   └── weatherService.js  # Weather data fetching + scoring
│   ├── jobs/
│   │   ├── dailyEmail.js      # 4 AM email job (per-subscriber try-catch)
│   │   ├── forecastVerification.js  # 7:30 AM ERA5 verification job
│   │   ├── premiumCleanup.js  # Expired subscription cleanup
│   │   └── pushNotifications.js  # FCM push job
│   ├── test-scoring.js        # 240 test assertions for scoring functions
│   └── test-email.js          # Email provider testing
├── frontend/
│   ├── index.html             # Main SPA (1,935 lines)
│   ├── script.js              # Core application logic (4,792 lines)
│   ├── styles.css             # Full stylesheet (4,314 lines)
│   ├── terms.html             # Terms of service
│   ├── privacy.html           # Privacy policy
│   └── lib/                   # Vendor libraries (html2canvas, qrcode)
├── cloudflare-worker/
│   ├── worker.js              # Open-Meteo proxy with caching
│   └── wrangler.toml          # Cloudflare Worker config
├── docs/                      # Internal documentation
│   ├── TASKS.md               # Task tracking
│   ├── audits/                # Code audits
│   ├── comparisons/           # Competitive analysis
│   ├── deployment/            # Deployment guides
│   ├── marketing/             # Marketing plans
│   ├── premium/               # Premium feature specs
│   └── reports/               # Performance reports
├── memory/                    # Claude context memory
│   ├── glossary.md
│   ├── people/
│   ├── projects/
│   └── context/
└── CLAUDE.md                  # Claude AI project instructions
```

### Line Counts

| Area | Lines |
|------|-------|
| Frontend (JS + CSS + HTML) | ~14,900 |
| Backend (all JS, excl. node_modules) | ~13,800 |
| **Total handwritten code** | **~28,700** |

---

## The Scoring Algorithm (v5.6)

The scoring engine assigns up to **100 points** across 9 base factors plus synergy adjustments. Weights are aligned with SunsetWx research (Penn State meteorology) and NOAA atmospheric optics literature.

### Base Factors

| Factor | Max | Why It Matters |
|--------|-----|----------------|
| Aerosol Optical Depth (AOD) | 16 | #1 sunrise color predictor. Mie scattering proxy |
| Cloud Cover | 14 | 30–60% is optimal. Clouds act as the color canvas |
| Multi-Level Cloud Structure | 14 | High cirrus catches light first; low clouds block horizon |
| Humidity | 14 | Dry air produces vivid, saturated colors |
| Pressure Trend | 12 | Falling pressure (clearing fronts) = most dramatic skies |
| Visibility | 12 | Ground-level atmospheric clarity confirmation |
| Weather Conditions | 8 | Rain/storm go or no-go gate |
| Wind Speed | 6 | Calm air = stable clouds, easier photography |

### Adjustments

| Adjustment | Range | Trigger |
|------------|-------|---------|
| Synergy | +/- 4 pts | Bonus when humidity + cloud + visibility align; penalty when they conflict |
| Post-Rain Bonus | +8 pts | Detected aerosol washout after overnight rain |
| Solar Angle | +/- 2 pts | Seasonal Rayleigh scattering at 13 degrees N latitude |

### Verdict Scale

| Score | Verdict | Recommendation |
|-------|---------|----------------|
| 85–100 | EXCELLENT | GO. Set that alarm |
| 70–84 | VERY GOOD | GO. Worth the early wake-up |
| 55–69 | GOOD | MAYBE. Pleasant but not dramatic |
| 40–54 | FAIR | MAYBE. Mostly flat sky |
| 25–39 | POOR | SKIP. Washed out and grey |
| 0–24 | UNFAVORABLE | NO. Save your sleep |

### Graceful Degradation

When any weather source is unavailable, satellite-dependent factors default to neutral scores so predictions never break due to a single API outage.

### MOS Auto-Calibration (v5.6)

New beaches (Mahabalipuram and future expansions) self-calibrate using Model Output Statistics. Chennai's 4 hand-tuned beaches are untouched. Each day at 7:30 AM IST, the system fetches ERA5 reanalysis data (what actually happened) and compares it to what was predicted. After 14+ days of data, rolling corrections are computed and applied automatically before scoring runs.

7 safeguards protect correction quality: minimum data threshold (14 days), per-variable correction caps, confidence ramp-in (50% at 14 days / 75% at 21 / 100% at 28), IQR-based outlier exclusion, exponential recency weighting (0.93^daysAgo decay), regime shift detection (3-day vs 14-day divergence throttles to 25%), and staleness checks (corrections disabled if observed data >3 days old).

---

## MongoDB Collections (11)

| Collection | Purpose |
|------------|---------|
| `dailyscores` | Stored sunrise scores per beach per day |
| `dailyvisits` | Visit analytics and tracking |
| `devicetokens` | Firebase Cloud Messaging tokens |
| `feedbacks` | User feedback submissions |
| `forecastverifications` | MOS predicted-vs-observed weather deltas |
| `premiumusers` | Premium subscription records + Razorpay metadata |
| `sampleforecasts` | Cached yesterday's forecast for preview display |
| `sitestats` | Aggregate counters (visits, forecasts served) |
| `subscribers` | Email subscriber records with preferences |
| `sunrisesubmissions` | Community photo submissions with Cloudinary URLs |
| `supporttickets` | User support tickets |

---

## Scheduled Jobs

| Job | Time (IST) | What It Does |
|-----|-----------|--------------|
| Daily Email | 4:00 AM | Sends personalized sunrise forecasts to all subscribers |
| Cache Warmup | 3:40, 3:55, 4:20, 9:30, 15:30, 21:30 | Pre-fetches weather data aligned to GFS model runs |
| Forecast Verification | 7:30 AM | Fetches ERA5 observed weather, computes MOS deltas |
| Premium Cleanup | Daily | Removes expired subscription records |
| Push Notifications | 4:15 AM | Sends FCM push alerts to registered devices |

---

## Beaches

| Beach | Key | Location | Calibration |
|-------|-----|----------|-------------|
| Marina | `marina` | North Chennai, lighthouse, world's longest urban beach | Hand-tuned |
| Elliot's | `elliot` | Besant Nagar, upscale, quieter | Hand-tuned |
| Covelong | `covelong` | ECR 40km south, surf beach, rock formations | Hand-tuned |
| Thiruvanmiyur | `thiruvanmiyur` | South Chennai, tidal pools | Hand-tuned |
| Mahabalipuram | `mahabalipuram` | 60km south, UNESCO Shore Temple | MOS auto-calibrated |

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

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 on Vercel CDN |
| Backend | Node.js 18+, Express 4.x on Render (free tier) |
| Database | MongoDB Atlas M0 (free, 512 MB) |
| Weather | AccuWeather + Open-Meteo (GFS + Air Quality) |
| AI | Gemini 2.5 Flash → Groq Llama 3.3 70B → Flash-Lite → rule-based (3-tier + fallback) |
| Email | Brevo (300/day free, primary) → SendGrid (100/day free, failover) |
| Payments | Razorpay (INR 49/mo or INR 399/yr) |
| Bot | Telegram Bot API with AI chatbot (premium) |
| Push | Firebase Cloud Messaging |
| Images | Cloudinary |
| Proxy | Cloudflare Worker (Open-Meteo caching proxy) |
| DNS/CDN | Cloudflare |
| Monitoring | UptimeRobot |

### Monthly Cost: ~INR 275

All services on free tiers: Render, Vercel, MongoDB Atlas M0, Cloudflare, Brevo, SendGrid, UptimeRobot, Firebase, Cloudinary. Only paid service is the domain.

---

## Testing

```bash
cd backend
node test-scoring.js
```

240 test assertions covering all scoring functions, edge cases, boundary conditions, and graceful degradation scenarios. Tests import directly from `weatherService.js` — no duplicate implementations.

---

## Features

### Free Tier
- Sunrise scoring for all 5 beaches with sub-second response
- 9-factor breakdown showing points earned per factor
- Atmospheric analysis with natural language explanations
- Beach comparison with suitability ratings
- Daily 4 AM email with score, verdict, and conditions
- Sample forecast preview (yesterday's forecast during locked hours)
- Community photo gallery with sunrise submissions

### Premium (INR 49/mo or INR 399/yr)
- Anytime forecast access (bypass the 6 PM time lock)
- 7-day sunrise calendar with scored forecasts
- AI photography insights with detailed narrative
- DSLR settings (ISO, shutter, aperture, white balance) — rule-based, not AI-generated
- Mobile camera settings with composition tips
- Evening preview email at customizable time
- Special alerts when score hits 70+
- Telegram AI chatbot for sunrise and photography questions
- Push notifications via FCM

### Frontend Design
- OLED-optimized dark theme (#0F0F0F) with bronze accents (#C4733A)
- Procedural sunrise canvas animation (scroll-responsive, section-tuned)
- Liquid glass design system with backdrop-filter effects
- 5-tab atmospheric analysis panel
- 95+ Lighthouse score, mobile-first responsive
- Zero frameworks. Vanilla JS, HTML, CSS. ~11,000 lines of handwritten frontend code

---

## Competitive Landscape

| Platform | Based In | Own Model | AOD Scoring | MOS Calibration | India Focus |
|----------|----------|-----------|-------------|-----------------|-------------|
| SunsetWx | USA | Yes | No | No | Fallback only |
| Alpenglow | USA | Yes (formerly SunsetWx) | Claims yes | No | No |
| SkyCandy | USA/AU/UK | No (SunsetWx API) | No | No | No |
| VIEWFINDR | Germany | Yes (DWD data) | No | No | No |
| Sunsethue | Netherlands | Yes (ray-based) | No | No | No |
| **Seaside Beacon** | **India** | **Yes** | **Yes (top-weighted)** | **Yes** | **Native** |

---

## Roadmap

| Phase | Timeline | Focus |
|-------|----------|-------|
| Phase 0 (Current) | Now | 5 beaches, prove accuracy, build community, MOS auto-calibration |
| Phase 1 | Q2 2026 | Marketing: Instagram, Reddit, SEO, accuracy tracking |
| Phase 2 | Q3 2026 | Expand to Pondicherry, Vizag, Puri (MOS auto-calibrates new beaches) |
| Phase 3 | Q4 2026 | Multi-city frontend, mobile app |
| Phase 4 | 2027+ | All Indian coastal cities, Southeast Asia, API licensing |

---

## About

Built by **Kevin T** from Rajapalayam, Tamil Nadu.

- Website: [seasidebeacon.com](https://seasidebeacon.com)
- Email: kevin.t1302@gmail.com
- Portfolio: [kevintportfolio.in](https://kevintportfolio.in)
- GitHub: [github.com/kevint1814](https://github.com/kevint1814)
- LinkedIn: [linkedin.com/in/kevint1813](https://linkedin.com/in/kevint1813)
