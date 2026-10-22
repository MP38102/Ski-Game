'use strict';
// Shop items, upgrades and mission templates. Names are shown as-is in every
// language; descriptions go through i18n.
(function (AR) {
  // Rider outfits: purely cosmetic.
  AR.RIDERS = [
    { id: 'rookie', name: 'Rookie', price: 0, jacket: '#FF6B2C', jacket2: '#D9491A', pants: '#1D3557', hat: '#2F6FEB', hatStyle: 'beanie', pom: '#FFFFFF', scarf: '#FFC53D', lens: '#7FD3FF' },
    { id: 'glacier', name: 'Glacier', price: 300, jacket: '#7FD3FF', jacket2: '#3FA3DB', pants: '#F4F8FC', hat: '#FFFFFF', hatStyle: 'helmet', pom: null, scarf: '#2F6FEB', lens: '#FFC53D' },
    { id: 'lumberjack', name: 'Lumberjack', price: 600, jacket: '#E63946', jacket2: '#9E1F2A', pants: '#3D405B', hat: '#E63946', hatStyle: 'beanie', pom: '#1B1B1B', scarf: '#1B1B1B', lens: '#FF9F1C', plaid: true },
    { id: 'nightowl', name: 'Night Owl', price: 1000, jacket: '#3A2A6B', jacket2: '#24184A', pants: '#14213D', hat: '#8B5CF6', hatStyle: 'hood', pom: null, scarf: '#C084FC', lens: '#C084FC' },
    { id: 'ninja', name: 'Ninja', price: 1600, jacket: '#1B1B1B', jacket2: '#000000', pants: '#1B1B1B', hat: '#1B1B1B', hatStyle: 'headband', pom: '#E63946', scarf: '#E63946', lens: '#FFFFFF' },
    { id: 'neon', name: 'Neon', price: 2500, jacket: '#FF3EA5', jacket2: '#C21877', pants: '#22E3A4', hat: '#22E3A4', hatStyle: 'helmet', pom: null, scarf: '#FFF04D', lens: '#FF3EA5' },
    { id: 'yeti', name: 'Yeti Suit', price: 4000, jacket: '#F2F6FB', jacket2: '#C9D9EE', pants: '#E3ECF6', hat: '#F2F6FB', hatStyle: 'yeti', pom: null, scarf: '#5CC8FF', lens: '#1D3557', fur: true },
    { id: 'gold', name: 'Gold Medal', price: 6000, jacket: '#FFC53D', jacket2: '#D99A00', pants: '#1D3557', hat: '#FFC53D', hatStyle: 'helmet', pom: null, scarf: '#E63946', lens: '#1D3557' },
  ];

  // Snowboards: purely cosmetic.
  AR.BOARDS = [
    { id: 'plank', name: 'Classic', price: 0, base: '#1D3557', top: '#2F6FEB', pattern: 'stripe', accent: '#FFFFFF' },
    { id: 'flame', name: 'Flame', price: 400, base: '#1B1B1B', top: '#E63946', pattern: 'flame', accent: '#FFC53D' },
    { id: 'wave', name: 'Wave', price: 800, base: '#0B4F6C', top: '#5CC8FF', pattern: 'wave', accent: '#FFFFFF' },
    { id: 'candy', name: 'Candy', price: 1500, base: '#FFFFFF', top: '#FF3EA5', pattern: 'candy', accent: '#FFFFFF' },
    { id: 'galaxy', name: 'Galaxy', price: 3000, base: '#14213D', top: '#5B2A86', pattern: 'stars', accent: '#FFF04D' },
    { id: 'goldboard', name: 'Golden', price: 5000, base: '#8A5A00', top: '#FFC53D', pattern: 'stripe', accent: '#FFF4CC' },
  ];

  // Snow trails left behind the board.
  AR.TRAILS = [
    { id: 'powder', name: 'Powder', price: 0, colors: ['#FFFFFF', '#E6F0FA'] },
    { id: 'stardust', name: 'Stardust', price: 1200, colors: ['#FFF04D', '#FFC53D', '#FFFFFF'], sparkle: true },
    { id: 'rainbow', name: 'Rainbow', price: 2500, colors: ['#FF5A5F', '#FFB13B', '#FFF04D', '#3DDC97', '#4DA3FF', '#A970FF'] },
    { id: 'ember', name: 'Ember', price: 5000, colors: ['#FF6B2C', '#FFC53D', '#E63946'], sparkle: true },
  ];

  // Upgrades: 5 levels each. Effects are applied in rider.js / game.js.
  AR.UPGRADES = [
    { id: 'magnet', icon: 'magnet', prices: [250, 600, 1200, 2400, 4000], base: 6, step: 2, unit: 's' },
    { id: 'shield', icon: 'shield', prices: [250, 600, 1200, 2400, 4000], base: 8, step: 2, unit: 's' },
    { id: 'balance', icon: 'balance', prices: [300, 700, 1400, 2800, 4500], base: 0, step: 3, unit: '°' },
  ];
  AR.upgradeValue = (id, level) => {
    const u = AR.UPGRADES.find((x) => x.id === id);
    return u.base + u.step * level;
  };

  // Missions. `run` missions count within a single run, `total` ones add up.
  // target(level) scales with the player's mission level.
  AR.MISSIONS = [
    { id: 'dist', scope: 'run', stat: 'dist', min: 0, target: (l) => 400 + l * 200, reward: (l) => 60 + l * 20 },
    { id: 'flips', scope: 'run', stat: 'flips', min: 0, target: (l) => 2 + l, reward: (l) => 60 + l * 20 },
    { id: 'coins', scope: 'run', stat: 'coins', min: 0, target: (l) => 40 + l * 25, reward: (l) => 60 + l * 20 },
    { id: 'score', scope: 'run', stat: 'score', min: 1, target: (l) => 1500 + l * 1500, reward: (l) => 80 + l * 20 },
    { id: 'perfect', scope: 'run', stat: 'perfect', min: 0, target: (l) => 2 + Math.floor(l * 0.8), reward: (l) => 70 + l * 20 },
    { id: 'combo', scope: 'run', stat: 'combo', min: 1, target: (l) => Math.min(8, 3 + Math.floor(l / 2)), reward: (l) => 80 + l * 20 },
    { id: 'double', scope: 'run', stat: 'maxFlip', min: 1, target: (l) => (l < 6 ? 2 : 3), reward: (l) => 100 + l * 20 },
    { id: 'gaps', scope: 'run', stat: 'gaps', min: 1, target: (l) => 1 + Math.floor(l / 2), reward: (l) => 80 + l * 20 },
    { id: 'rails', scope: 'run', stat: 'rails', min: 0, target: (l) => 1 + Math.floor(l / 2), reward: (l) => 70 + l * 20 },
    { id: 'powerups', scope: 'run', stat: 'powerups', min: 2, target: (l) => 2 + Math.floor(l / 3), reward: (l) => 80 + l * 20 },
    { id: 'smash', scope: 'run', stat: 'smash', min: 3, target: (l) => 1 + Math.floor(l / 4), reward: (l) => 100 + l * 20 },
    { id: 'air', scope: 'run', stat: 'bigair', min: 1, target: (l) => 2 + Math.floor(l / 2), reward: (l) => 80 + l * 20 },
    { id: 'tdist', scope: 'total', stat: 'dist', min: 2, target: (l) => 3000 + l * 1500, reward: (l) => 100 + l * 25 },
    { id: 'tflips', scope: 'total', stat: 'flips', min: 1, target: (l) => 10 + l * 5, reward: (l) => 100 + l * 25 },
    { id: 'truns', scope: 'total', stat: 'runs', min: 0, target: (l) => 3 + l, reward: (l) => 60 + l * 20 },
  ];
})(window.AR);
