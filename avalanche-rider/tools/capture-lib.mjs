// Shared helpers for the build tools: a tiny static server for the game
// folder and a Playwright page that runs the game frame by frame
// (?capture=1) with a seeded Math.random, so captures are reproducible.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

export const gameDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

export function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    const file = path.join(gameDir, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(gameDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function launch() {
  // Use the system Chromium when the bundled one is not installed.
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  return chromium.launch(exe ? { executablePath: exe } : {});
}

// Opens the game in capture mode. `save` pre-seeds the player's progress.
export async function openGame(browser, server, { width, height, seed = 7, save = null, lang = 'en' }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // The store captures never contact the CrazyGames SDK.
  await page.route('https://sdk.crazygames.com/**', (r) => r.abort());
  await page.addInitScript(({ seed, save, lang }) => {
    let a = seed >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Today's gift counts as claimed, so the title screen shows up directly.
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const base = { tutorial: true, settings: { music: true, sfx: true, lang }, gift: { last: today, streak: 1 } };
    localStorage.setItem('avalancheRider.save', JSON.stringify(Object.assign(base, save || {})));
  }, { seed, save, lang });
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/?capture=1`);
  await page.waitForFunction(() => window.AR && AR.UI && AR.UI.current === 'title', null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// Runs the game until `pred` (a function source evaluated in the page with
// `g` = AR.game) is true, or `max` frames pass. Returns whether it matched.
export function runUntil(page, pred, max = 4000) {
  return page.evaluate(({ pred, max }) => {
    const fn = new Function('g', 'return (' + pred + ');');
    const g = AR.game;
    g.noRender = true;
    for (let i = 0; i < max; i++) {
      g.tick(1 / 60);
      if (fn(g)) {
        g.noRender = false;
        g.render();
        return true;
      }
    }
    g.noRender = false;
    return false;
  }, { pred, max });
}

export function step(page, frames, dt = 1 / 60) {
  return page.evaluate(({ frames, dt }) => AR.capture.step(frames, dt), { frames, dt });
}
