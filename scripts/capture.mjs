// Run only on pilot. Captures our real app UI; all demo artwork/data is original.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile, rename } from "node:fs/promises";
const base = process.env.CAPTURE_URL || "http://127.0.0.1:4173";
const liveCapture = process.env.CAPTURE_LIVE === "1";
const out = process.env.CAPTURE_DIR || "media";
if (liveCapture && !process.env.CAPTURE_DIR)
  throw new Error("CAPTURE_LIVE requires a private CAPTURE_DIR outside the repository.");
if (liveCapture) {
  const target = path.resolve(out), repo = process.cwd();
  if (target === repo || target.startsWith(repo + path.sep))
    throw new Error("Live captures must be saved outside the repository.");
}
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const issues = [],
  checks = [],
  consoleErrors = [];
async function captureLive() {
  const securityFindings = [], liveChecks = [], securityChecks = [];
  const statistics = { actualDesignRequests: 0, mobileResponseReplays: 0, monitoredRequests: 0 };
  let desktop, mobile, failure;
  const observe = (context, label) => {
    context.on("request", (request) => {
      statistics.monitoredRequests++;
      const url = new URL(request.url());
      const body = request.postData() || "";
      if (label === "desktop" && url.pathname === "/api/design" && request.method() === "POST")
        statistics.actualDesignRequests++;
      securityChecks.push((async () => {
      // allHeaders includes security-related headers omitted by headers().
      const headers = await request.allHeaders();
      if (/^(?:.*\.)?(?:qloo\.com|nebius\.com)$/.test(url.hostname))
        securityFindings.push({ label, kind: "Direct sponsor request", host: url.hostname });
      if (Object.keys(headers).some((key) => key.toLowerCase() === "x-api-key") ||
          /^bearer\s+/i.test(headers.authorization || "") ||
          /["']?(?:x-api-key|authorization|qloo_api_key|llm_api_key)["']?\s*[:=]/i.test(body) ||
          /bearer\s+[a-z0-9._-]{10,}/i.test(body))
        securityFindings.push({ label, kind: "Secret-shaped request header or body", path: url.pathname });
      })().catch(() => securityFindings.push({ label, kind: "Request security inspection failed", path: url.pathname })));
    });
    context.on("page", (page) => page.on("pageerror", (e) => consoleErrors.push(e.message)));
  };
  const noOverflow = async (page, label) => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label}: horizontal overflow`);
    liveChecks.push(`${label}: no horizontal overflow`);
  };
  const audit = async (page, label) => {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    for (const v of result.violations)
      issues.push({ label, id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) });
  };
  const checkInitial = async (page, label) => {
    await page.goto(base, { waitUntil: "networkidle" });
    await page.getByText("Live cultural discovery is configured.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^My Room/ }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#demo-tastes").count(), 0);
    assert.equal(await page.getByLabel("Person 1 taste 1", { exact: true }).inputValue(), "Amélie");
    assert.equal(await page.getByLabel("Person 1 taste 2", { exact: true }).inputValue(), "Radiohead");
    assert.equal(await page.getByLabel("Person 1 taste 3", { exact: true }).inputValue(), "MUJI");
    assert.equal(await page.getByRole("button", { name: /Use fictional sample/ }).count(), 0);
    liveChecks.push(`${label}: My Room default, live banner, genuine sample tastes, no synthetic datalist`);
  };
  try {
    desktop = await browser.newContext({
      viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: "reduce",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    observe(desktop, "desktop");
    const page = await desktop.newPage();
    page.setDefaultTimeout(65000);
    await checkInitial(page, "desktop");
    await noOverflow(page, "desktop inputs");
    await page.screenshot({ path: `${out}/live-desktop-inputs.png`, fullPage: true });
    await audit(page, "live desktop inputs");
    await page.getByRole("button", { name: "Use real sample", exact: false }).click();
    const received = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/design" && response.request().method() === "POST", { timeout: 65000 });
    await page.getByRole("button", { name: "Translate my taste" }).click();
    const response = await received;
    const raw = await response.text();
    await writeFile(`${out}/browser-live-raw.json`, raw, { mode: 0o600 });
    assert.equal(response.status(), 200, "Actual live browser request failed; inspect browser-live-raw.json");
    const result = JSON.parse(raw);
    assert.equal(result.mode, "live");
    assert.equal(result.reasoning, "LLM tool-calling agent");
    assert.deepEqual(result.warnings, []);
    assert.ok(result.evidence.length);
    await page.getByText("LIVE QLOO DATA", { exact: true }).waitFor();
    assert.ok(await page.locator(".planner-badge").getByText("LLM tool-calling agent", { exact: true }).isVisible());
    assert.equal(await page.getByText("SYNTHETIC DEMO DATA", { exact: true }).count(), 0);
    await page.locator(".results").scrollIntoViewIfNeeded();
    await noOverflow(page, "desktop result");
    await page.screenshot({ path: `${out}/live-desktop-brief.png`, fullPage: true });
    liveChecks.push("One actual live UI submission returned Qloo evidence and LLM reasoning without warnings; raw response saved unchanged");
    const picks = page.locator(".shopping-card label");
    assert.equal(await picks.count(), 5);
    const ids = new Set(result.evidence.map((e) => e.id));
    const normalize = (text) => text.replace(/\s+/g, " ").trim();
    for (const [index, pick] of result.brief.shopping.entries()) {
      assert.ok(pick.reason.text.trim().length > 25 && pick.reason.evidence.length);
      assert.ok(pick.reason.evidence.every((id) => ids.has(id)));
      assert.ok(normalize(await picks.nth(index).innerText()).includes(normalize(pick.reason.text)));
    }
    await page.locator(".shopping-card input").first().check();
    assert.equal(await page.locator(".shopping-card input").first().isChecked(), true);
    liveChecks.push("All five shopping picks display evidence-linked reasons; checklist works");
    await page.getByRole("button", { name: /Inspect signal/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const dialogText = await dialog.innerText();
    assert.match(dialogText, /Qloo API response/);
    assert.doesNotMatch(dialogText, /Original synthetic fixture/);
    assert.ok(result.evidence.some((e) => dialogText.includes(e.name) && dialogText.includes(e.entityId || e.key)));
    await page.screenshot({ path: `${out}/live-evidence-dialog.png` });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    liveChecks.push("Real signal dialog identifies Qloo API source/entity and closes with Escape");
    await page.getByRole("button", { name: /Copy brief/ }).click();
    await page.getByRole("button", { name: "Copied ✓", exact: true }).waitFor();
    const exported = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(exported.includes(result.brief.title) && exported.includes("LIVE DATA"));
    for (const pick of result.brief.shopping) {
      assert.ok(exported.includes(pick.item));
      assert.ok(exported.includes(`Why: ${pick.reason.text}`));
    }
    liveChecks.push("Clipboard export includes live label, every shopping pick and its why");
    await audit(page, "live desktop brief");
    mobile = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, reducedMotion: "reduce",
    });
    observe(mobile, "mobile replay");
    // Only the exact JSON received above is replayed; this is not a second live generation.
    await mobile.route("**/api/design", async (route) => {
      assert.equal(route.request().method(), "POST");
      const submitted = route.request().postDataJSON();
      assert.equal(submitted.mode, "solo");
      assert.equal(submitted.room, "Living room");
      assert.deepEqual(submitted.people[0].tastes, ["Amélie", "Radiohead", "MUJI"]);
      statistics.mobileResponseReplays++;
      await route.fulfill({ status: response.status(), contentType: "application/json", body: raw });
    });
    const mp = await mobile.newPage();
    mp.setDefaultTimeout(65000);
    await checkInitial(mp, "390px mobile");
    await noOverflow(mp, "390px mobile inputs");
    await mp.screenshot({ path: `${out}/live-mobile-inputs.png`, fullPage: true });
    await mp.getByRole("button", { name: "Translate my taste" }).click();
    await mp.getByText("LIVE QLOO DATA", { exact: true }).waitFor();
    await noOverflow(mp, "390px mobile actual-response replay");
    await mp.locator(".results").scrollIntoViewIfNeeded();
    await mp.screenshot({ path: `${out}/live-mobile-brief-replay.png`, fullPage: true });
    await audit(mp, "live mobile actual-response replay");
    liveChecks.push("390px mobile renders the same unedited actual response via route replay; no second live generation");
    assert.equal(statistics.actualDesignRequests, 1);
    assert.equal(statistics.mobileResponseReplays, 1);
    await Promise.all(securityChecks);
    assert.equal(securityFindings.length, 0, "Browser exposed secret-shaped credentials or direct sponsor traffic");
    liveChecks.push("Browser request headers/bodies contain no API-key/Bearer fields; no direct Qloo/Nebius traffic");
    assert.equal(consoleErrors.length, 0, "Browser runtime errors");
    assert.equal(issues.filter((v) => ["critical", "serious"].includes(v.impact)).length, 0, "Critical/serious accessibility violations");
  } catch (error) {
    failure = error;
  } finally {
    await desktop?.close();
    await mobile?.close();
    await writeFile(`${out}/verification.json`, JSON.stringify({
      base, mode: "live", passed: !failure, viewport: "1920x1080 and 390x844",
      checks: liveChecks, ...statistics,
      mobileEvidence: "Replay of the one actual desktop API response, unedited; not a second live generation",
      rawResponse: "browser-live-raw.json", consoleErrors, securityFindings,
      accessibilityViolations: issues, failure: failure?.message,
    }, null, 2) + "\n", { mode: 0o600 });
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ mode: "live", checks: liveChecks.length, ...statistics, consoleErrors, securityFindings, accessibilityViolations: issues }, null, 2));
}
try {
  if (liveCapture) {
    await captureLive();
  } else {
  const storefront = await browser.newContext({
    viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: "reduce",
    ...(process.env.RECORD_VIDEO === "1" ? {recordVideo:{dir:out,size:{width:1920,height:1080}}} : {}),
  });
  const sp = await storefront.newPage();
  sp.on("pageerror",e=>consoleErrors.push(e.message));
  await sp.goto(base,{waitUntil:"networkidle"});
  const shot = async name => {
    await sp.waitForTimeout(700);
    await sp.screenshot({path:`${out}/${name}.png`});
  };
  await shot("09-storefront-hero");
  await sp.getByRole("button",{name:/^Storefront/}).click();
  await sp.locator("#studio").evaluate(el=>el.scrollIntoView({block:"start",behavior:"instant"}));
  await shot("10-storefront-before");
  const reference = await sp.locator(".space-reference .store-art").screenshot({type:"png"});
  await sp.getByLabel("Photo of your empty space").setInputFiles({name:"our-empty-shop.png",mimeType:"image/png",buffer:reference});
  await sp.getByText(/px · preview only/).waitFor();
  let submitted;
  sp.on("request",r=>{if(r.url().endsWith("/api/design") && r.method()==="POST") submitted=r.postDataJSON();});
  await sp.getByRole("button",{name:"Create store concept"}).click();
  await sp.locator(".budget-card").waitFor();
  assert.equal(submitted.mode,"storefront");
  assert.equal(submitted.photo,undefined);
  await sp.locator(".results").evaluate(el=>el.scrollIntoView({block:"start",behavior:"instant"}));
  await shot("11-storefront-after");
  await sp.locator(".material-grid").scrollIntoViewIfNeeded();
  await shot("12-storefront-materials");
  await sp.getByRole("button",{name:/Inspect signal/}).first().click();
  await sp.getByRole("dialog").waitFor();
  assert.match(await sp.getByRole("dialog").innerText(),/signal.location.query/);
  await shot("13-storefront-trace");
  await sp.keyboard.press("Escape");
  await sp.locator(".audience-card").scrollIntoViewIfNeeded();
  await shot("14-storefront-audience");
  await sp.locator(".budget-card").scrollIntoViewIfNeeded();
  assert.match(await sp.locator(".budget-card").innerText(),/not a quote/);
  await shot("15-storefront-budget");
  const sa = await new AxeBuilder({page:sp}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  for(const v of sa.violations) issues.push({label:"storefront",id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)});
  checks.push("Storefront uploads a local-only image, researches location/audience, produces cited concept and rough USD budget");
  const video = sp.video();
  await storefront.close();
  if(video) { const raw=await video.path(); await rename(raw,`${out}/storefront-flow.webm`); }
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.screenshot({
    path: `${out}/01-studio.jpg`,
    type: "jpeg",
    quality: 86,
  });
  await page
    .getByRole("button", { name: /^Create my room brief/ })
    .click();
  await page.screenshot({
    path: `${out}/02-taste-inputs.jpg`,
    type: "jpeg",
    quality: 86,
  });
  const audit = async (label) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    for (const v of results.violations)
      issues.push({
        label,
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      });
  };
  await audit("input");
  await page.getByRole("button", {name:/^My Room/}).click();
  await page.getByRole("button", { name: "Translate my taste" }).click();
  await page
    .getByRole("heading", { name: "A quieter kind of character." })
    .waitFor();
  await page
    .locator(".results")
    .evaluate((el) =>
      el.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await page.waitForTimeout(120);
  await page.screenshot({
    path: `${out}/03-personal-brief.jpg`,
    type: "jpeg",
    quality: 86,
  });
  assert.ok(
    await page.getByText("SYNTHETIC DEMO DATA", { exact: true }).isVisible(),
  );
  checks.push("Personal brief uses synthetic demo label and calm direction");
  await audit("personal brief");
  await page
    .getByRole("button", { name: "Inspect signal", exact: false })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  assert.match(
    await page.getByRole("dialog").innerText(),
    /Original synthetic fixture/,
  );
  await page.screenshot({
    path: `${out}/04-taste-trace.jpg`,
    type: "jpeg",
    quality: 86,
  });
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  checks.push("Taste trace modal opens, labels its source, closes with Escape");
  await page
    .getByLabel("Person 1 taste 1", { exact: true })
    .fill("Paper Sun Parade");
  await page
    .getByLabel("Person 1 taste 2", { exact: true })
    .fill("Sunday Brass Club");
  await page
    .getByLabel("Person 1 taste 3", { exact: true })
    .fill("Clay Market Kitchen");
  await page.getByRole("button", { name: "Translate my taste" }).click();
  await page
    .getByRole("heading", { name: "Collected, never coordinated." })
    .waitFor();
  checks.push(
    "Expressive cultural inputs materially change palette and room direction",
  );
  await page
    .getByRole("button", { name: "Use fictional sample", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^Shared Space/ })
    .click();
  await page.getByRole("button", { name: "Find our common ground" }).click();
  await page
    .getByRole("heading", { name: "Different tastes. Common ground." })
    .waitFor();
  await page
    .locator(".results")
    .evaluate((el) =>
      el.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await page.waitForTimeout(120);
  await page.screenshot({
    path: `${out}/05-shared-brief.jpg`,
    type: "jpeg",
    quality: 86,
  });
  await page
    .getByRole("heading", { name: "Meet in the middle. Keep your edges." })
    .scrollIntoViewIfNeeded();
  assert.ok(
    await page.getByRole("heading", { name: "Alex’s corner" }).isVisible(),
  );
  assert.ok(
    await page.getByRole("heading", { name: "Sam’s corner" }).isVisible(),
  );
  assert.ok(await page.getByText("Qloo / compare", { exact: true }).count());
  await page.screenshot({
    path: `${out}/06-common-ground.jpg`,
    type: "jpeg",
    quality: 86,
  });
  checks.push(
    "Shared room displays Analysis Compare tool call, overlapping signals and distinct personal corners",
  );
  await page.locator(".shopping-card input").first().check();
  assert.equal(
    await page.locator(".shopping-card input").first().isChecked(),
    true,
  );
  checks.push("Shopping checklist is interactive");
  await audit("shared brief");
  const api = await context.request.post(`${base}/api/design`, {
    data: { mode: "bad" },
  });
  assert.equal(api.status(), 400);
  checks.push("Invalid API requests return 400");
  const unknown = await context.request.post(`${base}/api/design`, {
    data: {
      mode: "solo",
      room: "Living room",
      people: [
        {
          name: "Test",
          tastes: [
            "Not in the demo catalog",
            "Low Tide Radio",
            "North Window House",
          ],
        },
      ],
    },
  });
  assert.equal(unknown.status(), 422);
  checks.push("Unknown demo tastes return 422 instead of invented entities");
  await page.getByLabel("MAKE ROOM FOR").selectOption("Home office");
  await page.getByRole("button", { name: "Find our common ground" }).click();
  await page
    .getByRole("heading", { name: "Different tastes. Common ground." })
    .waitFor();
  await page.locator(".shopping-card").scrollIntoViewIfNeeded();
  assert.match(
    await page.locator(".shopping-card").innerText(),
    /Solid wood desk/,
  );
  checks.push("Home office choice updates furniture and lighting");
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const mp = await mobile.newPage();
  mp.on("pageerror", (e) => consoleErrors.push(e.message));
  await mp.goto(base, { waitUntil: "networkidle" });
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await mp.screenshot({
    path: `${out}/07-mobile-studio.jpg`,
    type: "jpeg",
    quality: 86,
  });
  await mp.getByRole("button",{name:/^Storefront/}).click();
  await mp.getByRole("button",{name:"Create store concept"}).click();
  await mp.locator(".budget-card").waitFor();
  assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  await mp.locator(".results").evaluate(el=>el.scrollIntoView({block:"start",behavior:"instant"}));
  await mp.screenshot({path:`${out}/16-mobile-storefront.png`});
  checks.push("Storefront concept and budget fit a 390px mobile viewport");
  await mp
    .getByRole("button", { name: /^Shared Space/ })
    .click();
  await mp.getByRole("button", { name: "Find our common ground" }).click();
  await mp
    .getByRole("heading", { name: "Different tastes. Common ground." })
    .waitFor();
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await mp
    .locator(".results")
    .evaluate((el) =>
      el.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await mp.waitForTimeout(120);
  await mp.screenshot({
    path: `${out}/08-mobile-brief.jpg`,
    type: "jpeg",
    quality: 86,
  });
  const mobileAxe = await new AxeBuilder({ page: mp })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  for (const v of mobileAxe.violations)
    issues.push({
      label: "mobile shared",
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    });
  checks.push(
    "390px mobile input and shared brief render without horizontal overflow",
  );
  await mobile.close();
  await writeFile(
    `${out}/verification.json`,
    JSON.stringify(
      {
        base,
        viewport: "1920x1080 and 390x844",
        checks,
        consoleErrors,
        accessibilityViolations: issues,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        checks: checks.length,
        consoleErrors,
        accessibilityViolations: issues.map((i) => ({
          label: i.label,
          id: i.id,
          count: i.nodes.length,
          nodes: i.nodes.slice(0, 8),
        })),
      },
      null,
      2,
    ),
  );
  assert.equal(consoleErrors.length, 0, "Browser runtime errors");
  assert.equal(issues.length, 0, "Accessibility violations");
  }
} finally {
  await browser.close();
}
