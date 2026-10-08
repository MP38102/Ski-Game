'use strict';
// Save game, ski passes, credits, the gear shop catalogue and achievements.
// Everything is earned by playing – there are no purchases with real money.
(function (GS) {
  const C = (id, cat, de, en, color, price, extra) => Object.assign({ id, cat, name: { de, en }, color, price }, extra || {});

  const CATALOG = [
    // jackets
    C('j-red', 'jacket', 'Rot', 'Red', '#e63946', 0),
    C('j-blue', 'jacket', 'Gletscherblau', 'Glacier blue', '#2f6feb', 0),
    C('j-yellow', 'jacket', 'Sonnengelb', 'Sun yellow', '#ffb703', 150),
    C('j-teal', 'jacket', 'Petrol', 'Teal', '#2a9d8f', 150),
    C('j-purple', 'jacket', 'Lila', 'Purple', '#8338ec', 250),
    C('j-pink', 'jacket', 'Neonpink', 'Neon pink', '#ff006e', 300),
    C('j-orange', 'jacket', 'Signalorange', 'Safety orange', '#fb5607', 300),
    C('j-cream', 'jacket', 'Vintage-Creme', 'Vintage cream', '#f4f1de', 400),
    C('j-navy', 'jacket', 'Nachtblau', 'Navy', '#1d3557', 400),
    C('j-mint', 'jacket', 'Minze', 'Mint', '#06d6a0', 500),
    C('j-black', 'jacket', 'Stealth', 'Stealth', '#1b1f24', 650),
    C('j-lime', 'jacket', 'Limette', 'Lime', '#b5e48c', 650),
    C('j-gold', 'jacket', 'Champion-Gold', 'Champion gold', '#d4af37', 2500),
    C('j-yeti', 'jacket', 'Yeti-Fell', 'Yeti fur', '#f1f6fb', 5000),
    // pants
    C('p-navy', 'pants', 'Marine', 'Navy', '#1d3557', 0),
    C('p-black', 'pants', 'Schwarz', 'Black', '#2b2d42', 0),
    C('p-grey', 'pants', 'Grau', 'Grey', '#6c757d', 120),
    C('p-white', 'pants', 'Weiß', 'White', '#e9ecef', 200),
    C('p-red', 'pants', 'Rot', 'Red', '#9d0208', 250),
    C('p-camo', 'pants', 'Oliv', 'Olive', '#606c38', 300),
    C('p-sky', 'pants', 'Himmelblau', 'Sky blue', '#48cae4', 350),
    C('p-yeti', 'pants', 'Yeti-Fell', 'Yeti fur', '#dfe9f3', 2500),
    // helmets & hats
    C('h-white', 'helmet', 'Helm Weiß', 'White helmet', '#f4f4f4', 0, { hat: 'helmet' }),
    C('h-black', 'helmet', 'Helm Schwarz', 'Black helmet', '#1b1f24', 0, { hat: 'helmet' }),
    C('h-red', 'helmet', 'Helm Rot', 'Red helmet', '#e63946', 150, { hat: 'helmet' }),
    C('h-blue', 'helmet', 'Helm Blau', 'Blue helmet', '#2f6feb', 150, { hat: 'helmet' }),
    C('h-gold', 'helmet', 'Helm Gold', 'Gold helmet', '#d4af37', 1800, { hat: 'helmet' }),
    C('h-beanie-r', 'helmet', 'Bommelmütze Rot', 'Red bobble hat', '#d62828', 200, { hat: 'beanie' }),
    C('h-beanie-y', 'helmet', 'Bommelmütze Gelb', 'Yellow bobble hat', '#ffd23f', 200, { hat: 'beanie' }),
    C('h-beanie-g', 'helmet', 'Bommelmütze Grün', 'Green bobble hat', '#2a9d4f', 200, { hat: 'beanie' }),
    C('h-cap', 'helmet', 'Cap', 'Cap', '#3a86ff', 350, { hat: 'cap' }),
    // goggles
    C('g-black', 'goggles', 'Klassik', 'Classic', '#1b1f24', 0),
    C('g-orange', 'goggles', 'Orange verspiegelt', 'Orange mirror', '#ff8c42', 120),
    C('g-ice', 'goggles', 'Eisblau verspiegelt', 'Ice mirror', '#4cc9f0', 120),
    C('g-violet', 'goggles', 'Violett', 'Violet', '#c77dff', 200),
    C('g-gold', 'goggles', 'Gold verspiegelt', 'Gold mirror', '#ffd166', 600),
    // skis
    C('s-red', 'skis', 'Racecarver Rot', 'Race carver red', '#e63946', 0),
    C('s-white', 'skis', 'Allmountain Weiß', 'All-mountain white', '#f4f4f4', 0),
    C('s-black', 'skis', 'Freeride Schwarz', 'Freeride black', '#1b1f24', 250),
    C('s-yellow', 'skis', 'Park Gelb', 'Park yellow', '#ffb703', 250),
    C('s-blue', 'skis', 'Powder Blau', 'Powder blue', '#2f6feb', 350),
    C('s-mint', 'skis', 'Twin-Tip Mint', 'Twin tip mint', '#06d6a0', 450),
    C('s-pink', 'skis', 'Twin-Tip Pink', 'Twin tip pink', '#ff006e', 450),
    C('s-wood', 'skis', 'Holz-Retro', 'Wooden retro', '#b07d48', 900),
    C('s-gold', 'skis', 'Goldski', 'Golden skis', '#d4af37', 4000),
    // boards
    C('b-orange', 'board', 'Board Orange', 'Orange board', '#fb5607', 0),
    C('b-black', 'board', 'Board Schwarz', 'Black board', '#1b1f24', 0),
    C('b-teal', 'board', 'Board Petrol', 'Teal board', '#2a9d8f', 250),
    C('b-purple', 'board', 'Board Lila', 'Purple board', '#8338ec', 350),
    C('b-white', 'board', 'Board Weiß', 'White board', '#f4f4f4', 350),
    C('b-wood', 'board', 'Holzboard', 'Wooden board', '#b07d48', 900),
    C('b-gold', 'board', 'Goldboard', 'Golden board', '#d4af37', 4000),
    // gloves
    C('gl-black', 'gloves', 'Schwarz', 'Black', '#1b1f24', 0),
    C('gl-red', 'gloves', 'Rot', 'Red', '#e63946', 80),
    C('gl-yellow', 'gloves', 'Gelb', 'Yellow', '#ffd23f', 80),
    C('gl-white', 'gloves', 'Weiß', 'White', '#f4f4f4', 120),
    // extras
    C('x-none', 'extra', 'Nichts', 'Nothing', '#cccccc', 0, { extra: null }),
    C('x-pack-o', 'extra', 'Rucksack Orange', 'Orange backpack', '#ff6b2c', 300, { extra: 'backpack' }),
    C('x-pack-b', 'extra', 'Rucksack Blau', 'Blue backpack', '#2f6feb', 300, { extra: 'backpack' }),
    C('x-scarf-r', 'extra', 'Schal Rot', 'Red scarf', '#e63946', 400, { extra: 'scarf' }),
    C('x-scarf-s', 'extra', 'Schal Streifen', 'Striped scarf', '#ffd23f', 400, { extra: 'scarf' }),
    C('x-cape-r', 'extra', 'Heldenumhang', 'Hero cape', '#d62828', 1500, { extra: 'cape' }),
    C('x-cape-p', 'extra', 'Zauberumhang', 'Wizard cape', '#7b2cbf', 1500, { extra: 'cape' }),
  ];

  const CATS = ['jacket', 'pants', 'helmet', 'goggles', 'skis', 'board', 'gloves', 'extra'];

  const ACHIEVEMENTS = [
    { id: 'firstRun', reward: 50, test: (s) => s.stats.runs >= 1 },
    { id: 'firstMedal', reward: 100, test: (s) => Object.keys(s.medals).length >= 1 },
    { id: 'firstGold', reward: 150, test: (s) => countTier(s, 3) >= 1 },
    { id: 'gold10', reward: 400, test: (s) => countTier(s, 3) >= 10 },
    { id: 'gold50', reward: 1500, test: (s) => countTier(s, 3) >= 50 },
    { id: 'gold100', reward: 3000, test: (s) => countTier(s, 3) >= 100 },
    { id: 'speed100', reward: 200, test: (s) => s.stats.topSpeed * 3.6 >= 100 },
    { id: 'speed130', reward: 500, test: (s) => s.stats.topSpeed * 3.6 >= 130 },
    { id: 'air3', reward: 250, test: (s) => s.stats.bestAir >= 3 },
    { id: 'dist10', reward: 300, test: (s) => s.stats.dist >= 10000 },
    { id: 'dist100', reward: 1500, test: (s) => s.stats.dist >= 100000 },
    { id: 'combo5', reward: 200, test: (s) => s.stats.bestMult >= 5 },
    { id: 'combo10k', reward: 500, test: (s) => s.stats.bestCombo >= 10000 },
    { id: 'trees50', reward: 300, test: (s) => s.stats.treeTaps >= 50 },
    { id: 'lifts25', reward: 200, test: (s) => s.stats.lifts >= 25 },
    { id: 'glide', reward: 150, test: (s) => s.stats.glides >= 1 },
    { id: 'zip', reward: 150, test: (s) => s.stats.zips >= 1 },
    { id: 'edelweiss5', reward: 300, test: (s) => Object.values(s.found).some((a) => a.length >= 5) },
    { id: 'edelweissAll', reward: 3000, test: (s) => Object.values(s.found).reduce((a, b) => a + b.length, 0) >= 60 },
    { id: 'crash50', reward: 100, test: (s) => s.stats.crashes >= 50 },
    { id: 'mountains6', reward: 800, test: (s) => s.passes >= GS.MOUNTAINS[5].unlock },
    { id: 'mountainsAll', reward: 2500, test: (s) => s.passes >= GS.MOUNTAINS[11].unlock },
    { id: 'doubleFlip', reward: 300, test: (s) => s.stats.doubleFlip },
    { id: 'spin1080', reward: 400, test: (s) => s.stats.maxSpin >= 1080 },
  ];

  function countTier(s, tier) {
    let n = 0;
    for (const k in s.medals) if (s.medals[k] >= tier) n++;
    return n;
  }

  const DEFAULT = () => ({
    version: 1, credits: 200, medals: {}, best: {}, found: {}, owned: CATALOG.filter((i) => i.price === 0).map((i) => i.id),
    equip: { jacket: 'j-red', pants: 'p-navy', helmet: 'h-white', goggles: 'g-black', skis: 's-red', board: 'b-orange', gloves: 'gl-black', extra: 'x-none' },
    sport: 'ski', stats: { dist: 0, topSpeed: 0, bestAir: 0, tricks: 0, bestCombo: 0, bestMult: 0, crashes: 0, runs: 0, lifts: 0, glides: 0, zips: 0, treeTaps: 0, playTime: 0, maxSpin: 0, doubleFlip: false },
    lastMountain: 'sonnalm', achievements: {}, tutorial: false, seenMountains: {},
  });

  const Progress = {
    data: null,
    load() {
      const d = GS.store.get('save', null);
      this.data = Object.assign(DEFAULT(), d || {});
      this.data.stats = Object.assign(DEFAULT().stats, (d && d.stats) || {});
      this.data.equip = Object.assign(DEFAULT().equip, (d && d.equip) || {});
      this.recount();
      return this.data;
    },
    save() { GS.store.set('save', this.data); },
    reset() { this.data = DEFAULT(); this.recount(); this.save(); },

    recount() {
      const d = this.data;
      let p = 0;
      for (const k in d.medals) p += d.medals[k];
      for (const k in d.found) p += d.found[k].length;
      d.passes = p;
      return p;
    },

    get passes() { return this.data.passes; },
    get credits() { return this.data.credits; },

    mountainUnlocked(m) { return GS.settings.unlockAll || this.data.passes >= m.unlock; },
    liftUnlocked(m, l) { return GS.settings.unlockAll || !l.cost || this.data.passes >= m.unlock + l.cost; },
    liftNeed(m, l) { return m.unlock + (l.cost || 0); },

    medal(chId) { return this.data.medals[chId] || 0; },
    best(chId) { return this.data.best[chId]; },

    // Record a result; returns { newTier, passesGained, creditsGained, isBest }
    record(ch, value, tier, mountain) {
      const d = this.data;
      const old = d.medals[ch.id] || 0;
      const prevBest = d.best[ch.id];
      const isBest = value != null && (prevBest == null || (ch.better === 'low' ? value < prevBest : value > prevBest));
      if (isBest) d.best[ch.id] = value;
      let passes = 0, credits = 0;
      if (tier > old) {
        passes = tier - old;
        d.medals[ch.id] = tier;
        const mult = 1 + (mountain.diff - 1) * 0.35;
        const table = [0, 60, 120, 220];
        for (let t = old + 1; t <= tier; t++) credits += Math.round(table[t] * mult);
      } else if (tier > 0) {
        credits = 15 * tier;
      }
      d.credits += credits;
      d.stats.runs++;
      this.recount();
      this.save();
      return { newTier: tier > old, passes, credits, isBest, oldTier: old };
    },

    collect(mountainId, id) {
      const d = this.data;
      const a = d.found[mountainId] || (d.found[mountainId] = []);
      if (a.indexOf(id) >= 0) return false;
      a.push(id);
      d.credits += 100;
      this.recount();
      this.save();
      return true;
    },

    isFound(mountainId, id) {
      const a = this.data.found[mountainId];
      return !!(a && a.indexOf(id) >= 0);
    },

    addCredits(n) {
      this.data.credits += Math.max(0, Math.round(n));
    },

    buy(item) {
      const d = this.data;
      if (d.owned.indexOf(item.id) >= 0) return true;
      if (d.credits < item.price) return false;
      d.credits -= item.price;
      d.owned.push(item.id);
      this.save();
      return true;
    },

    owns(id) { return this.data.owned.indexOf(id) >= 0; },

    equip(item) {
      this.data.equip[item.cat] = item.id;
      this.save();
    },

    gear() {
      const e = this.data.equip;
      const get = (id) => CATALOG.find((i) => i.id === id) || CATALOG.find((i) => i.cat === id) || {};
      const helmet = get(e.helmet), extra = get(e.extra);
      return {
        jacket: get(e.jacket).color, pants: get(e.pants).color, helmet: helmet.color, hat: helmet.hat || 'helmet',
        goggles: get(e.goggles).color, skis: get(e.skis).color, board: get(e.board).color, gloves: get(e.gloves).color,
        extra: extra.extra || null, extraColor: extra.color, skin: GS.settings.skin || '#f1c7a5',
      };
    },

    checkAchievements() {
      const d = this.data;
      const fresh = [];
      for (const a of ACHIEVEMENTS) {
        if (d.achievements[a.id]) continue;
        let ok = false;
        try { ok = a.test(d); } catch (e) { ok = false; }
        if (ok) {
          d.achievements[a.id] = Date.now();
          d.credits += a.reward;
          fresh.push(a);
        }
      }
      if (fresh.length) this.save();
      return fresh;
    },

    mountainStats(m, challenges) {
      let medals = [0, 0, 0, 0];
      const n = m.challenges.length;
      for (let i = 0; i < n; i++) medals[this.data.medals[m.id + ':' + i] || 0]++;
      void challenges;
      const found = (this.data.found[m.id] || []).length;
      return { gold: medals[3], silver: medals[2], bronze: medals[1], total: n, found, passes: medals[1] + medals[2] * 2 + medals[3] * 3 + found, max: n * 3 + 5 };
    },
  };

  GS.Progress = Progress;
  GS.CATALOG = CATALOG;
  GS.CATS = CATS;
  GS.ACHIEVEMENTS = ACHIEVEMENTS;
})(window.GS);
