import test from "node:test";
import assert from "node:assert/strict";
import { QlooClient, QlooError } from "../server/qloo.js";
import { DEMO_TASTES } from "../server/fixtures.js";

const first = DEMO_TASTES[0].entity_id;
const second = DEMO_TASTES[4].entity_id;

test("live client sends documented GET paths, exact query names and server-side header", async () => {
  const calls = [];
  const client = new QlooClient({
    apiKey: "test-only-value",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ success: true, results: [] }) };
    },
  });
  await client.search("A film & a place");
  await client.insights([first, second], "urn:entity:place");
  await client.compare([first], [second]);
  assert.equal(calls[0].url.origin, "https://hackathon.api.qloo.com");
  assert.equal(calls[0].url.pathname, "/search");
  assert.equal(calls[0].url.searchParams.get("query"), "A film & a place");
  assert.equal(calls[1].url.pathname, "/v2/insights");
  assert.equal(
    calls[1].url.searchParams.get("signal.interests.entities"),
    `${first},${second}`,
  );
  assert.equal(
    calls[1].url.searchParams.get("filter.type"),
    "urn:entity:place",
  );
  assert.equal(calls[2].url.pathname, "/v2/analysis/compare");
  assert.equal(
    calls[2].url.searchParams.get("a.signal.interests.entities"),
    first,
  );
  assert.equal(
    calls[2].url.searchParams.get("b.signal.interests.entities"),
    second,
  );
  for (const { url, options } of calls) {
    assert.equal(options.method, "GET");
    assert.equal(options.headers["X-Api-Key"], "test-only-value");
    assert.ok(!url.toString().includes("test-only-value"));
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test("synthetic responses match documented collection shapes and unknown searches stay empty", async () => {
  const client = new QlooClient({ apiKey: "" });
  assert.equal(client.mode, "demo");
  const search = await client.search(DEMO_TASTES[0].name);
  assert.equal(search.results[0].entity_id, first);
  assert.equal(search.results[0].type, "urn:entity");
  assert.equal(search.results[0].tags[0].type, "urn:tag:style:tasteroom");
  assert.deepEqual(
    (await client.search("unrecognized demo input")).results,
    [],
  );
  assert.ok(Array.isArray((await client.insights([first])).results.entities));
  const tags = (await client.insights([first], "urn:tag")).results.tags;
  assert.ok(
    tags.every(
      (item) =>
        item.tag_id &&
        item.tag_value &&
        item.subtype &&
        Array.isArray(item.types),
    ),
  );
  assert.ok(Array.isArray((await client.compare([first], [second])).results));
});

test("quiet and expressive inputs materially change cross-domain affinity ranking", async () => {
  const client = new QlooClient({ apiKey: "" });
  const quiet = (await client.insights([first])).results.entities;
  const expressive = (await client.insights([second])).results.entities;
  assert.notEqual(quiet[0].entity_id, expressive[0].entity_id);
  const shared = (await client.compare([first], [second])).results;
  assert.equal(shared[0].name, "Soft Geometry Works");
  assert.deepEqual((await client.compare([second], [first])).results, shared);
});

test("identical concurrent requests reuse a per-client cache and log cache hits", async () => {
  let count = 0;
  const steps = [];
  const client = new QlooClient({
    apiKey: "test-only-value",
    onStep: (step) => steps.push(step),
    fetchImpl: async () => {
      count++;
      return { ok: true, json: async () => ({ success: true, results: [] }) };
    },
  });
  await Promise.all([client.search("same"), client.search("same")]);
  assert.equal(count, 1);
  assert.equal(steps[1].cached, true);
  const separateRequest = new QlooClient({ apiKey: "" });
  assert.equal(separateRequest.cache.size, 0);
});

test("request budget is bounded and invalid IDs/categories never call upstream", async () => {
  const client = new QlooClient({ apiKey: "" });
  for (let index = 0; index < 32; index++)
    await client.search(`unknown ${index}`);
  await assert.rejects(client.search("over budget"), { status: 429 });
  assert.equal(client.cache.size, 32);
  assert.throws(() => client.insights(["not-a-uuid"]), QlooError);
  assert.throws(() => client.insights([first], "urn:entity:music"), QlooError);
  assert.throws(() => client.compare([], [first]), QlooError);
});

test("rate limits and connection failures return safe errors without credential leakage", async () => {
  const rateLimited = new QlooClient({
    apiKey: "private-value",
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });
  await assert.rejects(rateLimited.search("test"), {
    status: 429,
    message: "Qloo is rate limited. Please try this room again shortly.",
  });
  assert.equal(rateLimited.cache.size, 0);
  const failed = new QlooClient({
    apiKey: "private-value",
    fetchImpl: async () => {
      throw new Error("private-value in request");
    },
  });
  await assert.rejects(
    failed.search("test"),
    (error) => error.status === 503 && !error.message.includes("private-value"),
  );
});
