const GAMES = Object.freeze({
  "polaris-drift": { rate: 600, bonus: 1000 },
  "aurora-stack": { rate: 2, bonus: 10 },
  "glacier-breaker": { rate: 10000, bonus: 10000 },
  constellation: { rate: 3, bonus: 3 },
  "tundra-dash": { rate: 600, bonus: 1000 },
  "halo-orbit": { rate: 5, bonus: 5 },
});
const ORIGINS = new Set([
  "https://northboundgames.studio",
  "https://www.northboundgames.studio",
]);

export function validateRun(body) {
  if (!Object.hasOwn(GAMES, body.game)) return "Invalid game.";
  const rule = GAMES[body.game];
  if (
    !rule ||
    !Number.isSafeInteger(body.score) ||
    body.score < 1 ||
    body.score > 100000000
  )
    return "Invalid score.";
  if (
    !Number.isSafeInteger(body.durationMs) ||
    body.durationMs < 100 ||
    body.durationMs > 10800000
  )
    return "Invalid run duration.";
  if (body.score > rule.rate * (body.durationMs / 1000) + rule.bonus)
    return "That score could not be accepted for this run.";
  if (
    typeof body.name !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9 _-]{2,17}$/.test(body.name) ||
    body.name !== body.name.trim()
  )
    return "Use a nickname of 3–18 letters, numbers, spaces, underscores or hyphens.";
  if (typeof body.runId !== "string" || !/^[a-f0-9-]{36}$/.test(body.runId))
    return "Invalid run.";
  return null;
}

async function hash(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

export function createHandler({
  url,
  secretKey,
  publishableKeys,
  fetcher = fetch,
}) {
  return async function handle(req) {
    const origin = req.headers.get("origin");
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Headers": "apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      Vary: "Origin",
      "Cache-Control": "no-store",
    };
    if (origin && ORIGINS.has(origin))
      headers["Access-Control-Allow-Origin"] = origin;
    const reply = (status, data, extra = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, ...extra },
      });
    if (origin && !ORIGINS.has(origin))
      return reply(403, { error: "Origin not allowed." });
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    // This explicit API-key check is required because the function uses modern
    // publishable keys instead of JWTs. Guest tokens separately own run tickets.
    const apiKey = req.headers.get("apikey");
    if (!apiKey || !publishableKeys.includes(apiKey))
      return reply(401, { error: "Invalid API key." });
    if (!url || !secretKey)
      return reply(503, { error: "Leaderboards are temporarily unavailable." });
    const rpc = async (name, body) => {
      const response = await fetcher(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: secretKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = typeof data.message === "string" ? data.message : "";
        if (message.includes("rate_limit"))
          throw Object.assign(new Error("Too many runs. Try again later."), {
            status: 429,
          });
        if (message.includes("invalid_run"))
          throw Object.assign(
            new Error("This run has expired or was already submitted."),
            { status: 409 },
          );
        throw new Error("Database request failed.");
      }
      return data;
    };
    try {
      const path = new URL(req.url);
      if (req.method === "GET") {
        const game = path.searchParams.get("game");
        if (!Object.hasOwn(GAMES, game))
          return reply(400, { error: "Choose a valid game." });
        const rows = await rpc("nb_lb_read", { p_game: game });
        return reply(
          200,
          { game, entries: rows },
          { "Cache-Control": "public, max-age=30" },
        );
      }
      if (req.method !== "POST")
        return reply(405, { error: "Method not allowed." });
      if (!req.headers.get("content-type")?.startsWith("application/json"))
        return reply(415, { error: "JSON required." });
      const raw = await req.text();
      if (raw.length > 2048) return reply(413, { error: "Request too large." });
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, { error: "Invalid JSON." });
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return reply(400, { error: "Invalid request." });
      if (
        typeof body.playerToken !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.playerToken)
      )
        return reply(401, { error: "Invalid player identity." });
      if (!Object.hasOwn(GAMES, body.game))
        return reply(400, { error: "Choose a valid game." });
      const player = await hash(body.playerToken);
      if (body.action === "start") {
        // Network hints supplement per-player limits; they are not authentication.
        const ip =
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          req.headers.get("cf-connecting-ip") ||
          "unknown";
        const ipHash = await hash(`${secretKey}:${ip}`);
        const runId = await rpc("nb_lb_start", {
          p_player: player,
          p_ip: ipHash,
          p_game: body.game,
        });
        return reply(201, { runId });
      }
      if (body.action !== "submit")
        return reply(400, { error: "Unknown action." });
      const invalid = validateRun(body);
      if (invalid) return reply(400, { error: invalid });
      const rows = await rpc("nb_lb_submit", {
        p_player: player,
        p_game: body.game,
        p_run: body.runId,
        p_name: body.name,
        p_score: body.score,
        p_duration: body.durationMs,
      });
      return reply(200, { saved: true, best: rows[0].best });
    } catch (error) {
      if (error.status)
        return reply(
          error.status,
          { error: error.message },
          error.status === 429 ? { "Retry-After": "3600" } : {},
        );
      return reply(503, {
        error: "The online score could not be saved. Your local score is safe.",
      });
    }
  };
}
