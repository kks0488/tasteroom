// Raw responses belong outside the public repository. Never pass keys on argv.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { designRoom } from "../server/agent.js";

const profiles = [
  { room: "Living room", name: "Alex", tastes: ["Amélie", "Radiohead", "MUJI"] },
  { room: "Home office", name: "Morgan", tastes: ["Blade Runner", "Daft Punk", "Nike"] },
  { room: "Bedroom", name: "Sam", tastes: ["Spirited Away", "Björk", "IKEA"] },
];
const output = process.env.SAMPLE_DIR;
if (!output || path.resolve(output).startsWith(process.cwd() + path.sep))
  throw new Error("Set SAMPLE_DIR to a private directory outside this repository.");
await fs.mkdir(output, { recursive: true });
const local = process.argv.includes("--local");
const base = process.env.GATE_URL || "https://tasteroom-rho.vercel.app";
const runs = local ? 1 : 2;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const [index, profile] of profiles.entries()) {
  for (let run = 1; run <= runs; run++) {
    const input = { mode: "solo", room: profile.room, people: [{ name: profile.name, tastes: profile.tastes }] };
    const file = path.join(output, `${stamp}-${local ? "upstream" : "production"}-p${index + 1}-r${run}.json`);
    const records = [];
    const observedFetch = async (url, options) => {
      const response = await fetch(url, options);
      records.push({ url: String(url), method: options.method,
        request: options.body ? JSON.parse(options.body) : undefined,
        status: response.status, response: await response.clone().json() });
      return response;
    };
    const started = Date.now();
    let result, status;
    try {
      if (local) {
        assert.ok(process.env.QLOO_API_KEY && process.env.LLM_API_KEY);
        result = await designRoom(input, { fetchImpl: observedFetch }); status = 200;
      } else {
        const response = await fetch(`${base}/api/design`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input), signal: AbortSignal.timeout(65000) });
        status = response.status; result = await response.json();
      }
      // Persist before checking, exactly as received, including any failing output.
      await fs.writeFile(file, JSON.stringify({ label: "RAW output, unedited", timestamp: new Date().toISOString(),
        model: "nvidia/Nemotron-3_5-Lightning", source: local ? "direct upstream instrumentation" : base,
        input, status, elapsedMs: Date.now() - started, records, result }, null, 2), { flag: "wx", mode: 0o600 });
      assert.equal(status, 200, JSON.stringify(result));
      assert.equal(result.mode, "live");
      assert.equal(result.reasoning, "LLM tool-calling agent", JSON.stringify(result.warnings));
      assert.equal(result.brief.room, profile.room);
      assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
      assert.ok(result.brief.title && result.brief.story && result.evidence.length);
      assert.equal(result.resolved[0].entities.length, 3);
      assert.equal(result.brief.palette.length, 4);
      assert.equal(result.brief.materials.length, 3);
      assert.equal(result.brief.shopping.length, 5);
      const ids = new Set(result.evidence.map(e => e.id));
      for (const reason of [result.brief.paletteReason, ...result.brief.materials.map(m => m.reason), result.brief.furniture.reason, result.brief.lightingReason]) {
        assert.ok(reason.text.length > 25 && reason.evidence.length);
        assert.ok(reason.evidence.every(id => ids.has(id)), "Invented evidence reference");
      }
      const prose = JSON.stringify(result.brief);
      assert.doesNotMatch(prose, /\b(best|guaranteed|perfect|100%)\b|\[needs info\]|placeholder/i);
      for (const scene of result.brief.lighting) assert.match(scene.kelvin, /^\d{4}K$/);
      if (local) {
        const actual = new Set();
        for (const record of records.filter(r => r.url.startsWith("https://hackathon.api.qloo.com"))) {
          const raw = record.response.results;
          const entities = Array.isArray(raw) ? raw : raw?.entities || raw?.tags || [];
          for (const e of entities) {
            actual.add(`${e.entity_id || e.tag_id}|${e.name}`);
            for (const tag of e.tags || []) actual.add(`${tag.id || tag.tag_id}|${tag.name}`);
          }
        }
        for (const e of result.evidence) assert.ok(actual.has(`${e.key}|${e.name}`), `Unreturned evidence: ${e.name}`);
      }
      console.log(`PASS p${index + 1} r${run}: ${result.brief.title} (${Date.now() - started}ms) -> ${file}`);
    } catch (error) {
      try { await fs.access(file); } catch {
        await fs.writeFile(file, JSON.stringify({ input, records, error: error.message }, null, 2), { flag: "wx", mode: 0o600 });
      }
      throw error;
    }
  }
}
