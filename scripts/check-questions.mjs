import assert from "node:assert/strict";

// Public UI contract, exercised by verify:drawer on React 18 and React 19.
export async function checkQuestions({
  page,
  load,
  close,
  open,
  settle,
  pulse,
}) {
  const button = (name) => page.getByRole("button", { name, exact: true });
  const card = (index) =>
    page.locator(`.questions-row[data-index="${index}"] article`);
  const jump = async (index) => {
    await page.getByLabel("Jump to question", { exact: true }).focus();
    await page
      .getByLabel("Jump to question", { exact: true })
      .selectOption(String(index));
    await page.waitForFunction((index) => {
      const s = document.querySelector("jev-devtools-root").shadowRoot;
      const card = s.querySelector(
        `.questions-row[data-index="${index}"] article`,
      );
      if (!card) return false;
      const a = card.getBoundingClientRect(),
        b = s.querySelector(".questions-viewport").getBoundingClientRect();
      return a.bottom > b.top && a.top < b.bottom;
    }, index);
  };
  await load("many-questions");
  await button("Questions").click();
  await page.locator(".question-node").first().waitFor();
  assert.ok(
    (await page.locator(".question-node.standalone").count()) < 12,
    "Opening 150 questions must not mount the entire collection",
  );
  // Native wheel events exercise the browser scroll path, independently of picker jumps.
  // Virtualization must settle with a real answer in view in both directions.
  const scroller = page.locator(".questions-viewport");
  await scroller.hover({ position: { x: 4, y: 4 } });
  let previousOffset = await scroller.evaluate((el) => el.scrollTop);
  for (const delta of [180, 180, 600, 600, -600, -600, -180, -180]) {
    await page.mouse.wheel(0, delta);
    await page.waitForFunction((previous) => {
      const viewport = document
        .querySelector("jev-devtools-root")
        .shadowRoot.querySelector(".questions-viewport");
      return viewport.scrollTop !== previous;
    }, previousOffset);
    await settle();
    const result = await scroller.evaluate((viewport) => {
      const bounds = viewport.getBoundingClientRect();
      const cards = [...viewport.querySelectorAll("article")];
      return {
        offset: viewport.scrollTop,
        mounted: cards.length,
        visibleAnswers: cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return (
            rect.bottom > bounds.top &&
            rect.top < bounds.bottom &&
            card.querySelector(".answer")
          );
        }).length,
      };
    });
    assert.ok(
      result.visibleAnswers > 0,
      "Wheel scrolling must reveal complete question cards",
    );
    assert.ok(
      result.mounted < 12,
      "Wheel scrolling must keep the rendered list bounded",
    );
    previousOffset = result.offset;
  }
  // Rapid scanning may defer answers, but labels stay available and stopping
  // must restore complete content without another click or scroll.
  const sawPreview = await scroller.evaluate(async (viewport) => {
    let preview = false;
    for (let i = 1; i <= 12; i++) {
      viewport.scrollTop = i * 800;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      preview ||= !!viewport.querySelector('article[aria-busy="true"] h3');
    }
    return preview;
  });
  assert.ok(sawPreview, "Rapid scanning keeps labeled previews available");
  const fullWhileReading = await scroller.evaluate(async (viewport) => {
    for (let i = 0; i < 8; i++) {
      viewport.scrollTop += 40;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }
    return (
      !viewport.querySelector('[aria-busy="true"]') &&
      !!viewport.querySelector(".answer")
    );
  });
  assert.ok(
    fullWhileReading,
    "Slowing to reading pace restores answers without stopping",
  );
  // Enter fast scanning again, then verify idle restoration independently.
  await scroller.evaluate(async (viewport) => {
    for (let i = 0; i < 6; i++) {
      viewport.scrollTop += 800;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }
  });
  await page.screenshot({ path: "benchmarks/results/questions-scanning.png" });
  await page.waitForFunction(() => {
    const viewport = document
      .querySelector("jev-devtools-root")
      .shadowRoot.querySelector(".questions-viewport");
    const bounds = viewport.getBoundingClientRect();
    return (
      !viewport.querySelector('[aria-busy="true"]') &&
      [...viewport.querySelectorAll("article")].some((card) => {
        const rect = card.getBoundingClientRect();
        return (
          rect.bottom > bounds.top &&
          rect.top < bounds.bottom &&
          card.querySelector(".answer")
        );
      })
    );
  });
  // Visit every answer, not merely the first and last or a synthetic renderer.
  for (let index = 0; index < 150; index++) {
    await jump(index);
    assert.equal(
      await card(index).locator("h3").textContent(),
      `question_${index}`,
    );
    assert.ok(
      (await card(index).locator("pre").textContent()).includes(
        `Classify synthetic item ${index}.`,
      ),
    );
    assert.equal(
      await card(index).locator(".answer-value").textContent(),
      "category_0",
    );
    assert.equal(await card(index).locator(".probability").count(), 3);
  }
  await page
    .getByRole("region", { name: "Questions and answers", exact: true })
    .focus();
  await page.keyboard.press("Home");
  await page.waitForFunction(
    () =>
      document
        .querySelector("jev-devtools-root")
        .shadowRoot.activeElement?.getAttribute("aria-label") ===
      "Question 1: question_0",
  );
  await page.keyboard.press("End");
  await page.waitForFunction(
    () =>
      document
        .querySelector("jev-devtools-root")
        .shadowRoot.activeElement?.getAttribute("aria-label") ===
      "Question 150: question_149",
  );
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(
    () =>
      document
        .querySelector("jev-devtools-root")
        .shadowRoot.activeElement?.getAttribute("aria-label") ===
      "Question 149: question_148",
  );
  const offset = await page
    .locator(".questions-viewport")
    .evaluate((el) => el.scrollTop);
  await close();
  await open();
  assert.ok(
    Math.abs(
      (await page
        .locator(".questions-viewport")
        .evaluate((el) => el.scrollTop)) - offset,
    ) < 2,
    "Closing and reopening preserves Questions scroll position",
  );
  await button("Next question").click();
  await card(149).waitFor();
  await button("Previous question").click();
  await card(148).waitFor();

  await load("mixed-questions");
  await button("Questions").click();
  await jump(1);
  await card(1).locator("summary").click();
  assert.equal(
    await card(1)
      .locator("details")
      .evaluate((el) => el.open),
    true,
  );
  // A focused disclosure stays mounted even when manual scrolling moves it away.
  await card(1).locator("summary").focus();
  await page.locator(".questions-viewport").evaluate(async (el) => {
    for (let i = 1; i <= 8; i++) {
      el.scrollTop = (el.scrollHeight * i) / 8;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }
  });
  assert.equal(
    await card(1).locator("details[open]").count(),
    1,
    "A focused answer stays complete during rapid scrolling",
  );
  await settle();
  assert.equal(
    await card(1)
      .locator("summary")
      .evaluate((el) => el.getRootNode().activeElement === el),
    true,
  );
  await jump(149); // moving focus to the picker permits old rows to unmount
  await page.waitForFunction(
    () =>
      !document
        .querySelector("jev-devtools-root")
        .shadowRoot.querySelector('[data-index="1"]'),
  );
  await jump(1);
  assert.equal(
    await card(1)
      .locator("details")
      .evaluate((el) => el.open),
    true,
    "Expanded legends survive row recycling",
  );
  assert.ok((await card(1).textContent()).includes("0.75"));
  await jump(2);
  assert.ok(
    (await card(2).locator(".answer-value").textContent()).includes("65%"),
  );
  await jump(3);
  await page.waitForFunction(
    () =>
      document
        .querySelector("jev-devtools-root")
        .shadowRoot.querySelector('[data-index="3"] img')?.naturalWidth > 0,
  );
  assert.ok(
    (await card(3).locator(".coordinates").textContent()).includes(
      "bottom 0.90",
    ),
  );
  await jump(72);
  assert.ok(
    (await card(72).locator("pre").textContent()).includes(
      "End of full instructions.",
    ),
  );
  // Measurement must adapt to width changes and expanded content without overlaps.
  await page.setViewportSize({ width: 1000, height: 850 });
  await jump(149);
  await jump(1);
  await settle();
  const overlap = await page.locator(".questions-row").evaluateAll((rows) => {
    const rects = rows
      .map((el) => el.getBoundingClientRect())
      .sort((a, b) => a.top - b.top);
    return rects.some((rect, i) => i > 0 && rect.top < rects[i - 1].bottom - 1);
  });
  assert.equal(
    overlap,
    false,
    "Measured question rows do not overlap after resizing",
  );
  await page.screenshot({ path: "benchmarks/results/questions-mixed.png" });
  // An incoming request replaces the selected trace rather than leaving stale rows.
  const id = await pulse("mixed-questions");
  await page.waitForFunction(
    (id) =>
      document
        .querySelector("jev-devtools-root")
        .shadowRoot.querySelector(".detail-meta code:last-child")
        ?.textContent === id,
    id,
  );
  await jump(149);
  assert.ok((await card(149).textContent()).includes("0.75"));
  await button("Raw").click();
  assert.ok(
    (await page.locator(".detail-body pre").textContent()).includes(
      "question_149",
    ),
    "Raw retains the complete captured payload",
  );
  await page.setViewportSize({ width: 1710, height: 961 });
  console.log(
    "Questions verified: all 150 answers, keyboard and picker navigation, focus retention, scroll persistence, Score/Noul/Box, full instructions, resize, incoming results and Raw.",
  );
}
