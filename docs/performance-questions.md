# Questions virtualization — October 23, 2026

Virtualizing Questions reduced repeat-open main-thread work by **62% for 150 Choice questions** and **60% for 150 mixed questions** against current main. It mounts two cards at entry instead of 150, while preserving access to every captured answer. Full-list sweeps cost more CPU, and first-time loading and far-end jumps each cost about one extra frame.

## Behavior and scope

The Questions tab previously mounted every captured question and answer. It now measures variable-height cards and mounts the visible range, one adjacent card on each side, and any focused card. A picker lists every captured question, Previous/Next provide sequential navigation, and Up/Down/Home/End navigate from the focused list or card. All captured instructions, criteria, probabilities, legends, and image previews remain available. The Raw view remains complete.

Focused controls are retained offscreen. Expanded Score legends survive row recycling, and closing/reopening preserves the Questions position and controls. Zero-size measurements while the drawer is hidden do not collapse its saved scroll range. Switching tabs or requests starts a fresh Questions view, matching the previous lifecycle. Image lookup runs once per captured state instead of once per question.

This uses [TanStack Virtual](https://tanstack.com/virtual/latest/docs/api/virtualizer), a headless virtualizer, with measured heights and direct DOM positioning. It does not reintroduce the TanStack DevTools shell. The Questions module is loaded on demand. The independent Vite consumer produced a approximately 37.1 KB Questions chunk, 11.3 KB gzipped, including its renderer and virtualizer. This is a bundle cost for first-time Questions users, not a zero-cost optimization.

Browser Find and screen-reader document browsing only see mounted cards. The full picker, keyboard navigation, and Raw view provide access to all captured answers. This changes rendered DOM, not capture budgets, history retention, transport bytes, or the size of retained trace objects. No heap reduction or screen-reader certification is claimed.

## Comparison method

- Baseline: current main after PR #16, `866f9b5522febda3123f5fc738fe9aef47049403`.
- Candidate runtime and harness: `eaeaae07b460dc987ab11361ed1f0f53459134c6`.
- Apple M2, macOS arm64, Node 24.19.0, Playwright 1.62.1 / headless Chromium 151.0.7922.34, production React 19.3.1, viewport 1710 × 961, DPR 2, default drawer height 420 px.
- Four paired rounds with alternating AB/BA order; a fresh browser process and profile per revision/round. Both revisions use the same harness and installed dependencies. Builds and verification run outside measurement. Browser isolation removes personal tabs/extensions, but this Mac remains shared hardware.
- Three cases: one Choice question; 150 Choice questions with three categories each; and 150 mixed Choice/Score/Noul/Box questions with an image and one long instruction. All fixtures use the real SDK, recorder and SSE adapter with deterministic local responses, no inference or credentials.
- Each case loads Flow first, measures an initial Questions open, returns to Flow, then measures a repeat open, jump to the last question, jump to the first, and a 121-position top-to-bottom sweep at two-frame intervals. Both versions receive the same scroll protocol. Readiness requires the requested question intersecting the viewport and its answer being mounted, followed by two more frames.
- Only the first case's initial open is module-cold; later cases reuse loaded JavaScript. The sweep changes scroll positions programmatically; it is not a touch/wheel, GPU presentation, or INP benchmark. Card DOM counts exclude the native picker and toolbar.
- A separate two-round profiling pass uses React's profiling renderer and a 1 ms CPU sampler. Instrumented timings are excluded from ordinary timing results.

Main-thread task time is the CDP `TaskDuration` difference across an operation, including browser and harness work. It is not end-user latency or whole-process CPU utilization. Long tasks exceed 50 ms. rAF gaps measure scheduling, not displayed frames. Four-run medians average the middle two values; ranges retain all runs. These are descriptive samples, not confidence intervals.

## Production results

All 24 case runs completed, covering 96 timed operations plus 24 initial opens, with expected target answers and no browser errors. Opening either 150-question case mounted **2 cards instead of 150**. Choice card elements fell from **4,050 to 54**, and mixed card elements from **2,716 to 52**; these counts exclude picker options and toolbar elements.

Repeat-open main-thread work:

| Workload | Main → candidate task median | Change | Range: main → candidate |
| --- | ---: | ---: | --- |
| 1 Choice question | 6.69 → 7.67 ms | +14.6% | 6.64–6.79 → 6.98–8.00 ms |
| 150 Choice questions | 27.52 → 10.50 ms | -61.9% | 27.33–27.94 → 9.56–10.89 ms |
| 150 mixed questions | 25.51 → 10.14 ms | -60.2% | 23.00–26.97 → 9.65–11.05 ms |

Every paired 150-question open used less main-thread time. End-to-end readiness includes two frames and stayed near the measurement floor: **48.30 → 47.65 ms** for Choice, **48.30 → 48.15 ms** for mixed, and **48.10 → 48.00 ms** for the one-question control. This is primarily a reduction in work and mounted content, not a measured tab-switch latency improvement.

The first ever Questions open, measured on the one-question case in each fresh browser, increased from **47.45 to 64.00 ms** median (ranges 46.8–48.8 versus 63.4–65.2). It includes the new lazy chunk and a deferred first render. Subsequent opens do not use that deferred transition. All initial opens and timed operations on both versions had **zero long tasks**. The historical 177 ms Questions long task did not reproduce on current main in this isolated environment, so no claim is made to have removed it.

Full-list sweep, about 4.08 seconds:

| Workload | Main → candidate task median | Change | Range: main → candidate |
| --- | ---: | ---: | --- |
| 1 Choice question | 104.35 → 104.49 ms | +0.1% | 99.00–119.11 → 95.15–140.76 ms |
| 150 Choice questions | 293.77 → 520.62 ms | +77.2% | 268.98–312.95 → 454.42–568.88 ms |
| 150 mixed questions | 296.83 → 517.32 ms | +74.3% | 281.91–315.26 → 509.05–534.45 ms |

Virtualization **moves some work to scrolling**: rows are measured, mounted and recycled on demand. All four paired sweeps of each large case used more task time, about **220–227 ms more** across the full sweep at the median. Scripting rose from **8.11 to 150.11 ms** for Choice and **7.90 to 148.00 ms** for mixed. This is a real cost, not a universal speedup.

Sweep frame-gap p95 stayed within **17.4–17.7 ms** on main and **17.1–17.7 ms** on the candidate. Neither version had a long task. Jumping directly to the last question was one frame slower: Choice **48.55 → 64.95 ms**, mixed **48.25 → 65.00 ms**, because the target row must mount. Returning to the first question stayed near 48 ms. All requested answers were reachable.

[Production measurements](benchmarks/2026-10-23-questions-browser.json) contain every run, including frame gaps, CPU components, first opens and card counts. [Revision metadata](benchmarks/2026-10-23-questions-revisions.json) identifies the exact clean runtime revision. Exploratory iterations before fixing deferred repeat opens and stabilizing the picker are excluded from these final numbers. The memoized picker avoids rebuilding unchanged navigation on range updates; this comparison does not isolate its individual performance contribution.

## Profiling

The separate two-round pass completed all 12 cases without browser errors. It confirms that entry renders less content while scrolling now requires React work to mount/recycle rows. Numbers below list the two runs rather than averaging them; these instrumented durations are excluded from the production table.

| Case | Open React render ms: main → candidate | Sweep commits: main → candidate | Sweep React render ms: main → candidate |
| --- | --- | --- | --- |
| 150 Choice | 6.8, 5.9 → 2.5, 1.7 | 0, 0 → 131, 131 | 0.0, 0.0 → 54.4, 50.2 |
| 150 mixed | 4.2, 3.7 → 1.7, 1.5 | 0, 0 → 125, 125 | 0.0, 0.0 → 53.8, 56.2 |

Opening Questions produced one commit on main and two on the candidate, including viewport measurement. The one-question sweep produced no React commits on either version. CPU samples in the candidate include React reconciliation, DOM mutation and virtualizer work during scrolling; main's already-mounted list does not incur those React updates. These observations support the measured scrolling tradeoff, without attributing every millisecond to a specific function.

[React commit records](benchmarks/2026-10-23-questions-react.json) and [compressed CPU profiles](benchmarks/2026-10-23-questions-profiles/) retain both orders. Decompress a `.cpuprofile.gz` and import it into Chrome DevTools. Ignored local output also contains screenshots, logs and built source maps.


## Verification and reproduction

`npm run verify:drawer` visits all 150 answers through the public component and real adapter. It checks complete question instructions and probabilities; picker, previous/next and keyboard navigation; focused controls remaining mounted; recycled Score legend state; Noul and Box output; decoded images; long instructions; width changes; no overlapping rows; incoming selected requests; Raw payload access; and close/reopen scroll preservation. Existing hidden-drawer, eviction, clear and focus restoration checks still pass. The mount-count regression fails on unchanged main and passes on this branch. CI runs browser correctness with React 18 and 19.

All required package/playground checks, package tests, independent packed React consumer checks, and Next.js development/production verification passed locally. The mixed-answer Questions UI was visually checked in isolated Chromium.

```sh
npm ci
npx playwright install chromium --only-shell
npm run verify:drawer
BENCH_SUITE=questions \
  BENCH_SCENARIOS=small,many-questions,mixed-questions \
  BENCH_OUTPUT=benchmarks/results/questions \
  npm run bench:compare -- 866f9b5522febda3123f5fc738fe9aef47049403
```

`BENCH_ROUNDS` changes ordinary timing rounds (default four); profiling uses two rounds. `BENCH_BASE_PORT` changes paired ports (default 4211/4212). The runner stops its own browsers/servers. The Questions comparison also runs in its own CI job alongside the existing stream comparison, uploading screenshots, raw data and CPU profiles. Timing values have no hardware-dependent pass/fail threshold; missing answers and browser errors fail the run.

Remaining gaps include low-end/mobile hardware, real assistive-technology sessions, native touch/wheel scrolling, sustained heap profiling, and continuous request updates while scrolling. An optimization for tab entry does not establish a speedup for every browsing pattern.
