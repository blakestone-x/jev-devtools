# Changelog

## 0.1.3 — October 23, 2026 (experimental)

- Isolate the drawer in a custom Shadow DOM host so application styles cannot add padding or alter the inspector. Host-page CSS overrides no longer reach internal elements.
- Add a diagram canvas with pointer-centered wheel zoom, drag-to-pan, pinch gestures, keyboard controls, and fit-to-view.
- Keep README npm badges and links aligned with the package version, using exact-version URLs.
- Clarify the main README feature heading and keep prepack diagnostics out of machine-readable npm output.
- Public component props and server APIs are unchanged.

## 0.1.2 — October 23, 2026 (experimental)

- Remove the MP4 download link from the npm README; retain the complete inline GIF.
- Bundle a `setup-jev-devtools` agent skill with React/Node/Vite and Next.js recipes, no-key sample verification, and troubleshooting.
- Add copyable setup prompts and a repository `llms.txt` documentation index; clarify installation versus contributor instructions.
- Verify that the published archive includes the complete skill and its references. No runtime or public API changes.

## 0.1.1 — October 23, 2026 (experimental)

- Refresh the npm README with the published installation command and npm badge; remove obsolete migration guidance.
- Show the complete 28-second demo inline in the GitHub and npm READMEs as an optimized GIF.
- Reduce the optional MP4 to 1280 × 716 at 30 fps and link directly to the download instead of GitHub’s file viewer.
- Documentation and media only; no changes to the React component, server APIs, or runtime behavior.

## 0.1.0 — October 23, 2026 (experimental)

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
