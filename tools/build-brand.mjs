// Generates every Yeti Rush brand asset from code:
//   brand/*.svg  – logo, wordmark, yeti mark, app icon
// The wordmark text is converted to outlines with opentype.js so the SVGs do
// not depend on installed fonts. Run: npm run brand
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = (p, s) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), s);
  console.log('wrote', p);
};

const C = {
  navy: '#1B3A5C',
  navyDeep: '#10263F',
  orange: '#FF6B2C',
  orangeDark: '#D9491A',
  sky1: '#8EDBFF',
  sky2: '#2F6FEB',
  snow: '#F7FBFF',
  shade: '#C8DAEE',
  face: '#6FB6E8',
  red: '#E63946',
};

const fontPath = require.resolve('@fontsource/fredoka/files/fredoka-latin-700-normal.woff');
const font = opentype.parse(fs.readFileSync(fontPath).buffer.slice(0));

function textPath(str, size, letterSpacing = 0) {
  let x = 0;
  const parts = [];
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    const p = g.getPath(x, 0, size);
    parts.push(p.toPathData(2));
    x += (g.advanceWidth / font.unitsPerEm) * size + letterSpacing;
  }
  const bb = font.getPath(str, 0, 0, size).getBoundingBox();
  return { d: parts.join(' '), width: x - letterSpacing, bb };
}

// Jagged fur outline around an ellipse (deterministic).
function furPath(cx, cy, rx, ry, spikes, jag, startAngle = -Math.PI) {
  let d = '';
  const n = spikes * 2;
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (i / n) * Math.PI * 2;
    const r = i % 2 ? 1 : 1 + jag;
    const x = cx + Math.cos(a) * rx * r;
    const y = cy + Math.sin(a) * ry * r;
    d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return d + 'Z';
}

// The yeti head, designed on a 200×200 grid.
function yetiHead({ look = 6, outline = 7 } = {}) {
  return `
  <g class="yeti">
    <path d="M72 34 L78 6 L94 28 L104 0 L112 28 L128 8 L130 36Z" fill="${C.snow}" stroke="${C.navy}" stroke-width="${outline}" stroke-linejoin="round"/>
    <path d="${furPath(100, 105, 86, 80, 22, 0.1)}" fill="${C.snow}" stroke="${C.navy}" stroke-width="${outline}" stroke-linejoin="round"/>
    <path d="${furPath(104, 110, 80, 74, 22, 0.1)}" fill="${C.shade}" opacity=".7"/>
    <path d="${furPath(98, 102, 80, 74, 22, 0.1)}" fill="${C.snow}"/>
    <path d="M72 34 L78 6 L94 28 L104 0 L112 28 L128 8 L130 36Z" fill="${C.snow}"/>
    <ellipse cx="100" cy="116" rx="60" ry="50" fill="${C.face}"/>
    <ellipse cx="100" cy="128" rx="52" ry="34" fill="#5AA3D8" opacity=".35"/>
    <path d="M52 86 Q70 76 90 94" stroke="${C.navy}" stroke-width="11" stroke-linecap="round" fill="none"/>
    <path d="M148 86 Q130 76 110 94" stroke="${C.navy}" stroke-width="11" stroke-linecap="round" fill="none"/>
    <circle cx="76" cy="106" r="14" fill="#fff"/>
    <circle cx="124" cy="106" r="14" fill="#fff"/>
    <circle cx="${76 + look}" cy="108" r="7" fill="${C.navyDeep}"/>
    <circle cx="${124 + look}" cy="108" r="7" fill="${C.navyDeep}"/>
    <circle cx="${73 + look}" cy="104" r="2.5" fill="#fff"/>
    <circle cx="${121 + look}" cy="104" r="2.5" fill="#fff"/>
    <path d="M70 132 Q100 124 130 132 Q128 164 100 166 Q72 164 70 132Z" fill="${C.navyDeep}"/>
    <path d="M78 131 L85 146 L92 129Z" fill="#fff"/>
    <path d="M122 131 L115 146 L108 129Z" fill="#fff"/>
    <path d="M86 156 Q100 148 114 156 Q100 164 86 156Z" fill="${C.red}"/>
  </g>`;
}

// ---- Yeti mark (square, transparent) -------------------------------------
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <title>Yeti Rush – Yeti</title>${yetiHead()}
</svg>`;
out('brand/yeti-mark.svg', mark);

// ---- Wordmark --------------------------------------------------------------
const yeti = textPath('YETI', 120, 4);
const rush = textPath('RUSH', 120, 4);
const gap = 34;
const wmW = yeti.width + gap + rush.width;
function wordmarkGroup() {
  const base = 118;
  const stroke = (d, fill, dx = 0) => `
    <path d="${d}" transform="translate(${dx + 7} ${base + 9})" fill="${C.navyDeep}" stroke="${C.navyDeep}" stroke-width="22" stroke-linejoin="round"/>
    <path d="${d}" transform="translate(${dx} ${base})" fill="${fill}" stroke="${C.navy}" stroke-width="18" stroke-linejoin="round" paint-order="stroke"/>`;
  return `
  <g transform="skewX(-9) translate(28 0)">
    ${stroke(yeti.d, '#FFFFFF', 0)}
    ${stroke(rush.d, C.orange, yeti.width + gap)}
    <path d="${rush.d}" transform="translate(${yeti.width + gap} ${base})" fill="url(#rushShine)"/>
  </g>`;
}
const defs = `
  <defs>
    <linearGradient id="rushShine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFB38A" stop-opacity=".0"/>
      <stop offset=".5" stop-color="#FFB38A" stop-opacity="0"/>
      <stop offset=".5" stop-color="${C.orangeDark}" stop-opacity=".35"/>
      <stop offset="1" stop-color="${C.orangeDark}" stop-opacity=".35"/>
    </linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.sky1}"/>
      <stop offset="1" stop-color="${C.sky2}"/>
    </linearGradient>
    <linearGradient id="peak" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D5E6F7"/>
    </linearGradient>
  </defs>`;
const wmWidth = Math.ceil(wmW + 90);
const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -8 ${wmWidth} 160" width="${wmWidth}" height="160">
  <title>Yeti Rush</title>${defs}${wordmarkGroup()}
</svg>`;
out('brand/wordmark.svg', wordmark);

// ---- Full logo: yeti peeking over the wordmark ---------------------------
const logoW = wmWidth;
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logoW} 330" width="${logoW}" height="330">
  <title>Yeti Rush</title>${defs}
  <g transform="translate(${logoW / 2 - 104} 8) scale(1.04)">${yetiHead()}</g>
  <g transform="translate(0 176)">${wordmarkGroup()}</g>
</svg>`;
out('brand/logo.svg', logo);

// ---- App icon (1024, no transparency, iOS applies the mask) -------------
function snowflakes(n, seed, w, h, maxR) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let d = '';
  for (let i = 0; i < n; i++) {
    d += `<circle cx="${(r() * w).toFixed(0)}" cy="${(r() * h).toFixed(0)}" r="${(2 + r() * maxR).toFixed(1)}"/>`;
  }
  return d;
}
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>Yeti Rush App Icon</title>${defs}
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <g fill="#fff" opacity=".55">${snowflakes(40, 7, 1024, 560, 7)}</g>
  <path d="M-40 760 L240 430 L380 560 L560 330 L1064 800 L1064 1064 L-40 1064Z" fill="#B9D7F2"/>
  <path d="M560 330 L700 460 L640 450 L610 500 L560 440 L520 490 L480 450Z" fill="#fff"/>
  <path d="M240 430 L310 500 L270 495 L240 530 L210 480Z" fill="#fff"/>
  <g transform="translate(172 250) scale(3.4)">${yetiHead({ look: 8 })}</g>
  <path d="M-20 900 Q 300 760 560 860 T 1060 820 L1060 1060 L-20 1060Z" fill="#fff"/>
  <path d="M-20 905 Q 300 765 560 865 T 1060 825" fill="none" stroke="#D5E6F7" stroke-width="10"/>
  <g fill="none" stroke="${C.orange}" stroke-width="18" stroke-linecap="round">
    <path d="M120 1000 Q 420 880 720 960"/>
    <path d="M150 1030 Q 440 915 740 995" stroke-opacity=".7"/>
  </g>
</svg>`;
out('brand/icon.svg', icon);

// Maskable / favicon variant: yeti on circle-safe background.
const iconMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>Yeti Rush</title>${defs}
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <g transform="translate(222 232) scale(2.9)">${yetiHead({ look: 6 })}</g>
</svg>`;
out('brand/icon-maskable.svg', iconMaskable);

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="64" height="64">
  <title>Yeti Rush</title>${defs}
  <rect width="200" height="200" rx="44" fill="url(#sky)"/>
  <g transform="translate(10 12) scale(.9)">${yetiHead()}</g>
</svg>`;
out('brand/favicon.svg', favicon);
