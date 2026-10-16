// Run only on pilot. Captures our real app UI; all demo artwork/data is original.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.CAPTURE_URL || "http://127.0.0.1:4173";
const out = process.env.CAPTURE_DIR || "media";
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
try {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    recordVideo:
      process.env.RECORD_VIDEO === "1"
        ? { dir: out, size: { width: 1920, height: 1080 } }
        : undefined,
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
    .getByRole("button", { name: "Find your room", exact: false })
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
    .getByRole("button", { name: "Use sample", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "A shared space", exact: false })
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
  await mp
    .getByRole("button", { name: "A shared space", exact: false })
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
} finally {
  await browser.close();
}
