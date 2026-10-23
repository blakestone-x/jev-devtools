// New feature scaling only; not a before/after comparison with main.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
const origin = process.env.FLOW_URL ?? "http://127.0.0.1:4230";
const output = process.env.BENCH_OUTPUT ?? "benchmarks/results/flows";
const rounds = Number(process.env.BENCH_ROUNDS ?? 3);
if (!Number.isSafeInteger(rounds) || rounds < 1)
  throw new Error("Invalid rounds");
const results = {
  machine: os.cpus()[0]?.model,
  node: process.version,
  runs: [],
};
await mkdir(output, { recursive: true });
for (let round = 0; round < rounds; round++) {
  const browser = await chromium.launch({ headless: true });
  try {
    const cases = [
      { count: 10, history: 1 },
      { count: 50, history: 1 },
      { count: 150, history: 1 },
      { count: 10, history: 200 },
    ];
    for (const { count, history } of round % 2 ? [...cases].reverse() : cases) {
      const page = await browser.newPage({
        viewport: { width: 1710, height: 1000 },
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      const metrics = async () =>
        Object.fromEntries(
          (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
            m.name,
            m.value,
          ]),
        );
      await page.goto(origin);
      await page.evaluate(() =>
        fetch("/api/jev-devtools/clear", { method: "DELETE" }),
      );
      const before = await metrics(),
        start = performance.now();
      const result = await page.evaluate(
        async ({ count, history }) => {
          const response = await fetch(
            `/run?scenario=scale-${count}&count=${history}`,
            { method: "POST" },
          );
          return response.json();
        },
        { count, history },
      );
      if (result.outcome !== "done") throw new Error("Fixture failed");
      const executionMs = performance.now() - start,
        afterRun = await metrics();
      await page
        .getByRole("button", { name: "Open Jev DevTools", exact: true })
        .click();
      await page.getByRole("button", { name: "Flows", exact: true }).click();
      await page.getByRole("region", { name: "Flow canvas" }).waitFor();
      await page.waitForTimeout(150);
      const afterOpen = await metrics();
      await page.getByRole("region", { name: "Flow canvas" }).focus();
      const beforePan = await metrics();
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight");
        await page.waitForTimeout(16);
      }
      const afterPan = await metrics();
      const run = {
        round,
        steps: count + 1,
        history,
        serverExecutionMs: result.serverExecutionMs,
        chromium: browser.version(),
        executionMs,
        closedBrowserCpuMs:
          (afterRun.TaskDuration - before.TaskDuration) * 1000,
        openCpuMs: (afterOpen.TaskDuration - afterRun.TaskDuration) * 1000,
        panCpuMs: (afterPan.TaskDuration - beforePan.TaskDuration) * 1000,
        domNodes: afterOpen.Nodes,
        heapMB: afterOpen.JSHeapUsedSize / 1024 / 1024,
        overviewCards: await page.locator(".flow-step").count(),
        detailDiagrams: await page.locator(".lab-flow").count(),
      };
      results.runs.push(run);
      console.log(JSON.stringify(run));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${output}/scaling.json`, JSON.stringify(results, null, 2));
