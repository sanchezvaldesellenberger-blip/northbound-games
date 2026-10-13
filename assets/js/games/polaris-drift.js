/* Polaris Drift: fly north through a falling asteroid field */
(function () {
  'use strict';
  const { TAU, clamp, rand, hash, rgba } = NB.util;
  const P = NB.pal;

  /* ---------- Look: flat illustration, light from the top-left ---------- */
  const LX = -0.6, LY = -0.8;                               // unit vector toward the light
  const INK = '#0a1426';                                     // outline ink
  const HULL = ['#f4f7fb', '#dfe9f5', '#c3d1e3', '#a3b4cb']; // snow, lit to shaded
  const GOLD_SHADE = '#d9962a';
  const ROCK = { lit: '#cdb9a6', face: '#ad9889', floor: '#9b867c', midLit: '#8f7b74', mid: '#6d5d66', dark: '#463c4f', rim: '#ecdfc9' };
  const ROCK_TONES = [ROCK.lit, ROCK.midLit, ROCK.mid];
  const STAR = ['#fff4cc', P.gold, '#e08a22'];
  const SMOKE = ['#33455e', '#283850', '#41536b'];
  const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

  function skyGrad(g, H) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#040c1c'); s.addColorStop(0.55, P.navy); s.addColorStop(1, '#0d2b47');
    return s;
  }

  /* ---------- Cached static art (built once, shared by the game and the preview) ---------- */
  const NEB = 400, NEB_T = 800;                 // nebula texture, drawn at 2x as an 800 unit tile
  const PR = 280, PPAD = 8;                     // planet radius
  const PL_W = PR * 2 + PPAD * 2, PL_H = PPAD + 200;
  const art = { tried: false, neb: null, planet: null };

  function makeCanvas(w, h) {
    try {
      if (typeof document === 'undefined' || !document.createElement) return null;
      const c = document.createElement('canvas');
      if (!c || !c.getContext) return null;
      c.width = w; c.height = h;
      return c.getContext('2d') ? c : null;
    } catch (e) { return null; }
  }

  function ensureArt() {
    if (art.tried) return;
    art.tried = true;
    const n = makeCanvas(NEB, NEB);
    if (n) { paintNebula(n.getContext('2d')); art.neb = n; }
    const p = makeCanvas(PL_W * 2, PL_H * 2);
    if (p) { const pg = p.getContext('2d'); pg.scale(2, 2); paintPlanet(pg, PL_W / 2, PR + PPAD); art.planet = p; }
  }

  function paintNebula(g) {
    const blobs = [
      [80, 90, 150, P.frost, 0.12], [300, 60, 120, P.blue, 0.09], [230, 240, 170, P.frost, 0.08],
      [60, 320, 130, P.pine, 0.55], [340, 300, 110, P.cream, 0.055], [160, 170, 90, P.blue, 0.07]
    ];
    for (const [x, y, r, c, a] of blobs) {
      for (let oy = -NEB; oy <= NEB; oy += NEB) {
        for (let ox = -NEB; ox <= NEB; ox += NEB) {
          const bx = x + ox, by = y + oy;
          if (bx + r < 0 || bx - r > NEB || by + r < 0 || by - r > NEB) continue;
          const gr = g.createRadialGradient(bx, by, 0, bx, by, r);
          gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.55, rgba(c, a * 0.45)); gr.addColorStop(1, rgba(c, 0));
          g.fillStyle = gr; g.fillRect(bx - r, by - r, r * 2, r * 2);
        }
      }
    }
    for (let i = 0; i < 140; i++) {           // faint dust: the farthest star layer
      g.globalAlpha = 0.12 + hash(i * 3.7) * 0.3;
      g.fillStyle = hash(i + 0.5) > 0.8 ? P.cream : P.ice;
      const s = 0.5 + hash(i * 1.9) * 0.6;
      g.fillRect(hash(i * 5.3) * NEB, hash(i * 7.1) * NEB, s, s);
    }
    g.globalAlpha = 1;
  }

  function paintPlanet(g, cx, cy) {
    g.save();
    g.beginPath(); g.arc(cx, cy, PR, 0, TAU); g.clip();
    g.save();
    g.translate(cx, cy); g.rotate(-0.28);
    const bands = ['#3c5b79', '#4a6b8a', '#33506c', '#5d7d99', '#40607f', '#71889c', '#38556f', '#53738f'];
    const E = PR + 40;
    let y = -E, i = 0;
    while (y < E) {
      const h = 12 + hash(i * 2.31 + 0.7) * 34;
      g.fillStyle = bands[i % bands.length];
      g.beginPath(); g.moveTo(-E, E);
      for (let x = -E; x <= E + 35; x += 35) g.lineTo(x, y + Math.sin(x * 0.017 + i * 1.9) * 3.5);
      g.lineTo(E + 35, E); g.closePath(); g.fill();
      y += h; i++;
    }
    g.fillStyle = '#2c455e'; g.beginPath(); g.ellipse(70, -190, 30, 10, 0, 0, TAU); g.fill();
    g.fillStyle = '#6f8aa2'; g.beginPath(); g.ellipse(64, -192, 15, 4.5, 0, 0, TAU); g.fill();
    g.restore();
    // Everything outside an offset circle: terminator shadow and the lit limb.
    const outside = (ox, oy, r, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.rect(cx - PR - 4, cy - PR - 4, PR * 2 + 8, PR * 2 + 8);
      g.arc(cx + ox, cy + oy, r, 0, TAU);
      g.fill('evenodd');
    };
    outside(-0.34 * PR, -0.3 * PR, 0.96 * PR, 'rgba(4,10,24,.24)');
    outside(-0.34 * PR, -0.3 * PR, 1.08 * PR, 'rgba(4,10,24,.42)');
    outside(5, 6, PR, rgba(P.cream, 0.26));
    outside(2, 2.5, PR, rgba(P.snow, 0.2));
    g.restore();
    g.strokeStyle = rgba(P.frost, 0.16); g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, PR + 1, 0, TAU); g.stroke();
  }

  function drawNebula(g, W, H, scroll) {
    const oy = ((scroll % NEB_T) + NEB_T) % NEB_T;
    for (let x = 0; x < W; x += NEB_T) {
      for (let y = oy - NEB_T; y < H; y += NEB_T) {
        if (art.neb) g.drawImage(art.neb, x, y, NEB_T, NEB_T);
        else { g.save(); g.translate(x, y); g.scale(2, 2); paintNebula(g); g.restore(); }
      }
    }
  }

  function drawPlanet(g, cx, cy) {
    if (art.planet) g.drawImage(art.planet, cx - PL_W / 2, cy - PR - PPAD, PL_W, PL_H);
    else paintPlanet(g, cx, cy);
  }

  /* ---------- Ship: ice fuselage, navy canopy, gold stripe, swept wings, twin engine pods ---------- */
  function hullPath(g) {
    g.beginPath();
    g.moveTo(0, -21);
    g.quadraticCurveTo(5.8, -13, 5.7, 0);
    g.lineTo(5.2, 10.5);
    g.quadraticCurveTo(4.6, 14.5, 2.4, 14.5);
    g.lineTo(-2.4, 14.5);
    g.quadraticCurveTo(-4.6, 14.5, -5.2, 10.5);
    g.lineTo(-5.7, 0);
    g.quadraticCurveTo(-5.8, -13, 0, -21);
    g.closePath();
  }
  function wingPath(g, s) {
    g.beginPath();
    g.moveTo(4 * s, -5);
    g.lineTo(18.5 * s, 9);
    g.quadraticCurveTo(19.8 * s, 12.4, 17.6 * s, 13.6);
    g.lineTo(5 * s, 11);
    g.closePath();
  }
  function wingBand(g, s) {
    g.beginPath();
    g.moveTo(12.4 * s, 3.1); g.lineTo(14.2 * s, 4.85); g.lineTo(14.2 * s, 12.9); g.lineTo(12.4 * s, 12.5);
    g.closePath();
  }
  const podPath = (g, s) => NB.draw.rr(g, 8 * s - 2.4, 2, 4.8, 13.5, 2.3);

  function tear(g, x, y, w, len, color) {
    if (len <= 0.5) return;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x - w, y);
    g.bezierCurveTo(x - w, y + len * 0.5, x - w * 0.3, y + len * 0.8, x, y + len);
    g.bezierCurveTo(x + w * 0.3, y + len * 0.8, x + w, y + len * 0.5, x + w, y);
    g.quadraticCurveTo(x, y - w * 0.9, x - w, y);
    g.fill();
  }

  // roll in [-1, 1] fakes banking: the ship narrows, the dorsal line slides and the wings change tone.
  function drawShip(g, x, y, roll, tc, scale, thrust, squash) {
    const ar = Math.abs(roll), spine = roll * 2.4;
    const shade = roll > 0.4 ? 1 : roll < -0.4 ? -1 : 0;
    const tone = (i) => HULL[clamp(i + shade, 0, 3)];
    g.save();
    g.translate(x, y); g.rotate(roll * 0.12);
    g.scale(scale * (1 - 0.3 * ar) * (1 + 0.12 * squash), scale * (1 - 0.1 * squash));

    NB.draw.glow(g, 0, 22, 24, P.amber, 0.18);
    for (let i = 0; i < 2; i++) {
      const fx = i ? 8 : -8;
      const fl = (12 + thrust * 8) * (0.84 + 0.12 * Math.sin(tc * 41 + i * 2.3) + 0.06 * Math.sin(tc * 73 + i * 5));
      tear(g, fx, 15.5, 2.9, fl, P.orange);
      tear(g, fx, 15.5, 2.0, fl * 0.68, P.gold);
      tear(g, fx, 15.5, 1.05, fl * 0.4, P.cream);
    }

    // Back to front, each part stroked then filled, so outlines also separate overlapping parts.
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = INK; g.lineWidth = 3;
    wingPath(g, -1); g.stroke(); wingPath(g, 1); g.stroke();
    g.fillStyle = tone(1); wingPath(g, -1); g.fill();
    g.fillStyle = tone(2); wingPath(g, 1); g.fill();
    g.strokeStyle = HULL[3]; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-5.2, 10.1); g.lineTo(-17.4, 12.6); g.moveTo(5.2, 10.1); g.lineTo(17.4, 12.6); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-4.8, -4); g.lineTo(-17.9, 8.6); g.stroke();
    g.fillStyle = P.gold; wingBand(g, -1); g.fill();
    g.fillStyle = GOLD_SHADE; wingBand(g, 1); g.fill();

    for (let s = -1; s <= 1; s += 2) {
      g.strokeStyle = INK; g.lineWidth = 2.6; podPath(g, s); g.stroke();
      g.fillStyle = tone(s < 0 ? 2 : 3); g.fill();
      g.fillStyle = tone(s < 0 ? 0 : 1); NB.draw.rr(g, 8 * s - 1.8, 2.6, 1.9, 10.4, 0.9); g.fill();
      g.fillStyle = '#2f4159'; NB.draw.rr(g, 8 * s - 2.1, 13.2, 4.2, 2.6, 1.1); g.fill();
      g.fillStyle = P.deep; NB.draw.rr(g, 8 * s - 1.6, 2.6, 3.2, 2.2, 1); g.fill();
    }

    g.strokeStyle = INK; g.lineWidth = 2.6; hullPath(g); g.stroke();
    g.fillStyle = HULL[2]; g.fill();
    g.save();
    hullPath(g); g.clip();
    g.fillStyle = HULL[0]; g.fillRect(-8, -24, 8 + spine, 40);
    g.fillStyle = P.gold; g.fillRect(-8, 3, 8 + spine, 3.4);
    g.fillStyle = GOLD_SHADE; g.fillRect(spine, 3, 8, 3.4);
    g.strokeStyle = 'rgba(10,20,38,.22)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-7, -3.5); g.lineTo(7, -3.5); g.moveTo(-7, 10); g.lineTo(7, 10); g.stroke();
    g.restore();

    g.fillStyle = P.deep;
    g.beginPath(); g.ellipse(spine * 0.7, -9, 2.9, 6.2, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(169,201,255,.9)';
    g.beginPath(); g.ellipse(spine * 0.7 - 1.1, -10.8, 0.9, 2.6, 0.2, 0, TAU); g.fill();
    g.restore();
  }

  function drawDebris(g, list) {
    for (const d of list) {
      g.save();
      g.translate(d.x, d.y); g.rotate(d.a);
      g.globalAlpha = clamp(d.life / 0.5, 0, 1);
      g.lineJoin = 'round'; g.lineWidth = 2.6; g.strokeStyle = INK;
      if (d.kind < 2) {
        const s = d.kind ? 1 : -1;
        g.translate(-11 * s, -5);
        wingPath(g, s); g.stroke(); g.fillStyle = HULL[1 + d.kind]; g.fill();
        wingBand(g, s); g.fillStyle = d.kind ? GOLD_SHADE : P.gold; g.fill();
      } else if (d.kind === 2) {
        g.translate(0, 12);
        g.beginPath(); g.moveTo(0, -21); g.quadraticCurveTo(5.8, -13, 5.7, -4); g.lineTo(-5.7, -4); g.quadraticCurveTo(-5.8, -13, 0, -21); g.closePath();
        g.stroke(); g.fillStyle = HULL[0]; g.fill();
        g.fillStyle = P.deep; g.beginPath(); g.ellipse(0, -10, 2.6, 5, 0, 0, TAU); g.fill();
      } else {
        NB.draw.rr(g, -2.4, -6.8, 4.8, 13.5, 2.3); g.stroke(); g.fillStyle = HULL[2]; g.fill();
      }
      g.restore();
    }
  }

  /* ---------- Asteroids: faceted rocks, bevels shaded by their world-space normal ---------- */
  function makeGeo(rnd) {
    const n = 7 + Math.floor(rnd() * 4);
    const ca = [], sa = [], rad = [], ins = [];
    for (let k = 0; k < n; k++) {
      const a = ((k + (rnd() - 0.5) * 0.55) / n) * TAU;
      ca.push(Math.cos(a)); sa.push(Math.sin(a));
      rad.push(0.8 + rnd() * 0.28);
      ins.push(0.44 + rnd() * 0.18);
    }
    const craters = [];
    const nc = 1 + Math.floor(rnd() * 2.7), a0 = rnd() * TAU;
    for (let i = 0; i < nc; i++) {           // one big crater near the middle, small ones spaced around it
      const a = a0 + i * 2.4, d = i ? 0.24 + rnd() * 0.05 : rnd() * 0.05;
      craters.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: i ? 0.05 + rnd() * 0.03 : 0.09 + rnd() * 0.04 });
    }
    return { n, ca, sa, rad, ins, cx: (rnd() - 0.5) * 0.18, cy: (rnd() - 0.5) * 0.18, craters };
  }
  const thumbGeos = [];
  function thumbGeo(i) {
    if (!thumbGeos[i]) { let k = 0; thumbGeos[i] = makeGeo(() => hash(i * 17.3 + (k++) * 3.71 + 0.5)); }
    return thumbGeos[i];
  }

  const RX = new Float64Array(16), RY = new Float64Array(16), IX = new Float64Array(16), IY = new Float64Array(16), RB = new Float64Array(16);
  const tier = (b) => (b > 0.5 ? 0 : b > 0.05 ? 1 : b > -0.45 ? 2 : 3);

  function drawRock(g, x, y, r, rot, wob, geo) {
    const c = Math.cos(rot), s = Math.sin(rot), q = 1 + 0.07 * Math.sin(wob), n = geo.n;
    const ccx = geo.cx * r, ccy = geo.cy * r;
    for (let k = 0; k < n; k++) {
      const lx = geo.ca[k] * geo.rad[k] * r * q, ly = geo.sa[k] * geo.rad[k] * r / q;
      RX[k] = x + lx * c - ly * s; RY[k] = y + lx * s + ly * c;
      const f = geo.ins[k], ix = ccx + (lx - ccx) * f, iy = ccy + (ly - ccy) * f;
      IX[k] = x + ix * c - iy * s; IY[k] = y + ix * s + iy * c;
    }
    for (let k = 0; k < n; k++) {
      const j = k + 1 === n ? 0 : k + 1, ex = RX[j] - RX[k], ey = RY[j] - RY[k];
      const len = Math.sqrt(ex * ex + ey * ey) || 1;
      RB[k] = (ey * LX - ex * LY) / len;
    }
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    for (let k = 0; k < n; k++) g.lineTo(RX[k], RY[k]);
    g.closePath();
    g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    g.fillStyle = ROCK.dark; g.fill();
    for (let tn = 0; tn < 3; tn++) {
      let any = false;
      g.beginPath();
      for (let k = 0; k < n; k++) {
        if (tier(RB[k]) !== tn) continue;
        const j = k + 1 === n ? 0 : k + 1;
        g.moveTo(RX[k], RY[k]); g.lineTo(RX[j], RY[j]); g.lineTo(IX[j], IY[j]); g.lineTo(IX[k], IY[k]); g.closePath();
        any = true;
      }
      if (any) { g.fillStyle = ROCK_TONES[tn]; g.fill(); }
    }
    g.beginPath();
    for (let k = 0; k < n; k++) g.lineTo(IX[k], IY[k]);
    g.closePath(); g.fillStyle = ROCK.face; g.fill();
    for (const cr of geo.craters) {
      const lx = cr.x * r, ly = cr.y * r, wx = x + lx * c - ly * s, wy = y + lx * s + ly * c, rr = cr.r * r;
      g.fillStyle = ROCK.mid; g.beginPath(); g.arc(wx, wy, rr, 0, TAU); g.fill();
      g.fillStyle = ROCK.floor; g.beginPath(); g.arc(wx + rr * 0.26, wy + rr * 0.3, rr * 0.74, 0, TAU); g.fill();
      g.strokeStyle = ROCK.rim; g.lineWidth = 1.1; g.beginPath(); g.arc(wx, wy, rr, -0.25, 1.85); g.stroke();
    }
    let rim = false;
    g.beginPath();
    for (let k = 0; k < n; k++) {
      if (RB[k] <= 0.62) continue;
      const j = k + 1 === n ? 0 : k + 1;
      g.moveTo(RX[k], RY[k]); g.lineTo(RX[j], RY[j]); rim = true;
    }
    if (rim) { g.strokeStyle = ROCK.rim; g.lineWidth = 1.4; g.stroke(); }
  }

  /* ---------- North star shard: the studio's 4-point star, faceted, spinning on its north axis ---------- */
  const SX = new Float64Array(8), SY = new Float64Array(8), SB = new Float64Array(8);
  function drawNorthStar(g, x, y, R, spin, tc, seed, halo) {
    const fx = Math.cos(spin), k = fx < 0 ? -1 : 1, sx = k * Math.max(0.22, Math.abs(fx));
    const rot = Math.sin(spin * 0.5) * 0.12, c = Math.cos(rot), s = Math.sin(rot);
    if (halo) {
      g.strokeStyle = rgba(P.gold, 0.3); g.lineWidth = 1.4;
      g.beginPath(); g.arc(x, y, R * 1.6 + Math.sin(tc * 4 + seed) * 1.6, 0, TAU); g.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? R * 0.34 : R;
      const lx = Math.cos(a) * rr * sx, ly = Math.sin(a) * rr;
      SX[i] = x + lx * c - ly * s; SY[i] = y + lx * s + ly * c;
    }
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) & 7, ex = SX[j] - SX[i], ey = SY[j] - SY[i], len = Math.sqrt(ex * ex + ey * ey) || 1;
      SB[i] = (k * (ey * LX - ex * LY)) / len;
    }
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < 8; i++) g.lineTo(SX[i], SY[i]);
    g.closePath();
    g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
    g.fillStyle = STAR[2]; g.fill();
    for (let tn = 0; tn < 2; tn++) {
      let any = false;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const b = SB[i];
        if ((b > 0.3 ? 0 : b > -0.3 ? 1 : 2) !== tn) continue;
        const j = (i + 1) & 7;
        g.moveTo(x, y); g.lineTo(SX[i], SY[i]); g.lineTo(SX[j], SY[j]); g.closePath();
        any = true;
      }
      if (any) { g.fillStyle = STAR[tn]; g.fill(); }
    }
    const tw = Math.pow(Math.max(0, Math.sin(tc * 2.6 + seed * 1.7)), 14);
    if (tw > 0.03) NB.draw.star4(g, SX[0], SY[0] + R * 0.1, R * 0.7 * tw, 0, P.snow);
  }

  /* ---------- HUD: chain pill with a draining timer bar ---------- */
  function drawPill(g, x, y, n, frac, a, pop, tc) {
    if (a < 0.02 || n < 2) return;
    const w = 120, h = 36, s = 1 + 0.16 * pop, f = clamp(frac, 0, 1);
    g.save();
    g.globalAlpha = a;
    g.translate(x, y + h / 2); g.scale(s, s); g.translate(0, -h / 2);
    NB.draw.rr(g, 0, 0, w, h, h / 2);
    g.fillStyle = 'rgba(6,16,36,.74)'; g.fill();
    g.strokeStyle = rgba(P.cream, 0.22); g.lineWidth = 1; g.stroke();
    drawNorthStar(g, 19, h / 2, 8.5, 0, tc, 0, false);
    NB.draw.text(g, 'CHAIN', 34, 17, { size: 11, color: P.frost, align: 'left', spacing: 2, weight: 500 });
    g.fillStyle = rgba(P.cream, 0.16); g.fillRect(34, 22, 40, 3);
    g.fillStyle = f > 0.3 ? P.gold : P.orange; g.fillRect(34, 22, 40 * f, 3);
    NB.draw.text(g, '×' + n, w - 14, 26, { size: 22, color: P.gold, align: 'right' });
    g.restore();
  }

  /* ---------- Attract-mode helpers (stateless) ---------- */
  function thumbShipX(t, W) {
    const A = Math.min(W * 0.22, 240);
    return W / 2 + Math.sin(t * 0.9) * A + Math.sin(t * 2.1 + 1) * A * 0.18;
  }
  function thumbShipV(t, W) {
    const A = Math.min(W * 0.22, 240);
    return Math.cos(t * 0.9) * 0.9 * A + Math.cos(t * 2.1 + 1) * 2.1 * A * 0.18;
  }
  function thumbStars(g, W, H, t, near) {
    const cfg = near ? [[0.42, 1.5, P.ice, 26], [0.9, 2.1, P.snow, 10]] : [[0.18, 1.1, P.frost, 60]];
    for (const [z, size, color, per] of cfg) {
      const n = Math.ceil((per * W) / 800);
      g.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const sd = i + z * 1000;
        g.globalAlpha = 0.35 + hash(sd * 4.1) * 0.5;
        g.fillRect(hash(sd * 1.31) * W, (hash(sd * 2.71) * H + t * 240 * z) % H, size, size);
      }
    }
    g.globalAlpha = 1;
    if (!near) {
      for (let i = 0; i < Math.ceil((3 * W) / 800); i++) {
        g.globalAlpha = 0.4 + 0.25 * Math.sin(t * 2 + i * 2.4);
        NB.draw.star4(g, hash(i * 8.3 + 1) * W, (hash(i * 6.1 + 2) * H + t * 20) % H, 3, 0, P.cream);
      }
      g.globalAlpha = 1;
    }
  }

  NB.register({
    id: 'polaris-drift',
    title: 'Polaris Drift',
    tags: ['Arcade', 'Action'],
    accent: P.blue,
    order: 1,
    blurb: 'Fly north through a falling asteroid field. Collect star shards back to back to build a chain multiplier, and skim past rocks for close-call points.',
    controls: [['Mouse / touch', 'Steer'], ['Arrows / WASD', 'Fly']],

    thumb(g, W, H, t) {
      ensureArt();
      g.fillStyle = skyGrad(g, H); g.fillRect(0, 0, W, H);
      drawNebula(g, W, H, t * 8);
      thumbStars(g, W, H, t, false);
      drawPlanet(g, W * 0.1 + Math.sin(t * 0.08) * 8, H + 135);
      thumbStars(g, W, H, t, true);

      const shipY = H * 0.72, n = Math.max(4, Math.round(W / 140));
      for (let i = 0; i < n; i++) {
        const r = 20 + hash(i * 3.3 + 1) * 22, v = 70 + hash(i * 5.1 + 2) * 80, span = H + r * 2 + 60;
        const p = hash(i * 7.7 + 3) * span + t * v, cyc = Math.floor(p / span), y = p - cyc * span - r - 30;
        // Pick a lane the weaving ship will not be in while this rock passes its height.
        const tx = t + (shipY - y) / v, half = (r + 34) / v;
        let x = 0, best = -1;
        for (let j = 0; j < 6; j++) {
          const cx = r + hash(i * 9.7 + cyc * 3.1 + j * 17.7) * Math.max(1, W - 2 * r);
          let m = 1e9;
          for (let s = -2; s <= 2; s++) m = Math.min(m, Math.abs(cx - thumbShipX(tx + s * half * 0.5, W)));
          if (m > best) { best = m; x = cx; }
          if (m > r + 46) break;
        }
        drawRock(g, x, y, r, t * (0.3 + hash(i + 4) * 0.7) * (i % 2 ? 1 : -1), t * 1.6 + i, thumbGeo(i % 12));
      }

      drawNorthStar(g, W * 0.64, ((t * 95 + 160) % (H + 60)) - 30, 15, t * 3.2, t, 1, true);

      const sx = thumbShipX(t, W), roll = clamp(thumbShipV(t, W) / 260, -1, 1);
      g.fillStyle = P.amber;
      for (let i = 0; i < 5; i++) {
        const px = thumbShipX(t - (i + 1) * 0.035, W), py = shipY + 38 + i * 10 + ((t * 140) % 10);
        g.globalAlpha = 0.5 * (1 - i / 5);
        g.fillRect(px - 12.5, py, 2.2, 2.2); g.fillRect(px + 10.3, py, 2.2, 2.2);
      }
      g.globalAlpha = 1;
      drawShip(g, sx, shipY + Math.sin(t * 2.2) * 4, roll, t, 1.5, 0.35 + 0.25 * Math.sin(t * 1.7), 0);
      NB.draw.vignette(g, W, H, 0.45);
    },

    create(api) {
      const { W, H } = api;
      let craft, rocks, shards, debris, stars, t, rockT, shardT, dist, bonus, combo, comboT;
      let dead, deathT, deathX, deathY, keyMode, side, pill;
      let sky = null, skyFor = null;
      const speedNow = () => 190 + Math.min(t, 90) * 6.5;
      // [count, zMin, zMax, alphaMin, alphaMax]: far, mid and near star layers
      const LAYERS = [[70, 0.12, 0.26, 0.3, 0.6], [38, 0.36, 0.56, 0.45, 0.8], [16, 0.8, 1.0, 0.6, 0.95]];
      const mkStars = ([n, z0, z1, a0, a1]) => Array.from({ length: n }, () => (
        { x: rand(0, W), y: rand(0, H), z: rand(z0, z1), a: rand(a0, a1), tw: rand(1.5, 4), ph: rand(0, TAU) }));

      function drawStars(g, list, size, color, stretch, shift, tc) {
        g.fillStyle = color;
        for (const s of list) {
          const x = (((s.x + shift * s.z) % W) + W) % W, len = stretch * s.z;
          g.globalAlpha = s.a * (0.78 + 0.22 * Math.sin(tc * s.tw + s.ph));
          g.fillRect(x - size / 2, s.y - len, size, size + len);
        }
        g.globalAlpha = 1;
      }

      function pickup(s) {
        const prev = combo;
        combo = Math.min(combo + 1, 8); comboT = 2.2;
        const pts = 25 * combo;
        bonus += pts;
        api.float(s.x, s.y - 16, '+' + pts, { color: P.gold, size: 19 + combo * 1.5 });
        api.burst(s.x, s.y, { n: 12, speed: 230, life: 0.45, colors: [P.gold, P.cream, STAR[0]], shape: 'spark', blend: 'add', size: 2 });
        api.burst(s.x, s.y, { n: 6, speed: 150, life: 0.6, colors: [P.gold, P.amber], shape: 'shard', size: 3, spin: 14 });
        api.ring(s.x, s.y, { r0: 8, r1: 28 + combo * 4, life: 0.35, color: P.gold, width: 2.5 });
        api.sfx('pickup', combo);
        craft.squash = 1; pill.pop = 1;
        if (combo === 8 && prev < 8) {
          api.float(craft.x, craft.y - 46, 'MAX CHAIN', { color: P.cream, size: 24 });
          api.ring(craft.x, craft.y, { r0: 16, r1: 96, life: 0.55, color: P.gold, width: 3 });
          api.flash(P.gold, 0.1); api.shake(4); api.sfx('level');
        } else if (combo > 1) api.shake(1.5);
      }

      function nearMiss(r, dx, dy, d) {
        r.paid = true;
        bonus += 5;
        const ux = dx / d, uy = dy / d;
        api.float(clamp(craft.x + (dx < 0 ? -34 : 34), 50, W - 50), craft.y - 22, 'CLOSE! +5', { color: P.mint, size: 15 });
        api.burst(craft.x + ux * 14, craft.y + uy * 14, { n: 7, speed: 170, life: 0.3, colors: [P.snow, P.mint], shape: 'spark', blend: 'add', size: 1.6, dir: Math.atan2(-uy, -ux), spread: 1.4 });
        api.sfx('whoosh'); api.shake(2);
      }

      function crash(r, dx, dy, d) {
        dead = true; deathT = 0; deathX = craft.x; deathY = craft.y;
        const cx = craft.x, cy = craft.y, ux = dx / d, uy = dy / d;
        api.burst(cx, cy, { n: 26, speed: 330, life: 1.0, colors: [P.snow, P.ice, HULL[2], P.gold], shape: 'shard', size: 3.6, spin: 16, drag: 1.6 });
        api.burst(cx, cy, { n: 26, speed: 460, life: 0.55, colors: [P.gold, P.amber, P.cream], shape: 'spark', blend: 'add', size: 2.2 });
        api.burst(cx, cy, { n: 12, speed: 80, life: 1.3, colors: SMOKE, shape: 'dot', size: 6, drag: 2.4 });
        api.burst(cx + ux * 10, cy + uy * 10, { n: 10, speed: 200, life: 0.7, colors: [ROCK.lit, ROCK.mid, ROCK.dark], shape: 'square', size: 2.6, dir: Math.atan2(uy, ux), spread: 2.2 });
        api.ring(cx, cy, { r0: 10, r1: 130, life: 0.6, color: P.cream, width: 5 });
        api.ring(cx, cy, { r0: 4, r1: 70, life: 0.4, color: P.orange, width: 3 });
        api.shake(18); api.flash(P.cream, 0.35); api.sfx('explode');
        for (let i = 0; i < 4; i++) {
          const a = -Math.PI / 2 + (i - 1.5) * 1.2 + rand(-0.3, 0.3), sp = rand(110, 210);
          debris.push({ x: cx, y: cy, vx: Math.cos(a) * sp + r.vx * 0.3, vy: Math.sin(a) * sp + r.vy * 0.2, a: 0, va: rand(-8, 8), kind: i, life: 1.5 });
        }
        api.over(1.0);
      }

      return {
        reset() {
          craft = { x: W / 2, y: H - 90, tx: W / 2, ty: H - 90, vx: 0, vy: 0, r: 11, roll: 0, thrust: 0, squash: 0 };
          rocks = []; shards = []; debris = [];
          t = 0; rockT = 0.6; shardT = 1.2; dist = 0; bonus = 0; combo = 0; comboT = 0;
          dead = false; deathT = 0; deathX = 0; deathY = 0; keyMode = false; side = 1;
          pill = { a: 0, n: 0, pop: 0 };
          stars = LAYERS.map(mkStars);
        },

        pointer(x, y, phase, type) {
          if (dead) return;
          keyMode = false;
          craft.tx = x;
          craft.ty = type === 'touch' ? y - 56 : y; // keep the craft visible above a fingertip
        },

        update(dt, inp) {
          t += dt;
          const speed = speedNow();
          if (!dead) {
            const ax = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
            const ay = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
            if (ax || ay) { keyMode = true; craft.tx = craft.x + ax * 42; craft.ty = craft.y + ay * 42; }
            else if (keyMode) { craft.tx = craft.x; craft.ty = craft.y; }
            craft.tx = clamp(craft.tx, 20, W - 20);
            craft.ty = clamp(craft.ty, 60, H - 30);
            const k = 1 - Math.exp(-dt * 11), idt = 1 / Math.max(dt, 1e-3);
            const nx = craft.x + (craft.tx - craft.x) * k, ny = craft.y + (craft.ty - craft.y) * k;
            craft.vx = (nx - craft.x) * idt; craft.vy = (ny - craft.y) * idt;
            craft.x = nx; craft.y = ny;
            const kr = 1 - Math.exp(-dt * 10);
            craft.roll += (clamp(craft.vx / 420, -1, 1) - craft.roll) * kr;
            craft.thrust += (clamp(-craft.vy / 300, -0.6, 1) - craft.thrust) * kr;
            side = -side;
            api.burst(craft.x + side * 8 * (1 - 0.3 * Math.abs(craft.roll)), craft.y + 24, {
              n: 1, speed: 120 + speed * 0.25, dir: Math.PI / 2, spread: 0.4, life: 0.26, colors: [P.amber, P.gold, P.orange], size: 1.8, drag: 3
            });
            dist += speed * dt;

            rockT -= dt;
            if (rockT <= 0) {
              const r = rand(14, 38);
              rocks.push({
                x: rand(r, W - r), y: -r - 10, r, vx: rand(-35, 35), vy: speed * rand(0.75, 1.25), a: rand(0, TAU), va: rand(-1.5, 1.5),
                wob: rand(0, TAU), vw: rand(1, 2.5), geo: makeGeo(Math.random), close: false, paid: false, minGap: 1e9
              });
              rockT = Math.max(0.16, 0.75 - t * 0.012) * rand(0.6, 1.3);
            }
            shardT -= dt;
            if (shardT <= 0) { shards.push({ x: rand(30, W - 30), y: -20, vy: speed * 0.8, a: rand(0, TAU), seed: rand(0, 100) }); shardT = rand(0.7, 1.6); }
          } else deathT += dt;

          for (const s of stars) for (const st of s) { st.y += speed * st.z * dt * 0.55; if (st.y > H) { st.y -= H; st.x = rand(0, W); } }
          let w = 0;
          for (let i = 0; i < rocks.length; i++) {
            const r = rocks[i];
            r.x += r.vx * dt; r.y += r.vy * dt; r.a += r.va * dt; r.wob += r.vw * dt;
            if (r.y < H + 60) rocks[w++] = r;
          }
          rocks.length = w;
          w = 0;
          for (let i = 0; i < shards.length; i++) {
            const s = shards[i];
            s.y += s.vy * dt; s.a += dt * 3.2;
            if (s.y < H + 30) shards[w++] = s;
          }
          shards.length = w;
          for (let i = debris.length - 1; i >= 0; i--) {
            const d = debris[i];
            d.life -= dt;
            if (d.life <= 0) { debris.splice(i, 1); continue; }
            const kd = Math.exp(-dt * 1.4);
            d.vx *= kd; d.vy *= kd; d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt;
            if (Math.random() < 0.35) api.burst(d.x, d.y, { n: 1, speed: 20, life: 0.5, colors: SMOKE, size: 2.6, drag: 1 });
          }
          if (comboT > 0) { comboT -= dt; if (comboT <= 0) { comboT = 0; combo = 0; } }
          if (combo > 1) pill.n = combo;
          pill.a += ((combo > 1 ? 1 : 0) - pill.a) * (1 - Math.exp(-dt * 12));
          pill.pop *= Math.exp(-dt * 9);
          craft.squash *= Math.exp(-dt * 8);
          if (dead) return;

          for (let i = shards.length - 1; i >= 0; i--) {
            const s = shards[i], dx = s.x - craft.x, dy = s.y - craft.y;
            if (dx * dx + dy * dy < 26 * 26) { pickup(s); shards.splice(i, 1); }
          }

          for (const r of rocks) {
            const dx = r.x - craft.x, dy = r.y - craft.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-3;
            const gap = d - (r.r * 0.82 + craft.r * 0.7);
            if (gap < 0) { crash(r, dx, dy, d); break; }
            if (gap < 18) { r.close = true; if (gap < r.minGap) r.minGap = gap; }
            else if (r.close && !r.paid && gap > r.minGap + 6) nearMiss(r, dx, dy, d);
          }
          api.score(Math.floor(dist / 25) + bonus);
        },

        draw(g, clock) {
          const tc = typeof clock === 'number' && Number.isFinite(clock) ? clock : t;
          ensureArt();
          if (skyFor !== g) { sky = skyGrad(g, H); skyFor = g; }
          g.fillStyle = sky; g.fillRect(-40, -40, W + 80, H + 80);
          drawNebula(g, W, H, dist * 0.015);

          const shift = -(craft.x - W / 2) * 0.05;
          const stretch = (Math.max(0, speedNow() - 430) / 345) * 14;
          drawStars(g, stars[0], 1.1, P.frost, stretch, shift, tc);
          for (let i = 0; i < 5; i++) {
            const s = stars[0][i], x = (((s.x + shift * s.z) % W) + W) % W;
            g.globalAlpha = 0.4 + 0.25 * Math.sin(tc * s.tw + s.ph);
            NB.draw.star4(g, x, s.y, 3, 0, P.cream);
          }
          g.globalAlpha = 1;
          drawPlanet(g, W * 0.1 + shift * 0.4 + Math.sin(t * 0.05) * 12, H + 150 + 60 * (1 - Math.exp(-t / 90)));
          drawStars(g, stars[1], 1.5, P.ice, stretch, shift, tc);
          drawStars(g, stars[2], 2.1, P.snow, stretch, shift, tc);

          for (const r of rocks) drawRock(g, r.x, r.y, r.r, r.a, r.wob, r.geo);
          for (const s of shards) drawNorthStar(g, s.x, s.y + Math.sin(tc * 3 + s.seed) * 2, 12, s.a, tc, s.seed, true);

          if (!dead) {
            drawShip(g, craft.x, craft.y + Math.sin(tc * 2.6) * 1.2, craft.roll, tc, 1.1, craft.thrust, craft.squash);
          } else {
            drawDebris(g, debris);
            if (deathT < 0.24) {
              const k = deathT / 0.24, R = 10 + 38 * ease(k);
              g.globalAlpha = 1 - k * k;
              g.fillStyle = P.orange; g.beginPath(); g.arc(deathX, deathY, R, 0, TAU); g.fill();
              g.fillStyle = P.gold; g.beginPath(); g.arc(deathX - R * 0.08, deathY - R * 0.1, R * 0.7, 0, TAU); g.fill();
              g.fillStyle = P.cream; g.beginPath(); g.arc(deathX - R * 0.12, deathY - R * 0.14, R * 0.4 * (1 - k * 0.6), 0, TAU); g.fill();
              g.globalAlpha = 1;
            }
          }

          NB.draw.vignette(g, W, H, 0.5);
          drawPill(g, 14, 14, pill.n, comboT / 2.2, pill.a, pill.pop, tc);
        }
      };
    }
  });
})();
