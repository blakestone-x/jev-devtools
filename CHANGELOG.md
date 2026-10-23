# Changelog

User-facing changes, newest first. **Unreleased** means merged into `main` but not published to npm. Open PRs are not release entries; see [work in progress](https://github.com/diegoag64/jev-devtools/pulls).

Dates below use UTC and were checked against npm's publication history. The historical entries were reconstructed from the release PRs and merged changes. Versions remain experimental before 1.0.

## At a glance

| Version | Published (UTC) | Highlights |
| --- | --- | --- |
| [Unreleased](#unreleased) | Not published | Batched updates, changed-trace streaming, frame-coalesced rendering, and less work while the drawer is closed. |
| [0.1.3](#013--october-23-2026-experimental) | 2026-10-23 | Isolated drawer styles, diagram pan/zoom, and version-specific npm links. |
| [0.1.2](#012--october-23-2026-experimental) | 2026-10-23 | Bundled AI setup skill and framework recipes. |
| [0.1.1](#011--october-23-2026-experimental) | 2026-10-23 | Full inline demo GIF and published-package installation instructions. |
| [0.1.0](#010--october-23-2026-experimental) | 2026-10-23 | First public package: React inspector, Jev diagrams, Node adapter, and Next.js integration. |

## Unreleased

### Performance

- Batch outgoing inspector updates and share serialization across viewers in the same session, reducing repeated server work. Recording stays immediate; very fast calls can appear directly as completed. ([#14](https://github.com/diegoag64/jev-devtools/pull/14))
- After the initial snapshot, stream changed traces instead of resending the full history. Keep compatibility with older clients and servers, and recover interrupted streams with a fresh snapshot. ([#15](https://github.com/diegoag64/jev-devtools/pull/15))
- Apply received events in order, but publish accumulated browser state to React once per animation frame to reduce repeated rendering during bursts. This can add about one frame of display latency. ([#15](https://github.com/diegoag64/jev-devtools/pull/15))
- Defer the inspector's first render until opening; suspend trace-driven React updates and SVG animation while closed. Reopening shows current history while preserving controls and the retained request's selection and camera. Capture, transport, and parsing continue while hidden; the previously opened panel stays in memory. ([#16](https://github.com/diegoag64/jev-devtools/pull/16))

Public component props and server setup APIs are unchanged. These optimizations are **not included in npm 0.1.3**. See the linked PRs for measured workloads, comparisons, and tradeoffs, and the [local benchmark guide](docs/performance.md) to reproduce them.

### Documentation and developer tooling

- Add repeatable server and isolated-browser benchmarks for large histories, large inputs, diagram rendering, and streaming updates, with before/after findings summarized in the PRs. ([#13](https://github.com/diegoag64/jev-devtools/pull/13), [#14](https://github.com/diegoag64/jev-devtools/pull/14), [#15](https://github.com/diegoag64/jev-devtools/pull/15), [#16](https://github.com/diegoag64/jev-devtools/pull/16))
- Add browser correctness checks for closing/reopening, preserved controls, clear, and eviction on React 18 and 19. ([#16](https://github.com/diegoag64/jev-devtools/pull/16))
- Refocus the README introduction on visualizing Jev flows. ([#12](https://github.com/diegoag64/jev-devtools/pull/12))
- Keep generated benchmark evidence and per-run reports out of Git, retain local reproduction scripts, and retire the hosted benchmark workflow. Store results in PR descriptions or discussions. ([#18](https://github.com/diegoag64/jev-devtools/pull/18))
- Make the changelog discoverable from both READMEs and the agent documentation index; add a release overview and a contribution policy for keeping it current. ([#18](https://github.com/diegoag64/jev-devtools/pull/18))

## 0.1.3 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.3) · Included PRs: [#9](https://github.com/diegoag64/jev-devtools/pull/9), [#10](https://github.com/diegoag64/jev-devtools/pull/10), [#11](https://github.com/diegoag64/jev-devtools/pull/11).

- Isolate the drawer in a custom Shadow DOM host so application styles cannot add padding or alter the inspector. Host-page CSS overrides no longer reach internal elements.
- Add a diagram canvas with pointer-centered wheel zoom, drag-to-pan, pinch gestures, keyboard controls, and fit-to-view.
- Keep README npm badges and links aligned with the package version, using exact-version URLs.
- Clarify the main README feature heading and keep prepack diagnostics out of machine-readable npm output.
- Public component props and server APIs are unchanged.

## 0.1.2 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.2) · Included PRs: [#7](https://github.com/diegoag64/jev-devtools/pull/7), [#8](https://github.com/diegoag64/jev-devtools/pull/8).

- Remove the MP4 download link from the npm README; retain the complete inline GIF.
- Bundle a `setup-jev-devtools` agent skill with React/Node/Vite and Next.js recipes, no-key sample verification, and troubleshooting.
- Add copyable setup prompts and a repository `llms.txt` documentation index; clarify installation versus contributor instructions.
- Verify that the published archive includes the complete skill and its references. No runtime or public API changes.

## 0.1.1 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.1) · Included PRs: [#5](https://github.com/diegoag64/jev-devtools/pull/5), [#6](https://github.com/diegoag64/jev-devtools/pull/6).

- Refresh the npm README with the published installation command and npm badge; remove obsolete migration guidance.
- Show the complete 28-second demo inline in the GitHub and npm READMEs as an optimized GIF.
- Reduce the optional MP4 to 1280 × 716 at 30 fps and link directly to the download instead of GitHub’s file viewer.
- Documentation and media only; no changes to the React component, server APIs, or runtime behavior.

## 0.1.0 — October 23, 2026 (experimental)

[Published package](https://www.npmjs.com/package/jev-devtools/v/0.1.0) · Included PRs: [#1](https://github.com/diegoag64/jev-devtools/pull/1), [#2](https://github.com/diegoag64/jev-devtools/pull/2), [#3](https://github.com/diegoag64/jev-devtools/pull/3), [#4](https://github.com/diegoag64/jev-devtools/pull/4).

First public npm release as **[`jev-devtools`](https://www.npmjs.com/package/jev-devtools/v/0.1.0)**. This is a development tool with APIs that may change before 1.0.

### Included

- A single `<JevDevtools />` React root component with a custom drawer, scoped CSS, searchable request history, and Flow, Questions, Context, Transport, and Raw views.
- Animated diagrams for Jev Choice, Score, Noul, and Box inputs and results.
- A Node adapter that captures calls made through its TypeSafe SDK client, including retries, errors, cancellation, timing, and returned values. Capture preserves the SDK's APIPromise behavior.
- Same-origin SSE, bounded in-memory history, redaction hooks, authorization and session scoping, and explicit opt-in for both capture and display.
- Next.js App Router integration for Route Handlers, Server Actions, and Server Components, including shared history across server module reloads.
- Independent packed-package examples and verification for React 18/19, Node 22.12+/24, and Next.js.

### Limits and validation

This release targets React and a Node server. Capture is limited to instrumented clients in one Node realm/process; there is no edge runtime support, distributed/serverless aggregation, persistence, or automatic interception of unrelated clients. Diagrams show captured data, not hidden model reasoning or inferred application policies.

Verification uses sample responses through the real SDK. Live inference and browser visual verification are separate from the automated React/Next.js checks. Project code remains MIT licensed; bundled third-party notices and TypeSafe branding attribution are preserved.

## Registry staging entry

npm also lists `0.0.0-stage`, created on October 23, 2026 during the initial publishing flow. It is a staging placeholder, not a separate feature release. The first public release was `0.1.0`; `latest` pointed to `0.1.3` when this history was checked. Use the exact-version package links above to inspect a specific release.
