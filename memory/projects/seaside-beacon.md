# Seaside Beacon

**Status:** Production (v7.3), launched 14 February 2026
**URL:** www.seasidebeacon.com
**Creator:** Kevin T (kevin.t1302@gmail.com)

## What It Is
India's first AI-powered sunrise quality prediction platform for Chennai beaches. Analyses 9 atmospheric factors to score each morning's sunrise on 0-100 scale.

## Key Architecture
- Backend: Node.js/Express on Render (free)
- Frontend: Vanilla JS on Vercel CDN
- Database: MongoDB Atlas M0 (9 collections)
- AI: 3-tier failover (Gemini Flash → Groq → Flash-Lite → rule-based)
- Email: Brevo → SendGrid failover
- Payments: Razorpay (INR 49/mo, INR 399/yr)
- Bot: Telegram with AI chatbot (premium)

## Critical Files
| File | What | Lines |
|------|------|-------|
| weatherService.js | v5.2 scoring algorithm | 1,383 |
| chatbotService.js | Telegram AI chatbot + support | 400+ |
| aiService.js | Multi-provider AI insights | 400+ |
| emailService.js | Email delivery with failover | 500+ |
| dailyEmail.js | Cron jobs (4 AM, 8:30 PM) | 400+ |
| script.js | Frontend UI logic | 2,253 |
| styles.css | OLED dark theme | 2,782 |

## Bugs Fixed (Recent)
1. Chatbot 7-day data: returned whole object instead of result.days → AI hallucinated scores
2. needsWeather regex: didn't match "tmrw", beach names, photo terms → no weather data fetched
3. Category detection order: "add sunset forecasts" mapped to 'forecast' not 'feature'
4. UTC/IST date shift: midnight UTC → wrong IST day for date-only strings

## Monthly Cost
~INR 275 (AccuWeather INR 165 + Cloudflare INR 108)
Breakeven: 6 premium subscribers

## Revenue Model
- Free: website + 4 AM email
- Premium: INR 49/mo or INR 399/yr — photography settings, AI chatbot, evening preview, support tickets, priority alerts
