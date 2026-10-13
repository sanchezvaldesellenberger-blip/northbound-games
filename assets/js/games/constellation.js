/* Constellation: the Little Dipper plays a melody over the hills, and you play it back */
(function () {
  'use strict';
  const { TAU, clamp, rand, randi, hash, rgba } = NB.util;
  const PAL = NB.pal;
  const INK = PAL.ink, CREAM = PAL.cream, SNOW = PAL.snow, ICE = PAL.ice, FROST = PAL.frost, GOLD = PAL.gold, RED = PAL.red;

  /* Night tones mixed from navy and frost. Light comes from the upper left. */
  const C = {
    skyMid: '#0a1a31', skyLow: '#102b49', horizon: '#173859',
    farLit: '#15365a', farDark: '#0c2340', capLit: '#5f7ca5', capDark: '#2f4c72',
    snowLit: '#55749a', snowDark: '#2a4870',
    pineLit: '#14304c', pineDark: '#0a1b2e', fgLit: '#0e2440', fgDark: '#06121f'
  };

  // Ursa Minor, roughly as it sits in the sky. Polaris is the end of the handle. Sizes follow magnitude.
  const STARS = [
    { x: 168, y: 122, name: 'Polaris', s: 1.35, tint: CREAM },
    { x: 268, y: 160, name: 'Yildun', s: 0.78, tint: ICE },
    { x: 358, y: 204, name: 'ε UMi', s: 0.8, tint: ICE },
    { x: 446, y: 256, name: 'ζ UMi', s: 0.84, tint: FROST },
    { x: 474, y: 344, name: 'η UMi', s: 0.76, tint: ICE },
    { x: 606, y: 354, name: 'Pherkad', s: 1.0, tint: FROST },
    { x: 590, y: 262, name: 'Kochab', s: 1.15, tint: GOLD }
  ];
  const LINES = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
  const NOTES = [1174.66, 1046.5, 880, 783.99, 659.25, 587.33, 523.25]; // pentatonic, Polaris highest
  const CX = 387, CY = 238; // centre of the figure, used to place it in thumbnails
  const ease = (x) => 1 - Math.pow(1 - x, 3);

  /* Line segments, trimmed so they stop just short of each star like a printed star chart. */
  const SEGS = LINES.map(([a, b]) => {
    const A = STARS[a], B = STARS[b];
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
    const ga = 8 + 6 * A.s, gb = 8 + 6 * B.s;
    return { x: A.x + (dx / d) * ga, y: A.y + (dy / d) * ga, ux: dx / d, uy: dy / d, len: Math.max(0, d - ga - gb) };
  });

  /* The land never rises into a star or its label. */
  function clearY(x) {
    let c = 0;
    for (const s of STARS) if (Math.abs(x - s.x) < 64) c = Math.max(c, s.y + 52);
    return c;
  }
  function polyY(v, x) {
    for (let j = 0; j < v.length - 1; j++) {
      const a = v[j], b = v[j + 1];
      if (x <= b.x) return a.y + (b.y - a.y) * (b.x > a.x ? clamp((x - a.x) / (b.x - a.x), 0, 1) : 0);
    }
    return v[v.length - 1].y;
  }
  const mix = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });

  /* Far range: alternating peaks and saddles, with the tallest summit right under Polaris (the studio badge). */
  function farVerts(l0, l1) {
    const v = [], S = 80;
    for (let i = Math.floor(l0 / S) - 1; i <= Math.ceil(l1 / S) + 1; i++) {
      let x = i * S + (hash(i * 1.37 + 5) - 0.5) * 34, y;
      if (i === 2) { x = 170; y = 290; }
      else if (i & 1) y = 378 + hash(i * 7.7 + 1) * 24;
      else y = 322 + hash(i * 3.1 + 2) * 46;
      const c = clearY(x);
      if (y < c) y = c + hash(i * 2.2 + 9) * 10;
      v.push({ x, y });
    }
    return v;
  }
  function nearVerts(l0, l1) {
    const v = [], S = 70;
    for (let i = Math.floor(l0 / S) - 1; i <= Math.ceil(l1 / S) + 1; i++) {
      const x = i * S + (hash(i * 2.71 + 3) - 0.5) * 24;
      const y = (i & 1) ? 452 + hash(i * 5.3 + 4) * 10 : 434 + hash(i * 1.9 + 6) * 14;
      v.push({ x, y: Math.max(y, clearY(x) + 22) });
    }
    return v;
  }

  /* Flat two-tone range: shadow body, then a lit facet on the left face of every summit. */
  function facetRange(g, v, base, lit, dark, crease) {
    g.fillStyle = dark;
    g.beginPath(); g.moveTo(v[0].x, base);
    for (const p of v) g.lineTo(p.x, p.y);
    g.lineTo(v[v.length - 1].x, base); g.closePath(); g.fill();
    g.fillStyle = lit;
    g.beginPath();
    for (let j = 1; j < v.length - 1; j++) {
      const P = v[j], L = v[j - 1], R = v[j + 1];
      if (P.y > L.y || P.y > R.y) continue;
      g.moveTo(P.x, P.y); g.lineTo(L.x, L.y); g.lineTo(L.x, base); g.lineTo(P.x + (R.x - P.x) * crease, base); g.closePath();
    }
    g.fill();
  }
  function caps(g, v) {
    for (let j = 1; j < v.length - 1; j++) {
      const P = v[j], L = v[j - 1], R = v[j + 1], depth = Math.min(L.y, R.y) - P.y;
      if (P.y > L.y || P.y > R.y || depth < 34) continue;
      const f = clamp(24 / depth, 0.16, 0.4);
      const A = mix(P, L, f), B = mix(P, R, f * 0.85), Cr = { x: P.x + (R.x - P.x) * 0.24, y: 480 };
      const M = mix(P, Cr, (A.y + 6 - P.y) / (480 - P.y));
      g.fillStyle = C.capLit;
      g.beginPath(); g.moveTo(P.x, P.y); g.lineTo(A.x, A.y); g.lineTo((A.x + M.x) / 2, (A.y + M.y) / 2 + 5); g.lineTo(M.x, M.y); g.closePath(); g.fill();
      g.fillStyle = C.capDark;
      g.beginPath(); g.moveTo(P.x, P.y); g.lineTo(M.x, M.y); g.lineTo((M.x + B.x) / 2, (M.y + B.y) / 2 - 5); g.lineTo(B.x, B.y); g.closePath(); g.fill();
    }
  }
  function crest(g, v) {
    g.strokeStyle = rgba(ICE, 0.5); g.lineWidth = 1.3; g.lineCap = 'round';
    g.beginPath();
    for (let j = 0; j < v.length - 1; j++) { const a = v[j], b = v[j + 1]; if (b.y < a.y) { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); } }
    g.stroke();
  }

  /* Angular pine: three stepped tiers, lit on the left half. */
  const PINE = [[0.4, 0.36], [0.22, 0.36], [0.7, 0.68], [0.44, 0.68], [1, 1]];
  function pine(g, x, base, h, lit, dark) {
    const w = h * 0.3, top = base - h;
    g.fillStyle = dark;
    g.beginPath(); g.moveTo(x, top);
    for (const [a, b] of PINE) g.lineTo(x + a * w, top + b * h);
    for (let k = PINE.length - 1; k >= 0; k--) g.lineTo(x - PINE[k][0] * w, top + PINE[k][1] * h);
    g.closePath(); g.fill();
    g.fillStyle = lit;
    g.beginPath(); g.moveTo(x, top);
    for (const [a, b] of PINE) g.lineTo(x - a * w, top + b * h);
    g.lineTo(x + w * 0.08, base); g.closePath(); g.fill();
  }
  function forest(g, near, l0, l1) {
    for (let j = Math.floor(l0 / 15) - 2; j <= Math.ceil(l1 / 15) + 2; j++) {
      const x = j * 15 + (hash(j * 2.13 + 1) - 0.5) * 9;
      const edge = clamp((Math.abs(x - CX) - 170) / 220, 0, 1);
      const dens = 0.12 + 0.55 * edge + 0.3 * (0.5 + 0.5 * Math.sin(x * 0.019 + 1.3));
      if (hash(j * 5.91 + 2) > dens) continue;
      const ground = polyY(near, x) + 4, c = clearY(x);
      let h = (16 + hash(j * 3.37 + 7) * 34) * (0.6 + 0.65 * edge);
      if (c) h = Math.min(h, ground - c - 8);
      if (h < 11) continue;
      pine(g, x, ground, h, C.pineLit, C.pineDark);
    }
  }
  function foreground(g, l0, l1) {
    for (let j = Math.floor(l0 / 30) - 2; j <= Math.ceil(l1 / 30) + 2; j++) {
      const x = j * 30 + (hash(j * 4.4 + 8) - 0.5) * 16;
      if (Math.abs(x - CX) < 372 || hash(j * 6.2 + 3) > 0.7) continue;
      pine(g, x, 516, 64 + hash(j * 1.7 + 4) * 74, C.fgLit, C.fgDark);
    }
  }

  /* Seeded random so the cached sky is identical every time it is rebuilt. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fieldStars(g, l0, l1) {
    const R = rng(311), span = l1 - l0, cols = [SNOW, ICE, FROST];
    for (let j = 0, n = Math.round(span * 0.7); j < n; j++) {
      const x = l0 + R() * span, y = R() * 420, sz = 0.4 + Math.pow(R(), 4) * 1.2;
      g.globalAlpha = 0.15 + R() * 0.45;
      g.fillStyle = cols[(R() * cols.length) | 0];
      g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;
  }

  /* Milky Way: low-alpha haze, a dark dust lane, then thousands of tiny stars, all along one diagonal band. */
  function milkyWay(g, l0, l1) {
    const R = rng(1977);
    const a0 = Math.max(l0, -420), a1 = Math.min(l1, 1260), span = a1 - a0;
    if (span <= 0) return;
    const len = Math.hypot(1, 0.42), nx = 0.42 / len, ny = 1 / len;
    const cy = (x) => 396 - 0.42 * x + Math.sin(x * 0.0065 + 0.8) * 16;
    const bright = (x) => clamp(1.05 - (x + 300) / 1600, 0.35, 1);
    const gauss = () => (R() + R() + R() + R() - 2) * 0.87;
    const blob = (px, py, r, c0, c1) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, c0); gr.addColorStop(1, c1);
      g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
    };
    const nh = Math.round(span / 18);
    for (let j = 0; j < nh; j++) {
      const x = a0 + R() * span, o = gauss() * 34, b = bright(x), col = R() < 0.25 ? CREAM : FROST;
      blob(x + nx * o, cy(x) + ny * o, 46 + R() * 70, rgba(col, 0.05 * b), rgba(col, 0));
    }
    for (let j = 0; j < nh * 0.8; j++) {
      const x = a0 + R() * span, b = bright(x), o = 5 + R() * 12 + Math.sin(x * 0.01) * 6;
      blob(x + nx * o, cy(x) + ny * o, 10 + R() * 18, `rgba(6,16,36,${(0.28 * b).toFixed(3)})`, 'rgba(6,16,36,0)');
    }
    const cols = [SNOW, ICE, FROST, CREAM];
    for (let j = 0, n = Math.round(span * 2.4); j < n; j++) {
      const x = a0 + R() * span, b = bright(x), o = gauss() * (40 + R() * 30);
      const patch = 0.55 + 0.45 * Math.sin(x * 0.023 + 1.1) * Math.sin(x * 0.0071 + o * 0.02);
      if (R() > patch * b + 0.18) continue;
      const px = x + nx * o, py = cy(x) + ny * o, sz = 0.35 + Math.pow(R(), 3) * 1.15;
      g.globalAlpha = (0.16 + R() * 0.5) * (0.5 + 0.5 * b);
      g.fillStyle = cols[(R() * cols.length) | 0];
      g.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;
  }

  /* December land: faceted snow-capped range, snowy ridge and pines. */
  function winterLand(g, l0, l1) {
    const far = farVerts(l0, l1), near = nearVerts(l0, l1);
    facetRange(g, far, 480, C.farLit, C.farDark, 0.24);
    caps(g, far);
    const hz = g.createLinearGradient(0, 330, 0, 470);
    hz.addColorStop(0, 'rgba(23,56,89,0)'); hz.addColorStop(1, 'rgba(23,56,89,0.55)');
    g.fillStyle = hz; g.fillRect(l0, 330, l1 - l0, 140);
    facetRange(g, near, 520, C.snowLit, C.snowDark, 0.3);
    crest(g, near);
    forest(g, near, l0, l1);
    const fg = g.createLinearGradient(0, 446, 0, 500);
    fg.addColorStop(0, 'rgba(11,29,50,0)'); fg.addColorStop(1, 'rgba(11,29,50,0.6)');
    g.fillStyle = fg; g.fillRect(l0, 446, l1 - l0, 80);
    foreground(g, l0, l1);
  }

  /* ---------- Default land (eleven months of the year): a warm summer night, no snow ---------- */
  const S = {
    far: '#213a60', mid: PAL.poster, grass: '#0f2a2c', blade: '#1d4a48',
    pineLit: '#1a403f', pineDark: '#0c2326', leafLit: '#1f4a45', leafDark: '#0e2a2b', trunk: '#0a1c1e',
    fgLit: '#0f2729', fgDark: '#081a1c',
    dome: PAL.paper, domeShade: '#b9b3a2', tent: PAL.coral, tentShade: '#c9553d', stone: '#2a3142', log: PAL.night
  };
  const CAMP = 728; // campfire, local x, on the right where no star sits low

  /* Rounded hills: cosine-eased between control points, sampled to a polyline so polyY stays exact. */
  function smooth(v, step) {
    const out = [];
    for (let j = 0; j < v.length - 1; j++) {
      const a = v[j], b = v[j + 1], n = Math.max(1, Math.ceil((b.x - a.x) / step));
      for (let k = 0; k < n; k++) {
        const f = k / n;
        out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * (1 - Math.cos(Math.PI * f)) / 2 });
      }
    }
    out.push(v[v.length - 1]);
    return out;
  }
  function farHills(l0, l1) {
    const v = [], st = 46;
    for (let i = Math.floor(l0 / st) - 1; i <= Math.ceil(l1 / st) + 1; i++) {
      const x = i * st + (hash(i * 3.17 + 2) - 0.5) * 14;
      const y = 396 + hash(i * 1.71 + 8) * 14 + Math.sin(x * 0.011 + 0.6) * 7;
      v.push({ x, y: Math.max(y, clearY(x) + 2) });
    }
    return smooth(v, 6);
  }
  // The highest hill sits under Polaris and carries the observatory.
  function midHills(l0, l1) {
    const v = [], st = 105;
    for (let i = Math.floor(l0 / st) - 1; i <= Math.ceil(l1 / st) + 1; i++) {
      let x = i * st + (hash(i * 2.39 + 4) - 0.5) * 40, y;
      if (i === 2) { x = 170; y = 338; }
      else if (i & 1) y = 406 + hash(i * 6.1 + 3) * 18;
      else y = 382 + hash(i * 4.3 + 1) * 18;
      v.push({ x, y: Math.max(y, clearY(x) + 4) });
    }
    return smooth(v, 6);
  }
  function grassVerts(l0, l1) {
    const v = [], st = 70;
    for (let i = Math.floor(l0 / st) - 1; i <= Math.ceil(l1 / st) + 1; i++) {
      const x = i * st + (hash(i * 2.71 + 3) - 0.5) * 24;
      const y = (i & 1) ? 452 + hash(i * 5.3 + 4) * 8 : 438 + hash(i * 1.9 + 6) * 10;
      v.push({ x, y: Math.max(y, clearY(x) + 22) });
    }
    return smooth(v, 5);
  }
  const FIRE_Y = polyY(grassVerts(CAMP - 90, CAMP + 90), CAMP) + 2;

  function fillHills(g, v, base, color) {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(v[0].x, base);
    for (const p of v) g.lineTo(p.x, p.y);
    g.lineTo(v[v.length - 1].x, base); g.closePath(); g.fill();
  }
  // Light from the upper left catches the slopes that face it.
  function rim(g, v, color, width) {
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
    g.beginPath();
    for (let j = 0; j < v.length - 1; j++) { const a = v[j], b = v[j + 1]; if (b.y < a.y - 0.05) { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); } }
    g.stroke();
  }
  function treeLine(g, v, l0, l1) {
    g.fillStyle = S.far;
    g.beginPath();
    for (let j = Math.floor(l0 / 7) - 1; j <= Math.ceil(l1 / 7) + 1; j++) {
      if (hash(j * 4.71 + 6) > 0.72) continue;
      const x = j * 7 + (hash(j * 1.93 + 2) - 0.5) * 4, y = polyY(v, x) + 1;
      const h = Math.min(4 + hash(j * 2.57 + 9) * 8, y - clearY(x) - 2);
      if (h < 3) continue;
      g.moveTo(x, y - h); g.lineTo(x + h * 0.32, y); g.lineTo(x - h * 0.32, y); g.closePath();
    }
    g.fill();
  }
  function observatory(g, v) {
    const x = 170, y = polyY(v, x) + 1, r = 10;
    g.fillStyle = S.domeShade; g.fillRect(x - 11, y - 9, 22, 9);
    g.fillStyle = S.dome; g.fillRect(x - 11, y - 9, 11, 9);
    g.fillStyle = S.domeShade; g.beginPath(); g.arc(x, y - 9, r, Math.PI, TAU); g.closePath(); g.fill();
    g.fillStyle = S.dome; g.beginPath(); g.moveTo(x, y - 9); g.arc(x, y - 9, r, Math.PI, Math.PI * 1.5); g.closePath(); g.fill();
    g.fillStyle = PAL.night; g.fillRect(x + 2, y - 9 - r + 1, 3, r - 1);
    g.fillStyle = PAL.mustard; g.fillRect(x - 6, y - 6, 2.5, 3);
  }
  function roundTree(g, x, base, h) {
    const r = h * 0.34, cy = base - h + r;
    g.fillStyle = S.trunk; g.fillRect(x - 1.2, cy, 2.4, base - cy);
    g.fillStyle = S.leafDark; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill();
    g.fillStyle = S.leafLit; g.beginPath(); g.arc(x - r * 0.22, cy - r * 0.22, r * 0.68, 0, TAU); g.fill();
  }
  function grove(g, near, l0, l1) {
    for (let j = Math.floor(l0 / 15) - 2; j <= Math.ceil(l1 / 15) + 2; j++) {
      const x = j * 15 + (hash(j * 2.13 + 1) - 0.5) * 9;
      if (Math.abs(x - CAMP) < 34) continue; // keep the camp clearing open
      const edge = clamp((Math.abs(x - CX) - 170) / 220, 0, 1);
      const dens = 0.12 + 0.55 * edge + 0.3 * (0.5 + 0.5 * Math.sin(x * 0.019 + 1.3));
      if (hash(j * 5.91 + 2) > dens) continue;
      const ground = polyY(near, x) + 4, c = clearY(x);
      let h = (16 + hash(j * 3.37 + 7) * 34) * (0.6 + 0.65 * edge);
      if (c) h = Math.min(h, ground - c - 8);
      if (h < 11) continue;
      if (hash(j * 8.3 + 5) < 0.42) roundTree(g, x, ground, h * 0.85);
      else pine(g, x, ground, h, S.pineLit, S.pineDark);
    }
  }
  function grasses(g, near, l0, l1) {
    g.strokeStyle = rgba(PAL.teal, 0.32); g.lineWidth = 1; g.lineCap = 'round';
    g.beginPath();
    for (let j = Math.floor(l0 / 4); j <= Math.ceil(l1 / 4); j++) {
      const x = j * 4 + hash(j * 1.37) * 3, y = polyY(near, x) + 1, h = 2 + hash(j * 2.91 + 1) * 4;
      g.moveTo(x, y); g.lineTo(x + (hash(j * 3.3 + 2) - 0.4) * 3, y - h);
    }
    g.stroke();
    // A few tall clumps; the clearance rule caps their height under the low stars.
    g.strokeStyle = S.blade; g.lineWidth = 1.2;
    g.beginPath();
    for (let j = Math.floor(l0 / 64) - 1; j <= Math.ceil(l1 / 64) + 1; j++) {
      if (hash(j * 6.67 + 3) > 0.62) continue;
      const x = j * 64 + (hash(j * 2.2 + 7) - 0.5) * 40, base = polyY(near, x) + 3, c = clearY(x);
      let h = 12 + hash(j * 3.9 + 1) * 12;
      if (c) h = Math.min(h, base - c - 6);
      if (h < 6) continue;
      for (let k = 0; k < 6; k++) {
        const dx = (k - 2.5) * 1.8, bh = h * (0.55 + hash(j * 9.1 + k) * 0.45), lean = (k - 2.5) * 1.6 + (hash(j * 4.4 + k * 3.1) - 0.5) * 3;
        g.moveTo(x + dx, base); g.quadraticCurveTo(x + dx + lean * 0.2, base - bh * 0.6, x + dx + lean, base - bh);
      }
    }
    g.stroke();
  }
  function camp(g, near) {
    const tx = CAMP - 40, ty = polyY(near, tx) + 3, tw = 18, th = 25;
    g.fillStyle = S.tentShade;
    g.beginPath(); g.moveTo(tx, ty - th); g.lineTo(tx + tw, ty); g.lineTo(tx - tw, ty); g.closePath(); g.fill();
    g.fillStyle = S.tent;
    g.beginPath(); g.moveTo(tx, ty - th); g.lineTo(tx + 1, ty); g.lineTo(tx - tw, ty); g.closePath(); g.fill();
    g.fillStyle = PAL.night;
    g.beginPath(); g.moveTo(tx + 1, ty - 13); g.lineTo(tx + 6, ty); g.lineTo(tx - 4, ty); g.closePath(); g.fill();
    g.fillStyle = S.stone;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(CAMP - 10 + k * 5, FIRE_Y + 1 - (k === 0 || k === 4 ? 0 : 1), 2.4, 0, TAU); g.fill(); }
    g.strokeStyle = S.log; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(CAMP - 8, FIRE_Y); g.lineTo(CAMP + 7, FIRE_Y - 5); g.moveTo(CAMP + 8, FIRE_Y); g.lineTo(CAMP - 7, FIRE_Y - 5); g.stroke();
  }
  function summerLand(g, l0, l1) {
    const far = farHills(l0, l1), mid = midHills(l0, l1), near = grassVerts(l0, l1);
    fillHills(g, far, 480, S.far);
    treeLine(g, far, l0, l1);
    rim(g, far, rgba(PAL.paper, 0.1), 1.2);
    fillHills(g, mid, 480, S.mid);
    rim(g, mid, rgba(PAL.paper, 0.14), 1.5);
    observatory(g, mid);
    fillHills(g, near, 520, S.grass);
    rim(g, near, rgba(PAL.teal, 0.5), 1.4);
    grasses(g, near, l0, l1);
    grove(g, near, l0, l1);
    camp(g, near);
    for (let j = Math.floor(l0 / 30) - 2; j <= Math.ceil(l1 / 30) + 2; j++) {
      const x = j * 30 + (hash(j * 4.4 + 8) - 0.5) * 16;
      if (Math.abs(x - CX) < 372 || hash(j * 6.2 + 3) > 0.7) continue;
      const h = 64 + hash(j * 1.7 + 4) * 74;
      if (hash(j * 2.8 + 6) < 0.4) {
        const r = h * 0.3, cy = 516 - h + r;
        g.fillStyle = S.fgDark; g.fillRect(x - 2, cy, 4, 516 - cy); g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill();
        g.fillStyle = S.fgLit; g.beginPath(); g.arc(x - r * 0.22, cy - r * 0.22, r * 0.68, 0, TAU); g.fill();
      } else pine(g, x, 516, h, S.fgLit, S.fgDark);
    }
  }

  /* Live parts of the default land: the campfire (the scene's one soft glow) and fireflies over the grass. */
  function tongue(g, x, y, w, h, sway, color) {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(x - w, y); g.lineTo(x + sway, y - h); g.lineTo(x + w, y); g.closePath(); g.fill();
  }
  function campfire(g, x, y, t) {
    const fl = 0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1), h = 13 + fl * 4;
    NB.draw.glow(g, x, y - 6, 74 + fl * 6, PAL.mustard, 0.18 + fl * 0.06);
    tongue(g, x - 3, y - 2, 4, h * 0.7, Math.sin(t * 8.1) * 1.4 - 1, PAL.coral);
    tongue(g, x + 1, y - 2, 6, h, Math.sin(t * 9.1) * 1.6, PAL.coral);
    tongue(g, x, y - 2, 4, h * 0.72, Math.sin(t * 11.3 + 1) * 1.2, PAL.mustard);
    tongue(g, x, y - 2, 2, h * 0.4, Math.sin(t * 13.7 + 2), PAL.paper);
    g.fillStyle = PAL.coral;
    for (let k = 0; k < 4; k++) {
      const q = (t * 0.55 + k * 0.25) % 1;
      g.globalAlpha = (1 - q) * 0.85;
      g.fillRect(x + Math.sin(q * 6 + k * 1.7) * 6 - 0.6, y - 14 - q * 48, 1.3, 1.3);
    }
    g.globalAlpha = 1;
  }
  const FLIES = Array.from({ length: 16 }, (_, i) => ({
    fx: 0.03 + hash(i * 7.13 + 1) * 0.94, y: 418 + hash(i * 3.77 + 2) * 54,
    p: hash(i * 5.21 + 3) * TAU, sp: 0.55 + hash(i * 2.9 + 4) * 0.5, dr: hash(i * 1.3 + 5) * TAU
  }));
  function fireflies(g, W, t, n) {
    g.fillStyle = PAL.mustard;
    for (let i = 0; i < n; i++) {
      const f = FLIES[i], b = Math.sin(t * f.sp + f.p);
      if (b <= 0.2) continue;
      const a = Math.pow((b - 0.2) / 0.8, 2);
      g.globalAlpha = a * 0.95;
      g.beginPath(); g.arc(f.fx * W + Math.sin(t * 0.31 + f.dr) * 18, f.y + Math.sin(t * 0.47 + f.dr * 1.7) * 7, 1.2 + a * 0.5, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }

  /* The whole static backdrop: sky, Milky Way and the season's land. ox shifts it under the figure. */
  function paintScene(g, W, ox, dense, winter) {
    const sk = g.createLinearGradient(0, 0, 0, 500);
    sk.addColorStop(0, INK); sk.addColorStop(0.45, C.skyMid); sk.addColorStop(0.8, C.skyLow); sk.addColorStop(1, C.horizon);
    g.fillStyle = sk; g.fillRect(-BM, -BM, W + BM * 2, 500 + BM * 2);
    const l0 = -ox - 30, l1 = W - ox + 30;
    g.save(); g.translate(ox, 0);
    if (dense) { fieldStars(g, l0, l1); milkyWay(g, l0, l1); }
    if (winter) winterLand(g, l0, l1); else summerLand(g, l0, l1);
    g.restore();
  }

  function makeCanvas(w, h) {
    try {
      if (typeof document === 'undefined' || !document.createElement) return null;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext && c.getContext('2d');
      return x ? { c, g: x } : null;
    } catch (e) { return null; }
  }
  const cache = new Map(), BM = 12; // BM: bleed margin so a camera shake never shows the canvas edge
  function backdrop(g, W, ox, q, winter) {
    const Wc = Math.max(1, Math.ceil(W)), key = (winter ? 'winter' : 'default') + '|' + Wc + '|' + ox + '|' + q;
    let c = cache.get(key);
    if (c === undefined) {
      c = null;
      const cv = makeCanvas(Math.round((Wc + BM * 2) * q), Math.round((500 + BM * 2) * q));
      if (cv) { cv.g.setTransform(q, 0, 0, q, BM * q, BM * q); paintScene(cv.g, Wc, ox, true, winter); c = cv.c; }
      if (cache.size >= 5) cache.delete(cache.keys().next().value);
      cache.set(key, c);
    }
    if (c) g.drawImage(c, -BM, -BM, Wc + BM * 2, 500 + BM * 2);
    else paintScene(g, Wc, ox, false, winter);
  }

  /* A few live twinkles on top of the cached sky, kept above the land. */
  const TW = Array.from({ length: 80 }, (_, i) => {
    const fx = hash(i * 3.71 + 11), y = 14 + hash(i * 5.31 + 7) * 262;
    return {
      fx, y, r: 0.8 + hash(i * 2.93 + 3), sp: 0.8 + hash(i * 1.91 + 5) * 1.8, p: hash(i * 4.13 + 9) * TAU,
      busy: STARS.some((s) => Math.hypot(s.x - fx * 800, s.y - y) < 24) || (y < 100 && Math.abs(fx * 800 - 400) < 170)
    };
  });
  function twinkles(g, W, t, game) {
    g.fillStyle = SNOW;
    for (const s of TW) {
      if (game && s.busy) continue;
      g.globalAlpha = 0.16 + 0.4 * (0.5 + 0.5 * Math.sin(t * s.sp + s.p));
      g.fillRect(s.fx * W - s.r / 2, s.y - s.r / 2, s.r, s.r);
    }
    g.globalAlpha = 1;
  }
  function streak(g, x, y, ux, uy, len, a) {
    const tx = x - ux * len, ty = y - uy * len;
    const gr = g.createLinearGradient(tx, ty, x, y);
    gr.addColorStop(0, rgba(SNOW, 0)); gr.addColorStop(1, rgba(SNOW, a));
    g.strokeStyle = gr; g.lineWidth = 1.3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(x, y); g.stroke();
    g.fillStyle = rgba(SNOW, a); g.fillRect(x - 1, y - 1, 2, 2);
  }

  /* ---------- Stars and lines ---------- */
  function spikes(g, x, y, L, w) {
    g.beginPath();
    g.moveTo(x, y - L); g.lineTo(x + w, y - w); g.lineTo(x + L, y); g.lineTo(x + w, y + w);
    g.lineTo(x, y + L); g.lineTo(x - w, y + w); g.lineTo(x - L, y); g.lineTo(x - w, y - w);
    g.closePath(); g.fill();
  }

  // mode: 0 normal, 1 wrong pick (red), 2 the star that was wanted
  function drawStar(g, i, lit, t, mode) {
    const s = STARS[i], x = s.x, y = s.y, m = s.s, hero = i === 0;
    const tw = 0.9 + 0.1 * Math.sin(t * (2.1 + i * 0.37) + i * 1.7);
    NB.draw.glow(g, x, y, (hero ? 13 : 9) * m, s.tint, (hero ? 0.26 : 0.2) * tw);
    if (mode === 1) NB.draw.glow(g, x, y, 26 * m, RED, 0.36);
    if (mode === 2) NB.draw.glow(g, x, y, 20 * m, GOLD, 0.28);
    if (lit > 0.01) NB.draw.glow(g, x, y, (12 + 26 * lit) * m, mode === 1 ? RED : GOLD, 0.45 * lit);
    g.fillStyle = mode === 1 ? rgba(RED, 0.9) : rgba(SNOW, 0.55 + 0.45 * lit);
    spikes(g, x, y, (hero ? 12 : 7) * m * (1 + lit * 1.3) * tw, 0.75 + 0.6 * lit);
    if (hero) {
      // Polaris wears the badge's north star, and it opens up when the star sounds.
      g.save(); g.globalAlpha = 0.9;
      NB.draw.star4(g, x, y, (5 + 17 * ease(lit)) * m, 0, CREAM);
      g.restore();
    }
    g.fillStyle = SNOW;
    g.beginPath(); g.arc(x, y, (1.5 + 1.5 * lit) * m, 0, TAU); g.fill();
    if (mode === 1) {
      g.strokeStyle = rgba(RED, 0.9); g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, 11 * m + 2, 0, TAU); g.stroke();
    }
  }

  function flareAt(g, x, y, f) {
    if (f <= 0.01) return;
    g.save();
    g.globalAlpha = f * 0.9;
    NB.draw.star4(g, x, y, 10 + 34 * ease(1 - f * 0.6) * f, 0, CREAM);
    g.globalAlpha = f * 0.45;
    NB.draw.star4(g, x, y, 6 + 16 * f, Math.PI / 4, GOLD);
    g.restore();
  }

  function segPath(g, s, p) { g.moveTo(s.x, s.y); g.lineTo(s.x + s.ux * s.len * p, s.y + s.uy * s.len * p); }

  // full: lines already earned; ak/ap: the line drawing in and its progress; sh: shimmer position along the figure
  function drawLines(g, full, ak, ap, done, alpha, sh) {
    g.save();
    g.lineCap = 'round';
    g.setLineDash([2, 6]);
    g.strokeStyle = rgba(FROST, 0.2); g.lineWidth = 1;
    g.beginPath();
    for (let k = full; k < SEGS.length; k++) segPath(g, SEGS[k], 1);
    g.stroke();
    if (alpha < 1 && full > 0) {
      // While earned lines fade out, the faint chart guides fade back in underneath.
      g.strokeStyle = rgba(FROST, 0.2 * (1 - alpha));
      g.beginPath();
      for (let k = 0; k < full; k++) segPath(g, SEGS[k], 1);
      g.stroke();
    }
    g.setLineDash([]);
    if (full > 0) {
      g.strokeStyle = done ? rgba(GOLD, 0.78 * alpha) : rgba(CREAM, 0.72 * alpha);
      g.lineWidth = 1.4;
      g.beginPath();
      for (let k = 0; k < full; k++) segPath(g, SEGS[k], 1);
      g.stroke();
    }
    if (ak >= 0 && ap > 0) {
      const s = SEGS[ak], p = ease(clamp(ap, 0, 1));
      g.strokeStyle = rgba(GOLD, 0.95 * alpha); g.lineWidth = 1.6;
      g.beginPath(); segPath(g, s, p); g.stroke();
      if (ap < 1) {
        const hx = s.x + s.ux * s.len * p, hy = s.y + s.uy * s.len * p;
        NB.draw.glow(g, hx, hy, 9, GOLD, 0.5 * alpha);
        g.globalAlpha = alpha;
        NB.draw.star4(g, hx, hy, 4.5, 0, SNOW);
        g.globalAlpha = 1;
      }
    }
    if (sh >= 0) {
      const k = Math.min(SEGS.length - 1, Math.floor(sh)), s = SEGS[k], d = (sh - k) * s.len;
      const a = Math.max(0, d - 20), b = Math.min(s.len, d + 3);
      g.strokeStyle = rgba(SNOW, 0.9); g.lineWidth = 2;
      g.beginPath(); g.moveTo(s.x + s.ux * a, s.y + s.uy * a); g.lineTo(s.x + s.ux * b, s.y + s.uy * b); g.stroke();
    }
    g.restore();
  }

  const TLIT = [0, 0, 0, 0, 0, 0, 0];

  NB.register({
    id: 'constellation',
    title: 'Constellation',
    tags: ['Puzzle', 'Memory'],
    accent: '#ffd27a',
    order: 4,
    blurb: 'The Little Dipper plays a melody, one star at a time. Play it back. Each round adds a note and draws another line of the constellation.',
    controls: [['Click / tap', 'Choose a star'], ['1–7', 'Choose a star by number']],

    thumb(g, W, H, t, opts) {
      const wide = !!(opts && opts.runnerX) && W > 760;
      const cx = wide ? W * opts.runnerX : W / 2;
      const ox = Math.round(cx - CX);
      const k = W < 560 ? Math.max(0.5, (W - 40) / 520) : 1;
      const winter = !!NB.winter;
      backdrop(g, W, ox, 1.5, winter);
      twinkles(g, W, t, false);
      if (!winter) { campfire(g, ox + CAMP, FIRE_Y, t); fireflies(g, W, t, 12); }
      const n = Math.floor(t / 7), ph = t - n * 7;
      if (ph < 0.55) {
        const q = ph / 0.55, dir = hash(n * 3.3 + 1) < 0.5 ? 1 : -1;
        const x0 = W * (0.2 + hash(n * 13.1 + 2) * 0.6), y0 = 80 + hash(n * 7.3 + 4) * 70;
        streak(g, x0 + dir * 430 * 0.9 * ph, y0 + 430 * 0.38 * ph, dir * 0.92, 0.39, 40 + 50 * Math.sin(Math.PI * q), 0.7 * Math.sin(Math.PI * q));
      }

      g.save();
      g.translate(cx, CY); g.scale(k, k); g.translate(-CX, -CY);
      const T = 10, u = ((t % T) + T) % T, fade = u > 9.1 ? clamp(1 - (u - 9.1) / 0.8, 0, 1) : 1;
      let full = 0, ak = -1, ap = 0;
      for (let j = 0; j < LINES.length; j++) {
        const p = (u - (0.6 + j * 1.05)) / 0.55;
        if (p >= 1) { full = j + 1; continue; }
        if (p > 0) { ak = j; ap = p; }
        break;
      }
      drawLines(g, full, ak, ap, full === LINES.length, fade, -1);
      for (let i = 0; i < 7; i++) TLIT[i] = 0;
      g.lineWidth = 1.5;
      for (let j = -1; j < LINES.length; j++) {
        const i = j < 0 ? 0 : LINES[j][1], age = u - (j < 0 ? 0.6 : 0.6 + j * 1.05 + 0.55);
        if (age < 0 || age >= 0.7) continue;
        TLIT[i] = Math.max(TLIT[i], 1 - age / 0.7);
        if (age < 0.5) {
          const s = STARS[i];
          g.strokeStyle = rgba(j < 0 ? CREAM : GOLD, 0.7 * (1 - age / 0.5));
          g.beginPath(); g.arc(s.x, s.y, (8 + ease(age / 0.5) * 34) * s.s, 0, TAU); g.stroke();
        }
      }
      for (let i = 0; i < STARS.length; i++) drawStar(g, i, TLIT[i], t, 0);
      const fa = u - 7.45;
      if (fa > 0 && fa < 1.2) flareAt(g, STARS[0].x, STARS[0].y, 1 - fa / 1.2);
      g.restore();
      NB.draw.vignette(g, W, H, 0.45);
    },

    create(api) {
      const W = api.W, H = api.H, winter = !!NB.winter;
      let seq, phase, timer, showIdx, inputIdx, round, lit, dead, wrong, deadT, revealed;
      let lineAnim, shimmer, flare, hover, statusLabel, statusAt, shoot, shootT, sat, satT;

      function next() {
        let n;
        do { n = randi(0, 7); } while (seq.length && n === seq[seq.length - 1]);
        seq.push(n);
      }
      function nearest(x, y) {
        let best = -1, bd = 54 * 54;
        STARS.forEach((s, i) => { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = i; } });
        return best;
      }
      function light(i, pressed) {
        const s = STARS[i];
        lit[i] = 1;
        api.ring(s.x, s.y, { r0: 8 * s.s, r1: 34 + 16 * s.s, life: 0.5, color: pressed ? GOLD : CREAM, width: 1.6 });
        api.sfx('note', NOTES[i]);
        if (pressed) api.burst(s.x, s.y, { n: 7, speed: 120, life: 0.4, colors: [GOLD, CREAM, SNOW], shape: 'spark', size: 1.5, blend: 'add' });
      }
      function fail(i) {
        const s = STARS[i];
        dead = true; wrong = i; deadT = 0; revealed = false;
        lit[i] = 1;
        api.sfx('wrong');
        api.shake(5);
        api.flash(RED, 0.12);
        api.burst(s.x, s.y, { n: 14, speed: 140, life: 0.7, colors: [RED, RED, CREAM], shape: 'shard', size: 2.2, drag: 2.4 });
        api.ring(s.x, s.y, { r0: 6, r1: 48, life: 0.5, color: RED, width: 2.5 });
        api.over(1.4);
      }
      function cleared(i) {
        const s = STARS[i];
        round++;
        api.score(round);
        api.burst(s.x, s.y, { n: 16, speed: 170, life: 0.75, colors: [GOLD, CREAM, SNOW], shape: 'shard', size: 2.2, drag: 2.6 });
        api.ring(s.x, s.y, { r0: 10, r1: 70, life: 0.6, color: GOLD, width: 2 });
        api.float(s.x, s.y - 26, '+1', { color: GOLD, size: 20 });
        api.sfx('pickup', 1);
        if (round <= LINES.length) lineAnim = { k: round - 1, p: -0.25 };
        else shimmer = 0;
        if (round % 5 === 0) { api.sfx('level'); api.float(W / 2, 112, 'ROUND ' + round + ' CLEAR', { color: CREAM, size: 26 }); }
        next();
        phase = 'wait'; timer = 0.9;
      }
      function press(i) {
        if (dead || phase !== 'input') return;
        if (i !== seq[inputIdx]) { fail(i); return; }
        light(i, true);
        inputIdx++;
        if (inputIdx === seq.length) cleared(i);
      }
      function lineDone(k) {
        const b = STARS[LINES[k][1]];
        api.ring(b.x, b.y, { r0: 4, r1: 26, life: 0.4, color: GOLD, width: 1.5 });
        api.burst(b.x, b.y, { n: 6, speed: 90, life: 0.35, colors: [GOLD, SNOW], shape: 'spark', size: 1.3, blend: 'add' });
        api.sfx('chip');
        if (k === LINES.length - 1) {
          const p = STARS[0];
          flare = 1;
          api.ring(p.x, p.y, { r0: 12, r1: 96, life: 0.8, color: CREAM, width: 2.5 });
          api.burst(p.x, p.y, { n: 20, speed: 160, life: 0.9, colors: [GOLD, CREAM, SNOW], shape: 'shard', size: 2.2, drag: 2.2 });
          api.float(W / 2, 112, 'URSA MINOR', { color: GOLD, size: 30 });
          api.sfx('level');
        }
      }
      function skyLife(dt) {
        shootT -= dt;
        if (shoot) { shoot.age += dt; if (shoot.age >= shoot.life) shoot = null; }
        else if (shootT <= 0) {
          shootT = rand(7, 15);
          if (phase !== 'show') {
            const dir = Math.random() < 0.5 ? 1 : -1, a = rand(0.22, 0.42);
            shoot = { x: rand(140, 660), y: rand(24, 110), vx: Math.cos(a) * 470 * dir, vy: Math.sin(a) * 470, age: 0, life: rand(0.4, 0.6) };
          }
        }
        satT -= dt;
        if (sat) { sat.x += sat.vx * dt; sat.y += sat.vy * dt; if (sat.x < -20 || sat.x > W + 20) sat = null; }
        else if (satT <= 0) {
          satT = rand(25, 45);
          const d = Math.random() < 0.5 ? 1 : -1;
          sat = { x: d > 0 ? -10 : W + 10, y: rand(40, 100), vx: d * rand(14, 20), vy: rand(-1.2, 1.2) };
        }
      }

      function hud(g, t) {
        const label = dead ? 'WRONG STAR' : phase === 'input' ? 'YOUR TURN' : 'WATCH';
        if (label !== statusLabel) { statusLabel = label; statusAt = t; }
        const e = ease(clamp((t - statusAt) * 4, 0, 1));
        const col = dead ? RED : phase === 'input' ? GOLD : CREAM;
        NB.draw.text(g, 'URSA MINOR', 26, 38, { size: 15, color: CREAM, align: 'left', alpha: 0.55, spacing: 3 });
        NB.draw.text(g, 'ROUND ' + seq.length, W - 26, 38, { size: 15, color: CREAM, align: 'right', alpha: 0.55, spacing: 3 });
        NB.draw.text(g, label, W / 2 + 2.5, 46 + (1 - e) * 8, { size: 30, color: col, alpha: e * (phase === 'wait' && !dead ? 0.6 : 1), spacing: 5 });

        const n = seq.length, sp = Math.min(16, 300 / n), r = Math.max(1.6, Math.min(3.4, sp * 0.28)), x0 = W / 2 - ((n - 1) * sp) / 2;
        const filled = dead || phase === 'input' ? inputIdx : phase === 'show' ? showIdx : 0;
        for (let j = 0; j < n; j++) {
          const x = x0 + j * sp;
          if (dead && j === inputIdx) {
            g.fillStyle = RED; g.beginPath(); g.arc(x, 68, r * 1.2, 0, TAU); g.fill();
          } else if (j < filled) {
            g.fillStyle = dead || phase === 'input' ? GOLD : CREAM;
            g.beginPath(); g.arc(x, 68, r * (1 + 0.5 * lit[seq[j]]), 0, TAU); g.fill();
          } else {
            g.strokeStyle = rgba(CREAM, 0.35); g.lineWidth = 1;
            g.beginPath(); g.arc(x, 68, r, 0, TAU); g.stroke();
          }
        }
        if (dead) NB.draw.text(g, 'The dashed ring marks the right star', W / 2, 98, { size: 16, color: CREAM, alpha: 0.8 * ease(clamp(deadT * 6, 0, 1)), spacing: 0.8 });
        else if (round === 0 && phase === 'input' && inputIdx === 0) NB.draw.text(g, 'Tap the star, or press its number', W / 2, 98, { size: 16, color: CREAM, alpha: 0.65, spacing: 0.8 });
      }

      return {
        reset() {
          seq = []; next();
          phase = 'wait'; timer = 1; showIdx = 0; inputIdx = 0; round = 0;
          lit = STARS.map(() => 0); dead = false; wrong = -1; deadT = 0; revealed = false;
          lineAnim = null; shimmer = -1; flare = 0; hover = -1; statusLabel = ''; statusAt = 0;
          shoot = null; shootT = rand(4, 9); sat = null; satT = rand(8, 20);
          api.score(0);
        },

        update(dt) {
          for (let i = 0; i < lit.length; i++) lit[i] = Math.max(0, lit[i] - dt * 2.4);
          if (flare > 0) flare = Math.max(0, flare - dt * 0.9);
          if (lineAnim) {
            lineAnim.p += dt / 0.55;
            if (lineAnim.p >= 1) { const k = lineAnim.k; lineAnim = null; lineDone(k); }
          }
          if (shimmer >= 0) { shimmer += dt * 6.5; if (shimmer >= LINES.length) shimmer = -1; }
          skyLife(dt);
          if (dead) {
            // Input is ignored now; let the world play out and point at the star that was wanted.
            deadT += dt;
            if (!revealed && deadT > 0.1) {
              revealed = true;
              const c = seq[inputIdx], s = STARS[c];
              lit[c] = Math.max(lit[c], 0.8);
              api.ring(s.x, s.y, { r0: 6, r1: 40, life: 0.7, color: GOLD, width: 1.5 });
              api.sfx('note', NOTES[c]);
            }
            return;
          }
          if (phase === 'wait') {
            timer -= dt;
            if (timer <= 0) { phase = 'show'; showIdx = 0; timer = 0.1; }
          } else if (phase === 'show') {
            timer -= dt;
            if (timer <= 0) {
              if (showIdx < seq.length) { light(seq[showIdx], false); showIdx++; timer = Math.max(0.3, 0.62 - seq.length * 0.022); }
              else { phase = 'input'; inputIdx = 0; }
            }
          }
        },

        tap(x, y) {
          const i = nearest(x, y);
          if (i >= 0) press(i);
        },
        pointer(x, y) { hover = nearest(x, y); },
        key(code) {
          const m = /^(?:Digit|Numpad)([1-7])$/.exec(code);
          if (m) press(+m[1] - 1);
        },

        draw(g, t) {
          backdrop(g, W, 0, 2, winter);
          twinkles(g, W, t, true);
          if (!winter) { campfire(g, CAMP, FIRE_Y, t); fireflies(g, W, t, 16); }
          if (sat) { g.fillStyle = rgba(FROST, 0.55); g.fillRect(sat.x - 0.8, sat.y - 0.8, 1.6, 1.6); }
          if (shoot) {
            const q = shoot.age / shoot.life, sp = Math.hypot(shoot.vx, shoot.vy) || 1, a = Math.sin(Math.PI * q);
            streak(g, shoot.x + shoot.vx * shoot.age, shoot.y + shoot.vy * shoot.age, shoot.vx / sp, shoot.vy / sp, 40 + 50 * a, 0.7 * a);
          }

          const full = lineAnim ? lineAnim.k : Math.min(LINES.length, round);
          drawLines(g, full, lineAnim ? lineAnim.k : -1, lineAnim ? lineAnim.p : 0, full === LINES.length, 1, shimmer);

          if (hover >= 0 && phase === 'input' && !dead) {
            const s = STARS[hover];
            g.strokeStyle = rgba(CREAM, 0.32); g.lineWidth = 1;
            g.beginPath(); g.arc(s.x, s.y, 14 * s.s + 6, 0, TAU); g.stroke();
          }

          const want = dead ? seq[inputIdx] : -1;
          for (let i = 0; i < STARS.length; i++) drawStar(g, i, lit[i], t, dead && i === wrong ? 1 : i === want ? 2 : 0);

          if (dead) {
            const s = STARS[want], e = ease(clamp(deadT / 0.08, 0, 1));
            g.save();
            g.strokeStyle = rgba(GOLD, 0.95); g.lineWidth = 1.6;
            g.setLineDash([5, 5]); g.lineDashOffset = -t * 16;
            g.beginPath(); g.arc(s.x, s.y, (18 * s.s + 6) * (0.6 + 0.4 * e), 0, TAU); g.stroke();
            g.restore();
          }

          for (let i = 0; i < STARS.length; i++) {
            const s = STARS[i], on = lit[i];
            NB.draw.text(g, s.name, s.x, s.y + 20 + 8 * s.s, { size: 13, color: i === 0 ? CREAM : ICE, alpha: (i === 0 ? 0.75 : 0.55) + 0.3 * on, spacing: 0.8 });
            const bx = s.x + 13 + 5 * s.s, by = s.y - 13 - 5 * s.s;
            g.strokeStyle = rgba(CREAM, 0.22 + 0.4 * on); g.lineWidth = 1;
            g.beginPath(); g.arc(bx, by, 7.5, 0, TAU); g.stroke();
            NB.draw.text(g, String(i + 1), bx, by + 0.5, { size: 12, color: CREAM, alpha: 0.6 + 0.4 * on, baseline: 'middle' });
          }

          flareAt(g, STARS[0].x, STARS[0].y, flare);
          hud(g, t);
          NB.draw.vignette(g, W, H, 0.42);
        }
      };
    }
  });
})();
