'use strict';
// Persistent player progress: coins, records, unlocks, upgrades, missions,
// daily gift and settings. Stored through AR.Platform (CrazyGames data module
// when available, localStorage otherwise).
(function (AR) {
  const VERSION = 1;

  function fresh() {
    return {
      v: VERSION,
      coins: 0,
      best: 0,
      bestDist: 0,
      runs: 0,
      owned: { riders: ['rookie'], boards: ['plank'], trails: ['powder'] },
      eq: { rider: 'rookie', board: 'plank', trail: 'powder' },
      up: { magnet: 0, shield: 0, balance: 0 },
      missions: { level: 0, rank: 1, active: [], totals: {} },
      gift: { last: '', streak: 0 },
      tutorial: false,
      settings: { music: true, sfx: true, lang: 'auto' },
    };
  }

  // Fill gaps from older saves without dropping anything already stored.
  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    for (const k in base) {
      if (!(k in saved)) continue;
      const b = base[k];
      const s = saved[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, s);
      else if (Array.isArray(b)) base[k] = Array.isArray(s) ? s : b;
      else if (typeof s === typeof b) base[k] = s;
    }
    return base;
  }

  const P = {
    data: fresh(),
    dirty: false,

    load() {
      P.data = merge(fresh(), AR.Platform.loadSave());
      if (P.data.missions.active.length !== 3) P.newMissionSet();
    },
    save() {
      AR.Platform.writeSave(P.data);
    },

    // ---- shop ----
    listFor(kind) {
      return kind === 'riders' ? AR.RIDERS : kind === 'boards' ? AR.BOARDS : AR.TRAILS;
    },
    eqKey(kind) {
      return kind === 'riders' ? 'rider' : kind === 'boards' ? 'board' : 'trail';
    },
    owns(kind, id) {
      return P.data.owned[kind].includes(id);
    },
    buy(kind, id) {
      const item = P.listFor(kind).find((x) => x.id === id);
      if (!item || P.owns(kind, id) || P.data.coins < item.price) return false;
      P.data.coins -= item.price;
      P.data.owned[kind].push(id);
      P.data.eq[P.eqKey(kind)] = id;
      P.save();
      return true;
    },
    equip(kind, id) {
      if (!P.owns(kind, id)) return false;
      P.data.eq[P.eqKey(kind)] = id;
      P.save();
      return true;
    },
    equipped(kind) {
      const id = P.data.eq[P.eqKey(kind)];
      const list = P.listFor(kind);
      return list.find((x) => x.id === id) || list[0];
    },
    upgradePrice(id) {
      const u = AR.UPGRADES.find((x) => x.id === id);
      const lvl = P.data.up[id];
      return lvl >= u.prices.length ? null : u.prices[lvl];
    },
    buyUpgrade(id) {
      const price = P.upgradePrice(id);
      if (price == null || P.data.coins < price) return false;
      P.data.coins -= price;
      P.data.up[id] += 1;
      P.save();
      return true;
    },

    // ---- missions ----
    newMissionSet() {
      const m = P.data.missions;
      const r = AR.rng(9001 + m.level * 7919);
      const pool = AR.MISSIONS.filter((t) => t.min <= m.level);
      const picked = [];
      while (picked.length < 3 && pool.length) {
        const i = Math.floor(r() * pool.length);
        const t = pool.splice(i, 1)[0];
        // Avoid two missions that track the same stat (e.g. run + total distance).
        if (picked.some((p) => AR.MISSIONS.find((x) => x.id === p.id).stat === t.stat)) continue;
        picked.push({ id: t.id, target: t.target(m.level), reward: t.reward(m.level), progress: 0, done: false });
      }
      m.active = picked;
      for (const a of picked) {
        const t = AR.MISSIONS.find((x) => x.id === a.id);
        if (t.scope === 'total') m.totals[a.id] = 0;
      }
    },
    missionDef(id) {
      return AR.MISSIONS.find((x) => x.id === id);
    },
    // Called with the live run stats; returns missions completed by this update.
    trackRun(stats) {
      const done = [];
      for (const a of P.data.missions.active) {
        if (a.done) continue;
        const t = P.missionDef(a.id);
        if (t.scope !== 'run') continue;
        const v = stats[t.stat] || 0;
        if (v > a.progress) a.progress = Math.min(v, a.target);
        if (a.progress >= a.target) {
          a.done = true;
          P.data.coins += a.reward;
          done.push(a);
        }
      }
      return done;
    },
    // Called once at the end of a run to add totals.
    trackTotals(stats) {
      const done = [];
      const m = P.data.missions;
      for (const a of m.active) {
        if (a.done) continue;
        const t = P.missionDef(a.id);
        if (t.scope !== 'total') continue;
        m.totals[a.id] = (m.totals[a.id] || 0) + (stats[t.stat] || 0);
        a.progress = Math.min(m.totals[a.id], a.target);
        if (a.progress >= a.target) {
          a.done = true;
          P.data.coins += a.reward;
          done.push(a);
        }
      }
      return done;
    },
    // All three done → rank up, bonus coins, fresh set. Returns bonus or 0.
    checkRankUp() {
      const m = P.data.missions;
      if (!m.active.every((a) => a.done)) return 0;
      const bonus = 150 + m.level * 50;
      P.data.coins += bonus;
      m.level += 1;
      m.rank += 1;
      P.newMissionSet();
      return bonus;
    },

    // ---- daily gift ----
    giftAvailable() {
      return P.data.gift.last !== AR.dayKey();
    },
    giftPreview() {
      const g = P.data.gift;
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const streak = g.last === AR.dayKey(y) ? Math.min(g.streak + 1, 7) : 1;
      return { streak, coins: 50 + streak * 50 };
    },
    claimGift() {
      if (!P.giftAvailable()) return 0;
      const p = P.giftPreview();
      P.data.gift.last = AR.dayKey();
      P.data.gift.streak = p.streak;
      P.data.coins += p.coins;
      P.save();
      return p.coins;
    },
  };

  AR.Progress = P;
})(window.AR);
