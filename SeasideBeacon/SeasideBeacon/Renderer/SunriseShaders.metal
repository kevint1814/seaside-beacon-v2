#include <metal_stdlib>
using namespace metal;

// MARK: - Uniforms (must match SunriseUniforms.swift)

struct Uniforms {
    float2 resolution;
    float  time;
    float  sunriseProgress;
    float  tiltX;
    float  tiltY;
    float  reduceMotion;
    float2 _pad;
};

// MARK: - Vertex

struct VertexOut {
    float4 position [[position]];
    float2 uv;
};

vertex VertexOut sunriseVertex(uint vid [[vertex_id]]) {
    float2 pos[3] = { float2(-1, -1), float2(3, -1), float2(-1, 3) };
    float2 uvs[3] = { float2(0, 1),   float2(2, 1),  float2(0, -1) };

    VertexOut out;
    out.position = float4(pos[vid], 0, 1);
    out.uv = uvs[vid];
    return out;
}

// MARK: - Helpers

static float ease(float t) {
    return t < 0.5 ? 2.0 * t * t : -1.0 + (4.0 - 2.0 * t) * t;
}

static float hash(float2 p) {
    float h = dot(p, float2(127.1, 311.7));
    return fract(sin(h) * 43758.5453);
}

static float pseudoRand(float n) {
    return fract(sin(n + 1.0) * 43758.5453);
}

static float3 lerpColor(float3 a, float3 b, float t) {
    return mix(a, b, t);
}

// MARK: - Color Palettes

static float3 zenithColor(float t) {
    const float  s[10] = {0.0, 0.10, 0.22, 0.34, 0.44, 0.56, 0.68, 0.80, 0.90, 1.0};
    const float3 c[10] = {
        float3(8,6,22)/255.0,     float3(16,12,42)/255.0,
        float3(38,24,72)/255.0,   float3(62,38,96)/255.0,
        float3(72,45,88)/255.0,   float3(48,62,105)/255.0,
        float3(38,72,118)/255.0,  float3(45,88,148)/255.0,
        float3(58,108,168)/255.0, float3(72,125,185)/255.0
    };
    if (t <= 0.0) return c[0];
    if (t >= 1.0) return c[9];
    for (int i = 0; i < 9; i++) {
        if (t >= s[i] && t <= s[i+1])
            return lerpColor(c[i], c[i+1], (t - s[i]) / (s[i+1] - s[i]));
    }
    return c[9];
}

static float3 midSkyColor(float t) {
    const float  s[10] = {0.0, 0.12, 0.24, 0.34, 0.44, 0.52, 0.62, 0.74, 0.86, 1.0};
    const float3 c[10] = {
        float3(12,10,35)/255.0,   float3(32,22,68)/255.0,
        float3(88,40,88)/255.0,   float3(148,58,78)/255.0,
        float3(192,92,68)/255.0,  float3(168,80,62)/255.0,
        float3(108,68,78)/255.0,  float3(72,68,105)/255.0,
        float3(58,65,108)/255.0,  float3(52,62,102)/255.0
    };
    if (t <= 0.0) return c[0];
    if (t >= 1.0) return c[9];
    for (int i = 0; i < 9; i++) {
        if (t >= s[i] && t <= s[i+1])
            return lerpColor(c[i], c[i+1], (t - s[i]) / (s[i+1] - s[i]));
    }
    return c[9];
}

static float3 horizonColor(float t) {
    const float  s[10] = {0.0, 0.10, 0.22, 0.32, 0.42, 0.52, 0.62, 0.74, 0.86, 1.0};
    const float3 c[10] = {
        float3(75,32,20)/255.0,   float3(138,55,24)/255.0,
        float3(218,88,32)/255.0,  float3(252,125,42)/255.0,
        float3(255,175,62)/255.0, float3(255,158,55)/255.0,
        float3(218,118,48)/255.0, float3(178,100,50)/255.0,
        float3(148,85,45)/255.0,  float3(118,78,48)/255.0
    };
    if (t <= 0.0) return c[0];
    if (t >= 1.0) return c[9];
    for (int i = 0; i < 9; i++) {
        if (t >= s[i] && t <= s[i+1])
            return lerpColor(c[i], c[i+1], (t - s[i]) / (s[i+1] - s[i]));
    }
    return c[9];
}

static float3 glowColor(float t) {
    const float  s[9] = {0.0, 0.15, 0.28, 0.40, 0.52, 0.65, 0.78, 0.90, 1.0};
    const float3 c[9] = {
        float3(248,138,58)/255.0, float3(255,168,62)/255.0,
        float3(255,195,72)/255.0, float3(255,210,82)/255.0,
        float3(255,188,68)/255.0, float3(245,158,62)/255.0,
        float3(208,128,58)/255.0, float3(158,95,52)/255.0,
        float3(115,72,42)/255.0
    };
    if (t <= 0.0) return c[0];
    if (t >= 1.0) return c[8];
    for (int i = 0; i < 8; i++) {
        if (t >= s[i] && t <= s[i+1])
            return lerpColor(c[i], c[i+1], (t - s[i]) / (s[i+1] - s[i]));
    }
    return c[8];
}

static float3 seaColor(float t) {
    const float  s[8] = {0.0, 0.15, 0.28, 0.40, 0.52, 0.65, 0.80, 1.0};
    const float3 c[8] = {
        float3(6,8,18)/255.0,    float3(12,18,38)/255.0,
        float3(18,28,52)/255.0,  float3(22,35,58)/255.0,
        float3(20,32,55)/255.0,  float3(18,30,52)/255.0,
        float3(16,28,48)/255.0,  float3(14,25,45)/255.0
    };
    if (t <= 0.0) return c[0];
    if (t >= 1.0) return c[7];
    for (int i = 0; i < 7; i++) {
        if (t >= s[i] && t <= s[i+1])
            return lerpColor(c[i], c[i+1], (t - s[i]) / (s[i+1] - s[i]));
    }
    return c[7];
}

// MARK: - Layer 1: Sky Gradient

static float3 drawSky(float2 uv, float sp) {
    float skyBottom = 0.72;
    float skyT = saturate((skyBottom - uv.y) / skyBottom);

    float3 zen = zenithColor(sp);
    float3 mid = midSkyColor(sp);
    float3 hor = horizonColor(sp);

    float3 color;
    if (skyT > 0.5) {
        color = lerpColor(mid, zen, (skyT - 0.5) / 0.5);
    } else {
        color = lerpColor(hor, mid, skyT / 0.5);
    }

    // Rayleigh scattering
    float scatter = sp * 0.15;
    float hf = pow(skyT, 1.5);
    color.b += scatter * hf * 0.08;
    color.r -= scatter * hf * 0.03;

    return color;
}

// MARK: - Layer 2: Horizon Glow

static float3 addHorizonGlow(float3 color, float2 uv, float sp) {
    float2 sunCenter = float2(0.5, 0.72);
    float dist = distance(uv, sunCenter);

    float glowRadius = 0.55 + sp * 0.35;
    float glowPeak = sp < 0.5 ? sp * 2.0 : max(0.15, 2.0 - sp * 2.1);
    float3 gc = glowColor(sp);

    float g1 = max(0.0, 1.0 - dist / (glowRadius * 0.3)) * 0.6;
    float g2 = max(0.0, 1.0 - dist / (glowRadius * 0.5)) * 0.35;
    float g3 = max(0.0, 1.0 - dist / (glowRadius * 0.8)) * 0.2;
    float g4 = max(0.0, 1.0 - dist / glowRadius) * 0.1;

    color += gc * (g1 + g2 + g3 + g4) * glowPeak;
    return color;
}

// MARK: - Layer 3: Stars (grid-based — O(1) per pixel)

static float3 addStars(float3 color, float2 uv, float sp, float time, float2 tilt) {
    float starAlpha = max(0.0, 1.0 - sp * 2.2);
    if (starAlpha < 0.01) return color;

    // Only render stars in sky region
    if (uv.y > 0.72) return color;

    // Grid-based star field: divide sky into cells, each cell may contain one star
    float2 gridSize = float2(16.0, 12.0);  // 192 potential cells
    float2 cellCoord = floor(uv * gridSize);

    // Check current cell + 8 neighbors (9 checks instead of 130)
    for (int dx = -1; dx <= 1; dx++) {
        for (int dy = -1; dy <= 1; dy++) {
            float2 cell = cellCoord + float2(float(dx), float(dy));

            // Skip cells outside sky
            if (cell.y < 0.0 || cell.y >= gridSize.y * 0.72) continue;

            // Hash to determine if this cell has a star (~60% chance)
            float cellHash = hash(cell);
            if (cellHash > 0.6) continue;

            // Star position within cell
            float2 starUV = (cell + float2(hash(cell + 0.5), hash(cell + 1.7))) / gridSize;

            // Parallax from tilt
            float depth = 0.3 + cellHash * 0.7;
            starUV += tilt * 0.012 * depth;

            float d = distance(uv, starUV);
            float starSize = (0.6 + cellHash * 0.8) / 1200.0;

            if (d < starSize * 4.0) {
                float brightness = 0.3 + hash(cell + 3.3) * 0.7;
                float tSpeed = 0.6 + hash(cell + 5.5) * 1.8;
                float tPhase = hash(cell + 7.7) * 6.2832;
                float twinkle = 0.5 + 0.5 * sin(time * tSpeed + tPhase);
                float a = starAlpha * brightness * (0.4 + twinkle * 0.6);
                float falloff = smoothstep(starSize * 4.0, 0.0, d);
                color += float3(0.894, 0.878, 1.0) * a * falloff;
            }
        }
    }

    return color;
}

// MARK: - Layer 4: Sun Disc + HDR Bloom

static float3 addSun(float3 color, float2 uv, float sp, float aspect) {
    if (sp < 0.18) return color;

    float sunProgress = min(1.0, (sp - 0.18) / 0.58);
    float sunEased = ease(sunProgress);
    float sunAlpha = min(1.0, sunProgress * 2.2);

    float2 sunPos = float2(0.5, 0.72 - sunEased * 0.38);
    float sunR = (42.0 + sunEased * 38.0) / 1170.0;

    // Correct for aspect ratio in distance calculation
    float2 uvA = uv * float2(1.0, 1.0 / aspect);
    float2 spA = sunPos * float2(1.0, 1.0 / aspect);
    float d = distance(uvA, spA);

    float3 gc = glowColor(sp);

    // Atmospheric haze (enormous, subtle)
    float haze = exp(-d / (sunR * 22.0)) * 0.08 * sunAlpha;
    color += gc * haze;

    // Far corona
    float corona = exp(-d / (sunR * 6.0)) * 0.2 * sunAlpha;
    color += gc * corona;

    // Inner glow
    float inner = exp(-d / (sunR * 2.5)) * 0.4 * sunAlpha;
    color += float3(1.0, 0.85, 0.55) * inner;

    // Sun disc (hot white center -> amber edge)
    float disc = pow(max(0.0, 1.0 - d / sunR), 4.0) * sunAlpha;
    float3 discColor = lerpColor(float3(1.0, 0.88, 0.55), float3(1.0, 1.0, 0.97), disc);
    color += discColor * disc * 1.5;

    // Lens flare streak (horizontal)
    float hDist = abs(uv.y - sunPos.y);
    float flareFalloff = exp(-hDist / (sunR * 0.8));
    float flareWidth = exp(-abs(uv.x - sunPos.x) / (sunR * 8.0));
    color += float3(1.0, 0.92, 0.72) * flareFalloff * flareWidth * 0.12 * sunAlpha;

    return color;
}

// MARK: - Layer 5: God Rays (reduced to 10 for performance)

static float3 addGodRays(float3 color, float2 uv, float sp, float time) {
    if (sp < 0.12 || sp > 0.94) return color;

    float rayIntensity = sp < 0.48
        ? (sp - 0.12) / 0.36
        : (0.94 - sp) / 0.46;

    float sunProgress = min(1.0, (sp - 0.18) / 0.58);
    float sunEased = ease(max(0.0, sunProgress));
    float2 sunPos = float2(0.5, 0.72 - sunEased * 0.38);
    float3 rayColor = glowColor(sp);

    // 10 most impactful rays (reduced from 24)
    const float angles[10] = {
        -0.50, -0.35, -0.22, -0.09, -0.02,
         0.03,  0.15,  0.28,  0.42,  0.58
    };
    const float widths[10] = {
        34, 40, 46, 50, 55,
        48, 44, 38, 32, 16
    };
    const float lenMuls[10] = {
        1.05, 1.12, 1.18, 1.20, 1.22,
        1.18, 1.15, 1.10, 1.02, 0.78
    };

    for (int r = 0; r < 10; r++) {
        float fr = float(r);
        float sway = sin(time * 0.020 + fr * 1.9) * 0.020;
        float shimmer = 0.50 + 0.50 * sin(time * 0.038 + fr * 2.7);
        float angle = angles[r] + sway;
        float rayLen = 0.75 * lenMuls[r];
        float rayWidth = widths[r] / 1170.0;

        float2 rayDir = float2(sin(angle), -cos(angle));
        float2 toPixel = uv - sunPos;

        float proj = dot(toPixel, rayDir);
        if (proj < 0.0 || proj > rayLen) continue;

        float perp = abs(dot(toPixel, float2(-rayDir.y, rayDir.x)));
        if (perp > rayWidth) continue;

        float lengthFade = 1.0 - proj / rayLen;
        float widthFade = 1.0 - perp / rayWidth;

        float baseAlpha = rayIntensity * 0.15;
        float rayAlpha = baseAlpha * shimmer * (0.45 + pseudoRand(fr * 13.0) * 0.55);

        color += rayColor * rayAlpha * lengthFade * widthFade * widthFade;
    }

    return color;
}

// MARK: - Layer 6: Sea

static float3 drawSea(float3 color, float2 uv, float sp, float time) {
    if (uv.y < 0.72) return color;

    float seaT = (uv.y - 0.72) / 0.28;
    float3 baseC = seaColor(sp);
    float3 sea = lerpColor(baseC, baseC * 0.7, seaT);

    // Sky reflection on water surface
    float3 skyReflect = horizonColor(sp);
    float reflectStrength = max(0.0, 1.0 - seaT * 3.0) * sp * 0.3;
    sea += skyReflect * reflectStrength;

    // Wave ripples (reduced to 10)
    float3 waveC = glowColor(sp);
    float glowPeak = sp < 0.5 ? sp * 2.0 : max(0.15, 2.0 - sp * 2.1);
    float daylight = min(1.0, sp * 1.5);

    for (int w = 0; w < 10; w++) {
        float fw = float(w);
        float wy = 0.73 + fw * 0.025;
        float amp = (4.5 - fw * 0.3) / 1170.0;
        float freq = (0.003 + fw * 0.0015) * 1170.0;
        float spd = 0.4 + fw * 0.12;
        float wPhase = fw * 1.4 + (w % 2 == 0 ? 0.0 : 1.885);

        float waveY = wy + amp * sin(uv.x * freq + time * spd + wPhase)
                         + amp * 0.35 * sin(uv.x * freq * 2.3 + time * spd * 1.7 + fw);

        float waveDist = abs(uv.y - waveY);
        float waveAlpha = 0.05 + glowPeak * 0.12 + daylight * 0.06;
        float waveFade = smoothstep(0.005, 0.0, waveDist);

        sea += waveC * waveAlpha * waveFade * 0.5;
    }

    return sea;
}

// MARK: - Layer 7: Water Reflections

static float3 addWaterReflections(float3 color, float2 uv, float sp, float time) {
    if (uv.y < 0.72) return color;

    float sunProgress = min(1.0, (sp - 0.18) / 0.58);
    float sunEased = ease(max(0.0, sunProgress));
    float2 sunPos = float2(0.5, 0.72 - sunEased * 0.38);
    float3 gc = glowColor(sp);
    float reflectAlpha = min(1.0, sunProgress * 1.5);

    // Golden reflection column
    float colDist = abs(uv.x - sunPos.x);
    float colWidth = 0.06 + sp * 0.04;
    float colFade = exp(-colDist / colWidth);
    float depthFade = 1.0 - (uv.y - 0.72) / 0.28;
    color += gc * colFade * depthFade * reflectAlpha * 0.25;

    // Horizon kiss
    float horizDist = abs(uv.y - 0.72);
    if (horizDist < 0.02 && colDist < 0.15) {
        float kiss = exp(-horizDist / 0.008) * exp(-colDist / 0.08);
        color += gc * kiss * reflectAlpha * 0.3;
    }

    // Shimmer fragments (reduced to 10, only near sun column)
    if (colDist < 0.15) {
        for (int i = 0; i < 10; i++) {
            float fi = float(i);
            float sx = sunPos.x + (pseudoRand(fi * 7.0 + 1.0) - 0.5) * 0.2;
            float sy = 0.73 + pseudoRand(fi * 11.0 + 3.0) * 0.2;
            float shimmerSpeed = 1.5 + pseudoRand(fi * 17.0) * 3.0;
            float shimmerPhase = pseudoRand(fi * 23.0) * 6.2832;

            float shimmer = 0.5 + 0.5 * sin(time * shimmerSpeed + shimmerPhase);
            float d = distance(uv, float2(sx, sy));
            float sparkle = exp(-d / 0.006) * shimmer * reflectAlpha * 0.18;

            color += gc * sparkle;
        }
    }

    return color;
}

// MARK: - Layer 8: Color Grading

static float3 addColorGrading(float3 color, float2 uv, float sp, float time) {
    // Warm amber wash
    float warmAlpha = sp < 0.5 ? sp * 0.14 : max(0.03, 0.07 - (sp - 0.5) * 0.06);
    color += float3(200, 110, 35) / 255.0 * warmAlpha;

    // Golden wash (horizon-concentrated)
    float horizGold = sp < 0.55 ? sp * 0.10 : max(0.02, 0.055 - (sp - 0.55) * 0.05);
    float horizMask = max(0.0, 1.0 - abs(uv.y - 0.65) / 0.25);
    color += float3(220, 140, 40) / 255.0 * horizGold * horizMask;

    // Cool blue vignette
    float vigStr = 0.12 + sp * 0.06;
    float vigDist = distance(uv, float2(0.5, 0.5)) / 0.707;
    color -= float3(0.03, 0.04, 0.10) * vigDist * vigDist * vigStr;

    // Breathing warmth
    float breathAmp = 1.0 - sp * 0.8;
    float breath = 0.5 + 0.5 * sin(time * 0.022);
    color += glowColor(sp) * breath * breathAmp * 0.02;

    return saturate(color);
}

// MARK: - Fragment Shader

fragment float4 sunriseFragment(
    VertexOut in [[stage_in]],
    constant Uniforms &u [[buffer(0)]]
) {
    float2 uv = in.uv;
    float sp = ease(u.sunriseProgress);
    float time = u.reduceMotion > 0.5 ? 0.0 : u.time;
    float2 tilt = float2(u.tiltX, u.tiltY);
    float aspect = u.resolution.x / max(u.resolution.y, 1.0);

    // Layer 1: Sky gradient
    float3 color = drawSky(uv, sp);

    // Layer 2: Horizon glow
    color = addHorizonGlow(color, uv, sp);

    // Layer 3: Stars (skip when faded)
    if (sp < 0.45) {
        color = addStars(color, uv, sp, time, tilt);
    }

    // Layer 4: Sun disc + bloom
    color = addSun(color, uv, sp, aspect);

    // Layer 5: God rays
    color = addGodRays(color, uv, sp, time);

    // Layer 6: Sea
    color = drawSea(color, uv, sp, time);

    // Layer 7: Water reflections
    if (sp > 0.18) {
        color = addWaterReflections(color, uv, sp, time);
    }

    // Layer 8: Color grading
    color = addColorGrading(color, uv, sp, time);

    return float4(color, 1.0);
}
