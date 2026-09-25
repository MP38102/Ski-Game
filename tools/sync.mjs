// Copies generated brand assets into the game, the website and the iPad app,
// and bundles the web game into the Xcode project. Run: npm run sync
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = (p) => path.join(root, p);
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(r(to)), { recursive: true });
  fs.copyFileSync(r(from), r(to));
};

// Game
for (const f of ['logo.svg', 'yeti-mark.svg', 'favicon.svg']) copy(`brand/${f}`, `game/img/${f}`);
copy('brand/png/favicon-32.png', 'game/icons/favicon-32.png');
copy('brand/png/icon-180.png', 'game/icons/icon-180.png');
copy('brand/png/icon-512.png', 'game/icons/icon-512.png');
copy('brand/png/icon-maskable-192.png', 'game/icons/icon-maskable-192.png');
copy('brand/png/icon-maskable-512.png', 'game/icons/icon-maskable-512.png');
// 192 "any" icon: reuse maskable art (full-bleed looks right on Android too)
copy('brand/png/icon-maskable-192.png', 'game/icons/icon-192.png');

// Website
for (const f of ['logo.svg', 'yeti-mark.svg', 'favicon.svg', 'icon.svg', 'wordmark.svg']) copy(`brand/${f}`, `website/img/${f}`);
for (const f of ['icon-512.png', 'icon-180.png', 'favicon-32.png', 'og-image.png', 'logo-1200.png']) {
  if (fs.existsSync(r(`brand/png/${f}`))) copy(`brand/png/${f}`, `website/img/${f}`);
}

// iPad app: app icon + bundled game
copy('brand/png/icon-1024.png', 'ios/YetiRush/Assets.xcassets/AppIcon.appiconset/icon-1024.png');
const dst = r('ios/YetiRush/Game');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(r('game'), dst, {
  recursive: true,
  filter: (src) => !src.endsWith('sw.js') && !src.endsWith('manifest.webmanifest'),
});
// Website ships the playable web version under /play
const play = r('website/play');
fs.rmSync(play, { recursive: true, force: true });
fs.cpSync(r('game'), play, { recursive: true });

console.log('synced assets into game/, website/ and ios/');
