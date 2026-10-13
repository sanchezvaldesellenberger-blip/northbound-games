/* Halo Orbit: keep a small probe circling a ringed planet. Tap to reverse, sweep up stardust, dodge the comets. */
(function () {
  'use strict';
  const { TAU, clamp, rand, hash, rgba } = NB.util;
  const C = NB.pal;
  const PI = Math.PI;

  /* ---------- Layout (logical 800x500) ---------- */
  const R = 150;                 // orbit radius (gameplay)
  const PR = 50;                 // planet radius
  const TILT = -0.36;            // ring tilt, right side up
  const CT = Math.cos(TILT), ST = Math.sin(TILT);
  const K = 0.28;                // ring squash (viewing angle)
  const PS = 208;                // planet sprite box
  const M = 28;                  // sky margin for parallax
  const WARN = 0.9;              // comet warning time
  const FLIP = 0.26;             // panel roll time on a direction flip
  const LX = -Math.SQRT1_2, LY = -Math.SQRT1_2;   // unit vector toward the light (top-left)

  const ink = (a) => `rgba(9,21,38,${a})`;
  const wrap = (v, m) => ((v % m) + m) % m;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const backOut = (x) => { const y = x - 1; return 1 + 2.70158 * y * y * y + 1.70158 * y * y; };

  /* ---------- Offscreen sprites (created once, painted directly when no DOM canvas exists) ---------- */
  function canvas2d(w, h) {
    try {
      if (typeof document === 'undefined' || !document.createElement) return null;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
      const x = c.getContext('2d');
      return x ? { c, x } : null;
    } catch (e) { return null; }
  }
  function sprite(w, h, ss, paint) {
    const cv = canvas2d(w * ss, h * ss);
    if (cv) { cv.x.scale(ss, ss); paint(cv.x); }
    return { w, h, img: cv ? cv.c : null, paint };
  }
  function blit(g, s, x, y) {
    if (s.img) g.drawImage(s.img, x, y, s.w, s.h);
    else { g.save(); g.translate(x, y); s.paint(g); g.restore(); }
  }

  /* ---------- Planet ---------- */
  // Half of an elliptical ring band: from = 0 is the front half, PI the back half.
  function bandPath(g, cx, cy, r0, r1, from) {
    g.beginPath();
    g.ellipse(cx, cy, r1, r1 * K, TILT, from, from + PI, false);
    g.ellipse(cx, cy, r0, r0 * K, TILT, from + PI, from, true);
    g.closePath();
  }

  const RING = [
    [59, 63, C.amber, 0.45],
    [65, 78, C.cream, 0.95],
    [79.5, 86, C.gold, 0.85],
    [88, 94, C.amber, 0.55]
  ];

  function paintRing(g, back) {
    const c = PS / 2, from = back ? PI : 0;
    g.save();
    for (const [r0, r1, col, a] of RING) { g.globalAlpha = a; g.fillStyle = col; bandPath(g, c, c, r0, r1, from); g.fill(); }
    g.globalAlpha = 1;
    g.strokeStyle = ink(0.22); g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(c, c, 72, 72 * K, TILT, from, from + PI); g.stroke();
    if (back) {
      // The far half sits a little darker, and the planet casts a shadow wedge across it.
      g.fillStyle = ink(0.2); bandPath(g, c, c, 58, 95, from); g.fill();
      bandPath(g, c, c, 58, 95, from); g.clip();
      const ang = -1.12, ux = Math.cos(ang), uy = Math.sin(ang), w = PR * 0.92, L = 150;
      g.fillStyle = ink(0.5);
      g.beginPath();
      g.moveTo(c - uy * w, c + ux * w);
      g.lineTo(c - uy * w + ux * L, c + ux * w + uy * L);
      g.lineTo(c + uy * w + ux * L, c - ux * w + uy * L);
      g.lineTo(c + uy * w, c - ux * w);
      g.closePath(); g.fill();
    } else {
      g.strokeStyle = rgba(C.snow, 0.5); g.lineWidth = 0.9;
      g.beginPath(); g.ellipse(c, c, 65.5, 65.5 * K, TILT, 0.2, PI - 0.2); g.stroke();
    }
    g.restore();
  }

  const BANDS = [
    [-PR - 6, C.orange], [-39, C.amber], [-30, C.cream], [-20, C.gold], [-12, C.amber], [-5, C.cream],
    [7, C.gold], [13, C.amber], [24, C.cream], [31, C.gold], [40, C.orange]
  ];
  function paintBody(g) {
    const c = PS / 2;
    g.save();
    g.translate(c, c);
    g.beginPath(); g.arc(0, 0, PR, 0, TAU); g.clip();
    g.rotate(TILT);
    BANDS.forEach(([y0, col], i) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(-PR - 8, PR + 8);
      for (let x = -PR - 8; x <= PR + 8; x += 4) g.lineTo(x, y0 + Math.sin(x * 0.085 + i * 1.9) * 1.5 + Math.sin(x * 0.21 + i) * 0.6);
      g.lineTo(PR + 8, PR + 8);
      g.closePath(); g.fill();
    });
    g.strokeStyle = rgba(C.cream, 0.5); g.lineWidth = 1; g.lineCap = 'round';
    [[-34, -26, 18], [-8, -40, -6], [17, 4, 30], [36, -18, 12], [-24, 10, 34]].forEach(([y, x0, x1]) => {
      g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo((x0 + x1) / 2, y - 1.2, x1, y + 0.4); g.stroke();
    });
    g.restore();
  }

  function paintShade(g) {
    const c = PS / 2;
    g.save();
    g.translate(c, c);
    g.beginPath(); g.arc(0, 0, PR, 0, TAU); g.clip();
    // Shadow the front ring throws onto the body, nudged away from the light.
    g.fillStyle = ink(0.3); bandPath(g, 3, 8, 62, 92, 0); g.fill();
    // Two-step terminator: a broad shadow and a deeper core on the far limb.
    const shade = (d, a) => {
      const r = PR * Math.sqrt(1 + d * d), o = d * PR * Math.SQRT1_2;
      g.fillStyle = ink(a);
      g.beginPath(); g.arc(0, 0, PR + 2, 0, TAU); g.arc(-o, -o, r, 0, TAU, true); g.fill();
    };
    shade(0.85, 0.34);
    shade(0.3, 0.26);
    // Lit rim on the light side.
    g.fillStyle = rgba(C.snow, 0.32);
    g.beginPath(); g.arc(0, 0, PR + 2, 0, TAU); g.arc(PR * 0.07, PR * 0.07, PR, 0, TAU, true); g.fill();
    g.restore();
    g.strokeStyle = ink(0.45); g.lineWidth = 1.2;
    g.beginPath(); g.arc(c, c, PR, 0, TAU); g.stroke();
  }

  let SPR = null;
  function sprites() {
    if (!SPR) {
      SPR = {
        back: sprite(PS, PS, 3, (g) => paintRing(g, true)),
        body: sprite(PS, PS, 3, paintBody),
        shade: sprite(PS, PS, 3, paintShade),
        front: sprite(PS, PS, 3, (g) => paintRing(g, false))
      };
    }
    return SPR;
  }

  // Loose ring particles drifting along the bands.
  function ringDust(g, t, front) {
    g.fillStyle = C.cream;
    for (let i = 0; i < 9; i++) {
      const psi = i * 0.698 + t * (0.1 + (i % 3) * 0.025), s = Math.sin(psi);
      if ((s >= 0) !== front) continue;
      const r = 64 + hash(i * 3.3) * 28, x0 = Math.cos(psi) * r, y0 = s * r * K;
      g.globalAlpha = front ? 0.85 : 0.4;
      g.fillRect(x0 * CT - y0 * ST - 0.8, x0 * ST + y0 * CT - 0.8, 1.6, 1.6);
    }
    g.globalAlpha = 1;
  }

  // Storm and cloud flecks that turn with the planet (drawn under the terminator).
  function weather(g, t) {
    g.save(); g.rotate(TILT);
    const spot = (lat, ph, w, h, col, a) => {
      const cp = Math.cos(ph);
      if (cp < 0.08) return;
      g.globalAlpha = a; g.fillStyle = col;
      g.beginPath(); g.ellipse(Math.sin(ph) * Math.sqrt(PR * PR - lat * lat) * 0.9, lat, w * cp, h, 0, 0, TAU); g.fill();
    };
    const ph = t * 0.32;
    spot(19, ph, 8, 4.2, C.orange, 1);
    spot(19, ph, 4, 1.9, C.cream, 0.9);
    spot(-15, ph * 1.3 + 2.4, 7, 1.4, C.cream, 0.75);
    spot(34, ph * 0.8 + 4.4, 6, 1.3, C.cream, 0.6);
    spot(-27, ph * 1.1 + 5.3, 5, 1.2, C.gold, 0.8);
    g.restore();
    g.globalAlpha = 1;
  }

  function drawPlanet(g, x, y, t, k) {
    const S = sprites(), h = PS / 2;
    g.save();
    g.translate(x, y);
    if (k !== 1) g.scale(k, k);
    blit(g, S.back, -h, -h);
    ringDust(g, t, false);
    blit(g, S.body, -h, -h);
    weather(g, t);
    blit(g, S.shade, -h, -h);
    blit(g, S.front, -h, -h);
    ringDust(g, t, true);
    g.restore();
  }

  function badge(g, x, y, n, s) {
    const str = String(n), w = 30 + str.length * 9, h = 22;
    g.save();
    g.translate(x, y); g.scale(s, s);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(8,20,36,0.88)';
    NB.draw.rr(g, -w / 2, -h / 2, w, h, h / 2); g.fill();
    g.strokeStyle = rgba(C.cream, 0.22); g.lineWidth = 1; g.stroke();
    NB.draw.star4(g, -w / 2 + 11, 0, 4.5, 0, C.gold);
    NB.draw.text(g, str, 5, 1, { size: 15, color: C.cream, baseline: 'middle' });
    g.restore();
  }

  /* ---------- Sky ---------- */
  function farBody(g, x, y, r, base, bands, craters) {
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = base; g.fill();
    g.clip();
    if (bands) {
      g.fillStyle = 'rgba(169,201,255,0.04)';
      for (let i = -4; i <= 4; i += 2) g.fillRect(x - r, y + i * r * 0.11, r * 2, r * 0.09);
    }
    if (craters) {
      g.fillStyle = 'rgba(6,14,28,0.35)';
      [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.42, 0.12]].forEach(([a, b, s]) => {
        g.beginPath(); g.arc(x + a * r, y + b * r, s * r, 0, TAU); g.fill();
      });
    }
    const d = 0.7, rr = r * Math.sqrt(1 + d * d), o = d * r * Math.SQRT1_2;
    g.fillStyle = 'rgba(4,10,22,0.5)';
    g.beginPath(); g.arc(x, y, r + 2, 0, TAU); g.arc(x - o, y - o, rr, 0, TAU, true); g.fill();
    g.fillStyle = 'rgba(223,233,245,0.1)';
    g.beginPath(); g.arc(x, y, r + 2, 0, TAU); g.arc(x + r * 0.05, y + r * 0.05, r, 0, TAU, true); g.fill();
    g.restore();
  }

  function tinyRinged(g, x, y) {
    g.save();
    g.strokeStyle = 'rgba(169,201,255,0.22)'; g.lineWidth = 1.4;
    g.beginPath(); g.ellipse(x, y, 15, 4, -0.3, PI, TAU); g.stroke();
    g.fillStyle = '#2b4562'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
    g.fillStyle = 'rgba(4,10,22,0.45)';
    g.beginPath(); g.arc(x, y, 7.2, 0, TAU); g.arc(x - 3, y - 3, 7.6, 0, TAU, true); g.fill();
    g.beginPath(); g.ellipse(x, y, 15, 4, -0.3, 0, PI); g.stroke();
    g.restore();
  }

  // Static sky: muted navy wash, a soft dust lane, far stars and the distant bodies.
  function paintSky(g, W, H) {
    const CX = W / 2, CY = H / 2;
    const gr = g.createLinearGradient(CX - 320, -M, CX + 320, H + M);
    gr.addColorStop(0, '#13293e'); gr.addColorStop(1, '#0a1626');
    g.fillStyle = gr; g.fillRect(-M, -M, W + 2 * M, H + 2 * M);

    g.save();
    g.translate(CX - 40, CY + 20); g.rotate(-0.42);
    const lane = g.createLinearGradient(0, -110, 0, 110);
    lane.addColorStop(0, 'rgba(29,58,74,0)'); lane.addColorStop(0.5, 'rgba(29,58,74,0.42)'); lane.addColorStop(1, 'rgba(29,58,74,0)');
    g.fillStyle = lane; g.fillRect(-W - 200, -110, W * 2 + 400, 220);
    g.restore();

    const Wt = W + 2 * M, Ht = H + 2 * M, n = Math.round((Wt * Ht) / 4800);
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.16 + hash(i * 5.3 + 1) * 0.3;
      g.fillStyle = hash(i * 7.1) > 0.8 ? C.frost : C.ice;
      const s = hash(i * 9.7) > 0.86 ? 1.6 : 1.1;
      g.fillRect(hash(i * 1.37 + 3) * Wt - M, hash(i * 2.91 + 17) * Ht - M, s, s);
    }
    g.globalAlpha = 1;

    farBody(g, CX + 392, CY + 318, 196, '#182f45', true, false);
    farBody(g, CX - 300, CY - 168, 15, '#233a50', false, true);
    tinyRinged(g, CX - 262, CY + 176);
  }

  const skyCache = new Map();
  function skySprite(W, H) {
    const Wq = Math.ceil(W / 32) * 32, Hq = Math.ceil(H / 32) * 32, key = Wq + 'x' + Hq;
    let s = skyCache.get(key);
    if (!s) {
      if (skyCache.size > 5) skyCache.clear();
      const ss = Math.min(2, 2600 / (Wq + 2 * M));
      s = sprite(Wq + 2 * M, Hq + 2 * M, ss, (g) => { g.save(); g.translate(M, M); paintSky(g, Wq, Hq); g.restore(); });
      s.wq = Wq; s.hq = Hq;
      skyCache.set(key, s);
    }
    return s;
  }

  function liveStars(g, W, H, t, ox, oy) {
    const Wt = W + 2 * M, Ht = H + 2 * M, n1 = Math.round(Wt / 26), n2 = Math.round(Wt / 70);
    g.fillStyle = C.ice;
    for (let i = 0; i < n1; i++) {
      const x = wrap(hash(i * 3.17 + 41) * Wt - ox * 0.08 - t * 2.5, Wt) - M;
      const y = wrap(hash(i * 1.93 + 7) * Ht - oy * 0.08, Ht) - M;
      g.globalAlpha = 0.36 + 0.28 * Math.sin(t * (0.8 + hash(i) * 1.6) + i * 2.1);
      g.fillRect(x, y, 1.6, 1.6);
    }
    for (let i = 0; i < n2; i++) {
      const x = wrap(hash(i * 5.71 + 93) * Wt - ox * 0.15 - t * 5, Wt) - M;
      const y = wrap(hash(i * 8.13 + 29) * Ht - oy * 0.15, Ht) - M;
      const tw = 0.5 + 0.5 * Math.sin(t * (1.1 + hash(i + 4) * 1.5) + i);
      g.globalAlpha = 0.3 + 0.45 * tw;
      NB.draw.star4(g, x, y, 1.8 + tw * 1.6, 0, C.cream);
    }
    g.globalAlpha = 1;
  }

  // The studio's north star, with long thin flares.
  function northStar(g, x, y, t) {
    const tw = 0.5 + 0.5 * Math.sin(t * 1.3);
    g.save();
    g.globalAlpha = 0.22 + 0.14 * tw; g.strokeStyle = C.cream; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - 20, y); g.lineTo(x + 20, y); g.moveTo(x, y - 26); g.lineTo(x, y + 26); g.stroke();
    g.globalAlpha = 1;
    NB.draw.star4(g, x, y, 7 + tw * 1.3, 0, C.cream);
    g.globalAlpha = 0.85;
    NB.draw.star4(g, x, y, 3.2, PI / 4, C.snow);
    g.restore();
    g.globalAlpha = 1;
  }

  function sky(g, W, H, t, ox, oy) {
    const s = skySprite(W, H);
    blit(g, s, -M - (s.wq - W) / 2 - ox * 0.035, -M - (s.hq - H) / 2 - oy * 0.035);
    liveStars(g, W, H, t, ox, oy);
    northStar(g, W / 2 + 292 - ox * 0.05, H / 2 - 190 - oy * 0.05, t);
  }

  function track(g, cx, cy, off) {
    g.save();
    g.strokeStyle = rgba(C.cream, 0.2); g.lineWidth = 1.25;
    g.setLineDash([5, 9]); g.lineDashOffset = off;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = rgba(C.cream, 0.3); g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const c = Math.cos(i * PI / 2), s = Math.sin(i * PI / 2);
      g.moveTo(cx + c * (R - 5), cy + s * (R - 5)); g.lineTo(cx + c * (R + 5), cy + s * (R + 5));
    }
    g.stroke();
    g.restore();
  }

  /* ---------- Stardust ---------- */
  const DUST = ['#fff1c4', C.gold, C.amber];   // lit, mid and shadow facets
  function facetStar(g, x, y, r, rot) {
    NB.draw.star4(g, x, y, r, rot, C.gold);
    const ri = r * 0.3;
    for (let k = 0; k < 4; k++) {
      const A = rot + k * PI / 2 - PI / 2, tx = x + Math.cos(A) * r, ty = y + Math.sin(A) * r;
      for (let s = -1; s <= 1; s += 2) {
        const B = A + s * PI / 4, d = Math.cos(A + s * 0.5) * LX + Math.sin(A + s * 0.5) * LY;
        g.fillStyle = d > 0.3 ? DUST[0] : d > -0.25 ? DUST[1] : DUST[2];
        g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.lineTo(x + Math.cos(B) * ri, y + Math.sin(B) * ri); g.closePath(); g.fill();
      }
    }
  }

  function drawMote(g, x, y, t, s, seed) {
    if (s <= 0.01) return;
    const p = 0.5 + 0.5 * Math.sin(t * 4.2 + seed), r = 9 * s * (0.92 + 0.14 * p), fade = Math.min(1, s);
    g.save();
    g.globalAlpha = (0.14 + 0.24 * (1 - p)) * fade;
    g.strokeStyle = C.gold; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, r * (1.35 + 0.4 * p), 0, TAU); g.stroke();
    g.globalAlpha = 1;
    facetStar(g, x, y, r, t * 0.9 + seed);
    g.globalAlpha = p * fade;
    NB.draw.star4(g, x + r * 0.95, y - r * 0.85, r * 0.32, 0, C.snow);
    g.restore();
    g.globalAlpha = 1;
  }

  /* ---------- Comets ---------- */
  // Entry and exit distances of a ray through the screen rectangle, or null.
  function clipSeg(sx, sy, ux, uy, W, H) {
    let t0 = -1e9, t1 = 1e9;
    const axis = (s, u, hi) => {
      if (Math.abs(u) < 1e-9) return s >= 0 && s <= hi;
      let a = -s / u, b = (hi - s) / u;
      if (a > b) { const k = a; a = b; b = k; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      return true;
    };
    if (!axis(sx, ux, W) || !axis(sy, uy, H) || t1 < t0) return null;
    return [t0, t1];
  }

  function drawWarn(g, c, W, H) {
    const age = WARN - c.warn, left = clamp(c.warn / WARN, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(age * (14 + age * 18));
    const grow = easeOut(clamp(age / 0.3, 0, 1));
    g.save();
    g.strokeStyle = C.red; g.globalAlpha = 0.26 + 0.3 * pulse; g.lineWidth = 2;
    g.setLineDash([7, 9]); g.lineDashOffset = -age * 60;
    g.beginPath(); g.moveTo(c.ex, c.ey); g.lineTo(c.ex + (c.qx - c.ex) * grow, c.ey + (c.qy - c.ey) * grow); g.stroke();
    g.setLineDash([]);
    const mx = clamp(c.ex, 20, W - 20), my = clamp(c.ey, 20, H - 20);
    g.translate(mx, my);
    g.globalAlpha = 0.85; g.fillStyle = 'rgba(8,20,36,0.8)';
    g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill();
    g.globalAlpha = 0.9; g.strokeStyle = C.red; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, 13, -PI / 2, -PI / 2 + TAU * left); g.stroke();
    g.rotate(Math.atan2(c.uy, c.ux));
    const sc = 1 + 0.2 * pulse;
    g.scale(sc, sc);
    g.fillStyle = C.red;
    const chev = (dx, a) => {
      g.globalAlpha = a;
      g.beginPath();
      g.moveTo(dx - 3.5, -6); g.lineTo(dx + 3, 0); g.lineTo(dx - 3.5, 6);
      g.lineTo(dx - 6, 3.6); g.lineTo(dx - 1.6, 0); g.lineTo(dx - 6, -3.6);
      g.closePath(); g.fill();
    };
    chev(-1.5, 0.45 + 0.4 * pulse);
    chev(3.5, 1);
    g.restore();
    g.globalAlpha = 1;
  }

  const ICE = [C.snow, C.ice, C.frost, '#7f9fd6'];
  // Faceted icy head, shaded by the fixed light no matter how it tumbles.
  function rock(g, x, y, r, rot, verts) {
    const n = verts.length, pts = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      pts.push(x + Math.cos(a) * r * verts[i], y + Math.sin(a) * r * verts[i]);
    }
    g.fillStyle = C.frost;
    g.beginPath();
    for (let i = 0; i < n; i++) g.lineTo(pts[i * 2], pts[i * 2 + 1]);
    g.closePath(); g.fill();
    const cx = x + LX * r * 0.25, cy = y + LY * r * 0.25;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, px = pts[i * 2], py = pts[i * 2 + 1], qx = pts[j * 2], qy = pts[j * 2 + 1];
      const mx = (px + qx) / 2 - x, my = (py + qy) / 2 - y, ml = Math.hypot(mx, my) || 1;
      const d = (mx * LX + my * LY) / ml;
      g.fillStyle = d > 0.45 ? ICE[0] : d > 0 ? ICE[1] : d > -0.5 ? ICE[2] : ICE[3];
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(px, py); g.lineTo(qx, qy); g.closePath(); g.fill();
    }
  }

  function drawComet(g, c, t) {
    const ux = c.ux, uy = c.uy, nx = -uy, ny = ux, x = c.x, y = c.y, r = c.r;
    const L = 70 + c.sp * 0.1, wig = Math.sin(t * 9 + c.seed) * 3.5, th = Math.atan2(uy, ux);
    g.save();
    const taper = (sl, sw, col, a) => {
      const len = L * sl, w = r * sw, bx = x - ux * len * 0.45, by = y - uy * len * 0.45;
      const tx = x - ux * len + nx * wig * sl, ty = y - uy * len + ny * wig * sl;
      g.globalAlpha = a; g.fillStyle = col;
      g.beginPath();
      g.moveTo(x + nx * w, y + ny * w);
      g.quadraticCurveTo(bx + nx * w * 0.7, by + ny * w * 0.7, tx, ty);
      g.quadraticCurveTo(bx - nx * w * 0.7, by - ny * w * 0.7, x - nx * w, y - ny * w);
      g.arc(x, y, w, th - PI / 2, th + PI / 2, false);
      g.closePath(); g.fill();
    };
    taper(1, 1.35, C.blue, 0.2);
    taper(0.78, 1.05, C.frost, 0.34);
    taper(0.5, 0.66, C.snow, 0.72);
    g.globalAlpha = 0.32; g.strokeStyle = C.frost; g.lineWidth = 1; g.lineCap = 'round';
    g.beginPath();
    for (let s = -1; s <= 1; s += 2) {
      g.moveTo(x - ux * r * 1.6 + nx * s * r * 0.8, y - uy * r * 1.6 + ny * s * r * 0.8);
      g.lineTo(x - ux * L * 0.85 + nx * (s * r * 1.3 + wig * 0.8), y - uy * L * 0.85 + ny * (s * r * 1.3 + wig * 0.8));
    }
    g.stroke();
    g.globalAlpha = 0.16; g.fillStyle = C.frost;
    g.beginPath(); g.arc(x, y, r * 2, 0, TAU); g.fill();
    g.globalAlpha = 1;
    rock(g, x, y, r, c.rot, c.verts);
    g.restore();
  }

  /* ---------- Probe ---------- */
  const STRUT = '#8ea2ba', HULL_SHADE = '#aebdcf', PANEL_EDGE = '#3f64a8';
  function drawProbe(g, x, y, hd, roll, blink, s) {
    const ch = Math.cos(hd), sh = Math.sin(hd);
    const lx = LX * ch + LY * sh, ly = -LX * sh + LY * ch;   // light direction in the probe's frame
    g.save();
    g.translate(x, y); g.rotate(hd); g.scale(s, s);
    g.strokeStyle = STRUT; g.lineWidth = 1.6; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(0, -5); g.lineTo(0, -9.5); g.moveTo(0, 5); g.lineTo(0, 9.5); g.stroke();
    // Solar panels roll about their struts when the probe flips.
    const cr = Math.abs(Math.cos(roll)), pw = 8 * Math.max(0.14, cr);
    for (let side = -1; side <= 1; side += 2) {
      const y0 = side < 0 ? -22 : 9, h = 13;
      g.fillStyle = cr < 0.4 ? PANEL_EDGE : C.blue;
      g.fillRect(-pw / 2, y0, pw, h);
      g.fillStyle = ink(0.35);
      g.fillRect(-pw / 2, y0 + 4.2, pw, 0.9); g.fillRect(-pw / 2, y0 + 8.4, pw, 0.9); g.fillRect(-0.45, y0, 0.9, h);
      g.fillStyle = C.frost;
      g.fillRect(lx > 0 ? pw / 2 - 1 : -pw / 2, y0, 1, h);
      g.fillRect(-pw / 2, ly > 0 ? y0 + h - 1 : y0, pw, 1);
      g.fillStyle = ink(0.45);
      g.fillRect(lx > 0 ? -pw / 2 : pw / 2 - 1, y0, 1, h);
    }
    // Hull: shadow tone, then the lit shape shifted toward the light.
    g.save();
    NB.draw.rr(g, -6.5, -5.5, 13, 11, 3); g.clip();
    g.fillStyle = HULL_SHADE; g.fillRect(-8, -7, 16, 14);
    NB.draw.rr(g, -6.5 + lx * 2.4, -5.5 + ly * 2.4, 13, 11, 3); g.fillStyle = C.snow; g.fill();
    g.fillStyle = C.amber; g.fillRect(-6.5, -6, 3.4, 12);
    g.fillStyle = C.gold; g.fillRect(-6.5, -6 + ly * 2.4, 3.4, 12);
    g.fillStyle = C.navy; g.beginPath(); g.arc(1.5, 0, 2.2, 0, TAU); g.fill();
    g.fillStyle = C.frost; g.beginPath(); g.arc(1.5 + lx * 0.8, ly * 0.8, 0.9, 0, TAU); g.fill();
    g.restore();
    NB.draw.rr(g, -6.5, -5.5, 13, 11, 3); g.strokeStyle = ink(0.5); g.lineWidth = 0.8; g.stroke();
    // Dish up front, antenna and blinking beacon at the back.
    g.strokeStyle = STRUT; g.lineWidth = 1;
    g.beginPath(); g.moveTo(6.5, 0); g.lineTo(8.5, 0); g.moveTo(-6, -2); g.lineTo(-11, -5.5); g.stroke();
    g.fillStyle = C.ice; g.beginPath(); g.arc(10.6, 0, 3.6, PI / 2, PI * 1.5); g.closePath(); g.fill();
    g.fillStyle = ink(0.3); g.beginPath(); g.arc(10.6, 0, 3.6, ly > 0 ? PI : PI / 2, ly > 0 ? PI * 1.5 : PI); g.lineTo(10.6, 0); g.closePath(); g.fill();
    g.fillStyle = blink ? C.red : '#7a3040';
    g.beginPath(); g.arc(-11.3, -5.7, blink ? 1.9 : 1.3, 0, TAU); g.fill();
    if (blink) { g.globalAlpha = 0.35; g.strokeStyle = C.red; g.beginPath(); g.arc(-11.3, -5.7, 4, 0, TAU); g.stroke(); }
    g.restore();
    g.globalAlpha = 1;
  }

  function drawTrail(g, cx, cy, angs) {
    const n = angs.length;
    if (n < 2) return;
    g.save();
    g.strokeStyle = C.cream; g.lineCap = 'butt';
    for (let i = 1; i < n; i++) {
      const a0 = angs[i - 1], a1 = angs[i];
      if (Math.abs(a0 - a1) < 1e-4) continue;
      const f = 1 - i / n;
      g.globalAlpha = 0.34 * f; g.lineWidth = 0.8 + 2.6 * f;
      g.beginPath(); g.arc(cx, cy, R, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  function drawWreck(g, pieces) {
    for (const w of pieces) {
      g.save();
      g.translate(w.x, w.y); g.rotate(w.rot);
      if (w.k === 0) {
        NB.draw.rr(g, -6.5, -5.5, 13, 11, 3); g.fillStyle = HULL_SHADE; g.fill();
        NB.draw.rr(g, -6.5, -5.5, 11, 9, 3); g.fillStyle = C.snow; g.fill();
        g.fillStyle = C.amber; g.fillRect(-6.5, -5, 3, 10);
      } else if (w.k === 1) {
        g.fillStyle = C.blue; g.fillRect(-4, -6.5, 8, 13);
        g.fillStyle = ink(0.35); g.fillRect(-4, -2.3, 8, 0.9); g.fillRect(-4, 1.9, 8, 0.9);
        g.fillStyle = C.frost; g.fillRect(-4, -6.5, 8, 1);
      } else {
        g.fillStyle = C.ice; g.beginPath(); g.arc(0, 0, 3.6, PI / 2, PI * 1.5); g.closePath(); g.fill();
      }
      g.restore();
    }
  }

  const THUMB_ROCK = [1, 0.84, 1.08, 0.9, 1.1, 0.8, 0.98];

  NB.register({
    id: 'halo-orbit',
    title: 'Halo Orbit',
    tags: ['One-tap', 'Reflex'],
    accent: C.amber,
    order: 6,
    blurb: 'Fly a small probe around a ringed planet and collect the stardust on your orbit. Tap to reverse direction. A red marker shows where the next comet will come in.',
    controls: [['Space / click / tap', 'Reverse orbit']],

    thumb(g, W, H, t) {
      g.globalAlpha = 1;
      const CX = W / 2, CY = H / 2, T = 2.2, SP = 1.9;
      // The probe sweeps back and forth, flipping every T seconds.
      const at = (q) => { const ph = q / T, n = Math.floor(ph), f = ph - n; return -2 + SP * T * (n % 2 === 0 ? f : 1 - f); };
      const ph = t / T, seg = Math.floor(ph), d = seg % 2 === 0 ? 1 : -1, since = (ph - seg) * T;
      const a = at(t), px = CX + Math.cos(a) * R, py = CY + Math.sin(a) * R;

      sky(g, W, H, t, px - CX, py - CY);
      track(g, CX, CY, -a * 7.4);
      drawPlanet(g, CX, CY, t, 1);
      [2.62, 3.2, 3.78].forEach((m, i) => drawMote(g, CX + Math.cos(m) * R, CY + Math.sin(m) * R, t, 1, i * 2.1));

      // A comet: warning first, then the crossing.
      const Tc = 3.4, ci = Math.floor(t / Tc), lt = t - ci * Tc, up = ci % 2 === 0;
      const sx = -30, sy = up ? 50 + hash(ci) * 60 : 330 + hash(ci) * 50;
      const qx = W + 30, qy = up ? 140 + hash(ci + 9) * 50 : 410 + hash(ci + 9) * 50;
      const len = Math.hypot(qx - sx, qy - sy) || 1, ux = (qx - sx) / len, uy = (qy - sy) / len;
      const cs = clipSeg(sx, sy, ux, uy, W, H) || [0, len];
      const cm = { ux, uy, ex: sx + ux * cs[0], ey: sy + uy * cs[0], qx: sx + ux * cs[1], qy: sy + uy * cs[1], warn: 0, sp: 320, r: 9, rot: t * 1.4, verts: THUMB_ROCK, seed: ci };
      if (lt < WARN) { cm.warn = WARN - lt; drawWarn(g, cm, W, H); }
      else {
        const dist = -60 + ((lt - WARN) / (Tc - WARN)) * (len + 260);
        cm.x = sx + ux * dist; cm.y = sy + uy * dist;
        drawComet(g, cm, t);
      }

      const trail = [];
      for (let i = 0; i < 12; i++) trail.push(at(t - i * 0.018));
      drawTrail(g, CX, CY, trail);
      // Thruster puff right after each flip.
      if (since < 0.45) {
        const k = since / 0.45, oa = a - d * PI / 2;
        g.fillStyle = C.ice;
        for (let i = 0; i < 5; i++) {
          const dd = 6 + k * 20 * (1 + i * 0.3), j = (hash(i + seg * 7) - 0.5) * 8 * k;
          g.globalAlpha = (1 - k) * 0.5;
          g.beginPath();
          g.arc(px + Math.cos(oa) * dd - Math.sin(oa) * j, py + Math.sin(oa) * dd + Math.cos(oa) * j, (2.6 + i * 0.4) * (1 - k * 0.5), 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      const roll = since < FLIP ? PI * easeOut(since / FLIP) : 0;
      drawProbe(g, px, py, a + d * PI / 2 - d * PI * Math.exp(-since * 16), roll, t % 1.2 < 0.12, 1 + 0.28 * Math.exp(-since * 10));
      NB.draw.vignette(g, W, H, 0.45);
    },

    create(api) {
      const { W, H } = api;
      const CX = W / 2, CY = H / 2;
      let a, dir, spin, orbs, comets, t, score, dead, cometT, hist, pulse, flipT, pop, turn, dashOff, wreck;
      const pos = () => ({ x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R });

      function addOrb() { orbs.push({ ang: a + dir * rand(1.2, 4.6), born: t, seed: rand(0, TAU) }); }
      function addComet() {
        const from = rand(0, TAU), sx = CX + Math.cos(from) * 560, sy = CY + Math.sin(from) * 560;
        const ta = rand(0, TAU), tr = rand(0, R + 40), tx = CX + Math.cos(ta) * tr, ty = CY + Math.sin(ta) * tr;
        const d = Math.hypot(tx - sx, ty - sy) || 1, v = rand(210, 290) + score * 5;
        const ux = (tx - sx) / d, uy = (ty - sy) / d;
        const seg = clipSeg(sx, sy, ux, uy, W, H) || [d - 200, d + 200];
        comets.push({
          x: sx, y: sy, vx: ux * v, vy: uy * v, ux, uy, sp: v, warn: WARN, r: 9, life: 0,
          ex: sx + ux * seg[0], ey: sy + uy * seg[0], qx: sx + ux * seg[1], qy: sy + uy * seg[1],
          rot: rand(0, TAU), spin: rand(-2.5, 2.5), seed: rand(0, 50), fleck: 0, close: false, closed: false,
          verts: [0, 1, 2, 3, 4, 5, 6].map(() => rand(0.78, 1.12))
        });
      }

      function collect(o, ox, oy) {
        score++; api.score(score); pulse = 1;
        api.burst(ox, oy, { n: 10, speed: 230, life: 0.45, colors: [C.gold, C.cream, C.amber], shape: 'spark', blend: 'add', size: 2 });
        api.burst(ox, oy, { n: 7, speed: 130, life: 0.6, colors: [C.gold, C.amber], shape: 'shard', size: 2.8, spin: 14 });
        api.ring(ox, oy, { r0: 6, r1: 32, life: 0.35, color: C.gold, width: 2.5 });
        api.float(ox + Math.cos(o.ang) * 24, oy + Math.sin(o.ang) * 24 - 4, '+1', { color: C.gold, size: 20 });
        api.shake(1.5);
        api.sfx('pickup', 1 + (score % 8));
        addOrb();
        if (score % 10 === 0) {
          addOrb();
          api.sfx('level');
          api.float(CX, CY - PR - 40, 'EXTRA STARDUST', { color: C.cream, size: 22 });
          api.ring(CX, CY, { r0: PR + 6, r1: R + 24, life: 0.7, color: C.gold, width: 3 });
          api.burst(CX, CY, { n: 16, speed: 260, life: 0.7, colors: [C.gold, C.cream], shape: 'spark', blend: 'add', size: 2.2 });
          api.flash(C.gold, 0.1);
        }
        for (let i = orbs.length - (score % 10 === 0 ? 2 : 1); i < orbs.length; i++) {
          const n = orbs[i];
          api.ring(CX + Math.cos(n.ang) * R, CY + Math.sin(n.ang) * R, { r0: 2, r1: 18, life: 0.4, color: C.cream, width: 1.5 });
        }
      }

      function die(pp, c) {
        dead = true;
        const hd = a + dir * PI / 2 + turn, cu = Math.atan2(c.vy, c.vx), hc = Math.cos(hd), hs = Math.sin(hd);
        const piece = (k, dx, dy, sp) => {
          const ang = cu + rand(-1.2, 1.2);
          wreck.push({ k, x: pp.x + dx, y: pp.y + dy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, rot: hd, vr: rand(-9, 9) });
        };
        piece(0, 0, 0, rand(60, 110));
        piece(1, hs * 15.5, -hc * 15.5, rand(140, 220));
        piece(1, -hs * 15.5, hc * 15.5, rand(140, 220));
        piece(2, hc * 10, hs * 10, rand(160, 240));
        api.burst(pp.x, pp.y, { n: 26, speed: 340, life: 0.9, colors: [C.snow, C.ice, C.frost], shape: 'shard', size: 3.2, spin: 16 });
        api.burst(pp.x, pp.y, { n: 16, speed: 240, life: 0.8, colors: [C.blue, PANEL_EDGE], shape: 'square', size: 2.4, spin: 12 });
        api.burst(pp.x, pp.y, { n: 18, speed: 420, life: 0.5, colors: [C.gold, C.amber, C.cream], shape: 'spark', blend: 'add', size: 2 });
        api.ring(pp.x, pp.y, { r0: 8, r1: 96, life: 0.6, color: C.red, width: 5 });
        api.ring(pp.x, pp.y, { r0: 4, r1: 48, life: 0.4, color: C.cream, width: 3 });
        api.float(pp.x, pp.y - 34, 'SIGNAL LOST', { color: C.red, size: 26 });
        api.shake(16); api.flash(C.red, 0.32); api.sfx('explode');
        api.over(1.1);
      }

      return {
        reset() {
          a = -PI / 2; dir = 1; spin = 1.8; t = 0; score = 0; dead = false;
          cometT = 1.6; pulse = 0; flipT = 1; pop = 0; turn = 0; dashOff = 0;
          orbs = []; comets = []; hist = []; wreck = [];
          addOrb();
          api.score(0);
        },

        action() {
          if (dead) return;
          const pp = pos(), old = a + dir * PI / 2;
          turn += dir * PI;          // keep the drawn heading continuous, then spin it round
          dir *= -1;
          flipT = 0; pop = 1;
          api.burst(pp.x, pp.y, { n: 9, speed: 110, life: 0.4, colors: [C.snow, C.ice, C.frost], shape: 'dot', size: 2.6, drag: 6, dir: old, spread: 1.1 });
          api.burst(pp.x, pp.y, { n: 4, speed: 170, life: 0.25, colors: [C.cream], shape: 'spark', size: 1.6, dir: old, spread: 0.6 });
          api.ring(pp.x, pp.y, { r0: 5, r1: 22, life: 0.25, color: C.frost, width: 2 });
          api.sfx('whoosh');
        },

        update(dt) {
          t += dt;
          pulse = Math.max(0, pulse - dt * 3);
          flipT += dt;
          pop *= Math.exp(-dt * 10);
          turn *= Math.exp(-dt * 16);
          if (!dead) {
            spin = Math.min(3.3, 1.8 + score * 0.045);
            a += dir * spin * dt;
            dashOff -= dir * dt * 14;
          }
          const pp = pos();
          hist.unshift(a); if (hist.length > 14) hist.pop();

          if (!dead) {
            for (let i = orbs.length - 1; i >= 0; i--) {
              const o = orbs[i], ox = CX + Math.cos(o.ang) * R, oy = CY + Math.sin(o.ang) * R;
              if ((ox - pp.x) ** 2 + (oy - pp.y) ** 2 < 24 * 24) { orbs.splice(i, 1); collect(o, ox, oy); }
            }
            cometT -= dt;
            if (cometT <= 0) { addComet(); cometT = Math.max(0.5, 1.7 - score * 0.035) * rand(0.75, 1.25); }
          }

          for (let i = comets.length - 1; i >= 0; i--) {
            const c = comets[i];
            if (c.warn > 0) { c.warn -= dt; continue; }
            c.x += c.vx * dt; c.y += c.vy * dt; c.life += dt; c.rot += c.spin * dt;
            if (c.x > -20 && c.x < W + 20 && c.y > -20 && c.y < H + 20) {
              c.fleck -= dt;
              if (c.fleck <= 0) {
                c.fleck = 0.05;
                api.burst(c.x - c.ux * c.r, c.y - c.uy * c.r, { n: 1, speed: 40, life: 0.5, colors: [C.frost, C.snow], shape: 'square', size: 1.4, drag: 1.5, dir: Math.atan2(-c.uy, -c.ux), spread: 1.2, spin: 6 });
              }
            }
            if (!dead) {
              const d2 = (c.x - pp.x) ** 2 + (c.y - pp.y) ** 2;
              if (d2 < (c.r + 8) ** 2) die(pp, c);
              else if (d2 < 40 * 40) c.close = true;
              else if (c.close && !c.closed) {
                c.closed = true;
                api.float(pp.x, pp.y - 26, 'CLOSE', { color: C.frost, size: 16 });
                api.sfx('tick');
              }
            }
            if (c.life >= 6) comets.splice(i, 1);
          }

          for (const w of wreck) {
            const k = Math.exp(-dt * 1.5);
            w.vx *= k; w.vy *= k; w.x += w.vx * dt; w.y += w.vy * dt; w.rot += w.vr * dt;
          }
        },

        draw(g, tt) {
          g.globalAlpha = 1;
          const pp = pos(), pe = pulse * pulse;
          sky(g, W, H, tt, pp.x - CX, pp.y - CY);
          track(g, CX, CY, dashOff);
          drawPlanet(g, CX, CY, tt, 1 + 0.05 * pe);
          badge(g, CX, CY + PR + 24, score, 1 + 0.22 * pe);
          for (const o of orbs) drawMote(g, CX + Math.cos(o.ang) * R, CY + Math.sin(o.ang) * R, tt, backOut(clamp((t - o.born) * 3.5, 0, 1)), o.seed);
          for (const c of comets) if (c.warn > 0) drawWarn(g, c, W, H);
          for (const c of comets) if (c.warn <= 0) drawComet(g, c, tt);
          if (!dead) {
            drawTrail(g, CX, CY, hist);
            const roll = flipT < FLIP ? PI * easeOut(flipT / FLIP) : 0;
            drawProbe(g, pp.x, pp.y, a + dir * PI / 2 + turn, roll, tt % 1.2 < 0.12, 1 + 0.28 * pop);
          } else drawWreck(g, wreck);
          NB.draw.vignette(g, W, H, 0.45);
        }
      };
    }
  });
})();
