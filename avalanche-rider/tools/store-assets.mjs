// Renders the CrazyGames submission media from the real game:
//   store/cover-landscape-1920x1080.png, cover-portrait-800x1200.png,
//   cover-square-800x800.png, screenshots (1920x1080) and the two silent
//   18-second preview videos (landscape 1920x1080, portrait 1080x1620 = 2:3).
// Needs ffmpeg on the PATH.
// Run from the repository root:
//   node avalanche-rider/tools/store-assets.mjs [--no-video] [--only=<part of a file name>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gameDir, serve, launch, openGame, runUntil, step } from './capture-lib.mjs';

const outDir = path.join(gameDir, 'store');
fs.mkdirSync(outDir, { recursive: true });
const noVideo = process.argv.includes('--no-video');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const want = (file) => !only || file.includes(only);

const SAVE = {
  coins: 2450,
  best: 18240,
  bestDist: 1630,
  runs: 14,
  owned: { riders: ['rookie', 'glacier', 'lumberjack'], boards: ['plank', 'flame'], trails: ['powder', 'stardust'] },
  eq: { rider: 'rookie', board: 'flame', trail: 'stardust' },
  up: { magnet: 2, shield: 1, balance: 1 },
  missions: { level: 2, rank: 3, active: [], totals: {} },
};

const server = await serve();
const browser = await launch();

async function startRun(page, todStart) {
  await page.evaluate((tod) => {
    AR.UI.play();
    AR.game.autopilot = true;
    AR.game.todStart = tod;
  }, todStart);
}

// Freeze the current frame with a hand-placed camera (covers).
async function frame(page, o) {
  await page.evaluate((o) => {
    const g = AR.game;
    const r = g.rider;
    if (o.avBehind != null) g.avalanche.x = r.x - o.avBehind;
    if (o.tod != null) {
      // Shift the cycle so the ride continues from this time of day.
      g.todStart = o.tod - (r.x - g.world.startX) / AR.PHYS.PX_PER_M / 4000;
      g.tod = o.tod;
    }
    if (o.snow != null) g.snowfall = o.snow;
    g.danger = o.danger || 0;
    g.popups = [];
    g.shake = 0;
    g.flash = 0;
    g.cam.scale = g.renderer.baseScale() * o.zoom;
    g.cam.x = r.x + o.dx / g.cam.scale;
    g.cam.y = r.y + o.dy / g.cam.scale;
    g.render();
  }, o);
}

async function hideUi(page) {
  await page.evaluate(() => {
    for (const id of ['hud', 'hint', 'toast']) document.getElementById(id).classList.add('hidden');
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  });
}

async function addLogo(page, css) {
  await page.evaluate((css) => {
    const box = document.createElement('div');
    box.id = 'cover-logo';
    box.innerHTML = '<h1 class="logo"><span class="l1">Avalanche</span><span class="l2">Rider</span></h1>';
    box.setAttribute('style', 'position:fixed;z-index:50;pointer-events:none;' + css);
    document.body.appendChild(box);
  }, css);
}

// Scene: the rider spinning over a crevasse.
const GAP_FLIP = 'g.rider.mode === "air" && g.rider.spinning && g.rider.airRot < -1.6 && g.world.gapAt(g.rider.x - 80) && g.stats.dist > 250';

async function setupCover(page, o) {
  await startRun(page, o.tod);
  if (!(await runUntil(page, GAP_FLIP, 60 * 150))) return false;
  await page.addStyleTag({ content: '#hud, #hint, #toast { display: none !important; }' });
  await hideUi(page);
  await frame(page, o);
  await addLogo(page, o.logo);
  return true;
}

// A seed whose cover scene exists and whose ride stays crash-free for the
// length of the preview video that starts from it.
async function findSeed(width, height, o, seconds) {
  for (let seed = o.seed; seed < o.seed + 40; seed++) {
    const page = await openGame(browser, server, { width, height, seed, save: SAVE });
    let ok = await setupCover(page, o);
    if (ok) {
      ok = await page.evaluate((n) => {
        const g = AR.game;
        g.noRender = true;
        for (let i = 0; i < n; i++) {
          g.tick(1 / 60);
          if (g.state !== 'run') return false;
        }
        return true;
      }, seconds * 60 + 20);
    }
    await page.close();
    if (ok) return seed;
  }
  throw new Error('no usable seed for the cover/video scene');
}

const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

// The CrazyGames preview video has to start on the exact cover image, so the
// cover is the video's first frame; the logo then fades out while the run
// continues in real time (no speed-up), silent, without HUD.
async function coverAndVideo({ width, height, seed, o, coverFile, coverSize, videoFile, seconds }) {
  if (!want(coverFile) && !(videoFile && want(videoFile))) return;
  const page = await openGame(browser, server, { width, height, seed, save: SAVE });
  if (!(await setupCover(page, o))) throw new Error('scene vanished for seed ' + seed);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-capture-'));
  const first = path.join(tmp, '00000.png');
  await page.screenshot({ path: first });
  if (want(coverFile)) {
    const dest = path.join(outDir, coverFile);
    if (coverSize) ffmpeg(['-i', first, '-vf', `scale=${coverSize}:flags=lanczos`, dest]);
    else fs.copyFileSync(first, dest);
    console.log('wrote', coverFile, '(seed ' + seed + ')');
  }
  if (videoFile && want(videoFile) && !noVideo) {
    const fps = 30;
    for (let f = 1; f < seconds * fps; f++) {
      await page.evaluate((f) => {
        AR.capture.step(2, 1 / 60);
        const logo = document.getElementById('cover-logo');
        if (logo) logo.style.opacity = String(Math.max(0, 1 - f / 14));
      }, f);
      await page.screenshot({ path: path.join(tmp, String(f).padStart(5, '0') + '.png') });
    }
    ffmpeg(['-framerate', String(fps), '-i', path.join(tmp, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-crf', '21', '-preset', 'slow', '-movflags', '+faststart', '-an', path.join(outDir, videoFile)]);
    console.log('wrote', videoFile, '(seed ' + seed + ')');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  await page.close();
}

const VIDEO_SECONDS = 18;
const LANDSCAPE = {
  seed: 11, tod: 0.47, zoom: 1.12, dx: 300, dy: 230, avBehind: 160, danger: 0, snow: 0.25,
  logo: 'right:70px;top:70px;transform:scale(1.55);transform-origin:top right;',
};
// Portrait media share the 2:3 ratio: video 1080x1620, cover 800x1200.
const PORTRAIT = {
  seed: 11, tod: 0.47, zoom: 1.45, dx: 90, dy: 170, avBehind: 140, danger: 0, snow: 0.25,
  logo: 'left:0;right:0;top:94px;display:flex;justify-content:center;transform:scale(1.31);transform-origin:top center;',
};
const SQUARE = {
  seed: 11, tod: 0.47, zoom: 1.35, dx: 110, dy: 140, avBehind: 140, danger: 0, snow: 0.25,
  logo: 'left:0;right:0;top:46px;display:flex;justify-content:center;transform:scale(1.05);transform-origin:top center;',
};

if (['cover-landscape-1920x1080.png', 'preview-landscape-1920x1080.mp4', 'cover-square-800x800.png'].some(want)) {
  const seed = await findSeed(1920, 1080, LANDSCAPE, VIDEO_SECONDS);
  await coverAndVideo({ width: 1920, height: 1080, seed, o: LANDSCAPE, coverFile: 'cover-landscape-1920x1080.png', videoFile: 'preview-landscape-1920x1080.mp4', seconds: VIDEO_SECONDS });
  if (want('cover-square-800x800.png')) {
    const page = await openGame(browser, server, { width: 800, height: 800, seed, save: SAVE });
    await setupCover(page, SQUARE);
    await page.screenshot({ path: path.join(outDir, 'cover-square-800x800.png') });
    await page.close();
    console.log('wrote cover-square-800x800.png (seed ' + seed + ')');
  }
}
if (['cover-portrait-800x1200.png', 'preview-portrait-1080x1620.mp4'].some(want)) {
  const seed = await findSeed(1080, 1620, PORTRAIT, VIDEO_SECONDS);
  await coverAndVideo({ width: 1080, height: 1620, seed, o: PORTRAIT, coverFile: 'cover-portrait-800x1200.png', coverSize: '800:1200', videoFile: 'preview-portrait-1080x1620.mp4', seconds: VIDEO_SECONDS });
}

// ---------- gameplay screenshots (HUD visible) ----------
async function shot(file, o) {
  if (!want(file)) return;
  for (let seed = o.seed; seed < o.seed + 30; seed++) {
    const page = await openGame(browser, server, { width: 1920, height: 1080, seed, save: SAVE, lang: o.lang || 'en' });
    await startRun(page, o.tod);
    const ok = await runUntil(page, o.until, 60 * 200);
    if (!ok) {
      await page.close();
      continue;
    }
    if (o.after) await page.evaluate(o.after);
    await step(page, o.settle || 0);
    await page.screenshot({ path: path.join(outDir, file) });
    await page.close();
    console.log('wrote', file, '(seed ' + seed + ')');
    return;
  }
  throw new Error('no usable scene for ' + file);
}

await shot('screenshot-1-backflip.png', { seed: 21, tod: 0.3, until: 'g.rider.mode === "air" && g.rider.spinning && g.rider.airRot < -3 && g.mult > 1 && g.stats.dist > 400' });
await shot('screenshot-2-crevasse.png', { seed: 31, tod: 0.5, until: GAP_FLIP, after: '(() => { const g = AR.game; g.avalanche.x = g.rider.x - 520; })()', settle: 2 });
await shot('screenshot-3-grind.png', { seed: 41, tod: 0.52, until: 'g.rider.mode === "rail" && g.rider.railTime > 0.35' });
await shot('screenshot-4-night.png', { seed: 51, tod: 0.74, until: 'g.rider.mode === "air" && g.rider.airTime > 0.45 && g.stats.dist > 300' });
await shot('screenshot-5-avalanche.png', {
  seed: 61, tod: 0.06,
  until: 'g.stats.dist > 200 && g.rider.mode === "ground" && g.rider.v > 520',
  after: '(() => { const g = AR.game; g.avalanche.x = g.rider.x - 330; })()', settle: 8,
});

// ---------- menu screenshots ----------
if (['screenshot-6-title.png', 'screenshot-7-shop.png'].some(want)) {
  const page = await openGame(browser, server, { width: 1920, height: 1080, seed: 3, save: SAVE });
  await page.evaluate(() => {
    const a = AR.Progress.data.missions.active;
    a[0].progress = Math.round(a[0].target * 0.6);
    a[1].progress = a[1].target;
    a[1].done = true;
    AR.game.todStart = 0.3;
    AR.UI.show('title');
  });
  await step(page, 150);
  await page.screenshot({ path: path.join(outDir, 'screenshot-6-title.png') });
  console.log('wrote screenshot-6-title.png');
  await page.evaluate(() => AR.UI.open('shop'));
  await page.screenshot({ path: path.join(outDir, 'screenshot-7-shop.png') });
  console.log('wrote screenshot-7-shop.png');
  await page.close();
}

await browser.close();
server.close();
