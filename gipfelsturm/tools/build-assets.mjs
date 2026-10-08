// Generates every Gipfelsturm brand asset from code (no image files are drawn
// by hand): emblem, logo with outlined wordmark, favicon, app icons (SVG +
// PNG in all sizes), the social preview image and real in-game screenshots.
// Run from the repository root:  node gipfelsturm/tools/build-assets.mjs [--no-shots]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const repo = path.resolve(dir, '..');
const out = (p, s) => {
  fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
  fs.writeFileSync(path.join(dir, p), s);
  console.log('wrote', p);
};

const C = { navy: '#14213d', navy2: '#1d3557', sky1: '#2f6feb', sky2: '#8fd0ff', sun: '#ffd23f', orange: '#ff6b2c', snow: '#f4f8fd', shade: '#c9d9ee', mid: '#3a5a8c' };

const font = opentype.parse(fs.readFileSync(require.resolve('@fontsource/fredoka/files/fredoka-latin-700-normal.woff')).buffer.slice(0));
function textPath(str, size, x0, y0, spacing = 0) {
  let x = x0;
  const parts = [];
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    parts.push(g.getPath(x, y0, size).toPathData(2));
    x += (g.advanceWidth / font.unitsPerEm) * size + spacing;
  }
  return { d: parts.join(' '), width: x - x0 - spacing };
}

// Mountain scene used by emblem and icon (viewBox 0..100).
function scene(id) {
  return `
    <defs>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky1}"/><stop offset="1" stop-color="${C.sky2}"/></linearGradient>
      <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.mid}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#${id}s)"/>
    <circle cx="72" cy="27" r="9" fill="${C.sun}"/>
    <circle cx="72" cy="27" r="13" fill="${C.sun}" opacity=".25"/>
    <path d="M-5 72 L18 50 L28 58 L46 30 L60 46 L68 40 L105 70 L105 105 L-5 105Z" fill="#9cc3ee"/>
    <path d="M-5 80 L24 47 L34 56 L52 24 L74 54 L84 47 L105 64 L105 105 L-5 105Z" fill="url(#${id}m)"/>
    <path d="M52 24 L60.5 36 L56 34.5 L52.5 39 L48.5 34 L44.5 36.5Z M24 47 L29 52.5 L25.5 52 L22 55 L19.5 53Z M84 47 L89 51 L86 51 L83 53.5Z" fill="#fff"/>
    <path d="M-5 92 C20 76 46 92 70 80 C84 73 96 74 105 76 L105 105 L-5 105Z" fill="${C.snow}"/>
    <path d="M-5 92 C20 76 46 92 70 80 C84 73 96 74 105 76" fill="none" stroke="${C.shade}" stroke-width="1.2"/>
    <path d="M30 101 C38 92 54 96 60 88 C64 83 70 82 74 80" fill="none" stroke="${C.orange}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 4.2"/>
    <g transform="translate(75 78) rotate(-18)">
      <rect x="-5" y="2.2" width="11" height="1.2" rx=".6" fill="${C.navy}"/>
      <rect x="-4" y="0.6" width="11" height="1.2" rx=".6" fill="${C.navy}"/>
      <path d="M-1.2 1.5 L0.5 -3.5 L2.6 -3 L2 1.5Z" fill="${C.navy2}"/>
      <path d="M0 -3.4 C0 -6.5 1.2 -8.6 2.8 -8.8 C4.4 -8.6 4.9 -6.6 4.4 -3.4Z" fill="#e63946"/>
      <circle cx="3.2" cy="-10.6" r="1.9" fill="#fff"/>
      <rect x="2.6" y="-11" width="2.6" height="1" rx=".5" fill="${C.navy}"/>
    </g>`;
}

const emblem = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs><clipPath id="ec"><circle cx="60" cy="60" r="53"/></clipPath></defs>
  <circle cx="60" cy="60" r="59" fill="#fff"/>
  <g clip-path="url(#ec)"><g transform="translate(7 7) scale(1.06)">${scene('e')}</g></g>
  <circle cx="60" cy="60" r="54.5" fill="none" stroke="${C.navy}" stroke-width="3"/>
</svg>`;
out('img/emblem.svg', emblem);
out('img/favicon.svg', emblem);

const icon = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g transform="translate(${pad} ${pad}) scale(${(100 - pad * 2) / 100})">${scene('i')}</g>
</svg>`;
out('img/icon.svg', icon(0));
out('img/icon-maskable.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${C.sky1}"/><g transform="translate(10 10) scale(.8)">${scene('m')}</g></svg>`);

// logo: emblem + outlined wordmark
const w1 = textPath('Gipfel', 92, 0, 0);
const w2 = textPath('sturm', 92, w1.width + 2, 0);
const total = w1.width + 2 + w2.width;
const logoW = 130 + total + 20;
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logoW.toFixed(0)} 130">
  <g transform="translate(5 5)">${emblem.replace(/<svg[^>]*>|<\/svg>/g, '')}</g>
  <g transform="translate(138 95)">
    <path d="${w1.d}" fill="${C.navy}"/>
    <path d="${w2.d}" fill="${C.orange}"/>
  </g>
</svg>`;
out('img/logo.svg', logo);

if (process.argv.includes('--svg-only')) process.exit(0);

// ---------- PNG exports and screenshots ----------
async function launch() {
  const opts = {};
  if (fs.existsSync('/opt/pw-browsers')) {
    const d = fs.readdirSync('/opt/pw-browsers').find((x) => /^chromium-\d+$/.test(x));
    if (d) opts.executablePath = path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome');
  }
  opts.args = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
  return chromium.launch(opts);
}

async function png(page, svgFile, outFile, w, h, bg) {
  const svg = fs.readFileSync(path.join(dir, svgFile), 'utf8');
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${bg || 'transparent'}"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="display:block;width:${w}px;height:${h}px;object-fit:contain"></body></html>`);
  await page.waitForTimeout(60);
  fs.mkdirSync(path.dirname(path.join(dir, outFile)), { recursive: true });
  await page.screenshot({ path: path.join(dir, outFile), omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('png', outFile);
}

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    const p = path.join(repo, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(repo) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

const browser = await launch();
const page = await browser.newPage();
for (const s of [1024, 512, 192, 180, 167, 152]) await png(page, 'img/icon.svg', `icons/icon-${s}.png`, s, s, C.sky1);
for (const s of [512, 192]) await png(page, 'img/icon-maskable.svg', `icons/icon-maskable-${s}.png`, s, s, C.sky1);
for (const s of [32, 64]) await png(page, 'img/favicon.svg', `icons/favicon-${s}.png`, s, s);
await png(page, 'img/logo.svg', 'img/logo-1200.png', 1200, Math.round((1200 * 130) / logoW));

if (!process.argv.includes('--no-shots')) {
  const server = await serve();
  const base = `http://localhost:${server.address().port}/gipfelsturm/index.html?nosw=1&notut=1`;
  const shots = [
    { name: 'shot-title', url: base + '&lang=de', w: 1280, h: 800, wait: 5000 },
    { name: 'shot-ride', url: base + '&play=1', w: 1280, h: 800, js: 'shotRide', wait: 2500 },
    { name: 'shot-park', url: base + '&play=1', w: 1280, h: 800, js: 'shotPark', wait: 2500 },
    { name: 'shot-glide', url: base + '&play=1&m=gletscher', w: 1280, h: 800, js: 'shotGlide', wait: 2500 },
    { name: 'shot-night', url: base + '&play=1&m=nordlicht', w: 1280, h: 800, js: 'shotRide', wait: 2500 },
    { name: 'shot-map', url: base + '&play=1', w: 1280, h: 800, js: 'shotMap', wait: 1500 },
    { name: 'shot-mountains', url: base, w: 1280, h: 800, js: 'shotMountains', wait: 1500 },
    { name: 'shot-gear', url: base, w: 1280, h: 800, js: 'shotGear', wait: 2500 },
  ];
  const scripts = {
    shotRide: `(()=>{const g=GS.game,w=g.world;const p=w.pistes.find(pp=>pp.diff!=='green')||w.pistes[0];const q=w.pisteAt(p,p.len*0.35);g.bot=true;g.travelTo(q.x,q.z,Math.atan2(q.tx,q.tz));g.simulate(4);g.bot=false;g.camera.setZoom(0.8);})()`,
    shotPark: `(()=>{const g=GS.game,w=g.world;const k=w.kickers.find(x=>x.tag==='park');g.travelTo(k.x-k.dirx*30,k.z-k.dirz*30,Math.atan2(k.dirx,k.dirz));const p=g.player;p.vx=k.dirx*13;p.vz=k.dirz*13;g.simulate(2.2);if(p.mode==='air'){p.spin=2.6;p.grab=1;p.grabType=0;}g.camera.setZoom(0.55);})()`,
    shotGlide: `(()=>{const g=GS.game,w=g.world;const L=w.launches[0];g.travelTo(L.x,L.z,0);g.player.startGlide(L);g.simulate(5);g.camera.setZoom(0.7);})()`,
    shotMap: `(()=>{GS.game.openMap();})()`,
    shotMountains: `(()=>{GS.settings.unlockAll=true;GS.UI.open('mountains');})()`,
    shotGear: `(()=>{GS.UI.open('gear');})()`,
  };
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, locale: 'de-DE' });
    const p = await ctx.newPage();
    await p.goto(s.url);
    await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await p.evaluate(() => { const t = document.querySelector('#toasts'); if (t) t.style.display = 'none'; });
    await p.evaluate(() => { GS.game.openChallenge = () => {}; });
    if (s.js) await p.evaluate(scripts[s.js]);
    await p.waitForTimeout(s.wait);
    await p.screenshot({ path: path.join(dir, 'img', s.name + '.png') });
    console.log('shot', s.name);
    await ctx.close();
  }
  // social preview: logo over a gameplay screenshot
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const shot = fs.readFileSync(path.join(dir, 'img/shot-ride.png')).toString('base64');
  const lg = fs.readFileSync(path.join(dir, 'img/logo.svg')).toString('base64');
  await og.setContent(`<!doctype html><html><body style="margin:0;width:1200px;height:630px;position:relative;overflow:hidden;font-family:sans-serif">
    <img src="data:image/png;base64,${shot}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.0) 40%,rgba(255,255,255,.85))"></div>
    <img src="data:image/svg+xml;base64,${lg}" style="position:absolute;left:60px;bottom:60px;width:640px"></body></html>`);
  await og.waitForTimeout(150);
  await og.screenshot({ path: path.join(dir, 'img/og-image.png') });
  console.log('png img/og-image.png');
  server.close();
}
await browser.close();
