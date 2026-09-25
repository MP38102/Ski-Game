// Gentle snowfall in the hero section.
(function () {
  const c = document.getElementById('snow');
  if (!c || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const g = c.getContext('2d');
  let W, H, flakes;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = c.offsetWidth;
    H = c.offsetHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    flakes = Array.from({ length: Math.round(W / 12) }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 3, s: 20 + Math.random() * 40, p: Math.random() * 6,
    }));
  }
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (const f of flakes) {
      f.y += f.s * dt;
      f.x += Math.sin(now / 1000 + f.p) * 12 * dt;
      if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.fill();
    }
    requestAnimationFrame(tick);
  }
  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(tick);
})();
