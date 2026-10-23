# Contributing

Use a feature branch and pull request against `main`, including small fixes and documentation edits. Do not push directly to `main`. Leave PRs open for review; merging, npm publishing, and deployment require explicit authorization.

1. Install Node 22.12+ and run `npm ci`.
2. Create a branch from current `main`.
3. Start the sample playground with `npm run dev`.
4. Keep reusable code in `packages/jev-devtools`; sample scenarios and app-specific policy belong in `apps/playground`. Use public package imports across this boundary.
5. Run `npm run check`, `npm test`, `npm run build`, `npm run check:playground`, `npm run verify:package`, `npm run verify:nextjs`, and `git diff --check`. Check changed UI interactions in the browser when available and describe any verification gaps.
6. Push the feature branch and open a PR describing the behavior, checks, and limits. Use samples unless live verification is explicitly requested.

Tests use the real TypeSafe SDK with custom fetch fixtures. No secrets or inference service are required. See [AGENTS.md](AGENTS.md) for agent instructions and [release process](docs/releases.md) for packaging.

For drawer changes, run `npx playwright install chromium --only-shell` once, then `npm run verify:drawer`. This exercises the public component with sample requests in an isolated browser, including hidden updates, reopening, preserved controls, clear, and eviction. CI runs this check with React 18 and 19. `JEV_VERIFY_PORT` changes its loopback server port (default 4220).

For opt-in performance measurements, run `npm run bench:server` or `npm run bench:browser`. See the [performance baseline and reproduction guide](docs/performance.md) for workloads, measurements, and limitations. Run the server and browser benchmarks separately to avoid CPU contention.
