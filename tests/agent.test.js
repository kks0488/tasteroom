import { test } from "node:test";
import assert from "node:assert/strict";
import {
  designRoom,
  validateInput,
  compareSignals,
  agentTools,
} from "../server/agent.js";
import handler from "../api/design.js";
import { QlooClient } from "../server/qloo.js";
const a = {
  name: "Alex",
  tastes: ["The Quiet Atlas", "Low Tide Radio", "North Window House"],
};
const b = {
  name: "Sam",
  tastes: ["Paper Sun Parade", "Sunday Brass Club", "Clay Market Kitchen"],
};
const input = (people = [a], room = "Living room") => ({
  mode: people.length === 2 ? "shared" : "solo",
  room,
  people,
});
const demo = { env: { QLOO_API_KEY: "" } };
const llmEnv = {
  QLOO_API_KEY: "",
  LLM_API_KEY: "test-only",
  LLM_MODEL: "test-model",
};
const requiredReasons = ["palette", "material0", "material1", "material2", "furniture", "lighting"];
const completeReasons = (id = "E1") => Object.fromEntries(
  requiredReasons.map((key) => [key, {
    text: `The returned cultural signal is a creative starting point for this ${key} choice.`,
    evidence: [id],
  }]),
);
const finishResponse = (args = {}) => Response.json({
  choices: [{ message: { role: "assistant", content: null, tool_calls: [{
    id: "finish-test", type: "function", function: {
      name: "finish_brief",
      arguments: JSON.stringify({
        direction: "calm", title: "A cited room", story: "A creative interpretation of the supplied cultural evidence.",
        reasons: completeReasons(), ...args,
      }),
    },
  }] } }],
});
const assertLlmFallback = (result) => {
  assert.equal(result.reasoning, "Deterministic planner");
  assert.ok(result.warnings.some((w) => w.includes("LLM reasoning was unavailable")));
  assert.ok(!result.steps.some((s) => s.tool === "finish_brief"));
};
test("planner translates contrasting cultural profiles into different rooms", async () => {
  const quiet = await designRoom(input(), demo),
    vibrant = await designRoom(input([b]), demo);
  assert.equal(quiet.mode, "demo");
  assert.equal(quiet.brief.direction, "calm");
  assert.equal(vibrant.brief.direction, "warm");
  assert.notDeepEqual(quiet.brief.palette, vibrant.brief.palette);
  assert.ok(quiet.steps.some((s) => s.tool === "qloo.search"));
  assert.equal(quiet.steps.filter((s) => s.tool === "qloo.insights").length, 5);
  for (const result of [quiet, vibrant]) {
    const valid = new Set(result.evidence.map((e) => e.id));
    for (const reason of [
      result.brief.paletteReason,
      result.brief.furniture.reason,
      result.brief.lightingReason,
      ...result.brief.materials.map((m) => m.reason),
    ]) {
      assert.ok(reason.evidence.length);
      assert.ok(reason.evidence.every((id) => valid.has(id)));
    }
  }
});
test("shared room uses Analysis Compare evidence and preserves distinct personal corners", async () => {
  const result = await designRoom(input([a, b]), demo);
  assert.equal(result.brief.direction, "balanced");
  assert.ok(result.comparison.shared.some((s) => s.name === "Warm"));
  assert.ok(result.comparison.aOnly.some((s) => s.name === "Minimalism"));
  assert.ok(result.comparison.bOnly.some((s) => s.name === "Colorful"));
  assert.equal(result.comparison.bridges[0].name, "Soft Geometry Works");
  assert.ok(result.steps.some((s) => s.tool === "qloo.compare"));
  assert.ok(
    result.brief.paletteReason.evidence.some(
      (id) => result.evidence.find((e) => e.id === id)?.person === -1,
    ),
  );
  assert.notEqual(
    result.brief.profiles[0].accent,
    result.brief.profiles[1].accent,
  );
});
test("shared palette and materials follow common tastes and ranked comparison tags", async () => {
  const quiet = await designRoom(input([a, { ...a, name: "Sam" }]), demo);
  const expressive = await designRoom(input([b, { ...b, name: "Alex" }]), demo);
  assert.equal(quiet.brief.direction, "calm");
  assert.equal(expressive.brief.direction, "warm");
  assert.notDeepEqual(quiet.brief.palette, expressive.brief.palette);
  assert.notDeepEqual(
    quiet.brief.materials.map((m) => m.name),
    expressive.brief.materials.map((m) => m.name),
  );
  class ChangedAnchors extends QlooClient {
    async compare() {
      return {
        success: true,
        results: [
          {
            entity_id: "00000000-0000-4000-8000-000000009999",
            name: "Copper Lantern Archive",
            tags: ["Colorful", "Jazz", "Rhythm", "Warm"].map((name) => ({
              id: name,
              name,
            })),
          },
        ],
      };
    }
  }
  const changed = await designRoom(input([a, { ...a, name: "Sam" }]), {
    client: new ChangedAnchors({ apiKey: "" }),
    env: {},
  });
  assert.equal(changed.brief.direction, "warm");
  assert.notDeepEqual(changed.brief.palette, quiet.brief.palette);
  const mixed = await designRoom(input([a, b]), demo);
  assert.equal(mixed.brief.direction, "balanced");
  assert.equal(mixed.brief.title, "Different tastes. Common ground.");
});
test("room types change anchor furniture and lighting use cases", async () => {
  const bedroom = await designRoom(input([a], "Bedroom"), demo),
    office = await designRoom(input([a], "Home office"), demo);
  assert.match(bedroom.brief.shopping[0].item, /bed/);
  assert.match(office.brief.shopping[0].item, /desk/);
  assert.notDeepEqual(bedroom.brief.lighting, office.brief.lighting);
});
test("shared bedroom and office furniture descriptions match the selected room", async () => {
  const bedroom = await designRoom(input([a, b], "Bedroom"), demo),
    office = await designRoom(input([a, b], "Home office"), demo);
  assert.match(bedroom.brief.furniture.text, /bed/);
  assert.doesNotMatch(bedroom.brief.furniture.text, /sofa/);
  assert.match(office.brief.furniture.text, /desk/);
  assert.doesNotMatch(office.brief.furniture.text, /sofa/);
  assert.match(bedroom.brief.furniture.text, /each person/);
  assert.match(office.brief.furniture.text, /each person/);
});
test("comparison is symmetric and handles no overlap honestly", () => {
  const x = [{ key: "a" }, { key: "b" }],
    y = [{ key: "b" }, { key: "c" }];
  assert.deepEqual(compareSignals(x, y).shared, [{ key: "b" }]);
  assert.deepEqual(compareSignals(y, x).shared, [{ key: "b" }]);
  assert.deepEqual(compareSignals(x, []).shared, []);
});
test("validation rejects missing people, duplicate tastes, oversized and invalid inputs", () => {
  for (const bad of [
    null,
    { ...input(), mode: "bad" },
    { ...input(), room: "Kitchen" },
    { ...input(), people: [] },
    input([{ ...a, tastes: ["x", "y", "z"] }]),
    input([{ ...a, tastes: [a.tastes[0], a.tastes[0], "Another"] }]),
    input([{ ...a, tastes: ["x".repeat(101), "valid", "third"] }]),
  ])
    assert.throws(() => validateInput(bad));
  assert.equal(validateInput(input()).people[0].name, "Alex");
});
test("unknown demo names do not fabricate entities", async () => {
  await assert.rejects(
    designRoom(
      input([{ ...a, tastes: ["Real unknown film", ...a.tastes.slice(1)] }]),
      demo,
    ),
    /fictional demo catalog/,
  );
});
test("Qloo live errors never downgrade silently to synthetic data", async () => {
  await assert.rejects(
    designRoom(input(), {
      env: { QLOO_API_KEY: "test-placeholder" },
      fetchImpl: async () => new Response("{}", { status: 429 }),
    }),
    /rate limited/,
  );
});
test("LLM runs tool-calling loop with complete cited reasons and preserves provider-error fallback", async () => {
  let turn = 0;
  const fetchImpl = async (url, opts) => {
    assert.match(
      url.href,
      /api.tokenfactory.nebius.com\/v1\/chat\/completions/,
    );
    const body = JSON.parse(opts.body);
    assert.equal(body.tools.length, 4);
    assert.equal(body.parallel_tool_calls, false);
    turn++;
    return Response.json({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: `tool${turn}`,
                type: "function",
                function:
                  turn === 1
                    ? {
                        name: "qloo_insights",
                        arguments: JSON.stringify({
                          ids: ["00000000-0000-4000-8000-000000000001"],
                          type: "urn:entity:brand",
                        }),
                      }
                    : {
                        name: "finish_brief",
                        arguments: JSON.stringify({
                          direction: "warm",
                          title: "Custom cultural room",
                          story: "A room composed through tools.",
                          reasons: {
                            ...completeReasons(),
                            furniture: {
                              text: "A tactile interpretation of the returned cultural signal.",
                              evidence: ["E1"],
                            },
                          },
                        }),
                      },
              },
            ],
          },
        },
      ],
    });
  };
  const result = await designRoom(input(), {
    env: {
      QLOO_API_KEY: "",
      LLM_API_KEY: "test-placeholder",
      LLM_MODEL: "test-model",
    },
    fetchImpl,
  });
  assert.equal(turn, 2);
  assert.equal(result.reasoning, "LLM tool-calling agent");
  assert.equal(result.brief.title, "Custom cultural room");
  assert.equal(result.warnings.length, 0);
  const paletteSignal = result.evidence.find((e) => e.id === result.brief.paletteReason.evidence[0]);
  assert.ok(result.brief.paletteReason.text.includes(paletteSignal.name));
  for (const color of result.brief.palette) {
    assert.ok(result.brief.paletteReason.text.includes(color.name));
    assert.ok(result.brief.paletteReason.text.includes(color.hex));
  }
  assert.deepEqual(result.brief.furniture.reason.evidence, ["E1"]);
  const fallback = await designRoom(input(), {
    env: {
      QLOO_API_KEY: "",
      LLM_API_KEY: "test-placeholder",
      LLM_MODEL: "test-model",
    },
    fetchImpl: async () => new Response("{}", { status: 503 }),
  });
  assert.equal(fallback.reasoning, "Deterministic planner");
  assert.match(fallback.warnings[0], /LLM reasoning was unavailable/);
});
test("valid LLM choices cannot insert invented Qloo guarantees, venue ambience or personal preferences", async () => {
  const invented = "Qloo guarantees Alex always prefers brass interiors. Velvet Observatory has a cedar-scented lounge and a coral velvet ceiling.";
  const reasons = Object.fromEntries(requiredReasons.map((key) => [key, { text: invented, evidence: ["E1"] }]));
  const result = await designRoom(input(), {
    env: llmEnv,
    fetchImpl: async () => finishResponse({ direction: "warm", title: "A warm interpretation", story: invented, reasons }),
  });
  assert.equal(result.reasoning, "LLM tool-calling agent");
  assert.equal(result.warnings.length, 0);
  assert.equal(result.brief.direction, "warm");
  const rendered = JSON.stringify(result.brief);
  assert.doesNotMatch(rendered, /Qloo guarantees|Alex always prefers|Velvet Observatory|cedar-scented|coral velvet ceiling/);
  for (const taste of a.tastes) assert.ok(result.brief.story.includes(taste));
  assert.match(result.brief.story, /living room/);
  const signal = result.evidence.find((e) => e.id === "E1");
  for (const reason of [result.brief.paletteReason, ...result.brief.materials.map((m) => m.reason), result.brief.furniture.reason, result.brief.lightingReason]) {
    assert.deepEqual(reason.evidence, ["E1"]);
    assert.ok(reason.text.includes(signal.name));
  }
  for (const color of result.brief.palette) {
    assert.ok(result.brief.paletteReason.text.includes(color.name));
    assert.ok(result.brief.paletteReason.text.includes(color.hex));
  }
  for (const pick of result.brief.shopping) {
    assert.deepEqual(pick.reason.evidence, ["E1"]);
    assert.ok(pick.reason.text.includes(signal.name));
  }
});
test("an invented citation rejects the whole LLM decision instead of mixing it with fallback reasons", async () => {
  const reasons = completeReasons();
  reasons.palette = { text: "Fabricated rationale with an invented reference.", evidence: ["E999"] };
  const result = await designRoom(input(), {
    env: llmEnv,
    fetchImpl: async () => finishResponse({ title: "Rejected invented room", reasons }),
  });
  assertLlmFallback(result);
  assert.notEqual(result.brief.title, "Rejected invented room");
  assert.notEqual(result.brief.paletteReason.text, reasons.palette.text);
  assert.ok(result.brief.paletteReason.evidence.every((id) => result.evidence.some((e) => e.id === id)));
});
test("missing LLM reasons cannot be presented as successful LLM reasoning", async () => {
  const result = await designRoom(input(), {
    env: llmEnv,
    fetchImpl: async () => finishResponse({ title: "Rejected empty room", reasons: {} }),
  });
  assertLlmFallback(result);
  assert.notEqual(result.brief.title, "Rejected empty room");
});
test("blank rationales and uncited material choices reject the whole LLM decision", async () => {
  for (const invalid of [
    { text: "   \n ", evidence: ["E1"] },
    { text: "A creative material interpretation without any supporting reference.", evidence: [] },
  ]) {
    const reasons = { ...completeReasons(), material1: invalid };
    const result = await designRoom(input(), {
      env: llmEnv, fetchImpl: async () => finishResponse({ reasons }),
    });
    assertLlmFallback(result);
  }
});
test("shared mode rejects a different model direction instead of retaining mismatched prose", async () => {
  const result = await designRoom(input([a, b]), {
    env: llmEnv,
    fetchImpl: async () => finishResponse({ direction: "warm", title: "Rejected all-warm room", story: "An entirely warm palette of marigold and plum." }),
  });
  assertLlmFallback(result);
  assert.equal(result.brief.direction, "balanced");
  assert.notEqual(result.brief.title, "Rejected all-warm room");
  assert.doesNotMatch(result.brief.story, /marigold and plum/);
});
test("LLM sees the actual bedroom and office furniture and lighting before composing reasons", async () => {
  for (const [room, anchor, lightingUse] of [["Bedroom", /bed/i, /bedside/i], ["Home office", /desk/i, /desk/i]]) {
    let context;
    const result = await designRoom(input([a], room), {
      env: llmEnv,
      fetchImpl: async (url, options) => {
        context = JSON.parse(JSON.parse(options.body).messages[1].content);
        return finishResponse({ direction: "warm" });
      },
    });
    assert.equal(result.reasoning, "LLM tool-calling agent");
    assert.ok(context?.availableDesigns);
    const designs = Object.values(context.availableDesigns);
    assert.ok(designs.length);
    for (const design of designs) {
      const furniture = typeof design.furniture === "string" ? design.furniture : design.furniture.text;
      assert.match(furniture, anchor);
      assert.doesNotMatch(furniture, /sofa/i);
      assert.ok(Array.isArray(design.lighting));
      assert.match(JSON.stringify(design.lighting), lightingUse);
    }
    const chosen = context.availableDesigns[result.brief.direction];
    assert.ok(chosen);
    assert.equal(typeof chosen.furniture === "string" ? chosen.furniture : chosen.furniture.text, result.brief.furniture.text);
    assert.deepEqual(chosen.lighting, result.brief.lighting);
  }
});
test("every furniture and decor shopping pick has its own valid evidence-linked explanation", async () => {
  for (const room of ["Living room", "Bedroom", "Home office"]) {
    for (const people of [[a], [a, b]]) {
      const result = await designRoom(input(people, room), demo);
      const ids = new Set(result.evidence.map((e) => e.id));
      assert.equal(result.brief.shopping.length, 5);
      for (const pick of result.brief.shopping) {
        assert.ok(pick.reason?.text.trim().length > 25, `${room}: ${pick.category} needs an explanation`);
        assert.ok(pick.reason.evidence.length, `${room}: ${pick.category} needs evidence`);
        assert.ok(pick.reason.evidence.every((id) => ids.has(id)), `${room}: ${pick.category} cites unknown evidence`);
      }
    }
  }
});
test("new LLM tool discoveries receive reusable final evidence IDs without duplicates", async () => {
  const discoveredId = "00000000-0000-4000-8000-000000009999";
  class DiscoveryClient extends QlooClient {
    insights(ids, type) {
      if (ids.length !== 1) return super.insights(ids, type);
      return Promise.resolve({
        success: true,
        results: {
          entities: [
            {
              entity_id: discoveredId,
              name: "Copper Lantern Archive",
              tags: [
                { id: "urn:tag:style:tasteroom:colorful", name: "Colorful" },
              ],
              query: { affinity: 0.9 },
            },
          ],
        },
      });
    }
  }
  let turn = 0,
    discoveredEvidence;
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    turn++;
    if (turn > 1) {
      const output = JSON.parse(body.messages.at(-1).content);
      const evidence = output.evidence.find(
        (e) => e.name === "Copper Lantern Archive",
      );
      assert.ok(evidence?.id);
      if (discoveredEvidence) assert.equal(evidence.id, discoveredEvidence);
      discoveredEvidence = evidence.id;
    }
    const tool =
      turn < 3
        ? {
            name: "qloo_insights",
            arguments: JSON.stringify({
              ids: ["00000000-0000-4000-8000-000000000001"],
              type: "urn:entity:brand",
            }),
          }
        : {
            name: "finish_brief",
            arguments: JSON.stringify({
              direction: "warm",
              title: "A discovered room",
              story: "An interpretation of new cultural evidence.",
              reasons: {
                ...completeReasons(discoveredEvidence),
                palette: {
                  text: "The discovered cultural anchor suggests a warmer palette.",
                  evidence: [discoveredEvidence],
                },
              },
            }),
          };
    return Response.json({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: `discovery${turn}`, type: "function", function: tool },
            ],
          },
        },
      ],
    });
  };
  const result = await designRoom(input(), {
    client: new DiscoveryClient({ apiKey: "" }),
    env: { LLM_API_KEY: "test-only", LLM_MODEL: "test-model" },
    fetchImpl,
  });
  assert.equal(result.reasoning, "LLM tool-calling agent");
  assert.deepEqual(result.brief.paletteReason.evidence, [discoveredEvidence]);
  assert.equal(
    result.evidence.filter((e) => e.name === "Copper Lantern Archive").length,
    1,
  );
  assert.equal(
    result.evidence.find((e) => e.id === discoveredEvidence).entityId,
    discoveredId,
  );
  assert.ok(result.evidence.length <= 80);
});
test("oversized parallel tool messages fall back before running partial tool batches", async () => {
  let insightsCalls = 0,
    modelCalls = 0;
  class CountingClient extends QlooClient {
    insights(ids, type) {
      insightsCalls++;
      return super.insights(ids, type);
    }
  }
  const fetchImpl = async (url, options) => {
    modelCalls++;
    assert.equal(JSON.parse(options.body).parallel_tool_calls, false);
    return Response.json({
      choices: [
        {
          message: {
            role: "assistant",
            tool_calls: Array.from({ length: 5 }, (_, i) => ({
              id: `too-many-${i}`,
              type: "function",
              function: {
                name: "qloo_insights",
                arguments: JSON.stringify({
                  ids: ["00000000-0000-4000-8000-000000000001"],
                  type: "urn:entity:brand",
                }),
              },
            })),
          },
        },
      ],
    });
  };
  const result = await designRoom(input(), {
    client: new CountingClient({ apiKey: "" }),
    env: { LLM_API_KEY: "test-only", LLM_MODEL: "test-model" },
    fetchImpl,
  });
  assert.equal(result.reasoning, "Deterministic planner");
  assert.equal(modelCalls, 1);
  assert.equal(insightsCalls, 5);
  assert.ok(
    result.warnings.some((w) => w.includes("LLM reasoning was unavailable")),
  );
});
test("API rejects malformed input and non-POST without calling upstream", async () => {
  const res = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(s) {
      this.code = s;
      return this;
    },
    json(d) {
      this.body = d;
      return this;
    },
  };
  await handler({ method: "GET" }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.Allow, "POST");
  await handler({ method: "POST", body: { mode: "bad" } }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.error, /Choose/);
});
