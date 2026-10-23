import assert from "node:assert/strict";

// Public UI regression coverage for memoization: unchanged selections remain
// usable, while changed traces, selected row styling and filter fallbacks update.
// Existing hidden-drawer tests do not select a request while it is still pending.
export async function checkSelection({ page, load, settle, pulse }) {
  await load("default-history");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const selectedId = () =>
    page.locator(".detail-meta code").last().textContent();
  const raw = page.locator(".detail-body pre");
  await page.locator(".request-row").nth(3).click();
  const older = await selectedId();
  await button("Zoom diagram in").click();
  await page.locator(".lab-flow-viewport").press("ArrowRight");
  await settle();
  const camera = await page.locator(".lab-flow-canvas").getAttribute("style");
  await pulse("default-history");
  assert.equal(await selectedId(), older);
  assert.equal(
    await page.locator(".lab-flow-canvas").getAttribute("style"),
    camera,
  );
  await button("Raw").click();
  const olderRaw = await raw.textContent();
  await pulse("default-history");
  assert.equal(
    await raw.textContent(),
    olderRaw,
    "Unrelated requests preserve selected detail",
  );

  const completed = page.waitForResponse((r) =>
    r.url().includes("/bench/pulse?delay=1000"),
  );
  await page.evaluate(() => {
    void fetch("/bench/pulse?delay=1000", { method: "POST" });
  });
  const pending = page
    .locator(".request-row")
    .filter({ has: page.locator(".row-status", { hasText: "pending" }) });
  await pending.click();
  const capturedPending = JSON.parse(await raw.textContent());
  assert.equal(capturedPending.status, "pending");
  const response = await (await completed).json();
  await page.waitForFunction(() => {
    const root = document.querySelector("jev-devtools-root").shadowRoot;
    return (
      JSON.parse(root.querySelector(".detail-body pre").textContent).status ===
      "success"
    );
  });
  const success = JSON.parse(await raw.textContent());
  assert.equal(
    success.id,
    capturedPending.id,
    "The selected trace updates in place",
  );
  assert.equal(success.requestId, response.completed["default-history"]);
  assert.equal(success.result.answers.question_0.choice, "category_0");
  assert.equal(
    await page.locator(".request-row.selected .row-status").textContent(),
    "success",
  );
  assert.equal(await page.locator(".request-row.selected").count(), 1);
  await button("Flow").click();
  assert.match(await page.locator(".lab-result").textContent(), /category_0/);
  await button("Questions").click();
  await page.locator(".answer-value").first().waitFor();
  assert.equal(
    await page.locator(".answer-value").first().textContent(),
    "category_0",
  );
  await page
    .getByLabel("Search requests", { exact: true })
    .fill("no matching trace");
  assert.equal(await page.locator(".request-row").count(), 0);
  assert.equal(await page.locator(".detail-meta").count(), 0);
  await page.getByLabel("Search requests", { exact: true }).fill("");
  assert.equal(await selectedId(), response.completed["default-history"]);
  assert.equal(
    await page.locator(".detail-tabs [aria-pressed=true]").textContent(),
    "Questions",
    "Tab selection survives an empty filter",
  );
  console.log(
    "Selection verified: pinned Flow/Raw, camera, pending-to-success detail and row, answers, filtering and tab persistence.",
  );
}
