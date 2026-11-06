// Opt-in maintenance tool. Supply the key on stdin; never print or persist it.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { designRoom } from "../server/agent.js";
import { QlooClient, replayRequestKey } from "../server/qloo.js";

const destination = new URL("../server/qloo-recordings.new.json", import.meta.url);
if (existsSync(destination)) throw new Error("Move the previous new recording aside before refreshing.");

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const apiKey = Buffer.concat(chunks).toString().trim();
if (!apiKey) throw new Error("Supply a Qloo key on stdin.");
const a = ["Amélie", "Radiohead", "MUJI"];
const b = ["Spirited Away", "Björk", "IKEA"];
const cases = [
  { mode: "solo", room: "Living room", people: [{ tastes: a }] },
  { mode: "solo", room: "Bedroom", people: [{ tastes: b }] },
  { mode: "shared", room: "Living room", people: [{ tastes: a }, { tastes: b }] },
  { mode: "storefront", neighborhood: "Seongsu-dong, Seoul", business: "Cafe", area: 50, references: [] },
];
// Retain observed fields used by the planner, excluding contact/location metadata.
const fields = new Set(["success", "results", "entities", "tags", "demographics", "duration", "entity_id", "id", "name", "type", "types", "subtype", "tag_id", "tag_value", "query", "affinity", "age", "gender", "male", "female", "24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"]);
function project(value) {
  if (Array.isArray(value)) return value.map(project);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => fields.has(key)).map(([key, entry]) => [key, project(entry)]));
  return value;
}
const entries = new Map();
const recordings = new Map();
const fetchImpl = async (url, options) => {
  const key = replayRequestKey(url);
  if (recordings.has(key)) return Response.json(recordings.get(key));
  const response = await fetch(url, options);
  if (response.ok) {
    const body = await response.clone().json();
    if (body.results && typeof body.results === "object" && body.success !== false && (url.pathname === "/search" || body.success === true)) {
      const data = project(body);
      if (JSON.stringify(data).includes(apiKey)) throw new Error("Secret detected; capture stopped.");
      entries.set(key, { request: key, capturedAt: new Date().toISOString(), response: data });
      recordings.set(key, data);
    }
  }
  return response;
};
const completed = [];
for (const input of cases) {
  try {
    const client = new QlooClient({ apiKey, fetchImpl, replayEntries: [] });
    const result = await designRoom(input, { client, env: {} });
    completed.push(input);
    console.log(`Captured ${input.mode}: ${result.evidence.length} evidence items.`);
  } catch {
    console.log(`Capture incomplete: ${input.mode}; no invented response was saved.`);
  }
}
await writeFile(destination, JSON.stringify({
  source: "https://hackathon.api.qloo.com",
  note: "Actual Qloo responses, projected to planner fields; no credentials, private user inputs or contact metadata.",
  cases: completed,
  entries: [...entries.values()],
}, null, 2) + "\n", { flag: "wx" });
console.log(`Saved ${entries.size} responses for ${completed.length} complete representative questions.`);
if (completed.length < 3) process.exitCode = 1;
