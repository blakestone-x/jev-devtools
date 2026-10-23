// Observable interaction contract; run against the sample production harness.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const origin = process.env.FLOW_URL ?? "http://127.0.0.1:4230";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1710, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Run sample flow", exact: true })
    .click();
  await page.locator("#status").filter({ hasText: "approve" }).waitFor();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page.getByRole("region", { name: "Flow canvas" }).waitFor();
  await page
    .getByRole("button", { name: "Step review, jev, completed", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inspect request", exact: true })
    .click();
  await page.getByRole("button", { name: "Questions", exact: true }).click();
  await page.getByText("eligible", { exact: true }).first().waitFor();
  await page
    .getByRole("button", { name: "Hide request details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step other, output, untaken", exact: true })
    .waitFor();
  const canvas = page.getByRole("region", { name: "Flow canvas" });
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  await page.waitForTimeout(150);
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.selectOption('[aria-label="Scenario"]', "flow-manual");
  await page
    .getByRole("button", { name: "Run sample flow", exact: true })
    .click();
  await page.locator("#status").filter({ hasText: "manual-review" }).waitFor();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  // Pin the original run before checking subsequent updates.
  const rows = page.locator(".request-row");
  await rows.last().click();
  await page
    .getByRole("button", { name: "Step review, jev, completed", exact: true })
    .click();
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  const pinned = await page
    .locator(".flow-overview-canvas")
    .getAttribute("style");
  // Incoming run while visible must not replace explicit selection or camera.
  await page.evaluate(async () => {
    await fetch("/run?scenario=flow-other", { method: "POST" });
  });
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator(".flow-overview-canvas").getAttribute("style"),
    pinned,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Step review, jev, completed", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  assert.equal(
    await page.locator(".flow-overview-canvas").getAttribute("style"),
    pinned,
  );
  await rows.first().click();
  await page
    .getByRole("button", { name: "Step review, jev, untaken", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.selectOption('[aria-label="Scenario"]', "flow-cancel");
  await page
    .getByRole("button", { name: "Run sample flow", exact: true })
    .click();
  await page.waitForTimeout(200);
  await page
    .getByRole("button", { name: "Cancel sample flow", exact: true })
    .click();
  await page.locator("#status").filter({ hasText: "cancelled" }).waitFor();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await rows.first().click();
  await page
    .getByRole("button", { name: "Step triage, jev, cancelled", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  await mkdir("benchmarks/results/flows", { recursive: true });
  await page.screenshot({ path: "benchmarks/results/flows/cancelled.png" });
  console.log(
    "Flows verified: outcome paths, untaken nodes, request details, pinned camera/selection across incoming runs and reopening, cancellation.",
  );
} finally {
  await browser.close();
}
