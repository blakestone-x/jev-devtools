# Architecture and migration

The package has three public entry points: the SSR-safe React component, scoped CSS, and a Node server adapter. Browser-safe trace types are exported from the React entry. Server modules and the TypeSafe SDK must never enter the browser bundle.

`createJevDevtools()` owns a bounded in-memory recorder. Its `createClient()` instruments the SDK's `systemOne` calls while preserving APIPromise behavior. AsyncLocalStorage links retries to the logical call. The adapter exposes configuration, SSE snapshots, and scoped clearing; the React drawer handles subscriptions and displays diagrams. There is no network interception or hidden-model reasoning capture.

`apps/playground` uses only package exports. Its custom fetch fixtures pass through the real SDK. It owns ticket-routing thresholds, scenario inputs, shadcn controls, and application result previews. These are not inspector policies or package dependencies.

`getJevDevtools(key, createOptions)` shares an adapter in a versioned global registry within one Node realm. Its first configuration remains active across module reloads; disposal removes the key. It does not aggregate across processes.

`examples/nextjs-app` uses the packed library through App Router routes, Server Actions, and Server Components. `verify:nextjs` checks real framework routing, shared traces, reload retention, SSE, and disabled production endpoints.

`examples/react-vite` installs a packed tarball. The verification script copies it outside the workspace so it cannot accidentally resolve internal source or hoisted dependencies. CI checks React 18 and 19 and Node 22.12 and 24. The regular build intentionally creates a local-only notice; a separate check compiles the full development UI.

## Provenance

Imported from `diegoag64/diagram-motion-lab`, main commit `100189b73c9a5cf043946e4efa1956c7eda0b4d6` after PR #3. `git subtree split --prefix=devtools` produced `c6612cb96e4b9e44bc513c5e0c6dc7212cfa3d7c`. The split history is merged into the extraction branch, preserving the DevTools commits without unrelated lab files or ignored local data.

The initial `main` commit is empty; all source arrives through the extraction PR. After that PR is merged, the separate Diagram Motion Lab cleanup PR can remove the old copy. Until then the old repo's main retains a working copy.

The original lab, `/docs/`, Mermaid replica, SVG editor, and static-site deployment remain in Diagram Motion Lab. This repo owns the DevTools library and its sample playground. The React diagrams retain the existing styling and animation behavior; extraction does not redesign them.

## Limits

One Node process/adapter instance, same-origin browser endpoint, memory-only traces, and explicit opt-in. Non-loopback access requires application authorization. Distributed workers, serverless aggregation, edge runtimes, persistent traces, and automatic discovery of arbitrary SDK clients are outside this prototype. Live inference and browser visual QA must be reported separately from sample and SSR checks.
