# Changelog

## 0.1.0 — experimental, publication pending

First planned public npm release as **`jev-devtools`**. This is a development tool with APIs that may change before 1.0; it has not been published by this preparation PR.

### Included

- A single `<JevDevtools />` React root component with a custom drawer, scoped CSS, searchable request history, and Flow, Questions, Context, Transport, and Raw views.
- Animated diagrams for Jev Choice, Score, Noul, and Box inputs and results.
- A Node adapter that captures calls made through its TypeSafe SDK client, including retries, errors, cancellation, timing, and returned values. Capture preserves the SDK's APIPromise behavior.
- Same-origin SSE, bounded in-memory history, redaction hooks, authorization and session scoping, and explicit opt-in for both capture and display.
- Next.js App Router integration for Route Handlers, Server Actions, and Server Components, including shared history across server module reloads.
- Independent packed-package examples and verification for React 18/19, Node 22.12+/24, and Next.js.

### Migration from the extracted prototype

Change the dependency and imports from `@diagram-motion-lab/jev-devtools` to `jev-devtools`. The public subpaths are `jev-devtools/server` and `jev-devtools/styles.css`. The archive is now `jev-devtools-0.1.0.tgz`. The React component and server APIs are unchanged. Restart your dev server so the renamed adapter registry initializes cleanly.

### Limits and validation

This release targets React and a Node server. Capture is limited to instrumented clients in one Node realm/process; there is no edge runtime support, distributed/serverless aggregation, persistence, or automatic interception of unrelated clients. Diagrams show captured data, not hidden model reasoning or inferred application policies.

Verification uses sample responses through the real SDK. Live inference and browser visual verification are separate from the automated React/Next.js checks. Project code remains MIT licensed; bundled third-party notices and TypeSafe branding attribution are preserved.
