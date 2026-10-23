import assert from "node:assert/strict";

// Public UI owns this contract: compaction must not lose low/zero probabilities,
// the returned choice, or keyboard access. Existing Questions checks do not
// exercise Flow's summary, paging or search. No test-only production hooks.
export async function checkChoice({ page, load }) {
  await load("wide-choice");
  const graph = page.locator(".lab-flow-canvas");
  assert.ok(
    (await graph.evaluate((el) => el.offsetHeight)) < 1000,
    "Large Choice overview fits a bounded scene",
  );
  assert.equal(await page.locator(".lab-output").count(), 3);
  assert.equal(
    await page
      .locator(".lab-output")
      .evaluateAll((nodes) =>
        nodes.every(
          (node, i) =>
            !i ||
            nodes[i - 1].getBoundingClientRect().bottom <=
              node.getBoundingClientRect().top,
        ),
      ),
    true,
    "Overview branches do not overlap",
  );
  await page
    .getByRole("button", { name: "All probabilities (150)", exact: true })
    .click();
  const rows = page.locator(".lab-choice-browser tbody tr");
  const found = new Map();
  for (let i = 0; i < 8; i++) {
    for (const row of await rows.all()) {
      const label = (await row.locator("th").textContent()).replace(
        "Returned choice",
        "",
      );
      const exact = await row.locator("code").textContent();
      found.set(label, exact);
    }
    if (i < 7)
      await page
        .getByRole("button", { name: "Next categories", exact: true })
        .click();
  }
  assert.equal(
    found.size,
    150,
    "Paging reaches all captured categories without duplicates or loss",
  );
  assert.equal(found.get("category_0"), "0.8");
  for (let i = 1; i < 150; i++)
    assert.equal(found.get(`category_${i}`), String(0.2 / 149));
  const search = page.getByRole("searchbox", { name: "Search categories" });
  await search.fill("category_149");
  assert.equal(await rows.count(), 1);
  assert.ok((await rows.textContent()).includes("category_149"));
  await search.fill("not a category");
  assert.equal(await rows.count(), 0);
  await search.fill("");
  assert.equal(
    await rows.count(),
    20,
    "Clearing search restores the first page",
  );
  await page
    .getByRole("button", { name: "Back to overview", exact: true })
    .click();
  assert.equal(await page.locator(".lab-flow-viewport").isVisible(), true);
  const more = page.getByRole("button", { name: "Show More", exact: true });
  await more.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator(".lab-output").count(),
    6,
    "Show More adds three branches in place using the keyboard",
  );
  assert.equal(await search.isVisible(), false);
  await more.click();
  assert.equal(await page.locator(".lab-output").count(), 9);
  await page
    .getByRole("button", { name: "All probabilities (150)", exact: true })
    .click();
  assert.equal(
    await search.evaluate((el) => el.getRootNode().activeElement === el),
    true,
  );
  await page
    .getByRole("button", { name: "Back to overview", exact: true })
    .click();
  assert.equal(
    await page.locator(".lab-output").count(),
    9,
    "Opening the full table preserves expanded branches",
  );
  await page.getByRole("button", { name: "Show fewer", exact: true }).click();
  assert.equal(await page.locator(".lab-output").count(), 3);
  await load("choice-edge");
  assert.equal(
    await page.locator(".lab-output").count(),
    4,
    "Keep returned choice even outside top three tied categories",
  );
  assert.ok(
    (await page.locator(".lab-output:not(.lab-idle)").textContent()).includes(
      "category_149",
    ),
  );
  await more.click();
  const expandedLabels = await page.locator(".lab-output h3").allTextContents();
  assert.deepEqual(
    expandedLabels,
    [
      "category_0",
      "category_1",
      "category_2",
      "category_149",
      "category_3",
      "category_4",
      "category_5",
    ],
    "Expansion adds three new categories without duplicating or displacing the returned choice",
  );
  await page
    .getByRole("button", { name: "All probabilities (150)", exact: true })
    .click();
  await search.fill("category_149");
  assert.equal(await rows.locator("code").textContent(), String(1 / 150));
  await load("choice-seven");
  await more.click();
  assert.equal(await page.locator(".lab-output").count(), 6);
  await page
    .getByRole("combobox", { name: "Diagram question" })
    .selectOption("question_1");
  assert.equal(await page.locator(".lab-output").count(), 3);
  await page
    .getByRole("combobox", { name: "Diagram question" })
    .selectOption("question_0");
  assert.equal(
    await page.locator(".lab-output").count(),
    6,
    "Each question retains its own expansion",
  );
  await more.click();
  assert.equal(
    await page.locator(".lab-output").count(),
    7,
    "The final click adds only the remaining category",
  );
  assert.equal(
    await more.count(),
    0,
    "Show More disappears when all categories are visible",
  );
  await page.getByRole("button", { name: "Show fewer", exact: true }).click();
  assert.equal(await page.locator(".lab-output").count(), 3);
  await load("small");
  assert.equal(
    await page.locator(".lab-output").count(),
    3,
    "Small distributions retain all branches",
  );
  assert.equal(await page.locator(".lab-choice-remainder").count(), 0);
  console.log(
    "Choice verified: bounded overview, all 150 exact values, paging, search, keyboard expansion, final partial batch, per-question expansion, ties, returned branch and request switching.",
  );
}
