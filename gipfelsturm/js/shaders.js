'use strict';
// GLSL ES 3.00 shaders. Lighting model: sun (lambert + PCF shadow map),
// hemisphere sky/ground ambient, exponential-squared distance fog.
(function (GS) {
  const LIGHT = `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGndCol;
uniform vec3 uFogCol;
uniform float uFogDen;
uniform vec3 uCamPos;
uniform float uNight;
uniform mediump sampler2DShadow uShadow;
uniform mat4 uShadowMat;
uniform float uShadowTexel;
uniform float uShadowOn;
uniform vec4 uLamps[12];
uniform float uLampOn;

float shadowAt(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sp = uShadowMat * vec4(wp + n * 0.12, 1.0);
  vec3 c = sp.xyz * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  float z = c.z - 0.0012;
  float t = uShadowTexel;
  float s = texture(uShadow, vec3(c.xy + vec2(-0.6, -0.6) * t, z));
  s += texture(uShadow, vec3(c.xy + vec2(0.6, -0.6) * t, z));
  s += texture(uShadow, vec3(c.xy + vec2(-0.6, 0.6) * t, z));
  s += texture(uShadow, vec3(c.xy + vec2(0.6, 0.6) * t, z));
  float e = smoothstep(0.0, 0.06, min(min(c.x, 1.0 - c.x), min(c.y, 1.0 - c.y)));
  return mix(1.0, s * 0.25, e);
}

vec3 lampLight(vec3 wp) {
  vec3 acc = vec3(0.0);
  if (uLampOn < 0.01) return acc;
  for (int i = 0; i < 12; i++) {
    vec3 d = uLamps[i].xyz - wp;
    float dd = dot(d, d);
    acc += uLamps[i].w / (1.0 + dd * 0.06) * smoothstep(420.0, 80.0, dd);
  }
  return acc * vec3(1.0, 0.78, 0.5) * uLampOn;
}

vec3 lightIt(vec3 alb, vec3 n, float sh) {
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 amb = mix(uGndCol, uSkyCol, n.y * 0.5 + 0.5);
  return alb * (amb + uSunCol * ndl * sh);
}

vec3 fogIt(vec3 c, vec3 wp) {
  vec3 x = max(c - 0.8, 0.0);
  c = min(c, 0.8 + x / (1.0 + x * 2.5));
  float d = length(wp - uCamPos) * uFogDen;
  float f = 1.0 - exp(-d * d);
  return mix(c, uFogCol, clamp(f, 0.0, 1.0));
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
`;

  const OBJ_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aI0;
layout(location=4) in vec4 aI1;
uniform mat4 uVP;
uniform float uTime;
uniform float uWind;
out vec3 vWP;
out vec3 vN;
out vec4 vCol;
out float vSnow;
void main() {
  float c = cos(aI0.w), s = sin(aI0.w);
  vec3 p = aPos * aI1.xyz;
  if (aCol.a > 0.5 && aCol.a < 1.5 && aPos.y > 1.5) {
    float sway = sin(uTime * 1.7 + aI0.x * 0.37 + aI0.z * 0.23) * uWind * 0.02 * (aPos.y - 1.5);
    p.x += sway;
  }
  vec3 wp = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) + aI0.xyz;
  vec3 n = aNor / aI1.xyz;
  n = normalize(vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c));
  vWP = wp;
  vN = n;
  vCol = aCol;
  vSnow = aI1.w;
  gl_Position = uVP * vec4(wp, 1.0);
}`;

  const OBJ_FS = `#version 300 es
precision highp float;
${LIGHT}
uniform vec3 uSnowCol;
in vec3 vWP;
in vec3 vN;
in vec4 vCol;
in float vSnow;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 alb = vCol.rgb;
  float kind = vCol.a;
  if (kind > 1.75) {
    // emissive (2) or night window (3)
    vec3 c = alb;
    if (kind > 2.5) {
      float sh = shadowAt(vWP, n);
      c = mix(lightIt(alb * 0.55, n, sh), alb * 1.25, uNight);
    }
    outColor = vec4(fogIt(c, vWP), 1.0);
    return;
  }
  if (kind > 0.5) {
    float j = (hash3(floor(vWP * 1.7)) - 0.5) * 0.28;
    float cover = smoothstep(0.66, 0.8, n.y + j * 0.5) * vSnow;
    alb = mix(alb, uSnowCol, cover);
  }
  float sh = shadowAt(vWP, n);
  vec3 c = lightIt(alb, n, sh) + alb * lampLight(vWP);
  outColor = vec4(fogIt(c, vWP), 1.0);
}`;

  const TER_FS = `#version 300 es
precision highp float;
${LIGHT}
uniform float uTime;
in vec3 vWP;
in vec3 vN;
in vec4 vCol;
in float vSnow;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 alb = vCol.rgb;
  float groomed = vCol.a;
  // wind-blown ripples in the powder (fade out with distance)
  float camD = length(uCamPos - vWP);
  float rip = (1.0 - groomed) * (1.0 - smoothstep(60.0, 160.0, camD));
  if (rip > 0.0) {
    vec2 q = vWP.xz;
    float px = cos(q.x * 0.55 + sin(q.y * 0.21) * 2.2) * 0.55 + cos(q.x * 1.7 + q.y * 0.6) * 0.25;
    float pz = cos(q.y * 0.62 + sin(q.x * 0.27) * 2.4) * 0.62 + cos(q.y * 1.9 - q.x * 0.5) * 0.22;
    n = normalize(n + vec3(px, 0.0, pz) * 0.11 * rip);
  }
  // corduroy of groomed pistes, faded out with distance to avoid aliasing
  float fw = fwidth(vWP.x * 3.2);
  float cord = sin(vWP.x * 20.0 + sin(vWP.z * 0.07) * 4.0);
  alb *= 1.0 - groomed * 0.026 * (0.5 + 0.5 * cord) * (1.0 - smoothstep(0.25, 0.7, fw));
  float sh = shadowAt(vWP, n);
  vec3 c = lightIt(alb, n, sh) + alb * lampLight(vWP);
  // glitter on sunlit snow
  float lum = dot(alb, vec3(0.333));
  if (lum > 0.8) {
    float g = hash3(floor(vWP * 22.0));
    vec3 v = normalize(uCamPos - vWP);
    float spec = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 3.0);
    float fade = 1.0 - smoothstep(20.0, 60.0, length(uCamPos - vWP));
    c += step(0.9985, g) * sh * spec * fade * uSunCol * 0.9;
  }
  outColor = vec4(fogIt(c, vWP), 1.0);
}`;

  const DEPTH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=3) in vec4 aI0;
layout(location=4) in vec4 aI1;
uniform mat4 uVP;
void main() {
  float c = cos(aI0.w), s = sin(aI0.w);
  vec3 p = aPos * aI1.xyz;
  vec3 wp = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) + aI0.xyz;
  gl_Position = uVP * vec4(wp, 1.0);
}`;

  const DEPTH_FS = `#version 300 es
precision mediump float;
void main() {}`;

  // Ski tracks: a strip per rider; u in [0,1] across, w = birth time, kind
  const TRACK_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aData;
uniform mat4 uVP;
out vec3 vData;
out vec3 vWP;
void main() {
  vData = aData;
  vWP = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

  const TRACK_FS = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec3 uTrackCol;
uniform vec3 uFogCol;
uniform float uFogDen;
uniform vec3 uCamPos;
in vec3 vData;
in vec3 vWP;
out vec4 outColor;
void main() {
  float u = vData.x;
  float age = uTime - vData.y;
  float kind = vData.z;
  float fade = 1.0 - smoothstep(420.0, 600.0, age);
  float a;
  if (kind < 0.5) {
    // two ski grooves
    float d = min(abs(u - 0.25), abs(u - 0.75));
    a = 1.0 - smoothstep(0.07, 0.17, d);
  } else if (kind < 1.5) {
    // snowboard / wide powder trench
    a = 1.0 - smoothstep(0.32, 0.5, abs(u - 0.5));
  } else {
    // footprints / glide trail
    a = (1.0 - smoothstep(0.2, 0.5, abs(u - 0.5))) * 0.6;
  }
  float d = length(vWP - uCamPos) * uFogDen;
  float f = exp(-d * d);
  outColor = vec4(uTrackCol, a * fade * 0.3 * f);
}`;

  const PART_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in float aSize;
uniform mat4 uVP;
uniform float uPxScale;
out vec4 vCol;
void main() {
  vCol = aCol;
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = clamp(aSize * uPxScale / gl_Position.w, 1.0, 256.0);
}`;

  const PART_FS = `#version 300 es
precision mediump float;
in vec4 vCol;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = dot(p, p) * 4.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vCol.a;
  if (a < 0.01) discard;
  outColor = vec4(vCol.rgb, a);
}`;

  // Falling snow: positions wrap around the camera inside a box.
  const SNOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
uniform mat4 uVP;
uniform vec3 uCenter;
uniform float uTime;
uniform vec3 uFall;
uniform float uBox;
uniform float uPxScale;
uniform float uCount;
out float vA;
void main() {
  vec3 p = aSeed.xyz * uBox + uFall * uTime * (0.7 + aSeed.w * 0.6);
  p.x += sin(uTime * 1.3 + aSeed.w * 30.0) * 0.6;
  p = mod(p - uCenter + uBox * 0.5, uBox) + uCenter - uBox * 0.5;
  gl_Position = uVP * vec4(p, 1.0);
  float vis = step(aSeed.w, uCount);
  gl_PointSize = vis * clamp((0.06 + aSeed.w * 0.05) * uPxScale / gl_Position.w, 1.0, 14.0);
  vA = vis * (0.55 + aSeed.w * 0.45);
}`;

  const SNOW_FS = `#version 300 es
precision mediump float;
in float vA;
uniform vec3 uFlakeCol;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a = (1.0 - smoothstep(0.1, 0.5, length(p))) * vA;
  if (a < 0.02) discard;
  outColor = vec4(uFlakeCol, a);
}`;

  // Additive glow markers (challenge rings, collectibles, lamps).
  const GLOW_FS = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec3 uFogCol;
uniform float uFogDen;
uniform vec3 uCamPos;
in vec3 vWP;
in vec3 vN;
in vec4 vCol;
in float vSnow;
out vec4 outColor;
void main() {
  float d = length(vWP - uCamPos) * uFogDen;
  float f = exp(-d * d);
  float pulse = 0.75 + 0.25 * sin(uTime * 4.0 + vWP.y * 2.0);
  outColor = vec4(vCol.rgb * pulse * f, 1.0);
}`;

  GS.Shaders = { OBJ_VS, OBJ_FS, TER_FS, DEPTH_VS, DEPTH_FS, TRACK_VS, TRACK_FS, PART_VS, PART_FS, SNOW_VS, SNOW_FS, GLOW_FS };
})(window.GS);
