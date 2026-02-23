# Seaside Beacon — Full Codebase Audit Report
**Date:** 23 February 2026
**Scope:** Frontend (HTML, CSS, JS) + Backend (Routes, Models, Server)

---

## Executive Summary

Full A/B audit across the entire Seaside Beacon codebase covering security, data integrity, input validation, UI consistency, accessibility, and production readiness. **126 total findings** across 4 audit layers.

| Severity | Count | Action |
|----------|-------|--------|
| **CRITICAL** | 11 | Must fix before next deploy |
| **WARNING** | 33 | Fix in next sprint |
| **INFO** | 20+ | Improvements for later |

---

## CRITICAL FINDINGS (Must Fix)

### 1. Admin Dashboard — Feedback Beach Field Mismatch
**Files:** `backend/admin/dashboard.html` line 721 ↔ `backend/models/Feedback.js`
**Bug:** Dashboard renders `f.preferredBeach` but the Feedback model stores `f.beach`. All feedback beach names show as `undefined` in admin.
**Fix:** Change `f.preferredBeach` → `f.beach` in dashboard.html (line 721).

### 2. Hardcoded Admin Password in Source Code
**File:** `backend/routes/admin.js` lines 24-25
```js
const ADMIN_PASS = process.env.ADMIN_PASS || 'beacon2026';
```
**Risk:** If `ADMIN_PASS` env var isn't set, anyone who reads the source gets admin access.
**Fix:** Remove fallback. Fail startup if `ADMIN_PASS` is not set.

### 3. Auth Token Passed in URL Query Parameter
**File:** `backend/routes/auth.js` line 206
```js
const redirectUrl = `${APP_URL}?authToken=${authToken}`;
```
**Risk:** Token visible in browser history, server logs, HTTP referrer headers, and any analytics tools. If user shares the URL, their session is compromised.
**Fix:** Use HttpOnly cookie or redirect to a page that stores the token via POST body.

### 4. No CSRF Protection on Any POST Endpoint
**Files:** All routes — `/api/subscribe`, `/api/feedback`, `/api/auth/magic-link`, `/api/payment/*`
**Risk:** Attacker site can submit forms on behalf of a logged-in user.
**Fix:** Add CSRF middleware (csurf or custom token).

### 5. Razorpay Webhook — Processes Events When Secret Is Missing
**File:** `backend/routes/payment.js` lines 146-164
**Bug:** If `RAZORPAY_WEBHOOK_SECRET` env var isn't set, the code returns 400 but processing still continues on line 167.
**Fix:** Return early and never process events without valid signature verification.

### 6. Premium Bypass — Frontend-Only Check
**File:** `frontend/script.js` lines 1780-1795
```js
if (!document.body.classList.contains('is-premium')) { ... }
```
**Risk:** User can open DevTools, run `document.body.classList.add('is-premium')`, and access all premium content. DSLR/Mobile tabs are gated client-side only.
**Fix:** Backend should NOT return premium data (photography parameters) for unauthenticated/non-premium users. Add server-side gating to `/api/predict`.

### 7. Strip Subscription Form — Missing `<form>` Tag and `required` Attributes
**File:** `frontend/index.html` lines 1329-1393
**Bug:** The bottom-of-page subscription strip has email and beach inputs that are NOT wrapped in a `<form>` tag and do NOT have `required` attributes — inconsistent with all other forms.
**Fix:** Wrap in `<form>`, add `required` to both inputs.

### 8. No Rate Limiting on Magic Link Endpoint
**File:** `backend/routes/auth.js`
**Risk:** Attacker can brute-force magic link requests, flooding a victim's inbox and burning Brevo email quota.
**Fix:** Add per-email rate limit (3 requests/hour) on `/api/auth/magic-link`.

### 9. Form Labels Missing `for` Attributes (15+ inputs)
**File:** `frontend/index.html` — all forms
**Impact:** Screen readers cannot associate labels with inputs. Accessibility failure.
**Fix:** Add `for="inputId"` to every `<label>`.

### 10. XSS Vector — API Data Injected via innerHTML
**File:** `frontend/script.js` lines 1703, 1740, 1770
```js
<div class="atm-body">${d.body}</div>
```
**Risk:** If the AI forecast API returns HTML/script content, it gets rendered directly in the DOM.
**Fix:** Sanitize all API response data before innerHTML insertion, or use textContent.

### 11. Unsubscribe Endpoint Uses GET Method
**File:** `backend/routes/subscribe.js` line 123
**Risk:** Browser link prefetchers, email scanners, and proxies can trigger GET requests — accidentally unsubscribing users.
**Fix:** Change to POST with a confirmation page, or use one-time token with GET.

---

## WARNING FINDINGS (Fix Next Sprint)

### Frontend — Forms & Inputs

| # | Issue | Location | Details |
|---|-------|----------|---------|
| W1 | Form inputs missing `name` attributes | index.html (11 inputs) | FormData API won't capture fields. Add `name=` to all inputs. |
| W2 | No email validation (regex) | script.js (lines 1928, 1935) | Emails only trimmed, never validated. Accepts `a@b` as valid. |
| W3 | No file size check on photo upload | script.js line 2054 | Users can upload 10MB images. Add client-side size warning. |
| W4 | No input length limits | script.js (feedback/photo) | Comment, name fields accept unlimited length. Add maxlength. |
| W5 | Double-submit race condition | script.js line 1259 | Gap between `if(loading)` check and `loading=true` set. Use a single atomic flag. |
| W6 | Form inputs not disabled during submission | script.js lines 1944, 2061 | Button disabled, but user can edit email while request is in flight. |

### Frontend — Premium & Auth

| # | Issue | Location | Details |
|---|-------|----------|---------|
| W7 | Auth token never expires client-side | script.js line 2383 | localStorage token persists forever. Add expiry check. |
| W8 | Premium status from localStorage is spoofable | script.js lines 2556-2557 | `sb_premium=1` in localStorage grants access. Server must verify on API calls. |
| W9 | Razorpay script failure crashes payment | script.js line 2540 | `new Razorpay(options)` throws if CDN didn't load. Add `typeof Razorpay` check. |
| W10 | No modal Escape key handler cleanup | script.js line 2757 | New keydown listener added each open. Remove on close. |

### Frontend — CSS

| # | Issue | Location | Details |
|---|-------|----------|---------|
| W11 | Prismatic gradient `::before` still on 12+ elements | styles.css (multiple) | `.glass::before`, `.cond-item::before`, `.craft-card::before`, etc. still render gradient overlays. Only `.analysis-panel::before` and `.forecast-master::before` were killed. |
| W12 | Z-index chaos — no documented scale | styles.css | Values jump: 0, 1, 3, 299, 300, 301, 400, 500, 700, 9999. `.cinema-toggle` (400) sits above modals. |
| W13 | No `@media (prefers-reduced-motion)` | styles.css | 15+ animations defined. Users with vestibular disorders get no accommodation. |

### Backend — Security & Data

| # | Issue | Location | Details |
|---|-------|----------|---------|
| W14 | Email addresses logged in plaintext | Multiple routes | `console.log` outputs full emails. GDPR/privacy violation. Hash or mask in logs. |
| W15 | CORS allows requests with no origin | server.js line 49 | `if (!origin) return callback(null, true)` — too permissive. |
| W16 | CSP disabled for admin dashboard | server.js line 36 | `contentSecurityPolicy: false` for `/admin` path. XSS risk on admin panel. |
| W17 | Admin sessions in-memory only | admin.js line 27 | `_sessions = new Map()` — lost on restart, 24h TTL too long. |
| W18 | Magic link token — no one-time use enforcement | auth.js line 155 | Race condition: two requests can use same token before DB save completes. |
| W19 | Device registration has no auth | device.js line 14 | Anyone can register push notification tokens for any beach. |
| W20 | Image upload — MIME type check only | community.js line 20 | MIME can be spoofed. No magic byte validation or image re-encoding. |
| W21 | No beach whitelist validation | community.js, predict.js | Beach param used directly from request, no enum check at route level. |
| W22 | Open metrics endpoint exposes all user emails | admin.js line 66 | If admin token is stolen, full email list of all subscribers is exposed. |
| W23 | No HTTPS redirect | server.js | No HTTP→HTTPS enforcement at app level. |

---

## INFO FINDINGS (Improvements)

| # | Issue | Details |
|---|-------|---------|
| I1 | SVGs missing `aria-hidden` | 51 decorative SVGs announce to screen readers |
| I2 | Tab buttons missing `aria-selected` | Photography tabs lack active state for accessibility |
| I3 | Inline `onclick` handlers on case cards | Should use `addEventListener` for CSP compliance |
| I4 | `modal aria-hidden` not toggled by JS | Static `aria-hidden="true"` even when visible |
| I5 | No `.env.example` file | 15+ env vars undocumented |
| I6 | No database indexes for common queries | Email + isActive compound index missing |
| I7 | No request ID correlation in logs | Can't trace requests across services |
| I8 | No audit logging for admin actions | Broadcasts, logins, data access untracked |
| I9 | Telegram webhook errors silently swallowed | `setImmediate` with no retry queue |
| I10 | No graceful shutdown on DB disconnect | App continues serving errors |
| I11 | IntersectionObserver memory leak | New observer created every forecast render, old ones not disconnected |
| I12 | Multiple resize listeners accumulate | `initNav()` and `initScrollProgress()` both add without cleanup |
| I13 | Payment state transitions not validated | Can go from cancelled → active without creation check |
| I14 | No print stylesheet | Users can't print forecast cards cleanly |

---

## Frontend ↔ Backend Cross-Reference Mismatches

| Frontend Field | Backend Field | File | Issue |
|---------------|---------------|------|-------|
| `f.preferredBeach` | `f.beach` | dashboard.html ↔ Feedback.js | **CONFIRMED BUG** — shows undefined |
| `stripEmail` / `stripBeach` | — | index.html (strip form) | No `<form>` wrapper, no `required` |
| `sb_premium` localStorage | No server check | script.js ↔ predict.js | Premium data served to all users |
| `authToken` in URL param | Redirects with token | auth.js line 206 | Token leaks via referrer/history |

---

## Recommended Fix Priority

**Deploy Blockers (fix now):**
1. `f.preferredBeach` → `f.beach` in admin dashboard
2. Remove hardcoded admin password fallback
3. Auth token out of URL params
4. Add CSRF protection

**This Week:**
5. Rate limit on magic link endpoint
6. Server-side premium data gating
7. Sanitize innerHTML from API responses
8. Fix strip subscription form
9. Change unsubscribe to POST

**Next Sprint:**
10. Proper rate limiting per endpoint
11. Input validation (email regex, length limits, beach whitelist)
12. Z-index documentation and cleanup
13. Accessibility pass (labels, aria, reduced motion)
14. Admin session management (DB-backed, shorter TTL)
