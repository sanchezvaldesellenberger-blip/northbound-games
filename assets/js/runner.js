/* Northbound Games: the game player.
   Owns the loop, input, scaling, shared "juice" (particles, rings, score pops, shake, flash),
   the READY/GO intro, slow motion on game over, overlays, pause/restart and per-game high scores.
   Games only implement:
     create(api) -> { reset(), update(dt, input), draw(g, t),
                      action?(), release?(), tap?(x, y), pointer?(x, y, phase, type), key?(code), keyup?(code) } */
(function () {
  "use strict";
  const NB = window.NB;
  const { TAU, clamp, fmt } = NB.util;
  const $ = (id) => document.getElementById(id);

  const dlg = $("player");
  if (!dlg) return;
  const stage = $("pl-stage"),
    screen = $("pl-screen"),
    canvas = $("pl-canvas");
  const g = canvas.getContext("2d");
  const ui = {
    tag: $("pl-tag"),
    title: $("pl-title"),
    score: $("pl-score"),
    best: $("pl-best"),
    overlay: $("pl-overlay"),
    kicker: $("ov-kicker"),
    ovTitle: $("ov-title"),
    body: $("ov-body"),
    go: $("ov-go"),
    exit: $("ov-exit"),
    controls: $("ov-controls"),
    pause: $("pl-pause"),
    restart: $("pl-restart"),
    fs: $("pl-fs"),
    close: $("pl-close"),
  };

  const INTRO = 1.0; // seconds of READY / GO before play
  const SLOWMO = 0.35; // world speed while a run is ending
  let def = null,
    inst = null,
    state = "idle",
    raf = 0,
    last = 0,
    clock = 0,
    endTimer = 0,
    introT = 0;
  let W = 800,
    H = 500,
    scale = 1,
    dpr = 1,
    score = 0,
    bumpAt = 0;
  let runTime = 0;
  const RM = NB.util.reducedMotion();

  const keys = new Set();
  const input = {
    keys,
    get left() {
      return keys.has("ArrowLeft") || keys.has("KeyA");
    },
    get right() {
      return keys.has("ArrowRight") || keys.has("KeyD");
    },
    get up() {
      return keys.has("ArrowUp") || keys.has("KeyW");
    },
    get down() {
      return keys.has("ArrowDown") || keys.has("KeyS");
    },
    pointer: { x: 0, y: 0, down: false, type: "mouse" },
  };

  /* ---------- Juice ---------- */
  const parts = [],
    floats = [],
    rings = [];
  let shake = 0,
    flashA = 0,
    flashC = "#ffffff";

  const bests = NB.store.get("best", {});
  NB.bests = bests;

  const api = {
    get W() {
      return W;
    },
    get H() {
      return H;
    },
    get t() {
      return clock;
    },
    score(n) {
      if (n > score && clock - bumpAt > 0.08) {
        bumpAt = clock;
        ui.score.classList.remove("bump");
        void ui.score.offsetWidth;
        ui.score.classList.add("bump");
      }
      score = n;
      ui.score.textContent = fmt(n);
    },
    over(delay = 0.9) {
      if (state !== "playing") return;
      state = "ending";
      endTimer = delay;
    },
    /* Particles. shape: 'dot' | 'square' | 'shard' | 'spark'; blend: 'normal' | 'add'; colors: pick one per particle. */
    burst(x, y, o = {}) {
      const n = o.n == null ? 14 : o.n,
        sp = o.speed == null ? 160 : o.speed,
        life = o.life || 0.6;
      const spread = o.spread == null ? TAU : o.spread,
        spin = o.spin == null ? 10 : o.spin;
      for (let i = 0; i < n; i++) {
        const a =
          o.dir == null
            ? Math.random() * TAU
            : o.dir + (Math.random() - 0.5) * spread;
        const s = sp * (0.35 + Math.random() * 0.65),
          l = life * (0.6 + Math.random() * 0.4);
        parts.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: l,
          max: l,
          color: o.colors
            ? o.colors[(Math.random() * o.colors.length) | 0]
            : o.color || "#ffffff",
          size: (o.size || 2.5) * (0.7 + Math.random() * 0.6),
          grav: o.grav || 0,
          drag: o.drag == null ? 2.2 : o.drag,
          shape: o.shape || "dot",
          add: o.blend === "add",
          rot: Math.random() * TAU,
          vr: (Math.random() - 0.5) * spin,
        });
      }
      if (parts.length > 1000) parts.splice(0, parts.length - 1000);
    },
    /* Expanding shockwave ring. */
    ring(x, y, o = {}) {
      rings.push({
        x,
        y,
        r0: o.r0 || 6,
        r1: o.r1 || 60,
        life: o.life || 0.45,
        max: o.life || 0.45,
        color: o.color || "#ffffff",
        width: o.width || 3,
      });
    },
    /* Score pop: outlined display text that springs in and rises. Third arg may be a color or { color, size }. */
    float(x, y, text, o) {
      const opts = typeof o === "string" ? { color: o } : o || {};
      floats.push({
        x,
        y,
        text,
        color: opts.color || "#ffffff",
        size: opts.size || 22,
        age: 0,
        life: opts.life || 0.9,
      });
    },
    shake(m) {
      shake = Math.max(shake, RM ? m * 0.25 : m);
    },
    flash(c, a = 0.3) {
      flashC = c;
      flashA = Math.max(flashA, a);
    },
    sfx(name, v) {
      NB.audio.sfx(name, v);
    },
  };

  function stepFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].life -= dt;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.age += dt;
      f.y -= 34 * dt;
      if (f.age >= f.life) floats.splice(i, 1);
    }
    shake *= Math.exp(-dt * 9);
    if (shake < 0.2) shake = 0;
    flashA *= Math.exp(-dt * 7);
  }

  function drawParticle(p) {
    const a = p.life / p.max,
      s = p.size * (0.45 + 0.55 * a);
    g.globalAlpha = Math.min(1, a * 1.4);
    g.fillStyle = p.color;
    if (p.shape === "dot") {
      g.beginPath();
      g.arc(p.x, p.y, s, 0, TAU);
      g.fill();
      return;
    }
    if (p.shape === "spark") {
      g.strokeStyle = p.color;
      g.lineWidth = Math.max(1, s * 0.6);
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      g.stroke();
      return;
    }
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    if (p.shape === "square") g.fillRect(-s, -s, s * 2, s * 2);
    else {
      g.beginPath();
      g.moveTo(0, -s * 1.6);
      g.lineTo(s * 0.7, 0);
      g.lineTo(0, s * 1.6);
      g.lineTo(-s * 0.7, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  function drawFx() {
    g.save();
    for (const p of parts) if (!p.add) drawParticle(p);
    g.globalCompositeOperation = "lighter";
    for (const p of parts) if (p.add) drawParticle(p);
    g.globalCompositeOperation = "source-over";
    for (const r of rings) {
      const k = 1 - r.life / r.max,
        e = 1 - Math.pow(1 - k, 3);
      g.globalAlpha = (1 - k) * 0.9;
      g.strokeStyle = r.color;
      g.lineWidth = r.width * (1 - k * 0.6);
      g.beginPath();
      g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (const f of floats) {
      const pop =
        f.age < 0.12
          ? 0.6 + (f.age / 0.12) * 0.55
          : Math.max(1, 1.15 - (f.age - 0.12) * 1.5);
      const alpha = clamp((f.life - f.age) / 0.3, 0, 1);
      g.save();
      g.translate(f.x, f.y);
      g.scale(pop, pop);
      NB.draw.text(g, f.text, 0, 0, {
        size: f.size,
        color: f.color,
        outline: 5,
        alpha,
      });
      g.restore();
    }
    g.restore();
  }

  function drawIntro() {
    const t = introT,
      go = t > INTRO * 0.55;
    const local = go ? (t - INTRO * 0.55) / (INTRO * 0.45) : t / (INTRO * 0.55);
    const ease = 1 - Math.pow(1 - clamp(local * 2.2, 0, 1), 3);
    const fade = go ? clamp((1 - local) * 2.5, 0, 1) : 1;
    g.save();
    g.globalAlpha = 0.55 * fade;
    g.fillStyle = "#061024";
    g.fillRect(0, H / 2 - 46 * ease, W, 92 * ease);
    g.globalAlpha = 1;
    g.translate(W / 2, H / 2 + 22);
    const s = go ? 1 + (1 - ease) * 0.6 : 0.85 + ease * 0.15;
    g.scale(s, s);
    NB.draw.text(g, go ? "GO!" : "READY", 0, 0, {
      size: 64,
      color: go ? NB.pal.gold : "#ffffff",
      outline: 8,
      alpha: fade,
      spacing: go ? 2 : 6,
    });
    g.restore();
  }

  /* ---------- Layout ---------- */
  function fit() {
    if (!def) return;
    const cs = getComputedStyle(stage);
    const aw =
      stage.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight);
    const ah =
      stage.clientHeight -
      parseFloat(cs.paddingTop) -
      parseFloat(cs.paddingBottom);
    const s = Math.max(0.1, Math.min(aw / W, ah / H));
    const cw = Math.floor(W * s),
      ch = Math.floor(H * s);
    screen.style.width = cw + "px";
    screen.style.height = ch + "px";
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    scale = cw / W;
    if (inst) render();
  }
  new ResizeObserver(fit).observe(stage);

  /* ---------- Game controller ----------
     D-pad or left stick act as the arrow keys, A is the main action (Space), Start pauses. */
  let pad = {};
  function pollGamepad() {
    if (!navigator.getGamepads) return;
    const gp = [...navigator.getGamepads()].find(Boolean);
    if (!gp) return;
    const b = (n) => !!(gp.buttons[n] && gp.buttons[n].pressed);
    const ax = gp.axes[0] || 0,
      ay = gp.axes[1] || 0;
    const now = {
      ArrowLeft: b(14) || ax < -0.45,
      ArrowRight: b(15) || ax > 0.45,
      ArrowUp: b(12) || ay < -0.45,
      ArrowDown: b(13) || ay > 0.45,
      a: b(0),
      start: b(9),
    };
    if (now.start && !pad.start) {
      state === "paused" ? resume() : pause();
    }
    if (now.a && !pad.a) {
      NB.audio.ensure();
      if (state === "ready" || state === "over") begin();
      else if (state === "paused") resume();
      else if (state === "playing") {
        keys.add("Space");
        if (inst.action) inst.action();
      }
    }
    if (!now.a && pad.a) {
      keys.delete("Space");
      if (state === "playing" && inst.release) inst.release();
    }
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].forEach((k) => {
      if (now[k] && !pad[k]) {
        keys.add(k);
        if (state === "playing" && inst.key) inst.key(k);
      }
      if (!now[k] && pad[k]) {
        keys.delete(k);
        if (state === "playing" && inst.keyup) inst.keyup(k);
      }
    });
    pad = now;
  }

  /* ---------- Loop ---------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    pollGamepad();
    if (state === "paused") {
      render();
      return;
    }
    clock += dt;
    if (state === "intro") {
      introT += dt;
      if (introT >= INTRO) {
        state = "playing";
        canvas.focus({ preventScroll: true });
      }
      stepFx(dt);
    } else if (state === "playing") {
      runTime += dt;
      inst.update(dt, input);
      stepFx(dt);
    } else if (state === "ending") {
      runTime += dt;
      inst.update(dt * SLOWMO, input);
      stepFx(dt * 0.6);
      endTimer -= dt;
      if (endTimer <= 0) finish();
    } else stepFx(dt);
    render();
  }

  function render() {
    const k = dpr * scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.shadowBlur = 0;
    const sx = shake ? (Math.random() - 0.5) * 2 * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * 2 * shake : 0;
    g.setTransform(k, 0, 0, k, sx * k, sy * k);
    inst.draw(g, clock);
    drawFx();
    g.setTransform(k, 0, 0, k, 0, 0);
    if (state === "intro") drawIntro();
    if (flashA > 0.01) {
      g.globalAlpha = flashA;
      g.fillStyle = flashC;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }

  /* ---------- Overlays ---------- */
  function showOverlay(kind, info) {
    ui.overlay.hidden = false;
    ui.overlay.dataset.kind = kind;
    ui.exit.hidden = kind !== "over";
    ui.controls.hidden = kind === "over";
    if (kind === "ready") {
      ui.kicker.textContent = def.tags.join(" · ");
      ui.ovTitle.textContent = def.title;
      ui.body.textContent = def.blurb;
      ui.go.textContent = "Play";
    } else if (kind === "paused") {
      ui.kicker.textContent = "Paused";
      ui.ovTitle.textContent = def.title;
      ui.body.textContent = "Your run is waiting right where you left it.";
      ui.go.textContent = "Resume";
    } else {
      ui.kicker.textContent = info.isBest
        ? "New personal best"
        : "Run complete";
      ui.ovTitle.textContent = fmt(score);
      ui.body.textContent = info.isBest
        ? info.prev
          ? `Previous best: ${fmt(info.prev)}.`
          : "Your first score is on the board."
        : `Your best is ${fmt(info.best)}.`;
      ui.go.textContent = "Play again";
    }
    setPauseIcon();
    requestAnimationFrame(() => ui.go.focus({ preventScroll: true }));
  }
  function hideOverlay() {
    ui.overlay.hidden = true;
    ui.overlay.dataset.kind = "";
  }

  function setPauseIcon() {
    const paused = state === "paused";
    ui.pause
      .querySelector("use")
      .setAttribute("href", paused ? "#i-play" : "#i-pause");
    ui.pause.setAttribute("aria-label", paused ? "Resume (P)" : "Pause (P)");
  }

  /* ---------- State changes ---------- */
  function clearFx() {
    parts.length = 0;
    floats.length = 0;
    rings.length = 0;
    shake = 0;
    flashA = 0;
  }

  function open(id) {
    const d = NB.games.find((x) => x.id === id);
    if (!d) return;
    def = d;
    [W, H] = d.size || [800, 500];
    clearFx();
    keys.clear();
    inst = d.create(api);
    inst.reset();
    ui.title.textContent = d.title;
    ui.tag.textContent = d.tags[0];
    ui.best.textContent = fmt(bests[id] || 0);
    score = 0;
    api.score(0);
    ui.controls.innerHTML = d.controls
      .map(([k, v]) => `<li><kbd>${k}</kbd><span>${v}</span></li>`)
      .join("");
    dlg.style.setProperty("--accent", d.accent);
    state = "ready";
    if (!dlg.open) dlg.showModal();
    document.documentElement.classList.add("is-playing");
    fit();
    showOverlay("ready");
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function begin() {
    if (!inst || (state !== "ready" && state !== "over")) return;
    NB.audio.ensure();
    clearFx();
    inst.reset();
    score = 0;
    api.score(0);
    runTime = 0;
    state = RM ? "playing" : "intro";
    introT = 0;
    hideOverlay();
    setPauseIcon();
    NB.audio.sfx("start");
    canvas.focus({ preventScroll: true });
    document.dispatchEvent(
      new CustomEvent("nb:start", { detail: { id: def.id } }),
    );
  }

  function restart() {
    if (!inst || state === "idle") return;
    state = "over";
    begin();
  }

  function pause() {
    if (state !== "playing" && state !== "intro") return;
    state = "paused";
    keys.clear();
    showOverlay("paused");
  }

  function resume() {
    if (state !== "paused") return;
    state = "playing";
    hideOverlay();
    setPauseIcon();
    last = performance.now();
    canvas.focus({ preventScroll: true });
  }

  function finish() {
    state = "over";
    const id = def.id,
      prev = bests[id] || 0,
      isBest = score > prev;
    if (isBest) {
      bests[id] = score;
      NB.store.set("best", bests);
      ui.best.textContent = fmt(score);
    }
    showOverlay("over", { isBest, prev, best: Math.max(prev, score) });
    NB.audio.sfx(isBest ? "achieve" : "over");
    document.dispatchEvent(
      new CustomEvent("nb:over", {
        detail: {
          id,
          score,
          durationMs: Math.round(runTime * 1000),
          isBest: isBest && prev > 0,
          prev,
        },
      }),
    );
  }

  function cleanup() {
    cancelAnimationFrame(raf);
    state = "idle";
    inst = null;
    def = null;
    keys.clear();
    document.documentElement.classList.remove("is-playing");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.dispatchEvent(new CustomEvent("nb:close"));
  }

  /* ---------- Input ---------- */
  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    NB.audio.ensure();
    const p = toLocal(e);
    Object.assign(input.pointer, {
      x: p.x,
      y: p.y,
      down: true,
      type: e.pointerType,
    });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    if (state !== "playing") return;
    if (inst.pointer) inst.pointer(p.x, p.y, "down", e.pointerType);
    if (inst.tap) inst.tap(p.x, p.y);
    else if (inst.action) inst.action();
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = toLocal(e);
    Object.assign(input.pointer, { x: p.x, y: p.y, type: e.pointerType });
    if (state === "playing" && inst.pointer)
      inst.pointer(p.x, p.y, "move", e.pointerType);
  });
  const up = () => {
    input.pointer.down = false;
    if (state === "playing" && inst.release) inst.release();
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  document.addEventListener("keydown", (e) => {
    if (!dlg.open || !inst) return;
    if (
      e.target &&
      e.target.closest &&
      e.target.closest('input, textarea, select, [contenteditable="true"]')
    )
      return;
    const c = e.code;
    const onButton = e.target && e.target.tagName === "BUTTON";
    if ((c === "Space" || c === "Enter") && onButton) return; // let the focused button handle it
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(c)
    )
      e.preventDefault();
    if (c === "KeyP") {
      state === "paused" ? resume() : pause();
      return;
    }
    if (c === "KeyR") {
      restart();
      return;
    }
    if (c === "KeyM") {
      NB.audio.setMuted(!NB.audio.muted);
      NB.audio.ensure();
      return;
    }
    if (state === "ready" || state === "over") {
      if (c === "Space" || c === "Enter") begin();
      return;
    }
    if (state === "paused") {
      if (c === "Space" || c === "Enter") resume();
      return;
    }
    if (state !== "playing") {
      keys.add(c);
      return;
    }
    keys.add(c);
    if (e.repeat) return;
    if ((c === "Space" || c === "Enter") && inst.action) inst.action();
    if (inst.key) inst.key(c);
  });
  document.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (!dlg.open || state !== "playing" || !inst) return;
    if (e.code === "Space" && inst.release) inst.release();
    if (inst.keyup) inst.keyup(e.code);
  });

  /* ---------- Controls ---------- */
  ui.go.addEventListener("click", () => {
    state === "paused" ? resume() : begin();
  });
  ui.overlay.addEventListener("click", (e) => {
    if (e.target === ui.overlay && (state === "ready" || state === "paused"))
      ui.go.click();
  });
  ui.exit.addEventListener("click", () => dlg.close());
  ui.pause.addEventListener("click", () => {
    state === "paused" ? resume() : pause();
  });
  ui.restart.addEventListener("click", restart);
  ui.close.addEventListener("click", () => dlg.close());
  ui.fs.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (dlg.requestFullscreen) dlg.requestFullscreen().catch(() => {});
  });
  document.addEventListener("fullscreenchange", fit);
  dlg.addEventListener("close", cleanup);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  NB.player = {
    open,
    resetBests() {
      Object.keys(bests).forEach((k) => delete bests[k]);
      NB.store.remove("best");
    },
  };
})();
