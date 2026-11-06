import test from "node:test";
import assert from "node:assert/strict";
import recordings from "../server/qloo-recordings.json" with { type: "json" };
import { QlooClient } from "../server/qloo.js";
import { designRoom } from "../server/agent.js";

const entry = recordings.entries.find(e => e.request.startsWith("/search?"));
const query = new URL(entry.request, recordings.source).searchParams.get("query");

for (const status of [401, 403, 429, 500]) {
  test(`HTTP ${status} replays the exact real search and labels its origin`, async () => {
    let calls = 0;
    const steps = [];
    const client = new QlooClient({ apiKey: "local-invalid", onStep: step => steps.push(step), fetchImpl: async () => {
      calls++;
      return new Response("{}", { status, headers: { "retry-after": "0.001" } });
    } });
    assert.deepEqual(await client.search(query), entry.response);
    assert.equal(client.mode, "replay");
    assert.match(client.replayNotice, /saved real Qloo responses/);
    assert.equal(calls, status === 429 ? 3 : 1);
    assert.ok(steps.some(s => s.replay && s.capturedAt === entry.capturedAt));
  });
}

test("live results take precedence, even if a matching recording exists", async () => {
  const live = { results: [] };
  const client = new QlooClient({ apiKey: "local-invalid", fetchImpl: async () => Response.json(live) });
  assert.deepEqual(await client.search(query), live);
  assert.equal(client.mode, "live");
  assert.equal(client.replayNotice, null);
});

test("missing recordings preserve errors, never substitute unrelated or synthetic evidence", async () => {
  const client = new QlooClient({ apiKey: "local-invalid", fetchImpl: async () => { throw Error("local-invalid"); } });
  await assert.rejects(client.search("unrecorded-personal-taste"), e => e.status === 503 && !e.message.includes("local-invalid"));
  assert.equal(client.mode, "live");
  assert.equal(client.cache.size, 0);
});

test("all saved representative questions finish offline with real evidence and visible warnings", async () => {
  assert.equal(recordings.cases.length, 3);
  for (const input of recordings.cases) {
    let calls = 0;
    const client = new QlooClient({ apiKey: "local-invalid", fetchImpl: async () => { calls++; throw Error("offline"); } });
    const result = await designRoom(input, { client, env: {} });
    assert.equal(result.mode, "replay");
    assert.ok(result.evidence.length > 0);
    assert.ok(result.warnings.some(w => w.includes("saved real Qloo responses")));
    assert.equal(calls, 1, "subsequent recorded requests avoid a known unavailable upstream");
  }
});

test("saved responses satisfy the same schema as live responses", () => {
  assert.ok(recordings.entries.length >= 20);
  for (const e of recordings.entries) {
    assert.ok(e.response.results && typeof e.response.results === "object");
    assert.notEqual(e.response.success, false);
    if (!e.request.startsWith("/search?")) assert.equal(e.response.success, true);
    assert.ok(Number.isFinite(Date.parse(e.capturedAt)));
    const visit = value => {
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        assert.ok(!/api.?key|authorization|password|phone|address|email/i.test(key));
        visit(item);
      }
    };
    visit(e.response);
  }
});

test("a successful but malformed response uses the saved result; shared requests without a saved comparison fail", async () => {
  const client = new QlooClient({ apiKey: "local-invalid", fetchImpl: async () => Response.json({ success: false, results: [] }) });
  assert.deepEqual(await client.search(query), entry.response);
  const shared = { mode: "shared", room: "Living room", people: recordings.cases.filter(c => c.people).map(c => c.people[0]) };
  await assert.rejects(designRoom(shared, { client, env: {} }), { status: 503 });
});
