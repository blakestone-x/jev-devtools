# Changed-trace streaming — October 23, 2026

Incremental streaming removes the dominant steady-state server cost identified in the earlier benchmarks: repeatedly copying the entire retained history. Against a fresh run of the merged PR #14 batching implementation, the large-state and combined workloads use about **99% less server call-and-capture time** and **99.5% fewer outgoing bytes**. Initial full history, diagram rendering, and closed-drawer work remain separate costs.

## Implementation

The recorder tracks the last mutation revision of each retained trace. After a full initial snapshot, an opted-in connection receives only changed trace payloads and the current newest-first ID order. The order also conveys retention removals and clear. It is bounded to 200 IDs, so no tombstone log grows over time. Only changed payloads are cloned; finding them scans at most 200 retained entries.

Event-loop batching and serialization sharing remain in place. The sharing key now includes session, protocol and cursor, because slow viewers can be behind other viewers in the same session. The browser merges by ID without recreating unchanged trace objects. It validates revision continuity and resolves every retained ID before committing state; invalid updates trigger a fresh connection/snapshot. See [the stream protocol](stream-protocol.md) for compatibility, recovery and lifecycle details.

The new client requests version 2 automatically. Old clients continue receiving version 1 snapshots, and the new client accepts snapshots from old servers. The setup API and trace payload version are unchanged. Both sides need the new package code to benefit from incremental streaming.

## Matched server comparison

Baseline: merged PR #14 at `4df055705b0b63e62171eedb6179c7ae5a12b738`, built and preserved before edits. This is the batching implementation, **not** the published 0.1.3 release. Candidate: this PR's working tree, with source hashes recorded alongside the results.

Apple M2, macOS arm64, Node 24.19.0. Same deterministic SDK samples and 200-item maximum history; three rounds of 20 calls per mode after filling history. Fast viewers consume the real SSE adapter in process. Timings include the SDK call plus a settling event-loop turn, exclude inference/network time, and do not represent pure SDK promise latency. Before and after use the same harness; the baseline ignores the new query parameter and returns its existing snapshot format.

Median / p95 milliseconds per sequential call:

| Retained workload                            | One viewer: batching | One viewer: incremental | Three viewers: batching | Three viewers: incremental |
| -------------------------------------------- | -------------------: | ----------------------: | ----------------------: | -------------------------: |
| 50 small requests                            |        0.373 / 0.445 |           0.094 / 0.130 |           0.380 / 0.421 |              0.098 / 0.128 |
| 200 small requests                           |        1.251 / 1.581 |           0.089 / 0.205 |           1.254 / 1.576 |              0.100 / 0.153 |
| 200 requests, 80 KB state each               |      40.841 / 47.783 |           0.472 / 1.828 |         42.963 / 47.093 |              0.544 / 1.808 |
| 200 requests, 80 KB state + 150 choices each |      57.852 / 65.850 |           0.764 / 1.291 |         63.313 / 73.243 |              0.668 / 2.284 |

Small differences at sub-millisecond scales are noisy; three viewers are not inherently faster than one. Capture without a viewer stayed approximately 0.05–0.41 ms median across these workloads. These are single-machine measurements, not statistical confidence intervals.

| Workload                 | Events per call/viewer, both versions | Bytes per call/viewer: batching → incremental |
| ------------------------ | ------------------------------------: | --------------------------------------------: |
| 50 small requests        |                                     1 |                            43.50 KB → 2.90 KB |
| 200 small requests       |                                     1 |                           173.89 KB → 8.75 KB |
| 200 large-state requests |                                     2 |                          32.34 MB → 177.13 KB |
| Combined stress          |                                     2 |                          36.10 MB → 190.76 KB |

Units are decimal, uncompressed SSE bytes. This gain comes from smaller updates, not fewer events than batching. Each changed trace still includes its entire captured input/result; a two-update large request can send its 80 KB state twice. Three viewers still receive three copies of the bytes. Initial snapshots remain approximately 16.17 MB for large state and 18.05 MB for the combined case.

Raw server runs: [batching](benchmarks/2026-10-23-delta-server-before.json), [incremental](benchmarks/2026-10-23-delta-server-after.json).

## Browser comparison

Both client and server revisions are matched: frozen PR #14 client/server versus the incremental client/server. Production React, Chrome 154, 1710 × 961, DPR 2, drawer open. Each workload receives five real SDK sample calls one second apart in an approximately five-second window. Three windows per workload per run. The two workloads are 200 small requests and the combined 200-request/150-choice/80-KB-state case.

The first pair ran baseline then candidate. Browser timings were unexpectedly variable, so a second pair ran in reverse order, candidate then baseline. Both pairs are retained; results were not selected for favorable timings. No builds or server benchmarks ran during timed browser windows. Other desktop/browser activity was present: a process snapshot between runs showed substantial Chrome renderer and WindowServer CPU. That observation does not prove the cause of any particular long task or exclude a rendering regression.

Traffic reductions were consistent: five small calls sent about **0.863 MB → 0.0437 MB**; five combined calls sent **180.49 MB → 0.954 MB**. All windows completed five calls. Events remained five and ten respectively. Server write counts are not browser commit counts.

Frame gaps are animation-frame scheduling measurements, not GPU frame presentation or INP. Long tasks are browser-reported tasks over 50 ms. Ranges across the three windows in each run:

| Workload / pair   | Long-task time: batching → incremental | Frame-gap p95: batching → incremental |
| ----------------- | -------------------------------------: | ------------------------------------: |
| 200 small, pair 1 |                   0–362 → 251–1,589 ms |              17.5–17.6 → 17.6–50.0 ms |
| 200 small, pair 2 |                               0 → 0 ms |              17.3–33.3 → 17.6–33.3 ms |
| Combined, pair 1  |                   224–386 → 468–737 ms |                   33.3 → 17.7–33.4 ms |
| Combined, pair 2  |                   244–334 → 276–374 ms |              17.7–33.3 → 17.8–33.3 ms |

**These runs do not establish improved browser responsiveness.** Across both pairs, combined-case median long-task time was 269 ms for batching versus 421 ms for incremental updates. Treat this as an unresolved browser-performance concern, not something the traffic reduction cancels out. The measurements cannot distinguish background contention, changed update delivery timing, and a rendering regression. A browser CPU/React profile with controlled background load is needed before claiming a rendering win. The live harness follows the newest request, so it remounts the selected diagram as requests arrive; preserving unchanged object identities does not by itself prevent that work.

The second pair also ran all seven initial-mount scenarios, three times each:

| Workload                 | Batching median mount | Incremental median mount |
| ------------------------ | --------------------: | -----------------------: |
| 1 small request          |                 51 ms |                    60 ms |
| 50 small requests        |                 55 ms |                    50 ms |
| 200 small requests       |                107 ms |                   110 ms |
| 150 choices              |                195 ms |                   135 ms |
| 150 questions            |                 51 ms |                    51 ms |
| 200 large-state requests |                306 ms |                   262 ms |
| Combined stress          |                392 ms |                   383 ms |

Mounts still transfer full history and should not be credited as delta-transport wins. The code was already warm from the streaming suite. Readiness includes two animation frames; these are not React commit durations. Large diagram dimensions and history limits remain unchanged.

Raw browser runs: [before, pair 1](benchmarks/2026-10-23-delta-browser-before.json), [after, pair 1](benchmarks/2026-10-23-delta-browser-after.json), [after, pair 2](benchmarks/2026-10-23-delta-browser-after-round2.json), [before, pair 2](benchmarks/2026-10-23-delta-browser-before-round2.json).

## Reproduce

Use the same installed dependencies and save the PR #14 build before switching to this branch. Preserve its `lib/` directory with a parent `package.json` containing `{"type":"module"}`; make its dependencies resolvable (this run symlinked that parent directory's `node_modules` to the repository's installed dependencies). Use the actual PR #14 source, not the published 0.1.3 archive.

```sh
# Baseline server measurement (frozen PR #14 build):
BENCH_REVISION=batched-pr14 \
  BENCH_SERVER_ENTRY=/absolute/baseline/lib/server/index.js \
  node --expose-gc benchmarks/server.mjs

# Incremental server measurement:
BENCH_REVISION=changed-traces npm run bench:server

# Baseline client and server in the browser:
BENCH_LIVE=1 BENCH_PORT=4196 BENCH_REVISION=batched-pr14 \
  BENCH_SERVER_ENTRY=/absolute/baseline/lib/server/index.js \
  BENCH_CLIENT_ENTRY=/absolute/baseline/lib/src/index.js \
  npm run bench:browser

# Incremental client and server:
BENCH_LIVE=1 BENCH_PORT=4195 BENCH_REVISION=changed-traces npm run bench:browser
```

`BENCH_LIVE=1` means the real adapter with **deterministic local sample responses**, not live inference. No keys or paid API calls are used. Browser builds have separate output directories per port so paired revisions cannot overwrite each other's assets. Keep one foreground benchmark tab, wait for “Ready,” then run suites sequentially. Copy `benchmarks/results/server.json` or `browser.json` before the next run overwrites it. Per-port production assets and timestamped measurements also stay under ignored `benchmarks/results/`.

No hardware-sensitive thresholds are added to CI. Correctness tests cover incremental payloads, unchanged object identity, order/retention, cross-session eviction, final success/error/cancellation, slow-reader cursors, clear during an outstanding call, reconnect and server restart, invalid/gapped updates, stale events and unmount cleanup. Existing legacy-stream tests remain in place.
