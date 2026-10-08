// Builds a ready-to-upload package for CrazyGames (or similar web portals):
//   dist/crazygames/yeti-rush-crazygames.zip  – game with the CrazyGames SDK v3
//   dist/crazygames/cover-*.png               – store cover images
// Run: npm run crazygames
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'dist/crazygames');
const pkg = path.join(out, 'game');
fs.rmSync(out, { recursive: true, force: true });

// 1) Copy the game without PWA bits (portal iframes don't use them).
fs.cpSync(path.join(root, 'game'), pkg, {
  recursive: true,
  filter: (src) => !/(sw\.js|manifest\.webmanifest)$/.test(src),
});
let html = fs.readFileSync(path.join(pkg, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace('<script src="js/util.js"></script>',
    '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  <script src="js/util.js"></script>');
fs.writeFileSync(path.join(pkg, 'index.html'), html);

// 2) Zip with index.html at the archive root.
const zipFile = path.join(out, 'yeti-rush-crazygames.zip');
execFileSync('zip', ['-qr', zipFile, '.'], { cwd: pkg });
console.log('zip', path.relative(root, zipFile), (fs.statSync(zipFile).size / 1e6).toFixed(2) + ' MB');

// 3) Cover images in the portal's common sizes.
const types = { '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
for (const [w, h] of [[1920, 1080], [800, 470], [800, 1200]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`http://localhost:${server.address().port}/tools/cover.html`);
  await page.waitForTimeout(400);
  const f = path.join(out, `cover-${w}x${h}.png`);
  await page.screenshot({ path: f });
  console.log('png', path.relative(root, f));
  await page.close();
}
await browser.close();
server.close();
