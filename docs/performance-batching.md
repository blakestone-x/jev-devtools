# Update batching — October 23, 2026

Next iteration: [changed-trace streaming comparison](performance-deltas.md). These measurements remain the batching-only baseline.

Batching reduces repeated full-history snapshot work. In this run, median call-and-capture time with one fast viewer fell by 40–71%, and with three viewers by 80–90%. Large payloads remain expensive: the combined stress case still sends about 36 MB per call to each viewer. This is a first optimization, not a solution to every scaling issue.

## What changed

The recorder still captures request, attempt, response and final states immediately. An already-connected viewer now receives updates through one scheduled `setImmediate` flush. Changes accumulated before that flush share a snapshot of the latest state. This is event-loop coalescing, not a fixed frame-rate throttle or a debounce that can indefinitely postpone delivery.

Fast calls can appear directly in their final state. Requests that remain outstanding across turns still appear as pending; their final success, error or cancellation arrives in a later update. Consumers must treat SSE snapshots as current inspector state, not an audit log of every intermediate transition. The wire format remains snapshot version 1 and requires no installation/API changes.

During a flush, viewers in the same authorized session share cloning, JSON serialization and encoding. Each stream gets its own byte buffer so an in-process reader cannot mutate another viewer's response. Different sessions never share serialized history. Each flush discards its cache; it does not retain an additional history cache between updates.

The first snapshot on connection is still immediate. A full stream queue keeps only a dirty flag; when the reader can consume again, it schedules the latest retained state. Disconnect, abort and adapter disposal remove pending delivery work. Deferred delivery errors close that stream rather than escaping into the application's event loop.

No client rendering, diagram layout, history limits, capture limits, snapshot protocol or closed-drawer behavior changed. Large snapshots still serialize on the server's event loop and still need parsing and rendering in the browser.

## Server comparison

Same workload and harness as the [original baseline](performance.md): Apple M2, Node 24.19.0, three rounds of 20 sequential sample calls per mode, retained history filled before measurement. Calls use the real SDK with deterministic local responses. Timing includes a settling event-loop turn; it is not inference latency or a pure measure of how quickly the SDK promise resolves. Fast readers consume SSE in-process, so these results measure server work rather than network latency.

Median / p95 milliseconds per call:

| Retained workload                              | One viewer: before | One viewer: batched | Three viewers: before | Three viewers: batched |
| ---------------------------------------------- | -----------------: | ------------------: | --------------------: | ---------------------: |
| 50 small requests                              |        1.37 / 2.02 |         0.42 / 0.99 |           3.55 / 4.21 |            0.45 / 0.93 |
| 200 small requests                             |        4.80 / 5.86 |         1.41 / 2.24 |         14.66 / 16.49 |           1.46 / 12.11 |
| 200 requests, 80 KB state each                 |      73.68 / 94.63 |       44.35 / 55.53 |       224.31 / 239.17 |          43.95 / 54.81 |
| 200 requests, 80 KB state and 150 choices each |    110.71 / 127.37 |       60.15 / 78.50 |       331.40 / 349.65 |          63.12 / 69.41 |

The 200-small/three-viewer p95 remains much higher than its median; improvements are not uniform across samples. These are separate runs on one machine, not interleaved trials or statistical confidence intervals. Tiny no-viewer timing differences are noise: recording without a viewer remained approximately 0.06–0.40 ms median across these workloads.

| Workload                 | Snapshots per call per viewer: before → after | Uncompressed bytes per call per viewer: before → after |
| ------------------------ | --------------------------------------------: | -----------------------------------------------------: |
| 50 small requests        |                                         4 → 1 |                                        0.17 → 0.043 MB |
| 200 small requests       |                                         4 → 1 |                                        0.69 → 0.174 MB |
| 200 large-state requests |                                         4 → 2 |                                       64.67 → 32.34 MB |
| Combined stress          |                                         4 → 2 |                                       72.19 → 36.10 MB |

Large asynchronous response captures span more than one turn, so they still emit two updates. This change does **not** guarantee one update per request. Same-session serialization sharing explains why three viewers now cost much closer to one viewer in CPU time, but three viewers still need three copies of the transmitted bytes. The combined three-viewer case fell from about 216.6 to 108.3 MB per call.

Raw results: [original server baseline](benchmarks/2026-10-23-server.json), [batched server](benchmarks/2026-10-23-batched-server.json). The latter records the base HEAD plus working-tree provenance and a hash of the runtime source measured; it was collected before committing this implementation.

## Browser comparison through the real adapter

The original browser harness replays pre-serialized snapshots. That is useful for isolating the client, but it bypasses server batching entirely. A new optional adapter mode issues real SDK sample calls through the HTTP/SSE adapter. Both before and after use the same production client build and harness; only the server adapter changes. Before uses the published 0.1.3 adapter; after uses this working tree.

Chrome 154, 1710 × 961 viewport, DPR 2, drawer open, one foreground tab. For each workload: three windows, five calls per window scheduled one second apart, approximately 5.05 seconds measured. The retained history stays at 200 requests. This is a matched new experiment; its call rate is **not** the original replay experiment's five snapshots/sec.

| Workload           | Sent snapshots/window: before → after | Traffic/window: before → after | Long-task time/window: before → after | Frame-gap p95: before → after |
| ------------------ | ------------------------------------: | -----------------------------: | ------------------------------------: | ----------------------------: |
| 200 small requests |                                15 → 5 |                 2.59 → 0.86 MB |                          0–133 → 0 ms |      17.1–33.4 → 17.2–17.5 ms |
| Combined stress    |                               20 → 10 |             360.95 → 180.49 MB |                858–1,081 → 463–527 ms |      33.4–33.5 → 33.4–49.9 ms |

Counts are server writes, not browser commits. The HTTP baseline produced three updates per small request versus four in the in-process benchmark because stream consumption/backpressure differs. All runs completed all five calls and remained foreground. Browser long tasks are tasks over 50 ms; frame gaps are animation-frame scheduling measurements, not GPU frame presentation or INP.

The combined case approximately halved traffic and median long-task time (870 → 500 ms), but frame-gap p95 did not improve consistently. Fewer updates reduce total work; each remaining large update can still stall the UI. Sending only changed traces or fetching large details on demand remains the next likely transport improvement. Batching alone does not make a 150-category diagram fit the drawer.

Raw results: [adapter before](benchmarks/2026-10-23-live-before.json), [adapter batched](benchmarks/2026-10-23-live-batched.json). The word `live` in these filenames means the real adapter path; **all responses are synthetic samples**, with no API keys or paid inference.

## Original replay control

The original seven-scenario mount suite and five-case streaming suite were also rerun, with three repetitions each. This path bypasses the changed adapter, so differences here must not be credited to batching.

| Scenario                 | Original median mount | Control rerun median mount |
| ------------------------ | --------------------: | -------------------------: |
| 1 small request          |                 51 ms |                      59 ms |
| 50 small requests        |                 67 ms |                      53 ms |
| 200 small requests       |                109 ms |                     107 ms |
| 150 choices              |                144 ms |                     122 ms |
| 150 questions            |                 50 ms |                      52 ms |
| 200 large-state requests |                266 ms |                     262 ms |
| Combined stress          |                364 ms |                     393 ms |

At five replayed snapshots/sec, combined/open still incurred 1,614–1,809 ms of long tasks per window and 66.6–66.7 ms frame-gap p95. Combined/closed still incurred 1,297–1,480 ms and 49.9–50.0 ms p95. All control windows remained visible, with achieved send rates of 4.90–4.93 snapshots/sec. The original open runs varied more widely, including backpressure-limited runs, so these are not equal-throughput claims of improvement. The unchanged client still has substantial work to do even with the drawer closed.

Raw result: [full replay control](benchmarks/2026-10-23-replay-control.json). Mounts include cold loading on the first small case, as in the original baseline. No idle animation or rendering optimization is claimed by this PR.

## Reproduce

```sh
npm ci
npm run bench:server

# Original client-only replay control:
BENCH_REVISION=replay-control npm run bench:browser

# Real adapter, deterministic SDK samples:
BENCH_LIVE=1 BENCH_PORT=4192 BENCH_REVISION=batched npm run bench:browser
```

Run one benchmark at a time with other builds and CPU-heavy work stopped. Use a single foreground browser tab, wait for “Ready,” then run the streaming suite. Adapter mode runs the 200-small and combined scenarios, three windows each. Replay mode retains the original mount and streaming suites. Results save under ignored `benchmarks/results/`; copy them elsewhere before a subsequent run overwrites `browser.json`.

For the matched before run, extract the published `jev-devtools@0.1.3` tarball into a temporary directory, make its SDK dependency resolvable (for this run, the extracted package's `node_modules` symlinked to this repository's installed dependencies), and set `BENCH_SERVER_ENTRY` to its absolute `lib/server/index.js` path. Keep the current client build and harness unchanged:

```sh
BENCH_LIVE=1 BENCH_PORT=4191 BENCH_REVISION=baseline-0.1.3 \
  BENCH_SERVER_ENTRY=/absolute/path/to/extracted/package/lib/server/index.js \
  npm run bench:browser
```

The server entry override is local benchmark tooling, not a public package option. The benchmark binds only to loopback. No performance thresholds were added to CI; correctness tests cover delivery semantics independently of machine speed.
