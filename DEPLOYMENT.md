# 🚀 DEPLOYMENT GUIDE

Complete step-by-step deployment instructions.

---

## ✅ PRE-DEPLOYMENT CHECKLIST

- [ ] MongoDB Atlas cluster created
- [ ] AccuWeather API key obtained
- [ ] Google Gemini API key obtained
- [ ] Gmail App Password created
- [ ] GitHub repository created
- [ ] Code pushed to GitHub

---

## 📦 STEP 1: DEPLOY BACKEND TO RAILWAY

### 1.1 Create Railway Project

1. Go to https://railway.app
2. Sign in with GitHub
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Choose **seaside-beacon** repository

### 1.2 Configure Service

**Settings Tab:**
- Root Directory: `backend`
- Start Command: `npm start` (leave empty, uses package.json)

**Variables Tab - Add ALL of these:**



### 1.3 Generate Domain

1. **Settings** → **Networking**
2. Click **"Generate Domain"**
3. You'll get: `https://seaside-beacon-production.up.railway.app`
4. **SAVE THIS URL!**

### 1.4 Verify Deployment

Watch deployment logs. Should see:
```
✅ MongoDB connected successfully
🚀 Server running on port 3000
✅ Daily email job initialized successfully
```

Test API:
```
https://seaside-beacon-production.up.railway.app/api/beaches
```

Should return JSON with beaches! ✅

---

## 🎨 STEP 2: DEPLOY FRONTEND TO VERCEL

### 2.1 Update Frontend API URL

**Before deploying, update script.js:**

```javascript
// Line 14 in script.js
const CONFIG = {
    API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api'
        : 'https://seaside-beacon-production.up.railway.app/api',  // ← YOUR RAILWAY URL
    USE_BACKEND: true
};
```

Commit and push:
```bash
git add frontend/script.js
git commit -m "Update API URL to Railway backend"
git push origin main
```

### 2.2 Deploy to Vercel

1. Go to https://vercel.com
2. Sign in with GitHub
3. Click **"Add New Project"**
4. Import **seaside-beacon** repository

**Configuration:**
- Framework Preset: **Other**
- Root Directory: `frontend`
- Build Command: (leave empty)
- Output Directory: `.`

5. Click **"Deploy"**

### 2.3 Get Vercel URL

After deployment:
- You'll get: `https://seaside-beacon.vercel.app`
- Or custom: `https://seaside-beacon-yourname.vercel.app`

**SAVE THIS URL!**

---

## 🔄 STEP 3: UPDATE CORS

### 3.1 Update Railway FRONTEND_URL

1. Go back to **Railway** → **Variables**
2. Find `FRONTEND_URL`
3. **Update to:**
   ```
   https://seaside-beacon.vercel.app
   ```
   (Use YOUR actual Vercel URL)

4. Railway will auto-redeploy (30 seconds)

---

## ✅ STEP 4: FINAL TESTING

### Test Backend
```
https://seaside-beacon-production.up.railway.app/api/beaches
```
✅ Should return beaches JSON

```
https://seaside-beacon-production.up.railway.app/api/predict/marina
```
✅ Should return prediction (if after 6 PM IST)  
✅ Or time restriction message (if before 6 PM)

### Test Frontend

1. **Open:** https://seaside-beacon.vercel.app
2. **Click beach** → Should highlight
3. **Click "Predict"** → Should show timeline
4. **After animation** → Results appear
5. **Click "Get Daily Updates"** → Modal opens
6. **Enter email & subscribe** → Welcome email arrives!

---

## 🎊 YOU'RE LIVE!

**URLs:**
- Frontend: https://seaside-beacon.vercel.app
- Backend: https://seaside-beacon-production.up.railway.app
- Cost: $0/month

---

## 🔧 POST-DEPLOYMENT

### Monitor Logs

**Railway:**
- Deployments → View Logs
- Watch for errors

**Vercel:**
- Project → Logs
- Monitor traffic

### Test Daily Emails

**Manual Test:**
1. Subscribe with your email
2. Check welcome email arrives
3. Wait until tomorrow 4:05 AM IST
4. Check daily prediction email

**Or trigger manually:**
```bash
# SSH into Railway or run locally
node -e "require('./jobs/dailyEmail').sendDailyPredictions()"
```

---

## 🐛 Common Issues

### Issue: CORS Error
**Fix:** Verify FRONTEND_URL in Railway matches Vercel URL exactly

### Issue: MongoDB Connection Failed
**Fix:** Check MongoDB Atlas IP whitelist (0.0.0.0/0)

### Issue: Emails Not Sending
**Fix:** Verify Gmail App Password (16 characters, no spaces)

### Issue: AccuWeather Error
**Fix:** Check API key, ensure within 50 calls/day limit

---

## 📊 Usage Monitoring

### Railway
- Free: $5 credit/month
- Your usage: ~$3/month
- Check: Settings → Usage

### AccuWeather
- Free: 50 calls/day
- Your usage: ~44 calls/day
- Check: developer.accuweather.com

### MongoDB Atlas
- Free: M0 tier (512MB)
- Your usage: ~50MB
- Check: Atlas dashboard

---

## 🎯 Success Criteria

✅ Backend returns JSON at /api/beaches  
✅ Predictions work (after 6 PM)  
✅ Frontend loads and looks beautiful  
✅ Beach selection works  
✅ Timeline animation plays  
✅ Results display correctly  
✅ Email modal opens  
✅ Subscription sends welcome email  
✅ Daily emails arrive at 4 AM IST  
✅ Mobile responsive  

---

**Congratulations! Your app is live! 🎉**
