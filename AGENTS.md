# Project workflow

These instructions apply to contributing to this repository. For installing the published package into another app, read [the setup skill](packages/jev-devtools/skills/setup-jev-devtools/SKILL.md) and follow that app's own workflow. The skill and its references ship with npm; keep them aligned with public APIs and the independent examples. [llms.txt](llms.txt) indexes the consumer documentation.

- Work on a feature branch and open a PR targeting `main` for every change unless the user explicitly requests otherwise.
- Do not commit or push changes directly to `main`. Do not merge, publish to npm, or deploy without an explicit request.
- Push completed feature work with verification details, and leave the PR open for review.
- Run performance benchmarks locally, not in GitHub Actions. Do not add benchmark workflows or dispatch hosted benchmark runs.
- Keep the package independent of the playground. Consumers use public exports; do not import internal source across workspaces.
- Run `npm run check`, `npm test`, `npm run build`, `npm run check:playground`, `npm run verify:package`, `npm run verify:nextjs`, and `git diff --check` before opening or updating a PR. Visually verify UI changes when browser access is available; disclose unavailable checks.
- Add tests for observable behavior and credible regressions. Keep recorder fixtures independent of demo scenarios.
- Keep API credentials on the server. Distinguish samples from live inference. Follow official TypeSafe semantics; diagrams must not invent model reasoning or routing policies.
- Preserve third-party notices and PR-based workflow documentation when moving code.
- After changing the package version, run `npm run sync:readme-version` to update both README badges, exact-version npm links, and archive examples. CI checks and package creation reject stale README versions.
- Keep generated benchmark results, CPU profiles, screenshots, logs, and per-run reports out of Git under ignored `benchmarks/results/`. Keep scripts/fixtures tracked; report comparisons, provenance, and limitations in PR descriptions or discussions. Do not force-add artifacts or copy them into `docs/`.
