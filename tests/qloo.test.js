import test from "node:test";
import assert from "node:assert/strict";
import { QlooClient, QlooError, buildLocationParams } from "../server/qloo.js";
import { DEMO_TASTES } from "../server/fixtures.js";

const first = DEMO_TASTES[0].entity_id;
const second = DEMO_TASTES[4].entity_id;

test("real search envelope without a success flag is accepted; explicit failure is rejected", async () => {
  const raw = { results: [{ entity_id: first, name: "Resolved cultural taste" }] };
  const client = new QlooClient({ apiKey: "test-value", fetchImpl: async () => Response.json(raw) });
  assert.deepEqual(await client.search("Resolved cultural taste"), raw);
  const failed = new QlooClient({ apiKey: "test-value", fetchImpl: async () => Response.json({ success: false, results: [] }) });
  await assert.rejects(failed.search("failure"), /incomplete response/);
});

test("temporary live rate limits retry the actual request without fixture fallback", async () => {
  let count = 0;
  const raw = { results: [{ entity_id: first, name: "Actual response" }] };
  const client = new QlooClient({ apiKey: "test-value", fetchImpl: async () => {
    count++;
    return count === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "0.001" } }) : Response.json(raw);
  } });
  assert.deepEqual(await client.search("actual"), raw);
  assert.equal(count, 2);
  assert.equal(client.mode, "live");
});

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

test("location builder uses natural-language signals across domains and filters only local places", () => {
  const brand = buildLocationParams("  Seongsu-dong, Seoul  ", { ids: [first, first] });
  assert.deepEqual(brand, {
    "filter.type": "urn:entity:brand",
    take: "8",
    "signal.location.query": "Seongsu-dong, Seoul",
    "signal.interests.entities": first,
  });
  const place = buildLocationParams({ query: "Lower East Side, New York" }, { type: "urn:entity:place" });
  assert.equal(place["signal.location.query"], "Lower East Side, New York");
  assert.equal(place["filter.location.query"], "Lower East Side, New York");
  assert.ok(!("signal.interests.entities" in place));
  const artist = buildLocationParams("Paris", { type: "urn:entity:artist" });
  assert.ok(!("filter.location.query" in artist));
});

test("coordinate queries use WKT longitude first and leave density discovery untouched by default", () => {
  const coordinate = { latitude: 40.722668, longitude: -73.99823 };
  const point = buildLocationParams(coordinate);
  assert.equal(point["signal.location"], "POINT(-73.99823 40.722668)");
  assert.ok(!("signal.location.radius" in point));
  const place = buildLocationParams({ ...coordinate, radius: 1500 }, { type: "urn:entity:place" });
  assert.equal(place["signal.location"], place["filter.location"]);
  assert.equal(place["signal.location.radius"], "1500");
  assert.equal(place["filter.location.radius"], "1500");
});

test("invalid locations, reference IDs and radius fail before any request", () => {
  for (const location of ["", "  ", null, [], {}, "a".repeat(161), { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: "40", longitude: 0 }, { latitude: 0, longitude: 0, radius: -1 }])
    assert.throws(() => buildLocationParams(location), { status: 400 });
  assert.throws(() => buildLocationParams("Seoul", { ids: ["fake"] }), { status: 400 });
  assert.throws(() => buildLocationParams("Seoul", { ids: "not an array" }), { status: 400 });
  assert.throws(() => buildLocationParams("Seoul", { type: "urn:tag" }), { status: 400 });
});

test("live location and demographic requests use documented params and preserve the raw schema", async () => {
  const calls = [];
  const raw = { success: true, results: { demographics: [{ entity_id: first, query: { age: { "30_to_34": 0.39 }, gender: { male: -0.04, female: 0.04 } } }] }, duration: 77 };
  const client = new QlooClient({ apiKey: "test-only-value", fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => raw };
  } });
  await client.locationInsights("Seongsu-dong, Seoul", "urn:entity:brand", [first]);
  assert.equal(calls[0].url.pathname, "/v2/insights");
  assert.equal(calls[0].url.searchParams.get("signal.location.query"), "Seongsu-dong, Seoul");
  assert.equal(calls[0].url.searchParams.get("signal.interests.entities"), first);
  assert.ok(!calls[0].url.searchParams.has("filter.location.query"));
  assert.equal(await client.demographics([first]), raw);
  assert.equal(calls[1].url.searchParams.get("filter.type"), "urn:demographics");
  assert.equal(calls[1].url.searchParams.get("signal.interests.entities"), first);
  assert.ok(!calls[1].url.searchParams.has("signal.location.query"));
  assert.equal(calls[1].options.headers["X-Api-Key"], "test-only-value");
  assert.throws(() => client.demographics([]), { status: 400 });
});

test("storefront fixtures return entity affinities and per-entity signed demographic scores", async () => {
  const client = new QlooClient({ apiKey: "" });
  const brands = await client.locationInsights("Seongsu-dong, Seoul");
  assert.ok(brands.results.entities.length);
  const ids = brands.results.entities.map((entity) => entity.entity_id);
  const demographic = await client.demographics(ids);
  assert.equal(demographic.results.demographics.length, ids.length);
  assert.deepEqual(demographic.results.demographics.map((item) => item.entity_id), ids);
  for (const item of demographic.results.demographics) {
    assert.deepEqual(Object.keys(item.query.age), ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"]);
    assert.deepEqual(Object.keys(item.query.gender), ["male", "female"]);
    assert.ok(Object.values(item.query.age).some((affinity) => affinity < 0));
  }
  const alternative = await client.locationInsights("Lyon");
  assert.notEqual(brands.results.entities[0].entity_id, alternative.results.entities[0].entity_id);
});
