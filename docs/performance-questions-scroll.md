# Questions scrolling follow-up — October 23, 2026

This follow-up compares the original PR #17 implementation (`e5e8f11`) with the fast-scroll preview candidate (`b044617`), and compares both with main (`866f9b5`). The original report remains historical evidence.

## What changed

TanStack Virtual still controls the measured window. After two consecutive speed samples above 4,000 px/s in the same direction, unfocused cards show their question name and type in a lightweight preview. Each preview reserves the last measured row height, or the existing 600 px estimate for a row not yet measured. Preview geometry never overwrites the real-height cache. Detailed instructions and answers return when scrolling drops below 1,800 px/s or pauses for 120 ms. The lower exit threshold prevents rapid toggling. Large destination jumps bypass previews; cached virtualizer geometry distinguishes these from continuous scanning without forcing DOM layout. Repeated scroll events do not enqueue an already-active preview state again. These thresholds are product choices, not universal library defaults.

Focused cards retain their complete contents, including an open Score disclosure. Explicit picker/Previous/Next/keyboard jumps bypass preview mode. Nothing is removed from the trace, picker, or Raw payload. No new dependency or public API is introduced. The independent consumer build produces a 38.33 KB Questions chunk (11.74 KB gzip), compared with approximately 37.1 KB / 11.3 KB before; it remains loaded only when Questions is first opened. This changes the visual experience during rapid scanning: it deliberately avoids rendering answers that the user passes quickly, rather than rendering every skipped answer more cheaply.

## Research and alternatives

- [Virtuoso scroll-seek placeholders](https://virtuoso.dev/react-virtuoso/virtuoso/scroll-seek-placeholders/) uses velocity-gated lightweight items during fast scrolling. Its [scroll-handling guide](https://virtuoso.dev/react-virtuoso/virtuoso/scroll-handling/) also documents deferring expensive item content while scrolling. We adopted the pattern in the existing TanStack integration, with focus and explicit-navigation exceptions.
- [TanStack React Virtual](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual) supports direct DOM positioning and disabling synchronous React flushes. Direct positioning was already enabled. Experiments with top/left positioning, asynchronous updates, and containment did not produce a consistent cross-workload win; asynchronous updates also added about one frame to direct-scroll readiness. The final implementation retains the existing positioning and synchronous rendering behavior.
- [Virtua's React virtualizer](https://github.com/inokawa/virtua/blob/main/src/react/Virtualizer.tsx) and [list item implementation](https://github.com/inokawa/virtua/blob/main/src/react/ListItem.tsx) use containment, cached measurements, and kept-mounted indices. An exploratory Virtua 0.53.5 integration did not show a convincing mixed-answer improvement and delayed opening. It was not taken through full compatibility validation; this is not a general ranking of virtualizers.
- [react-window](https://github.com/bvaughn/react-window#readme) recommends predetermined sizes where possible because dynamic sizes cost more. Our full instructions, probability lists, images, and expanded Score legends have variable heights. Fixing card heights would change the content experience. An additional four-question grouping experiment also failed to reduce total sweep CPU consistently.

The exploratory variants used two paired rounds and informed candidate selection, not the final performance claims. The final comparison uses an independent four-round run across all three revisions.

## Measurement

Same isolated local Chromium setup as the original report: Apple M2, macOS arm64, Node 24.19.0, production React 19.3.1, headless Chromium 151.0.7922.34, 1710 × 961 viewport, DPR 2, 420 px drawer. Each revision/round gets a fresh browser process/profile. Personal tabs and extensions are excluded; the Mac's CPU remains shared. No GitHub Actions benchmark was run.

The shared run has four ordinary timing rounds across one question, 150 Choice questions, and 150 mixed Choice/Score/Noul/Box questions. Revision order alternates main → old PR → candidate and candidate → old PR → main; the old PR occupies the middle position. Each revision has four samples per workload. A separate two-round pass captures React commits and CPU profiles; its timings are not mixed into production measurements. All three revisions use the same final harness and installed dependencies, with builds and verification outside measurement.

The existing rapid sweep remains 121 top-to-bottom positions at two-frame intervals. The new reading action runs after the sweep, returns to the top, waits 200 ms, then moves 40 px every two frames for 121 positions (about 1,200 px/s). Reading therefore measures revisiting part of the list after a scan, not a cold full-list traversal. The harness records how many steps contain previews and does not finish an action until a real answer is visible, followed by two more frames. This includes restoration work and delay in the measured operation. It does not count a preview as a completed answer.

Task duration is Chrome main-thread task time, including browser/harness work; it is not process CPU percentage or input latency. rAF gaps are scheduling measurements, not displayed frame rates. These are descriptive medians/ranges, not confidence intervals. Timed scrolls use programmatic offsets; native wheel behavior is checked separately for correctness.

## Results

All **36 ordinary timing cases** completed: 180 timed operations plus 36 initial opens, with expected visible answers and no browser errors or long tasks. The two 150-question workloads still mount **2 cards instead of 150** on entry. No ordinary reading step used a preview; all 150-question candidate rapid sweeps recorded previews on 119 of 121 steps. All action completion checks required a full answer.

Repeat-open main-thread task time:

| Workload | Main | Old PR #17 | Candidate | Change vs old PR |
| --- | ---: | ---: | ---: | ---: |
| 1 Choice | 6.26 ms | 6.87 ms | 7.92 ms | +15.3% |
| 150 Choice | 28.11 ms | 11.35 ms | 11.01 ms | -2.9% |
| 150 mixed | 25.96 ms | 10.14 ms | 10.11 ms | -0.2% |

The candidate retains a **60.8% Choice / 61.0% mixed reduction against main**. Repeat-open readiness remains approximately 48 ms including the harness's two extra frames, so this is less work, not a claimed 61% latency improvement. Module-cold first opening on the one-question control remains approximately 64 ms versus 47 ms on main, inherited from the PR's lazy loading. The one-question repeat-open median is 1.05 ms above the old PR and 1.66 ms above main.

Rapid-scan main-thread task time, including final answer restoration:

| Workload | Main | Old PR #17 | Candidate | Change vs old PR |
| --- | ---: | ---: | ---: | ---: |
| 1 Choice | 93.97 ms | 110.26 ms | 107.61 ms | -2.4% |
| 150 Choice | 280.55 ms | 473.33 ms | 376.88 ms | -20.4% |
| 150 mixed | 269.52 ms | 486.52 ms | 405.68 ms | -16.6% |

The candidate used less rapid-scan task time in **3/4 Choice pairs and 4/4 mixed pairs** against the old PR. Choice ranges are **396.92–502.25 → 344.74–438.19 ms**; mixed ranges **442.52–505.92 → 366.57–429.88 ms**. One Choice pair was 10.4% worse. The medians are descriptive and ranges overlap; the improvement is not guaranteed on every run or machine.

Compared with main's fully mounted list, rapid scanning still costs **34.3% more for Choice and 50.5% more for mixed**. The old PR was 68.7% and 80.5% above main in this same run. Virtualization still trades entry cost and DOM size for work during scrolling.

Restoring detailed answers adds a deliberate settle delay: the rapid operation finishes at approximately **4.18 s instead of 4.08 s**. Frame-gap p95 stayed at **17.5–17.7 ms** on the candidate's large sweeps; there were no long tasks. Lower CPU here does not mean earlier detailed-answer readiness after a fast scan. The intermediate end-to-start regression is fixed: returning to the top remains approximately **48 ms**, and far-end readiness remains approximately **65 ms** on both PR versions, versus approximately 48 ms on main. Explicit picker and keyboard navigation also retain full answers.

Reading-paced task time after the scan:

| Workload | Main | Old PR #17 | Candidate | Change vs old PR |
| --- | ---: | ---: | ---: | ---: |
| 1 Choice | 67.48 ms | 72.48 ms | 67.15 ms | -7.4% |
| 150 Choice | 131.35 ms | 169.15 ms | 182.52 ms | +7.9% |
| 150 mixed | 175.20 ms | 170.98 ms | 187.35 ms | +9.6% |

This is **not an ordinary-reading optimization**. Choice rose **13.37 ms (+7.9%)**, and mixed **16.37 ms (+9.6%)** at the median. Choice ranges are **157.96–175.23 → 171.88–187.70 ms**; mixed ranges **148.43–192.47 → 116.31–198.95 ms**. Preview mode is off during every reading step. Some skipped content must now be mounted and measured when revisited, so the fast-scan saving does not make later inspection free. Ordinary-reading readiness remains about 4.28 s for the fixed-duration protocol.

Summing all five timed actions within each run (open, last, first, rapid scan, then reading) gives **672.67 → 582.74 ms for Choice (-13.4%)** and **684.71 → 603.30 ms for mixed (-11.9%)** versus the old PR. This particular sequence benefits overall despite the reading cost; different browsing patterns may not.

## Profiling

The separate **18-case profiling pass** completed without browser errors. Main has no React commits during these scrolls because all its answers are already mounted. Values below retain both runs, rather than mixing instrumented durations into the timing tables.

| Workload | Rapid-scan commits: old PR → candidate | Rapid-scan React render ms: old PR → candidate | Reading React render ms: old PR → candidate |
| --- | --- | --- | --- |
| 150 Choice | 131, 131 → 122, 122 | 51.0, 43.3 → 37.5, 32.1 | 6.3, 6.6 → 9.5, 9.4 |
| 150 mixed | 125, 125 → 122, 122 | 51.5, 47.2 → 35.4, 38.1 | 7.3, 7.7 → 9.6, 9.9 |

Normal-build rapid-scan scripting fell **134.17 → 110.25 ms** for Choice and **145.05 → 116.73 ms** for mixed. Layout fell **76.15 → 41.32 ms** and **72.47 → 42.37 ms**; style recalculation fell **35.36 → 19.81 ms** and **43.68 → 21.25 ms**. Fewer expensive card contents are created during scanning, but range updates and React work remain. The increased reading render work supports the deferred-work tradeoff rather than a claim that inspecting all details became free.

## Validation and limits

All required checks passed locally: check, tests (28 library + 3 playground), build, check:playground, verify:package, verify:nextjs, verify:drawer, and git diff --check. The independent React consumer built and verified exports/SSR; Next.js dev routing, Server Actions, Server Components, SSE, reload retention and clear passed, as did the production build with inspector endpoints disabled. Existing Vite module-directive warnings remain nonfatal.

The browser check visits all 150 full answers, preserves keyboard/picker navigation, focused disclosures, recycled legend state, close/reopen position, long instructions, probabilities, Score/Noul/Box/image output, resize layout, incoming results, and Raw. New checks exercise isolated end-to-start jumps, native wheel movement in both directions, labeled rapid-scroll previews, restoration at reading speed without stopping, restoration on idle, and keeping a focused expanded answer intact during rapid scrolling. UI screenshots were inspected locally. The end-to-start regression check failed on intermediate commit `bc4b7dd` because it showed a busy preview with no answer, then passed after the jump fix. Intermediate timing runs that exposed this bug are excluded from final results.

The optimization targets fast scanning, not ordinary reading. Full answers incur normal rendering work when inspected. Main still avoids virtualization's per-scroll mounting/measurement overhead by mounting all 150 answers at entry. Browser Find and screen-reader document browsing still only see mounted rows; the complete picker and Raw remain available. No heap saving, mobile/touch performance, GPU presentation improvement, or assistive-technology certification is claimed. Preview thresholds may need adjustment based on real trackpad/mobile feedback.

## Reproduction and evidence

```sh
npm ci
npx playwright install chromium --only-shell
npm run verify:drawer
BENCH_SUITE=questions \
  BENCH_SCENARIOS=small,many-questions,mixed-questions \
  BENCH_OUTPUT=benchmarks/results/questions-scroll-final \
  npm run bench:compare -- \
  866f9b5522febda3123f5fc738fe9aef47049403 \
  e5e8f11156c26f7ad715bf30c0596862dfd180c2
```

The comparison command accepts one or more baseline refs and compares their archived packages with the current working tree. `BENCH_ROUNDS` defaults to four; `BENCH_PROFILE_ROUNDS` defaults to two (zero skips the separate profiling pass for exploratory work). `BENCH_BASE_PORT` defaults to 4211; this three-revision run uses ports 4211–4213. Browsers and owned servers are stopped afterward.

[Production measurements](benchmarks/2026-10-23-questions-scroll-browser.json), [React profiling records](benchmarks/2026-10-23-questions-scroll-react.json), [revision provenance](benchmarks/2026-10-23-questions-scroll-revisions.json), and [compressed CPU profiles](benchmarks/2026-10-23-questions-scroll-profiles/) preserve the final evidence. Decompress a profile and import it into Chrome DevTools. [Exploratory measurements](benchmarks/2026-10-23-questions-scroll-explorations.json) retain the completed two-round candidates separately; they are not pooled with the final results.
