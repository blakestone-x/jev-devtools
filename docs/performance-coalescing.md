# Browser frame coalescing — October 23, 2026

Publishing the latest accumulated trace state once per animation frame reduced main-thread task time for large-state and combined workloads in matched isolated-browser runs against the original PR #15. Small requests were slightly more expensive. No streaming long tasks occurred on either version in this run, so this is evidence of reduced total work, not a demonstrated long-task or FPS improvement.

## What changed

The original incremental client published every SSE event immediately. A fast sample request can therefore render pending and completed states in separate React commits, with the newest-request selection rebuilding the diagram. The client now validates and merges **every** event immediately, preserving revision continuity and all retained traces, but queues only the newest accumulated history for publication on the next animation frame.

There is a 100 ms timer fallback for suspended animation frames; background timer throttling can delay it. Publication cancels the other scheduled callback. Invalid data cancels queued publication before resynchronizing, and unmount cancels queued frames, timers, and retries. Connection status still updates immediately. Long-running requests can still appear pending; very fast intermediate states can share one paint. This adds up to roughly one frame of scheduling delay in an active tab, plus React/browser scheduling, instead of publishing immediately.

Only `src/trace-stream.ts` changes package runtime behavior. The protocol, recorder, server batching, diagrams, retention limits, and public setup API are unchanged. Playwright is a workspace development dependency and is not shipped to consumers.

## Matched comparison

- Baseline: original PR #15, `a8a01d307a8af736fdf6d3d055addeb52982b217`, including incremental transport. This is **not PR #14** or the published npm package.
- Candidate: the frame-coalescing working tree based on that commit. Raw reports include its package diff SHA-256 for provenance.
- Apple M2, macOS arm64, Node 24.19.0, Playwright 1.62.1 / Chromium headless shell 151.0.7922.34, production React 19.3.1, viewport 1710 × 961, DPR 2.
- Four paired rounds in AB, BA, AB, BA order. Each revision/round launched a fresh Chromium process/profile, with no personal browser tabs, extensions, cookies, or cache. The Mac itself was shared; this is browser isolation, not hardware isolation.
- Three workloads, each with 200 retained requests: small inputs; 80 KB state per request; and 80 KB state plus 150 choice categories. Same sample transport and harness for both builds. No API keys or live inference.
- One unmeasured five-call warm-up window per workload, then five measured calls at one per second in an approximately 5.05-second window. **24 measured windows / 120 calls**, plus equal warm-up work. All builds and package verification ran outside timed windows.
- Every measured window checked that the latest unique sample request ID and success state appeared in the inspector, and that the expected number of output cards was present. All passed; no browser exceptions were recorded.

Normal timing builds have no React profiling renderer or CPU sampler attached. CDP `Performance.getMetrics` records main-thread task, script, layout, and style durations. Task duration includes native browser work and harness overhead; it is not process CPU consumption or inference latency. Long tasks are browser-reported tasks over 50 ms; frame gaps are rAF scheduling, not GPU presentation or INP. Medians below average the two middle values of four windows; these small samples are not confidence intervals.

| Workload                 | Main-thread task ms/window: original → coalesced | Change | Range: original → coalesced |
| ------------------------ | -----------------------------------------------: | -----: | --------------------------- |
| 200 small requests       |                                    132.2 → 148.1 | +12.0% | 123.3–137.5 → 144.1–165.9   |
| 200 large-state requests |                                    819.0 → 188.8 | −76.9% | 808.9–840.8 → 157.9–221.1   |
| Combined stress          |                                  1,000.4 → 285.0 | −71.5% | 832.8–1,182.2 → 249.6–308.4 |

The small workload delivers only one event per call, so there is little intermediate work to combine. It pays the extra publication scheduling cost: about **16 ms more total task time over five seconds**, rather than gaining speed. Both versions had **zero streaming long tasks in all 24 windows**; frame-gap p95 stayed approximately 17–18 ms. The heavy-workload improvement held in every pair, including reversed order.

Traffic and event counts were effectively unchanged: five events / ~43.7 KB for small requests; ten / ~885.6 KB for large state; ten / ~953.7 KB for combined, per five-call window. A few bytes vary with captured durations. This fix reduces browser publication work, not server traffic or protocol event counts.

Warm-code full-history mount medians were **158.4 → 166.6 ms** for large state and **216.7 → 202.4 ms** for combined. The first max-history mount includes cold code loading: **397.3 → 408.1 ms**. Four samples per version; initial snapshots are still full history, and no startup optimization is claimed.

Raw measurements: [all production windows and mounts](benchmarks/2026-10-23-coalescing-browser.json).

## Separate profiling evidence

A separate ABBA run used readable production bundles, React's profiling renderer, and a 1 ms CDP CPU sampler. It measured four combined windows, each after its own five-call warm-up. These instrumented timings are **not** mixed into the production results above.

| Measurement per five-call window      | Original PR #15 | Frame coalescing |
| ------------------------------------- | --------------: | ---------------: |
| Inspector Profiler commits, both runs |          24, 24 |           15, 15 |
| Main-thread task time                 |    989–1,095 ms |       264–278 ms |
| Layout duration                       |        87–96 ms |         72–77 ms |
| Summed React actual render duration   |        28–30 ms |         35–37 ms |

Fewer commits and less layout support combining redundant publications. **JavaScript/React render time itself did not improve consistently**; reduced total main-thread work should not be described as faster JSON parsing or uniformly faster React renders. CPU samples include substantial native browser work under `(program)` and layout measurements in the viewport hook. They do not attribute every saved millisecond to a specific native rendering operation. Diagram remounting still occurs when following a new request.

[React commit measurements](benchmarks/2026-10-23-coalescing-react.json) and [compressed raw CPU profiles](benchmarks/2026-10-23-coalescing-profiles/) retain both orders. Decompress a `.cpuprofile.gz` and import the `.cpuprofile` into Chrome DevTools to inspect it. Reproduction also writes screenshots and readable bundle source maps under `benchmarks/results/`.

## Relation to the original concern

The original personal-browser runs and the [subsequent cloud comment](https://github.com/diegoag64/jev-devtools/pull/15#issuecomment-6371366693) showed mixed long-task results, with background activity and different browser/display environments. Those observations remain valid and are preserved in [the incremental transport report](performance-deltas.md). This isolated comparison does **not** retrospectively identify the cause of those slow windows or rule out regressions in every environment. It establishes a repeatable reduction in heavy-workload main-thread work with the coalescing change.

These fast synthetic responses are especially suitable for combining pending/final publications. Real responses separated by multiple frames will still render separately and may see a smaller benefit. Large initial snapshots, closed-drawer work, very tall diagrams, and the cloud report's no-viewer overhead remain separate follow-ups.

## Reproduce locally or in CI

```sh
npm ci
npx playwright install chromium --only-shell
BENCH_SCENARIOS=max-history,large-state,combined \
  BENCH_OUTPUT=benchmarks/results/coalescing-validation \
  npm run bench:compare -- a8a01d307a8af736fdf6d3d055addeb52982b217
```

The comparison command archives and builds the baseline package, builds the working tree, starts loopback-only servers, then runs each browser sequentially. Both revisions use the current installed dependency set. It runs four ordinary rounds and two separate profiling rounds, writes provenance and a candidate package patch, and stops its servers/browsers on completion. It does not alter branches or use the user's browser profile. Keep other heavy machine workloads stopped where practical.

`BENCH_BASE_PORT` chooses the first of two ports (default 4211); `BENCH_ROUNDS` changes ordinary rounds. `benchmarks/isolated.mjs URL [URL ...]` also measures already-built servers. Set `BENCH_PROFILE=1` on both server and runner for profiling builds. `node benchmarks/profile-summary.mjs path/to/file.cpuprofile` prints sampled self/inclusive hotspots; inclusive times overlap.

The former **Isolated browser benchmark** workflow compared revisions on a hosted Ubuntu VM and uploaded results, profiles and screenshots. That workflow has been retired to avoid hosted benchmark costs. Run the comparison locally using the command above; correctness checks remain in CI. To compare this exact fix, use the original PR #15 SHA above as the baseline rather than `main`.

## Correctness and integration checks

The delivery regression test failed on the pre-fix implementation because it published both intermediate updates before the frame, and passed with the fix. It verifies terminal success/error/cancellation retention, clear winning over queued data, fallback delivery with frames suspended, no duplicate timer delivery, gap recovery, and unmount cancellation. Existing transport/reducer tests cover legacy snapshots, revision continuity, retained order, eviction, session isolation and reconnects.

Required local checks passed: `npm run check`, `npm test` (28 package + 3 playground tests), `npm run build`, `npm run check:playground`, `npm run verify:package`, `npm run verify:nextjs`, and `git diff --check`. Independent packed React/Next.js consumers passed. Before/after screenshots were inspected; diagram content and styling are unchanged, including the existing wide-diagram legibility limits.
