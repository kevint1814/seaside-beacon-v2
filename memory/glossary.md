# Glossary

Seaside Beacon workplace shorthand, acronyms, and internal language.

## Acronyms
| Term | Meaning | Context |
|------|---------|---------|
| AOD | Aerosol Optical Depth | #1 sunrise color predictor, 16 pts max in scoring |
| GFS | Global Forecast System | Open-Meteo weather model, updates every 6 hrs |
| FCM | Firebase Cloud Messaging | Push notifications to Android/iOS |
| JWT | JSON Web Token | User auth, 30-day TTL |
| HMAC | Hash-based Message Auth Code | Razorpay webhook signature verification |
| OLED | Organic LED | Display tech — site uses OLED-optimized dark theme |
| TTL | Time To Live | Cache expiry duration |
| IST | Indian Standard Time | UTC+5:30, all crons run on IST |
| ECR | East Coast Road | Highway where Covelong Beach is (40km south of Chennai) |
| GDPR | General Data Protection Regulation | One-click unsubscribe compliance |
| CDN | Content Delivery Network | Vercel serves frontend via CDN |
| CRM | Customer Relationship Management | Not used yet, potential future |

## Internal Terms
| Term | Meaning |
|------|---------|
| scoring algorithm | The v5.2 9-factor sunrise quality prediction engine in weatherService.js |
| synergy adjustment | ±4 pts when humidity/cloud/visibility all align or conflict |
| post-rain bonus | +8 pts for aerosol washout after overnight rain |
| solar angle correction | ±2 pts for seasonal Rayleigh scattering at 13°N |
| graceful degradation | When Open-Meteo is down, satellite factors default to neutral scores |
| golden hour | Photography window: 20 min before to 30 min after sunrise |
| provider chain | AI failover: Gemini Flash → Groq → Flash-Lite → rule-based |
| negative cache | 2-min TTL cache that prevents hammering during API outages |
| session intro | Bot sends intro message after 1hr+ gap in conversation |
| definitive forecast | Per-beach live scoring data (vs approximate 7-day Marina-only data) |
| evening preview | 8:30 PM premium email showing tomorrow's forecast |
| morning forecast | 4:00 AM email to all subscribers |
| priority alert | 7:00 PM premium alert when score >= 70 |

## Scoring Verdicts
| Score | Rating | Verdict |
|-------|--------|---------|
| 85-100 | EXCELLENT | GO — set that alarm |
| 70-84 | VERY GOOD | GO — worth the wake-up |
| 55-69 | GOOD | MAYBE — pleasant but not dramatic |
| 40-54 | FAIR | MAYBE — mostly flat sky |
| 25-39 | POOR | SKIP — washed out |
| 0-24 | UNFAVORABLE | NO — save your sleep |

## Beach Keys
| Name | API Key | Location |
|------|---------|----------|
| Marina Beach | marina | North Chennai, 13.0499°N |
| Elliot's Beach | elliot | Besant Nagar, 13.0067°N |
| Covelong Beach | covelong | ECR 40km south, 12.7925°N |
| Thiruvanmiyur Beach | thiruvanmiyur | South Chennai, 12.9826°N |

## Service Names
| Service | What | Free Tier |
|---------|------|-----------|
| Render | Backend hosting | Free, sleeps after 15 min |
| Vercel | Frontend CDN | Free |
| MongoDB Atlas M0 | Database | Free, 512 MB |
| AccuWeather | Hourly/daily weather | Paid, ~INR 165/mo |
| Open-Meteo | GFS cloud layers, pressure, AOD | Free |
| Gemini 2.5 Flash | Primary AI (250 req/day) | Free |
| Groq Llama 3.3 70B | Secondary AI (51 req/day) | Free |
| Gemini Flash-Lite | Tertiary AI (1000 req/day) | Free |
| Brevo | Primary email (300/day) | Free |
| SendGrid | Backup email (100/day) | Free |
| Cloudinary | Photo uploads | Free |
| Razorpay | Payments | Per-transaction fees |
| UptimeRobot | Health monitoring (5-min) | Free |
| Cloudflare | DNS + Worker proxy | Domain ~INR 1,300/yr |

## Project Phases
| Phase | Timeline | Scope |
|-------|----------|-------|
| Phase 0 | Feb 2026 (current) | Chennai 4 beaches, prove accuracy |
| Phase 1 | Q2 2026 | Marketing push |
| Phase 2 | Q3 2026 | Expand to Pondicherry, Vizag, Puri |
| Phase 3 | Q4 2026 | Multi-city frontend, mobile beta |
| Phase 4 | 2027 | All Indian coastal cities, React Native app |
| Phase 5 | 2027+ | SE Asia, Australia, API licensing |
