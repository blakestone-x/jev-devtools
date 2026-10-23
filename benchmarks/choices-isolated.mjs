import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import os from "node:os";
const urls = process.argv.slice(2);
if (!urls.length) throw new Error("Pass already-built benchmark URLs");
const rounds = Number(process.env.BENCH_ROUNDS || 4);
if (!Number.isSafeInteger(rounds) || rounds < 1)
  throw new Error("Invalid BENCH_ROUNDS");
const profiling = process.env.BENCH_PROFILE === "1";
const scenarios = (
  process.env.BENCH_SCENARIOS || "small,wide-choice,combined"
).split(",");
const output = resolve(
  process.env.BENCH_OUTPUT || "benchmarks/results/choices",
);
await mkdir(output, { recursive: true });
const results = {
  timestamp: new Date().toISOString(),
  environment: {
    platform: os.platform(),
    cpu: os.cpus()[0]?.model,
    node: process.version,
    viewport: [1710, 961],
    dpr: 2,
    profiling,
  },
  runs: [],
};
let browser;
process.once("SIGINT", () => {
  void browser?.close().finally(() => process.exit(130));
});
const metrics = async (cdp) =>
  Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
      m.name,
      m.value,
    ]),
  );
const delta = (before, after) =>
  Object.fromEntries(
    [
      "TaskDuration",
      "ScriptDuration",
      "LayoutDuration",
      "RecalcStyleDuration",
    ].map((k) => [k + "Ms", 1000 * (after[k] - before[k])]),
  );
for (let round = 0; round < rounds; round++) {
  for (const url of round % 2 ? [...urls].reverse() : urls) {
    browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1710, height: 961 },
        deviceScaleFactor: 2,
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      await page.goto(url);
      await page.waitForFunction(() =>
        document.getElementById("status").textContent.startsWith("Ready"),
      );
      const info = await page.evaluate(async () =>
        (await fetch("/bench/info")).json(),
      );
      if (info[0].profiling !== profiling) throw new Error("Profiler mismatch");
      const frame = () =>
        page.evaluate(
          () =>
            new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            ),
        );
      const load = async (scenario) => {
        await page.selectOption("#scenario", scenario);
        const saved = page.waitForResponse(
          (r) =>
            r.url().endsWith("/bench/results") &&
            r.request().method() === "POST",
        );
        await Promise.all([saved, page.click("#load")]);
        await page.waitForFunction(
          (text) => document.getElementById("status").textContent === text,
          "Loaded " + scenario,
        );
        return JSON.parse(await page.locator("#metrics").textContent());
      };
      await load("small"); // Same unmeasured code-load warmup for both revisions.
      for (const scenario of scenarios) {
        if (profiling) {
          await cdp.send("Profiler.enable");
          await cdp.send("Profiler.start");
        }
        const before = await metrics(cdp);
        const mount = await load(scenario);
        const after = await metrics(cdp);
        const navigationBefore = await metrics(cdp);
        const viewport = page.locator(".lab-flow-viewport");
        const box = await viewport.boundingBox();
        await page.mouse.move(box.x + 15, box.y + 15);
        await page.mouse.down();
        for (let i = 1; i <= 30; i++) {
          await page.mouse.move(box.x + 15 + i * 5, box.y + 15 + i);
          await frame();
        }
        await page.mouse.up();
        for (let i = 0; i < 10; i++) {
          await page.mouse.wheel(0, -30);
          await frame();
        }
        await page.getByRole("button", { name: "Fit", exact: true }).click();
        await frame();
        const navigationAfter = await metrics(cdp);
        const geometry = await page
          .locator(".lab-flow-canvas")
          .evaluate((el) => {
            const bounds = el.getBoundingClientRect(),
              view = el.parentElement.getBoundingClientRect();
            return {
              width: el.offsetWidth,
              height: el.offsetHeight,
              fits:
                bounds.top >= view.top &&
                bounds.bottom <= view.bottom &&
                bounds.left >= view.left &&
                bounds.right <= view.right,
            };
          });
        const run = {
          round,
          scenario,
          revision: info[0].revision,
          chromium: browser.version(),
          mount,
          loadCpu: delta(before, after),
          navigationCpu: delta(navigationBefore, navigationAfter),
          geometry,
        };
        if (profiling) {
          const { profile } = await cdp.send("Profiler.stop");
          run.profile = `${round}-${run.revision}-${scenario}.cpuprofile`;
          await writeFile(join(output, run.profile), JSON.stringify(profile));
        }
        if (errors.length || mount.visibility !== "visible")
          throw new Error(errors.join("\n") || "Hidden page");
        results.runs.push(run);
        await writeFile(
          join(output, "results.json"),
          JSON.stringify(results, null, 2),
        );
        await page.screenshot({
          path: join(output, `${round}-${run.revision}-${scenario}.png`),
        });
        console.log(
          JSON.stringify({
            round,
            scenario,
            revision: run.revision,
            readyMs: mount.readyAfterTwoFramesMs,
            taskMs: run.loadCpu.TaskDurationMs,
            panZoomTaskMs: run.navigationCpu.TaskDurationMs,
            height: geometry.height,
            fits: geometry.fits,
          }),
        );
      }
    } finally {
      await browser.close();
      browser = undefined;
    }
  }
}
