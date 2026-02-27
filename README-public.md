# Seaside Beacon

**India's first AI-powered sunrise quality forecast for Chennai beaches.**

Seaside Beacon analyzes 9 atmospheric factors across 4 Chennai beaches to predict how colorful tomorrow's sunrise will be. It combines weather APIs, satellite data, and a multi-tier AI system to deliver a single 0 to 100 score with photography-specific insights, delivered to your inbox at 4 AM every morning.

**Live:** [seasidebeacon.com](https://seasidebeacon.com)
**Status:** Production v7.3 (launched February 14, 2026)

---

## The Story

I moved to Chennai from Rajapalayam (a small town in Tamil Nadu) for my studies. Standing at Marina Beach one morning, watching a sky that went from flat grey to full copper in twenty minutes, I realized there was no way to know beforehand whether a sunrise would be worth the early alarm. Some mornings the sky ignites, some mornings it doesn't. Weather apps tell you temperature and rain probability, nobody tells you if the sunrise will be breathtaking.

That question became Seaside Beacon. Over a year of research into atmospheric optics, cloud physics, and color scattering, months of frontend/backend iteration, and hundreds of mornings comparing predictions to actual sunrise photos. Today it covers 4 Chennai beaches and predicts sunrise quality using the same atmospheric factors that peer-reviewed meteorological research identifies as color determinants.

---

## How It Works

Every evening at 6 PM IST, the forecast unlocks for tomorrow's sunrise. Every morning at 4 AM IST, Seaside Beacon:

1. Fetches hourly weather data from **AccuWeather** (cloud cover, humidity, visibility, wind, precipitation)
2. Fetches multi-level cloud layers, pressure trends, and aerosol data from **Open-Meteo** (GFS + Air Quality APIs)
3. Runs a **9-factor scoring algorithm** (v5.2) that weights each atmospheric condition based on peer-reviewed sunrise color research
4. Generates **AI-powered insights** via a 3-tier failover chain with natural language descriptions, DSLR settings, and mobile camera tips
5. Sends personalized **email forecasts** to subscribers with a dual-provider failover system
6. Sends **Telegram alerts** to premium subscribers via an AI chatbot
7. Stores scores in **MongoDB** for historical tracking and accuracy analysis

---

## The Scoring Algorithm (v5.2)

The scoring engine assigns up to **100 points** across 9 base factors plus synergy adjustments. The weight distribution is aligned with [SunsetWx](https://sunsetwx.com) research (Penn State meteorologists) and NOAA atmospheric optics literature.

### Base Factors

| Factor | Max | Why It Matters |
|--------|-----|----------------|
| Aerosol Optical Depth (AOD) | 16 | The #1 sunrise color predictor. Mie scattering proxy. Low AOD = crystal clear, high = milky haze |
| Cloud Cover | 14 | 30 to 60% is optimal. Clouds act as the color canvas |
| Multi-Level Cloud Structure | 14 | High cirrus catches light first; low clouds block the horizon |
| Humidity | 14 | Dry air produces vivid, saturated colors |
| Pressure Trend | 12 | Falling pressure (clearing fronts) creates the most dramatic skies |
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
| 85 to 100 | EXCELLENT | GO. Set that alarm |
| 70 to 84 | VERY GOOD | GO. Worth the early wake-up |
| 55 to 69 | GOOD | MAYBE. Pleasant but not dramatic |
| 40 to 54 | FAIR | MAYBE. Mostly flat sky |
| 25 to 39 | POOR | SKIP. Washed out and grey |
| 0 to 24 | UNFAVORABLE | NO. Save your sleep |

### Graceful Degradation

When any weather source is unavailable, satellite-dependent factors default to neutral scores so predictions never break due to a single API outage. The system is designed to degrade gracefully rather than fail entirely.

---

## Features

### Free Tier
- **Sunrise scoring** for all 4 beaches with sub-second response
- **9-factor breakdown** showing points earned per factor
- **Atmospheric analysis** with natural language explanations
- **Beach comparison** across all beaches with suitability ratings
- **Daily 4 AM email** with score, verdict, and conditions
- **Sample forecast preview** showing yesterday's full forecast during locked hours
- **Community photo gallery** with sunrise submissions from real users

### Premium (INR 49/mo or INR 399/yr)
- **Anytime forecast access** (bypass the 6 PM time lock)
- **7-day sunrise calendar** with scored forecasts for the week ahead
- **AI photography insights** with detailed sunrise experience narrative
- **DSLR camera settings** (ISO, shutter, aperture, white balance) adapted to conditions
- **Mobile camera settings** (night mode, HDR, exposure) with composition tips
- **Evening preview email** at customizable time
- **Special alerts** when score hits 70+
- **Telegram AI chatbot** for real-time sunrise and photography questions
- **Push notifications** via Firebase Cloud Messaging

### Frontend Design
- OLED-optimized dark theme (#0F0F0F) with bronze accents (#C4733A)
- Procedural sunrise canvas animation (scroll-responsive, section-tuned)
- Liquid glass design system with backdrop-filter effects
- 5-tab atmospheric analysis panel
- 95+ Lighthouse score, mobile-first responsive design
- Zero frameworks. Vanilla JS, HTML, CSS. ~10,000 lines of handwritten frontend code

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
| Backend | Node.js 18+, Express 4.x on Render |
| Database | MongoDB Atlas (10 collections) |
| Weather | AccuWeather + Open-Meteo (GFS + Air Quality) |
| AI | Gemini 2.5 Flash, Groq Llama 3.3 70B, Gemini Flash-Lite (3-tier failover + rule-based) |
| Email | Brevo (primary) + SendGrid (failover) |
| Payments | Razorpay |
| Bot | Telegram Bot API with AI chatbot |
| Push | Firebase Cloud Messaging |
| Images | Cloudinary |
| DNS/CDN | Cloudflare |
| Monitoring | UptimeRobot |

---

## Beaches

| Beach | Location | Photography Context |
|-------|----------|-------------------|
| Marina Beach | North Chennai | Lighthouse, fishing boats, urban skyline. World's longest urban beach |
| Elliot's Beach | Besant Nagar | Karl Schmidt Memorial, Ashtalakshmi Temple, clean sand |
| Covelong Beach | ECR, 40km south | Rock formations, tidal pools, surf beach |
| Thiruvanmiyur Beach | South Chennai | Natural breakwater rocks, tidal pools, calm waters |

---

## Technical Highlights

**9 atmospheric data sources** combined into a single score using research-aligned weights from Penn State meteorology and NOAA atmospheric optics literature.

**Aerosol Optical Depth (AOD)** as the #1 weighted factor. No other sunrise prediction platform uses satellite aerosol data for scoring. AOD is the strongest predictor of sunrise color intensity.

**3-tier AI failover** guarantees insights even when individual providers hit rate limits. Gemini Flash (primary), Groq Llama (secondary), Gemini Flash-Lite (tertiary), deterministic rule-based system (final fallback). Combined capacity ~1,300 calls/day against ~288 daily demand.

**Cache warmup schedule** aligned to GFS model run availability (03:40, 03:55, 04:20, 09:30, 15:30, 21:30 IST) ensures forecasts use the freshest possible satellite data.

**Dual email provider failover** with Brevo primary and SendGrid backup. If Brevo fails for a given email, the system automatically retries via SendGrid.

**Zero-framework frontend** with 95+ Lighthouse scores. Every animation, every glass effect, every responsive breakpoint is handwritten. No React, no Tailwind, no build step.

**INR 275/month total infrastructure cost** by maximizing free tiers across 12 services.

---

## Technical Challenges Solved

**Timezone handling:** `toLocaleString()` produces corrupted dates on Render servers. Solved with manual UTC+5:30 offset calculation.

**SMTP port blocking:** Render blocks outbound SMTP. Solved by using HTTP-based email APIs.

**Cold start reliability:** Free tier server sleeps after inactivity. Solved with scheduled wake-up pings before the 4 AM email job.

**Open-Meteo rate limiting:** Solved with a Cloudflare Worker proxy that adds caching headers and retries.

**AI response reliability:** Individual providers return malformed JSON unpredictably. Solved with structured parsing, retry logic, and a 3-tier failover chain with deterministic final fallback.

---

## Competitive Landscape

| Platform | Based In | AOD Scoring | India Focus |
|----------|----------|-------------|-------------|
| [SunsetWx](https://sunsetwx.com) | USA | No | Fallback only |
| [Alpenglow](https://alpenglow.app) | USA | No | No |
| [SkyCandy](https://skycandy.app) | USA/AU/UK | No | No |
| **Seaside Beacon** | **India** | **Yes (top-weighted)** | **Native** |

---

## Roadmap

| Phase | Timeline | Focus |
|-------|----------|-------|
| Phase 0 (Current) | Now | 4 Chennai beaches, prove accuracy, build community |
| Phase 1 | Q2 2026 | Marketing: Instagram, Reddit, SEO, accuracy tracking |
| Phase 2 | Q3 2026 | Expand to Pondicherry, Visakhapatnam, Puri |
| Phase 3 | Q4 2026 | Multi-city frontend, mobile app |
| Phase 4 | 2027+ | All Indian coastal cities, Southeast Asia, API licensing |

---

## About

Built by **Kevin T** from Rajapalayam, Tamil Nadu. CS undergrad, sunrise chaser, and the person who thought "what if weather data could tell you whether tomorrow's sky will be copper or grey."

- Website: [seasidebeacon.com](https://seasidebeacon.com)
- Portfolio: [kevintportfolio.in](https://kevintportfolio.in)
- GitHub: [github.com/kevint1814](https://github.com/kevint1814)
- LinkedIn: [linkedin.com/in/kevint1813](https://linkedin.com/in/kevint1813)
- Email: kevin.t1302@gmail.com

---

## Source Code Access

This is a public portfolio repository. The full source code for Seaside Beacon is maintained in a private repository.

If you're a recruiter, hiring manager, or fellow developer interested in reviewing the codebase, feel free to request access at **hello@seasidebeacon.com** or DM me on [LinkedIn](https://linkedin.com/in/kevint1813). Happy to grant read access on a case-by-case basis.

---

*Built for Chennai beach lovers who want to know if tomorrow's sunrise is worth the alarm.*
