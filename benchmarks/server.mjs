import { pathToFileURL } from "node:url";
const { createJevDevtools } = await import(
  process.env.BENCH_SERVER_ENTRY
    ? pathToFileURL(process.env.BENCH_SERVER_ENTRY).href
    : "jev-devtools/server"
);
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  scenarios,
  fixture,
  invoke,
  recordedFixture,
  stats,
} from "./fixtures.mjs";
const origin = "http://127.0.0.1:4190";
const rounds = 3,
  samples = 20;
const report = {
  timestamp: new Date().toISOString(),
  revision: process.env.BENCH_REVISION || "working-tree",
  requestedStreamProtocol: 2,
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  node: process.version,
  cpu: cpus()[0].model,
  platform: `${platform()} ${arch()}`,
  rounds,
  samplesPerRound: samples,
  snapshots: [],
  calls: [],
};
for (const spec of scenarios) {
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const { recorder, snapshot } = await recordedFixture(spec);
  global.gc?.();
  const retainedHeapBytes = process.memoryUsage().heapUsed - heapBefore;
  const payload = JSON.stringify(snapshot);
  const clone = [],
    encode = [],
    parse = [];
  for (let i = 0; i < 30; i++) {
    let start = performance.now();
    const copy = recorder.snapshot("local");
    clone.push(performance.now() - start);
    start = performance.now();
    JSON.stringify({ version: 1, traces: copy });
    encode.push(performance.now() - start);
    start = performance.now();
    JSON.parse(payload);
    parse.push(performance.now() - start);
  }
  report.snapshots.push({
    ...spec,
    snapshotBytes: Buffer.byteLength(payload),
    recorderAndSnapshotHeapBytesApprox: retainedHeapBytes,
    warnings: [...new Set(snapshot.traces.flatMap((t) => t.captureWarnings))],
    cloneMs: stats(clone),
    stringifyMs: stats(encode),
    parseMs: stats(parse),
  });
  console.log("Snapshot:", spec.id, Buffer.byteLength(payload), "bytes");
}
for (const spec of scenarios.filter((s) =>
  ["default-history", "max-history", "large-state", "combined"].includes(s.id),
)) {
  for (const mode of [
    "sdk",
    "disabled",
    "record-only",
    "sse-one",
    "sse-three",
    "sse-backpressure",
  ]) {
    const times = [],
      roundResults = [];
    for (let round = 0; round < rounds; round++) {
      const adapter = createJevDevtools({
        enabled: !["sdk", "disabled"].includes(mode),
        origin,
        limit: spec.history,
      });
      const { request, clientOptions } = fixture(spec);
      const client =
        mode === "sdk"
          ? new TypeSafeClient(clientOptions)
          : adapter.createClient(clientOptions, {
              source: "sample",
              label: "Benchmark sample",
            });
      // Fill history before subscribing; startup/preload is excluded from steady-state timings.
      for (let i = 0; i < spec.history; i++) await invoke(client, request);
      let bytes = 0,
        events = 0;
      const readers = [],
        pumps = [];
      const count = mode === "sse-three" ? 3 : mode.startsWith("sse-") ? 1 : 0;
      for (let i = 0; i < count; i++) {
        const response = await adapter.handle(
          new Request(origin + "/api/jev-devtools/events?protocol=2"),
        );
        const reader = response.body.getReader();
        readers.push(reader);
        if (mode !== "sse-backpressure")
          pumps.push(
            (async () => {
              while (true) {
                const { value, done } = await reader.read();
                if (done) return;
                bytes += value.byteLength;
                events++;
              }
            })(),
          );
      }
      await new Promise((resolve) => setImmediate(resolve));
      bytes = 0;
      events = 0;
      const cpu = process.cpuUsage(),
        start = performance.now();
      for (let i = 0; i < samples; i++) {
        const t = performance.now();
        await invoke(client, request);
        times.push(performance.now() - t);
      }
      const wallMs = performance.now() - start,
        used = process.cpuUsage(cpu);
      roundResults.push({
        wallMs,
        cpuMs: (used.user + used.system) / 1000,
        bytes,
        events,
        bytesPerRequest: bytes / samples,
        eventsPerRequest: events / samples,
      });
      for (const reader of readers) await reader.cancel();
      await Promise.all(pumps);
      adapter.dispose();
    }
    const row = {
      scenario: spec.id,
      mode,
      callAndCaptureMs: stats(times),
      rounds: roundResults,
    };
    report.calls.push(row);
    console.log(spec.id, mode, JSON.stringify(row.callAndCaptureMs));
  }
}
const cap = await recordedFixture({ ...scenarios[0], history: 205 });
report.retentionProbe = {
  requests: 205,
  requestedLimit: 205,
  retained: cap.snapshot.traces.length,
};
await mkdir("benchmarks/results", { recursive: true });
await writeFile(
  "benchmarks/results/server.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log("Saved benchmarks/results/server.json");
