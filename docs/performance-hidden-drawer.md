# Hidden drawer rendering — October 23, 2026

Suppressing hidden inspector updates reduced closed-after-use main-thread work by **29% for small inputs** and **41% for combined stress** against current main. Reopening preserved state and remained around 47–49 ms. The small-input open control was 12% slower; this is a targeted hidden-rendering improvement, not a universal speedup.

## Behavior

The inspector retains its UI after closing, but incoming traces no longer schedule React updates while it is hidden. The connection continues validating and merging every event; opening publishes the latest accumulated snapshot. A memoized panel preserves the selected request, filters, detail tab, question, flow preference, and camera. A retained selection survives incoming requests; a cleared or evicted selection falls back using the existing selection rules.

A drawer configured with `defaultOpen={false}` defers mounting the panel until its first open. The drawer pauses native SVG animation timelines while hidden and resumes them on open, without changing the user's Pause/Play preference. The public API and React 18/19 support are unchanged.

This is a rendering optimization. The server, protocol, retention policy, and client parsing are unchanged. Once opened, the hidden DOM and last displayed snapshot remain allocated alongside the current trace store. A long closed session can retain old displayed traces until reopen or unmount; this is the memory tradeoff for preserving state, not a heap reduction claim. Initial snapshots still transfer full history. Reopening performs the deferred render, so it is measured separately.

## Comparison method

- Baseline: current `main` after PR #15, `4007d1dae73a7c443a8738db8e4b2bbad5194971`.
- Candidate runtime and harness: `c0b2457c172b1893e77010b8eae304732e3a8320`.
- Apple M2, macOS arm64, Node 24.19.0, Playwright 1.62.1 / headless Chromium 151.0.7922.34, production React 19.3.1, 1710 × 961 viewport, DPR 2.
- Four paired rounds, alternating AB/BA. Fresh browser process and profile per revision/round, identical installed dependencies and harness, builds/checks outside timing. This isolates the browser from personal tabs and extensions; the host Mac is still shared hardware.
- Two workloads, each with 200 retained requests: `max-history` with small inputs and three categories, and `combined` with 80 KB state per request and 150 categories.
- Three drawer modes per workload: open; opened and warmed up, then closed; and initially closed, never opened. Each uses five unmeasured warm-up calls followed by five measured calls at one per second over approximately 5.05 seconds. No live inference or credentials.
- Closed cases reopen after measurement. Readiness requires the latest unique request ID, success state, and expected output-card count, then two more animation frames. Initial closed mount readiness measures the launcher, **not** history delivery or diagram readiness.
- Normal timings use production bundles without the React profiling renderer or CPU sampler. Separate combined-workload runs use both instruments to count commits and retain CPU profiles. Instrumented timings are not mixed into ordinary results.

Main-thread task time comes from CDP `Performance.getMetrics` and includes browser and harness work; it is not inference latency or whole-process CPU consumption. Long tasks are browser tasks over 50 ms. Frame gaps measure rAF scheduling, not GPU presentation or INP. These small samples are descriptive, not confidence intervals.

## Production results

All **48 measured windows / 240 sample calls** completed with the expected final response, no browser errors, and **zero streaming long tasks** on both versions. The same amount of warm-up work preceded measurement. Medians average the middle two of four values; ranges include all four runs.

| Workload / drawer mode                | Task ms per five-call window: main → candidate | Change | Range: main → candidate   |
| ------------------------------------- | ---------------------------------------------: | -----: | ------------------------- |
| 200 small requests / open             |                                  128.6 → 144.3 | +12.2% | 124.5–134.5 → 140.0–158.0 |
| 200 small requests / closed after use |                                    94.2 → 67.3 | −28.6% | 77.1–98.2 → 65.5–72.6     |
| 200 small requests / never opened     |                                   108.7 → 80.6 | −25.9% | 95.8–115.7 → 64.1–85.0    |
| Combined stress / open                |                                  294.4 → 290.5 |  −1.3% | 255.8–488.7 → 261.1–306.8 |
| Combined stress / closed after use    |                                   123.1 → 72.6 | −41.0% | 111.9–132.2 → 71.1–75.9   |
| Combined stress / never opened        |                                   118.0 → 97.4 | −17.5% | 99.6–134.0 → 85.8–101.0   |

Every closed-after-use and never-opened pair improved. The open small-input control cost **15.7 ms more total main-thread work over five seconds**, consistently across the four pairs. This is a measured tradeoff, not a uniform speedup. The combined open median is effectively unchanged and its baseline has a 488.7 ms outlier. No FPS or long-task improvement is claimed: frame-gap p95 remained 17.0–18.6 ms, and neither version had streaming long tasks.

Hidden scripting time fell more than total task time: closed-after-use medians were **29.5 → 7.1 ms** for small requests and **51.4 → 9.4 ms** for combined stress. Browser/harness work, stream handling, and parsing remain. SSE payloads were effectively unchanged: approximately **43.7 KB / five events** for small requests and **953.7 KB / ten events** for combined, per window. Small byte differences reflect captured durations and request IDs.

| Reopen readiness, including two frames | main median | Candidate median |
| -------------------------------------- | ----------: | ---------------: |
| 200 small requests / closed after use  |     46.7 ms |          46.9 ms |
| 200 small requests / never opened      |     47.4 ms |          47.2 ms |
| Combined stress / closed after use     |     47.6 ms |          47.7 ms |
| Combined stress / never opened         |     47.6 ms |          48.9 ms |

Reopen times stayed close to the frame-based measurement floor. The largest candidate reopen was 50.7 ms; these sample results do not guarantee equivalent latency for larger payloads, different tabs, or slower devices. A pinned request is verified separately by the correctness checks; benchmarks follow the newest request.

Raw data: [production windows and mounts](benchmarks/2026-10-23-hidden-drawer-browser.json).

## Separate profiling evidence

A separate two-round AB/BA pass measured the combined workload in all three modes: **12 windows / 60 measured calls**, plus warm-up. These readable production bundles use React's profiling renderer and a 1 ms CPU sampler; their timings are excluded from the production table.

| Mode             | Inspector commits on main (two runs) | Candidate commits (two runs) | Summed React render ms: main → candidate |
| ---------------- | ------------------------------------ | ---------------------------- | ---------------------------------------- |
| Open             | 15, 15                               | 15, 15                       | 27.0–32.0 → 34.9–35.7                    |
| Closed after use | 9, 9                                 | **0, 0**                     | 34.1–34.8 → **0, 0**                     |
| Never opened     | 10, 10                               | **0, 0**                     | 30.7–32.8 → **0, 0**                     |

Each reopen produced two commits on both versions. Candidate hidden CPU samples no longer contain the baseline's React teardown, DOM insertion, and style-setting hotspots; stream receipt, harness polling, and native browser work remain. Sampling does not attribute every saved millisecond. Instrumented open renders were somewhat slower, consistent with avoiding any claim of an open-view rendering improvement.

[React commit records](benchmarks/2026-10-23-hidden-drawer-react.json), [revision metadata](benchmarks/2026-10-23-hidden-drawer-revisions.json), and [compressed CPU profiles](benchmarks/2026-10-23-hidden-drawer-profiles/) retain both orders. Decompress a `.cpuprofile.gz` and import the result into Chrome DevTools. The ignored local output additionally includes screenshots, logs, and source maps.

## Reproduce

```sh
npm ci
npx playwright install chromium --only-shell
BENCH_DRAWER_MODES=open,closed,unopened \
  BENCH_SCENARIOS=max-history,combined \
  BENCH_OUTPUT=benchmarks/results/hidden-drawer \
  npm run bench:compare -- 4007d1dae73a7c443a8738db8e4b2bbad5194971
```

`BENCH_DRAWER_MODES` defaults to `open` for existing command-line callers. `BENCH_ROUNDS` changes ordinary timing rounds (default four); profiling runs use two rounds. `BENCH_BASE_PORT` changes the paired server ports (default 4211/4212). The command stops its own browsers and servers on completion. Run performance comparisons locally; the hosted benchmark workflow has been retired. Timings have no hardware-dependent pass/fail threshold; missing final responses and browser exceptions fail the run.

## Correctness

`npm run verify:drawer` uses the actual public component, real adapter/SSE, and deterministic SDK responses. Its hidden-DOM regression fails on unchanged main and passes on the candidate. It checks preserved selection, filters, tab, question, camera, flow pause, drawer dimensions, SVG suspension/resumption, clear and eviction while closed, capture before first open, and Escape/focus restoration. CI covers React 18 and 19.

The existing package tests continue covering transport sequencing, resynchronization, cleanup, bounded history, authorization, error/cancellation, and capture. Required package/playground checks and independent packed React and Next.js consumers passed. The reopened drawer was visually checked in isolated Chromium.
