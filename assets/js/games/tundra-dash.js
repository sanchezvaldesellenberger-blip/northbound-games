/* Foxfire Run (id tundra-dash): a fox runs at dusk.
   Two art variants chosen at call time from NB.winter: December gets the snowy tundra,
   the rest of the year a forest-edge meadow trail. Gameplay and hitboxes are identical. */
(function () {
  'use strict';
  const { TAU, clamp, lerp, rand, hash, rgba } = NB.util;
  const PAL = NB.pal;
  const PI = Math.PI;
  const GROUND = 416, S = 28, GRAV = 2300, SPIKE = 24;
  const mod = (a, n) => ((a % n) + n) % n;
  const easeInOut = (k) => { k = clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(2 - 2 * k, 3) / 2; };

  /* ---------- Palette: dusk violets and snow blues, saturated colour saved for the fox, stars and hazards ---------- */
  const FOX = { fur: PAL.orange, lit: '#ff9a62', sh: '#d4582c', limb: '#e3622f', farLimb: '#b94b25', cream: PAL.cream, creamSh: '#d8cbae', dark: '#241b2d', far: '#3d2f40' };
  const ICE = { lit: '#eef5ff', mid: '#b8d0ff', sh: '#6e9af4', deep: '#4b72d8' };
  const ROCK = { top: '#a2a6c4', lit: '#868bae', base: '#676d94', sh: '#4a4f76', deep: '#3b3f63', snow: PAL.snow, snowSh: '#c3cde8', under: '#3b3f66' };
  const OWL = { white: '#f8f9fc', shade: '#d2d9ea', far: '#bcc5dc', tip: '#a3adc8', bar: '#69718f', beak: '#2b2c3c', eye: PAL.gold, pupil: '#1b1d2c', face: '#fcf8ee' };
  const STAR = [ '#fff2c4', PAL.gold, PAL.amber ];
  const NORTH = [ '#fbf7ea', PAL.cream, '#cfc4a8' ];
  const SNOWC = [PAL.snow, PAL.ice, '#cddaf2'];
  const PP = [];

  /* ---------- Winter (December) rows ---------- */
  /* Parallax rows. Mountains are angular and faceted like the studio badge; light comes from the top left. */
  const RIDGE_A = { sp: 150, N: 23, base: 376, hMin: 108, hVar: 92, wl: 0.95, wr: 1.05, cap: 0.85, seed: 1.3,
    lit: '#b0a2bf', mid: '#a396b6', sh: '#8e83aa', capLit: '#e9ddd8', capSh: '#c7bbd2' };
  const RIDGE_B = { sp: 178, N: 17, base: 384, hMin: 66, hVar: 76, wl: 1.0, wr: 1.15, cap: 0.95, seed: 5.9,
    lit: '#7a76a3', mid: '#6c6896', sh: '#504c7a', capLit: '#f4eedb', capSh: '#a8a1c5' };
  const HILLS = { sp: 236, N: 7, base: 400, hMin: 38, hVar: 40, wl: 2.1, wr: 2.3, cap: 0.55, seed: 9.1,
    lit: '#555c8e', mid: '#4b5284', sh: '#3b4270', capLit: '#7b80ad', capSh: '#5e6392' };
  const PINE_A = { sp: 21, N: 67, base: 405, hMin: 24, hVar: 32, seed: 2.2, dens: 0.5, dark: '#2e3863', lit: '#3b4676', snow: '#8b93c0' };
  const PINE_B = { sp: 31, N: 53, base: 413, hMin: 40, hVar: 50, seed: 7.4, dens: 0.4, dark: '#19233f', lit: '#263358', snow: '#c3c9e4' };
  const AURORA = [
    { u: 0.06, w: 0.46, y: 208, h: 96, col: PAL.mint, s: 0.0 },
    { u: 0.47, w: 0.33, y: 178, h: 78, col: PAL.frost, s: 2.1 },
    { u: 0.70, w: 0.40, y: 218, h: 84, col: PAL.mint, s: 4.3 }
  ];
  AURORA.forEach((a) => { a.ray1 = rgba(a.col, 0.07); a.ray2 = rgba(a.col, 0.13); });

  /* ---------- Cached gradients (one set per canvas context, built once) ---------- */
  const GC = new WeakMap();
  function lin(g, y0, y1, stops) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    return gr;
  }
  function grads(g) {
    let c = GC.get(g);
    if (c) return c;
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, 150);
    halo.addColorStop(0, 'rgba(250,240,220,.34)');
    halo.addColorStop(0.28, 'rgba(246,230,212,.13)');
    halo.addColorStop(1, 'rgba(240,215,200,0)');
    c = {
      sky: lin(g, 0, 386, [0, '#0b1d32', 0.24, '#1b2950', 0.5, '#3b3c6b', 0.7, '#74638f', 0.86, '#bf8c9b', 1, '#f2be9d']),
      hazeA: lin(g, 220, 378, [0, 'rgba(242,190,157,0)', 1, 'rgba(242,190,157,.62)']),
      hazeB: lin(g, 280, 388, [0, 'rgba(201,146,160,0)', 1, 'rgba(201,146,160,.5)']),
      hazeC: lin(g, 336, 406, [0, 'rgba(150,132,176,0)', 1, 'rgba(150,132,176,.55)']),
      bank: lin(g, 396, 418, [0, '#c4cbe7', 1, '#97a3d1']),
      face: lin(g, 426, 500, [0, '#97a5d8', 0.45, '#6d79b4', 1, '#4a5491']),
      band: lin(g, GROUND, GROUND + 20, [0, '#f2f5fb', 1, '#d3dbef']),
      halo,
      aur: AURORA.map((a) => lin(g, a.y - a.h, a.y + 12, [0, rgba(a.col, 0), 0.5, rgba(a.col, 0.05), 0.88, rgba(a.col, 0.17), 1, rgba(a.col, 0)]))
    };
    GC.set(g, c);
    return c;
  }

  /* ---------- Small path helpers ---------- */
  function poly(g, a) {
    g.beginPath(); g.moveTo(a[0], a[1]);
    for (let i = 2; i < a.length; i += 2) g.lineTo(a[i], a[i + 1]);
    g.closePath();
  }
  function fillPoly(g, color, a) { g.fillStyle = color; poly(g, a); g.fill(); }
  /* Closed curve through the midpoints of a point list (flat [x,y,...], first n pairs). */
  function smooth(g, a, n) {
    g.beginPath();
    g.moveTo((a[0] + a[2 * n - 2]) / 2, (a[1] + a[2 * n - 1]) / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      g.quadraticCurveTo(a[2 * i], a[2 * i + 1], (a[2 * i] + a[2 * j]) / 2, (a[2 * i + 1] + a[2 * j + 1]) / 2);
    }
    g.closePath();
  }

  /* Faceted 4-point star: each point is split into halves shaded by the top-left light. */
  function gem(g, x, y, r, rot, tones) {
    for (let tone = 0; tone < 3; tone++) {
      g.fillStyle = tones[tone];
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = rot + i * PI / 2 - PI / 2, tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
        for (let s = -1; s <= 1; s += 2) {
          const lum = Math.cos(a + s * PI / 8 + PI * 0.75);
          if ((lum > 0.3 ? 0 : lum > -0.45 ? 1 : 2) !== tone) continue;
          const b = a + s * PI / 4;
          g.moveTo(x, y); g.lineTo(tx, ty); g.lineTo(x + Math.cos(b) * r * 0.36, y + Math.sin(b) * r * 0.36); g.closePath();
        }
      }
      g.fill();
    }
  }

  /* ---------- Sky: gradient, stars, the north star, moon and a faint aurora ---------- */
  function sky(g, c, W, t) {
    g.fillStyle = c.sky; g.fillRect(-20, -20, W + 40, GROUND + 30);
    const n = Math.round(W / 800 * 70);
    g.fillStyle = PAL.cream;
    for (let b = 0; b < 3; b++) {
      g.globalAlpha = 0.42 + 0.26 * Math.sin(t * 1.3 + b * 2.1);
      g.beginPath();
      for (let i = b; i < n; i += 3) {
        const x = hash(i * 2.13 + 0.3) * W, y = 66 + Math.pow(hash(i * 5.31 + 1.1), 1.6) * 190;
        const s = hash(i * 9.71) > 0.86 ? 1.8 : 1.1;
        g.rect(x, y, s, s);
      }
      g.fill();
    }
    g.globalAlpha = 1;
    const m = Math.max(2, Math.round(W / 260));
    for (let i = 0; i < m; i++) {
      const x = hash(i * 3.7 + 9.2) * W, y = 80 + hash(i * 6.1 + 4.4) * 110;
      g.globalAlpha = 0.55 + 0.3 * Math.sin(t * 1.7 + i * 2.4);
      gem(g, x, y, 3.2, 0, NORTH);
    }
    g.globalAlpha = 1;
    // The north star, echoing the badge.
    const nx = W * 0.43, ny = 100, tw = 1 + Math.sin(t * 1.4) * 0.07;
    g.strokeStyle = 'rgba(244,238,219,.22)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(nx - 20 * tw, ny); g.lineTo(nx + 20 * tw, ny); g.moveTo(nx, ny - 25 * tw); g.lineTo(nx, ny + 25 * tw); g.stroke();
    gem(g, nx, ny, 8.5 * tw, 0, NORTH);
  }

  function moon(g, c, x, y) {
    g.save();
    g.translate(x, y);
    g.fillStyle = c.halo; g.beginPath(); g.arc(0, 0, 150, 0, TAU); g.fill();
    g.fillStyle = '#d9cbb2'; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill();
    g.fillStyle = PAL.cream; g.beginPath(); g.arc(-3, -3, 26.2, 0, TAU); g.fill();
    g.fillStyle = '#e6dbc2';
    g.beginPath();
    g.moveTo(-6, -9); g.arc(-10, -9, 4.5, 0, TAU);
    g.moveTo(10.5, 2); g.arc(7, 2, 3.5, 0, TAU);
    g.moveTo(-3.5, 11); g.arc(-6, 11, 2.6, 0, TAU);
    g.moveTo(8, -13); g.arc(6.5, -13, 1.6, 0, TAU);
    g.fill();
    g.restore();
  }

  function aurora(g, c, W, t, flare) {
    const amp = clamp(0.75 + flare * 0.25, 0, 1);
    for (let i = 0; i < AURORA.length; i++) {
      const a = AURORA[i];
      const w = clamp(a.w * W, 220, 820), x0 = a.u * W - (w - a.w * W) * 0.5 + Math.sin(t * 0.06 + a.s) * 26;
      const hem = (u) => a.y + 6 * Math.sin(u * 6.2 + t * 0.33 + a.s) + 3 * Math.sin(u * 14 - t * 0.5 + a.s);
      const top = (u) => hem(u) - a.h * Math.pow(Math.max(0, Math.sin(PI * u)), 0.7) * (0.62 + 0.38 * Math.sin(u * 4.4 + t * 0.2 + a.s * 1.7));
      g.globalAlpha = amp;
      g.fillStyle = c.aur[i];
      g.beginPath();
      const n = 26;
      for (let j = 0; j <= n; j++) { const u = j / n, x = x0 + u * w, y = top(u); j ? g.lineTo(x, y) : g.moveTo(x, y); }
      for (let j = n; j >= 0; j--) { const u = j / n; g.lineTo(x0 + u * w, hem(u)); }
      g.closePath(); g.fill();
      // Vertical rays that shimmer slowly.
      const rays = Math.floor(w / 7);
      g.lineWidth = 2.4; g.lineCap = 'butt';
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? a.ray2 : a.ray1;
        g.globalAlpha = clamp(amp * (pass ? 0.8 + flare : 1), 0, 1);
        g.beginPath();
        for (let r = 0; r < rays; r++) {
          if ((hash(r * 2.9 + i * 7.3) > 0.62) !== !!pass) continue;
          const u = (r + 0.5) / rays, x = x0 + u * w, yb = hem(u) - 1;
          const k = 0.3 + 0.62 * (0.5 + 0.5 * Math.sin(t * 0.7 + r * 1.31 + i * 3.1));
          g.moveTo(x, yb); g.lineTo(x, lerp(yb, top(u), k));
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  /* ---------- Mountains and hills: faceted peaks with snow caps ---------- */
  const PK = [];
  for (let i = 0; i < 48; i++) PK.push({ ax: 0, h: 0, lx: 0, rx: 0, r: 0 });

  function facet(g, q, R) {
    const ax = q.ax, h = q.h, by = R.base, ay = by - h, lx = q.lx, rx = q.rx;
    const kx = ax + (rx - ax) * 0.17, ky = ay + h * 0.44, fx = ax + (rx - ax) * 0.05;
    fillPoly(g, R.sh, [ax, ay, rx, by, fx, by, kx, ky]);
    fillPoly(g, R.lit, [ax, ay, kx, ky, fx, by, lx, by]);
    fillPoly(g, R.mid, [lerp(ax, lx, 0.52), lerp(ay, by, 0.52), kx, ky, fx, by, lerp(lx, fx, 0.3), by]);
    if (!R.cap) return;
    const f = (0.24 + q.r * 0.16) * R.cap;
    const Lx = lerp(ax, lx, f), Ly = lerp(ay, by, f), Rx = lerp(ax, rx, f * 0.75), Ry = lerp(ay, by, f * 0.75);
    const m = Math.min(0.92, f * 1.15 / 0.44), Kx = lerp(ax, kx, m), Ky = lerp(ay, ky, m);
    fillPoly(g, R.capLit, [ax, ay, Lx, Ly,
      lerp(Lx, Kx, 0.36), lerp(Ly, Ky, 0.36) - h * 0.03,
      lerp(Lx, Kx, 0.62), lerp(Ly, Ky, 0.62) + h * 0.05,
      lerp(Lx, Kx, 0.82), lerp(Ly, Ky, 0.82) - h * 0.01, Kx, Ky]);
    fillPoly(g, R.capSh, [ax, ay, Kx, Ky,
      lerp(Kx, Rx, 0.45), lerp(Ky, Ry, 0.45) - h * 0.05,
      lerp(Kx, Rx, 0.72), lerp(Ky, Ry, 0.72) + h * 0.02, Rx, Ry]);
  }

  function ridge(g, W, off, R) {
    const k0 = Math.floor((off - 420) / R.sp), k1 = Math.ceil((off + W + 420) / R.sp);
    let n = 0;
    for (let k = k0; k <= k1 && n < PK.length; k++) {
      const i = mod(k, R.N), r1 = hash(i * 3.1 + R.seed), r2 = hash(i * 7.7 + R.seed), r3 = hash(i * 1.9 + R.seed);
      const h = R.hMin + r2 * R.hVar, ax = k * R.sp + (r1 - 0.5) * R.sp * 0.5 - off;
      const lx = ax - h * (R.wl * 0.75 + r3 * 0.7), rx = ax + h * (R.wr * 0.78 + r1 * 0.75);
      if (rx < -20 || lx > W + 20) continue;
      const q = PK[n++];
      q.ax = ax; q.h = h; q.lx = lx; q.rx = rx; q.r = r3;
    }
    // Taller peaks sit behind; insertion sort keeps it allocation free.
    for (let i = 1; i < n; i++) {
      const q = PK[i];
      let j = i - 1;
      while (j >= 0 && PK[j].h < q.h) { PK[j + 1] = PK[j]; j--; }
      PK[j + 1] = q;
    }
    for (let i = 0; i < n; i++) facet(g, PK[i], R);
  }

  /* ---------- Pines: stacked tiers with a lit side and snow on the branches ---------- */
  function pine(g, x, base, h, R) {
    const bw = h * 0.3;
    g.fillStyle = R.dark; g.beginPath();
    g.rect(x - h * 0.035, base - h * 0.16, h * 0.07, h * 0.16);
    for (let k = 0; k < 3; k++) {
      const yb = base - h * (0.12 + k * 0.25), yt = base - h * (0.5 + k * 0.25), hw = bw * (1 - k * 0.25);
      g.moveTo(x - hw, yb); g.lineTo(x, yt); g.lineTo(x + hw, yb); g.lineTo(x, yb - h * 0.045); g.closePath();
    }
    g.fill();
    g.fillStyle = R.lit; g.beginPath();
    for (let k = 0; k < 3; k++) {
      const yb = base - h * (0.12 + k * 0.25), yt = base - h * (0.5 + k * 0.25), hw = bw * (1 - k * 0.25);
      g.moveTo(x - hw, yb); g.lineTo(x, yt); g.lineTo(x, yb - h * 0.045); g.closePath();
    }
    g.fill();
    if (!R.snow) return;
    g.fillStyle = R.snow; g.beginPath();
    for (let k = 0; k < 3; k++) {
      const yb = base - h * (0.12 + k * 0.25), yt = base - h * (0.5 + k * 0.25), hw = bw * (1 - k * 0.25), d = yb - yt;
      g.moveTo(x, yt + 0.4); g.lineTo(x - hw * 0.5, yt + d * 0.5); g.lineTo(x - hw * 0.3, yt + d * 0.42);
      g.lineTo(x - hw * 0.1, yt + d * 0.5); g.lineTo(x + hw * 0.14, yt + d * 0.3); g.closePath();
    }
    g.fill();
  }

  function pines(g, W, off, R) {
    const k0 = Math.floor((off - 60) / R.sp), k1 = Math.ceil((off + W + 60) / R.sp);
    for (let k = k0; k <= k1; k++) {
      const i = mod(k, R.N);
      if (hash(i * 4.3 + R.seed) > R.dens + 0.35 * Math.sin(i * 0.47 + R.seed)) continue;
      const x = k * R.sp + (hash(i * 2.7 + R.seed) - 0.5) * R.sp * 0.7 - off;
      pine(g, x, R.base, R.hMin + hash(i * 5.1 + R.seed) * R.hVar, R);
    }
  }

  /* ---------- Ground: snow shelf with a lit top, scalloped lip and blue shaded face ---------- */
  /* Scallop edge points sit at k * P plus a fixed jitter, so neighbouring drips always join up. */
  const lipX = (k, P) => k * P + (hash(mod(k, 37) * 2.3 + 0.5) - 0.5) * P * 0.5;
  function lipPath(g, k0, k1, P, dist, dy) {
    const y = GROUND + 10 + dy;
    g.beginPath();
    g.moveTo(lipX(k1, P) - dist, GROUND - 1);
    g.lineTo(lipX(k0, P) - dist, GROUND - 1);
    g.lineTo(lipX(k0, P) - dist, y);
    for (let k = k0; k < k1; k++) {
      const xa = lipX(k, P) - dist, xb = lipX(k + 1, P) - dist, d = 2.5 + hash(mod(k, 41) * 1.7) * 4.5;
      g.quadraticCurveTo((xa + xb) / 2, y + d * 2, xb, y);
    }
    g.closePath();
  }

  function ground(g, c, W, H, dist, t) {
    g.fillStyle = c.face; g.fillRect(-20, GROUND, W + 40, H - GROUND + 40);
    // Layers in the snow, scrolling with the world.
    g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let s = 0; s < 2; s++) {
      const y0 = 456 + s * 23, ph = s * 2.1;
      g.strokeStyle = s ? 'rgba(84,96,160,.55)' : 'rgba(132,145,204,.6)';
      g.beginPath();
      for (let x = -24; x <= W + 48; x += 24) {
        const wx = x + dist, y = y0 + 3 * Math.sin(wx * 0.013 + ph) + 2 * Math.sin(wx * 0.037 + ph * 2);
        x === -24 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    const P = 30, k0 = Math.floor((dist - 40) / P), k1 = Math.ceil((dist + W + 40) / P);
    g.fillStyle = '#7f8ecb'; lipPath(g, k0, k1, P, dist, 4); g.fill();
    g.fillStyle = c.band; lipPath(g, k0, k1, P, dist, 0); g.fill();
    g.fillStyle = '#fbfcff'; g.fillRect(-20, GROUND - 0.5, W + 40, 1.6);
    // Glints in the snow.
    g.fillStyle = '#ffffff';
    const m = Math.ceil(W / 110), sp = W + 100;
    for (let i = 0; i < m; i++) {
      const a = Math.sin(t * 2.6 + i * 1.9);
      if (a < 0.6) continue;
      const x = mod(hash(i * 5.1 + 2) * sp - dist, sp) - 50, y = GROUND + 3 + hash(i * 2.3) * 6, s = (a - 0.6) * 3.5;
      g.fillRect(x - s, y - 0.35, 2 * s, 0.7); g.fillRect(x - 0.35, y - s, 0.7, 2 * s);
    }
  }

  function bank(g, c, W, off) {
    g.fillStyle = c.bank;
    g.beginPath(); g.moveTo(-20, GROUND + 4);
    for (let x = -20; x <= W + 38; x += 18) {
      const wx = x + off;
      g.lineTo(x, 403 + 4 * Math.sin(wx * 0.011) + 2.5 * Math.sin(wx * 0.029 + 1.3));
    }
    g.lineTo(W + 38, GROUND + 4); g.closePath(); g.fill();
  }

  function snowfall(g, W, H, t, dist, n, par, r, color, fall, seed) {
    g.fillStyle = color;
    g.beginPath();
    const span = W + 40;
    for (let i = 0; i < n; i++) {
      const h1 = hash(i * 1.37 + seed), h2 = hash(i * 2.71 + seed), h3 = hash(i * 0.93 + seed);
      const y = mod(h2 * (H + 20) + t * fall * (0.7 + 0.6 * h3), H + 20) - 10;
      const x = mod(h1 * span - dist * par - t * 16 * par + Math.sin(t * 1.1 + i) * 6, span) - 20;
      const rr = r * (0.7 + 0.6 * h3);
      g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU);
    }
    g.fill();
  }

  function scenery(g, c, W, H, dist, t, flare) {
    sky(g, c, W, t);
    moon(g, c, W * 0.79, 128);
    aurora(g, c, W, t, flare);
    ridge(g, W, dist * 0.03, RIDGE_A);
    g.fillStyle = c.hazeA; g.fillRect(-20, 210, W + 40, 200);
    ridge(g, W, dist * 0.06, RIDGE_B);
    g.fillStyle = c.hazeB; g.fillRect(-20, 270, W + 40, 140);
    ridge(g, W, dist * 0.14, HILLS);
    g.fillStyle = c.hazeC; g.fillRect(-20, 330, W + 40, 90);
    snowfall(g, W, H, t, dist, Math.round(W / 800 * 46), 0.3, 1, 'rgba(236,240,252,.5)', 26, 3.3);
    pines(g, W, dist * 0.32, PINE_A);
    pines(g, W, dist * 0.48, PINE_B);
    bank(g, c, W, dist * 0.62);
    ground(g, c, W, H, dist, t);
  }

  /* ---------- Obstacles ---------- */
  function mound(g, x0, x1) {
    const cx = (x0 + x1) / 2, w = (x1 - x0) / 2;
    g.fillStyle = '#c6d1ec';
    g.beginPath(); g.moveTo(x0 - 3, GROUND + 1); g.quadraticCurveTo(cx, GROUND - 11, x1 + 3, GROUND + 1); g.closePath(); g.fill();
    g.fillStyle = PAL.snow;
    g.beginPath(); g.moveTo(x0 - 1, GROUND); g.quadraticCurveTo(cx - w * 0.2, GROUND - 11, x1 - w * 0.3, GROUND - 1); g.lineTo(x1 - w * 0.5, GROUND + 0.5); g.closePath(); g.fill();
  }

  function shard(g, x0, x1, ax, ay) {
    const mx = (x0 + x1) / 2 + (ax - (x0 + x1) / 2) * 0.4;
    fillPoly(g, ICE.sh, [ax, ay, x1, GROUND - (GROUND - ay) * 0.4, x1, GROUND, mx, GROUND]);
    fillPoly(g, ICE.mid, [ax, ay, mx, GROUND, x0, GROUND, x0, GROUND - (GROUND - ay) * 0.5]);
  }

  function crystal(g, o, tt) {
    const G = GROUND;
    g.fillStyle = 'rgba(66,80,150,.28)';
    g.beginPath(); g.ellipse(o.x + o.w / 2 + 4, G + 2.5, o.w / 2 + 8, 3.5, 0, 0, TAU); g.fill();
    let top = 0, topX = 0;
    if (!o.broken) {
      const hl = o.hs[0] * 0.5, hr = o.hs[o.n - 1] * 0.44, xl = o.x - 6, xr = o.x + o.w - 6;
      shard(g, xl, xl + 12, xl + 1.5, GROUND - hl);
      shard(g, xr, xr + 12, xr + 10.5, GROUND - hr);
    }
    for (let i = 0; i < o.n; i++) {
      const sx = o.x + i * SPIKE, h = o.broken ? o.hs[i] * 0.34 : o.hs[i], l = o.broken ? 0 : o.lean[i];
      const blx = sx + 2, brx = sx + 22, ax = sx + 12 + l, ay = G - h;
      const lsx = sx + 3.5, lsy = G - h * 0.56, rsx = sx + 20.5 + l * 0.3, rsy = G - h * 0.5, mx = sx + 12 + l * 0.35;
      fillPoly(g, ICE.sh, [ax, ay, rsx, rsy, brx, G, mx, G]);
      fillPoly(g, ICE.deep, [rsx, rsy, brx, G, lerp(mx, brx, 0.5), G]);
      fillPoly(g, ICE.lit, [ax, ay, mx, G, blx, G, lsx, lsy]);
      fillPoly(g, ICE.mid, [lsx, lsy, lerp(ax, mx, 0.42), lerp(ay, G, 0.42), mx, G, blx, G]);
      fillPoly(g, '#ffffff', [ax, ay + 2, lerp(ax, lsx, 0.5) + 0.6, lerp(ay, lsy, 0.5), ax - 0.3, lerp(ay, G, 0.32)]);
      if (h > top) { top = h; topX = ax; }
    }
    mound(g, o.x, o.x + o.w);
    if (!o.broken) {
      const a = Math.sin(tt * 2.2 + o.seed);
      if (a > 0.3) {
        g.globalAlpha = (a - 0.3) / 0.7;
        NB.draw.star4(g, topX - 1, G - top + 4, 5 * a, 0, '#ffffff');
        g.globalAlpha = 1;
      }
    }
  }

  /* Faceted boulder: wide at the base, covering the hitbox x..x+w up to its top. */
  function boulder(g, x, w, by, h, b, P = ROCK) {
    const ty = by - h, mx = x + w * 0.52, my = by - h * 0.5;
    const b2 = b * 0.45;
    fillPoly(g, P.base, [x - b, by, x - b * 0.8, by - h * 0.3, x - b2, by - h * 0.66, x + 1, ty + 4, x + w * 0.45, ty + 1, x + w - 1, ty + 4,
      x + w + b2, by - h * 0.6, x + w + b * 0.85, by - h * 0.25, x + w + b, by]);
    fillPoly(g, P.lit, [x - b * 0.8, by - h * 0.3, x - b2, by - h * 0.66, x + 1, ty + 4, x + w * 0.45, ty + 1, mx, my, x + w * 0.16, by - h * 0.22]);
    fillPoly(g, P.top, [x - b2, by - h * 0.66, x + 1, ty + 4, x + w * 0.45, ty + 1, x + w * 0.26, by - h * 0.72]);
    fillPoly(g, P.sh, [x + w * 0.45, ty + 1, x + w - 1, ty + 4, x + w + b2, by - h * 0.6, x + w + b * 0.85, by - h * 0.25, x + w + b, by, x + w * 0.62, by, mx, my]);
    fillPoly(g, P.deep, [x + w + b2, by - h * 0.6, x + w + b * 0.85, by - h * 0.25, x + w + b, by, x + w * 0.92, by, x + w * 0.84, by - h * 0.32]);
  }

  /* Pillow of snow (or moss) sitting on a rock top at ty, spanning x..x+w. */
  function pillow(g, x, w, ty, P = ROCK) {
    PP.length = 0;
    PP.push(x - 3, ty + 9, x - 1.5, ty + 1.2, x + w * 0.3, ty - 1.2, x + w * 0.72, ty - 0.6, x + w + 1.5, ty + 1.2, x + w + 3, ty + 9,
      x + w - 3, ty + 11.5, x + w * 0.62, ty + 8.5, x + w * 0.45, ty + 12.5, x + w * 0.25, ty + 9, x + 2, ty + 11.5);
    g.save();
    g.translate(0.5, 2.2);
    g.fillStyle = P.under; smooth(g, PP, 11); g.fill();
    g.restore();
    g.fillStyle = P.snow; smooth(g, PP, 11); g.fill();
    g.save(); g.clip();
    fillPoly(g, P.snowSh, [x + w * 0.58, ty - 4, x + w + 6, ty - 4, x + w + 6, ty + 14, x + w * 0.45, ty + 14, x + w * 0.5, ty + 6]);
    fillPoly(g, P.snowSh, [x - 6, ty + 7.5, x + w + 6, ty + 6.5, x + w + 6, ty + 14, x - 6, ty + 14]);
    g.restore();
  }

  function rock(g, o) {
    const G = GROUND, x = o.x, w = o.w, h = o.h;
    g.fillStyle = 'rgba(66,80,150,.3)';
    g.beginPath(); g.ellipse(x + w / 2 + 6, G + 2.5, w / 2 + 16, 3.8, 0, 0, TAU); g.fill();
    if (h > 64) {
      const lo = h * 0.54;
      boulder(g, x - 3, w + 6, G, lo, 12);
      if (o.cap) pillow(g, x - 5, w + 10, G - lo + 1);
      boulder(g, x + 2, w - 4, G - lo + 7, h - lo + 7, 5);
    } else boulder(g, x, w, G, h, 12);
    if (o.cap) pillow(g, x, w, G - h);
    mound(g, x - 11, x + w + 11);
  }

  /* Owl, flying left (snowy in winter, tawny otherwise). f is the wing beat (-1 down, 1 up). */
  function wing(g, f, far, P) {
    const len = 11 + 15 * Math.abs(f);
    g.save();
    g.translate(far ? 3.5 : 0.5, far ? -6.5 : -4.5);
    g.scale(1, (f >= 0 ? 1 : -1) * len / 26);
    g.fillStyle = far ? P.far : P.white;
    g.beginPath();
    g.moveTo(-6, 1);
    g.quadraticCurveTo(-7.5, -12, -4, -19); g.quadraticCurveTo(-2.5, -24, -0.5, -26);
    g.lineTo(1.5, -22.5); g.lineTo(3.2, -25); g.lineTo(4.6, -20.5); g.lineTo(6.6, -22); g.lineTo(7.8, -17); g.lineTo(10, -17.5); g.lineTo(11.2, -11.5);
    g.quadraticCurveTo(11.5, -3, 7, 1.5);
    g.closePath(); g.fill();
    g.fillStyle = far ? P.tip : P.shade;
    g.beginPath();
    g.moveTo(-4.2, -18.6); g.quadraticCurveTo(-2.5, -24, -0.5, -26);
    g.lineTo(1.5, -22.5); g.lineTo(3.2, -25); g.lineTo(4.6, -20.5); g.lineTo(6.6, -22); g.lineTo(7.8, -17); g.lineTo(10, -17.5); g.lineTo(11.2, -11.5);
    g.lineTo(6, -13.5); g.lineTo(0, -15.5); g.closePath(); g.fill();
    if (!far) {
      g.strokeStyle = P.bar; g.lineWidth = 1.1; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      chev(g, -2.5, -7); chev(g, 2.5, -8); chev(g, 7, -7); chev(g, 0, -12); chev(g, 5, -12.5);
      g.stroke();
    }
    g.restore();
  }
  function chev(g, x, y) { g.moveTo(x - 1.5, y - 0.9); g.lineTo(x, y); g.lineTo(x + 1.5, y - 0.9); }

  function owl(g, x, y, f, tilt, P = OWL) {
    g.save();
    g.translate(x, y); g.rotate(tilt); g.scale(1.2, 1.2);
    wing(g, f, true, P);
    PP.length = 0;
    PP.push(-12, -10.5, -17.6, -5, -17.4, 1.5, -12, 6, -3, 8, 7, 6.6, 15, 3.6, 21.5, 0.8, 16.5, -3, 6, -6.8, -4, -9.6);
    g.fillStyle = P.white; smooth(g, PP, 11); g.fill();
    g.save(); g.clip();
    fillPoly(g, P.shade, [-20, 3.6, -8, 4.4, 4, 3, 24, -0.4, 24, 12, -20, 12]);
    g.restore();
    g.strokeStyle = P.bar; g.lineWidth = 1.1; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    chev(g, 2, -3.5); chev(g, 7, -2.8); chev(g, 12, -1.4); chev(g, 16.5, -0.2); chev(g, 4.5, 1); chev(g, 10, 1.8);
    g.stroke();
    g.fillStyle = P.face; g.beginPath(); g.ellipse(-12.6, -2.4, 5.2, 4.7, 0, 0, TAU); g.fill();
    g.fillStyle = P.eye; g.beginPath(); g.arc(-15, -3.4, 1.9, 0, TAU); g.arc(-10.6, -3.8, 1.9, 0, TAU); g.fill();
    g.fillStyle = P.pupil; g.beginPath(); g.arc(-15.4, -3.4, 0.95, 0, TAU); g.arc(-11, -3.8, 0.95, 0, TAU); g.fill();
    fillPoly(g, P.beak, [-13.9, -1.9, -12.1, -1.9, -13.1, 0.6]);
    wing(g, f, false, P);
    g.restore();
  }

  /* ---------- The fox ---------- */
  const LEG_OFF = [0.55, PI + 0.55, 0, PI];         // far hind, far front, near hind, near front
  const HIPS = [-9, -12, 8.5, -12.5, -11, -11.5, 6.5, -12];
  const LA = [0, 0, 0, 0], LK = [0, 0, 0, 0];
  const TP = new Array(40).fill(0);
  const FS = { pose: 'idle', phase: 0, vy: 0, spinK: 0, squash: 0, rot: 0, lying: false, tt: 0 };

  function limb(g, i, front, far) {
    const hx = HIPS[i * 2], hy = HIPS[i * 2 + 1], a = LA[i], k = LK[i], s = front ? 1 : -1;
    const a1 = a + s * k * 0.35, a2 = a - s * k;
    const kx = hx + Math.sin(a1) * 6.2, ky = hy + Math.cos(a1) * 6.2;
    const px = kx + Math.sin(a2) * 6.6, py = ky + Math.cos(a2) * 6.6;
    g.strokeStyle = far ? FOX.farLimb : FOX.limb; g.lineWidth = front ? 4.4 : 5.6;
    g.beginPath(); g.moveTo(hx, hy - 2.5); g.lineTo(kx, ky); g.stroke();
    g.strokeStyle = far ? FOX.far : FOX.dark; g.lineWidth = 3;
    g.beginPath(); g.moveTo(kx, ky); g.lineTo(px, py); g.stroke();
  }

  function tail(g) {
    const n = 8, L = 27;
    for (let i = 0; i <= n; i++) {
      const u = i / n, cx = -L * u, cy = -3 * u - 5 * u * u;
      const dx = -L, dy = -3 - 10 * u, dl = Math.hypot(dx, dy), nx = -dy / dl, ny = dx / dl;
      const w = 2 + 6.6 * Math.pow(Math.max(0, Math.sin(PI * Math.min(1, u * 1.06 + 0.02))), 0.8);
      TP[i * 2] = cx + nx * w; TP[i * 2 + 1] = cy + ny * w;
      TP[(2 * n + 1 - i) * 2] = cx - nx * w; TP[(2 * n + 1 - i) * 2 + 1] = cy - ny * w;
    }
    g.fillStyle = FOX.fur;
    smooth(g, TP, 2 * n + 2);
    g.fill();
    g.save(); g.clip();
    fillPoly(g, FOX.lit, [4, -2, -8, -4.4, -16, -7.4, -24, -11, -34, -16, -34, -30, 4, -30]);
    fillPoly(g, FOX.cream, [-18, -30, -40, -30, -40, 20, -20, 20]);
    fillPoly(g, FOX.creamSh, [-18.5, -6.6, -24, -9.4, -30, -12.6, -40, -16, -40, 20, -20, 20]);
    g.restore();
  }

  function torso(g) {
    g.beginPath();
    g.moveTo(-15, -14);
    g.quadraticCurveTo(-15.5, -21, -7, -21.6);
    g.quadraticCurveTo(2, -22.6, 9, -21);
    g.quadraticCurveTo(14.2, -19.6, 13.6, -14);
    g.quadraticCurveTo(12.6, -9.4, 7, -9.4);
    g.quadraticCurveTo(-2, -8.4, -9, -10);
    g.quadraticCurveTo(-14.6, -10.6, -15, -14);
    g.closePath();
    g.fillStyle = FOX.fur; g.fill();
    g.save(); g.clip();
    fillPoly(g, FOX.lit, [-17, -16.2, -6, -17.6, 5, -18.4, 15, -18, 15, -26, -17, -26]);
    fillPoly(g, FOX.sh, [-17, -11.8, -5, -11.2, 6, -10.8, 15, -11.4, 15, -6, -17, -6]);
    fillPoly(g, FOX.cream, [8.2, -20.5, 16, -20.5, 16, -7, 8.5, -7, 10.8, -12.5, 9.6, -16.5]);
    fillPoly(g, FOX.creamSh, [10.6, -12.5, 16, -13, 16, -7, 8.5, -7]);
    g.restore();
  }

  function ear(g, bx, by, tx, ty, cx, cy, flick, front) {
    if (flick) {
      const mx = (bx + cx) / 2, my = (by + cy) / 2, ca = Math.cos(-flick), sa = Math.sin(-flick), ux = tx - mx, uy = ty - my;
      tx = mx + ux * ca - uy * sa; ty = my + ux * sa + uy * ca;
    }
    fillPoly(g, front ? FOX.fur : FOX.sh, [bx, by, tx, ty, cx, cy]);
    if (front) fillPoly(g, FOX.creamSh, [lerp(bx, cx, 0.3), lerp(by, cy, 0.3), lerp(tx, (bx + cx) / 2, 0.3), lerp(ty, (by + cy) / 2, 0.3), lerp(bx, cx, 0.75), lerp(by, cy, 0.75)]);
    fillPoly(g, FOX.dark, [lerp(tx, bx, 0.42), lerp(ty, by, 0.42), tx, ty, lerp(tx, cx, 0.42), lerp(ty, cy, 0.42)]);
  }

  function head(g, a, flick, ko) {
    g.rotate(a);
    ear(g, -0.5, -5, 1.2, -15, 5, -6.5, flick * 0.6, false);
    ear(g, 3, -6.6, 6.8, -16.2, 9.6, -6, flick, true);
    g.beginPath();
    g.moveTo(-3, 1.5);
    g.quadraticCurveTo(-3.6, -6.6, 3, -7.6);
    g.quadraticCurveTo(8, -8.1, 11, -5);
    g.quadraticCurveTo(14, -2.6, 17.5, -1.3);
    g.quadraticCurveTo(18.7, -0.4, 17.6, 0.8);
    g.quadraticCurveTo(12, 3.4, 5, 4.4);
    g.quadraticCurveTo(-1.5, 4.8, -3, 1.5);
    g.closePath();
    g.fillStyle = FOX.fur; g.fill();
    g.save(); g.clip();
    fillPoly(g, FOX.lit, [-5, -10, 12, -10, 17.5, -2.6, 9, -3.4, 2, -2.6, -5, -1.2]);
    fillPoly(g, FOX.cream, [-5, 2, 2.5, -0.2, 8, 0.5, 13, -0.2, 19.5, -1.2, 19.5, 7, -5, 7]);
    fillPoly(g, FOX.creamSh, [-5, 3.6, 4, 3.3, 12, 2.6, 19.5, 1, 19.5, 7, -5, 7]);
    g.restore();
    if (ko) {
      g.strokeStyle = FOX.dark; g.lineWidth = 1.1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(8, -5); g.lineTo(10.6, -2.4); g.moveTo(10.6, -5); g.lineTo(8, -2.4); g.stroke();
    } else {
      g.fillStyle = FOX.dark; g.beginPath(); g.ellipse(9.4, -3.6, 1.55, 1.25, -0.25, 0, TAU); g.fill();
      g.fillStyle = PAL.cream; g.beginPath(); g.arc(9.9, -4.1, 0.45, 0, TAU); g.fill();
    }
    g.fillStyle = FOX.dark; g.beginPath(); g.arc(17.6, -0.5, 1.5, 0, TAU); g.fill();
  }

  function setLeg(i, a, k) { LA[i] = a; LK[i] = k; }

  /* x is the hitbox centre, y the feet line. */
  function fox(g, x, y, st) {
    const tt = st.tt, ph = st.phase;
    let pitch = 0, bob = 0, sx = 1, sy = 1, ta = 0.12, ha = 0, rot = 0, piv = -13, ko = false, flick = 0;
    const fe = mod(tt + 0.7, 3.3);
    if (fe < 0.2) flick = Math.sin(fe / 0.2 * PI) * 0.55;
    if (st.pose === 'run') {
      bob = -1.5 * Math.max(0, Math.sin(ph));
      pitch = 0.07 * Math.sin(ph + 0.9);
      ta = 0.12 + 0.22 * Math.sin(ph - 1.1);
      ha = -0.05 * Math.sin(ph + 0.3);
      for (let i = 0; i < 4; i++) { const q = ph + LEG_OFF[i]; setLeg(i, 0.8 * Math.sin(q), 0.2 + 1.2 * Math.max(0, Math.cos(q))); }
    } else if (st.pose === 'air') {
      const k = clamp(st.vy / 700, -1, 1), up = Math.max(0, -k), dn = Math.max(0, k);
      pitch = -0.2 * up + 0.16 * dn;
      sx = 1 + 0.1 * up; sy = 1 - 0.07 * up;
      ta = -0.3 * up + 0.4 * dn;
      ha = 0.1 * dn - 0.06 * up;
      flick = Math.max(flick, 0.4 * up);
      setLeg(0, -1.0 + 0.6 * dn, 0.15); setLeg(1, 1.0 - 0.5 * dn, 0.25);
      setLeg(2, -1.15 + 0.6 * dn, 0.1); setLeg(3, 1.15 - 0.55 * dn, 0.2);
      const sk = st.spinK;
      if (sk > 0 && sk < 1) {
        const tk = Math.sin(PI * sk);
        rot = easeInOut(sk) * TAU;
        for (let i = 0; i < 4; i++) {
          const front = i % 2 === 1;
          LA[i] = lerp(LA[i], front ? 1.25 : 0.55, tk); LK[i] = lerp(LK[i], front ? 1.9 : 1.8, tk);
        }
        ta = lerp(ta, 1.1, tk); pitch *= 1 - tk; sx = lerp(sx, 0.94, tk); sy = lerp(sy, 0.94, tk);
      }
    } else if (st.pose === 'idle') {
      sy = 1 + 0.022 * Math.sin(tt * 2.6);
      ta = 0.35 + 0.18 * Math.sin(tt * 1.6);
      ha = 0.06 * Math.sin(tt * 0.8) - 0.04;
      setLeg(0, -0.12, 0.25); setLeg(1, 0.08, 0.12); setLeg(2, -0.02, 0.2); setLeg(3, -0.06, 0.1);
    } else {
      rot = st.rot; piv = -11; ko = true;
      if (st.lying) {
        const tw = Math.sin(tt * 18) * 0.1;
        ha = 1.2; ta = -0.15;
        setLeg(0, -0.35 + tw, 0.3); setLeg(1, 0.35 - tw, 0.3); setLeg(2, -0.2 - tw, 0.25); setLeg(3, 0.2 + tw, 0.25);
      } else {
        for (let i = 0; i < 4; i++) setLeg(i, 0.9 * Math.sin(tt * 26 + i * 1.7), 0.6);
        ta = 0.6 * Math.sin(tt * 20);
      }
    }
    const sq = st.squash;
    g.save();
    g.translate(x, y);
    g.scale(sx * (1 + sq * 0.3), sy * (1 - sq * 0.26));
    if (rot) { g.translate(0, piv); g.rotate(rot); g.translate(0, -piv); }
    g.translate(-5, bob);
    if (pitch) { g.translate(0, -13); g.rotate(pitch); g.translate(0, 13); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    limb(g, 0, false, true); limb(g, 1, true, true);
    g.save(); g.translate(-13.5, -15.5); g.rotate(ta); tail(g); g.restore();
    torso(g);
    g.save(); g.translate(10, -19); head(g, ha, flick, ko); g.restore();
    limb(g, 2, false, false); limb(g, 3, true, false);
    g.restore();
  }

  function foxShadow(g, x, lift) {
    const k = clamp(1 - lift / 200, 0.25, 1);
    g.fillStyle = 'rgba(58,68,128,.3)';
    g.beginPath(); g.ellipse(x - 3, GROUND + 2.5, 19 * k, 3.4 * k, 0, 0, TAU); g.fill();
  }

  /* =====================================================================================
     Default season: a forest-edge meadow trail at late dusk, in the poster palette.
     No snow anywhere: fireflies, dust and petals, brambles, mossy stones, stumps and a tawny owl.
     ===================================================================================== */
  const DUST = ['#e2c49a', '#c99d6a', '#f0dcb8'];
  const PETAL = [PAL.coral, PAL.mustard, PAL.paper];
  const MOSS = { top: '#aba4bd', lit: '#948da8', base: '#77708a', sh: '#57516c', deep: '#443f57', snow: '#86ab52', snowSh: '#5f8341', under: '#3a384e' };
  const MOSSC = ['#86ab52', '#a9c96c', '#5f8341'];
  const WOOD = { bark: '#7a4c35', lit: '#9b6644', sh: '#55331f', groove: '#43281a', cut: '#e3b47c', ring: '#b98350', split: '#c58e5c' };
  const BR = { body: '#5c2e57', lit: '#7d4673', sh: '#3f1f3e', cane: '#2e1530', leaf: PAL.teal, leafLit: '#5cc2ad', berry: PAL.coral };
  const TAWNY = { white: '#b07a45', shade: '#8a5a33', far: '#7a4f2e', tip: '#5e3d24', bar: '#f0dcb4', beak: '#3a2a22', eye: '#ffb03a', pupil: '#1b1d2c', face: '#e3bc86' };
  const DUSK_RIDGE = { sp: 230, N: 13, base: 382, hMin: 44, hVar: 54, wl: 1.7, wr: 1.9, cap: 0, seed: 3.7, lit: '#806a97', mid: '#745f8d', sh: '#5f4d7b' };
  const FOREST_A = { sp: 22, N: 71, base: 405, hMin: 26, hVar: 36, seed: 4.6, dens: 0.55, leafy: 0.5, dark: '#26435a', lit: '#30516a' };
  const FOREST_B = { sp: 30, N: 59, base: 414, hMin: 40, hVar: 54, seed: 8.3, dens: 0.42, leafy: 0.45, dark: '#163a3d', lit: '#1f4e4e' };

  const GW = new WeakMap();
  function gradsWarm(g) {
    let c = GW.get(g);
    if (c) return c;
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, 150);
    halo.addColorStop(0, 'rgba(250,236,210,.32)');
    halo.addColorStop(0.28, 'rgba(246,220,196,.12)');
    halo.addColorStop(1, 'rgba(240,200,180,0)');
    c = {
      sky: lin(g, 0, 392, [0, '#13192b', 0.3, '#1b2a4a', 0.55, '#3d3466', 0.74, '#7d4a72', 0.88, '#d1665e', 1, '#f39a66']),
      hazeA: lin(g, 290, 384, [0, 'rgba(243,154,102,0)', 1, 'rgba(243,154,102,.55)']),
      hazeB: lin(g, 340, 404, [0, 'rgba(209,102,94,0)', 1, 'rgba(209,102,94,.36)']),
      verge: lin(g, 396, 418, [0, '#6c9259', 1, '#47714b']),
      trail: lin(g, GROUND, GROUND + 15, [0, '#dca86f', 1, '#b67f50']),
      meadow: lin(g, 424, 500, [0, '#3f6b49', 0.5, '#2b4f3e', 1, '#1c3530']),
      halo
    };
    GW.set(g, c);
    return c;
  }

  /* Low rolling hills: a smooth world-anchored curve, drawn twice for a thin moonlit rim. */
  function hills(g, W, off, base, amp, f, seed, rim, body) {
    const step = 40, k0 = Math.floor((off - 40) / step), k1 = Math.ceil((off + W + 40) / step);
    for (let pass = 0; pass < 2; pass++) {
      const dy = pass * 2.2;
      const yAt = (k) => { const wx = k * step; return base + dy - amp * (0.6 + 0.4 * Math.sin(wx * f + seed) + 0.3 * Math.sin(wx * f * 2.7 + seed * 1.9)); };
      g.fillStyle = pass ? body : rim;
      g.beginPath();
      g.moveTo(k0 * step - off, GROUND + 4); g.lineTo(k0 * step - off, yAt(k0));
      for (let k = k0 + 1; k < k1; k++) { const x = k * step - off, y = yAt(k); g.quadraticCurveTo(x, y, x + step / 2, (y + yAt(k + 1)) / 2); }
      g.lineTo(k1 * step - off, yAt(k1)); g.lineTo(k1 * step - off, GROUND + 4); g.closePath(); g.fill();
    }
  }

  /* Rounded broadleaf tree: three canopy lobes with a lit patch on the upper left. */
  function leafTree(g, x, base, h, R) {
    const r = h * 0.3, cy = base - h * 0.64;
    g.fillStyle = R.dark; g.beginPath();
    g.rect(x - h * 0.04, base - h * 0.42, h * 0.08, h * 0.42);
    g.moveTo(x + r, cy); g.arc(x, cy, r, 0, TAU);
    g.moveTo(x - r * 0.55 + r * 0.8, cy + r * 0.48); g.arc(x - r * 0.55, cy + r * 0.48, r * 0.8, 0, TAU);
    g.moveTo(x + r * 0.62 + r * 0.76, cy + r * 0.52); g.arc(x + r * 0.62, cy + r * 0.52, r * 0.76, 0, TAU);
    g.fill();
    g.fillStyle = R.lit; g.beginPath();
    g.moveTo(x - r * 0.3 + r * 0.55, cy - r * 0.3); g.arc(x - r * 0.3, cy - r * 0.3, r * 0.55, 0, TAU);
    g.moveTo(x - r * 0.8 + r * 0.4, cy + r * 0.25); g.arc(x - r * 0.8, cy + r * 0.25, r * 0.4, 0, TAU);
    g.fill();
  }

  function forest(g, W, off, R) {
    const k0 = Math.floor((off - 70) / R.sp), k1 = Math.ceil((off + W + 70) / R.sp);
    for (let k = k0; k <= k1; k++) {
      const i = mod(k, R.N);
      if (hash(i * 4.3 + R.seed) > R.dens + 0.35 * Math.sin(i * 0.47 + R.seed)) continue;
      const x = k * R.sp + (hash(i * 2.7 + R.seed) - 0.5) * R.sp * 0.7 - off, h = R.hMin + hash(i * 5.1 + R.seed) * R.hVar;
      if (hash(i * 6.7 + R.seed) < R.leafy) leafTree(g, x, R.base, h * 0.9, R); else pine(g, x, R.base, h, R);
    }
  }

  /* Meadow verge behind the trail: a grassy edge with tiny coral and mustard flowers. */
  function verge(g, c, W, off) {
    const k0 = Math.floor((off - 30) / 6), k1 = Math.ceil((off + W + 30) / 6);
    g.fillStyle = c.verge;
    g.beginPath(); g.moveTo(k0 * 6 - off, GROUND + 4);
    for (let k = k0; k <= k1; k++) {
      const wx = k * 6;
      g.lineTo(wx - off, 403 + 4 * Math.sin(wx * 0.011) + 2.5 * Math.sin(wx * 0.029 + 1.3) - (k & 1 ? 1.5 + hash(mod(k, 53) * 1.3) * 3.5 : 0));
    }
    g.lineTo(k1 * 6 - off, GROUND + 4); g.closePath(); g.fill();
    const j0 = Math.floor((off - 20) / 17), j1 = Math.ceil((off + W + 20) / 17);
    for (let pass = 0; pass < 2; pass++) {
      g.fillStyle = pass ? PAL.mustard : PAL.coral;
      g.beginPath();
      for (let k = j0; k <= j1; k++) {
        const i = mod(k, 61), r = hash(i * 3.9 + 1.7), coral = r < 0.25;
        if (r > 0.5 || coral !== (pass === 0)) continue;
        const wx = k * 17 + hash(i * 1.3) * 10, x = wx - off, y = 406 + 4 * Math.sin(wx * 0.011) + hash(i * 7.1) * 6;
        g.moveTo(x + 1.3, y); g.arc(x, y, 1.3, 0, TAU);
      }
      g.fill();
    }
  }

  const trailEdge = (wx) => GROUND + 12 + 2.2 * Math.sin(wx * 0.021) + 1.4 * Math.sin(wx * 0.057 + 2);

  function flower(g, x, y, s, col) {
    g.strokeStyle = '#2a5040'; g.lineWidth = 1.3 * s; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 1.5 * s, y - 5 * s, x + 0.5 * s, y - 10 * s); g.stroke();
    const hx = x + 0.5 * s, hy = y - 10 * s, pr = 1.9 * s;
    g.fillStyle = col; g.beginPath();
    for (let j = 0; j < 5; j++) {
      const a = j * TAU / 5 - PI / 2, px = hx + Math.cos(a) * pr, py = hy + Math.sin(a) * pr;
      g.moveTo(px + pr * 0.8, py); g.arc(px, py, pr * 0.8, 0, TAU);
    }
    g.fill();
    g.fillStyle = PAL.paper; g.beginPath(); g.arc(hx, hy, pr * 0.55, 0, TAU); g.fill();
  }

  function stone(g, x, y, s) {
    g.fillStyle = '#5d5a72'; g.beginPath(); g.ellipse(x, y, 5.5 * s, 3.4 * s, 0, PI, TAU); g.closePath(); g.fill();
    g.fillStyle = '#857f9c'; g.beginPath(); g.ellipse(x - 1.4 * s, y - 0.4 * s, 3.4 * s, 2.4 * s, 0, PI, TAU); g.closePath(); g.fill();
  }

  /* Foreground meadow below the trail: tufts, wildflowers and half-buried stones. */
  function meadowDecor(g, W, dist) {
    const sp = 34, k0 = Math.floor((dist - 40) / sp), k1 = Math.ceil((dist + W + 40) / sp);
    const at = (k, i) => {
      const y = 442 + hash(i * 5.3) * 52;
      TD.x = k * sp + (hash(i * 1.9) - 0.5) * sp * 0.8 - dist; TD.y = y; TD.s = 0.8 + (y - 442) / 52 * 0.7;
    };
    for (let pass = 0; pass < 2; pass++) {
      g.fillStyle = pass ? '#5f8c55' : '#24463a';
      g.beginPath();
      for (let k = k0; k <= k1; k++) {
        const i = mod(k, 97);
        if (hash(i * 3.7 + 0.4) > 0.5) continue;
        at(k, i);
        const x = TD.x, y = TD.y, s = TD.s;
        for (let j = 0; j < 4; j++) {
          if ((j === 1) !== (pass === 1)) continue;
          const bx = x + (j - 1.5) * 2.6 * s, hh = (7 + hash(i * 2.2 + j) * 6) * s, ln = (j - 1.5) * 2.2 * s;
          g.moveTo(bx - 1.5 * s, y); g.lineTo(bx + ln, y - hh); g.lineTo(bx + 1.5 * s, y); g.closePath();
        }
      }
      g.fill();
    }
    for (let k = k0; k <= k1; k++) {
      const i = mod(k, 97), r = hash(i * 3.7 + 0.4);
      if (r <= 0.5 || r >= 0.86) continue;
      at(k, i);
      if (r < 0.72) flower(g, TD.x, TD.y, TD.s, r < 0.61 ? PAL.coral : PAL.mustard);
      else stone(g, TD.x, TD.y, TD.s);
    }
  }
  const TD = { x: 0, y: 0, s: 1 };

  /* Grass blades along the trail's front edge, overlapping the dirt. */
  function fringe(g, W, dist) {
    const sp = 5, k0 = Math.floor((dist - 20) / sp), k1 = Math.ceil((dist + W + 20) / sp);
    for (let pass = 0; pass < 2; pass++) {
      g.fillStyle = pass ? '#6d9a5b' : '#2f5a40';
      g.beginPath();
      for (let k = k0; k <= k1; k++) {
        const i = mod(k, 89);
        if ((hash(i * 1.93 + 0.7) < 0.34) !== (pass === 1)) continue;
        const wx = k * sp + (hash(i * 4.1) - 0.5) * 3, x = wx - dist, by = trailEdge(wx) + 3, hh = 4 + hash(i * 2.6) * 6, ln = (hash(i * 3.3) - 0.5) * 4;
        g.moveTo(x - 1.4, by); g.lineTo(x + ln, by - hh); g.lineTo(x + 1.4, by); g.closePath();
      }
      g.fill();
    }
  }

  function groundWarm(g, c, W, H, dist) {
    g.fillStyle = c.meadow; g.fillRect(-20, GROUND, W + 40, H - GROUND + 40);
    meadowDecor(g, W, dist);
    g.fillStyle = c.trail;
    g.beginPath(); g.moveTo(-20, GROUND - 0.5); g.lineTo(W + 20, GROUND - 0.5);
    for (let x = W + 20; x >= -36; x -= 16) g.lineTo(x, trailEdge(x + dist));
    g.closePath(); g.fill();
    // Wheel ruts and pebbles in the dirt.
    g.strokeStyle = 'rgba(140,92,58,.42)'; g.lineWidth = 1.2; g.lineCap = 'round';
    g.beginPath();
    const span = W + 200, n = Math.ceil(span / 90);
    for (let i = 0; i < n; i++) {
      const x = mod(hash(i * 3.31 + 7) * span - dist, span) - 100, y = GROUND + 3.5 + hash(i * 7.13 + 2) * 5, len = 14 + hash(i * 1.37 + 5) * 30;
      g.moveTo(x, y); g.lineTo(x + len, y);
    }
    g.stroke();
    const ps = 47, p0 = Math.floor((dist - 30) / ps), p1 = Math.ceil((dist + W + 30) / ps);
    for (let pass = 0; pass < 2; pass++) {
      g.fillStyle = pass ? '#b3a196' : '#7f6e6a';
      g.beginPath();
      for (let k = p0; k <= p1; k++) {
        const i = mod(k, 43), r = hash(i * 2.9 + 3.1);
        if (r > 0.6) continue;
        const x = k * ps + hash(i * 5.7) * 30 - dist, y = GROUND + 4 + hash(i * 1.1) * 5, sz = 1.4 + r * 2.2;
        if (pass) { g.moveTo(x - sz * 0.25 + sz * 0.5, y - sz * 0.3); g.ellipse(x - sz * 0.25, y - sz * 0.3, sz * 0.5, sz * 0.32, 0, 0, TAU); }
        else { g.moveTo(x + sz, y); g.ellipse(x, y, sz, sz * 0.62, 0, 0, TAU); }
      }
      g.fill();
    }
    fringe(g, W, dist);
    g.fillStyle = '#f0c994'; g.fillRect(-20, GROUND - 0.5, W + 40, 1.4);
  }

  /* Fireflies: soft gold motes that drift and blink in four groups. */
  function fireflies(g, W, t, dist, n, par, r, y0, y1, seed, boost) {
    const span = W + 60;
    for (let b = 0; b < 4; b++) {
      const a = clamp(0.1 + 0.9 * Math.pow(Math.max(0, Math.sin(t * (1.3 + b * 0.41) + b * 1.7)), 2) + boost * 0.4, 0, 1);
      for (let pass = 0; pass < 2; pass++) {
        const rr = pass ? r : r * 3.2;
        g.globalAlpha = pass ? a : a * 0.2;
        g.fillStyle = pass ? '#fff0b0' : PAL.mustard;
        g.beginPath();
        for (let i = b; i < n; i += 4) {
          const h1 = hash(i * 1.37 + seed), h2 = hash(i * 2.71 + seed);
          const x = mod(h1 * span - dist * par + Math.sin(t * 0.55 + i * 1.3) * 16, span) - 30;
          const y = lerp(y0, y1, h2) + Math.sin(t * 0.8 + i * 2.1) * 9 + Math.sin(t * 1.9 + i) * 3;
          g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU);
        }
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  function sceneryWarm(g, c, W, H, dist, t, flare) {
    sky(g, c, W, t);
    moon(g, c, W * 0.79, 128);
    ridge(g, W, dist * 0.04, DUSK_RIDGE);
    g.fillStyle = c.hazeA; g.fillRect(-20, 280, W + 40, 130);
    hills(g, W, dist * 0.1, 394, 34, 0.0065, 1.7, '#665b8c', '#4e4575');
    g.fillStyle = c.hazeB; g.fillRect(-20, 330, W + 40, 80);
    hills(g, W, dist * 0.18, 404, 24, 0.009, 4.1, '#4b5781', '#36415f');
    fireflies(g, W, t, dist, Math.round(W / 800 * 24), 0.3, 1.1, 330, 400, 2.9, flare);
    forest(g, W, dist * 0.32, FOREST_A);
    forest(g, W, dist * 0.48, FOREST_B);
    verge(g, c, W, dist * 0.62);
    groundWarm(g, c, W, H, dist);
  }

  /* ---------- Default-season obstacles (same hitboxes as the winter ones) ---------- */
  function grassBase(g, x0, x1) {
    for (let pass = 0; pass < 2; pass++) {
      g.fillStyle = pass ? '#7aa462' : '#3f6b49';
      g.beginPath();
      for (let x = x0, j = 0; x <= x1; x += 3.6, j++) {
        if ((j % 3 === 0) !== (pass === 1)) continue;
        const hh = 4 + ((j * 7) % 5), ln = ((j * 5) % 7 - 3) * 0.8;
        g.moveTo(x - 1.4, GROUND + 1.5); g.lineTo(x + ln, GROUND + 1.5 - hh); g.lineTo(x + 1.4, GROUND + 1.5); g.closePath();
      }
      g.fill();
    }
  }

  /* An arching bramble cane with thorns along it. */
  function cane(g, x0, y0, cx, cy, x1, y1) {
    g.strokeStyle = BR.cane; g.lineWidth = 1.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
    g.fillStyle = BR.cane; g.beginPath();
    for (let k = 1; k <= 3; k++) {
      const t = k / 4, u = 1 - t;
      const px = u * u * x0 + 2 * u * t * cx + t * t * x1, py = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy), dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl, uy = dy / dl, sd = k % 2 ? 1 : -1;
      g.moveTo(px - ux * 1.3, py - uy * 1.3); g.lineTo(px - uy * 2.8 * sd, py + ux * 2.8 * sd); g.lineTo(px + ux * 1.3, py + uy * 1.3); g.closePath();
    }
    g.fill();
  }

  function leaf(g, x, y, a, len, col) {
    const ca = Math.cos(a), sa = Math.sin(a), w = len * 0.38;
    g.fillStyle = col;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + ca * len * 0.5 - sa * w, y + sa * len * 0.5 + ca * w); g.lineTo(x + ca * len, y + sa * len); g.lineTo(x + ca * len * 0.5 + sa * w, y + sa * len * 0.5 - ca * w); g.closePath(); g.fill();
  }

  /* Thorny bramble clump over each 24-wide unit; the outline covers the triangular hitbox. */
  function bramble(g, o) {
    const G = GROUND;
    g.fillStyle = 'rgba(20,26,40,.32)';
    g.beginPath(); g.ellipse(o.x + o.w / 2 + 4, G + 2.5, o.w / 2 + 9, 3.5, 0, 0, TAU); g.fill();
    for (let i = 0; i < o.n; i++) {
      const sx = o.x + i * SPIKE, h = o.broken ? o.hs[i] * 0.42 : o.hs[i], ax = sx + 12 + (o.broken ? 0 : o.lean[i] * 0.5);
      fillPoly(g, BR.body, [sx - 1.5, G, sx + 1, G - h * 0.45, sx + 3.5, G - h * 0.66, sx + 5.5, G - h * 0.57, sx + 8, G - h * 0.92, sx + 9.8, G - h * 0.8, ax, G - h,
        sx + 14.4, G - h * 0.83, sx + 17, G - h * 0.9, sx + 18.3, G - h * 0.64, sx + 21.5, G - h * 0.62, sx + 22.6, G - h * 0.4, sx + 25.5, G]);
      fillPoly(g, BR.lit, [sx + 1, G - h * 0.45, sx + 3.5, G - h * 0.66, sx + 5.5, G - h * 0.57, sx + 8, G - h * 0.92, sx + 9.8, G - h * 0.8, ax, G - h, sx + 11.5, G - h * 0.5, sx + 5, G - h * 0.24]);
      fillPoly(g, BR.sh, [ax, G - h, sx + 14.4, G - h * 0.83, sx + 17, G - h * 0.9, sx + 18.3, G - h * 0.64, sx + 21.5, G - h * 0.62, sx + 22.6, G - h * 0.4, sx + 25.5, G, sx + 13.5, G, sx + 12.6, G - h * 0.5]);
    }
    const h0 = o.broken ? o.hs[0] * 0.42 : o.hs[0], hn = o.broken ? o.hs[o.n - 1] * 0.42 : o.hs[o.n - 1], xr = o.x + o.w;
    cane(g, o.x + 5, G - h0 * 0.3, o.x - 4, G - h0 * 0.85, o.x - 7, G - h0 * 0.4);
    cane(g, xr - 5, G - hn * 0.3, xr + 4, G - hn * 0.9, xr + 7, G - hn * 0.45);
    for (let i = 0; i < o.n; i++) {
      const sx = o.x + i * SPIKE, h = o.broken ? o.hs[i] * 0.42 : o.hs[i];
      if (!o.broken) cane(g, sx + 8, G - h * 0.55, sx + 9, G - h * 1.06, sx + 16, G - h * 0.96);
      leaf(g, sx + 6, G - h * 0.5, -2.4, 6.5, BR.leaf);
      leaf(g, sx + 15, G - h * 0.66, -0.7, 6, BR.leafLit);
      leaf(g, sx + 18, G - h * 0.3, 0.2, 5.5, BR.leaf);
      g.fillStyle = BR.berry; g.beginPath();
      for (let j = 0; j < 4; j++) {
        if (hash(o.seed * 3.1 + i * 4 + j) < 0.3) continue;
        const bx = sx + [7, 13, 18.5, 10.5][j], by = G - h * [0.38, 0.72, 0.46, 0.2][j];
        g.moveTo(bx + 1.9, by); g.arc(bx, by, 1.9, 0, TAU);
      }
      g.fill();
      g.fillStyle = PAL.paper; g.beginPath();
      for (let j = 0; j < 4; j++) {
        if (hash(o.seed * 3.1 + i * 4 + j) < 0.3) continue;
        const bx = sx + [7, 13, 18.5, 10.5][j] - 0.6, by = G - h * [0.38, 0.72, 0.46, 0.2][j] - 0.6;
        g.moveTo(bx + 0.55, by); g.arc(bx, by, 0.55, 0, TAU);
      }
      g.fill();
    }
    grassBase(g, o.x - 6, o.x + o.w + 6);
  }

  function mushroom(g, x, y, s) {
    g.fillStyle = PAL.paper; g.fillRect(x - 0.8 * s, y - 5 * s, 1.6 * s, 5 * s);
    g.fillStyle = PAL.coral; g.beginPath(); g.ellipse(x, y - 5 * s, 3.4 * s, 2.6 * s, 0, PI, TAU); g.closePath(); g.fill();
    g.fillStyle = PAL.paper; g.beginPath();
    g.moveTo(x - 1.2 * s + 0.6 * s, y - 6.2 * s); g.arc(x - 1.2 * s, y - 6.2 * s, 0.6 * s, 0, TAU);
    g.moveTo(x + 1.3 * s + 0.5 * s, y - 6.5 * s); g.arc(x + 1.3 * s, y - 6.5 * s, 0.5 * s, 0, TAU);
    g.fill();
  }

  /* Tree stump (short) or broken snag (tall) filling the rock hitbox x..x+w. */
  function stump(g, o) {
    const G = GROUND, x = o.x, w = o.w, h = o.h, ty = G - h, tall = h > 64;
    g.fillStyle = 'rgba(20,26,40,.32)';
    g.beginPath(); g.ellipse(x + w / 2 + 5, G + 2.5, w / 2 + 14, 3.6, 0, 0, TAU); g.fill();
    fillPoly(g, WOOD.bark, [x - 8, G, x - 2.5, G - 5, x + 0.5, G - 13, x + 0.5, ty + 4, x + w - 0.5, ty + 4, x + w - 0.5, G - 11, x + w + 3, G - 4.5, x + w + 9, G]);
    fillPoly(g, WOOD.lit, [x - 8, G, x - 2.5, G - 5, x + 0.5, G - 13, x + 0.5, ty + 4, x + w * 0.32, ty + 4, x + w * 0.27, G - 3, x + w * 0.12, G]);
    fillPoly(g, WOOD.sh, [x + w * 0.72, ty + 4, x + w - 0.5, ty + 4, x + w - 0.5, G - 11, x + w + 3, G - 4.5, x + w + 9, G, x + w * 0.78, G]);
    g.strokeStyle = WOOD.groove; g.lineWidth = 1.1; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x + w * 0.46, ty + 9); g.lineTo(x + w * 0.43, ty + h * 0.45); g.lineTo(x + w * 0.48, G - 5);
    g.moveTo(x + w * 0.62, ty + 7); g.lineTo(x + w * 0.65, ty + h * 0.6);
    g.moveTo(x + w * 0.18, ty + h * 0.3); g.lineTo(x + w * 0.2, ty + h * 0.62);
    g.stroke();
    if (tall) {
      fillPoly(g, WOOD.bark, [x + 0.5, ty + 7, x + 0.5, ty + 0.5, x + 6, ty + 4.5, x + 11, ty - 0.5, x + 17, ty + 4, x + 24, ty, x + w - 0.5, ty + 4, x + w - 0.5, ty + 7]);
      fillPoly(g, WOOD.split, [x + 6, ty + 4.5, x + 11, ty - 0.5, x + 13, ty + 6, x + 17, ty + 4, x + 24, ty, x + 22, ty + 6.5]);
      fillPoly(g, WOOD.sh, [x + w - 1, ty + h * 0.35, x + w + 7, ty + h * 0.3 - 3, x + w + 7.5, ty + h * 0.3, x + w - 1, ty + h * 0.35 + 4]);
    } else {
      g.fillStyle = WOOD.sh; g.beginPath(); g.ellipse(x + w / 2, ty + 4.6, w / 2 + 0.5, 4.4, 0, 0, TAU); g.fill();
      g.fillStyle = WOOD.cut; g.beginPath(); g.ellipse(x + w / 2, ty + 3.6, w / 2 - 0.5, 3.7, 0, 0, TAU); g.fill();
      g.strokeStyle = WOOD.ring; g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(x + w / 2 + w * 0.3, ty + 3.6); g.ellipse(x + w / 2, ty + 3.6, w * 0.3, 2.3, 0, 0, TAU);
      g.moveTo(x + w / 2 + w * 0.13, ty + 3.6); g.ellipse(x + w / 2, ty + 3.6, w * 0.13, 1.1, 0, 0, TAU);
      g.stroke();
    }
    fillPoly(g, MOSS.snow, [x + 0.5, ty + 10, x + 6, ty + 8, x + 9, ty + 13, x + 4, ty + 17, x + 0.5, ty + 16]);
    mushroom(g, x + w + 5, G, 1); mushroom(g, x + w + 9.5, G + 0.5, 0.7);
    grassBase(g, x - 10, x + w + 12);
  }

  function sprigs(g, x, w, ty) {
    g.fillStyle = '#a9c96c'; g.beginPath();
    for (let j = 0; j < 3; j++) {
      const bx = x + w * (0.22 + j * 0.28), hh = 4 + j % 2 * 1.5;
      g.moveTo(bx - 1.2, ty + 1.5); g.lineTo(bx + (j - 1) * 1.2, ty + 1.5 - hh); g.lineTo(bx + 1.2, ty + 1.5); g.closePath();
    }
    g.fill();
  }

  /* Mossy boulder (or stacked pair), or a stump when the rock rolled that variant. */
  function mossRock(g, o) {
    if (o.v) { stump(g, o); return; }
    const G = GROUND, x = o.x, w = o.w, h = o.h;
    g.fillStyle = 'rgba(20,26,40,.32)';
    g.beginPath(); g.ellipse(x + w / 2 + 6, G + 2.5, w / 2 + 16, 3.8, 0, 0, TAU); g.fill();
    if (h > 64) {
      const lo = h * 0.54;
      boulder(g, x - 3, w + 6, G, lo, 12, MOSS);
      if (o.cap) pillow(g, x - 5, w + 10, G - lo + 1, MOSS);
      boulder(g, x + 2, w - 4, G - lo + 7, h - lo + 7, 5, MOSS);
    } else boulder(g, x, w, G, h, 12, MOSS);
    if (o.cap) { pillow(g, x, w, G - h, MOSS); sprigs(g, x, w, G - h); }
    grassBase(g, x - 12, x + w + 12);
  }

  /* ---------- Attract mode: stateless scratch objects ---------- */
  const TC = { x: 0, n: 1, w: SPIKE, h: 40, hs: [0, 0, 0], lean: [0, 0, 0], broken: false, seed: 0 };
  const TR = { x: 0, w: 34, h: 50, cap: true, v: 0 };
  const TO = [];

  NB.register({
    id: 'tundra-dash',
    title: 'Foxfire Run',
    tags: ['One-tap', 'Action'],
    accent: PAL.coral,
    order: 5,
    blurb: 'Run a fox through the night. Jump whatever blocks the trail, flip over the tall stuff, stay low when an owl swoops past, and grab the north stars on the way.',
    controls: [['Space / ↑ / tap', 'Jump, again in the air to flip'], ['Hold', 'Jump higher']],

    thumb(g, W, H, t, opts) {
      const winter = !!NB.winter, c = winter ? grads(g) : gradsWarm(g);
      const speed = 320, dist = t * speed;
      const fxp = opts && opts.runnerX != null ? W * opts.runnerX : Math.min(150, W * 0.3);
      const GAP = 440, FIRST = 520, L = 250, HM = 104;
      g.save();
      if (winter) scenery(g, c, W, H, dist, t, 0); else sceneryWarm(g, c, W, H, dist, t, 0);
      let lift = 0, vy = 0, air = false, land = 9, spinK = 0, takeoff = -1;
      TO.length = 0;
      const k0 = Math.floor((dist - FIRST - 160) / GAP), k1 = Math.ceil((dist + W + 160 - FIRST) / GAP);
      for (let k = k0; k <= k1; k++) {
        const ox = FIRST + k * GAP - dist;
        if (mod(k, 5) === 3) { TO.push(ox); continue; }
        const isRock = hash(k * 1.731 + 0.37) > 0.58;
        let w, h;
        if (isRock) {
          TR.x = ox; TR.h = h = 44 + hash(k * 3.3) * 12; w = TR.w;
          if (winter) rock(g, TR); else { TR.v = hash(k * 2.13 + 0.9) < 0.5 ? 1 : 0; mossRock(g, TR); }
        } else {
          TC.x = ox; TC.n = hash(k * 2.9 + 0.1) > 0.55 ? 2 : 1; TC.w = w = TC.n * SPIKE; TC.h = h = 32 + hash(k * 4.1) * 12;
          TC.seed = k;
          for (let i = 0; i < TC.n; i++) { TC.hs[i] = i === 0 ? h : h * 0.78; TC.lean[i] = TC.n > 1 ? (i ? 2 : -2) : 0; }
          if (winter) crystal(g, TC, t); else bramble(g, TC);
        }
        const oc = ox + w / 2, s = (L / 2 - (oc - fxp)) / L;
        if (s > 0 && s < 1) {
          air = true; lift = 4 * HM * s * (1 - s); vy = -4 * HM * (1 - 2 * s) * speed / L;
          if (isRock) spinK = clamp((s - 0.24) / 0.52, 0, 1);
          if (s < 0.14) takeoff = s;
        } else if (s >= 1) land = Math.min(land, (s - 1) * L / speed);
        // Arcs of stars along the jump path; the fox collects them as it passes.
        if (hash(k * 5.3 + 0.2) < 0.62) {
          for (let j = -1; j <= 1; j++) {
            const gx = oc + j * 34, sj = 0.5 + j * 34 / L, gy = GROUND - 16 - 4 * HM * sj * (1 - sj);
            if (gx > fxp + 2) gem(g, gx, gy + Math.sin(t * 3.2 + j) * 2, 8.5, Math.sin(t * 1.8 + j) * 0.2, STAR);
            else if (gx > fxp - 70) {
              const a = (fxp + 2 - gx) / 72;
              g.globalAlpha = 1 - a;
              g.strokeStyle = PAL.gold; g.lineWidth = 2 * (1 - a) + 0.5;
              g.beginPath(); g.arc(gx, gy, 5 + a * 20, 0, TAU); g.stroke();
              NB.draw.star4(g, gx, gy - a * 16, 9 * (1 - a) + 1, a * 2, STAR[0]);
              g.globalAlpha = 1;
            }
          }
        }
      }
      // Puffs on take-off and landing (snow or dust), kick-ups while running.
      g.fillStyle = winter ? PAL.snow : DUST[2];
      if (takeoff >= 0) {
        const a = takeoff / 0.14, bx = fxp - takeoff * L;
        g.globalAlpha = 0.85 * (1 - a);
        g.beginPath();
        for (let j = -1; j <= 1; j += 2) { const px = bx + j * (6 + a * 16), r = 2.5 + a * 4; g.moveTo(px + r, GROUND - 3 - a * 5); g.arc(px, GROUND - 3 - a * 5, r, 0, TAU); }
        g.fill();
      }
      if (land < 0.42) {
        const a = land / 0.42;
        g.globalAlpha = 0.85 * (1 - a);
        g.beginPath();
        for (let j = -2; j <= 2; j++) {
          if (!j) continue;
          const px = fxp - 3 + j * (5 + a * 15), py = GROUND - 2 - a * 6 * (3 - Math.abs(j)), r = 2.4 + a * 4.5;
          g.moveTo(px + r, py); g.arc(px, py, r, 0, TAU);
        }
        g.fill();
      }
      if (!air && land > 0.12) {
        g.globalAlpha = 0.8;
        g.beginPath();
        for (let j = 0; j < 3; j++) {
          const a = mod(t * 3.2 + j / 3, 1), px = fxp - 16 - a * 26, py = GROUND - 2 - Math.sin(a * PI) * 7, r = 1.8 * (1 - a) + 0.2;
          g.moveTo(px + r, py); g.arc(px, py, r, 0, TAU);
        }
        g.fill();
      }
      g.globalAlpha = 1;
      foxShadow(g, fxp, lift);
      FS.tt = t; FS.phase = t * 19; FS.vy = vy; FS.rot = 0; FS.lying = false;
      FS.pose = air ? 'air' : 'run'; FS.spinK = air ? spinK : 0;
      FS.squash = !air && land < 0.16 ? (1 - land / 0.16) * 0.8 : 0;
      fox(g, fxp, GROUND - lift, FS);
      for (const ox of TO) {
        const ap = clamp((ox - fxp - 260) / 300, 0, 1), glide = clamp((ap - 0.2) / 0.3, 0, 1);
        const oy = GROUND - 90 - ap * ap * 130 + (1 - ap) * Math.sin(t * 4 + ox * 0.01) * 4;
        owl(g, ox + 13, oy, lerp(Math.sin(t * 11 + ox * 0.02), 0.75, glide), -0.45 * ap, winter ? OWL : TAWNY);
      }
      if (winter) snowfall(g, W, H, t, dist, Math.round(W / 800 * 22), 1.1, 2.1, 'rgba(244,247,251,.85)', 70, 7.7);
      else fireflies(g, W, t, dist, Math.round(W / 800 * 12), 1.1, 1.6, 300, 490, 7.7, 0);
      NB.draw.vignette(g, W, H, 0.3);
      g.restore();
    },

    create(api) {
      const W = api.W, H = api.H, winter = !!NB.winter, PUFF = winter ? SNOWC : DUST;
      let p, obs, gems, t, speed, dist, bonus, gap, dead, started, kickT, kickN, streak, lastPick, mile, flare;
      const fx = () => p.x + S / 2;

      function jump() {
        if (dead) return;
        if (p.ground) {
          p.vy = -800; p.ground = false; p.jumps = 1;
          api.sfx('jump');
          if (winter) {
            api.burst(fx() - 4, GROUND - 2, { n: 10, speed: 140, dir: -PI / 2, spread: 2.4, colors: SNOWC, size: 3, grav: 500, drag: 3, life: 0.45 });
            api.burst(fx() - 8, GROUND - 2, { n: 6, speed: 120, dir: PI + 0.35, spread: 0.7, colors: SNOWC, shape: 'square', size: 1.7, grav: 600, life: 0.4 });
          } else {
            api.burst(fx() - 4, GROUND - 2, { n: 10, speed: 130, dir: -PI / 2, spread: 2.4, colors: DUST, size: 2.8, grav: 260, drag: 3.2, life: 0.5 });
            api.burst(fx() - 8, GROUND - 2, { n: 4, speed: 110, dir: PI + 0.5, spread: 0.9, colors: PETAL, shape: 'shard', size: 1.8, grav: 160, drag: 1.6, life: 0.6 });
          }
        } else if (p.jumps < 2) {
          p.vy = -680; p.jumps = 2; p.spinK = 0.001;
          api.sfx('jump', 2);
          api.burst(fx(), p.y + S, { n: 12, speed: 170, dir: PI / 2, spread: 1.6, colors: [PAL.gold, PAL.cream, PAL.snow], shape: 'spark', blend: 'add', life: 0.4, size: 2 });
          api.ring(fx(), p.y + S - 4, { r0: 4, r1: 30, life: 0.3, color: PAL.cream, width: 2 });
        }
      }
      function release() { if (!dead && p.vy < -330) p.vy = -330; }

      function land(fall) {
        if (fall < 200) return;
        const k = clamp(fall / 1000, 0.35, 1);
        p.squash = k;
        const n = Math.round(5 + 6 * k);
        api.burst(fx() - 9, GROUND - 1, { n, speed: 130, dir: PI + 0.25, spread: 0.6, colors: PUFF, size: 2.6, grav: 400, life: 0.4 });
        api.burst(fx() + 6, GROUND - 1, { n, speed: 130, dir: -0.25, spread: 0.6, colors: PUFF, size: 2.6, grav: 400, life: 0.4 });
        if (fall > 750) {
          api.sfx('place', 0);
          api.ring(fx(), GROUND, { r0: 6, r1: 34, life: 0.3, color: winter ? PAL.snow : DUST[2], width: 2 });
          api.shake(2.5);
        }
      }

      function spawn() {
        const r = Math.random();
        let o;
        if (t > 14 && r < 0.22) o = { type: 'owl', x: W + 40, w: 26, y: GROUND - rand(80, 96), r: 13, ph: rand(0, TAU), flee: 0, hoot: false };
        else if (r < 0.45) { o = { type: 'rock', x: W + 20, w: 34, h: rand(46, 84), cap: true }; o.v = (o.h * 7.31) % 1 < 0.5 ? 0 : 1; }
        else {
          const n = 1 + Math.floor(Math.random() * (t > 8 ? 3 : 2)), h = rand(30, 48), top = Math.floor(Math.random() * n), hs = [], lean = [];
          for (let i = 0; i < n; i++) { hs.push(i === top ? h : h * rand(0.68, 0.9)); lean.push((i - (n - 1) / 2) * 2.5 + rand(-1.5, 1.5)); }
          o = { type: 'crystal', x: W + 20, n, w: n * SPIKE, h, hs, lean, broken: false, seed: rand(0, 9) };
        }
        o.dy = o.y || 0; o.passed = false; o.gap = 999;
        if (o.type === 'owl') owlY(o);
        obs.push(o);
        if (o.type !== 'owl' && Math.random() < 0.55) {
          const cx = o.x + o.w / 2;
          for (let k = -1; k <= 1; k++) gems.push({ x: cx + k * 34, y: GROUND - o.h - 58 - (1 - Math.abs(k)) * 22, ph: rand(0, TAU) });
        }
      }

      /* The owl glides in from high on the right and levels out at head height well before it reaches the fox. */
      function owlY(o) {
        const ap = clamp((o.x - 500) / 320, 0, 1);
        o.ap = ap;
        o.dy = o.y - ap * ap * 150 + (1 - ap) * Math.sin(t * 4 + o.ph) * 5;
      }

      function hits(o) {
        const x1 = p.x + 5, x2 = p.x + S - 5, y1 = p.y + 5, y2 = p.y + S - 2;
        if (o.type === 'rock') return x2 > o.x && x1 < o.x + o.w && y2 > GROUND - o.h;
        if (o.type === 'owl') {
          if (o.flee) return false;
          const ox = o.x + 13, nx = clamp(ox, x1, x2), ny = clamp(o.dy, y1, y2);
          return (nx - ox) ** 2 + (ny - o.dy) ** 2 < (o.r - 2) ** 2;
        }
        if (o.broken) return false;
        for (let i = 0; i < o.n; i++) {
          const sx = o.x + i * SPIKE, mid = sx + SPIKE / 2, h = o.hs[i];
          if (mid >= x1 && mid <= x2 && y2 > GROUND - h + 3) return true;
          for (let j = 0; j < 3; j++) {
            const px = j === 0 ? x1 : j === 1 ? (x1 + x2) / 2 : x2;
            if (px < sx || px > sx + SPIKE) continue;
            if (y2 > GROUND - h * (1 - Math.abs(px - mid) / (SPIKE / 2)) + 3) return true;
          }
        }
        return false;
      }

      function die(o) {
        dead = true;
        const cx = fx(), cy = p.y + S / 2;
        p.vy = -380; p.dvx = -70; p.spin = -11; p.rot = 0; p.ground = false; p.lying = false; p.spinK = 0;
        api.burst(cx, cy, { n: 24, speed: 320, colors: [PAL.orange, FOX.lit, PAL.cream], shape: 'shard', life: 0.9, grav: 700, size: 3 });
        api.burst(cx, cy, { n: 22, speed: 260, colors: PUFF, shape: 'square', life: 0.8, grav: 500, size: 2.4 });
        api.burst(cx, cy, { n: 14, speed: 380, colors: [PAL.gold, PAL.cream], shape: 'spark', blend: 'add', life: 0.5 });
        api.ring(cx, cy, { r0: 8, r1: 96, life: 0.55, color: PAL.cream, width: 5 });
        api.ring(cx, cy, { r0: 4, r1: 58, life: 0.4, color: PAL.orange, width: 3 });
        if (o.type === 'crystal') {
          o.broken = true;
          api.burst(o.x + o.w / 2, GROUND - o.h * 0.6, { n: 20, speed: 280, colors: winter ? [ICE.lit, ICE.mid, ICE.sh, PAL.snow] : [PAL.teal, BR.leafLit, BR.lit, PAL.coral], shape: 'shard', life: 0.8, grav: 800, size: 3.2, dir: -PI / 2, spread: 2.6 });
        } else if (o.type === 'rock') {
          o.cap = false;
          api.burst(o.x + o.w / 2, GROUND - o.h, { n: 18, speed: 200, colors: winter ? SNOWC : o.v ? [WOOD.split, WOOD.lit, WOOD.cut] : MOSSC, life: 0.7, grav: 600, size: 3, dir: -PI / 2, spread: 2.2 });
        } else {
          o.flee = 0.001;
          api.burst(o.x + 13, o.dy, { n: 16, speed: 180, colors: winter ? [OWL.white, OWL.shade, PAL.cream] : [TAWNY.white, TAWNY.shade, TAWNY.bar], shape: 'shard', life: 1.1, grav: 90, drag: 1.4, size: 2.6 });
        }
        api.shake(16); api.flash(PAL.cream, 0.35); api.sfx('explode');
        api.over(1.3);
      }

      function closeCall() {
        api.float(fx(), p.y - 16, 'CLOSE', { color: winter ? PAL.frost : PAL.paper, size: 18 });
        api.burst(fx(), p.y + S, { n: 7, speed: 130, colors: winter ? [PAL.frost, PAL.snow] : [PAL.mustard, PAL.paper], shape: 'spark', blend: 'add', life: 0.3 });
        api.sfx('chip');
      }

      return {
        reset() {
          p = { x: 150, y: GROUND - S, vy: 0, ground: true, jumps: 0, squash: 0, phase: 0, spinK: 0, rot: 0, spin: 0, dvx: 0, lying: false };
          obs = []; gems = []; t = 0; speed = 390; dist = 0; bonus = 0; gap = 520; dead = false; started = false;
          kickT = 0; kickN = 0; streak = 0; lastPick = -9; mile = 0; flare = 0;
          api.score(0);
        },
        action: jump,
        release,
        key(c) { if (c === 'ArrowUp' || c === 'KeyW') jump(); },
        keyup(c) { if (c === 'ArrowUp' || c === 'KeyW') release(); },

        update(dt) {
          if (dt > 0) started = true;
          t += dt;
          flare = Math.max(0, flare - dt * 0.7);
          speed = dead ? Math.max(0, speed - 1200 * dt) : Math.min(840, 390 + t * 9);
          const dx = speed * dt;
          dist += dx;

          if (dead) {
            // Knocked over: tumble, bounce once, then lie in the snow.
            p.vy += GRAV * dt; p.y += p.vy * dt; p.x += p.dvx * dt; p.rot += p.spin * dt;
            if (p.y >= GROUND - S) {
              p.y = GROUND - S;
              if (p.vy > 160) {
                p.vy *= -0.3; p.spin *= 0.45; p.dvx *= 0.5;
                api.burst(fx(), GROUND - 2, { n: 10, speed: 140, dir: -PI / 2, spread: 2.6, colors: PUFF, size: 2.8, grav: 500, life: 0.5 });
              } else { p.vy = 0; p.lying = true; p.spin = 0; }
            }
            if (p.lying) {
              const target = Math.round((p.rot - PI) / TAU) * TAU + PI;
              p.rot += (target - p.rot) * (1 - Math.exp(-dt * 14));
              p.dvx *= Math.exp(-dt * 8);
            }
          } else {
            const wasAir = !p.ground, fall = p.vy;
            p.vy += GRAV * dt; p.y += p.vy * dt;
            if (p.y >= GROUND - S) {
              if (wasAir) land(fall);
              p.y = GROUND - S; p.vy = 0; p.ground = true; p.jumps = 0;
            }
            if (p.spinK > 0) {
              p.spinK += dt / (p.ground ? 0.15 : 0.46);
              if (p.spinK >= 1) p.spinK = 0;
            }
            p.phase += dt * clamp(speed * 0.05, 14, 34);
            if (p.ground) {
              kickT -= dt;
              if (kickT <= 0) {
                kickT = 0.07;
                if (winter) api.burst(fx() - 13, GROUND - 1, { n: 2, speed: 90, dir: PI + 0.5, spread: 0.7, colors: SNOWC, shape: 'square', size: 1.5, grav: 450, drag: 1.5, life: 0.35 });
                else {
                  api.burst(fx() - 13, GROUND - 1, { n: 2, speed: 70, dir: PI + 0.6, spread: 0.8, colors: DUST, size: 1.6, grav: 120, drag: 2.5, life: 0.45 });
                  if (++kickN % 6 === 0) api.burst(fx() - 13, GROUND - 2, { n: 1, speed: 90, dir: PI + 0.7, spread: 0.6, colors: PETAL, shape: 'shard', size: 1.7, grav: 90, drag: 1.4, life: 0.8 });
                }
              }
            }
          }
          p.squash = Math.max(0, p.squash - dt * 5);

          if (!dead) {
            gap -= dx;
            if (gap <= 0) { spawn(); gap = speed * rand(0.8, 1.55) + 130; }
          }
          for (const o of obs) {
            o.x -= dx;
            if (o.type !== 'owl') continue;
            if (o.flee) { o.flee += dt; o.x -= 60 * dt; o.dy -= (90 + o.flee * 600) * dt; }
            else {
              o.x -= 40 * dt; owlY(o);
              if (!o.hoot && o.x < 700) { o.hoot = true; if (!dead) api.sfx('whoosh'); }
            }
          }
          obs = obs.filter((o) => o.x + o.w > -80 && o.dy > -80);
          for (const s of gems) s.x -= dx;
          gems = gems.filter((s) => s.x > -30);
          if (dead) return;

          const pcx = fx(), pcy = p.y + S / 2;
          for (let i = gems.length - 1; i >= 0; i--) {
            const s = gems[i];
            if ((s.x - pcx) ** 2 + (s.y - pcy) ** 2 < 24 * 24) {
              bonus += 10;
              streak = t - lastPick < 0.6 ? streak + 1 : 1; lastPick = t;
              api.float(s.x, s.y - 14, '+10', { color: PAL.gold, size: 20 + Math.min(streak, 3) * 2 });
              api.burst(s.x, s.y, { n: 10, speed: 150, colors: [PAL.gold, STAR[0], PAL.amber], shape: 'spark', blend: 'add', life: 0.4, size: 2 });
              api.burst(s.x, s.y, { n: 5, speed: 90, colors: [PAL.gold, PAL.cream], shape: 'shard', life: 0.5, size: 2.2, grav: 200 });
              api.ring(s.x, s.y, { r0: 4, r1: 26, life: 0.3, color: PAL.gold, width: 2 });
              api.sfx('pickup', Math.min(streak, 6));
              gems.splice(i, 1);
            }
          }
          for (const o of obs) if (hits(o)) { die(o); break; }
          if (dead) return;

          const x1 = p.x + 5, x2 = p.x + S - 5;
          for (const o of obs) {
            if (o.passed || o.type === 'owl') continue;
            if (x2 > o.x && x1 < o.x + o.w) o.gap = Math.min(o.gap, GROUND - o.h - (p.y + S - 2));
            else if (o.x + o.w < x1) { o.passed = true; if (o.gap < 12) closeCall(); }
          }
          const m = Math.floor(dist / 30 / 500);
          if (m > mile) {
            mile = m; flare = 1;
            api.sfx('level');
            api.float(W / 2, 150, `${m * 500} m`, { color: PAL.cream, size: 30 });
            api.burst(W / 2, 140, { n: 16, speed: 200, colors: winter ? [PAL.mint, PAL.frost, PAL.cream] : [PAL.mustard, PAL.paper, PAL.gold], shape: 'spark', blend: 'add', life: 0.6 });
          }
          api.score(Math.floor(dist / 30) + bonus);
        },

        draw(g, tt) {
          g.save();
          if (winter) scenery(g, grads(g), W, H, dist, tt, flare);
          else sceneryWarm(g, gradsWarm(g), W, H, dist, tt, flare);
          for (const s of gems) gem(g, s.x, s.y + Math.sin(tt * 3.2 + s.ph) * 3, 9 + Math.sin(tt * 5 + s.ph) * 0.6, Math.sin(tt * 1.8 + s.ph) * 0.2, STAR);
          for (const o of obs) {
            if (o.type === 'rock') { if (winter) rock(g, o); else mossRock(g, o); }
            else if (o.type === 'crystal') { if (winter) crystal(g, o, tt); else bramble(g, o); }
          }
          foxShadow(g, fx(), GROUND - S - p.y);
          FS.tt = tt; FS.phase = p.phase; FS.vy = p.vy; FS.squash = p.squash; FS.spinK = 0; FS.rot = 0; FS.lying = false;
          if (!started) FS.pose = 'idle';
          else if (dead) { FS.pose = 'dead'; FS.rot = p.rot; FS.lying = p.lying; }
          else if (!p.ground || p.spinK > 0) { FS.pose = 'air'; FS.spinK = p.spinK; }
          else FS.pose = 'run';
          fox(g, fx(), p.y + S, FS);
          if (dead && p.lying) {
            for (let i = 0; i < 3; i++) {
              const a = tt * 4 + i * TAU / 3;
              gem(g, fx() - 14 + Math.cos(a) * 11, GROUND - 18 + Math.sin(a) * 3.5, 3.2, a, STAR);
            }
          }
          for (const o of obs) {
            if (o.type !== 'owl') continue;
            const glide = o.flee ? 0 : clamp((o.ap - 0.2) / 0.3, 0, 1);
            const f = lerp(Math.sin(tt * (o.flee ? 22 : 11) + o.ph), 0.75, glide);
            owl(g, o.x + 13, o.dy, f, o.flee ? 0.5 : -0.45 * o.ap, winter ? OWL : TAWNY);
          }
          if (winter) snowfall(g, W, H, tt, dist, 22, 1.1, 2.1, 'rgba(244,247,251,.85)', 70, 7.7);
          else fireflies(g, W, tt, dist, 12, 1.1, 1.6, 300, 490, 7.7, flare);
          NB.draw.vignette(g, W, H, 0.4);
          g.restore();
        }
      };
    }
  });
})();
