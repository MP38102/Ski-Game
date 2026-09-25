// Rasterises the brand SVGs into every PNG size the game, the iPad app and
// the website need, and captures real gameplay screenshots for the website.
// Run: npm run render   (needs Playwright's Chromium)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const onlyBrand = process.argv.includes('--brand-only');

async function launch() {
  const opts = {};
  if (fs.existsSync('/opt/pw-browsers/chromium')) {
    const dir = fs.readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d));
    if (dir) opts.executablePath = path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
  }
  try {
    return await chromium.launch(opts);
  } catch (e) {
    return await chromium.launch();
  }
}

async function svgToPng(page, svgFile, outFile, w, h, bg) {
  const svg = fs.readFileSync(path.join(root, svgFile), 'utf8');
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${bg || 'transparent'}">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="display:block;width:${w}px;height:${h}px;object-fit:contain"></body></html>`);
  await page.waitForTimeout(50);
  fs.mkdirSync(path.dirname(path.join(root, outFile)), { recursive: true });
  await page.screenshot({ path: path.join(root, outFile), omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('png', outFile);
}

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

const browser = await launch();
const page = await browser.newPage();

// Brand PNGs
await svgToPng(page, 'brand/logo.svg', 'brand/png/logo-1200.png', 1200, Math.round(1200 * 330 / 800));
for (const s of [1024, 512, 180, 167, 152]) await svgToPng(page, 'brand/icon.svg', `brand/png/icon-${s}.png`, s, s, '#2F6FEB');
for (const s of [512, 192]) await svgToPng(page, 'brand/icon-maskable.svg', `brand/png/icon-maskable-${s}.png`, s, s, '#2F6FEB');
for (const s of [32, 64]) await svgToPng(page, 'brand/favicon.svg', `brand/png/favicon-${s}.png`, s, s);
await svgToPng(page, 'brand/yeti-mark.svg', 'brand/png/yeti-mark-512.png', 512, 512);

if (!onlyBrand) {
  const server = await serve();
  const base = `http://localhost:${server.address().port}`;

  // Gameplay screenshots at iPad resolutions (landscape 11" and portrait)
  const shots = [
    { name: 'shot-title', w: 1194, h: 834, run: false },
    { name: 'shot-play', w: 1194, h: 834, run: true, wait: 5200 },
    { name: 'shot-yeti', w: 1194, h: 834, run: true, yeti: true, wait: 3350, setup: 3000,
      js: '(() => { const g = YR.game; if (g.yeti) { g.yeti.y = g.s.y - 70; g.yeti.x = g.s.x - 60; g.camFrac = 0.45; g.yeti.t = 0; } })()' },
    { name: 'shot-portrait', w: 834, h: 1194, run: true, wait: 4200 },
  ];
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2, locale: 'de-DE' });
    const p = await ctx.newPage();
    await p.goto(`${base}/game/index.html?demo=1${s.yeti ? '&yeti=1' : ''}${s.run ? '&autoplay=1' : ''}`);
    if (s.js) {
      await p.waitForTimeout(s.setup);
      await p.evaluate(s.js);
      await p.waitForTimeout(s.wait - s.setup);
    } else await p.waitForTimeout(s.wait || 1500);
    fs.mkdirSync(path.join(root, 'website/img'), { recursive: true });
    await p.screenshot({ path: path.join(root, `website/img/${s.name}.png`) });
    console.log('png website/img/' + s.name + '.png');
    await ctx.close();
  }
  // Open Graph / social card rendered from HTML
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto(`${base}/tools/og-card.html`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(root, 'brand/png/og-image.png') });
  console.log('png brand/png/og-image.png');

  server.close();
}

await browser.close();
