// Offline integration check: the real dev server, loopback only, always shut down.
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import recordings from "../server/qloo-recordings.json" with { type: "json" };

const reservation = net.createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const preload = `globalThis.fetch = async () => { throw new Error("Offline replay verification: external requests disabled"); };`;
const child = spawn(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "server/dev.js"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port), QLOO_API_KEY: "local-invalid", LLM_API_KEY: "", LLM_MODEL: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = once(child, "exit");
const base = `http://127.0.0.1:${port}`;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Local server did not start")), 15000);
    child.stdout.on("data", data => {
      if (data.toString().includes("TasteRoom listening")) { clearTimeout(timer); resolve(); }
    });
    child.once("exit", () => { clearTimeout(timer); reject(Error("Local server exited before readiness")); });
  });
  const home = await fetch(base, { signal: AbortSignal.timeout(10000) });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /TasteRoom/);
  for (const input of recordings.cases) {
    const response = await fetch(base + "/api/design", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.mode, "replay");
    assert.ok(data.evidence.length);
    assert.ok(data.warnings.some(w => w.includes("saved real Qloo responses")));
    console.log(`Local HTTP 200: ${input.mode}, saved real evidence and warning verified.`);
  }
  const unknown = structuredClone(recordings.cases[0]);
  unknown.people[0].tastes[0] = "unrecorded-personal-taste";
  const response = await fetch(base + "/api/design", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(unknown), signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 503);
  console.log("Local HTTP 503: unrecorded input stays unavailable.");
} finally {
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
}
await assert.rejects(fetch(base, { signal: AbortSignal.timeout(1500) }));
console.log("Loopback server stopped; no external provider requests were made.");
