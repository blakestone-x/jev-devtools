# Local performance benchmarks

Keep benchmark scripts and fixtures in Git so comparisons remain reproducible. Keep generated measurements, profiles, screenshots, logs, and per-run reports **out of Git**, under ignored `benchmarks/results/`. Do not copy results into `docs/` or force-add ignored artifacts. Summarize findings in the relevant PR description or discussion.

Performance benchmarks run locally only. Do not add or dispatch GitHub Actions benchmark jobs. Correctness and integration checks may run in CI.

## Run locally

Use Node 22.12+ (24 recommended). Install dependencies with `npm ci`. All workloads use deterministic samples; no API key or paid inference is required.

```sh
# Run separately, with no competing builds or benchmark processes.
npm run bench:server
npm run bench:browser
```

The server suite writes `benchmarks/results/server.json`. The browser command builds production React and serves a manual harness at http://127.0.0.1:4190/ (`BENCH_PORT` overrides the port). Wait for “Ready,” then run suites sequentially in one foreground browser tab. Results save as timestamped JSON and `browser.json` under `benchmarks/results/`. Restart the server after source changes; this is not HMR.

`BENCH_LIVE=1 npm run bench:browser` exercises the real adapter with local sample responses. Without it, the harness replays captured snapshots. “Live” here does not mean live inference.

For a before/after comparison in fresh isolated Chromium processes:

```sh
npx playwright install chromium --only-shell
BENCH_OUTPUT=benchmarks/results/my-comparison \
  npm run bench:compare -- BASE_COMMIT
```

Replace `BASE_COMMIT` with the baseline's commit SHA. The command builds the archived baseline and current working tree, runs timing and profiling separately, and stops its own browsers and servers afterward. `BENCH_ROUNDS` controls timing rounds (default four); `BENCH_BASE_PORT` controls loopback ports (default 4211 onward). `BENCH_DRAWER_MODES=open,closed,unopened` includes hidden-drawer workloads. Use a unique ignored output directory for each experiment; repeated output paths can overwrite previous measurements.

For Choice diagram comparisons (small control, 150 categories, and combined stress):

```sh
BENCH_SUITE=choices BENCH_OUTPUT=benchmarks/results/choice-comparison \
  npm run bench:compare -- BASE_COMMIT
```

This measures warmed mounts and the same native pan/wheel/Fit sequence in each revision, with separate profiling runs. It records scene size and whether Fit contains it. The manual [playground sandbox](http://127.0.0.1:4182/?sandbox=1) is available with `npm run dev`; it is not a performance measurement environment.

## Report in the PR

Include:

- Baseline and candidate commit SHAs, plus any uncommitted runtime changes.
- Machine/OS, Node, React and browser versions, viewport, and workload sizes.
- Exact commands, repeat count, run order, and separate timing/profiling methodology.
- Before/after measurements with units and variability, regressions as well as gains, and user-visible tradeoffs.
- Correctness checks, exclusions, and limitations. Sample-call timings are not inference latency; frame gaps are not proof of GPU presentation performance.

Retain raw evidence locally under `benchmarks/results/`. Share an artifact separately if needed and link it from the PR; do not commit it. Historical summaries are in PRs [#13](https://github.com/diegoag64/jev-devtools/pull/13), [#14](https://github.com/diegoag64/jev-devtools/pull/14), [#15](https://github.com/diegoag64/jev-devtools/pull/15), and [#16](https://github.com/diegoag64/jev-devtools/pull/16). Open optimization PRs describe their own proposed changes and measurements.

These are opt-in diagnostics, not hardware-sensitive CI thresholds. Keep other CPU-heavy work stopped during measurements, compare matched workloads, and report uncertainty instead of treating one run as a universal speedup.
