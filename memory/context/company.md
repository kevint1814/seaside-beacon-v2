# Company Context

## Overview
Seaside Beacon is a solo project by Kevin T. No team, no investors (yet). Built as a passion project that grew into a real product.

## Tools & Systems
| Tool | Used for | Notes |
|------|----------|-------|
| GitHub | Source control | Auto-deploys to Render |
| Render | Backend hosting | Free plan, cron jobs |
| Vercel | Frontend hosting | CDN, static deploy |
| MongoDB Atlas | Database | M0 free tier |
| Razorpay | Payment processing | Indian payment gateway |
| Telegram | Bot + notifications | Webhook-based |
| Brevo | Primary email | 300/day free |
| SendGrid | Backup email | 100/day free |
| UptimeRobot | Monitoring | 5-min health checks |
| Cloudflare | DNS + Worker proxy | seasidebeacon.com |
| Cloudinary | Image hosting | Community photos |

## Processes
| Process | What |
|---------|------|
| 4 AM cron | Morning forecast emails to all subscribers |
| 8:30 PM cron | Evening preview emails to premium |
| 7 PM cron | Priority alerts for 70+ scores (premium) |
| 8 AM cron | Admin digest email |
| GitHub Actions 3:30 AM | Wake up Render before cron |
| UptimeRobot 5-min | Keep Render alive, prevent cold starts |

## Design Principles
- OLED dark theme (#0F0F0F) with bronze accents (#C4733A)
- Mobile-first, responsive
- No frameworks — vanilla JS for 95+ Lighthouse
- Friendly, conversational copy — not corporate
- Science-backed but simple to understand
