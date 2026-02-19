/**
 * Cloudflare Worker — Open-Meteo Proxy
 *
 * Proxies requests to Open-Meteo APIs from Cloudflare's IP pool,
 * bypassing Render's shared-IP rate limits.
 *
 * Routes:
 *   /forecast?...  → api.open-meteo.com/v1/forecast?...
 *   /air-quality?... → air-quality-api.open-meteo.com/v1/air-quality?...
 *
 * Deploy: npx wrangler deploy
 * Free tier: 100,000 req/day (we use ~20-30/day)
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    let targetUrl;

    if (path === '/forecast') {
      targetUrl = `https://api.open-meteo.com/v1/forecast${url.search}`;
    } else if (path === '/air-quality') {
      targetUrl = `https://air-quality-api.open-meteo.com/v1/air-quality${url.search}`;
    } else if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', proxy: 'open-meteo' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response('Not Found', { status: 404 });
    }

    try {
      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'SeasideBeacon/1.0' }
      });

      // Pass through the response with CORS headers
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'  // 1h edge cache
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
