/* Northbound Games: site behavior for every page.
   Shared: navigation (menu on phones, solid bar on scroll), controller indicator, trophies, snow.
   Page features start only when their elements exist: the showreel and feed (index), the launcher (games),
   the Deadzone map viewer, trophies and scores,
   the game feel demo (lab), and the contact copy button (help). */
(function () {
  "use strict";
  const NB = window.NB;
  const { TAU, clamp, rand, fmt } = NB.util;
  const RM = NB.util.reducedMotion();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const EMAIL = "sanchez@sidequestdigital.net";
  const WINTER = !!NB.winter;
  if (WINTER) root.classList.add("winter");
  const playing = () => root.classList.contains("is-playing");

  ["pointerdown", "keydown"].forEach((ev) =>
    window.addEventListener(ev, () => NB.audio.ensure(), { passive: true }),
  );

  /* ---------- Navigation ---------- */
  const nav = $("#nav");
  if (nav) {
    const menu = $(".nav-menu", nav);
    if (menu)
      menu.addEventListener("click", () => {
        const open = nav.classList.toggle("open");
        menu.setAttribute("aria-expanded", String(open));
      });
    // Over a full-screen hero the bar starts clear and turns solid once you scroll.
    const solid = () => nav.classList.toggle("solid", window.scrollY > 40);
    solid();
    window.addEventListener("scroll", solid, { passive: true });
  }

  /* ---------- Controller indicator ---------- */
  const padInd = $("#pad-ind");
  function padState(any) {
    if (padInd) padInd.hidden = !any;
    const hp = $("#hint-play");
    if (hp) hp.textContent = any ? "A" : "Enter";
  }
  window.addEventListener("gamepadconnected", () => padState(true));
  window.addEventListener("gamepaddisconnected", () =>
    padState(
      !!(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)),
    ),
  );

  // One rAF loop for the whole page: controller polling plus the live game canvases.
  let padPrev = {},
    padRepeat = 0,
    onFrame = null,
    tLast = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - tLast) / 1000);
    tLast = now;
    pollPad();
    if (onFrame) onFrame(dt);
  }
  requestAnimationFrame(loop);
  function pollPad() {
    if (playing() || !navigator.getGamepads) return;
    const gp = [...navigator.getGamepads()].find(Boolean);
    if (!gp) return;
    const b = (n) => !!(gp.buttons[n] && gp.buttons[n].pressed);
    const x = gp.axes[0] || 0;
    const now = { left: b(14) || x < -0.5, right: b(15) || x > 0.5, a: b(0) };
    const nav = launcher || reel;
    if (nav) {
      const t = performance.now();
      if ((now.left && !padPrev.left) || (now.left && t > padRepeat)) {
        nav.move(-1);
        padRepeat = t + (padPrev.left ? 140 : 380);
      }
      if ((now.right && !padPrev.right) || (now.right && t > padRepeat)) {
        nav.move(1);
        padRepeat = t + (padPrev.right ? 140 : 380);
      }
      if (now.a && !padPrev.a) nav.launch();
    }
    padPrev = now;
  }

  /* ---------- Trophies (shared: unlock and toast work on every page) ---------- */
  const TITLES = {
    "polaris-drift": "Polaris Drift",
    "aurora-stack": "Aurora Stack",
    "glacier-breaker": "Prism Breaker",
    constellation: "Constellation",
    "tundra-dash": "Foxfire Run",
    "halo-orbit": "Halo Orbit",
  };
  const ACH = [
    {
      id: "first-light",
      name: "First Light",
      desc: "Start your first game.",
      tier: "bronze",
    },
    {
      id: "personal-best",
      name: "Personal Best",
      desc: "Beat one of your own high scores.",
      tier: "bronze",
    },
    {
      id: "tinkerer",
      name: "Tinkerer",
      desc: "Turn off every technique under the hood.",
      tier: "bronze",
    },
    {
      id: "polar-pilot",
      name: "Polar Pilot",
      desc: "Score 500 or more in Polaris Drift.",
      tier: "silver",
    },
    {
      id: "sky-architect",
      name: "Sky Architect",
      desc: "Stack 25 floors in Aurora Stack.",
      tier: "silver",
    },
    {
      id: "stargazer",
      name: "Stargazer",
      desc: "Clear round 8 in Constellation.",
      tier: "silver",
    },
    {
      id: "cartographer",
      name: "Cartographer",
      desc: "Play all six arcade games.",
      tier: "gold",
    },
    {
      id: "true-north",
      name: "True North",
      desc: "Enter the old cheat code.",
      tier: "gold",
    },
  ];
  // Each game's accent color, for the dots in the scores table (the game scripts aren't loaded on that page).
  const GAME_COLOR = {
    "polaris-drift": "#7fb2ff",
    "aurora-stack": "#5ee6b0",
    "glacier-breaker": "#5ec4b7",
    constellation: "#ffd27a",
    "tundra-dash": "#ff6b4a",
    "halo-orbit": "#f5b83d",
  };
  const TIER = {
    bronze: "var(--bronze)",
    silver: "var(--silver)",
    gold: "var(--gold)",
  };
  let got = NB.store.get("ach", {});
  let played = NB.store.get("played", {});

  function toast(a) {
    const host = $("dialog[open] .toasts") || $("#toasts");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.innerHTML = `<span class="toast-icon" style="--tier:${TIER[a.tier]}"><svg aria-hidden="true"><use href="#i-trophy"/></svg></span><div><p>Trophy unlocked</p><strong>${a.name}</strong></div>`;
    host.appendChild(el);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => el.classList.add("in")),
    );
    setTimeout(() => {
      el.classList.remove("in");
      setTimeout(() => el.remove(), 500);
    }, 3800);
  }
  function unlock(id) {
    if (got[id]) return;
    const a = ACH.find((x) => x.id === id);
    if (!a) return;
    got[id] = Date.now();
    NB.store.set("ach", got);
    toast(a);
    NB.audio.sfx("achieve");
    renderTrophies();
  }
  function renderTrophies() {
    const n = ACH.filter((a) => got[a.id]).length;
    $$("[data-ach-count]").forEach((el) => {
      el.textContent = `${n}/${ACH.length}`;
    });
    const hubBar = $("#hub-bar"),
      hubNext = $("#hub-next");
    if (hubBar) hubBar.style.width = Math.round((n / ACH.length) * 100) + "%";
    const pips = $("#hub-pips");
    if (pips)
      pips.innerHTML = ACH.map(
        (a) =>
          `<svg class="${got[a.id] ? "got" : ""}" style="--tier:${TIER[a.tier]}"><use href="#i-trophy"/></svg>`,
      ).join("");
    if (hubNext) {
      const next = ACH.find((a) => !got[a.id]);
      hubNext.textContent = next
        ? `Next up: ${next.name}. ${next.desc}`
        : "Every trophy earned. Thanks for playing.";
    }
    const list = $("#trophy-list");
    if (!list) return;
    const pct = Math.round((n / ACH.length) * 100);
    $("#trophy-pct").textContent = pct + "%";
    $("#trophy-bar").style.width = pct + "%";
    list.innerHTML = ACH.map((a) => {
      const when = got[a.id]
        ? new Date(got[a.id]).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "";
      return `<li class="${got[a.id] ? "got" : ""}" style="--tier:${TIER[a.tier]}">
        <span class="t-icon"><svg aria-hidden="true"><use href="#i-trophy"/></svg></span>
        <div><strong>${a.name}</strong><span>${got[a.id] ? "Earned " + when : a.desc}</span></div>
        <span class="t-tier">${a.tier}</span></li>`;
    }).join("");
    const scores = $("#scores tbody");
    if (scores) {
      const bests = NB.store.get("best", {});
      scores.innerHTML = Object.keys(TITLES)
        .map((id) => {
          const last = played[id]
            ? new Date(played[id]).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : "";
          const k = Object.keys(TITLES).indexOf(id) + 1;
          return `<tr><td><a class="score-game" href="games.html#${id}"><i style="--c:${GAME_COLOR[id]}"></i><span>${TITLES[id]}</span><small>NB-0${k}</small></a></td><td class="${last ? "" : "none"}">${last || "Not played yet"}</td>
          <td class="${bests[id] ? "" : "none"}">${bests[id] ? `<b>${fmt(bests[id])}</b>` : "–"}</td></tr>`;
        })
        .join("");
    }
  }
  const resetBtn = $("#log-reset");
  if (resetBtn) {
    let armTimer = 0;
    resetBtn.addEventListener("click", () => {
      if (!resetBtn.hasAttribute("data-armed")) {
        resetBtn.setAttribute("data-armed", "");
        resetBtn.textContent = "Click again to reset local progress";
        clearTimeout(armTimer);
        armTimer = setTimeout(() => {
          resetBtn.removeAttribute("data-armed");
          resetBtn.textContent = "Reset progress";
        }, 4000);
        return;
      }
      clearTimeout(armTimer);
      got = {};
      played = {};
      NB.store.remove("ach");
      NB.store.remove("played");
      NB.store.remove("best");
      if (NB.player) NB.player.resetBests();
      resetBtn.removeAttribute("data-armed");
      resetBtn.textContent = "Progress erased";
      setTimeout(() => {
        resetBtn.textContent = "Reset progress";
      }, 2000);
      renderTrophies();
    });
  }

  /* ---------- Live game art (shared by the showreel, the launcher and the feed) ---------- */
  // Each canvas gets a "thumb": the game's own thumb() painter, scaled to cover the canvas.
  // Live thumbs repaint every frame while their gate (if any) says they're on screen.
  const thumbs = new Set();
  const thumbRO = new ResizeObserver((es) =>
    es.forEach((e) => e.target._thumb && sizeThumb(e.target._thumb)),
  );
  function paintThumb(th) {
    if (!th.w || !th.h || !th.def) return;
    const s = Math.max(th.w / 800, th.h / 500),
      ox = (th.w - 800 * s) / 2,
      oy = (th.h - 500 * s) / 2;
    th.ctx.setTransform(th.dpr * s, 0, 0, th.dpr * s, ox * th.dpr, oy * th.dpr);
    // A thumb can preview the December art any time of year (the "What's new" winter card).
    const season = NB.winter;
    if (th.winter) NB.winter = true;
    try {
      th.def.thumb(th.ctx, 800, 500, th.time);
    } catch (err) {
      console.error(err);
    }
    NB.winter = season;
  }
  function sizeThumb(th) {
    const r = th.canvas.getBoundingClientRect();
    th.dpr = Math.min(window.devicePixelRatio || 1, th.maxDpr);
    th.w = r.width;
    th.h = r.height;
    th.canvas.width = Math.max(1, Math.round(r.width * th.dpr));
    th.canvas.height = Math.max(1, Math.round(r.height * th.dpr));
    paintThumb(th);
  }
  function addThumb(canvas, def, opts = {}) {
    const th = Object.assign(
      {
        canvas,
        ctx: canvas.getContext("2d"),
        def,
        live: false,
        gate: null,
        time: 3 + Math.random() * 2,
        w: 0,
        h: 0,
        dpr: 1,
        maxDpr: 2,
      },
      opts,
    );
    canvas._thumb = th;
    thumbs.add(th);
    thumbRO.observe(canvas);
    return th;
  }
  function dropThumb(canvas) {
    if (canvas._thumb) {
      thumbRO.unobserve(canvas);
      thumbs.delete(canvas._thumb);
    }
  }
  // Feed canvases stay still until hovered or focused, then play.
  function hoverLive(el, th) {
    const on = () => {
        th.live = true;
      },
      off = () => {
        th.live = false;
      };
    el.addEventListener("pointerenter", on);
    el.addEventListener("pointerleave", off);
    el.addEventListener("focus", on);
    el.addEventListener("blur", off);
  }
  const frameHooks = [];
  onFrame = (dt) => {
    if (playing()) return;
    thumbs.forEach((th) => {
      if (th.live && th.def && (!th.gate || th.gate())) {
        th.time += dt;
        paintThumb(th);
      }
    });
    frameHooks.forEach((f) => f(dt));
  };

  // The catalog: Deadzone first, then the arcade games in shelf order.
  const games = (NB.games || []).slice().sort((a, b) => a.order - b.order);
  const DEADZONE = {
    id: "deadzone",
    kind: "flagship",
    code: "NB-00",
    title: "Deadzone",
    tag: "Flagship · Offline edition",
    chips: ["3D first-person shooter", "Six maps", "Keyboard and mouse"],
    blurb:
      "A 3D shooter built for the browser. This offline edition has the full local game: bot matches across six maps, free roam, and the indoor training range. Multiplayer is part of the full version.",
    note: "Opens in a new tab. The first visit downloads about 100 MB.",
    img: "assets/projects/deadzone-halcyon.jpg",
    color: "#ffb454",
    href: "deadzone/index.html",
    page: "deadzone.html",
    controls: [
      ["WASD", "Move"],
      ["Mouse", "Aim and fire"],
      ["Space", "Jump and vault"],
    ],
  };
  const items = [DEADZONE].concat(
    games.map((d) => ({
      id: d.id,
      kind: "arcade",
      def: d,
      code: "NB-" + String(d.order).padStart(2, "0"),
      title: d.title,
      tag: d.tags.join(" · "),
      chips: d.tags.slice(),
      blurb: d.blurb,
      controls: d.controls,
      note: "",
      color: d.accent || "#f4eedb",
      page: NB.gamePages && NB.gamePages[d.id],
    })),
  );
  function playGame(id) {
    if (id === "deadzone") {
      location.href = DEADZONE.page;
      return;
    }
    NB.audio.ensure();
    if (NB.player) NB.player.open(id);
    else location.href = "games.html#" + id;
  }

  // Trophies for play, wherever the player is opened (the front page and the Games page).
  if (NB.player) {
    document.addEventListener("nb:start", (e) => {
      played[e.detail.id] = Date.now();
      NB.store.set("played", played);
      unlock("first-light");
      if (games.every((d) => played[d.id])) unlock("cartographer");
    });
    document.addEventListener("nb:over", (e) => {
      const { id, score, isBest } = e.detail;
      if (isBest) unlock("personal-best");
      if (id === "polaris-drift" && score >= 500) unlock("polar-pilot");
      if (id === "aurora-stack" && score >= 25) unlock("sky-architect");
      if (id === "constellation" && score >= 8) unlock("stargazer");
    });
  }

  /* ---------- Front page hero ----------
     Deadzone's maps crossfade behind the studio statement, with a progress bar per map.
     Two image layers take turns: the incoming map fades in over the outgoing one. */
  let reel = null;
  if ($("#reel"))
    reel = (function () {
      const DUR = 6.5;
      const MAPS = [
        ["halcyon", "Map 01", "Halcyon"],
        ["marlow-estate", "Map 02", "Marlow Estate"],
        ["tidewall", "Map 03", "Tidewall"],
        ["lot-9", "Map 04", "Lot 9"],
        ["low-water", "Map 05", "Low Water"],
        ["hollis-pass", "Map 06", "Hollis Pass"],
        ["range", "Training", "The Yard"],
      ];
      const el = $("#reel"),
        layers = $$(".hero-layer", el),
        track = $("#reel-track");
      let visible = true,
        paused = false,
        t = 0,
        cur = -1,
        front = 1;
      new IntersectionObserver(
        ([e]) => {
          visible = e.isIntersecting;
        },
        { threshold: 0.1 },
      ).observe(el);
      track.style.setProperty("--n", MAPS.length);
      track.innerHTML = MAPS.map(
        (m) =>
          `<button class="hero-seg" type="button" aria-label="Show ${m[2]}"><i><b></b></i></button>`,
      ).join("");
      const segs = $$(".hero-seg", track);
      // Warm the cache so each crossfade has its image ready.
      MAPS.forEach((m) => {
        const im = new Image();
        im.src = `assets/projects/deadzone/${m[0]}.jpg`;
      });
      function show(i) {
        i = (i + MAPS.length) % MAPS.length;
        if (i === cur) return;
        cur = i;
        t = 0;
        const [file, code, name] = MAPS[i];
        front = 1 - front;
        $("img", layers[front]).src = `assets/projects/deadzone/${file}.jpg`;
        layers.forEach((x, k) => x.classList.toggle("on", k === front));
        $("#reel-code").textContent = code;
        $("#reel-name").textContent = name;
        $("#reel-index").textContent = String(i + 1).padStart(2, "0");
        segs.forEach((s, k) => {
          s.setAttribute("aria-current", k === i ? "true" : "false");
          $("b", s).style.transform = k < i ? "scaleX(1)" : "scaleX(0)";
        });
      }
      segs.forEach((s, i) => s.addEventListener("click", () => show(i)));
      const pauseBtn = $("#reel-pause");
      pauseBtn.addEventListener("click", () => {
        paused = !paused;
        pauseBtn.setAttribute("aria-pressed", String(paused));
        pauseBtn.setAttribute(
          "aria-label",
          paused ? "Play the slideshow" : "Pause the slideshow",
        );
        $("use", pauseBtn).setAttribute(
          "href",
          paused ? "#i-play" : "#i-pause",
        );
      });
      frameHooks.push((dt) => {
        if (!visible || paused || document.hidden) return;
        t += dt;
        $("b", segs[cur]).style.transform = `scaleX(${Math.min(1, t / DUR)})`;
        if (t >= DUR) show(cur + 1);
      });
      show(0);
      return {
        move: (d) => show(cur + d),
        launch: () => {
          location.href = "deadzone.html";
        },
      };
    })();

  /* ---------- Launcher (Games page) ---------- */
  let launcher = null;
  if ($("#shelf"))
    launcher = (function () {
      let homeVisible = true;
      const homeGate = () => homeVisible;
      const bgTh = addThumb($("#bg-canvas"), null, {
        live: true,
        maxDpr: 1.25,
        gate: homeGate,
      });
      new IntersectionObserver(
        ([e]) => {
          homeVisible = e.isIntersecting;
        },
        { threshold: 0.15 },
      ).observe($(".home"));

      const home = $(".home"),
        shelf = $("#shelf"),
        info = $(".info");
      shelf.innerHTML = items
        .map(
          (it, i) => `
      <button class="tile" type="button" role="option" id="tile-${it.id}" data-i="${i}" aria-selected="false" aria-label="${it.title}">
        <span class="tile-art">${it.kind === "flagship" ? `<img src="${it.img}" alt="" loading="lazy">` : '<canvas aria-hidden="true"></canvas>'}</span>
        ${it.kind === "flagship" ? '<span class="tile-flag">Flagship</span>' : ""}
        <span class="tile-label">${it.title}</span>
      </button>`,
        )
        .join("");
      const tiles = $$(".tile", shelf);
      tiles.forEach((t, i) => {
        if (items[i].kind === "arcade")
          items[i].th = addThumb($("canvas", t), items[i].def, {
            gate: homeGate,
          });
      });

      let sel = -1;
      const chip = (text, icon) =>
        `<li>${icon ? `<svg aria-hidden="true"><use href="#${icon}"/></svg>` : ""}${text}</li>`;
      function render(it) {
        $("#info-code").textContent = it.code;
        $("#info-kind").textContent = it.tag;
        $("#info-title").textContent = it.title;
        $("#info-blurb").textContent = it.blurb;
        const best = it.kind === "arcade" ? NB.bests[it.id] : 0;
        $("#info-chips").innerHTML =
          it.chips.map((c) => chip(c)).join("") +
          (best ? chip("Best " + fmt(best), "i-trophy") : "");
        $("#info-controls").innerHTML = it.controls
          .map(([k, v]) => `<li><kbd>${k}</kbd>${v}</li>`)
          .join("");
        $("#info-note").textContent = it.note;
        const play = $("#info-play");
        play.href = it.kind === "flagship" ? it.href : "#";
        play.target = it.kind === "flagship" ? "_blank" : "";
        play.rel = it.kind === "flagship" ? "noopener" : "";
        $("span", play).textContent =
          it.kind === "flagship" ? "Play the offline edition" : "Play";
        const page = $("#info-page");
        if (page) {
          page.hidden = !it.page;
          if (it.page) page.href = it.page;
        }
      }
      function select(i, opts = {}) {
        i = clamp(i, 0, items.length - 1);
        if (i === sel) return;
        const prev = items[sel];
        if (prev && prev.th) prev.th.live = false;
        sel = i;
        const it = items[i];
        tiles.forEach((t, k) =>
          t.setAttribute("aria-selected", String(k === i)),
        );
        shelf.setAttribute("aria-activedescendant", tiles[i].id);
        if (it.th) it.th.live = true;
        if (opts.sound !== false) NB.audio.sfx("ui");
        tiles[i].scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: RM || opts.instant ? "auto" : "smooth",
        });
        if (history.replaceState)
          history.replaceState(
            null,
            "",
            i === 0 ? location.pathname + location.search : "#" + it.id,
          );
        root.style.setProperty("--game", it.color);
        const apply = () => {
          home.dataset.kind = it.kind;
          bgTh.def = it.def || null;
          bgTh.time = 4;
          if (bgTh.def) paintThumb(bgTh);
          render(it);
          info.classList.remove("swap");
          home.classList.remove("swapping");
        };
        if (opts.instant) {
          apply();
          return;
        }
        info.classList.add("swap");
        home.classList.add("swapping");
        clearTimeout(select.t);
        select.t = setTimeout(apply, 220);
      }
      function launch(i = sel) {
        const it = items[i];
        if (!it || !homeVisible) return;
        NB.audio.ensure();
        if (it.kind === "flagship") window.open(it.href, "_blank", "noopener");
        else NB.player.open(it.id);
      }
      tiles.forEach((t, i) => {
        t.addEventListener("mouseenter", () => {
          if (matchMedia("(hover: hover)").matches) select(i);
        });
        t.addEventListener("focus", () => select(i));
        t.addEventListener("click", () => {
          if (i === sel) launch(i);
          else select(i);
        });
      });
      $("#info-play").addEventListener("click", (e) => {
        if (items[sel].kind === "arcade") {
          e.preventDefault();
          launch();
        }
      });
      document.addEventListener("keydown", (e) => {
        if (playing() || !homeVisible) return;
        const t = e.target;
        if (t && t.closest && t.closest("input, textarea, select, .footer"))
          return;
        if (e.key === "ArrowRight") {
          e.preventDefault();
          select(sel + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          select(sel - 1);
        } else if (
          e.key === "Enter" &&
          !(t && t.closest && t.closest("a, button:not(.tile)"))
        ) {
          e.preventDefault();
          launch();
        }
      });
      document.addEventListener("nb:close", () => {
        render(items[sel]);
        tiles[sel].focus({ preventScroll: true });
      });

      // Deep link: games.html#polaris-drift opens with that game selected (the scores table and the front page link here).
      const start = Math.max(
        0,
        items.findIndex((it) => "#" + it.id === location.hash),
      );
      select(start, { sound: false, instant: true });
      requestAnimationFrame(() =>
        tiles.forEach((t, i) => {
          if (items[i].th) paintThumb(items[i].th);
        }),
      );
      return { move: (d) => select(sel + d), launch: () => launch() };
    })();

  /* ---------- Front page: arcade grid and news art ---------- */
  const arcade = $("#arcade");
  if (arcade) {
    arcade.innerHTML = games
      .map(
        (d) => `
      <button class="game-card" type="button" data-id="${d.id}">
        <span class="game-art"><canvas aria-hidden="true"></canvas></span>
        <span class="game-info"><strong>${d.title}</strong><small>${d.tags.join(" · ")}</small><span>NB-${String(d.order).padStart(2, "0")}</span></span>
      </button>`,
      )
      .join("");
    $$(".game-card", arcade).forEach((b) => {
      hoverLive(
        b,
        addThumb(
          $("canvas", b),
          games.find((d) => d.id === b.dataset.id),
          { time: 5 },
        ),
      );
      b.addEventListener("click", () => playGame(b.dataset.id));
    });
  }
  // News cards can show a game's live art; the winter card previews the December scenes.
  $$(".news-art canvas[data-game]").forEach((cv) => {
    const def = games.find((d) => d.id === cv.dataset.game);
    if (def)
      hoverLive(
        cv.closest("a") || cv,
        addThumb(cv, def, { time: 6, winter: cv.hasAttribute("data-winter") }),
      );
  });
  const winterCard = $("#news-winter");
  if (winterCard && WINTER) {
    $("strong", winterCard).textContent = "Winter edition is live";
    $("p", winterCard).textContent =
      "Every arcade game has its December art until January 1.";
    winterCard.href = "games.html#tundra-dash";
  }

  /* ---------- Reveal (every page) ---------- */
  // Sections fade up as they reach the viewport; siblings follow each other by a beat.
  const revealIO =
    "IntersectionObserver" in window &&
    new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("in");
          revealIO.unobserve(e.target);
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
  if (revealIO) {
    const groups = [
      ".section-head",
      ".flagship",
      ".sub-head",
      ".arcade",
      ".studio-band",
      ".news",
      ".cta-band .wrap",
      ".page-body .library > *",
      ".cards",
    ];
    $$(groups.join(",")).forEach((g) => {
      const kids = g.matches(".news, .studio-band")
        ? Array.from(g.children)
        : [g];
      kids.forEach((k, i) => {
        k.classList.add("reveal");
        k.style.setProperty("--d", Math.min(i, 6) * 0.08 + "s");
        revealIO.observe(k);
      });
    });
  }

  /* ---------- Map viewer (Deadzone page) ---------- */
  const mapImg = $("#map-img");
  if (mapImg) {
    const thumbsEl = $$(".map-thumb");
    let mapT = 0;
    thumbsEl.forEach((b) =>
      b.addEventListener("click", () => {
        if (b.getAttribute("aria-pressed") === "true") return;
        thumbsEl.forEach((t) =>
          t.setAttribute("aria-pressed", String(t === b)),
        );
        $("#map-tag").textContent = b.dataset.tag;
        $("#map-name").textContent = b.dataset.name;
        $("#map-blurb").textContent = b.dataset.blurb;
        mapImg.classList.add("swap");
        clearTimeout(mapT);
        mapT = setTimeout(
          () => {
            mapImg.src = b.dataset.src;
            mapImg.alt = `The ${b.dataset.name} map in Deadzone`;
            mapImg
              .decode()
              .catch(() => {})
              .then(() => mapImg.classList.remove("swap"));
          },
          RM ? 0 : 200,
        );
      }),
    );
  }

  /* ---------- Game feel demo (lab) ---------- */
  if ($("#lab-canvas"))
    (function lab() {
      const canvas = $("#lab-canvas");
      const g = canvas.getContext("2d");
      const switches = $$(".setting[data-fx]"),
        readout = $("#lab-readout");
      const fx = {};
      switches.forEach((b) => {
        fx[b.dataset.fx] = b.getAttribute("aria-pressed") === "true";
      });
      const ball = { x: 140, y: 80, vx: 300, vy: 0, r: 22, sx: 1, sy: 1 };
      const trail = [],
        parts = [];
      let w = 0,
        h = 0,
        dpr = 1,
        visible = false,
        shake = 0,
        stop = 0,
        idle = 0,
        last = performance.now(),
        glow = 0;
      const CREAM = NB.pal.cream,
        GOLD = "#e8b64a",
        BLUE = "#7fb2ff";

      const meter = document.createElement("span");
      meter.className = "lab-meter";
      meter.setAttribute("aria-hidden", "true");
      meter.innerHTML = switches.map(() => "<i></i>").join("");
      readout.after(meter);
      function sync() {
        const on = switches.filter(
          (b) => b.getAttribute("aria-pressed") === "true",
        ).length;
        readout.textContent = `${on} of ${switches.length} on`;
        $$("i", meter).forEach((seg, i) => seg.classList.toggle("on", i < on));
        if (on === 0) unlock("tinkerer");
      }
      switches.forEach((b) =>
        b.addEventListener("click", () => {
          const k = b.dataset.fx;
          fx[k] = !fx[k];
          b.setAttribute("aria-pressed", String(fx[k]));
          if (k === "sound" && fx[k]) NB.audio.ensure();
          if (fx.sound) NB.audio.sfx("ui");
          sync();
        }),
      );
      function size() {
        const r = canvas.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = r.width;
        h = r.height;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ball.x = clamp(ball.x, ball.r, Math.max(ball.r, w - ball.r));
        draw();
      }
      new ResizeObserver(size).observe(canvas);
      new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
      }).observe(canvas);
      canvas.addEventListener("pointerdown", (e) => {
        const r = canvas.getBoundingClientRect(),
          x = e.clientX - r.left;
        ball.vy = -(640 + Math.random() * 180);
        ball.vx = (x - ball.x) * 1.6 + (Math.random() - 0.5) * 160;
        idle = 0;
        if (fx.sound) NB.audio.sfx("jump");
      });
      function impact(speed, sideways) {
        const k = clamp(speed / 900, 0, 1);
        if (k < 0.08) return;
        if (fx.squash) {
          if (sideways) {
            ball.sx = 1 - 0.4 * k;
            ball.sy = 1 + 0.35 * k;
          } else {
            ball.sx = 1 + 0.5 * k;
            ball.sy = 1 - 0.45 * k;
          }
        }
        if (fx.particles) {
          const n = 6 + k * 18,
            left = ball.x < w / 2;
          for (let i = 0; i < n; i++) {
            const a = sideways
              ? (left ? 0 : Math.PI) + rand(-1.2, 1.2)
              : -Math.PI / 2 + rand(-1.3, 1.3);
            const s = rand(80, 320) * (0.4 + k);
            parts.push({
              x: ball.x + (sideways ? (left ? -ball.r : ball.r) : 0),
              y: ball.y + (sideways ? 0 : ball.r),
              vx: Math.cos(a) * s,
              vy: Math.sin(a) * s,
              life: rand(0.3, 0.7),
              max: 0.7,
              c: [GOLD, CREAM, BLUE][i % 3],
              rot: rand(0, TAU),
            });
          }
        }
        if (fx.shake) shake = Math.max(shake, 11 * k);
        if (fx.hitstop && k > 0.35) stop = 0.04 + 0.05 * k;
        if (fx.sound) NB.audio.sfx("bounce", k);
        glow = k;
      }
      function step(dt) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.life -= dt;
          if (p.life <= 0) {
            parts.splice(i, 1);
            continue;
          }
          p.vy += 900 * dt;
          p.vx *= 0.98;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += dt * 8;
        }
        shake *= Math.exp(-dt * 10);
        if (shake < 0.2) shake = 0;
        glow *= Math.exp(-dt * 6);
        if (stop > 0) {
          stop -= dt;
          return;
        }
        idle += dt;
        if (idle > 2.6) {
          idle = 0;
          ball.vy = -(620 + Math.random() * 160);
          ball.vx = (Math.random() > 0.5 ? 1 : -1) * rand(220, 440);
        }
        ball.vy += 1800 * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        const floor = h - 30;
        if (ball.y + ball.r > floor) {
          ball.y = floor - ball.r;
          if (ball.vy > 80) impact(ball.vy, false);
          ball.vy = Math.abs(ball.vy) < 90 ? 0 : -ball.vy * 0.62;
          ball.vx *= 0.9;
        }
        if (ball.x - ball.r < 0) {
          ball.x = ball.r;
          impact(Math.abs(ball.vx), true);
          ball.vx = Math.abs(ball.vx) * 0.8;
        }
        if (ball.x + ball.r > w) {
          ball.x = w - ball.r;
          impact(Math.abs(ball.vx), true);
          ball.vx = -Math.abs(ball.vx) * 0.8;
        }
        if (ball.y - ball.r < 0) {
          ball.y = ball.r;
          ball.vy = Math.abs(ball.vy) * 0.5;
        }
        if (ball.vy === 0) ball.vx *= Math.exp(-dt * 3);
        let tx = 1,
          ty = 1;
        if (fx.squash && ball.vy !== 0) {
          const s = clamp(Math.abs(ball.vy) / 2600, 0, 0.24);
          ty = 1 + s;
          tx = 1 - s * 0.6;
        }
        const k = 1 - Math.exp(-dt * 14);
        ball.sx += (tx - ball.sx) * k;
        ball.sy += (ty - ball.sy) * k;
        if (!fx.squash) {
          ball.sx = 1;
          ball.sy = 1;
        }
        trail.unshift({ x: ball.x, y: ball.y });
        if (trail.length > 12) trail.pop();
      }
      function draw() {
        if (!w) return;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        if (fx.shake && shake)
          g.translate(
            (Math.random() - 0.5) * 2 * shake,
            (Math.random() - 0.5) * 2 * shake,
          );
        g.fillStyle = "rgba(255,255,255,.12)";
        g.fillRect(0, h - 30, w, 2);
        if (fx.trail) {
          trail.forEach((p, i) => {
            if (i === 0) return;
            g.globalAlpha = (1 - i / trail.length) * 0.35;
            g.fillStyle = CREAM;
            g.beginPath();
            g.arc(p.x, p.y, ball.r * (1 - (i / trail.length) * 0.5), 0, TAU);
            g.fill();
          });
          g.globalAlpha = 1;
        }
        if (fx.particles) {
          for (const p of parts) {
            g.globalAlpha = clamp(p.life / p.max, 0, 1);
            g.fillStyle = p.c;
            g.save();
            g.translate(p.x, p.y);
            g.rotate(p.rot);
            g.fillRect(-2.5, -2.5, 5, 5);
            g.restore();
          }
          g.globalAlpha = 1;
        }
        g.save();
        g.translate(ball.x, ball.y + ball.r * (1 - ball.sy));
        g.scale(ball.sx, ball.sy);
        if (glow > 0.05 && (fx.particles || fx.squash)) {
          g.shadowColor = CREAM;
          g.shadowBlur = 26 * glow;
        }
        g.fillStyle = CREAM;
        g.beginPath();
        g.arc(0, 0, ball.r, 0, TAU);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = "rgba(9,11,17,.18)";
        g.beginPath();
        g.arc(ball.r * 0.25, ball.r * 0.3, ball.r * 0.7, 0, TAU);
        g.fill();
        g.restore();
      }
      function frame(t) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.033, (t - last) / 1000);
        last = t;
        if (!visible) return;
        step(dt);
        draw();
      }
      sync();
      // Runs even with reduced motion on: the moving ball is the whole point of this page.
      requestAnimationFrame(frame);
    })();

  /* ---------- Contact copy button (help) ---------- */
  const copyBtn = $("#copy-mail");
  if (copyBtn)
    copyBtn.addEventListener("click", () => {
      const label = $("span", copyBtn);
      const done = (text) => {
        label.textContent = text;
        setTimeout(() => {
          label.textContent = "Copy address";
        }, 2200);
      };
      const fallback = () => {
        const r = document.createRange();
        r.selectNodeContents($("#mail-addr"));
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        done("Selected, press Ctrl+C");
      };
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard
          .writeText(EMAIL)
          .then(() => done("Copied"), fallback);
      else fallback();
    });

  /* ---------- Sound toggles ---------- */
  function syncMute() {
    $$("[data-mute]").forEach((b) => {
      b.setAttribute(
        "aria-label",
        NB.audio.muted ? "Turn sound on" : "Turn sound off",
      );
      b.setAttribute("aria-pressed", String(NB.audio.muted));
      $("use", b).setAttribute(
        "href",
        NB.audio.muted ? "#i-sound-off" : "#i-sound",
      );
    });
  }
  $$("[data-mute]").forEach((b) =>
    b.addEventListener("click", () => {
      NB.audio.setMuted(!NB.audio.muted);
      NB.audio.ensure();
      NB.audio.sfx("ui");
    }),
  );
  document.addEventListener("nb:mute", syncMute);

  /* ---------- Snow: December, or the old cheat code ---------- */
  const snowCanvas = $("#snow");
  const snow =
    snowCanvas &&
    (function () {
      const c = snowCanvas,
        g = c.getContext("2d");
      let flakes = [],
        raf = 0,
        w = 0,
        h = 0,
        dpr = 1,
        last = 0;
      function size() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = innerWidth;
        h = innerHeight;
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      function frame(t) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (t - last) / 1000 || 0);
        last = t;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        g.fillStyle = "#f4eedb";
        for (const f of flakes) {
          f.y += f.v * dt;
          f.x += Math.sin((t / 1000) * f.f + f.p) * 18 * dt;
          if (f.y > h + 4) {
            f.y = -4;
            f.x = Math.random() * w;
          }
          g.globalAlpha = f.a;
          g.beginPath();
          g.arc(f.x, f.y, f.r, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      return {
        set(on) {
          c.hidden = !on;
          cancelAnimationFrame(raf);
          raf = 0;
          if (!on) return;
          size();
          flakes = Array.from({ length: Math.round((w * h) / 11000) }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: rand(0.8, 2.6),
            v: rand(25, 80),
            f: rand(0.5, 1.5),
            p: rand(0, TAU),
            a: rand(0.35, 0.85),
          }));
          if (RM) {
            frame(performance.now());
            cancelAnimationFrame(raf);
            raf = 0;
          } else {
            last = performance.now();
            raf = requestAnimationFrame(frame);
          }
        },
        resize() {
          if (!c.hidden) size();
        },
      };
    })();
  if (snow) {
    window.addEventListener("resize", () => snow.resize());
    let snowing = WINTER || NB.store.get("snow", false);
    if (snowing) snow.set(true);
    const KONAMI = [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "KeyB",
      "KeyA",
    ];
    let kp = 0;
    document.addEventListener("keydown", (e) => {
      const t = e.target;
      if (playing() || (t && t.closest && t.closest("input, textarea, select")))
        return;
      if (e.code === KONAMI[kp]) kp++;
      else kp = e.code === "ArrowUp" ? (kp === 2 ? 2 : 1) : 0;
      if (kp === KONAMI.length) {
        kp = 0;
        snowing = !snowing;
        snow.set(snowing);
        if (!WINTER) NB.store.set("snow", snowing);
        NB.audio.sfx("level");
        unlock("true-north");
      }
    });
  }

  /* ---------- Boot ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  syncMute();
  renderTrophies();
})();
