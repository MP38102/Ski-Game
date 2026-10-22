// Integration tests for the CrazyGames SDK wiring and core game rules, run
// against a mock SDK in headless Chromium.
// Run from the repository root:  node avalanche-rider/tools/test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { gameDir, serve, launch } from './capture-lib.mjs';

const MOCK = fs.readFileSync(path.join(gameDir, 'tools', 'sdk-mock.js'), 'utf8');
const server = await serve();
const browser = await launch();
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
async function open(mode) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let mock = MOCK;
  if (mode === 'disabled') mock = mock.replace("environment: 'local'", "environment: 'disabled'");
  if (mode === 'none') await page.route('https://sdk.crazygames.com/**', (r) => r.abort());
  else await page.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: mock }));
  await page.goto(`http://127.0.0.1:${server.address().port}/?capture=1`);
  await page.waitForFunction(() => window.AR && AR.UI && AR.UI.current === 'title', null, { timeout: 15000 });
  page.errors = errors;
  return page;
}
const calls = (p) => p.evaluate(() => (window.__cg ? window.__cg.calls.slice() : []));
const clear = (p) => p.evaluate(() => { if (window.__cg) window.__cg.calls.length = 0; });
const crash = (p, dist) => p.evaluate((d) => { AR.game.stats.dist = Math.max(AR.game.stats.dist, d); AR.game.rider.crash('rock'); AR.capture.step(45); return AR.game.state; }, dist);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- local env with SDK ----
let p = await open('local');
let c = await calls(p);
check('boot order init→loadingStart→loadingStop', c.join(',') === 'init,loadingStart,loadingStop', c.join(','));
await clear(p);
await p.evaluate(() => { AR.UI.play(); AR.capture.step(30); });
check('run start → gameplayStart', (await calls(p)).join(',') === 'gameplayStart');
await p.evaluate(() => { AR.game.pause(); AR.game.resume(); });
check('pause/resume → stop/start', (await calls(p)).join(',') === 'gameplayStart,gameplayStop,gameplayStart');
await clear(p);
let st = await crash(p, 400);
check('crash → continue offered', st === 'continue' && (await p.evaluate(() => AR.UI.current)) === 'continue', st);
check('crash → gameplayStop', (await calls(p)).includes('gameplayStop'));
await clear(p);
await p.evaluate(() => { window.__adSeen = []; AR.Platform.onAd((on) => window.__adSeen.push(on)); AR.game.acceptContinue(); });
await wait(50);
check('rewarded requested, ad playing pauses game', (await calls(p)).includes('requestAd:rewarded') && (await p.evaluate(() => AR.Platform.adPlaying)));
await wait(400);
st = await p.evaluate(() => { AR.capture.step(5); return AR.game.state; });
check('after rewarded → revived & gameplayStart', st === 'run' && (await calls(p)).includes('gameplayStart'), (await calls(p)).join(','));
check('ad start/stop events mute/unmute', JSON.stringify(await p.evaluate(() => window.__adSeen)) === '[true,false]');
st = await crash(p, 500);
check('second crash → no second continue', st === 'over', st);
check('double coins button visible when coins > 0', await p.evaluate(() => !document.getElementById('btn-double').classList.contains('hidden') || AR.game.stats.coins === 0));
await p.evaluate(() => { AR.game.stats.coins = Math.max(1, AR.game.stats.coins); });
const before = await p.evaluate(() => AR.Progress.data.coins);
await p.evaluate(() => AR.game.doubleCoins());
await wait(400);
const after = await p.evaluate(() => AR.Progress.data.coins);
const runCoins = await p.evaluate(() => AR.game.stats.coins);
check('double coins grants run coins once', after - before === runCoins, `${before}→${after} (+${runCoins})`);
await clear(p);
await p.evaluate(() => AR.UI.again());
await wait(100);
check('first game over of session → no midgame', !(await calls(p)).includes('requestAd:midgame'), (await calls(p)).join(','));
await p.evaluate(() => AR.capture.step(10));
st = await crash(p, 100);
check('short run (<150 m) → no continue', st === 'over', st);
await clear(p);
await p.evaluate(() => AR.UI.again());
await wait(500);
check('second game over → midgame before next run', (await calls(p)).includes('requestAd:midgame'), (await calls(p)).join(','));
await p.evaluate(() => AR.capture.step(5));
check('after midgame → running', (await p.evaluate(() => AR.game.state)) === 'run');
// ad error path
await p.evaluate(() => { window.__cg.adMode = 'error'; });
st = await crash(p, 400);
check('third run crash → continue offered again (new run)', st === 'continue', st);
await p.evaluate(() => AR.game.acceptContinue());
await wait(300);
st = await p.evaluate(() => AR.game.state);
const toast = await p.evaluate(() => document.getElementById('toast').textContent);
check('rewarded error → game over + toast, no revive', st === 'over' && /No video/.test(toast), st + ' / ' + toast);
// SDK never answers → game moves on after the timeout
await p.evaluate(() => { window.__cg.adMode = 'hang'; AR.UI.show(null); AR.game.startRun(); AR.capture.step(10); });
st = await crash(p, 400);
check('fourth run crash → continue offered', st === 'continue', st);
await p.evaluate(() => AR.game.acceptContinue());
await wait(10600);
st = await p.evaluate(() => AR.game.state);
check('SDK silent → after 10 s back to results', st === 'over', st);
check('continue button not pre-focused', await p.evaluate(() => document.activeElement && document.activeElement.id !== 'btn-continue'));
// mute from website
await p.evaluate(() => { window.CrazyGames.SDK.game.settings.muteAudio = true; window.__cg.listeners.forEach((f) => f()); AR.UI.open('settings'); });
check('website mute shown & toggles locked', await p.evaluate(() => !document.getElementById('muted-note').classList.contains('hidden') && document.getElementById('set-music').disabled));
// save via data module
const saved = await p.evaluate(() => { const raw = window.__cg.store['avalancheRider.save']; return raw && JSON.parse(raw).runs; });
check('progress saved through SDK data module', saved >= 3, 'runs=' + saved);
await p.evaluate(() => { AR.Progress.data.coins = 0; AR.Progress.load(); });
check('progress loads from data module', (await p.evaluate(() => AR.Progress.data.runs)) >= 3);
check('no page errors', p.errors.length === 0, p.errors.join(' | '));
await p.close();

// ---- disabled env (foreign domain) ----
p = await open('disabled');
await p.evaluate(() => { AR.UI.play(); AR.capture.step(30); });
st = await crash(p, 400);
check('disabled env → no continue offer, straight to results', st === 'over', st);
check('disabled env → no SDK calls besides init', (await calls(p)).join(',') === 'init', (await calls(p)).join(','));
check('disabled env → double button hidden', await p.evaluate(() => document.getElementById('btn-double').classList.contains('hidden')));
check('no page errors (disabled)', p.errors.length === 0, p.errors.join(' | '));
await p.close();

// ---- no SDK at all ----
p = await open('none');
await p.evaluate(() => { AR.UI.play(); AR.capture.step(60); });
st = await crash(p, 400);
check('no SDK → game playable, results shown', st === 'over', st);
await p.evaluate(() => AR.UI.again());
await wait(100);
check('no SDK → play again works', (await p.evaluate(() => AR.game.state)) === 'run');
const ls = await p.evaluate(() => localStorage.getItem('avalancheRider.save'));
check('no SDK → localStorage save', !!ls);
check('no page errors (none)', p.errors.length === 0, p.errors.join(' | '));
await p.close();


// ---- every crevasse can be cleared, with or without jumping at the lip ----
p = await open('none');
const bad = await p.evaluate(() => {
  let fails = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const jump of [false, true]) {
      const w = new AR.World(seed * 7919, { tutorial: true });
      w.ensure(20000);
      const gap = w.gaps[0];
      const k = w.kickers.find((kk) => kk.gap);
      const r = new AR.Rider(w, {});
      r.x = k.x0 - 300;
      r.y = w.groundAt(r.x);
      r.v = 500;
      let t = 0;
      let pressed = false;
      while (t < 6 && r.alive && r.x < gap.x1 + 800) {
        let press = false;
        if (jump && !pressed && r.mode === 'ground' && k.lipX - r.x < r.v * 0.03 + 6) press = pressed = true;
        r.update(1 / 60, { press, hold: false });
        t += 1 / 60;
      }
      if (r.mode !== 'ground') fails++;
    }
  }
  return fails;
});
check('80 crevasse jumps all land safely', bad === 0, bad + ' failed');
await p.close();

await browser.close();
server.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
