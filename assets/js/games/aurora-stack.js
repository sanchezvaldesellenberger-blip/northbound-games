/* Aurora Stack: build a tower over a snowy harbor town, one floor at a time */
(function () {
  'use strict';
  const { TAU, clamp, rand, hash, rgba } = NB.util;
  const P = NB.pal;

  /* ---------- Geometry ---------- */
  const FH = 26, BH = 42;               // floor height, storefront height
  const DX = 12, DY = 7;                // oblique depth of roofs and side walls
  const BASE = 240, SWING = 300, HOVER = 10, FALL = 0.07;
  const GROUND = 438, HORIZON = 292, TB = 404, NEAR_B = 318;
  // Window rhythms per floor: four-pane, wide three-pane, tall with flower boxes.
  const WSTY = [{ sp: 20, ww: 9, wh: 11, wy: 7, kind: 0 }, { sp: 27, ww: 16, wh: 10, wy: 7.5, kind: 1 }, { sp: 17, ww: 7, wh: 11.5, wy: 6.5, kind: 2 }];
  const PF = 0.18, PN = 0.32, PT = 0.6; // parallax: range and sea, islands, town
  const TILE = 800, RES = 2;
  const WARN = 6, AUTO = 8;             // turns before the crane strains, then lets go

  /* ---------- Colour ---------- */
  const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => {
    const A = hexRGB(a), B = hexRGB(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
  };
  const rgbAt = (A, B, k) => `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
  const tone = (c) => ({
    wall: c, roof: mix(c, P.cream, 0.42), side: mix(c, P.deep, 0.46), lit: mix(c, P.cream, 0.16),
    ledge: mix(c, P.cream, 0.6), under: mix(c, P.deep, 0.3), frame: mix(c, P.deep, 0.58), sideLedge: mix(c, P.deep, 0.22)
  });

  // brick, sand, teal, cream, slate, forest
  const BUILD = ['#a9564c', '#c9a774', '#3e7c79', '#e0d4b5', '#58708f', '#4f6b4f'];
  const FL = BUILD.map(tone);
  const STORE = tone('#2c4f56');
  const LIT_A = '#ffd27e', LIT_B = '#ffb866', GLASS = '#22354d', REFLECT = 'rgba(169,201,255,0.32)';
  const SIL = '#3a2a2c', CURTAIN = [P.cream, '#c9625a'], GOODS = ['#a35d3c', '#efe6cf', '#58708f'];
  const SNOWROOF = '#e4edf6', CABLE = 'rgba(223,233,245,0.5)';
  const PUFF = [P.snow, P.ice, '#c9d8ea'], SPARK = [P.gold, '#ffe6a3', P.cream, P.amber];

  const SKY0 = ['#0f243c', '#1d3756', '#42617f'].map(hexRGB);
  const SKY1 = ['#050d1c', '#091a30', '#10274a'].map(hexRGB);
  const SEA = '#1b3149', SHORE = '#7d93ae';
  const FARC = { lit: '#2c4664', shade: '#1f3551', mid: '#263f5c', snow: '#b4c4d8', snowShade: '#7086a3' };
  const NEARC = { lit: '#21395a', shade: '#152841', mid: '#1b3049', snow: '#8a9fba', snowShade: '#5a7090' };
  const CLOUD = ['#2b425e', '#3b5676', '#51698b'];
  const TOWN_SNOW = '#c3d1e2', TOWN_SNOW_SH = '#8ea2bb', TOWN_LIT = '#f0c06a', TOWN_DARK = '#1e3046';
  const BANK_TOP = '#d9e4f0', BANK_FACE = '#a9bbd1', STREET = '#bfcde0', TRACK = '#aabbd0', POLE = '#1b2f45';

  /* Warm late-summer evening (the default eleven months of the year): poster palette, no snow anywhere. */
  const HAZE_S = '#3d3552';
  const FARS = { lit: '#9a7b88', shade: '#7e6478', mid: '#8b6e80', snow: null };
  const NEARS = { lit: '#3b3d5b', shade: '#2a2e48', mid: '#33364f', snow: null };
  const ROOFS = [['#b5583f', HAZE_S], ['#5a6480', HAZE_S], ['#2f857b', HAZE_S]].map(([c, h]) => {
    const b = mix(c, h, 0.22);
    return { shade: mix(b, P.night, 0.18), lit: mix(b, P.paper, 0.28), edge: mix(b, P.night, 0.32) };
  });
  const IRON = '#2b2431', WOOD = '#8a5a3c', WOOD_LIT = '#a56c47', TERRA = '#b5583f';
  const DUST = ['#cdbca6', '#a8957f', '#e4d8c4'];
  const PUDDLES = [[170, 32, 20, 3.2], [548, 46, 28, 4], [664, 24, 14, 2.6]]; // x, depth below the quay line, rx, ry
  // Distant ridge [x, peakY, left run, right run]: low and soft, no caps.
  const RIDGE = [[90, 266, 170, 190], [330, 273, 160, 150], [560, 261, 190, 170], [762, 271, 150, 160]].sort((a, b) => a[1] - b[1]);

  // Distant range [x, peakY, left run, right run]; the tallest drawn first so lower peaks sit in front.
  const FAR_PEAKS = [[70, 214, 120, 110], [205, 178, 110, 130], [335, 228, 90, 80], [470, 160, 125, 140], [612, 210, 100, 92], [738, 186, 112, 120]].sort((a, b) => a[1] - b[1]);
  const NEAR_PEAKS = [[60, 286, 46, 50], [128, 274, 54, 72], [598, 288, 44, 54], [690, 270, 70, 88]].sort((a, b) => a[1] - b[1]);
  const LH = { x: 690, y: 249 };

  /* ---------- Small helpers ---------- */
  const mod = (a, n) => ((a % n) + n) % n;
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const easeOutBack = (x) => { const c = 1.70158; x -= 1; return 1 + (c + 1) * x * x * x + c * x * x; };
  function quad(g, ax, ay, bx, by, cx, cy, dx, dy) {
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.lineTo(dx, dy); g.closePath(); g.fill();
  }
  function poly(g, p) {
    g.beginPath(); g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    g.closePath(); g.fill();
  }
  function disc(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function oval(g, x, y, rx, ry, a0 = 0, a1 = TAU) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, a0, a1); g.fill(); }
  const styleOf = (id) => WSTY[Math.floor(hash(id * 0.731 + 5.1) * WSTY.length) % WSTY.length];
  function winOffset(w, id) {
    const s = styleOf(id), n = Math.floor((w - 16 + s.sp - s.ww) / s.sp);
    return n > 0 ? (w - (n * s.sp - (s.sp - s.ww))) / 2 : (w - s.ww) / 2;
  }

  /* ---------- Harbor town houses (one 800-wide tile, generated once) ---------- */
  const HOUSES = [];
  (function () {
    let x = 6, i = 0;
    while (x < TILE - 14 && i < 80) {
      i++;
      if (hash(i * 7.31 + 1.1) < 0.24) {
        const w = 12 + hash(i * 2.21) * 8;
        if (x + w > TILE - 4) break;
        HOUSES.push({ pine: true, x: x + w / 2, w, h: 22 + hash(i * 3.37) * 18 });
        x += w + 1;
        continue;
      }
      const w = 30 + Math.floor(hash(i * 4.73) * 24), hh = 22 + Math.floor(hash(i * 5.91) * 20), rh = 9 + hash(i * 6.13) * 8;
      if (x + w + 8 > TILE - 4) break;
      const base = BUILD[Math.floor(hash(i * 8.33) * BUILD.length)];
      const wall = mix(base, '#22395a', 0.45), wallS = mix(base, HAZE_S, 0.36);
      const cols = w > 44 ? 3 : 2, rows = hh > 32 ? 2 : 1, wins = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) wins.push({ x: x + ((c + 1) * w) / (cols + 1) - 2, y: TB - hh + 6 + r * 11, lit: hash(i * 9.7 + r * 3 + c) > 0.32 });
      }
      HOUSES.push({
        x, w, hh, rh, wall, side: mix(wall, P.deep, 0.42), wins, chim: hash(i * 2.9) < 0.5, door: cols === 2 && rows === 1,
        wallS, sideS: mix(wallS, P.night, 0.4), roofK: Math.floor(hash(i * 3.71 + 0.4) * 3) % 3
      });
      x += w + 8 + hash(i * 9.71) * 10;
    }
  })();
  // Strings of festoon lights and bunting between a couple of gables (warm evening only).
  const GARLANDS = [];
  (function () {
    const hs = HOUSES.filter((h) => !h.pine);
    const pick = (lo, hi, kind) => {
      for (let i = 0; i + 1 < hs.length; i++) {
        const a = hs[i], b = hs[i + 1];
        if (a.x >= lo && b.x + b.w <= hi && b.x - (a.x + a.w) < 22) { GARLANDS.push({ a, b, kind }); return; }
      }
    };
    pick(20, 270, 'lights'); pick(540, 790, 'flags');
  })();

  /* ---------- Static scenery, painted once into cached tiles ---------- */
  function peak(g, x, y, l, r, B, C) {
    const hgt = B - y, kx = x + r * 0.12, ky = y + hgt * 0.45, fx = x - l * 0.06;
    g.fillStyle = C.lit; poly(g, [x - l, B, x, y, kx, ky, fx, B]);
    g.fillStyle = C.shade; poly(g, [x, y, x + r, B, fx, B, kx, ky]);
    g.fillStyle = C.mid; poly(g, [x - l * 0.66, B, x - l * 0.4, y + hgt * 0.56, x - l * 0.14, B]);
    if (!C.snow) return;
    const d = hgt * 0.28, rx = x + (kx - x) * 0.55, ry = y + (ky - y) * 0.55;
    g.fillStyle = C.snow;
    poly(g, [x, y, rx, ry, x - l * 0.05, y + d * 0.86, x - l * 0.14, y + d * 1.12, x - l * 0.2, y + d * 0.82, x - l * 0.28, y + d]);
    g.fillStyle = C.snowShade;
    poly(g, [x, y, x + r * 0.28, y + d, x + r * 0.2, y + d * 0.84, x + r * 0.12, y + d * 1.08, rx, ry]);
  }

  function paintFar(g) {
    for (const p of FAR_PEAKS) for (let o = -TILE; o <= TILE; o += TILE) peak(g, p[0] + o, p[1], p[2], p[3], HORIZON + 1, FARC);
    g.fillStyle = SEA; g.fillRect(-2, HORIZON, TILE + 4, 434 - HORIZON);
    g.fillStyle = 'rgba(169,201,255,0.16)'; g.fillRect(-2, HORIZON, TILE + 4, 1.2);
    for (let i = 0; i < 34; i++) {
      const y = HORIZON + 5 + hash(i * 3.17) * 120, x = hash(i * 7.71) * (TILE - 80), w = 14 + hash(i * 1.33) * 60;
      g.fillStyle = `rgba(169,201,255,${(0.04 + 0.06 * hash(i * 9.1)).toFixed(3)})`;
      g.fillRect(x, y, w, 1);
    }
  }

  function paintNear(g) {
    for (const p of NEAR_PEAKS) peak(g, p[0], p[1], p[2], p[3], NEAR_B, NEARC);
    g.fillStyle = 'rgba(6,16,36,0.35)';
    g.fillRect(14, NEAR_B, 186, 2.5); g.fillRect(554, NEAR_B, 224, 2.5);
    lighthouseBody(g);
  }

  // Lighthouse on the far point (both seasons).
  function lighthouseBody(g) {
    const x = LH.x;
    g.fillStyle = '#e3dccb'; poly(g, [x - 4.5, 275, x - 3, 252, x + 3, 252, x + 4.5, 275]);
    g.fillStyle = '#aca593'; poly(g, [x + 0.5, 275, x + 0.5, 252, x + 3, 252, x + 4.5, 275]);
    g.fillStyle = '#b8564d'; poly(g, [x - 4, 268, x - 3.6, 262, x + 3.6, 262, x + 4, 268]);
    g.fillStyle = '#0f2034'; g.fillRect(x - 3.5, 246, 7, 6);
    g.fillStyle = '#b8564d'; poly(g, [x - 4.6, 246.5, x, 241, x + 4.6, 246.5]);
  }

  function house(g, h) {
    const { x, w, hh, rh } = h, top = TB - hh, cx = x + w / 2, d = 6, e = 3.5;
    g.fillStyle = h.side; quad(g, x + w, top, x + w + d, top - e, x + w + d, TB - e, x + w, TB);
    g.fillStyle = TOWN_SNOW_SH; quad(g, cx, top - rh, cx + d, top - rh - e, x + w + 1.5 + d, top + 1 - e, x + w + 1.5, top + 1);
    if (h.chim) {
      const chx = cx + w * 0.2, chy = top - rh * 0.6;
      g.fillStyle = h.side; g.fillRect(chx, chy - 8, 4, 8);
      g.fillStyle = TOWN_SNOW; g.fillRect(chx - 0.6, chy - 9.4, 5.2, 1.8);
    }
    g.fillStyle = h.wall; g.fillRect(x, top, w, hh); poly(g, [x, top + 0.5, cx, top - rh, x + w, top + 0.5]);
    g.lineWidth = 2.4; g.lineCap = 'round';
    g.strokeStyle = TOWN_SNOW; g.beginPath(); g.moveTo(x - 1.5, top + 1); g.lineTo(cx, top - rh - 0.5); g.stroke();
    g.strokeStyle = TOWN_SNOW_SH; g.beginPath(); g.moveTo(cx, top - rh - 0.5); g.lineTo(x + w + 1.5, top + 1); g.stroke();
    for (const wn of h.wins) { g.fillStyle = wn.lit ? TOWN_LIT : TOWN_DARK; g.fillRect(wn.x, wn.y, 4, 5); }
    if (h.door) { g.fillStyle = h.side; g.fillRect(cx - 3, TB - 9, 6, 9); }
  }

  function pine(g, p) {
    const { x, h, w } = p, b = TB;
    g.fillStyle = '#132a3c';
    poly(g, [x, b - h, x + w * 0.32, b - h * 0.52, x + w * 0.2, b - h * 0.52, x + w * 0.5, b - 3, x - w * 0.5, b - 3, x - w * 0.2, b - h * 0.52, x - w * 0.32, b - h * 0.52]);
    g.fillStyle = '#1e3c52';
    poly(g, [x, b - h, x, b - 3, x - w * 0.5, b - 3, x - w * 0.2, b - h * 0.52, x - w * 0.32, b - h * 0.52]);
    g.fillStyle = TOWN_SNOW; poly(g, [x, b - h, x + w * 0.12, b - h * 0.8, x - w * 0.15, b - h * 0.78]);
    g.fillStyle = '#132a3c'; g.fillRect(x - 1, b - 4, 2, 4);
  }

  function paintTown(g) {
    g.fillStyle = SHORE; g.fillRect(-2, TB - 2, TILE + 4, 442 - TB);
    for (const h of HOUSES) if (h.pine) pine(g, h); else house(g, h);
    g.fillStyle = '#9fb3cb'; g.fillRect(-2, TB - 1.5, TILE + 4, 2);
  }

  function lamp(g, x) {
    const G = GROUND;
    g.fillStyle = 'rgba(255,233,180,0.26)'; oval(g, x, G + 9, 56, 11);
    g.fillStyle = 'rgba(255,233,180,0.2)'; oval(g, x, G + 8, 30, 6);
    g.fillStyle = 'rgba(255,233,180,0.05)'; poly(g, [x - 4, G - 74, x + 4, G - 74, x + 42, G + 7, x - 42, G + 7]);
    g.fillStyle = POLE; g.fillRect(x - 1.5, G - 72, 3, 70); g.fillRect(x - 4, G - 8, 8, 8);
    g.fillRect(x - 5.5, G - 84, 11, 13);
    g.fillStyle = LIT_A; g.fillRect(x - 4, G - 82.5, 8, 10);
    g.fillStyle = POLE; g.fillRect(x - 0.5, G - 82.5, 1, 10); poly(g, [x - 7.5, G - 84, x, G - 90, x + 7.5, G - 84]);
    g.fillStyle = BANK_TOP; poly(g, [x - 6.5, G - 85, x, G - 90.5, x + 1.5, G - 89]);
  }

  function mailbox(g, x) {
    const G = GROUND;
    g.fillStyle = POLE; g.fillRect(x - 1.5, G - 16, 3, 16);
    g.fillStyle = '#9e463f'; g.fillRect(x - 6, G - 31, 12, 16);
    g.fillStyle = '#c0574e'; g.fillRect(x - 6, G - 31, 8, 16);
    g.fillStyle = '#3a1f1f'; g.fillRect(x - 4, G - 25, 7, 1.5);
    g.fillStyle = BANK_TOP; oval(g, x, G - 31, 7.5, 3.2, Math.PI, TAU); g.fillRect(x - 7.5, G - 31.5, 15, 1.5);
  }

  function snowman(g, x) {
    const G = GROUND;
    g.fillStyle = '#a9bbd1'; disc(g, x, G - 8, 9.5); disc(g, x, G - 22, 6.5);
    g.fillStyle = '#e8eff7'; disc(g, x - 1.6, G - 9.4, 7.8); disc(g, x - 1.2, G - 23.2, 5.2);
    g.fillStyle = '#b8564d'; g.fillRect(x - 6, G - 17.5, 12, 2.6); g.fillRect(x + 2, G - 17, 2.6, 6);
    g.fillStyle = P.navy; disc(g, x - 2.6, G - 24, 0.9); disc(g, x + 1.4, G - 24.2, 0.9);
    g.fillRect(x - 5, G - 28.5, 10, 1.8); g.fillRect(x - 3.4, G - 34, 6.8, 5.6);
    g.fillStyle = P.amber; poly(g, [x - 0.6, G - 22.6, x + 5, G - 21.6, x - 0.6, G - 20.8]);
    g.strokeStyle = '#4a3326'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x - 6, G - 14); g.lineTo(x - 13, G - 19); g.moveTo(x + 6, G - 14); g.lineTo(x + 12, G - 20); g.stroke();
  }

  function paintGround(g) {
    const G = GROUND;
    g.fillStyle = BANK_FACE; g.fillRect(-2, G - 10, TILE + 4, 8);
    g.fillStyle = BANK_TOP;
    g.beginPath(); g.moveTo(-2, G - 6); g.lineTo(-2, G - 13 - hash(0) * 4);
    for (let i = 0; i <= 20; i++) g.lineTo(i * 40, G - 13 - hash((i % 20) * 4.3) * 4);
    g.lineTo(TILE + 2, G - 13 - hash(0) * 4); g.lineTo(TILE + 2, G - 6); g.closePath(); g.fill();
    g.fillStyle = STREET; g.fillRect(-2, G - 4, TILE + 4, 514 - G);
    g.fillStyle = TRACK; g.fillRect(-2, G - 4, TILE + 4, 1.5); g.fillRect(-2, G + 27, TILE + 4, 3); g.fillRect(-2, G + 39, TILE + 4, 3);
    for (let i = 0; i < 18; i++) oval(g, 236 + i * 19, G + 14 + Math.sin(i * 0.7) * 3 + (i & 1) * 4, 2.2, 1.2);
    g.fillStyle = '#d3dfec';
    g.beginPath(); g.moveTo(-2, 512);
    for (let i = 0; i <= 16; i++) g.lineTo(i * 50, 490 + hash((i % 16) * 2.7) * 6);
    g.lineTo(TILE + 2, 490 + hash(0) * 6); g.lineTo(TILE + 2, 512); g.closePath(); g.fill();
    lamp(g, 92); lamp(g, 708);
    mailbox(g, 206); snowman(g, 598);
  }

  /* ---------- Warm evening scenery ---------- */
  function paintFarS(g) {
    for (const p of RIDGE) for (let o = -TILE; o <= TILE; o += TILE) peak(g, p[0] + o, p[1], p[2], p[3], HORIZON + 1, FARS);
    g.fillStyle = SUM.sea; g.fillRect(-2, HORIZON, TILE + 4, 434 - HORIZON);
    g.fillStyle = 'rgba(255,206,160,0.32)'; g.fillRect(-2, HORIZON, TILE + 4, 1.4);
    for (let i = 0; i < 40; i++) {
      const k = hash(i * 3.17), y = HORIZON + 4 + k * k * 120, x = hash(i * 7.71) * (TILE - 80), w = 14 + hash(i * 1.33) * 64;
      g.fillStyle = `rgba(255,190,140,${((0.05 + 0.1 * hash(i * 9.1)) * (1 - k * 0.7)).toFixed(3)})`;
      g.fillRect(x, y, w, 1);
    }
  }

  function paintNearS(g) {
    for (const p of NEAR_PEAKS) peak(g, p[0], p[1], p[2], p[3], NEAR_B, NEARS);
    g.fillStyle = 'rgba(19,25,43,0.35)';
    g.fillRect(14, NEAR_B, 186, 2.5); g.fillRect(554, NEAR_B, 224, 2.5);
    lighthouseBody(g);
  }

  function houseS(g, h) {
    const { x, w, hh, rh } = h, top = TB - hh, cx = x + w / 2, d = 6, e = 3.5, R = ROOFS[h.roofK];
    g.fillStyle = h.sideS; quad(g, x + w, top, x + w + d, top - e, x + w + d, TB - e, x + w, TB);
    g.fillStyle = R.shade; quad(g, cx, top - rh, cx + d, top - rh - e, x + w + 1.5 + d, top + 1 - e, x + w + 1.5, top + 1);
    if (h.chim) {
      const chx = cx + w * 0.2, chy = top - rh * 0.6;
      g.fillStyle = h.sideS; g.fillRect(chx, chy - 8, 4, 8);
      g.fillStyle = R.edge; g.fillRect(chx - 0.6, chy - 9.4, 5.2, 1.8);
    }
    g.fillStyle = h.wallS; g.fillRect(x, top, w, hh); poly(g, [x, top + 0.5, cx, top - rh, x + w, top + 0.5]);
    g.lineWidth = 2.4; g.lineCap = 'round';
    g.strokeStyle = R.lit; g.beginPath(); g.moveTo(x - 1.5, top + 1); g.lineTo(cx, top - rh - 0.5); g.stroke();
    g.strokeStyle = R.edge; g.beginPath(); g.moveTo(cx, top - rh - 0.5); g.lineTo(x + w + 1.5, top + 1); g.stroke();
    for (const wn of h.wins) {
      g.fillStyle = wn.lit ? TOWN_LIT : '#2b2a42'; g.fillRect(wn.x, wn.y, 4, 5);
      if (wn.lit && (wn.x * 7) % 3 < 1) { g.fillStyle = P.coral; g.fillRect(wn.x - 0.5, wn.y + 5.4, 5, 1.4); }
    }
    if (h.door) { g.fillStyle = h.sideS; g.fillRect(cx - 3, TB - 9, 6, 9); }
  }

  function treeS(g, p) {
    const { x, h, w } = p, b = TB, r = w * 0.55, cy = b - h * 0.62;
    g.fillStyle = '#3a2d2c'; g.fillRect(x - 1, cy, 2, b - cy);
    g.fillStyle = '#2c4642'; disc(g, x, cy, r); disc(g, x + r * 0.35, cy - r * 0.7, r * 0.7);
    g.fillStyle = '#3d5f56'; disc(g, x - r * 0.3, cy - r * 0.3, r * 0.62);
  }

  function garland(g, G) {
    const { a, b } = G, ax = a.x + a.w / 2, ay = TB - a.hh - a.rh + 2, bx = b.x + b.w / 2, by = TB - b.hh - b.rh + 2;
    const mx = (ax + bx) / 2, my = Math.max(ay, by) + 12;
    const at = (t) => [(1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx, (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by];
    g.strokeStyle = '#2a2433'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(ax, ay);
    for (let i = 1; i <= 12; i++) { const [x, y] = at(i / 12); g.lineTo(x, y); }
    g.stroke();
    const n = Math.max(4, Math.round((bx - ax) / 6)), cols = [P.coral, P.mustard, P.teal, P.paper];
    for (let i = 1; i < n; i++) {
      const [x, y] = at(i / n);
      if (G.kind === 'lights') { g.fillStyle = i % 3 ? '#ffe2a0' : P.mustard; disc(g, x, y + 1, 1.3); }
      else { const [x2, y2] = at((i + 0.7) / n); g.fillStyle = cols[i % 4]; poly(g, [x, y, x2, y2, (x + x2) / 2, (y + y2) / 2 + 5]); }
    }
  }

  function paintTownS(g) {
    g.fillStyle = SUM.shore; g.fillRect(-2, TB - 2, TILE + 4, 442 - TB);
    for (const h of HOUSES) if (h.pine) treeS(g, h); else houseS(g, h);
    g.fillStyle = '#6f5d58'; g.fillRect(-2, TB - 1.5, TILE + 4, 2);
    for (const G of GARLANDS) garland(g, G);
  }

  function lampS(g, x) {
    const G = GROUND;
    g.fillStyle = 'rgba(255,196,120,0.18)'; oval(g, x, G + 9, 58, 12);
    g.fillStyle = 'rgba(255,214,150,0.16)'; oval(g, x, G + 8, 30, 6);
    g.fillStyle = 'rgba(255,214,150,0.05)'; poly(g, [x - 4, G - 74, x + 4, G - 74, x + 42, G + 7, x - 42, G + 7]);
    g.fillStyle = IRON; g.fillRect(x - 1.5, G - 72, 3, 70); g.fillRect(x - 4, G - 8, 8, 8);
    g.fillRect(x - 5.5, G - 84, 11, 13);
    g.fillStyle = LIT_A; g.fillRect(x - 4, G - 82.5, 8, 10);
    g.fillStyle = IRON; g.fillRect(x - 0.5, G - 82.5, 1, 10); poly(g, [x - 7.5, G - 84, x, G - 90, x + 7.5, G - 84]);
    g.fillStyle = '#4a3f4b'; poly(g, [x - 6.5, G - 84.5, x, G - 89.5, x, G - 84.5]);
  }

  function puddle(g, x, y, rx, ry) {
    g.fillStyle = '#5a5170'; oval(g, x, y, rx, ry);
    g.fillStyle = '#6e6285'; oval(g, x - rx * 0.2, y - ry * 0.25, rx * 0.6, ry * 0.45);
    g.fillStyle = 'rgba(245,184,61,0.5)'; g.fillRect(x - rx * 0.55, y - 0.6, rx * 0.5, 1.1);
  }

  function bench(g, x) {
    const G = GROUND;
    g.fillStyle = IRON; g.fillRect(x - 22, G - 13, 2.5, 13); g.fillRect(x + 19.5, G - 13, 2.5, 13);
    g.fillRect(x - 21, G - 27, 2, 14); g.fillRect(x + 19, G - 27, 2, 14);
    g.fillStyle = WOOD; g.fillRect(x - 25, G - 14, 50, 3); g.fillRect(x - 24, G - 26, 48, 3); g.fillRect(x - 24, G - 21.5, 48, 3);
    g.fillStyle = WOOD_LIT; g.fillRect(x - 25, G - 15.5, 50, 1.8); g.fillRect(x - 24, G - 26, 48, 1); g.fillRect(x - 24, G - 21.5, 48, 1);
  }

  function bike(g, x) {
    const G = GROUND, r = 6.5, y = G - r - 0.5, xa = x - 10, xb = x + 10, sx = x - 3, sy = G - 17, hx = x + 7, hy = G - 18;
    g.strokeStyle = IRON; g.lineWidth = 1.3;
    g.beginPath(); g.arc(xa, y, r, 0, TAU); g.moveTo(xb + r, y); g.arc(xb, y, r, 0, TAU); g.stroke();
    g.strokeStyle = '#c9593f'; g.lineWidth = 1.6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(xa, y); g.lineTo(sx, sy); g.lineTo(x, y); g.lineTo(xa, y);
    g.moveTo(sx, sy); g.lineTo(hx - 1, hy + 2); g.lineTo(x, y); g.moveTo(hx - 1, hy + 2); g.lineTo(xb, y);
    g.stroke();
    g.fillStyle = IRON; g.fillRect(sx - 3, sy - 2, 6, 1.8); g.fillRect(hx - 2, hy - 1, 5, 1.4);
    g.fillStyle = WOOD_LIT; g.fillRect(hx + 1.5, hy + 1, 6.5, 4);
    g.fillStyle = P.coral; disc(g, hx + 3, hy, 1.4); g.fillStyle = P.mustard; disc(g, hx + 6, hy + 0.4, 1.3);
  }

  function mailboxS(g, x) {
    const G = GROUND;
    g.fillStyle = IRON; g.fillRect(x - 1.5, G - 16, 3, 16);
    g.fillStyle = '#9e463f'; g.fillRect(x - 6, G - 31, 12, 16); oval(g, x, G - 31, 6, 2.8, Math.PI, TAU);
    g.fillStyle = '#c0574e'; g.fillRect(x - 6, G - 31, 8, 16);
    g.fillStyle = '#3a1f1f'; g.fillRect(x - 4, G - 25, 7, 1.5);
  }

  function bollard(g, x) {
    g.fillStyle = IRON; g.fillRect(x - 4, 483, 8, 10); oval(g, x, 483, 5, 2.4);
    g.fillStyle = '#4a3f4b'; g.fillRect(x - 4, 483, 2.5, 10);
  }

  function paintGroundS(g) {
    const G = GROUND;
    g.fillStyle = '#4f4247'; g.fillRect(-2, G - 13, TILE + 4, 11);
    g.fillStyle = '#7d6a64'; g.fillRect(-2, G - 14, TILE + 4, 3);
    g.fillStyle = '#5f5052'; for (let x = 18; x < TILE; x += 40) g.fillRect(x, G - 14, 1.2, 3);
    g.fillStyle = '#41363e'; g.fillRect(-2, G - 3, TILE + 4, 517 - G);
    // Cobbles: rows widen toward the viewer; each row divides the tile evenly so tiles join cleanly.
    for (let y = G - 2, r = 0; y < 512; r++) {
      const rh = 5 + r * 0.7, n = Math.round(TILE / (11 + r * 1.2)), cw = TILE / n, off = (r & 1) * cw * 0.5;
      for (let i = -1; i < n; i++) {
        const x = i * cw + off, k = hash(mod(i, n) * 1.7 + r * 13.1);
        g.fillStyle = k < 0.33 ? '#54474d' : k < 0.66 ? '#5a4c51' : '#4d4249';
        g.fillRect(x + 0.8, y + 0.8, cw - 1.6, rh - 1.6);
        g.fillStyle = 'rgba(242,234,215,0.07)'; g.fillRect(x + 0.8, y + 0.8, cw - 1.6, 1);
      }
      y += rh;
    }
    g.fillStyle = 'rgba(19,25,43,0.3)'; g.fillRect(-2, G - 3, TILE + 4, 2.5);
    lampS(g, 92); lampS(g, 708);
    for (const [x, dy, rx, ry] of PUDDLES) puddle(g, x, G + dy, rx, ry);
    g.fillStyle = '#3b3139'; g.fillRect(-2, 492, TILE + 4, 22);
    g.fillStyle = '#6a5a58'; g.fillRect(-2, 491, TILE + 4, 2);
    bollard(g, 36); bollard(g, 764);
    mailboxS(g, 206); bike(g, 140); bench(g, 600);
  }

  /* Live props of the warm evening. */
  function cat(g, x, y, t) {
    const sw = Math.sin(t * 1.8) * 2.5;
    g.save();
    g.strokeStyle = '#a35f33'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + 4, y - 1.5); g.quadraticCurveTo(x + 10, y - 2, x + 9 + sw, y - 9); g.stroke();
    g.fillStyle = '#c77b45'; oval(g, x, y - 4.2, 5.2, 4.4); disc(g, x - 3.2, y - 10, 3.3);
    poly(g, [x - 6.2, y - 11, x - 5.6, y - 15, x - 3.6, y - 12.6]); poly(g, [x - 2.8, y - 12.8, x - 1.1, y - 15.2, x - 0.2, y - 11.2]);
    g.fillStyle = '#e39a62'; oval(g, x - 1.6, y - 5.4, 2.8, 2.6); disc(g, x - 4.2, y - 11, 1.5);
    if (mod(t, 4.2) > 0.16) { g.fillStyle = IRON; g.fillRect(x - 5.2, y - 10.6, 1, 1.1); g.fillRect(x - 2.8, y - 10.6, 1, 1.1); }
    g.restore();
  }

  function gulls(g, Wd, H, cam, t) {
    g.strokeStyle = P.paper; g.lineWidth = 1.4;
    for (let i = 0; i < 2; i++) {
      const y = 196 + i * 34 + cam * 0.3 + Math.sin(t * 0.6 + i * 2) * 6;
      if (y > H + 10) continue;
      const x = mod(t * (16 + i * 7) + i * 430, Wd + 80) - 40, f = Math.sin(t * 5 + i * 2) * 2.6;
      g.beginPath(); g.moveTo(x - 7, y - f * 0.5); g.quadraticCurveTo(x - 3.5, y - 3.5 - f, x, y); g.quadraticCurveTo(x + 3.5, y - 3.5 - f, x + 7, y - f * 0.5); g.stroke();
    }
  }

  // Paper lanterns drifting up past the tower (behind it); stateless so the thumb can share it.
  function lanterns(g, Wd, H, cam, t) {
    const n = Math.max(4, Math.round(Wd / 130));
    for (let i = 0; i < n; i++) {
      const z = 0.5 + 0.5 * hash(i * 4.13 + 0.7), s = 0.7 + 0.6 * z;
      const y = mod(hash(i * 2.37) * 640 - t * (7 + 9 * z) + cam * z * 0.6, 640) - 70;
      if (y > H + 20 || y < -20) continue;
      const x = mod(hash(i * 1.91) * Wd + Math.sin(t * 0.35 + i * 2.1) * 16 + t * 3, Wd + 40) - 20;
      g.save(); g.translate(x, y); g.rotate(Math.sin(t * 1.1 + i) * 0.08);
      g.fillStyle = i % 3 ? P.coral : P.mustard; oval(g, 0, 0, 3.8 * s, 5 * s);
      g.fillStyle = 'rgba(242,234,215,0.5)'; oval(g, -0.7 * s, 0, 1.7 * s, 3.6 * s);
      g.fillStyle = '#5a2e2a'; g.fillRect(-2.4 * s, -5.6 * s, 4.8 * s, 1.2 * s); g.fillRect(-2.2 * s, 4.6 * s, 4.4 * s, 1 * s);
      g.fillStyle = '#ffe9a0'; disc(g, 0, 6.6 * s, 0.9 * s);
      g.restore();
    }
  }

  // Fireflies along the quay; they slide out of view as the camera climbs.
  function fireflies(g, Wd, H, cam, t) {
    const base = GROUND + cam;
    if (base - 150 > H) return;
    const n = Math.round(Wd / 30);
    for (let i = 0; i < n; i++) {
      const b = Math.pow(Math.max(0, Math.sin(t * 1.6 + i * 2.7)), 2);
      if (b < 0.03) continue;
      const y = base - 16 - hash(i * 3.3) * 120 + Math.sin(t * 0.8 + i * 1.7) * 10;
      if (y > H + 6 || y < -6) continue;
      const x = mod(hash(i * 1.37) * Wd + Math.sin(t * 0.5 + i) * 26 + t * (i % 2 ? 4 : -4), Wd);
      g.fillStyle = rgba('#fff0b0', 0.22 * b); disc(g, x, y, 2.8);
      g.fillStyle = rgba('#ffe27a', b); disc(g, x, y, 1.4);
    }
  }

  function crescent(g, x, y, bite) {
    if (y > 560) return;
    g.fillStyle = 'rgba(242,234,215,0.05)'; disc(g, x, y, 40);
    g.fillStyle = 'rgba(242,234,215,0.06)'; disc(g, x, y, 26);
    g.fillStyle = P.paper; disc(g, x, y, 16);
    g.fillStyle = bite; disc(g, x + 7, y - 5, 14);
  }
  // Sky colour at height u (0 top, 1 horizon), with the two halo discs over it, for the crescent's shadow.
  function skyUnderMoon(S, lift, u) {
    const a = u < 0.6 ? 0 : 1, k = u < 0.6 ? u / 0.6 : (u - 0.6) / 0.4, p = hexRGB(P.paper);
    const c = [0, 1, 2].map((j) => {
      const c0 = S.sky0[a][j] + (S.sky1[a][j] - S.sky0[a][j]) * lift, c1 = S.sky0[a + 1][j] + (S.sky1[a + 1][j] - S.sky0[a + 1][j]) * lift;
      let v = c0 + (c1 - c0) * k;
      v += (p[j] - v) * 0.05; v += (p[j] - v) * 0.06;
      return Math.round(v);
    });
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /* ---------- Seasons ---------- */
  const WIN = {
    key: 'winter', winter: true, sky0: SKY0, sky1: SKY1, starBase: 0.25, sea: SEA, shore: SHORE, cloud: CLOUD,
    paint: { far: paintFar, near: paintNear, town: paintTown, ground: paintGround }
  };
  const SUM = {
    key: 'default', winter: false,
    sky0: [P.poster, '#4d4566', '#e39a62'].map(hexRGB), sky1: [P.night, '#1a2140', '#262a4c'].map(hexRGB),
    starBase: 0.12, sea: '#36425f', shore: '#55474b', cloud: ['#3d3958', '#544d6d', '#86738f'],
    paint: { far: paintFarS, near: paintNearS, town: paintTownS, ground: paintGroundS }
  };
  // NB.winter is read when a game or thumb starts, never at file load.
  const season = () => (NB.winter ? WIN : SUM);
  let TH = WIN;

  const ART = {};
  function makeLayer(y0, h, paint) {
    const L = { y0, h, paint, c: null };
    try {
      if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const c = document.createElement('canvas');
        c.width = TILE * RES; c.height = Math.ceil(h * RES);
        const cg = c.getContext('2d');
        if (cg) { cg.setTransform(RES, 0, 0, RES, 0, -y0 * RES); paint(cg); L.c = c; }
      }
    } catch (e) { L.c = null; }
    return L;
  }
  // Cached tiles, one set per season.
  function art() {
    const k = TH.key, p = TH.paint;
    if (!ART[k]) {
      ART[k] = {
        far: makeLayer(150, 284, p.far),
        near: makeLayer(236, 86, p.near),
        town: makeLayer(326, 116, p.town),
        ground: makeLayer(350, 164, p.ground)
      };
    }
    return ART[k];
  }
  // Tiles are centred on the view so the composition holds at any width.
  function tileStart(Wd) { const x0 = Wd / 2 - TILE / 2; return x0 - Math.ceil(x0 / TILE) * TILE; }
  function blit(g, L, Wd, H, off, fill) {
    for (let x = tileStart(Wd); x < Wd; x += TILE) {
      if (L.c) g.drawImage(L.c, x, L.y0 + off, TILE + 0.6, L.h);
      else { g.save(); g.translate(x, off); L.paint(g); g.restore(); }
    }
    const b = L.y0 + off + L.h - 1;
    if (fill && b < H) { g.fillStyle = fill; g.fillRect(-20, b, Wd + 40, H - b + 20); }
  }

  /* ---------- Live sky ---------- */
  function stars(g, Wd, cam, t, a, hz) {
    const n = Math.min(170, Math.round(Wd / 9));
    g.fillStyle = P.ice;
    for (let i = 0; i < n; i++) {
      const y = mod(hash(i * 2.913 + 3.3) * 540 + cam * 0.05, 540) - 20;
      if (y > hz - 12) continue;
      const x = hash(i * 1.377 + 0.5) * Wd, r = 0.7 + hash(i * 7.31) * 1.2;
      const tw = 0.65 + 0.35 * Math.sin(t * (0.7 + hash(i * 3.1) * 2.2) + i);
      g.globalAlpha = a * (0.3 + 0.7 * hash(i * 5.17)) * tw;
      if (i % 23 === 0) NB.draw.star4(g, x, y, 2.6 + r, 0, P.ice);
      else g.fillRect(x - r / 2, y - r / 2, r, r);
    }
    g.globalAlpha = 1;
  }

  function moon(g, x, y) {
    if (y > 560) return;
    g.fillStyle = 'rgba(244,238,219,0.04)'; disc(g, x, y, 48);
    g.fillStyle = 'rgba(244,238,219,0.05)'; disc(g, x, y, 32);
    g.fillStyle = '#d8ceb0'; disc(g, x, y, 20);
    g.fillStyle = P.cream; disc(g, x - 2.5, y - 2.5, 17);
    g.fillStyle = 'rgba(205,194,160,0.75)'; disc(g, x - 6, y + 3, 3.2); disc(g, x + 4, y - 6, 2.2); disc(g, x + 3, y + 8, 1.6);
  }

  function northStar(g, x, y, t, a) {
    g.save();
    g.globalAlpha = a;
    NB.draw.glow(g, x, y, 34, P.cream, 0.2);
    const s = 1 + 0.07 * Math.sin(t * 1.7);
    NB.draw.star4(g, x, y, 11 * s, 0, P.cream);
    g.restore();
  }

  /* A faint curtain: a folded hem that fades upward, with a few brighter pleats. */
  const AUR = [{ c: P.mint, o: 0, h: 130, al: 0.19, dy: 0 }, { c: P.frost, o: 2.4, h: 90, al: 0.11, dy: -30 }];
  const hem = (i, t, o) => 12 * Math.sin(i * 0.55 + t * 0.18 + o) + 5 * Math.sin(i * 1.7 - t * 0.23 + o * 1.3);
  function aurora(g, Wd, yb, t, a) {
    const step = 34, n = Math.ceil(Wd / step) + 3;
    for (const b of AUR) {
      const base = yb + b.dy;
      const gr = g.createLinearGradient(0, base - b.h * 0.75, 0, base + 18);
      gr.addColorStop(0, rgba(b.c, 0)); gr.addColorStop(0.72, rgba(b.c, b.al * a * 0.6)); gr.addColorStop(1, rgba(b.c, b.al * a));
      g.fillStyle = gr;
      const a0 = g.globalAlpha;
      // Each fold is its own panel; alternating strength reads as pleats in the curtain.
      for (let i = 0; i < n - 1; i++) {
        const x0 = -step + i * step, x1 = x0 + step, top = base - b.h * (0.8 + 0.25 * hash(i * 1.9 + b.o));
        g.globalAlpha = a0 * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(i * 1.37 + b.o + t * 0.35)));
        quad(g, x0, base + hem(i, t, b.o), x0, top, x1 + 0.6, top, x1 + 0.6, base + hem(i + 1, t, b.o));
      }
      g.globalAlpha = a0;
    }
  }

  function cloud(g, x, y, w) {
    const pf = [0.2, 0.42, 0.66, 0.84], pr = [0.15, 0.24, 0.19, 0.12];
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass ? -1.5 : 0, oy = pass ? -3.5 : 0, k = pass ? 0.95 : 1;
      g.fillStyle = TH.cloud[pass];
      for (let i = 0; i < 4; i++) { const r = pr[i] * w * k; disc(g, x + pf[i] * w + ox, y - r + oy, r); }
      g.fillRect(x + pf[0] * w + ox, y - pr[3] * w * 1.2 + oy, (pf[3] - pf[0]) * w, pr[3] * w * 1.2);
    }
    g.fillStyle = TH.cloud[2];
    for (let i = 1; i < 3; i++) { const r = pr[i] * w * 0.95; disc(g, x + pf[i] * w - 1.5 - r * 0.25, y - r - 3.5 - r * 0.3, r * 0.55); }
  }

  function clouds(g, Wd, H, cam, t) {
    const k0 = Math.max(0, Math.floor((0.55 * cam - 480) / 170)), k1 = Math.ceil((115 + 0.8 * cam) / 170);
    for (let k = k0; k <= k1; k++) {
      const p = 0.55 + hash(k * 5.13) * 0.25;
      const y = 105 - k * 170 - hash(k * 2.71) * 40 + cam * p;
      if (y < -10 || y > H + 20) continue;
      const w = 80 + hash(k * 3.9) * 120, span = Wd + w + 160;
      const sp = (5 + hash(k * 8.1) * 9) * (k % 2 ? 1 : -1);
      cloud(g, mod(hash(k * 6.3) * span + t * sp, span) - w - 80, y, w);
    }
  }

  function lighthouse(g, x, y, t) {
    const k = Math.cos(t * 0.9), L = 150 * k;
    g.fillStyle = rgba('#ffe2a0', 0.07 * Math.abs(k)); poly(g, [x, y - 1, x + L, y - 9, x + L, y + 7]);
    g.fillStyle = rgba('#ffe2a0', 0.55 + 0.45 * Math.abs(k)); disc(g, x, y, 2.6);
  }

  function boat(g, x, y, t) {
    y += Math.sin(t * 1.4) * 0.8;
    g.fillStyle = 'rgba(255,201,60,0.2)'; g.fillRect(x + 3, y + 6, 7, 1.2); g.fillRect(x + 4.5, y + 9, 4, 1);
    g.fillStyle = '#0d1d30'; poly(g, [x - 13, y, x + 13, y, x + 10, y + 4.5, x - 10, y + 4.5]);
    g.fillStyle = '#c9bfa6'; g.fillRect(x - 6, y - 5, 9, 5);
    g.fillStyle = LIT_A; g.fillRect(x - 4.5, y - 3.8, 2.4, 2.2); g.fillRect(x - 0.8, y - 3.8, 2.4, 2.2);
    g.fillStyle = '#0d1d30'; g.fillRect(x + 6, y - 14, 1, 14);
    g.fillStyle = LIT_A; disc(g, x + 6.5, y - 14, 1.3);
  }

  function moonPath(g, mx, hz) {
    for (let i = 0; i < 7; i++) {
      const w = 22 - i * 2.6;
      g.fillStyle = rgba(P.cream, 0.16 - i * 0.018);
      g.fillRect(mx - w / 2 + Math.sin(i * 1.7) * 3, hz + 4 + i * 6, w, 1.4);
    }
  }

  /* Everything behind the tower. cam is how far the view has climbed (0 = street level). */
  function scene(g, Wd, H, cam, t, thumb) {
    const S = TH, A = art(), lift = clamp(cam / 1000, 0, 1);
    const offF = cam * PF, offN = cam * PN, offT = cam * PT, hz = HORIZON + offF;
    const sk = g.createLinearGradient(0, 0, 0, Math.max(80, hz));
    sk.addColorStop(0, rgbAt(S.sky0[0], S.sky1[0], lift));
    sk.addColorStop(0.6, rgbAt(S.sky0[1], S.sky1[1], lift));
    sk.addColorStop(1, rgbAt(S.sky0[2], S.sky1[2], lift));
    g.fillStyle = sk; g.fillRect(-20, -20, Wd + 40, H + 40);

    stars(g, Wd, cam, t, S.starBase + (1 - S.starBase) * smooth(lift * 1.2), hz);
    const au = thumb ? 0 : smooth((cam - 520) / 600);
    const mx = thumb ? Math.max(70, Wd * 0.14) : 112, my = 100 + cam * 0.04;
    if (S.winter) {
      if (au > 0.01) aurora(g, Wd, Math.min(175, -40 + cam * 0.2), t, au);
      moon(g, mx, my);
    } else {
      crescent(g, mx, my, skyUnderMoon(S, lift, clamp(my / Math.max(80, hz), 0, 1)));
      if (au > 0.01) aurora(g, Wd, Math.min(175, -40 + cam * 0.2), t, au);
    }
    const ns = thumb ? 1 : smooth((cam - 260) / 480);
    if (ns > 0.01) northStar(g, thumb ? Wd * 0.8 : Wd * 0.74, thumb ? 96 : Math.min(76, -70 + cam * 0.18), t, ns);

    if (A.far.y0 + offF < H) {
      blit(g, A.far, Wd, H, offF, S.sea);
      if (hz < H) { moonPath(g, mx, hz); boat(g, mod(t * 7 + 300, Wd + 140) - 70, 334 + offF, t); }
    }
    if (A.near.y0 + offN < H) {
      blit(g, A.near, Wd, H, offN, null);
      for (let x = tileStart(Wd); x < Wd; x += TILE) lighthouse(g, x + LH.x, LH.y + offN, t);
    }
    if (!S.winter) gulls(g, Wd, H, cam, t);
    clouds(g, Wd, H, cam, t);
    if (A.town.y0 + offT < H) blit(g, A.town, Wd, H, offT, S.shore);
    if (A.ground.y0 + cam < H) {
      blit(g, A.ground, Wd, H, cam, null);
      if (!S.winter) {
        for (let x = tileStart(Wd); x < Wd; x += TILE) {
          for (const [px, dy, rx] of PUDDLES) {
            g.fillStyle = rgba(P.paper, 0.25 + 0.25 * Math.sin(t * 1.3 + px));
            g.fillRect(x + px + rx * 0.12, GROUND + dy + cam + 0.6, rx * 0.28, 0.9);
          }
          cat(g, x + 610, GROUND - 15.5 + cam, t);
        }
      }
    }
  }

  /* ---------- Building floors ---------- */
  function body(g, x, y, w, h, C, snow) {
    g.fillStyle = C.roof;
    quad(g, x, y, x + DX, y - DY, x + w + DX, y - DY, x + w, y);
    if (snow > 0.01 && w > 4) {
      const a0 = g.globalAlpha;
      g.globalAlpha = a0 * snow;
      g.fillStyle = SNOWROOF;
      quad(g, x + 2.5, y - 1.4, x + DX + 1, y - DY, x + w + DX - 1, y - DY, x + w - 1, y - 1.4);
      g.globalAlpha = a0;
    }
    g.fillStyle = C.side;
    quad(g, x + w, y, x + w + DX, y - DY, x + w + DX, y + h - DY, x + w, y + h);
    g.fillStyle = C.sideLedge;
    quad(g, x + w, y, x + w + DX, y - DY, x + w + DX, y - DY + 2.5, x + w, y + 2.5);
    g.fillStyle = C.wall; g.fillRect(x, y, w, h);
    g.fillStyle = C.lit; g.fillRect(x, y, Math.min(2.5, w), h);
    g.fillStyle = C.ledge; g.fillRect(x - 1, y, w + 2, 2.5);
    g.fillStyle = C.under; g.fillRect(x, y + 2.5, w, 1.5); g.fillRect(x, y + h - 1.5, w, 1.5);
  }

  function windows(g, x, y, w, C, ox, id, t) {
    const S = styleOf(id), SP = S.sp, WW = S.ww, WH = S.wh;
    const k0 = Math.ceil((x + 3 - ox) / SP), k1 = Math.floor((x + w - 3 - WW - ox) / SP);
    if (!(k1 >= k0) || k1 - k0 > 40) return;
    const wy = y + S.wy, cw = Math.min(3.4, WW * 0.38);
    for (let k = k0; k <= k1; k++) {
      const wx = ox + k * SP, h = hash(id * 12.9898 + k * 4.1414);
      let type = h < 0.17 ? 0 : h < 0.25 ? 2 : h < 0.34 ? 3 : 1; // dark, lit, someone home, curtains
      if (hash(id * 3.7 + k * 9.1 + Math.floor(t * 0.16 + h * 7)) < 0.05) type = type === 0 ? 1 : 0;
      g.fillStyle = C.frame; g.fillRect(wx - 1, wy - 1, WW + 2, WH + 2);
      if (type === 0) {
        g.fillStyle = GLASS; g.fillRect(wx, wy, WW, WH);
        g.fillStyle = REFLECT; g.fillRect(wx + 1, wy + 1, 1.6, WH - 3);
      } else {
        g.fillStyle = (h * 97) % 1 < 0.7 ? LIT_A : LIT_B; g.fillRect(wx, wy, WW, WH);
        if (type === 2) {
          const px = wx + 3 + (WW - 6) * (0.5 + 0.5 * Math.sin(t * 0.6 + h * 40));
          g.fillStyle = SIL;
          disc(g, px, wy + 4, 1.7);
          quad(g, px - 2.8, wy + WH, px - 2, wy + 6.4, px + 2, wy + 6.4, px + 2.8, wy + WH);
        } else if (type === 3) {
          g.fillStyle = CURTAIN[(id + k) & 1];
          quad(g, wx, wy, wx + cw, wy, wx + cw * 0.4, wy + WH, wx, wy + WH);
          quad(g, wx + WW, wy, wx + WW - cw, wy, wx + WW - cw * 0.4, wy + WH, wx + WW, wy + WH);
          g.fillRect(wx, wy, WW, 1.5);
        } else {
          g.fillStyle = C.frame;
          if (S.kind === 1) { g.fillRect(wx + WW / 3 - 0.5, wy, 1, WH); g.fillRect(wx + (WW * 2) / 3 - 0.5, wy, 1, WH); g.fillRect(wx, wy + 3, WW, 1); }
          else if (S.kind === 2) g.fillRect(wx, wy + WH * 0.42, WW, 1);
          else { g.fillRect(wx + WW / 2 - 0.5, wy, 1, WH); g.fillRect(wx, wy + 4.5, WW, 1); }
        }
      }
      g.fillStyle = C.ledge; g.fillRect(wx - 1.5, wy + WH + 1, WW + 3, 1.5);
      if (S.kind === 2) {
        g.fillStyle = '#6b4436'; g.fillRect(wx - 1, wy + WH + 2.5, WW + 2, 2.2);
        g.fillStyle = h > 0.6 ? '#d9675f' : '#7fbf8f'; g.fillRect(wx, wy + WH + 1.4, 1.6, 1.4); g.fillRect(wx + WW - 2.2, wy + WH + 1.4, 1.6, 1.4);
      }
    }
  }

  function drawFloor(g, x, y, w, ci, ox, id, t, snow) {
    const C = FL[ci % FL.length];
    body(g, x, y, w, FH, C, TH.winter ? snow : 0);
    windows(g, x, y, w, C, ox, id, t);
  }

  /* The ground floor: a corner shop with a striped awning, a door and lit display windows. */
  function drawStore(g, x, y) {
    const w = BASE, C = STORE, cx = x + w / 2;
    body(g, x, y, w, BH, C, TH.winter ? 1 : 0);
    g.fillStyle = C.frame; g.fillRect(cx - 30, y + 3.5, 60, 6.5);
    g.fillStyle = P.cream; g.fillRect(cx - 28.5, y + 4.5, 57, 4.5);
    g.fillStyle = C.wall; poly(g, [cx - 7, y + 9, cx - 2.5, y + 5.2, cx, y + 7, cx + 2.5, y + 5.6, cx + 7, y + 9]);
    NB.draw.star4(g, cx + 11, y + 6.6, 2.2, 0, P.amber);
    const ay = y + 11.5, ah = 6.5, sw = 12;
    for (let i = 0, sx = x; sx < x + w - 0.1; i++, sx += sw) {
      const ww = Math.min(sw, x + w - sx);
      g.fillStyle = i & 1 ? '#efe6cf' : '#bf564e';
      g.fillRect(sx, ay, ww, ah);
      poly(g, [sx, ay + ah, sx + ww, ay + ah, sx + ww / 2, ay + ah + 3]);
    }
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x, ay, w, 1.5);
    const dy0 = y + 22.5, dh = BH - 28;
    for (let s = 0; s < 2; s++) {
      const dx0 = s ? cx + 16 : x + 12, dw = w / 2 - 28;
      g.fillStyle = C.frame; g.fillRect(dx0 - 1.5, dy0 - 1.5, dw + 3, dh + 3);
      g.fillStyle = LIT_A; g.fillRect(dx0, dy0, dw, dh);
      g.fillStyle = C.frame; g.fillRect(dx0, dy0 + dh * 0.55, dw, 1.2);
      for (let i = 0; i < 9; i++) {
        const gx = dx0 + 4 + (i * (dw - 10)) / 9, hh = 2 + hash(i * 3.3 + s) * 3.5;
        g.fillStyle = GOODS[(i + s * 2) % 3];
        g.fillRect(gx, dy0 + dh * 0.55 - hh, 3.4, hh);
        g.fillRect(gx + 2.5, dy0 + dh - hh * 0.8, 3.4, hh * 0.8);
      }
      g.fillStyle = C.frame;
      for (let m = 1; m < 4; m++) g.fillRect(dx0 + (dw * m) / 4 - 0.6, dy0, 1.2, dh);
      g.fillStyle = TH.winter ? SNOWROOF : '#cdb89b'; g.fillRect(dx0 - 3, dy0 + dh + 1.5, dw + 6, 2);
    }
    g.fillStyle = C.frame; g.fillRect(cx - 10, dy0 - 1.5, 20, y + BH - dy0 + 1.5);
    g.fillStyle = '#7b4b3b'; g.fillRect(cx - 8.5, dy0, 17, y + BH - dy0);
    g.fillStyle = '#93604c'; g.fillRect(cx - 8.5, dy0, 2, y + BH - dy0);
    g.fillStyle = LIT_A; g.fillRect(cx - 5.5, dy0 + 2.5, 11, 6);
    g.fillStyle = '#7b4b3b'; g.fillRect(cx - 0.5, dy0 + 2.5, 1, 6);
    g.fillStyle = P.gold; disc(g, cx + 5, dy0 + 12, 1.1);
    if (TH.winter) {
      g.fillStyle = '#b4c5da'; oval(g, x + 6, y + BH, 18, 7, Math.PI, TAU); oval(g, x + w - 6, y + BH, 22, 8, Math.PI, TAU);
      g.fillStyle = '#dde7f2'; oval(g, x + 4, y + BH - 0.5, 14, 5.5, Math.PI, TAU); oval(g, x + w - 9, y + BH - 0.5, 16, 6.5, Math.PI, TAU);
    } else { planter(g, x + 3, y + BH); planter(g, x + w - 3, y + BH); }
  }

  function planter(g, x, y) {
    g.fillStyle = '#3f6b4f'; disc(g, x - 2.5, y - 8, 4); disc(g, x + 2.5, y - 8.5, 4.2);
    g.fillStyle = '#548a63'; disc(g, x - 3.2, y - 9.2, 2.4);
    g.fillStyle = P.coral; disc(g, x - 3, y - 11, 1.3); disc(g, x + 3, y - 11.5, 1.3);
    g.fillStyle = P.mustard; disc(g, x + 0.5, y - 9.5, 1.2);
    g.fillStyle = TERRA; poly(g, [x - 6, y - 6, x + 6, y - 6, x + 4.5, y, x - 4.5, y]);
    g.fillStyle = '#cf6e4f'; g.fillRect(x - 6, y - 6, 12, 1.5);
  }

  /* A floor hanging from the crane, pivoting on its hook. */
  function drawHanging(g, x, y, w, ci, ox, id, t, tilt, warn) {
    const hx = x + w / 2 + DX / 2, hy = y - DY - 24;
    g.strokeStyle = CABLE; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(hx, hy - 4); g.lineTo(hx, -20); g.stroke();
    g.save();
    g.translate(hx, hy); g.rotate(tilt); g.translate(-hx, -hy);
    drawFloor(g, x, y, w, ci, ox, id, t, 0);
    const inset = Math.min(10, w * 0.25);
    g.strokeStyle = CABLE; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + inset, y - 0.5); g.lineTo(hx, hy + 3); g.lineTo(x + w + DX - inset, y - DY + 0.5); g.stroke();
    g.fillStyle = P.pine; g.fillRect(hx - 5, hy - 5, 10, 8);
    g.fillStyle = '#2f5566'; g.fillRect(hx - 5, hy - 5, 10, 2);
    g.fillStyle = warn ? rgba(P.red, Math.sin(t * 22) > 0 ? 1 : 0.3) : rgba(P.gold, 0.35 + 0.4 * Math.max(0, Math.sin(t * 3)));
    disc(g, hx, hy - 0.5, 1.6);
    g.restore();
  }

  /* Shadow the upper floor throws onto the exposed roof to its right (light from the top left). */
  function castShadow(g, lx, lw, ux, uw, y) {
    const ur = ux + uw, s = Math.min(9, lx + lw - ur);
    if (s > 0.5) { g.fillStyle = 'rgba(8,20,38,0.24)'; quad(g, ur, y, ur + DX, y - DY, ur + DX + s, y - DY, ur + s, y); }
  }
  function hoverShadow(g, x, w, tx, tw, y) {
    const L = Math.max(x + 3, tx), R = Math.min(x + w + 3, tx + tw);
    if (R > L) { g.fillStyle = 'rgba(8,20,38,0.2)'; quad(g, L, y, L + DX, y - DY, R + DX, y - DY, R, y); }
  }

  /* Perfect drop: a gold outline that follows the slab's silhouette and expands away. */
  function outlinePulse(g, x, y, w, k) {
    const e = 1 - Math.pow(1 - k, 3), cx = x + (w + DX) / 2, cy = y + (FH - DY) / 2;
    const sx = 1 + (2 * (3 + e * 12)) / (w + DX), sy = 1 + (2 * (3 + e * 12)) / (FH + DY);
    const pts = [x, y, x + DX, y - DY, x + w + DX, y - DY, x + w + DX, y + FH - DY, x + w, y + FH, x, y + FH];
    g.strokeStyle = rgba(P.gold, 0.9 * (1 - k)); g.lineWidth = 0.5 + 2.5 * (1 - k); g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const px = cx + (pts[i] - cx) * sx, py = cy + (pts[i + 1] - cy) * sy;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath(); g.stroke();
  }

  function thumbFlakes(g, Wd, H, t) {
    const n = Math.round(Wd / 14);
    g.fillStyle = '#eef3fa';
    for (let i = 0; i < n; i++) {
      const z = hash(i * 4.77), s = 1 + z * 1.8;
      const x = mod(hash(i * 1.91) * Wd + t * 6 + Math.sin(t * 0.9 + i) * 8 * z, Wd);
      const y = mod(hash(i * 3.53) * H + t * (14 + 30 * z), H + 8) - 4;
      g.globalAlpha = 0.3 + 0.5 * z;
      g.fillRect(x, y, s, s);
    }
    g.globalAlpha = 1;
  }

  NB.register({
    id: 'aurora-stack',
    title: 'Aurora Stack',
    tags: ['One-tap', 'Arcade'],
    accent: '#5ee6b0',
    order: 2,
    blurb: 'Build a tower over a harbor town, one floor at a time. Drop each swinging floor onto the one below. Whatever hangs over gets cut off. Three perfect drops in a row win back width.',
    controls: [['Space / click / tap', 'Drop the floor']],

    thumb(g, W, H, t) {
      TH = season();
      scene(g, W, H, 0, t, true);
      if (!TH.winter) lanterns(g, W, H, 0, t);
      const cx = W / 2;
      let x = cx - BASE / 2, w = BASE, y = GROUND - BH;
      drawStore(g, x, y);
      for (let i = 1; i <= 8; i++) {
        const nw = BASE - i * 5 - Math.round(hash(i * 1.71) * 7);
        const nx = cx - nw / 2 + (hash(i * 3.13) - 0.5) * 14;
        castShadow(g, x, w, nx, nw, y);
        x = nx; w = nw; y -= FH;
        drawFloor(g, x, y, w, i - 1, x + winOffset(w, i), i, t, 0.85);
      }
      const hw = w - 2, amp = clamp((W - hw) / 2 - 16, 30, 250);
      const hx = cx - hw / 2 + Math.sin(t * 1.4) * amp;
      hoverShadow(g, hx, hw, x, w, y);
      drawHanging(g, hx, y - FH - HOVER, hw, 0, hx + winOffset(hw, 10), 10, t, -Math.cos(t * 1.4) * 0.008, false);
      if (TH.winter) thumbFlakes(g, W, H, t); else fireflies(g, W, H, 0, t);
      NB.draw.vignette(g, W, H, 0.4);
    },

    create(api) {
      const { W, H } = api;
      let stack, cur, dir, debris, cam, level, combo, dead, time, tilt, tiltV, swayA, comboA;
      const theme = season();
      TH = theme;
      const flakes = theme.winter ? Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random(), p: Math.random() * TAU })) : [];
      const speed = () => Math.min(600, 230 + level * 11);

      function spawn() {
        const top = stack[stack.length - 1];
        dir = level % 2 === 0 ? 1 : -1;
        const w = top.w;
        cur = { x: (dir > 0 ? W / 2 - SWING : W / 2 + SWING) - w / 2, w, y: top.y - FH, ci: level % FL.length, id: level + 1, oxr: winOffset(w, level + 1), age: 0, turns: 0 };
      }

      // Landing kick-up: snow in December, dust and confetti in the floor's colours otherwise.
      function puff(x0, x1, by, n, C) {
        if (theme.winter) {
          api.burst(x0, by, { n, speed: 70, life: 0.55, colors: PUFF, size: 2.4, shape: 'dot', dir: Math.PI * 1.1, spread: 1.1, drag: 3.2, grav: -15 });
          api.burst(x1, by, { n, speed: 70, life: 0.55, colors: PUFF, size: 2.4, shape: 'dot', dir: -Math.PI * 0.1, spread: 1.1, drag: 3.2, grav: -15 });
          return;
        }
        const conf = [C.wall, C.roof, P.mustard, P.coral, P.paper];
        api.burst(x0, by, { n, speed: 80, life: 0.5, colors: DUST, size: 2.2, shape: 'dot', dir: Math.PI * 1.1, spread: 1.1, drag: 3.4, grav: -8 });
        api.burst(x1, by, { n, speed: 80, life: 0.5, colors: DUST, size: 2.2, shape: 'dot', dir: -Math.PI * 0.1, spread: 1.1, drag: 3.4, grav: -8 });
        api.burst(x0, by - 2, { n: n + 1, speed: 160, life: 0.75, colors: conf, size: 1.8, shape: 'square', dir: -Math.PI * 0.72, spread: 1, grav: 420, drag: 1.4, spin: 18 });
        api.burst(x1, by - 2, { n: n + 1, speed: 160, life: 0.75, colors: conf, size: 1.8, shape: 'square', dir: -Math.PI * 0.28, spread: 1, grav: 420, drag: 1.4, spin: 18 });
      }

      function shatter(d, by, ground) {
        const C = FL[d.ci % FL.length], cx = clamp(d.x + d.w / 2, 12, W - 12), big = d.big;
        api.burst(cx, by, {
          n: big ? 36 : Math.round(Math.min(18, 6 + d.w * 0.15)), speed: big ? 360 : 230, life: big ? 1.1 : 0.85,
          colors: [C.wall, C.wall, C.roof, C.side, LIT_A], size: big ? 4.2 : 3, shape: 'square',
          grav: 900, drag: 1.1, dir: -Math.PI / 2, spread: 2.2, spin: 14
        });
        if (ground) api.burst(cx, by, { n: big ? 18 : 9, speed: 90, life: 0.7, colors: theme.winter ? PUFF : DUST, size: 2.6, shape: 'dot', dir: -Math.PI / 2, spread: 3, drag: 3, grav: -10 });
        if (big) {
          api.sfx('explode'); api.shake(14); api.flash(P.cream, 0.2);
          api.ring(cx, by, { r0: 12, r1: 170, life: 0.6, color: P.cream, width: 4 });
        } else api.sfx('brick', 0);
      }

      function die() {
        const C = FL[cur.ci % FL.length], sy = cur.y + cam - HOVER, cx = cur.x + cur.w / 2;
        dead = true;
        debris.push({ x: cur.x, y: cur.y - HOVER, w: cur.w, ci: cur.ci, id: cur.id, ox: cur.x + cur.oxr, vx: dir * 150, vy: 220, a: 0, va: dir * 2.6, big: true });
        cur = null; combo = 0;
        api.sfx('lose'); api.shake(9); api.flash(P.red, 0.16);
        api.burst(cx, sy + FH / 2, { n: 16, speed: 200, life: 0.7, colors: [C.wall, C.roof, C.side], size: 3, shape: 'shard', grav: 500 });
        api.ring(cx, sy + FH / 2, { r0: 10, r1: 120, life: 0.5, color: P.red, width: 3 });
        swayA = 7;
        api.over(1.6);
      }

      function drop() {
        if (dead || !cur) return;
        const top = stack[stack.length - 1], C = FL[cur.ci % FL.length];
        const perfect = Math.abs(cur.x - top.x) <= 4;
        if (perfect) cur.x = top.x;
        const ox = cur.x + cur.oxr, sy = cur.y + cam;
        let grow = 0;
        if (perfect) {
          combo++;
          if (combo >= 3 && cur.w < BASE) { grow = Math.min(14, BASE - cur.w); cur.w += grow; cur.x -= grow / 2; }
          const cx = cur.x + cur.w / 2;
          api.ring(cx, sy + FH / 2, { r0: 14, r1: 60 + cur.w * 0.22, life: 0.45, color: P.gold, width: 2.5 });
          api.burst(cx, sy + FH / 2, { n: Math.min(34, 16 + combo * 2), speed: 230, life: 0.6, colors: SPARK, size: 2.2, shape: 'square', blend: 'add', drag: 2.6, grav: 160 });
          puff(cur.x + 2, cur.x + cur.w - 2, sy + FH, 6, C);
          api.float(cx, sy - 16, combo > 1 ? 'PERFECT x' + combo : 'PERFECT', { color: P.gold, size: Math.min(38, 25 + combo * 2) });
          api.sfx('perfect', combo); api.flash(P.cream, 0.07); api.shake(2.2);
          if (grow) {
            api.float(cx, sy - 44, 'WIDER', { color: P.mint, size: 21 });
            api.burst(cur.x, sy + FH / 2, { n: 8, speed: 120, life: 0.5, color: P.mint, size: 2.4, shape: 'square', dir: Math.PI, spread: 1.2 });
            api.burst(cur.x + cur.w, sy + FH / 2, { n: 8, speed: 120, life: 0.5, color: P.mint, size: 2.4, shape: 'square', dir: 0, spread: 1.2 });
            api.sfx('pickup', combo);
          }
        } else {
          const L = Math.max(cur.x, top.x), R = Math.min(cur.x + cur.w, top.x + top.w);
          if (R - L <= 0) { die(); return; }
          combo = 0;
          const left = cur.x < top.x;
          debris.push({
            x: left ? cur.x : R, y: cur.y - HOVER, w: cur.w - (R - L), ci: cur.ci, id: cur.id, ox,
            vx: (left ? -1 : 1) * rand(70, 120), vy: -rand(40, 90), a: 0, va: (left ? -1 : 1) * rand(1.5, 3), big: false
          });
          cur.x = L; cur.w = R - L;
          api.burst(left ? L : R, sy + FH / 2, { n: 8, speed: 140, life: 0.6, colors: [C.wall, C.roof, C.side], size: 2.6, shape: 'shard', dir: left ? Math.PI : 0, spread: 1.4, grav: 600 });
          puff(cur.x + 2, cur.x + cur.w - 2, sy + FH, 5, C);
          api.float(cur.x + cur.w / 2, sy - 12, '+1', { color: P.cream, size: 19 });
          api.sfx('place', level); api.shake(1.6);
          swayA = Math.min(2, swayA + 1);
        }
        stack.push({ x: cur.x, w: cur.w, y: cur.y, ci: cur.ci, id: cur.id, ox, at: time, grow, perfect });
        level++;
        api.score(level);
        if (level % 10 === 0) {
          api.sfx('level');
          api.float(W / 2, 92, 'FLOOR ' + level, { color: P.gold, size: 36 });
          api.ring(cur.x + cur.w / 2, sy + FH / 2, { r0: 20, r1: 260, life: 0.8, color: P.cream, width: 2 });
        }
        spawn();
      }

      // The crane gives up after a few idle swings, so a run always ends.
      function turned() {
        cur.turns++;
        if (cur.turns >= AUTO) drop();
        else if (cur.turns >= WARN) api.sfx('tick');
      }

      return {
        reset() {
          TH = theme;
          stack = [{ x: W / 2 - BASE / 2, w: BASE, y: GROUND - BH, ci: 0, id: 0, ox: 0, at: -10, grow: 0 }];
          debris = []; level = 0; combo = 0; dead = false; cam = 0; time = 0;
          tilt = 0; tiltV = 0; swayA = 0; comboA = 0;
          spawn();
          api.score(0);
        },

        action() { TH = theme; if (!dead) drop(); },

        update(dt) {
          TH = theme;
          dt = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
          time += dt;
          if (cur && !dead) {
            cur.age += dt;
            cur.x += dir * speed() * dt;
            const c = cur.x + cur.w / 2;
            if (c > W / 2 + SWING) { cur.x = W / 2 + SWING - cur.w / 2; dir = -1; turned(); }
            else if (c < W / 2 - SWING) { cur.x = W / 2 - SWING - cur.w / 2; dir = 1; turned(); }
          }
          // The hanging floor leans against its travel and overshoots on each turn.
          const lean = cur ? -dir * 0.008 : 0;
          tiltV += ((lean - tilt) * 70 - tiltV * 4.5) * dt;
          tilt = clamp(tilt + tiltV * dt, -0.035, 0.035);
          swayA *= Math.exp(-dt * 3);
          comboA += ((combo > 0 ? 1 : 0) - comboA) * (1 - Math.exp(-dt * 8));

          const topY = cur ? cur.y : stack[stack.length - 1].y;
          const prev = cam;
          cam += (Math.max(0, H * 0.4 - topY) - cam) * (1 - Math.exp(-dt * 4));
          const dc = cam - prev;

          for (let i = debris.length - 1; i >= 0; i--) {
            const d = debris[i];
            d.vy += 1500 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt;
            const cy = d.y + FH / 2, ext = Math.abs(Math.sin(d.a)) * d.w / 2 + Math.abs(Math.cos(d.a)) * FH / 2;
            const ground = cy + ext >= GROUND, off = cy + cam > H - 4;
            if (ground || off || d.x > W + 80 || d.x + d.w < -80) {
              if (ground || off) shatter(d, ground && GROUND + cam < H - 4 ? GROUND + cam - 2 : H - 2, ground);
              debris[i] = debris[debris.length - 1]; debris.pop();
            }
          }

          for (const f of flakes) {
            f.y = mod(f.y + (14 + 30 * f.z) * dt + dc * f.z * 0.8 + 4, H + 8) - 4;
            f.x = mod(f.x + (Math.sin(time * 0.9 + f.p) * 10 * f.z + 6) * dt + 4, W + 8) - 4;
          }
        },

        draw(g) {
          TH = theme;
          const t = time;
          scene(g, W, H, cam, t, false);
          if (!theme.winter) lanterns(g, W, H, cam, t);

          const n = stack.length, top = stack[n - 1];
          const swayX = swayA * Math.sin(t * 11);
          const sx = (i) => swayX * Math.max(0, 1 - (n - 1 - i) / 10);

          if (cur) {
            const tx = top.x + sx(n - 1), ty = top.y + cam;
            if (ty > 0) {
              const pg = g.createLinearGradient(0, ty - 150, 0, ty);
              pg.addColorStop(0, rgba(P.cream, 0)); pg.addColorStop(1, rgba(P.cream, 0.16));
              g.fillStyle = pg;
              g.fillRect(tx - 0.5, ty - 150, 1, 150); g.fillRect(tx + top.w - 0.5, ty - 150, 1, 150);
            }
          }

          const i0 = Math.max(0, Math.floor((stack[0].y + cam - H - 4) / FH));
          for (let i = i0; i < n; i++) {
            const f = stack[i], y = f.y + cam;
            if (y > H + 4) continue;
            if (y < -FH - 20) break;
            const age = t - f.at, dx = sx(i);
            let x = f.x + dx, w = f.w, fy = y, sq = 0;
            if (f.grow && age < 0.3) { const e = 1 - Math.pow(1 - age / 0.3, 3); x += (f.grow / 2) * (1 - e); w -= f.grow * (1 - e); }
            if (age < FALL) { const k = age / FALL; fy = y - HOVER * (1 - k * k); }
            else if (age < 0.6) { const s = age - FALL; sq = 0.13 * Math.exp(-s * 9) * Math.cos(s * 26); }
            if (i > 0 && age >= FALL) { const b = stack[i - 1]; castShadow(g, b.x + sx(i - 1), b.w, x, w, b.y + cam); }
            if (sq) { const px = x + w / 2, py = fy + FH; g.save(); g.translate(px, py); g.scale(1 + sq * 0.6, 1 - sq); g.translate(-px, -py); }
            if (i === 0) drawStore(g, x, fy);
            else drawFloor(g, x, fy, w, f.ci, f.ox + dx, f.id, t, clamp((age - 0.15) / 1.1, 0, 0.9));
            if (sq) g.restore();
            if (f.perfect && age < 0.42) outlinePulse(g, x, fy, w, age / 0.42);
          }

          if (cur) {
            if (cur.age > 0.15 && t - top.at >= FALL) hoverShadow(g, cur.x, cur.w, top.x + sx(n - 1), top.w, top.y + cam);
            const e = easeOutBack(clamp(cur.age / 0.32, 0, 1)), warn = cur.turns >= WARN;
            const jx = warn ? (hash(t * 97.3) - 0.5) * 2.2 : 0;
            const yy = cur.y + cam - HOVER - (1 - e) * 46;
            drawHanging(g, cur.x + jx, yy, cur.w, cur.ci, cur.x + cur.oxr + jx, cur.id, t, tilt, warn);
          }

          for (const d of debris) {
            const cx = d.x + d.w / 2, cy = d.y + cam + FH / 2;
            g.save(); g.translate(cx, cy); g.rotate(d.a);
            drawFloor(g, -d.w / 2, -FH / 2, d.w, d.ci, d.ox - cx, d.id, t, 0);
            g.restore();
          }

          if (theme.winter) {
            g.fillStyle = '#eef3fa';
            for (const f of flakes) { const s = 1 + f.z * 1.8; g.globalAlpha = 0.3 + 0.5 * f.z; g.fillRect(f.x, f.y, s, s); }
            g.globalAlpha = 1;
          } else fireflies(g, W, H, cam, t);

          NB.draw.vignette(g, W, H, 0.42);

          if (comboA > 0.02) {
            g.save();
            g.globalAlpha = comboA;
            NB.draw.text(g, 'PERFECT', 22, 33, { size: 15, color: P.cream, align: 'left', spacing: 2, outline: 3 });
            // Pips sit after the measured label, so they clear any display face.
            g.font = NB.font(15);
            const lw = g.measureText('PERFECT').width, px = 22 + (Number.isFinite(lw) ? lw : 50) + 2 * 7 + 12;
            const k = Math.min(combo, 3);
            for (let i = 0; i < 3; i++) NB.draw.star4(g, px + i * 15, 27.5, i < k ? 6 : 4, 0, i < k ? P.gold : 'rgba(244,238,219,0.35)');
            g.restore();
          }
        }
      };
    }
  });
})();
