import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import os from "node:os";

const urls = process.argv.slice(2);
const rounds = Number(process.env.BENCH_ROUNDS || 4);
if (!urls.length || !Number.isSafeInteger(rounds) || rounds < 1)
  throw new Error("Pass benchmark URLs and a positive BENCH_ROUNDS");
const profiling = process.env.BENCH_PROFILE === "1";
const output = resolve(
  process.env.BENCH_OUTPUT || "benchmarks/results/rerenders",
);
await mkdir(output, { recursive: true });
const cases = [
  { scenario: "small", tab: "Flow", pinned: false },
  { scenario: "max-history", tab: "Flow", pinned: true },
  { scenario: "combined", tab: "Flow", pinned: true },
  { scenario: "combined", tab: "Raw", pinned: true },
  { scenario: "combined", tab: "Flow", pinned: false },
];
const results = {
  timestamp: new Date().toISOString(),
  environment: {
    cpu: os.cpus()[0]?.model,
    platform: os.platform(),
    node: process.version,
    viewport: [1710, 961],
    dpr: 2,
    profiling,
    pulses: 20,
    intervalMs: 100,
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
const cpuDelta = (a, b) =>
  Object.fromEntries(
    [
      "TaskDuration",
      "ScriptDuration",
      "LayoutDuration",
      "RecalcStyleDuration",
    ].map((key) => [key + "Ms", 1000 * (b[key] - a[key])]),
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
      page.on("pageerror", (error) => errors.push(String(error)));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      await page.goto(url);
      await page.waitForFunction(() =>
        document.getElementById("status").textContent.startsWith("Ready"),
      );
      const info = await page.evaluate(async () =>
        (await fetch("/bench/info")).json(),
      );
      assert.equal(info[0].profiling, profiling);
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
      await load("small");
      for (const spec of cases) {
        const beforeMount = await metrics(cdp);
        const mount = await load(spec.scenario);
        const afterMount = await metrics(cdp);
        if (spec.pinned) await page.locator(".request-row").nth(3).click();
        if (spec.tab !== "Flow")
          await page
            .getByRole("button", { name: spec.tab, exact: true })
            .click();
        await frame();
        const selectedId = await page
          .locator(".detail-meta code")
          .last()
          .textContent();
        await page.click("#reset");
        if (profiling) {
          await cdp.send("Profiler.enable");
          await cdp.send("Profiler.start");
        }
        const before = await metrics(cdp);
        const stream = await page.evaluate(async () => {
          const pause = (ms) => new Promise((r) => setTimeout(r, ms));
          const before = await (await fetch("/bench/counters")).json();
          const start = performance.now();
          let final,
            calls = 0;
          for (let i = 0; i < 20; i++) {
            await pause(Math.max(0, start + i * 100 - performance.now()));
            final = await (
              await fetch("/bench/pulse", { method: "POST" })
            ).json();
            calls += final.calls;
          }
          await pause(Math.max(0, start + 2050 - performance.now()));
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
          const after = await (await fetch("/bench/counters")).json();
          return {
            elapsedMs: performance.now() - start,
            calls,
            completed: final.completed,
            events: after.sent - before.sent,
            bytes: after.bytes - before.bytes,
          };
        });
        const after = await metrics(cdp);
        const id = `${round}-${info[0].revision}-${spec.scenario}-${spec.tab}-${spec.pinned ? "pinned" : "latest"}`;
        if (profiling) {
          const { profile } = await cdp.send("Profiler.stop");
          await writeFile(
            join(output, id + ".cpuprofile"),
            JSON.stringify(profile),
          );
        }
        const saved = page.waitForResponse(
          (r) =>
            r.url().endsWith("/bench/results") &&
            r.request().method() === "POST",
        );
        await Promise.all([saved, page.click("#save")]);
        const interaction = JSON.parse(
          await page.locator("#metrics").textContent(),
        );
        assert.equal(stream.calls, 20);
        assert.equal(
          await page.locator(".detail-tabs [aria-pressed=true]").textContent(),
          spec.tab,
        );
        assert.equal(
          await page.locator(".detail-meta code").last().textContent(),
          spec.pinned ? selectedId : stream.completed[spec.scenario],
        );
        assert.equal(
          await page.locator(".request-row").count(),
          info.find((s) => s.id === spec.scenario).history,
        );
        // Verify incoming results reached the UI even when a different request was pinned.
        await page.locator(".request-row").first().click();
        assert.equal(
          await page.locator(".detail-meta code").last().textContent(),
          stream.completed[spec.scenario],
        );
        assert.match(
          await page.locator(".detail-header .eyebrow").textContent(),
          /success/,
        );
        assert.equal(interaction.visibility, "visible");
        assert.deepEqual(errors, []);
        const run = {
          round,
          ...spec,
          revision: info[0].revision,
          chromium: browser.version(),
          mount,
          mountCpu: cpuDelta(beforeMount, afterMount),
          stream,
          cpu: cpuDelta(before, after),
          interaction,
        };
        results.runs.push(run);
        await writeFile(
          join(output, "results.json"),
          JSON.stringify(results, null, 2),
        );
        console.log(
          JSON.stringify({
            round,
            ...spec,
            revision: run.revision,
            taskMs: run.cpu.TaskDurationMs,
            longTaskMs: interaction.longTaskMs,
            events: stream.events,
            reactMs: interaction.commits?.reduce(
              (sum, commit) => sum + commit.actualDuration,
              0,
            ),
          }),
        );
      }
    } finally {
      await browser.close();
      browser = undefined;
    }
  }
}
