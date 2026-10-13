/* Northbound Games: shared core (namespace, storage, math, drawing helpers, audio) */
(function () {
  'use strict';
  const NB = (window.NB = window.NB || {});

  /* ---------- Game registry ---------- */
  NB.games = [];
  NB.register = (def) => { NB.games.push(def); };

  /* ---------- Storage (fails quietly in private windows) ---------- */
  NB.store = {
    get(key, fallback) {
      try { const raw = localStorage.getItem('nb.' + key); return raw === null ? fallback : JSON.parse(raw); }
      catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem('nb.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ } },
    remove(key) { try { localStorage.removeItem('nb.' + key); } catch (e) { /* ignore */ } }
  };

  /* ---------- Math ---------- */
  const TAU = Math.PI * 2;
  NB.util = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a)),
    hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); },
    rgba(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    },
    fmt: (n) => Number(n || 0).toLocaleString('en-US'),
    reducedMotion: () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)
  };

  /* ---------- Studio palette (shared by the site and every game) ---------- */
  NB.pal = {
    navy: '#082542', deep: '#0b1d32', ink: '#061024', panel: '#142b45', cream: '#f4eedb',
    ice: '#dfe9f5', snow: '#f4f7fb', frost: '#a9c9ff', blue: '#699cff', sq: '#1467ff',
    gold: '#ffc93c', amber: '#ff9f2e', orange: '#ff7a3d', red: '#ff5a5f', pine: '#1d3a4a', mint: '#5ee6b0',
    /* poster palette used by the site */
    paper: '#f2ead7', poster: '#1b2a4a', coral: '#ff6b4a', mustard: '#f5b83d', teal: '#2a9d8f', night: '#13192b'
  };

  /* ---------- Season ----------
     Winter art (snow, ice, frozen scenes) is used only in December. The rest of the year games use their
     default art. Override for testing with ?season=winter or ?season=default in the page URL.
     Games read NB.winter inside create() / thumb(), not when the file loads. */
  NB.season = (function () {
    try {
      const q = new URLSearchParams((window.location && window.location.search) || '').get('season');
      if (q === 'winter' || q === 'default') return q;
    } catch (e) { /* no URL in this environment */ }
    return new Date().getMonth() === 11 ? 'winter' : 'default';
  })();
  NB.winter = NB.season === 'winter';

  /* Canvas font in the studio display face (loaded with the page), with condensed fallbacks. */
  NB.font = (px, weight = 700) => `${weight} ${px}px "Big Shoulders Display", Oswald, "Arial Narrow", sans-serif`;

  /* ---------- Canvas helpers ---------- */
  NB.draw = {
    /* Display text with an optional dark outline, so it reads on any background. */
    text(g, str, x, y, { size = 20, color = '#ffffff', align = 'center', baseline = 'alphabetic', outline = 0, outlineColor = 'rgba(6,16,36,.9)', alpha = 1, spacing = 0, weight = 700 } = {}) {
      g.save();
      g.globalAlpha *= alpha;
      g.font = NB.font(size, weight);
      g.textAlign = align; g.textBaseline = baseline;
      if ('letterSpacing' in g) g.letterSpacing = spacing + 'px';
      if (outline) { g.lineJoin = 'round'; g.lineWidth = outline; g.strokeStyle = outlineColor; g.strokeText(str, x, y); }
      g.fillStyle = color; g.fillText(str, x, y);
      g.restore();
    },
    vignette(g, W, H, a = 0.45) {
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(3,8,20,0)'); v.addColorStop(1, `rgba(3,8,20,${a})`);
      g.fillStyle = v; g.fillRect(-40, -40, W + 80, H + 80);
    },
    rr(g, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    },
    glow(g, x, y, r, hex, alpha = 1) {
      if (r <= 0) return;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, NB.util.rgba(hex, alpha));
      gr.addColorStop(1, NB.util.rgba(hex, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    },
    star4(g, x, y, r, rot, color, glow) {
      g.save();
      g.translate(x, y); g.rotate(rot || 0);
      if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
      g.fillStyle = color;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.3 : r;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
      g.restore();
    }
  };

  /* ---------- Audio: tiny WebAudio synth, no sound files ---------- */
  const audio = {
    ctx: null, out: null, noiseBuf: null,
    muted: !!NB.store.get('muted', false),

    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { this.ctx = new AC(); } catch (e) { return; }
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.out = this.ctx.createGain();
        this.out.gain.value = this.muted ? 0 : 0.7;
        this.out.connect(comp); comp.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },

    setMuted(m) {
      this.muted = !!m;
      NB.store.set('muted', this.muted);
      if (this.out) this.out.gain.value = this.muted ? 0 : 0.7;
      document.dispatchEvent(new CustomEvent('nb:mute'));
    },

    tone(f, { type = 'sine', dur = 0.15, vol = 0.1, at = 0, slide = 0 } = {}) {
      const c = this.ctx, t0 = c.currentTime + at;
      const o = c.createOscillator(), gn = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(this.out);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },

    noise({ dur = 0.2, vol = 0.1, freq = 2000, type = 'lowpass', q = 0.7, at = 0 } = {}) {
      const c = this.ctx, t0 = c.currentTime + at;
      if (!this.noiseBuf) {
        const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = b;
      }
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(freq, t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.15), t0 + dur);
      const gn = c.createGain();
      gn.gain.setValueAtTime(vol, t0);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(gn); gn.connect(this.out);
      s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
    },

    sfx(name, v) {
      if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
      const T = (f, o) => this.tone(f, o), N = (o) => this.noise(o);
      const arp = (notes, o, gap) => notes.forEach((f, i) => T(f, Object.assign({}, o, { at: i * gap })));
      switch (name) {
        case 'ui': T(1200, { type: 'triangle', dur: 0.05, vol: 0.05 }); break;
        case 'start': arp([523.25, 659.25, 783.99, 1046.5], { type: 'triangle', dur: 0.14, vol: 0.09 }, 0.055); break;
        case 'pickup': {
          const f = 880 * Math.pow(2, ((v || 1) - 1) * 2 / 12);
          T(f, { type: 'triangle', dur: 0.1, vol: 0.1 }); T(f * 1.5, { dur: 0.16, vol: 0.07, at: 0.05 }); break;
        }
        case 'perfect': {
          const f = 660 * Math.pow(2, Math.min(v || 1, 12) / 12);
          T(f, { type: 'triangle', dur: 0.12, vol: 0.1 }); T(f * 1.26, { dur: 0.12, vol: 0.08, at: 0.06 }); T(f * 1.5, { dur: 0.25, vol: 0.08, at: 0.12 }); break;
        }
        case 'place': T(220 + Math.min(v || 0, 40) * 8, { type: 'triangle', dur: 0.09, vol: 0.12, slide: 0.6 }); N({ dur: 0.05, vol: 0.06, freq: 2500 }); break;
        case 'bounce': T(420, { dur: 0.07, vol: v ? 0.05 + v * 0.12 : 0.1, slide: 0.8 }); break;
        case 'tick': T(300, { dur: 0.04, vol: 0.04 }); break;
        case 'brick': {
          const f = 520 * Math.pow(2, Math.min(v || 0, 14) / 12);
          T(f, { type: 'square', dur: 0.06, vol: 0.045 }); N({ dur: 0.12, vol: 0.12, freq: 4000 }); break;
        }
        case 'chip': T(900, { type: 'triangle', dur: 0.04, vol: 0.06 }); break;
        case 'jump': T(v === 2 ? 520 : 340, { dur: 0.14, vol: 0.09, slide: 1.9 }); break;
        case 'whoosh': N({ dur: 0.18, vol: 0.12, freq: 3200, q: 2, type: 'bandpass' }); T(500, { dur: 0.12, vol: 0.05, slide: 1.5 }); break;
        case 'note': T(v, { dur: 0.6, vol: 0.18 }); T(v * 2, { type: 'triangle', dur: 0.25, vol: 0.04 }); break;
        case 'wrong': T(180, { type: 'sawtooth', dur: 0.35, vol: 0.07, slide: 0.6 }); T(190, { type: 'sawtooth', dur: 0.35, vol: 0.05, slide: 0.6 }); break;
        case 'lose': T(330, { type: 'triangle', dur: 0.32, vol: 0.12, slide: 0.45 }); break;
        case 'explode': N({ dur: 0.7, vol: 0.35, freq: 1600 }); T(140, { type: 'sawtooth', dur: 0.5, vol: 0.08, slide: 0.3 }); break;
        case 'level': arp([659.25, 783.99, 987.77, 1318.5], { type: 'triangle', dur: 0.18, vol: 0.08 }, 0.07); break;
        case 'over': arp([523.25, 392, 329.63, 261.63], { type: 'triangle', dur: 0.2, vol: 0.08 }, 0.09); break;
        case 'achieve': arp([783.99, 987.77, 1174.66, 1567.98], { dur: 0.35, vol: 0.08 }, 0.08); break;
      }
    }
  };
  NB.audio = audio;
})();
