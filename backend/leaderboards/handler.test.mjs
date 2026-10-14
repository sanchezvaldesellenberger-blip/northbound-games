import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, validateRun } from "./handler.mjs";

const token = "a".repeat(64),
  runId = "12345678-1234-4234-8234-123456789012";
const valid = {
  action: "submit",
  playerToken: token,
  game: "aurora-stack",
  score: 8,
  durationMs: 15000,
  name: "Test Player",
  runId,
};
const request = (body, headers = {}) =>
  new Request("https://example.supabase.co/functions/v1/leaderboards", {
    method: "POST",
    headers: {
      apikey: "test-public-key",
      "Content-Type": "application/json",
      origin: "https://northboundgames.studio",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const setup = (fetcher) =>
  createHandler({
    url: "https://example.supabase.co",
    secretKey: "test-server-key",
    publishableKeys: ["test-public-key"],
    fetcher,
  });

test("all six real games have valid score envelopes", () => {
  for (const game of [
    "polaris-drift",
    "aurora-stack",
    "glacier-breaker",
    "constellation",
    "tundra-dash",
    "halo-orbit",
  ])
    assert.equal(validateRun({ ...valid, game, score: 1 }), null);
});
test("rejects impossible scores, fractions, negative scores, and forged durations", () => {
  for (const change of [
    { score: -1 },
    { score: 1.5 },
    { score: 1000000 },
    { durationMs: 0 },
    { durationMs: 10800001 },
  ])
    assert.ok(validateRun({ ...valid, ...change }));
});
test("rejects unknown games, inherited object properties, HTML names, and oversized names", () => {
  for (const change of [
    { game: "constructor" },
    { game: "__proto__" },
    { name: "<img src=x>" },
    { name: "A".repeat(19) },
    { name: " Test " },
  ])
    assert.ok(validateRun({ ...valid, ...change }));
});
test("unauthorized requests never touch the database", async () => {
  let calls = 0;
  const handle = setup(async () => {
    calls++;
    throw new Error("unexpected");
  });
  assert.equal((await handle(request(valid, { apikey: "wrong" }))).status, 401);
  assert.equal(
    (await handle(request(valid, { origin: "https://unrelated.example" })))
      .status,
    403,
  );
  assert.equal(calls, 0);
});
test("accepts CORS preflight without exposing a server credential", async () => {
  const response = await setup(() => {
    throw new Error("unexpected");
  })(
    new Request("https://example.supabase.co/functions/v1/leaderboards", {
      method: "OPTIONS",
      headers: { origin: "https://northboundgames.studio" },
    }),
  );
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://northboundgames.studio",
  );
});
test("run tickets store only a hashed player identity", async () => {
  const handle = setup(async (url, options) => {
    assert.match(url, /nb_lb_start$/);
    const body = JSON.parse(options.body);
    assert.notEqual(body.p_player, token);
    assert.match(body.p_player, /^[a-f0-9]{64}$/);
    assert.match(body.p_ip, /^[a-f0-9]{64}$/);
    return Response.json(runId);
  });
  const response = await handle(
    request({ action: "start", playerToken: token, game: valid.game }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { runId });
});
test("rejected submissions do not call privileged SQL", async () => {
  const handle = setup(() => {
    throw new Error("unexpected DB call");
  });
  assert.equal(
    (await handle(request({ ...valid, score: 10000000 }))).status,
    400,
  );
  assert.equal(
    (await handle(request({ ...valid, playerToken: "fake" }))).status,
    401,
  );
  assert.equal((await handle(request(null))).status, 400);
});
test("database outages produce honest failure, never fake saved success", async () => {
  const response = await setup(async () => {
    throw new Error("private provider failure");
  })(request(valid));
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.saved, undefined);
  assert.doesNotMatch(data.error, /private provider/);
});
test("database rate limits and duplicate run errors map to actionable responses", async () => {
  for (const [message, status] of [
    ["rate_limit", 429],
    ["invalid_run", 409],
  ]) {
    const response = await setup(async () =>
      Response.json({ message }, { status: 400 }),
    )(request(valid));
    assert.equal(response.status, status);
    assert.equal((await response.json()).saved, undefined);
  }
});
test("only confirmed database writes produce saved success", async () => {
  const response = await setup(async () => Response.json([{ best: 12 }]))(
    request(valid),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { saved: true, best: 12 });
});
test("public rankings expose only the selected game and returned display rows", async () => {
  const handle = setup(async (url, options) => {
    assert.match(url, /nb_lb_read$/);
    assert.deepEqual(JSON.parse(options.body), { p_game: "aurora-stack" });
    return Response.json([{ rank: 1, name: "Ada", score: 12 }]);
  });
  const response = await handle(
    new Request(
      "https://example.supabase.co/functions/v1/leaderboards?game=aurora-stack",
      { headers: { apikey: "test-public-key" } },
    ),
  );
  assert.deepEqual(await response.json(), {
    game: "aurora-stack",
    entries: [{ rank: 1, name: "Ada", score: 12 }],
  });
});
