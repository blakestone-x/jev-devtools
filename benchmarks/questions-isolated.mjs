import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import os from "node:os";
const urls = process.argv.slice(2);
if (!urls.length)
  throw new Error("Pass one or more already-built benchmark URLs");
const output = resolve(
  process.env.BENCH_OUTPUT || "benchmarks/results/questions",
);
const rounds = Number(process.env.BENCH_ROUNDS || 4);
if (!Number.isSafeInteger(rounds) || rounds < 1)
  throw new Error("Invalid BENCH_ROUNDS");
const profiling = process.env.BENCH_PROFILE === "1";
const scenarios = (process.env.BENCH_SCENARIOS || "small,many-questions").split(
  ",",
);
const results = {
  timestamp: new Date().toISOString(),
  environment: {
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    cpus: os.cpus().length,
    node: process.version,
    viewport: [1710, 961],
    dpr: 2,
    headless: true,
    profiling,
  },
  runs: [],
};
await mkdir(output, { recursive: true });
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
for (let round = 0; round < rounds; round++) {
  for (const url of round % 2 ? [...urls].reverse() : urls) {
    browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 1710, height: 961 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      await page.goto(url);
      await page.waitForFunction(() =>
        document.getElementById("status").textContent.startsWith("Ready"),
      );
      const info = await page.evaluate(async () =>
        (await fetch("/bench/info")).json(),
      );
      if (info[0].profiling !== profiling) throw new Error("Profiler mismatch");
      const operate = async (selector, status) => {
        const saved = page.waitForResponse(
          (r) =>
            r.url().endsWith("/bench/results") &&
            r.request().method() === "POST",
          { timeout: 45000 },
        );
        await Promise.all([saved, page.click(selector)]);
        await page.waitForFunction(
          (status) => document.getElementById("status").textContent === status,
          status,
        );
        return JSON.parse(await page.locator("#metrics").textContent());
      };
      for (const scenario of scenarios) {
        await page.selectOption("#scenario", scenario);
        await operate("#load", "Loaded " + scenario);
        const coldOpen = await operate(
          "#questions-open",
          "Questions open complete",
        );
        await operate("#questions-flow", "Questions flow complete");
        if (profiling) {
          await cdp.send("Profiler.enable");
          await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
          await cdp.send("Profiler.start");
        }
        const run = {
          round,
          url,
          revision: info[0].revision,
          chromium: browser.version(),
          scenario,
          coldOpen,
          actions: {},
        };
        for (const action of ["open", "last", "first", "sweep", "read"]) {
          const before = await metrics(cdp);
          const measurement = await operate(
            "#questions-" + action,
            "Questions " + action + " complete",
          );
          const after = await metrics(cdp);
          measurement.cpu = Object.fromEntries(
            [
              "TaskDuration",
              "ScriptDuration",
              "LayoutDuration",
              "RecalcStyleDuration",
            ].map((name) => [name + "Ms", (after[name] - before[name]) * 1000]),
          );
          run.actions[action] = measurement;
          if (measurement.visibility !== "visible")
            throw new Error("Hidden measurement");
        }
        if (profiling) {
          const { profile } = await cdp.send("Profiler.stop");
          run.profile = `${round}-${run.revision}-${scenario}.cpuprofile`;
          await writeFile(join(output, run.profile), JSON.stringify(profile));
        }
        run.errors = [...errors];
        if (errors.length) throw new Error(errors.join("\n"));
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
            openMs: run.actions.open.readyAfterTwoFramesMs,
            taskMs: run.actions.open.cpu.TaskDurationMs,
            mounted: run.actions.open.mountedQuestions,
            longTaskMs: run.actions.open.longTaskMs,
            scrollTaskMs: run.actions.sweep.cpu.TaskDurationMs,
          }),
        );
        await page.screenshot({
          path: join(output, `${round}-${run.revision}-${scenario}.png`),
        });
      }
    } finally {
      await browser.close();
      browser = undefined;
    }
  }
}
