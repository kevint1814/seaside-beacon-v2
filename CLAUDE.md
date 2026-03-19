# Memory

## Me
Kevin T, solo developer building Seaside Beacon — India's first AI-powered sunrise quality forecast for Chennai beaches. CS background. Email: kevin.t1302@gmail.com

## People
| Who | Role |
|-----|------|
| **Kevin** | Kevin T, creator/developer/admin of Seaside Beacon |
> Full list: memory/people/

## Terms
| Term | Meaning |
|------|---------|
| AOD | Aerosol Optical Depth — #1 sunrise color predictor for general conditions (16 pts); for Chennai coast, cloud layers dominate (20 pts) |
| GFS | Global Forecast System — Open-Meteo weather model, known to overestimate light rain in India |
| v5.7 | Current scoring algorithm version — split bonus system |
| golden hour | 20 min before to 30 min after sunrise |
| synergy | ±4 point adjustment when humidity/cloud/visibility align |
| atmospheric clarity bonus | +8 points when vis ≥ 15km, cloud 25-65%, humidity 60-82%, precip ≤ 20% — detects optimal tropical coastal scattering |
| post-rain bonus | +5 points when overnight rain confirmed (AccuWeather temporal + GFS ≥ 0.5mm cross-validation) — stacks with clarity bonus |
| ECR | East Coast Road — where Covelong and Mahabalipuram are located |
| FCM | Firebase Cloud Messaging — push notifications |
| Brevo | Primary email provider (300/day free) |
| SendGrid | Backup email provider (100/day free) |
> Full glossary: memory/glossary.md

## Projects
| Name | What |
|------|------|
| **Seaside Beacon** | Sunrise quality forecast platform for Chennai beaches, v7.3 production |
| **Phase 0** | Current — 5 Chennai-area beaches, prove accuracy, build community |
| **Phase 1** | Q2 2026 — marketing push (Instagram, Reddit, SEO) |
| **Phase 2** | Q3 2026 — expand to Pondicherry, Vizag, Puri |
> Details: memory/projects/

## Beaches
| Beach | Key |
|-------|-----|
| **Marina** | marina — North Chennai, lighthouse, world's longest urban beach |
| **Elliot's** | elliot — Besant Nagar, upscale, quieter |
| **Covelong** | covelong — ECR 40km south, surf beach, rock formations |
| **Thiruvanmiyur** | thiruvanmiyur — South Chennai, tidal pools |
| **Mahabalipuram** | mahabalipuram — ECR 60km south, UNESCO Shore Temple, autoCalibrate enabled |

## Scoring Algorithm (v5.7)
| Factor | Max Pts | Notes |
|--------|---------|-------|
| Multi-Level Cloud | 20 | #1 for Chennai — where clouds sit matters most |
| Cloud Cover | 18 | 30-70% sweet spot |
| AOD | 16 | Clean air — usually decent at coast (0.14-0.30) |
| Humidity | 15 | f(RH) curve — below 82% enhances color, above 85% causes haze |
| Pressure Trend | 11 | Falling = clearing front = dramatic sunrise |
| Visibility | 5 | |
| Weather | 5 | |
| Wind | 5 | |
| Synergy | ±4 | Nonlinear interaction correction |
| Solar Angle | ±2 | Seasonal adjustment |
| **Clarity Bonus** | +8 | Fires when vis ≥ 15km, cloud 25-65%, hum 60-82%, precip ≤ 20% |
| **Post-Rain Bonus** | +5 | AccuWeather nightHoursOfRain > 0 + GFS ≥ 0.5mm — stacks with clarity |

## Tech Stack Quick Ref
| Layer | Tech |
|-------|------|
| Backend | Node.js 18+ / Express on Render (free) |
| Frontend | Vanilla JS/HTML/CSS on Vercel CDN |
| Database | MongoDB Atlas M0 (free, 512 MB) |
| AI | Gemini 2.5 Flash → Groq Llama 3.3 → Flash-Lite → rule-based |
| Email | Brevo (primary) → SendGrid (failover) |
| Payments | Razorpay (INR 49/mo or INR 399/yr) |
| Bot | Telegram Bot API with AI chatbot (premium) |

## Preferences
- Never use currency symbols — use "INR" text instead
- Never use USD — all pricing in INR only
- No VIT Chennai or registration number in reports
- Kevin's email for reports: kevin.t1302@gmail.com
- Friendly, conversational tone for user-facing content
- Dark theme (#0F0F0F) with bronze accents (#C4733A)
- Keep chatbot responses short and simple — "like a chill friend"
- Rule-based camera settings (not AI-generated) — avoids hallucinated values
- Free users get 4 AM email ONLY — evening preview is premium
- Monthly cost ~INR 275
- Beach lists should be dynamic (pulled from BEACHES config), not hardcoded — more beaches coming in Phase 2
