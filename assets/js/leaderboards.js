(function () {
  "use strict";
  const NB = window.NB;
  const config = window.NB_LEADERBOARDS || {};
  const GAMES = {
    "polaris-drift": "Polaris Drift",
    "aurora-stack": "Aurora Stack",
    "glacier-breaker": "Prism Breaker",
    constellation: "Constellation",
    "tundra-dash": "Foxfire Run",
    "halo-orbit": "Halo Orbit",
  };
  const configured = !!(config.endpoint && config.publishableKey);
  const $ = (id) => document.getElementById(id);
  let playerToken = NB.store.get("online-player", null);
  if (
    !/^[a-f0-9]{64}$/.test(playerToken || "") &&
    window.crypto?.getRandomValues
  ) {
    playerToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    NB.store.set("online-player", playerToken);
  }
  const nickname = () =>
    NB.store.get("online-name", "") ||
    `Guest-${(playerToken || "player").slice(0, 6)}`;
  async function request(body, game) {
    if (!configured)
      throw new Error("Online leaderboards are not connected yet.");
    const url = new URL(config.endpoint);
    if (game) url.searchParams.set("game", game);
    let response;
    try {
      response = await fetch(url, {
        cache: "no-store",
        method: body ? "POST" : "GET",
        headers: {
          apikey: config.publishableKey,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify({ ...body, playerToken }) } : {}),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new Error(
        "Could not reach the online board. Your local score is safe.",
      );
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Your online score could not be saved.");
    return data;
  }

  /* Shared board. All player text is rendered with textContent, never HTML. */
  const select = $("leaderboard-game"),
    rows = $("leaderboard-rows"),
    status = $("leaderboard-status");
  let readVersion = 0;
  async function loadBoard() {
    if (!select) return;
    const version = ++readVersion,
      game = select.value;
    rows.replaceChildren();
    status.textContent = configured
      ? "Loading leaderboard…"
      : "Online leaderboards are not connected yet.";
    if (!configured) return;
    try {
      const data = await request(null, game);
      if (version !== readVersion) return;
      if (!Array.isArray(data.entries))
        throw new Error("Could not read the leaderboard.");
      for (const entry of data.entries) {
        const row = document.createElement("tr");
        for (const value of [
          entry.rank,
          entry.name,
          NB.util.fmt(entry.score),
        ]) {
          const cell = document.createElement("td");
          cell.textContent = String(value);
          row.appendChild(cell);
        }
        rows.appendChild(row);
      }
      status.textContent = data.entries.length
        ? `Top ${data.entries.length} players in ${GAMES[game]}.`
        : `No scores yet for ${GAMES[game]}. Finish a run to be first.`;
    } catch (error) {
      if (version === readVersion) status.textContent = error.message;
    }
  }
  if (select) {
    const game = new URLSearchParams(location.search).get("game");
    if (Object.hasOwn(GAMES, game)) select.value = game;
    select.addEventListener("change", loadBoard);
    $("leaderboard-refresh").addEventListener("click", loadBoard);
    loadBoard();
  }

  /* Start tickets without delaying play. Posting a score is always opt-in. */
  let activeRun = null,
    completedRun = null;
  const overlay = $("ov-controls")?.parentElement;
  if (!overlay) return;
  const form = document.createElement("form");
  form.className = "online-submit";
  form.hidden = true;
  form.innerHTML =
    '<label for="online-nickname">Leaderboard nickname</label><div class="online-submit-row"><input id="online-nickname" name="nickname" type="text" minlength="3" maxlength="18" pattern="[A-Za-z0-9][A-Za-z0-9 _-]{2,17}" autocomplete="nickname" required><button class="btn btn-gold btn-sm" type="submit">Post score</button></div><p class="online-status" role="status" aria-live="polite"></p><a class="text-btn online-board-link" href="trophies.html#leaderboards">View leaderboards</a>';
  overlay.appendChild(form);
  const input = form.querySelector("input"),
    button = form.querySelector("button"),
    message = form.querySelector(".online-status"),
    link = form.querySelector("a");
  input.value = nickname();
  const hide = () => {
    form.hidden = true;
    completedRun = null;
  };
  document.addEventListener("nb:start", (event) => {
    hide();
    const run = { game: event.detail.id, ticket: null, error: null };
    activeRun = run;
    if (!configured || !playerToken) return;
    run.ready = request({ action: "start", game: run.game })
      .then((data) => {
        run.ticket = data.runId;
      })
      .catch((error) => {
        run.error = error.message;
      });
  });
  document.addEventListener("nb:close", () => {
    hide();
    activeRun = null;
  });
  document.addEventListener("nb:over", (event) => {
    const result = event.detail;
    if (!activeRun || activeRun.game !== result.id) return;
    completedRun = { ...result, run: activeRun };
    form.hidden = false;
    button.disabled = !configured || !playerToken || result.score < 1;
    input.disabled = false;
    input.value = nickname();
    link.href = `trophies.html?game=${encodeURIComponent(result.id)}#leaderboards`;
    message.textContent = !configured
      ? "Your score is saved on this device. Online leaderboards are not connected yet."
      : result.score < 1
        ? "Score a point to enter the online board."
        : "Post this run to the public leaderboard. Nicknames and scores are visible to everyone.";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = completedRun;
    if (!result || button.disabled) return;
    const name = input.value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{2,17}$/.test(name)) {
      message.textContent =
        "Use 3–18 letters, numbers, spaces, underscores or hyphens.";
      return;
    }
    button.disabled = true;
    input.disabled = true;
    message.textContent = "Posting score…";
    try {
      await result.run.ready;
      if (!result.run.ticket)
        throw new Error(
          result.run.error ||
            "This run could not connect to the online board. Your local score is safe.",
        );
      const data = await request({
        action: "submit",
        game: result.id,
        runId: result.run.ticket,
        score: result.score,
        durationMs: result.durationMs,
        name,
      });
      if (completedRun !== result) return;
      NB.store.set("online-name", name);
      message.textContent = `Score posted. Your online best is ${NB.util.fmt(data.best)}.`;
    } catch (error) {
      if (completedRun !== result) return;
      message.textContent = error.message;
      button.disabled = false;
    } finally {
      if (completedRun === result) input.disabled = false;
    }
  });
})();
