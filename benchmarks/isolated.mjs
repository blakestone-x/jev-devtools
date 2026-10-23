import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import os from "node:os";

// Run against already-built servers so compilation cannot compete with measurements.
// Each URL gets a fresh browser process on every round. Reverse order on odd rounds.
const urls = process.argv.slice(2);
if (!urls.length)
  throw new Error("Usage: node benchmarks/isolated.mjs URL [URL ...]");
const rounds = Number(process.env.BENCH_ROUNDS || 4);
if (!Number.isSafeInteger(rounds) || rounds < 1)
  throw new Error("BENCH_ROUNDS must be a positive integer");
let activeBrowser;
const interrupted = async () => {
  await activeBrowser?.close();
  process.exit(130);
};
process.once("SIGINT", interrupted);
process.once("SIGTERM", interrupted);
const profiling = process.env.BENCH_PROFILE === "1";
const scenarios = (process.env.BENCH_SCENARIOS || "max-history,combined").split(
  ",",
);
const drawerModes = (process.env.BENCH_DRAWER_MODES || "open").split(",");
if (drawerModes.some((mode) => !["open", "closed", "unopened"].includes(mode)))
  throw new Error("BENCH_DRAWER_MODES must contain open, closed, or unopened");
const output = resolve(
  process.env.BENCH_OUTPUT || `benchmarks/results/isolated-${Date.now()}`,
);
await mkdir(output, { recursive: true });
const results = {
  timestamp: new Date().toISOString(),
  environment: {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    cpu: os.cpus()[0]?.model,
    node: process.version,
    headless: true,
    viewport: [1710, 961],
    dpr: 2,
    profiling,
  },
  runs: [],
};
const metrics = async (cdp) =>
  Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map(
      ({ name, value }) => [name, value],
    ),
  );
for (let round = 0; round < rounds; round++) {
  for (const url of round % 2 ? [...urls].reverse() : urls) {
    const browser = await chromium.launch({ headless: true });
    activeBrowser = browser;
    try {
      const context = await browser.newContext({
        viewport: { width: 1710, height: 961 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      await page.goto(url);
      await page.waitForFunction(() =>
        document.getElementById("status").textContent.startsWith("Ready"),
      );
      const operate = async (selector, completed) => {
        const saved = page.waitForResponse(
          (response) =>
            response.url().endsWith("/bench/results") &&
            response.request().method() === "POST",
          { timeout: 60000 },
        );
        await Promise.all([saved, page.click(selector)]);
        await page.waitForFunction(
          (text) => document.getElementById("status").textContent === text,
          completed,
          { timeout: 60000 },
        );
      };
      const info = await page.evaluate(async () =>
        (await fetch("/bench/info")).json(),
      );
      if (info[0].profiling !== profiling)
        throw new Error("Server and runner BENCH_PROFILE must match");
      for (const scenario of scenarios) {
        for (const drawerMode of drawerModes) {
          await page.selectOption("#scenario", scenario);
          await page.locator("#closed").setChecked(drawerMode === "unopened");
          await operate("#load", "Loaded " + scenario);
          const mount = JSON.parse(
            await page.locator("#metrics").textContent(),
          );
          // One unmeasured streaming window warms up the selected scenario.
          await operate("#stream", "Stream complete");
          if (drawerMode === "closed") {
            await page
              .getByRole("button", { name: "Close Jev DevTools", exact: true })
              .click();
            // Exclude the close interaction and observer notifications from timing.
            await page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
          }
          if (profiling) {
            await cdp.send("Profiler.enable");
            await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
            await cdp.send("Profiler.start");
          }
          const before = await metrics(cdp);
          await operate("#stream", "Stream complete");
          const after = await metrics(cdp);
          const stream = JSON.parse(
            await page.locator("#metrics").textContent(),
          );
          const cpu = Object.fromEntries(
            [
              "TaskDuration",
              "ScriptDuration",
              "LayoutDuration",
              "RecalcStyleDuration",
            ].map((name) => [name + "Ms", (after[name] - before[name]) * 1000]),
          );
          const run = {
            round,
            url,
            revision: info[0].revision,
            scenario,
            drawerMode,
            chromium: browser.version(),
            mount,
            stream,
            cpu,
            errors: [...errors],
          };
          if (profiling) {
            const { profile } = await cdp.send("Profiler.stop");
            run.profile = `${round}-${info[0].revision.replace(/[^a-zA-Z0-9_-]/g, "_")}-${scenario}-${drawerMode}.cpuprofile`;
            await writeFile(join(output, run.profile), JSON.stringify(profile));
          }
          if (drawerMode !== "open") {
            await operate("#reopen", "Reopen complete");
            run.reopen = JSON.parse(
              await page.locator("#metrics").textContent(),
            );
          }
          // Closed runs must catch up on reopen. Open runs must already be current.
          await page.waitForFunction(
            ({ count, requestId }) => {
              const s = document.querySelector("jev-devtools-root")?.shadowRoot;
              return (
                !s?.querySelector(".jev-drawer")?.hidden &&
                s?.querySelector(".detail-meta code:last-child")
                  ?.textContent === requestId &&
                s
                  ?.querySelector(".detail-header .eyebrow")
                  ?.textContent.includes("success") &&
                (s?.querySelectorAll(".lab-output").length === count ||
                  [...s.querySelectorAll("button")].some(
                    (b) => b.textContent === `All probabilities (${count})`,
                  ))
              );
            },
            {
              count: info.find((s) => s.id === scenario).choices,
              requestId: stream.expectedRequestId,
            },
          );
          results.runs.push(run);
          await writeFile(
            join(output, "results.json"),
            JSON.stringify(results, null, 2) + "\n",
          );
          console.log(
            JSON.stringify({
              round,
              revision: run.revision,
              scenario,
              drawerMode,
              longTaskMs: stream.longTaskMs,
              taskMs: cpu.TaskDurationMs,
              scriptMs: cpu.ScriptDurationMs,
              commits: stream.commits?.length,
              bytes: stream.bytes,
              reopenMs: run.reopen?.readyAfterTwoFramesMs,
            }),
          );
          if (
            errors.length ||
            stream.calls !== 5 ||
            stream.visibility !== "visible"
          )
            throw new Error("Invalid benchmark window: " + JSON.stringify(run));
        }
      }
      await page.screenshot({
        path: join(
          output,
          `${round}-${info[0].revision.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`,
        ),
      });
    } finally {
      await browser.close();
      activeBrowser = undefined;
    }
  }
}
console.log(`Results: ${output}/results.json`);
