/* Prism Breaker (id 'glacier-breaker', so saved scores carry over): break a wall of cut-glass gems with a
   glowing orb, off a raft on a night lake. In December (NB.winter) the game switches to its winter variant:
   the frozen lake with ice bricks, a snowball and a sled. */
(function () {
  'use strict';
  const { TAU, clamp, lerp, rand, hash } = NB.util;
  const P = NB.pal, rr = NB.draw.rr;

  /* ---------- Layout (logical 800 x 500) ---------- */
  const FW = 800, FH = 500, WALL = 12, HORIZON = 352;
  const COLS = 10, ROWS = 6, BW = 66, BH = 20, GAP = 6, TOP = 70;
  const LEFT = (FW - (COLS * BW + (COLS - 1) * GAP)) / 2;
  const PAD_Y = FH - 34, PAD_H = 12, PAD_W = 120, PAD_WIDE = 184, BALL_R = 7;
  const DROP = 0.12, AUTO_LAUNCH = 4.5, WIDE_TIME = 10, SLOW_TIME = 8, SHEET_BONUS = 250, MAX_SPEED = 660;
  const MIN_DY = 0.32, MIN_DX = 0.1; // keeps every ball off pure horizontal / vertical loops

  const SUMMIT = [2, 3, 4, 3, 5, 6, 4, 5, 3, 2];
  const PATTERNS = [
    () => true,                                                    // full wall
    (r, c) => r === 0 || (r + c) % 2 === 0,                        // checker under a solid cap
    (r, c) => r >= ROWS - SUMMIT[c],                               // skyline
    (r, c) => !(c < r - 1 || c > COLS - r),                        // funnel
    (r, c) => Math.abs(c - 4.5) + Math.abs(r - 2.5) * 1.6 <= 5.2,  // diamond
    (r, c) => (c !== 2 && c !== 7) || r === 0                      // two open shafts
  ];
  const POWER_KEYS = ['wide', 'multi', 'slow'];
  const TWINKLES = Array.from({ length: 12 }, (_, i) => ({
    x: 30 + hash(i * 9.1 + 4) * 740, y: 20 + hash(i * 4.7 + 8) * 230, p: hash(i * 2.3) * TAU, s: 0.8 + hash(i * 6.1) * 1.2
  }));

  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeBack = (k) => { const a = 1.70158, b = a + 1, m = k - 1; return 1 + b * m * m * m + a * m * m; };
  /* Damped squash curve: full squash on impact, a little stretch rebound, then settle. */
  const squash = (k) => (k > 0 ? Math.cos((1 - k) * Math.PI * 2.5) * k : 0);
  const polyFill = (g, pts, col) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    g.closePath(); g.fill();
  };

  /* ---------- Offscreen caches (created once per season; skipped where no DOM canvas exists) ---------- */
  let canCache = true;
  function layer(w, h, ss, paint) {
    if (!canCache) return null;
    try {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w * ss)); c.height = Math.max(1, Math.ceil(h * ss));
      const x = c.getContext('2d');
      if (!x) { canCache = false; return null; }
      x.scale(ss, ss); paint(x);
      return c;
    } catch (e) { canCache = false; return null; }
  }
  function pixelScale(g) {
    try { const m = g.getTransform && g.getTransform(); if (m && m.a > 0 && Number.isFinite(m.a)) return m.a; } catch (e) { /* ignore */ }
    return 2;
  }

  const bgCache = new Map();
  function background(g, W, H, th) {
    const ss = clamp(Math.ceil(pixelScale(g) * 2) / 2, 1, 3), Wr = Math.round(W), key = th.key + '|' + Wr + '@' + ss;
    let c = bgCache.get(key);
    if (c === undefined) {
      c = layer(Wr, H, ss, (x) => th.paintBg(x, Wr, H));
      if (bgCache.size >= 4) bgCache.delete(bgCache.keys().next().value);
      bgCache.set(key, c);
    }
    if (c) g.drawImage(c, 0, 0, W, H);
    else th.paintBg(g, W, H);
  }

  const brickSprites = {}, capSprites = {};
  const SPR_SS = 3, BSW = BW + 6, BSH = BH + 7, CSW = 42, CSH = 24;
  function blitBrick(g, x, y, tier, s, th) {
    const key = th.key + tier;
    if (brickSprites[key] === undefined) brickSprites[key] = layer(BSW, BSH, SPR_SS, (c) => th.paintBrick(c, 1, 1, tier));
    const spr = brickSprites[key];
    if (spr) {
      const w = BSW * s, h = BSH * s;
      g.drawImage(spr, x - 1 - (w - BSW) / 2, y - 1 - (h - BSH) / 2, w, h);
    } else {
      g.save(); g.translate(x + BW / 2, y + BH / 2); g.scale(s, s); th.paintBrick(g, -BW / 2, -BH / 2, tier); g.restore();
    }
  }
  function drawCap(g, x, y, type, rot, s, th) {
    const key = th.key + type;
    if (capSprites[key] === undefined) capSprites[key] = layer(CSW, CSH, SPR_SS, (c) => th.paintCap(c, CSW / 2, CSH / 2 - 1, type));
    const spr = capSprites[key];
    g.save(); g.translate(x, y); g.rotate(rot); if (s !== 1) g.scale(s, s);
    if (spr) g.drawImage(spr, -CSW / 2, -CSH / 2 + 1, CSW, CSH);
    else th.paintCap(g, 0, 0, type);
    g.restore();
  }

  /* Crack paths are shared by both looks; colours come from the tier. */
  function makeCrack(seed, k) {
    const dir = k % 2 ? -1 : 1, pts = [];
    let x = 10 + hash(seed + k * 17.3) * (BW - 20), y = dir > 0 ? 0 : BH;
    pts.push([x, y]);
    for (let s = 1; s <= 4; s++) {
      x = clamp(x + (hash(seed * 1.7 + s * 3.1 + k * 11) - 0.5) * 14, 4, BW - 4);
      y = clamp(y + dir * BH / 4.4, 1, BH - 1);
      pts.push([x, y]);
    }
    const m = pts[2], bx = clamp(m[0] + (hash(seed + k * 5.1) - 0.5) * 18, 3, BW - 3);
    return { main: pts, branch: [m, [bx, clamp(m[1] + dir * 6, 1, BH - 1)]] };
  }
  const THUMB_CRACKS = [[makeCrack(3.1, 0)], [makeCrack(7.7, 0)], [makeCrack(12.9, 0)]];

  function drawCracks(g, x, y, cracks, n, T) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      const o = pass ? 0 : 0.9;
      g.strokeStyle = pass ? T.crack : (T.crackLit || T.lit); g.lineWidth = pass ? 1.3 : 1;
      g.beginPath();
      for (let i = 0; i < n && i < cracks.length; i++) {
        const c = cracks[i];
        for (let j = 0; j < c.main.length; j++) {
          const p = c.main[j];
          if (j) g.lineTo(x + p[0] + o, y + p[1] + o); else g.moveTo(x + p[0] + o, y + p[1] + o);
        }
        g.moveTo(x + c.branch[0][0] + o, y + c.branch[0][1] + o); g.lineTo(x + c.branch[1][0] + o, y + c.branch[1][1] + o);
      }
      g.stroke();
    }
  }

  /* =====================================================================================
     WINTER VARIANT (December only): the frozen lake. Kept exactly as the original art.
     ===================================================================================== */
  const C = {
    sky0: '#06152a', sky1: '#0c2137', sky2: '#1b3550',
    far: '#172e47', farLit: '#1c3651',
    mtnLit: '#294a6b', mtnShade: '#152a41', rim: '#46698d', capLit: '#a9bcd3', capShade: '#6d86a3',
    reflect: '#2a4b6e', pine: '#0c1c2a', pineLit: P.pine, shore: '#2c4a69', shoreLit: '#4c6e92',
    lake0: '#173250', lake1: '#0b1e33', drift: '#1d3956', driftLit: '#365a7e',
    wall: '#284a6b', wallMid: '#30577c', wallLit: '#86a8ca', wallShade: '#112840', icicle: '#bcd2ea',
    outline: P.deep, shadow: 'rgba(3,10,22,0.35)',
    woodLit: '#eab06a', wood: '#c97f3e', woodShade: '#8e5126', grain: '#a5622d',
    metalLit: P.ice, metal: '#9db0c6', metalShade: '#56677d'
  };
  /* Ice tiers by hit points: 1 pale snow-ice, 2 blue ice, 3 deep packed ice with frost. */
  const TIERS = [null,
    { base: P.ice, lit: P.snow, shade: '#a5bcd8', deep: '#c8d8ec', crack: '#6c8bb2', chips: [P.snow, P.ice, '#b9cce4'] },
    { base: '#8db4ec', lit: '#d0e1fb', shade: '#5880c4', deep: '#79a1e1', crack: '#2c5293', chips: [P.frost, '#8db4ec', P.ice] },
    { base: '#3e68b2', lit: '#82a7e7', shade: '#24467f', deep: '#33599e', crack: '#132c58', chips: [P.blue, '#3e68b2', P.frost] }
  ];
  const POWERS = {
    wide: { label: 'WIDE', base: P.gold, lit: '#ffe6a3', shade: '#c88d14' },
    multi: { label: 'MULTI', base: P.mint, lit: '#b8f6db', shade: '#2e9e77' },
    slow: { label: 'SLOW', base: P.frost, lit: P.snow, shade: '#5f86c9' }
  };
  /* Main mountain, relative to the field centre: angular peaks with the summit under the north star. */
  const MOUNTAIN = [[-340, HORIZON], [-262, 300], [-214, 314], [-128, 262], [-78, 290], [0, 228],
    [62, 282], [132, 250], [196, 302], [262, 286], [346, HORIZON]];

  function winterBackground(g, W, H) {
    const cx = W / 2, ox = (W - FW) / 2;
    // Sky
    const sky = g.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, C.sky0); sky.addColorStop(0.55, C.sky1); sky.addColorStop(1, C.sky2);
    g.fillStyle = sky; g.fillRect(0, 0, W, HORIZON + 2);
    // Stars
    const ns = Math.round(W * 0.12);
    for (let i = 0; i < ns; i++) {
      const x = hash(i * 3.17 + 0.5) * W, y = 16 + Math.pow(hash(i * 7.31 + 2.2), 1.5) * (HORIZON - 80);
      const s = hash(i * 1.93 + 5.1);
      g.globalAlpha = 0.16 + s * 0.42;
      g.fillStyle = s > 0.8 ? P.cream : P.ice;
      g.beginPath(); g.arc(x, y, s > 0.92 ? 1.3 : s > 0.6 ? 0.95 : 0.65, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // Far range: low, flat, close to the sky tone
    const far = [];
    for (let x = -30, i = 0; x < W + 60; i++) {
      const y = i % 2 === 0 ? HORIZON - 44 - hash(i * 4.1 + 1) * 44 : HORIZON - 16 - hash(i * 2.7 + 3) * 20;
      far.push([x, y]); x += 34 + hash(i * 5.9) * 40;
    }
    g.fillStyle = C.far;
    g.beginPath(); g.moveTo(-10, HORIZON);
    for (const p of far) g.lineTo(p[0], p[1]);
    g.lineTo(W + 10, HORIZON); g.closePath(); g.fill();
    g.fillStyle = C.farLit;
    for (let i = 2; i < far.length; i += 2) {
      const p = far[i], v = far[i - 1];
      g.beginPath(); g.moveTo(v[0], v[1]); g.lineTo(p[0], p[1]); g.lineTo(p[0] + 6, HORIZON); g.lineTo(v[0], HORIZON); g.closePath(); g.fill();
    }

    // Main faceted mountain: lit faces, shadow faces right of each ridge, snow caps, rim light
    const M = MOUNTAIN.map((p) => [cx + p[0], p[1]]);
    const silhouette = () => { g.beginPath(); g.moveTo(M[0][0], M[0][1]); for (const p of M) g.lineTo(p[0], p[1]); g.closePath(); };
    g.fillStyle = C.mtnLit; silhouette(); g.fill();
    g.fillStyle = C.mtnShade;
    for (let i = 1; i < M.length - 1; i += 2) {
      const p = M[i], nx = M[i + 1], foot = p[0] + (nx[0] - p[0]) * 0.22;
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(nx[0], nx[1]); g.lineTo(nx[0], HORIZON); g.lineTo(foot, HORIZON); g.closePath(); g.fill();
    }
    for (let i = 1; i < M.length - 1; i += 2) {
      const p = M[i], a = M[i - 1], b = M[i + 1];
      if (p[1] > 296) continue;
      const d = (HORIZON - p[1]) * 0.3, foot = [p[0] + (b[0] - p[0]) * 0.22, HORIZON];
      const along = (q, depth) => { const k = Math.min(0.7, depth / Math.max(1, q[1] - p[1])); return [lerp(p[0], q[0], k), lerp(p[1], q[1], k)]; };
      const L = along(a, d), R = along(b, d * 0.8), Mi = along(foot, d * 1.15);
      g.fillStyle = C.capLit;
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(L[0], L[1]);
      g.lineTo(lerp(L[0], Mi[0], 0.33), Mi[1] + d * 0.18);
      g.lineTo(lerp(L[0], Mi[0], 0.66), L[1] - d * 0.02);
      g.lineTo(Mi[0], Mi[1]); g.closePath(); g.fill();
      g.fillStyle = C.capShade;
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(Mi[0], Mi[1]);
      g.lineTo(lerp(Mi[0], R[0], 0.5), R[1] + d * 0.28); g.lineTo(R[0], R[1]); g.closePath(); g.fill();
    }
    g.strokeStyle = C.rim; g.lineWidth = 1.2; g.lineCap = 'round';
    g.beginPath();
    for (let i = 1; i < M.length - 1; i += 2) { g.moveTo(M[i - 1][0], M[i - 1][1]); g.lineTo(M[i][0], M[i][1]); }
    g.globalAlpha = 0.6; g.stroke(); g.globalAlpha = 1;
    // Low haze at the foot of the range
    const haze = g.createLinearGradient(0, 272, 0, HORIZON);
    haze.addColorStop(0, 'rgba(27,53,80,0)'); haze.addColorStop(1, 'rgba(27,53,80,0.8)');
    g.fillStyle = haze; g.fillRect(0, 272, W, HORIZON - 272 + 2);

    // Frozen lake, with a soft mirror of the range
    const lake = g.createLinearGradient(0, HORIZON + 6, 0, H);
    lake.addColorStop(0, C.lake0); lake.addColorStop(1, C.lake1);
    g.fillStyle = lake; g.fillRect(0, HORIZON + 4, W, H - HORIZON - 4);
    g.save();
    g.beginPath(); g.rect(0, HORIZON + 6, W, H); g.clip();
    g.translate(0, HORIZON + 6); g.scale(1, -0.42); g.translate(0, -HORIZON);
    g.globalAlpha = 0.4; g.fillStyle = C.reflect; silhouette(); g.fill();
    g.restore();
    // Skate streaks and hairline cracks in the lake ice
    const nst = Math.round(W / 28);
    g.fillStyle = 'rgba(223,233,245,0.055)';
    for (let i = 0; i < nst; i++) {
      const k = Math.pow(hash(i * 2.9 + 11), 0.8), y = HORIZON + 14 + k * (H - HORIZON - 24);
      const len = 24 + hash(i * 6.1 + 3) * 150 * k, x = hash(i * 4.3 + 9) * W;
      g.fillRect(x - len / 2, y, len, y > 440 ? 2 : 1);
    }
    g.strokeStyle = 'rgba(169,201,255,0.1)'; g.lineWidth = 1;
    g.beginPath();
    const ncr = Math.max(2, Math.round(W / 220));
    for (let i = 0; i < ncr; i++) {
      let x = hash(i * 8.3 + 1) * W, y = HORIZON + 30 + hash(i * 3.7 + 2) * 110;
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += 14 + hash(i * 11 + s) * 22; y += (hash(i * 7 + s * 3) - 0.5) * 14; g.lineTo(x, y); }
    }
    g.stroke();
    // North star reflection
    for (let k = 0; k < 7; k++) {
      g.fillStyle = `rgba(244,238,219,${(0.13 - k * 0.016).toFixed(3)})`;
      g.fillRect(cx - 0.8, HORIZON + 14 + k * 9, 1.6, 4);
    }
    // Shore and pine line, taller toward the edges so it frames the field
    g.fillStyle = C.pine; g.fillRect(0, HORIZON - 2, W, 7);
    for (let x = -8, i = 0; x < W + 10; i++) {
      const edge = Math.min(1, Math.abs(x - cx) / 420);
      const h = 9 + hash(i * 3.3 + 7) * 11 + edge * edge * 24;
      pine(g, x, HORIZON + 4, h);
      x += 5 + hash(i * 1.9 + 2) * 9 + (1 - edge) * 4;
    }
    g.fillStyle = C.shore; g.fillRect(0, HORIZON + 4, W, 3);
    g.fillStyle = C.shoreLit; g.fillRect(0, HORIZON + 4, W, 1);
    // Snow drifts in the bottom corners of the field
    drift(g, ox + 40, H + 4, 110, 15);
    drift(g, ox + FW - 30, H + 4, 140, 13);

    winterWalls(g, ox);
  }

  function pine(g, x, base, h) {
    const w = h * 0.36;
    for (let k = 0; k < 3; k++) {
      const top = base - h + k * h * 0.26, bot = top + h * 0.5, hw = w * (0.55 + k * 0.28);
      g.fillStyle = C.pineLit; g.beginPath(); g.moveTo(x, top); g.lineTo(x - hw, bot); g.lineTo(x, bot); g.closePath(); g.fill();
      g.fillStyle = C.pine; g.beginPath(); g.moveTo(x, top); g.lineTo(x + hw, bot); g.lineTo(x, bot); g.closePath(); g.fill();
    }
  }

  function drift(g, x, y, w, h) {
    g.fillStyle = C.drift;
    g.beginPath(); g.ellipse(x, y, w / 2, h, 0, Math.PI, TAU); g.fill();
    g.strokeStyle = C.driftLit; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(x, y, w / 2 - 2, h - 1.5, 0, Math.PI * 1.08, Math.PI * 1.55); g.stroke();
  }

  function winterWalls(g, ox) {
    const L = ox, R = ox + FW - WALL;
    // Cast shadows: under the top ledge and to the right of the left wall
    let gr = g.createLinearGradient(0, WALL, 0, WALL + 16);
    gr.addColorStop(0, 'rgba(3,10,22,0.38)'); gr.addColorStop(1, 'rgba(3,10,22,0)');
    g.fillStyle = gr; g.fillRect(L + WALL, WALL, FW - 2 * WALL, 16);
    gr = g.createLinearGradient(L + WALL, 0, L + WALL + 14, 0);
    gr.addColorStop(0, 'rgba(3,10,22,0.32)'); gr.addColorStop(1, 'rgba(3,10,22,0)');
    g.fillStyle = gr; g.fillRect(L + WALL, WALL, 14, FH - WALL);
    // Slabs with a lighter core for a translucent feel
    g.fillStyle = C.wall;
    g.fillRect(L, 0, WALL, FH); g.fillRect(R, 0, WALL, FH); g.fillRect(L, 0, FW, WALL);
    g.fillStyle = C.wallMid;
    g.fillRect(L + 3, 3, WALL - 6, FH); g.fillRect(R + 3, 3, WALL - 6, FH); g.fillRect(L + 3, 3, FW - 6, WALL - 6);
    // Bevels: faces toward the light are lit, faces away are in shadow
    g.fillStyle = C.wallLit;
    g.fillRect(L, 0, FW, 1.5); g.fillRect(L, 0, 1.5, FH); g.fillRect(R, WALL, 1.5, FH - WALL);
    g.fillStyle = C.wallShade;
    g.fillRect(L + WALL - 2, WALL - 2, 2, FH - WALL + 2); g.fillRect(L + WALL, WALL - 2, FW - 2 * WALL, 2);
    g.fillRect(R + WALL - 1.5, 0, 1.5, FH);
    // Block seams
    for (let y = 84; y < FH; y += 78) {
      for (const x of [L, R]) {
        g.fillStyle = C.wallShade; g.fillRect(x + 1, y, WALL - 2, 1);
        g.fillStyle = 'rgba(134,168,202,0.5)'; g.fillRect(x + 1, y + 1, WALL - 2, 1);
      }
    }
    for (let x = L + 96; x < L + FW - 40; x += 102) {
      g.fillStyle = C.wallShade; g.fillRect(x, 1, 1, WALL - 3);
      g.fillStyle = 'rgba(134,168,202,0.5)'; g.fillRect(x + 1, 1, 1, WALL - 3);
    }
    // Glints across the slabs
    g.fillStyle = 'rgba(244,247,251,0.18)';
    for (let i = 0; i < 6; i++) {
      const y = 40 + hash(i * 5.3 + 2) * (FH - 80), x = i % 2 ? R : L;
      g.beginPath(); g.moveTo(x + 3, y + 10); g.lineTo(x + WALL - 3, y); g.lineTo(x + WALL - 3, y + 4); g.lineTo(x + 3, y + 14); g.closePath(); g.fill();
    }
    // Icicles under the top ledge
    for (let i = 0; i < 28; i++) {
      const x = L + 24 + hash(i * 3.9 + 1) * (FW - 48), len = 4 + hash(i * 7.1 + 5) * 10, w = 3 + hash(i * 2.2) * 3;
      g.fillStyle = C.icicle;
      g.beginPath(); g.moveTo(x - w / 2, WALL); g.lineTo(x, WALL); g.lineTo(x + 0.4, WALL + len); g.closePath(); g.fill();
      g.fillStyle = C.wallLit;
      g.beginPath(); g.moveTo(x, WALL); g.lineTo(x + w / 2, WALL); g.lineTo(x + 0.4, WALL + len); g.closePath(); g.fill();
    }
  }

  function iceBrick(g, x, y, tier) {
    const T = TIERS[tier], w = BW, h = BH, r = 3, b = 3;
    g.fillStyle = C.shadow; rr(g, x + 2, y + 3, w, h, r); g.fill();
    g.fillStyle = T.base; rr(g, x, y, w, h, r); g.fill();
    g.save(); rr(g, x, y, w, h, r); g.clip();
    // Deeper lower-right half: the two-tone fill reads as translucent ice
    g.fillStyle = T.deep;
    g.beginPath(); g.moveTo(x + w * 0.4, y + h); g.lineTo(x + w * 0.62, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h); g.closePath(); g.fill();
    if (tier === 3) {
      // Frost ferns and trapped air bubbles in packed ice
      g.strokeStyle = 'rgba(169,201,255,0.55)'; g.lineWidth = 0.8; g.lineCap = 'round';
      g.beginPath();
      for (const [sx, sy, len] of [[12, h - 3, 12], [34, h - 2, 15], [52, h - 4, 10]]) {
        const ex = sx + len * 0.5, ey = sy - len;
        g.moveTo(sx, sy); g.lineTo(ex, ey);
        for (let k = 1; k <= 3; k++) {
          const f = k / 4, px = lerp(sx, ex, f), py = lerp(sy, ey, f), l = 3.2 * (1 - f * 0.5);
          g.moveTo(px, py); g.lineTo(px - l, py - l * 0.4);
          g.moveTo(px, py); g.lineTo(px + l * 0.6, py + l * 0.1 - l * 0.7);
        }
      }
      g.stroke();
      g.fillStyle = 'rgba(223,233,245,0.35)';
      for (const [bx, by, br] of [[24, 8, 1.2], [45, 13, 0.9], [58, 7, 1.1], [8, 12, 0.8]]) { g.beginPath(); g.arc(x + bx, y + by, br, 0, TAU); g.fill(); }
    }
    // Bevels: light top-left edges, dark bottom-right edges
    g.fillStyle = T.lit;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - b, y + b); g.lineTo(x + b, y + b); g.lineTo(x + b, y + h - b); g.lineTo(x, y + h); g.closePath(); g.fill();
    g.fillStyle = T.shade;
    g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.lineTo(x + b, y + h - b); g.lineTo(x + w - b, y + h - b); g.lineTo(x + w - b, y + b); g.closePath(); g.fill();
    // Inner highlight streaks
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.moveTo(x + 8, y + h - 5); g.lineTo(x + 14, y + 5); g.lineTo(x + 19, y + 5); g.lineTo(x + 13, y + h - 5); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath(); g.moveTo(x + 20, y + h - 5); g.lineTo(x + 26, y + 5); g.lineTo(x + 27.5, y + 5); g.lineTo(x + 21.5, y + h - 5); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(11,29,50,0.55)'; g.lineWidth = 1;
    rr(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();
  }

  function iceCapsule(g, cx, cy, type) {
    const K = POWERS[type], w = 34, h = 16, x = cx - w / 2, y = cy - h / 2;
    g.fillStyle = C.shadow; rr(g, x + 2, y + 3, w, h, h / 2); g.fill();
    g.fillStyle = C.outline; rr(g, x - 1.5, y - 1.5, w + 3, h + 3, h / 2 + 1.5); g.fill();
    g.fillStyle = K.base; rr(g, x, y, w, h, h / 2); g.fill();
    g.save(); rr(g, x, y, w, h, h / 2); g.clip();
    g.fillStyle = K.shade; g.fillRect(x, cy + 2.5, w, h);
    g.fillStyle = K.lit; rr(g, x + 6, y + 2, w - 12, 3, 1.5); g.fill();
    g.restore();
    g.fillStyle = C.outline; g.strokeStyle = C.outline; g.lineCap = 'round'; g.lineJoin = 'round';
    if (type === 'wide') {
      g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.stroke();
      g.beginPath(); g.moveTo(cx - 11, cy); g.lineTo(cx - 5.5, cy - 4.2); g.lineTo(cx - 5.5, cy + 4.2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(cx + 11, cy); g.lineTo(cx + 5.5, cy - 4.2); g.lineTo(cx + 5.5, cy + 4.2); g.closePath(); g.fill();
    } else if (type === 'multi') {
      for (const d of [-7.5, 0, 7.5]) { g.beginPath(); g.arc(cx + d, cy, 2.7, 0, TAU); g.fill(); }
    } else {
      g.lineWidth = 1.7; g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI / 3 + Math.PI / 2, dx = Math.cos(a) * 5.5, dy = Math.sin(a) * 5.5;
        g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy);
      }
      g.stroke();
    }
  }

  function winterSky(g, ox, t) {
    for (const s of TWINKLES) {
      const a = 0.5 + 0.5 * Math.sin(t * (1.1 + s.s) + s.p);
      if (a < 0.2) continue;
      g.globalAlpha = a * 0.75;
      NB.draw.star4(g, ox + s.x, s.y, s.s * 1.8 * (0.6 + a * 0.4), 0, P.ice);
    }
    g.globalAlpha = 1;
    const nx = ox + FW / 2, ny = 40, pulse = 1 + Math.sin(t * 1.6) * 0.07;
    NB.draw.glow(g, nx, ny, 26 * pulse, P.cream, 0.16);
    NB.draw.star4(g, nx, ny, 9 * pulse, Math.sin(t * 0.5) * 0.05, P.cream);
  }

  function runnerPath(g, hw, ry) {
    g.beginPath();
    g.moveTo(-hw + 1, ry - 8);
    g.quadraticCurveTo(-hw - 3, ry, -hw + 10, ry);
    g.lineTo(hw - 10, ry);
    g.quadraticCurveTo(hw + 5, ry, hw + 3, ry - 10);
  }

  /* Plank face shared by the sled and the raft: warm wood, lit top, seams and grain.
     Leaves the plank clip active; the caller restores it. */
  function plankFace(g, hw, top, h, w) {
    const bot = top + h;
    g.fillStyle = C.outline; rr(g, -hw - 1.5, top - 1.5, w + 3, h + 3, 5); g.fill();
    g.fillStyle = C.wood; rr(g, -hw, top, w, h, 4); g.fill();
    g.save(); rr(g, -hw, top, w, h, 4); g.clip();
    g.fillStyle = C.woodShade; g.fillRect(-hw, bot - 3.5, w, 3.5);
    g.fillStyle = C.woodLit; g.fillRect(-hw, top, w, 3);
    g.fillStyle = C.woodShade;
    for (const f of [-0.34, 0.34]) g.fillRect(f * hw - 0.6, top + 2.5, 1.2, h - 3);
    g.strokeStyle = C.grain; g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(-hw + 4, top + 5.2); g.bezierCurveTo(-hw * 0.4, top + 4, -hw * 0.1, top + 6.6, hw * 0.45, top + 5); g.lineTo(hw - 6, top + 5.6);
    g.moveTo(-hw * 0.85, top + 8); g.bezierCurveTo(-hw * 0.2, top + 9, hw * 0.2, top + 7, hw * 0.85, top + 8.3);
    g.moveTo(hw * 0.55 + 2.4, top + 6.6); g.ellipse(hw * 0.55, top + 6.6, 2.4, 1.3, 0, 0, TAU);
    g.stroke();
  }

  /* The sled: a warm wooden plank on a curled metal runner. */
  function drawSled(g, x, y, w, h, lean) {
    g.fillStyle = 'rgba(2,9,20,0.38)';
    g.beginPath(); g.ellipse(x + 5, PAD_Y + PAD_H + 9, w / 2 + 6, 3.5, 0, 0, TAU); g.fill();
    g.save(); g.translate(x, y + h / 2); g.rotate(lean);
    const hw = w / 2, top = -h / 2, bot = h / 2, ry = bot + 6;
    // Struts
    for (const f of [-0.62, 0, 0.62]) {
      g.fillStyle = C.outline; g.fillRect(f * hw - 2.2, bot - 1, 4.4, ry - bot + 1);
      g.fillStyle = C.metalShade; g.fillRect(f * hw - 1.1, bot - 1, 2.2, ry - bot);
    }
    // Runner
    g.lineCap = 'round'; g.lineJoin = 'round';
    runnerPath(g, hw, ry);
    g.strokeStyle = C.outline; g.lineWidth = 5; g.stroke();
    g.strokeStyle = C.metal; g.lineWidth = 2.6; g.stroke();
    g.save(); g.translate(-0.4, -0.9); runnerPath(g, hw, ry); g.strokeStyle = C.metalLit; g.lineWidth = 0.9; g.stroke(); g.restore();
    // Plank
    plankFace(g, hw, top, h, w);
    g.restore();
    for (const f of [-0.62, 0.62]) {
      g.fillStyle = C.metalShade; g.beginPath(); g.arc(f * hw, top + h * 0.55, 1.8, 0, TAU); g.fill();
      g.fillStyle = C.metalLit; g.beginPath(); g.arc(f * hw - 0.5, top + h * 0.55 - 0.5, 0.7, 0, TAU); g.fill();
    }
    g.restore();
  }

  /* A snowball: snow body, blue shading on the lower right, a highlight on the upper left. */
  function snowball(g, x, y, r, roll, st, ang) {
    if (!(r > 0.2)) return;
    g.save(); g.translate(x, y);
    if (st !== 1) { g.rotate(ang); g.scale(st, 1 / st); g.rotate(-ang); }
    g.fillStyle = C.outline; g.beginPath(); g.arc(0, 0, r + 1.3, 0, TAU); g.fill();
    g.fillStyle = P.frost; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.fillStyle = P.snow; g.beginPath(); g.arc(-r * 0.18, -r * 0.2, r * 0.84, 0, TAU); g.fill();
    g.fillStyle = '#cddcf0';
    for (let i = 0; i < 3; i++) {
      const a = roll + i * 2.1;
      g.beginPath(); g.arc(Math.cos(a) * r * 0.42 - r * 0.1, Math.sin(a) * r * 0.42 - r * 0.1, r * 0.12, 0, TAU); g.fill();
    }
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(-r * 0.36, -r * 0.4, r * 0.27, r * 0.17, -0.6, 0, TAU); g.fill();
    g.restore();
  }

  function drawPuff(g, x, y, k) {
    g.globalAlpha = k * 0.38;
    g.beginPath(); g.arc(x, y, BALL_R * (0.5 + 0.55 * (1 - k)), 0, TAU); g.fill();
  }

  /* =====================================================================================
     DEFAULT VARIANT: Prism Breaker. Night lake (open water), rolling hills, glass gems,
     a glowing orb and a brass-trimmed raft. Poster palette, flat, lit from the top-left.
     ===================================================================================== */
  const D = {
    sky: [P.night, '#161f36', P.poster, '#22345a', '#2b3f66'], skyY: [0, 70, 140, 205, 262, HORIZON + 2],
    cloud: '#30466f', star: P.paper,
    hillFar: '#1c2d4c', hillFarLit: '#273c62', hillMid: '#163442', hillMidLit: '#1f4a57',
    tree: '#0c1d24', treeLit: '#163840', reflect: '#24425c', water0: '#1a2d4d', water1: '#0e1527',
    frame: '#3a2a23', frameMid: '#45322a', frameLit: '#6e5040', frameShade: '#1f1512', frameGrain: '#2b1f1a',
    brass: '#d4a03f', brassLit: '#f6d68a', brassShade: '#8a6322',
    orbCore: '#fff6e2', orbShade: '#dccaa5', firefly: '#f7d774', glass: '#56627b',
    outline: P.night, shadow: 'rgba(5,8,18,0.4)'
  };
  /* Gem tiers by hit points: 1 teal, 2 mustard, 3 deep coral with a faceted inclusion. */
  const GEMS = [null,
    { top: '#93e0d6', lit: '#5ec4b7', base: P.teal, mid: '#238a7e', shade: '#1b6e65', deep: '#13524c', refr: P.mustard, crack: '#0c3532', crackLit: '#93e0d6', chips: [P.teal, '#5ec4b7', '#93e0d6'] },
    { top: '#ffe2a1', lit: '#ffcf6a', base: P.mustard, mid: '#e3a22b', shade: '#bf831f', deep: '#946315', refr: P.coral, crack: '#5e400d', crackLit: '#ffe2a1', chips: [P.mustard, '#ffcf6a', '#ffe2a1'] },
    { top: '#ffc1b1', lit: '#ff9479', base: P.coral, mid: '#e04c2d', shade: '#b83a22', deep: '#842716', refr: P.mustard, incl: '#ffd8cc', crack: '#55180d', crackLit: '#ffc1b1', chips: [P.coral, '#ff9479', '#ffc1b1'] }
  ];
  const VIALS = {
    wide: { label: 'WIDE', base: P.mustard, lit: '#ffe2a1', shade: '#b8841f' },
    multi: { label: 'MULTI', base: P.teal, lit: '#93e0d6', shade: '#1b6e65' },
    slow: { label: 'SLOW', base: P.coral, lit: '#ffc1b1', shade: '#b83a22' }
  };

  function hillPath(g, W, base, amp, f, ph) {
    g.beginPath(); g.moveTo(-20, HORIZON + 8);
    for (let x = -20; x <= W + 28; x += 8) g.lineTo(x, base - amp * (1 + 0.6 * Math.sin(x * f + ph) + 0.4 * Math.sin(x * f * 2.3 + ph * 1.7)));
    g.lineTo(W + 28, HORIZON + 8); g.closePath();
  }
  /* Lit shape, then the base shape nudged down-right: leaves a rim of light on the upper-left slopes. */
  function hillLayer(g, W, base, amp, f, ph, lit, col, off) {
    g.fillStyle = lit; hillPath(g, W, base, amp, f, ph); g.fill();
    g.save(); g.translate(off, off * 0.5); g.fillStyle = col; hillPath(g, W, base, amp, f, ph); g.fill(); g.restore();
  }

  function prismTree(g, x, base, h, kind) {
    if (kind === 0) {
      // Cypress: a tall teardrop, left half in the light
      const w = h * 0.42;
      g.fillStyle = D.tree;
      g.beginPath(); g.moveTo(x, base - h); g.quadraticCurveTo(x + w, base - h * 0.3, x, base); g.quadraticCurveTo(x - w, base - h * 0.3, x, base - h); g.fill();
      g.fillStyle = D.treeLit;
      g.beginPath(); g.moveTo(x, base - h); g.quadraticCurveTo(x - w, base - h * 0.3, x, base); g.closePath(); g.fill();
    } else {
      // Round canopy on a short trunk
      const r = h * 0.32, cy = base - h + r;
      g.fillStyle = D.tree; g.fillRect(x - 1, cy, 2, base - cy);
      g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill();
      g.fillStyle = D.treeLit;
      g.beginPath(); g.arc(x, cy, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.fill();
    }
  }

  function prismBackground(g, W, H) {
    const cx = W / 2, ox = (W - FW) / 2;
    // Stepped poster sky, lightest at the horizon
    for (let i = 0; i < D.sky.length; i++) { g.fillStyle = D.sky[i]; g.fillRect(0, D.skyY[i], W, D.skyY[i + 1] - D.skyY[i] + 1); }
    // Long flat cloud bars low in the sky
    g.fillStyle = D.cloud;
    const ncl = Math.max(2, Math.round(W / 300));
    for (let i = 0; i < ncl; i++) {
      const w = 90 + hash(i * 4.4 + 2) * 140, x = hash(i * 7.9 + 1) * W - w / 2, y = 222 + hash(i * 3.1 + 6) * 38;
      rr(g, x, y, w, 5, 2.5); g.fill();
      rr(g, x + w * 0.2, y + 8, w * 0.5, 4, 2); g.fill();
    }
    // Stars
    const ns = Math.round(W * 0.11);
    for (let i = 0; i < ns; i++) {
      const x = hash(i * 3.17 + 0.5) * W, y = 16 + Math.pow(hash(i * 7.31 + 2.2), 1.5) * (HORIZON - 120);
      const s = hash(i * 1.93 + 5.1);
      g.globalAlpha = 0.18 + s * 0.45; g.fillStyle = D.star;
      g.beginPath(); g.arc(x, y, s > 0.92 ? 1.3 : s > 0.6 ? 0.95 : 0.65, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // Low rolling hills in two layers
    hillLayer(g, W, HORIZON - 40, 16, 0.0085, 1.3, D.hillFarLit, D.hillFar, 7);
    hillLayer(g, W, HORIZON - 16, 11, 0.0145, 4.1, D.hillMidLit, D.hillMid, 5);
    // Open water with a soft mirror of the hills
    const water = g.createLinearGradient(0, HORIZON + 4, 0, H);
    water.addColorStop(0, D.water0); water.addColorStop(1, D.water1);
    g.fillStyle = water; g.fillRect(0, HORIZON + 4, W, H - HORIZON - 4);
    g.save();
    g.beginPath(); g.rect(0, HORIZON + 6, W, H); g.clip();
    g.translate(0, HORIZON + 6); g.scale(1, -0.45); g.translate(0, -HORIZON);
    g.globalAlpha = 0.35; g.fillStyle = D.reflect; hillPath(g, W, HORIZON - 40, 16, 0.0085, 1.3); g.fill();
    g.restore();
    // Forest line on the shore, taller toward the edges so it frames the field
    g.fillStyle = D.tree; g.fillRect(0, HORIZON - 3, W, 8);
    for (let x = -8, i = 0; x < W + 10; i++) {
      const edge = Math.min(1, Math.abs(x - cx) / 420);
      const h = 8 + hash(i * 3.3 + 7) * 10 + edge * edge * 26;
      prismTree(g, x, HORIZON + 4, h, hash(i * 5.7 + 3) < 0.55 ? 0 : 1);
      x += 6 + hash(i * 1.9 + 2) * 10 + (1 - edge) * 5;
    }
    g.fillStyle = 'rgba(242,234,215,0.16)'; g.fillRect(0, HORIZON + 5, W, 1);
    prismFrame(g, ox);
  }

  /* Dark wooden frame with brass corner brackets and studs. */
  function prismFrame(g, ox) {
    const L = ox, R = ox + FW - WALL;
    let gr = g.createLinearGradient(0, WALL, 0, WALL + 16);
    gr.addColorStop(0, 'rgba(5,8,18,0.42)'); gr.addColorStop(1, 'rgba(5,8,18,0)');
    g.fillStyle = gr; g.fillRect(L + WALL, WALL, FW - 2 * WALL, 16);
    gr = g.createLinearGradient(L + WALL, 0, L + WALL + 14, 0);
    gr.addColorStop(0, 'rgba(5,8,18,0.36)'); gr.addColorStop(1, 'rgba(5,8,18,0)');
    g.fillStyle = gr; g.fillRect(L + WALL, WALL, 14, FH - WALL);
    g.fillStyle = D.frame;
    g.fillRect(L, 0, WALL, FH); g.fillRect(R, 0, WALL, FH); g.fillRect(L, 0, FW, WALL);
    g.fillStyle = D.frameMid;
    g.fillRect(L + 3, 3, WALL - 6, FH); g.fillRect(R + 3, 3, WALL - 6, FH); g.fillRect(L + 3, 3, FW - 6, WALL - 6);
    // Wood grain
    g.strokeStyle = D.frameGrain; g.lineWidth = 1;
    g.beginPath();
    for (const x of [L, R]) {
      for (const gx of [4.5, 8]) {
        g.moveTo(x + gx, WALL);
        for (let y = WALL; y <= FH; y += 36) g.lineTo(x + gx + (hash(x * 0.37 + gx + y * 0.11) - 0.5) * 1.6, y);
      }
    }
    for (const gy of [4.5, 8]) {
      g.moveTo(L + WALL, gy);
      for (let x = L + WALL; x <= L + FW - WALL; x += 40) g.lineTo(x, gy + (hash(x * 0.21 + gy) - 0.5) * 1.6);
    }
    g.stroke();
    // Bevels
    g.fillStyle = D.frameLit;
    g.fillRect(L, 0, FW, 1.5); g.fillRect(L, 0, 1.5, FH); g.fillRect(R, WALL, 1.5, FH - WALL);
    g.fillStyle = D.frameShade;
    g.fillRect(L + WALL - 2, WALL - 2, 2, FH - WALL + 2); g.fillRect(L + WALL, WALL - 2, FW - 2 * WALL, 2);
    g.fillRect(R + WALL - 1.5, 0, 1.5, FH);
    // Brass studs down the posts and along the top rail
    for (let y = 84; y < FH; y += 78) for (const x of [L, R]) stud(g, x + WALL / 2, y);
    for (let x = L + 96; x < L + FW - 60; x += 102) stud(g, x, WALL / 2);
    // Brass corner brackets
    const B = 28;
    bracket(g, [[L, 0], [L + B, 0], [L + B, WALL], [L + WALL, WALL], [L + WALL, B], [L, B]], L, 0, B, true);
    bracket(g, [[R + WALL, 0], [R + WALL - B, 0], [R + WALL - B, WALL], [R, WALL], [R, B], [R + WALL, B]], R + WALL - B, 0, B, false);
  }
  function stud(g, x, y) {
    g.fillStyle = D.brassShade; g.beginPath(); g.arc(x + 0.4, y + 0.5, 2.3, 0, TAU); g.fill();
    g.fillStyle = D.brass; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
    g.fillStyle = D.brassLit; g.beginPath(); g.arc(x - 0.6, y - 0.6, 0.8, 0, TAU); g.fill();
  }
  /* An L-shaped brass bracket: shadow edge to the lower right, lit edge to the upper left, three rivets. */
  function bracket(g, pts, bx, by, B, left) {
    g.save(); g.translate(0.8, 0.8); polyFill(g, pts, D.brassShade); g.restore();
    g.save(); g.translate(-0.8, -0.8); polyFill(g, pts, D.brassLit); g.restore();
    polyFill(g, pts, D.brass);
    const rx = left ? [bx + 6, bx + B - 6, bx + 6] : [bx + B - 6, bx + 6, bx + B - 6], ry = [by + 6, by + 6, by + B - 6];
    for (let k = 0; k < 3; k++) {
      g.fillStyle = D.brassShade; g.beginPath(); g.arc(rx[k], ry[k], 1.6, 0, TAU); g.fill();
      g.fillStyle = D.brassLit; g.beginPath(); g.arc(rx[k] - 0.5, ry[k] - 0.5, 0.6, 0, TAU); g.fill();
    }
  }

  function gemPath(g, x, y) {
    const c = 4;
    g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + BW - c, y); g.lineTo(x + BW, y + c); g.lineTo(x + BW, y + BH - c);
    g.lineTo(x + BW - c, y + BH); g.lineTo(x + c, y + BH); g.lineTo(x, y + BH - c); g.lineTo(x, y + c); g.closePath();
  }

  /* A cut-glass gem: eight facets around a table, lit from the top-left, with a refracted sliver. */
  function paintGem(g, x, y, tier) {
    const T = GEMS[tier], w = BW, h = BH, c = 4, i = 5;
    const O = [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]];
    const tl = [x + i, y + i], tr = [x + w - i, y + i], br = [x + w - i, y + h - i], bl = [x + i, y + h - i];
    g.save(); g.translate(2, 3); g.fillStyle = D.shadow; gemPath(g, x, y); g.fill(); g.restore();
    polyFill(g, [O[0], O[1], tr, tl], T.top);
    polyFill(g, [O[7], O[0], tl], T.top);
    polyFill(g, [O[6], O[7], tl, bl], T.lit);
    polyFill(g, [O[1], O[2], tr], T.lit);
    polyFill(g, [O[5], O[6], bl], T.mid);
    polyFill(g, [O[2], O[3], br, tr], T.shade);
    polyFill(g, [O[3], O[4], br], T.deep);
    polyFill(g, [O[4], O[5], bl, br], T.deep);
    // Table: two tones, as if light passes through
    polyFill(g, [tl, tr, br, bl], T.base);
    polyFill(g, [[x + w * 0.58, y + i], tr, br, [x + w * 0.42, y + h - i]], T.mid);
    // Refraction: a sliver of a neighbouring colour bent through the table
    g.globalAlpha = 0.6;
    polyFill(g, [[x + w * 0.66, y + i], [x + w * 0.71, y + i], [x + w * 0.62, y + h - i], [x + w * 0.57, y + h - i]], T.refr);
    g.globalAlpha = 0.35;
    polyFill(g, [[x + w * 0.73, y + i], [x + w * 0.745, y + i], [x + w * 0.655, y + h - i], [x + w * 0.64, y + h - i]], P.paper);
    g.globalAlpha = 1;
    if (tier === 3) {
      // Faceted inclusion: a star cut inside the deep tier
      const mx = x + w / 2, my = y + h / 2;
      g.strokeStyle = T.incl; g.globalAlpha = 0.45; g.lineWidth = 0.7;
      g.beginPath();
      for (const p of [tl, tr, br, bl, [mx - 12, y + i], [mx + 12, y + i], [mx - 12, y + h - i], [mx + 12, y + h - i]]) { g.moveTo(mx, my); g.lineTo(p[0], p[1]); }
      g.moveTo(mx - 7, my); g.lineTo(mx, my - 3.5); g.lineTo(mx + 7, my); g.lineTo(mx, my + 3.5); g.closePath();
      g.stroke();
      g.globalAlpha = 0.8; g.fillStyle = P.paper;
      for (const [fx, fy] of [[16, 9], [47, 12], [54, 8]]) g.fillRect(x + fx, y + fy, 1.2, 1.2);
      g.globalAlpha = 1;
    }
    // Facet edges
    g.strokeStyle = 'rgba(242,234,215,0.3)'; g.lineWidth = 0.8;
    g.beginPath();
    for (const [a, b] of [[tl, O[0]], [tl, O[7]], [tr, O[1]], [tr, O[2]], [br, O[3]], [br, O[4]], [bl, O[5]], [bl, O[6]]]) { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.rect(tl[0], tl[1], tr[0] - tl[0], bl[1] - tl[1]);
    g.stroke();
    // Highlight streak and a catch-light on the top-left facet
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.moveTo(x + i + 3, y + h - i - 1); g.lineTo(x + i + 7, y + i + 1); g.lineTo(x + i + 11, y + i + 1); g.lineTo(x + i + 7, y + h - i - 1); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x + 9, y + 2.6, 0.9, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(19,25,43,0.7)'; g.lineWidth = 1;
    gemPath(g, x + 0.5, y + 0.5); g.stroke();
  }

  /* A glass vial with coloured liquid and a brass cap. */
  function paintVial(g, cx, cy, type) {
    const K = VIALS[type], w = 34, h = 16, x = cx - w / 2, y = cy - h / 2;
    g.fillStyle = D.shadow; rr(g, x + 2, y + 3, w, h, h / 2); g.fill();
    g.fillStyle = D.outline; rr(g, x - 1.5, y - 1.5, w + 3, h + 3, h / 2 + 1.5); g.fill();
    g.fillStyle = D.glass; rr(g, x, y, w, h, h / 2); g.fill();
    g.save(); rr(g, x, y, w, h, h / 2); g.clip();
    g.fillStyle = K.base; g.fillRect(x, cy - 4, w, h);
    g.fillStyle = K.shade; g.fillRect(x, cy + 4, w, h);
    g.fillStyle = K.lit; g.fillRect(x, cy - 4, w, 1.4);
    g.fillStyle = 'rgba(242,234,215,0.75)'; rr(g, x + 5, y + 1.6, w - 16, 2.2, 1.1); g.fill();
    g.restore();
    // Brass cap on the right end
    g.fillStyle = D.outline; rr(g, x + w - 9, y - 2.5, 11, h + 5, 3); g.fill();
    g.fillStyle = D.brass; rr(g, x + w - 8, y - 1.5, 9, h + 3, 2.5); g.fill();
    g.fillStyle = D.brassLit; g.fillRect(x + w - 7, y - 0.5, 1.6, h + 1);
    g.fillStyle = D.brassShade; g.fillRect(x + w - 1.6, y, 1.4, h);
    // Icon
    const ix = cx - 4;
    g.fillStyle = D.outline; g.strokeStyle = D.outline; g.lineCap = 'round'; g.lineJoin = 'round';
    if (type === 'wide') {
      g.lineWidth = 2; g.beginPath(); g.moveTo(ix - 5, cy); g.lineTo(ix + 5, cy); g.stroke();
      g.beginPath(); g.moveTo(ix - 10, cy); g.lineTo(ix - 5, cy - 4); g.lineTo(ix - 5, cy + 4); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(ix + 10, cy); g.lineTo(ix + 5, cy - 4); g.lineTo(ix + 5, cy + 4); g.closePath(); g.fill();
    } else if (type === 'multi') {
      for (const d of [-7, 0, 7]) { g.beginPath(); g.arc(ix + d, cy, 2.5, 0, TAU); g.fill(); }
    } else {
      // Hourglass
      g.beginPath(); g.moveTo(ix - 4.5, cy - 5); g.lineTo(ix + 4.5, cy - 5); g.lineTo(ix, cy); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(ix - 4.5, cy + 5); g.lineTo(ix + 4.5, cy + 5); g.lineTo(ix, cy); g.closePath(); g.fill();
    }
  }

  /* Live layer: twinkles, the north star, ripples on the water, its reflection and fireflies. */
  function prismLife(g, ox, t, W) {
    for (const s of TWINKLES) {
      const a = 0.5 + 0.5 * Math.sin(t * (1.1 + s.s) + s.p);
      if (a < 0.2 || s.y > 200) continue;
      g.globalAlpha = a * 0.75;
      NB.draw.star4(g, ox + s.x, s.y, s.s * 1.8 * (0.6 + a * 0.4), 0, P.paper);
    }
    g.globalAlpha = 1;
    const nx = ox + FW / 2, ny = 40, pulse = 1 + Math.sin(t * 1.6) * 0.07;
    NB.draw.glow(g, nx, ny, 26 * pulse, P.paper, 0.16);
    NB.draw.star4(g, nx, ny, 9 * pulse, Math.sin(t * 0.5) * 0.05, P.paper);
    // Ripple lines drifting on the water
    g.lineCap = 'round'; g.strokeStyle = P.paper;
    const n = Math.max(12, Math.round(W / 30)), span = W + 200;
    for (let i = 0; i < n; i++) {
      const k = Math.pow(hash(i * 2.9 + 11), 0.8);
      const y = HORIZON + 14 + k * (FH - HORIZON - 24) + Math.sin(t * 1.3 + i) * 1.2;
      const len = 12 + hash(i * 6.1 + 3) * 50 * (0.4 + k);
      const x = ((((hash(i * 4.3 + 9) * span + t * (hash(i * 1.7) - 0.5) * 18) % span) + span) % span) - 100;
      g.globalAlpha = (0.05 + 0.11 * k) * (0.6 + 0.4 * Math.sin(t * 0.9 + i * 1.7));
      g.lineWidth = 1 + k;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
    }
    // The north star, broken up by the ripples
    g.fillStyle = P.paper;
    for (let k = 0; k < 9; k++) {
      const y = HORIZON + 12 + k * 9, wob = Math.sin(t * 2.6 + k * 0.9) * (1 + k * 0.35), w = 7 - k * 0.55;
      g.globalAlpha = 0.3 - k * 0.028;
      g.fillRect(nx + wob - w / 2, y, w, 2.2);
    }
    // Fireflies over the water
    for (let i = 0; i < 14; i++) {
      const x = hash(i * 5.1 + 3) * W + Math.sin(t * (0.3 + hash(i) * 0.4) + i) * 30;
      const y = HORIZON - 26 + hash(i * 2.7 + 1) * 104 + Math.sin(t * (0.5 + hash(i * 3) * 0.5) + i * 2) * 12;
      const blink = Math.sin(t * (1.2 + hash(i * 7) * 1.5) + i * 4);
      if (blink < 0.05) continue;
      g.fillStyle = D.firefly;
      g.globalAlpha = blink * 0.2; g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill();
      g.globalAlpha = blink * 0.95; g.beginPath(); g.arc(x, y, 1.5, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }

  /* The raft: the wooden plank with brass end caps and trim, floating on the water. */
  function drawRaft(g, x, y, w, h, lean, t) {
    const hw = w / 2, wl = PAD_Y + PAD_H + 4;
    g.fillStyle = D.shadow;
    g.beginPath(); g.ellipse(x + 4, wl, hw + 6, 3.2, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(201,127,62,0.16)'; g.fillRect(x - hw + 4, wl, w - 8, 5);
    // Small wake rings at both ends
    const wv = (((t * 0.8) % 1) + 1) % 1, wr = 3 + wv * 6, wy = 1.4 + wv * 1.4;
    g.strokeStyle = P.paper; g.lineWidth = 1.2; g.globalAlpha = (1 - wv) * 0.35;
    g.beginPath();
    g.ellipse(x - hw - 2 - wv * 6, wl, wr, wy, 0, 0, Math.PI);
    g.moveTo(x + hw + 2 + wv * 6 + wr, wl);
    g.ellipse(x + hw + 2 + wv * 6, wl, wr, wy, 0, 0, Math.PI);
    g.stroke(); g.globalAlpha = 1;
    g.save(); g.translate(x, y + h / 2 + Math.sin(t * 2.2) * 0.8); g.rotate(lean + Math.sin(t * 1.4) * 0.012);
    const top = -h / 2, bot = h / 2;
    plankFace(g, hw, top, h, w);
    g.fillStyle = D.brass; g.fillRect(-hw, bot - 2.2, w, 2.2);
    g.fillStyle = D.brassLit; g.fillRect(-hw, bot - 2.2, w, 0.8);
    g.restore();
    for (const s of [-1, 1]) {
      const cx = s * (hw - 3.5);
      g.fillStyle = D.outline; rr(g, cx - 5.6, top - 3.1, 11.2, h + 6.2, 3); g.fill();
      g.fillStyle = D.brass; rr(g, cx - 4.5, top - 2, 9, h + 4, 2.5); g.fill();
      g.fillStyle = D.brassLit; g.fillRect(cx - 4, top - 1.5, 8, 1.4); g.fillRect(cx - 4, top - 1.5, 1.4, h + 3);
      g.fillStyle = D.brassShade; g.fillRect(cx + 2.6, top - 0.5, 1.4, h + 2.5); g.fillRect(cx - 4, bot + 0.6, 8, 1.2);
      for (const ry of [top + 2.5, bot - 2.5]) {
        g.fillStyle = D.brassShade; g.beginPath(); g.arc(cx, ry, 1.3, 0, TAU); g.fill();
        g.fillStyle = D.brassLit; g.beginPath(); g.arc(cx - 0.4, ry - 0.4, 0.5, 0, TAU); g.fill();
      }
    }
    g.restore();
  }

  /* A glass orb: cream core, faint teal rim, a swirl that turns as it rolls and a soft flat halo. */
  function orb(g, x, y, r, roll, st, ang, plain) {
    if (!(r > 0.2)) return;
    g.save(); g.translate(x, y);
    if (!plain) {
      const a0 = g.globalAlpha;
      g.fillStyle = P.teal; g.globalAlpha = a0 * 0.12; g.beginPath(); g.arc(0, 0, r * 2.4, 0, TAU); g.fill();
      g.fillStyle = P.paper; g.globalAlpha = a0 * 0.16; g.beginPath(); g.arc(0, 0, r * 1.65, 0, TAU); g.fill();
      g.globalAlpha = a0;
    }
    if (st !== 1) { g.rotate(ang); g.scale(st, 1 / st); g.rotate(-ang); }
    g.fillStyle = D.outline; g.beginPath(); g.arc(0, 0, r + 2, 0, TAU); g.fill();
    g.fillStyle = P.teal; g.beginPath(); g.arc(0, 0, r + 1.1, 0, TAU); g.fill();
    g.fillStyle = D.orbShade; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.fillStyle = D.orbCore; g.beginPath(); g.arc(-r * 0.16, -r * 0.18, r * 0.8, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(42,157,143,0.5)'; g.lineWidth = r * 0.22; g.lineCap = 'round';
    g.beginPath(); g.arc(0, 0, r * 0.5, roll, roll + 2.2); g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(-r * 0.36, -r * 0.4, r * 0.27, r * 0.17, -0.6, 0, TAU); g.fill();
    g.restore();
  }

  /* Short tapered light trail behind an orb. pts[0] is the newest position. */
  function lightTrail(g, pts, n, r) {
    g.lineCap = 'round'; g.strokeStyle = P.paper;
    for (let i = 1; i < n; i++) {
      const k = 1 - i / n;
      g.globalAlpha = 0.34 * k; g.lineWidth = r * 1.5 * k + 0.5;
      g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
    }
    g.globalAlpha = 1;
  }

  /* ---------- The two looks ---------- */
  const WINTER = {
    key: 'w', tiers: TIERS, powers: POWERS,
    paintBg: winterBackground, paintBrick: iceBrick, paintCap: iceCapsule,
    life: (g, ox, t) => winterSky(g, ox, t),
    paddle: (g, x, y, w, h, lean) => drawSled(g, x, y, w, h, lean),
    ball: snowball,
    flashShape: (g, x, y) => rr(g, x, y, BW, BH, 3),
    fx: {
      white: P.snow, spray: [P.snow, P.ice, P.frost], spray2: [P.snow, P.ice], wall: [P.ice, C.wallLit], multiRing: P.mint,
      text: P.cream, gold: P.gold, hot: P.amber, warn: P.red, clear: [P.cream, P.gold, P.snow, P.frost],
      death: [P.snow, P.ice, P.frost, C.lake0], capPoof: P.ice, glint: P.snow, ghost: 'rgba(223,233,245,0.28)',
      breakA: 'square', breakB: 'shard', last: 'LAST SNOWBALL'
    }
  };
  const PRISM = {
    key: 'p', tiers: GEMS, powers: VIALS,
    paintBg: prismBackground, paintBrick: paintGem, paintCap: paintVial,
    life: prismLife,
    paddle: drawRaft,
    ball: orb,
    flashShape: gemPath,
    fx: {
      white: P.paper, spray: [P.paper, '#9fe3d9', P.teal], spray2: [P.paper, '#9fe3d9'], wall: [D.frameLit, D.brass], multiRing: P.teal,
      text: P.paper, gold: P.mustard, hot: P.coral, warn: P.coral, clear: [P.paper, P.mustard, P.coral, P.teal],
      death: [P.paper, '#9fe3d9', P.teal, '#2b3f66'], capPoof: P.paper, glint: P.paper, ghost: 'rgba(242,234,215,0.28)',
      breakA: 'shard', breakB: 'square', last: 'LAST ORB'
    }
  };
  /* Season is read at call time (create / thumb), never at file load. */
  const theme = () => (NB.winter ? WINTER : PRISM);

  NB.register({
    id: 'glacier-breaker',
    title: 'Prism Breaker',
    tags: ['Classic', 'Arcade'],
    get accent() { return NB.winter ? '#a9c9ff' : P.teal; },
    order: 3,
    get blurb() {
      return NB.winter
        ? 'Break a wall of lake ice with a snowball and keep it from slipping past your sled. Chain hits between bounces for bonus points. Catch falling capsules: WIDE stretches the sled for 10 seconds, MULTI adds two extra balls and SLOW eases the ball for 8 seconds.'
        : 'Break a wall of glass gems with a glowing orb and keep it from slipping past your raft. Chain hits between bounces for bonus points. Catch falling vials: WIDE stretches the raft for 10 seconds, MULTI adds two extra orbs and SLOW eases the orb for 8 seconds.';
    },
    get controls() {
      return NB.winter
        ? [['Mouse / touch', 'Steer the sled'], ['← → / A D', 'Steer the sled'], ['Space / tap', 'Launch the snowball']]
        : [['Mouse / touch', 'Steer the raft'], ['← → / A D', 'Steer the raft'], ['Space / tap', 'Launch the orb']];
    },

    thumb(g, W, H, t) {
      const th = theme(), ox = (W - FW) / 2;
      background(g, W, H, th);
      th.life(g, ox, t, W);
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < COLS; c++) {
          const s = r * 10 + c;
          if (hash(s * 1.7 + 3) < 0.16) continue;
          const tier = r === 0 ? 3 : r < 3 ? 2 : 1, x = ox + LEFT + c * (BW + GAP), y = TOP + r * (BH + GAP);
          blitBrick(g, x, y, tier, 1, th);
          if (hash(s * 5.7 + 1) < 0.22) drawCracks(g, x, y, THUMB_CRACKS[s % 3], 1, th.tiers[tier]);
        }
      }
      // Attract mode: the paddle tracks a bouncing ball
      const lo = Math.max(ox + WALL + 30, 30), hi = Math.max(lo + 1, Math.min(ox + FW - WALL - 30, W - 30)), span = hi - lo;
      const tri = (v, s) => Math.abs((((v % (2 * s)) + 2 * s) % (2 * s)) - s);
      const A = 210, bx = (k) => lo + tri(k * 230, span), by = (k) => PAD_Y - BALL_R - (A - tri(k * 300, A));
      // Falling capsule
      const per = 3.2, cyc = Math.floor(t / per), ph = (t - cyc * per) / per;
      const capX = clamp(ox + FW / 2 + (hash(cyc * 1.37 + 2) - 0.5) * 520, lo, hi), capY = 236 + ph * 270;
      drawCap(g, capX, capY, POWER_KEYS[((cyc % 3) + 3) % 3], Math.sin(t * 5) * 0.18, 1, th);
      const phase = ((t * 300) % (2 * A) + 2 * A) % (2 * A), q = squash(Math.max(0, 1 - phase / 70));
      const plo = Math.max(ox + WALL + PAD_W / 2 + 2, PAD_W / 2), phi = Math.max(plo, Math.min(ox + FW - WALL - PAD_W / 2 - 2, W - PAD_W / 2));
      const px = clamp(bx(t) + Math.sin(t * 1.3) * 16, plo, phi);
      th.paddle(g, px, PAD_Y + q * 3, PAD_W * (1 + q * 0.12), PAD_H * (1 - q * 0.28), Math.cos(t * 1.3) * 0.03, t);
      if (th === WINTER) {
        g.fillStyle = P.ice;
        for (let k = 6; k >= 1; k--) drawPuff(g, bx(t - k * 0.028), by(t - k * 0.028), 1 - k / 7);
        g.globalAlpha = 1;
      } else {
        g.lineCap = 'round'; g.strokeStyle = P.paper;
        for (let k = 1; k < 7; k++) {
          const f = 1 - k / 7, a = t - (k - 1) * 0.022, b = t - k * 0.022;
          g.globalAlpha = 0.34 * f; g.lineWidth = BALL_R * 1.5 * f + 0.5;
          g.beginPath(); g.moveTo(bx(a), by(a)); g.lineTo(bx(b), by(b)); g.stroke();
        }
        g.globalAlpha = 1;
      }
      th.ball(g, bx(t), by(t), BALL_R, t * 8, 1, 0);
      NB.draw.vignette(g, W, H, 0.45);
    },

    create(api) {
      const W = FW, H = FH, th = theme(), winter = th === WINTER, fx = th.fx;
      let pad, balls, bricks, caps, puffs, glints, ripples, lives, level, pts, dead, deadT, serveT, spd, slowF, wideT, slowT, glintT, cleared, crack, deathX, sheetStart;

      const baseSpeed = () => 360 + Math.min(level, 12) * 24;
      function hpFor(r) {
        if (level === 0) return r < 2 ? 2 : 1;
        if (level < 3) return r < 2 ? 3 : r < 4 ? 2 : 1;
        return r < 3 ? 3 : r < 5 ? 2 : 1;
      }
      function build() {
        bricks = [];
        const pat = PATTERNS[level % PATTERNS.length];
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (!pat(r, c)) continue;
            const hp = hpFor(r), seed = Math.random() * 1000;
            bricks.push({
              x: LEFT + c * (BW + GAP), y: TOP + r * (BH + GAP), hp, max: hp, hit: 0, px: 0, py: 0,
              cracks: [makeCrack(seed, 0), makeCrack(seed, 1)], delay: r * 0.06 + Math.abs(c - 4.5) * 0.025
            });
          }
        }
        sheetStart = null; // the drop-in animation starts on the next draw
      }

      function newBall(x, y, dx, dy, stuck) {
        return { x, y, dx, dy, r: BALL_R, stuck: !!stuck, gone: false, chain: 0, sq: 0, roll: 0, puffT: 0, pop: stuck ? 0 : 1, idle: 0, trail: [] };
      }
      function serve() {
        balls = [newBall(pad.x, PAD_Y - BALL_R - 1, 0, -1, true)];
        spd = baseSpeed(); serveT = 0;
      }
      /* Rings on open water (default look only; the winter lake is frozen). */
      function addRipple(x, y, size, life, delay) {
        if (!winter && ripples.length < 24) ripples.push({ x, y, size, life, age: -(delay || 0) });
      }

      /* Normalise direction and keep it away from pure horizontal or vertical paths. */
      function fixDir(b) {
        let m = Math.hypot(b.dx, b.dy);
        if (!(m > 1e-6)) { b.dx = 0.6; b.dy = -0.8; m = 1; }
        b.dx /= m; b.dy /= m;
        if (Math.abs(b.dy) < MIN_DY) {
          const sy = b.dy < 0 ? -1 : 1, sx = b.dx < 0 ? -1 : 1;
          b.dy = sy * MIN_DY; b.dx = sx * Math.sqrt(1 - MIN_DY * MIN_DY);
        }
        if (Math.abs(b.dx) < MIN_DX) {
          const sy = b.dy < 0 ? -1 : 1, sx = b.dx < 0 ? -1 : b.dx > 0 ? 1 : (Math.random() < 0.5 ? -1 : 1);
          b.dx = sx * MIN_DX; b.dy = sy * Math.sqrt(1 - MIN_DX * MIN_DX);
        }
      }
      function turn(b, a) {
        const c = Math.cos(a), s = Math.sin(a), dx = b.dx;
        b.dx = dx * c - b.dy * s; b.dy = dx * s + b.dy * c; fixDir(b);
      }

      function launch(b) {
        b.stuck = false; b.sq = 1; b.trail.length = 0;
        const a = -Math.PI / 2 + rand(-0.5, 0.5);
        b.dx = Math.cos(a); b.dy = Math.sin(a); fixDir(b);
        pad.kick = Math.max(pad.kick, 0.6);
        api.sfx('bounce', 0.5);
        api.burst(b.x, b.y + b.r, { n: 7, speed: 100, dir: -Math.PI / 2, spread: 2.4, colors: fx.spray2, shape: 'square', size: 1.8, life: 0.35, grav: 260 });
      }
      function launchAll() { for (const b of balls) if (b.stuck) launch(b); serveT = 0; }

      function spawnCap(x, y) {
        const r = Math.random(), type = r < 0.38 ? 'wide' : r < 0.7 ? 'multi' : 'slow';
        caps.push({ x, y, vy: 120, type, t: 0, ph: Math.random() * TAU });
      }

      function multi() {
        let src = null;
        for (const b of balls) if (!b.stuck) { src = b; break; }
        if (!src) src = balls[0];
        if (!src) return;
        if (src.stuck) launch(src);
        for (const off of [-0.45, 0.45]) {
          if (balls.length >= 9) break;
          const nb = newBall(src.x, src.y, src.dx, src.dy, false);
          turn(nb, off); nb.pop = 0.35; balls.push(nb);
        }
        api.ring(src.x, src.y, { r0: 4, r1: 36, life: 0.35, color: fx.multiRing, width: 2 });
        api.sfx('perfect', 2);
      }

      function catchCap(c) {
        const K = th.powers[c.type];
        api.sfx('pickup', 3); api.flash(K.base, 0.1); api.shake(2);
        api.ring(c.x, PAD_Y, { r0: 8, r1: 64, life: 0.42, color: K.base, width: 3 });
        api.burst(c.x, PAD_Y - 4, { n: 14, speed: 210, colors: [K.base, K.lit, fx.white], shape: 'square', size: 2.2, life: 0.55, dir: -Math.PI / 2, spread: 2.2, grav: 320 });
        api.burst(c.x, PAD_Y - 4, { n: 6, speed: 160, color: K.lit, shape: 'spark', blend: 'add', size: 1.4, life: 0.3, dir: -Math.PI / 2, spread: 1.6 });
        api.float(c.x, PAD_Y - 36, K.label, { color: K.base, size: 28 });
        pad.kick = Math.max(pad.kick, 0.7);
        if (c.type === 'wide') wideT = WIDE_TIME;
        else if (c.type === 'slow') slowT = SLOW_TIME;
        else multi();
      }

      function hitBrick(k, ball) {
        const T = th.tiers[k.hp];
        k.hp--; k.hit = 1; k.px = ball.dx * 3; k.py = ball.dy * 3;
        ball.chain++; ball.idle = 0;
        const chain = ball.chain, gain = 10 * Math.min(chain, 10);
        pts += gain; api.score(pts);
        spd = Math.min(MAX_SPEED, spd + 3);
        const cx = k.x + BW / 2, cy = k.y + BH / 2;
        if (k.hp <= 0) {
          api.burst(cx, cy, { n: 16, speed: 230, colors: T.chips, shape: fx.breakA, size: 2.6, life: 0.75, grav: 620, drag: 1.2, spin: 14 });
          api.burst(cx, cy, { n: 7, speed: 260, colors: [fx.white, T.lit, T.base], shape: fx.breakB, size: 2.8, life: 0.6, grav: 520, drag: 1.4 });
          api.burst(cx, cy, { n: 5, speed: 170, color: fx.white, shape: 'spark', blend: 'add', size: 1.4, life: 0.25 });
          api.ring(cx, cy, { r0: 6, r1: 38, life: 0.32, color: T.lit, width: 2 });
          api.shake(2.5 + Math.min(chain, 8) * 0.25); api.sfx('brick', chain);
          if (chain >= 2) api.float(cx, cy - 4, '+' + gain, { color: chain >= 8 ? fx.hot : chain >= 4 ? fx.gold : fx.text, size: 18 + Math.min(chain, 10) * 1.3 });
          if (chain % 5 === 0) {
            api.float(cx, cy - 32, 'CHAIN ×' + chain, { color: fx.gold, size: 26, life: 1.1 });
            api.ring(cx, cy, { r0: 10, r1: 72, life: 0.5, color: fx.gold, width: 3 });
          }
          if (Math.random() < DROP && caps.length < 3) spawnCap(cx, cy);
          if (!bricks.some((q) => q.hp > 0)) cleared = true;
        } else {
          api.sfx('chip'); api.shake(1);
          api.burst(cx - ball.dx * 8, cy - ball.dy * 8, { n: 6, speed: 110, colors: T.chips, shape: 'square', size: 1.8, life: 0.35, grav: 320 });
        }
      }

      function collide(b, axis) {
        for (const k of bricks) {
          if (k.hp <= 0) continue;
          const nx = clamp(b.x, k.x, k.x + BW), ny = clamp(b.y, k.y, k.y + BH);
          const dx = b.x - nx, dy = b.y - ny;
          if (dx * dx + dy * dy < b.r * b.r) {
            if (axis === 'x') { b.x = b.dx > 0 ? k.x - b.r : k.x + BW + b.r; b.dx = -b.dx; }
            else { b.y = b.dy > 0 ? k.y - b.r : k.y + BH + b.r; b.dy = -b.dy; }
            fixDir(b); b.sq = 1;
            hitBrick(k, b);
            return;
          }
        }
      }

      function wallHit(b, x, y, dir) {
        b.sq = 1; fixDir(b); api.sfx('tick');
        api.burst(x, y, { n: 4, speed: 80, colors: fx.wall, shape: 'square', size: 1.5, life: 0.28, dir, spread: 2.2, grav: 200 });
      }

      function stepBall(b, h, v) {
        b.x += b.dx * v * h;
        if (b.x < WALL + b.r) { b.x = WALL + b.r; b.dx = Math.abs(b.dx); wallHit(b, WALL, b.y, 0); }
        else if (b.x > W - WALL - b.r) { b.x = W - WALL - b.r; b.dx = -Math.abs(b.dx); wallHit(b, W - WALL, b.y, Math.PI); }
        collide(b, 'x'); if (cleared) return;
        b.y += b.dy * v * h;
        if (b.y < WALL + b.r) { b.y = WALL + b.r; b.dy = Math.abs(b.dy); wallHit(b, b.x, WALL, Math.PI / 2); }
        collide(b, 'y'); if (cleared) return;

        const half = pad.w / 2;
        if (b.dy > 0 && b.y + b.r >= PAD_Y && b.y - b.r <= PAD_Y + PAD_H &&
            b.x >= pad.x - half - b.r && b.x <= pad.x + half + b.r) {
          const off = clamp((b.x - pad.x) / half, -1, 1);
          let a = -Math.PI / 2 + off * 1.05 + rand(-0.04, 0.04);
          if (b.idle > 10) { a += rand(-0.35, 0.35); b.idle = 5; } // a long rally without brick contact gets nudged
          b.dx = Math.cos(a); b.dy = Math.sin(a); fixDir(b);
          if (b.dy > 0) b.dy = -b.dy;
          b.y = PAD_Y - b.r; b.chain = 0; b.sq = 1;
          pad.kick = 1;
          api.sfx('bounce', 0.4 + Math.abs(off) * 0.3);
          api.burst(b.x, PAD_Y, { n: 7, speed: 120, dir: -Math.PI / 2, spread: 1.8, colors: fx.spray, shape: 'square', size: 1.8, life: 0.35, grav: 380 });
          addRipple(pad.x, PAD_Y + PAD_H + 4, 0.8, 0.8, 0);
        }
        if (b.y - b.r > H) b.gone = true;
      }

      function clearSheet() {
        cleared = false;
        for (const b of balls) if (!b.stuck) api.burst(b.x, b.y, { n: 8, speed: 90, colors: fx.spray2, shape: 'square', size: 1.8, life: 0.4 });
        level++;
        pts += SHEET_BONUS; api.score(pts);
        api.sfx('level'); api.flash(fx.text, 0.28); api.shake(5);
        api.float(W / 2, H / 2 - 6, 'SHEET CLEAR', { color: fx.text, size: 48, life: 1.4 });
        api.float(W / 2, H / 2 + 36, '+' + SHEET_BONUS, { color: fx.gold, size: 30, life: 1.4 });
        api.ring(W / 2, H / 2, { r0: 20, r1: 260, life: 0.8, color: fx.text, width: 4 });
        api.burst(W / 2, H / 2, { n: 30, speed: 340, colors: fx.clear, shape: 'square', size: 3, life: 1, grav: 260, drag: 1.4 });
        api.burst(W / 2, H / 2, { n: 10, speed: 260, color: fx.gold, shape: 'spark', blend: 'add', size: 1.6, life: 0.4 });
        caps.length = 0; wideT = 0; slowT = 0;
        build(); serve();
      }

      function loseLife(x) {
        lives--;
        wideT = 0; slowT = 0;
        for (const c of caps) api.burst(c.x, c.y, { n: 5, speed: 60, colors: [th.powers[c.type].base, fx.capPoof], shape: 'square', size: 1.6, life: 0.3 });
        caps.length = 0;
        if (lives <= 0) {
          dead = true; deadT = 0; deathX = x;
          if (winter) crack = makeLakeCrack(x);
          addRipple(x, H - 10, 1.8, 0.5, 0); addRipple(x, H - 10, 1.4, 0.5, 0.07); addRipple(x, H - 10, 1, 0.5, 0.14);
          api.shake(16); api.flash(fx.warn, 0.35); api.sfx('explode');
          api.burst(x, H - 10, { n: 26, speed: 330, colors: fx.death, shape: 'square', size: 3.2, life: 1.1, grav: 700, drag: 1, dir: -Math.PI / 2, spread: 2.4, spin: 16 });
          api.burst(x, H - 10, { n: 14, speed: 380, colors: fx.spray, shape: 'shard', size: 3.4, life: 1, grav: 600, dir: -Math.PI / 2, spread: 2.2 });
          api.ring(x, H - 10, { r0: 10, r1: 150, life: 0.7, color: fx.warn, width: 4 });
          api.ring(x, H - 10, { r0: 4, r1: 80, life: 0.5, color: fx.white, width: 2 });
          api.over(1.2);
        } else {
          api.shake(9); api.flash(fx.warn, 0.18); api.sfx('lose');
          api.burst(x, H - 6, { n: 16, speed: 240, colors: fx.spray, shape: 'square', size: 2.4, life: 0.7, grav: 600, dir: -Math.PI / 2, spread: 1.6 });
          api.ring(x, H - 8, { r0: 6, r1: 60, life: 0.45, color: fx.warn, width: 3 });
          addRipple(x, H - 10, 1.2, 1.1, 0); addRipple(x, H - 10, 0.8, 1.1, 0.15);
          api.float(clamp(x, 90, W - 90), H - 60, lives === 1 ? fx.last : 'MISS', { color: fx.warn, size: 26 });
          serve();
        }
      }

      function makeLakeCrack(x) {
        const rays = [];
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI + ((i + 0.5) / 8) * Math.PI + rand(-0.15, 0.15), len = rand(40, 110), pts = [[0, 0]];
          for (let s = 1; s <= 4; s++) {
            const d = (s / 4) * len, j = rand(-0.25, 0.25);
            pts.push([Math.cos(a + j) * d, Math.sin(a + j) * d * 0.55]);
          }
          rays.push(pts);
        }
        return { x, y: H - 10, rays };
      }
      function drawLakeCrack(g) {
        const e = easeOut(clamp(deadT / 0.22, 0, 1));
        if (e < 0.01) return;
        g.fillStyle = C.outline;
        g.beginPath(); g.ellipse(crack.x, crack.y, 12 * e, 4.5 * e, 0, 0, TAU); g.fill();
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (let pass = 0; pass < 2; pass++) {
          const o = pass ? 0 : 1;
          g.strokeStyle = pass ? C.outline : 'rgba(223,233,245,0.5)'; g.lineWidth = pass ? 2 : 1.2;
          g.beginPath();
          for (const pts of crack.rays) {
            const L = e * (pts.length - 1);
            g.moveTo(crack.x + o, crack.y + o);
            for (let i = 1; i < pts.length && i - 1 < L; i++) {
              const f = Math.min(1, L - (i - 1));
              g.lineTo(crack.x + lerp(pts[i - 1][0], pts[i][0], f) + o, crack.y + lerp(pts[i - 1][1], pts[i][1], f) + o);
            }
          }
          g.stroke();
        }
      }
      function drawRipples(g) {
        g.strokeStyle = P.paper; g.lineWidth = 1.4;
        for (const r of ripples) {
          if (r.age <= 0) continue;
          const k = clamp(r.age / r.life, 0, 1), rx = (8 + k * 80) * r.size;
          g.globalAlpha = (1 - k) * 0.5;
          g.beginPath(); g.ellipse(r.x, r.y, rx, rx * 0.28, 0, 0, TAU); g.stroke();
        }
        g.globalAlpha = 1;
      }

      function drawBrick(g, k, st) {
        const a = clamp((st - k.delay) / 0.5, 0, 1);
        if (a <= 0) return;
        const e = easeBack(a), alpha = Math.min(1, a * 2.5);
        const x = k.x + k.px * k.hit, y = k.y - (1 - e) * 46 + k.py * k.hit;
        if (alpha < 1) g.globalAlpha = alpha;
        blitBrick(g, x, y, k.hp, 1 + k.hit * 0.07, th);
        if (k.max > k.hp) drawCracks(g, x, y, k.cracks, k.max - k.hp, th.tiers[k.hp]);
        if (k.hit > 0.05) {
          g.globalAlpha = alpha * k.hit * 0.7; g.fillStyle = fx.white;
          th.flashShape(g, x, y); g.fill();
        }
        g.globalAlpha = 1;
      }

      return {
        reset() {
          pad = { x: W / 2, tx: W / 2, w: PAD_W, wv: 0, kick: 0, lean: 0 };
          lives = 3; level = 0; pts = 0; dead = false; deadT = 0; cleared = false; crack = null; deathX = W / 2;
          caps = []; puffs = []; glints = []; ripples = []; glintT = 0.6; wideT = 0; slowT = 0; slowF = 1;
          build(); serve();
          api.score(0);
        },
        pointer(x) { if (!dead && Number.isFinite(x)) pad.tx = x; },
        action() { if (!dead && balls.some((b) => b.stuck)) launchAll(); },

        update(dt, inp) {
          // Paddle (input is ignored once the run is over; the world keeps moving)
          const x0 = pad.x;
          if (!dead) {
            const ax = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
            if (ax) { pad.x += ax * 720 * dt; pad.tx = pad.x; }
            else pad.x += (pad.tx - pad.x) * (1 - Math.exp(-dt * 20));
          } else deadT += dt;
          const tw = wideT > 0 ? PAD_WIDE : PAD_W;
          pad.wv = (pad.wv + (tw - pad.w) * 170 * dt) * Math.exp(-dt * 12);
          pad.w = clamp(pad.w + pad.wv * dt, 70, 230);
          const lim = pad.w / 2 + WALL + 2;
          pad.x = clamp(pad.x, lim, W - lim); pad.tx = clamp(pad.tx, lim, W - lim);
          const vx = dt > 0 ? (pad.x - x0) / dt : 0;
          pad.lean += (clamp(vx / 2600, -0.06, 0.06) - pad.lean) * (1 - Math.exp(-dt * 12));
          pad.kick = Math.max(0, pad.kick - dt * 4.5);

          // Power timers
          if (wideT > 0) { wideT -= dt; if (wideT <= 0) { wideT = 0; if (!dead) api.sfx('tick'); } }
          if (slowT > 0) slowT = Math.max(0, slowT - dt);
          slowF += ((slowT > 0 ? 0.7 : 1) - slowF) * (1 - Math.exp(-dt * 4));

          // Ambient life
          for (const k of bricks) k.hit = Math.max(0, k.hit - dt * 6);
          for (let i = puffs.length - 1; i >= 0; i--) {
            const p = puffs[i]; p.life -= dt; p.y -= 10 * dt;
            if (p.life <= 0) { puffs[i] = puffs[puffs.length - 1]; puffs.pop(); }
          }
          for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].age += dt; if (ripples[i].age >= ripples[i].life) ripples.splice(i, 1); }
          glintT -= dt;
          if (glintT <= 0) {
            glintT = rand(0.35, 0.9);
            for (let tries = 0; tries < 6 && glints.length < 5 && bricks.length; tries++) {
              const k = bricks[(Math.random() * bricks.length) | 0];
              if (k.hp > 0) { glints.push({ x: k.x + rand(8, BW - 8), y: k.y + rand(4, BH - 6), age: 0, life: 0.7 }); break; }
            }
          }
          for (let i = glints.length - 1; i >= 0; i--) { glints[i].age += dt; if (glints[i].age >= glints[i].life) glints.splice(i, 1); }

          // Capsules
          for (let i = caps.length - 1; i >= 0; i--) {
            const c = caps[i]; c.t += dt; c.y += c.vy * dt;
            if (!dead && c.y + 8 >= PAD_Y && c.y - 8 <= PAD_Y + PAD_H + 4 && Math.abs(c.x - pad.x) <= pad.w / 2 + 16) {
              caps.splice(i, 1); catchCap(c); continue;
            }
            if (c.y > H + 24) caps.splice(i, 1);
          }
          if (dead) return;

          // Balls
          const v = spd * slowF;
          let anyStuck = false;
          for (const b of balls) {
            b.sq = Math.max(0, b.sq - dt * 6); b.pop = Math.min(1, b.pop + dt * 4);
            if (b.stuck) { b.x = pad.x; b.y = PAD_Y - b.r - 1; anyStuck = true; continue; }
            b.idle += dt;
            b.roll = (b.roll + (v * dt / b.r) * (b.dx >= 0 ? 1 : -1)) % TAU;
            const n = Math.max(1, Math.ceil((v * dt) / 4));
            for (let i = 0; i < n && !b.gone && !cleared; i++) stepBall(b, dt / n, v);
            if (cleared) break;
            if (winter) {
              b.puffT -= dt;
              if (b.puffT <= 0 && !b.gone) {
                b.puffT = 0.028;
                if (puffs.length < 160) puffs.push({ x: b.x + rand(-1.5, 1.5), y: b.y + rand(-1.5, 1.5), life: 0.32, max: 0.32 });
              }
            } else {
              b.trail.unshift({ x: b.x, y: b.y });
              if (b.trail.length > 8) b.trail.pop();
            }
          }
          if (cleared) { clearSheet(); return; }

          let lastX = pad.x;
          for (let i = balls.length - 1; i >= 0; i--) {
            const b = balls[i];
            if (!b.gone) continue;
            lastX = clamp(b.x, WALL + 12, W - WALL - 12);
            balls.splice(i, 1);
            if (balls.length > 0) {
              api.sfx('chip');
              api.burst(lastX, H - 6, { n: 10, speed: 170, colors: fx.spray2, shape: 'square', size: 2, life: 0.5, grav: 500, dir: -Math.PI / 2, spread: 1.4 });
              addRipple(lastX, H - 10, 0.8, 0.9, 0);
            }
          }
          if (balls.length === 0) { loseLife(lastX); return; }

          if (anyStuck) { serveT += dt; if (serveT >= AUTO_LAUNCH) launchAll(); }
          else serveT = 0;
        },

        draw(g, t) {
          if (sheetStart === null) sheetStart = t;
          const st = t - sheetStart;
          background(g, W, H, th);
          th.life(g, 0, t, W);
          if (winter) { if (dead && crack) drawLakeCrack(g); }
          else drawRipples(g);

          // Bricks
          for (const k of bricks) if (k.hp > 0) drawBrick(g, k, st);
          for (const s of glints) {
            const r = 3.6 * Math.sin(Math.PI * clamp(s.age / s.life, 0, 1));
            if (r > 0.3) NB.draw.star4(g, s.x, s.y, r, s.age * 2, fx.glint);
          }

          // Capsules with short motion streaks
          for (const c of caps) {
            const K = th.powers[c.type];
            g.strokeStyle = K.lit; g.globalAlpha = 0.35; g.lineWidth = 1.5; g.lineCap = 'round';
            g.beginPath(); g.moveTo(c.x - 7, c.y - 14); g.lineTo(c.x - 7, c.y - 24); g.moveTo(c.x + 7, c.y - 14); g.lineTo(c.x + 7, c.y - 21); g.stroke();
            g.globalAlpha = 1;
            drawCap(g, c.x, c.y + Math.sin(c.t * 6 + c.ph) * 1.2, c.type, Math.sin(c.t * 5 + c.ph) * 0.2, 1, th);
          }

          // Paddle
          const q = squash(pad.kick);
          let lean = pad.lean, sink = 0;
          if (dead) {
            const e = easeOut(clamp(deadT / 0.3, 0, 1));
            lean += e * 0.1 * (deathX < pad.x ? -1 : 1); sink = e * 5;
          }
          th.paddle(g, pad.x, PAD_Y + q * 3 + sink, pad.w * (1 + q * 0.12), PAD_H * (1 - q * 0.28), lean, t);

          // Trails and balls
          if (winter) {
            g.fillStyle = P.ice;
            for (const p of puffs) drawPuff(g, p.x, p.y, clamp(p.life / p.max, 0, 1));
            g.globalAlpha = 1;
          } else {
            for (const b of balls) if (!b.stuck && b.trail.length > 1) lightTrail(g, b.trail, b.trail.length, b.r);
          }
          let hint = false;
          for (const b of balls) {
            const r = b.r * easeBack(clamp(b.pop, 0, 1));
            if (b.stuck) {
              hint = true;
              const y = b.y - Math.abs(Math.sin(t * 4.2)) * 4;
              th.ball(g, b.x, y, r, 0, 1, 0);
              if (serveT > 0.8) {
                g.strokeStyle = 'rgba(244,238,219,0.6)'; g.lineWidth = 1.6; g.lineCap = 'round';
                g.beginPath(); g.arc(b.x, y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(serveT / AUTO_LAUNCH, 0, 1)); g.stroke();
              }
            } else {
              th.ball(g, b.x, b.y, r, b.roll, 1.08 - b.sq * 0.3, Math.atan2(b.dy, b.dx));
            }
          }

          // HUD: lives, active powers, sheet number (sized for the condensed poster face)
          for (let i = 0; i < 3; i++) {
            const x = 30 + i * 20, y = 36;
            if (i < lives) th.ball(g, x, y, 6, i * 1.3, 1, 0, true);
            else { g.strokeStyle = fx.ghost; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 5.5, 0, TAU); g.stroke(); }
          }
          let hx = 112;
          for (const [type, left, total] of [['wide', wideT, WIDE_TIME], ['slow', slowT, SLOW_TIME]]) {
            if (left <= 0) continue;
            const f = clamp(left / total, 0, 1), blink = f < 0.25 ? 0.55 + 0.45 * Math.sin(t * 14) : 1;
            g.globalAlpha = blink;
            drawCap(g, hx, 34, type, 0, 0.72, th);
            g.fillStyle = 'rgba(6,16,36,0.55)'; g.fillRect(hx - 13, 45, 26, 3);
            g.fillStyle = th.powers[type].base; g.fillRect(hx - 13, 45, 26 * f, 3);
            g.globalAlpha = 1;
            hx += 40;
          }
          NB.draw.text(g, 'SHEET ' + (level + 1), W - 28, 43, { size: 20, color: fx.text, align: 'right', outline: 4, spacing: 1.5 });
          if (hint && !dead) {
            NB.draw.text(g, 'SPACE OR TAP TO LAUNCH', W / 2, PAD_Y - 52, { size: 19, color: fx.text, outline: 4, alpha: 0.6 + 0.3 * Math.sin(t * 4), spacing: 2 });
          }

          NB.draw.vignette(g, W, H, 0.5);
        }
      };
    }
  });
})();
