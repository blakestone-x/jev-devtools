# Project workflow

- Work on a feature branch and open a PR targeting `main` for every change unless the user explicitly requests otherwise.
- Do not commit or push changes directly to `main`. Do not merge, publish to npm, or deploy without an explicit request.
- Push completed feature work with verification details, and leave the PR open for review.
- Keep the package independent of the playground. Consumers use public exports; do not import internal source across workspaces.
- Run `npm run check`, `npm test`, `npm run build`, `npm run check:playground`, `npm run verify:package`, and `git diff --check` before opening or updating a PR. Visually verify UI changes when browser access is available; disclose unavailable checks.
- Add tests for observable behavior and credible regressions. Keep recorder fixtures independent of demo scenarios.
- Keep API credentials on the server. Distinguish samples from live inference. Follow official TypeSafe semantics; diagrams must not invent model reasoning or routing policies.
- Preserve third-party notices and PR-based workflow documentation when moving code.
