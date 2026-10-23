# Architecture

The package has three public entry points: the SSR-safe React component, scoped CSS, and a Node server adapter. Browser-safe trace types are exported from the React entry. Server modules and the TypeSafe SDK must never enter the browser bundle.

`createJevDevtools()` owns a bounded in-memory recorder. Its `createClient()` instruments the SDK's `systemOne` calls while preserving APIPromise behavior. AsyncLocalStorage links retries to the logical call. The adapter exposes configuration, SSE snapshots, and scoped clearing; the React drawer handles subscriptions and displays diagrams. There is no network interception or hidden-model reasoning capture.

`apps/playground` uses only package exports. Its custom fetch fixtures pass through the real SDK. It owns ticket-routing thresholds, scenario inputs, shadcn controls, and application result previews. These are not inspector policies or package dependencies.

`getJevDevtools(key, createOptions)` shares an adapter in a versioned global registry within one Node realm. Its first configuration remains active across module reloads; disposal removes the key. It does not aggregate across processes.

`examples/nextjs-app` uses the packed library through App Router routes, Server Actions, and Server Components. `verify:nextjs` checks real framework routing, shared traces, reload retention, SSE, and disabled production endpoints.

`examples/react-vite` installs a packed tarball. The verification script copies it outside the workspace so it cannot accidentally resolve internal source or hoisted dependencies. CI checks React 18 and 19 and Node 22.12 and 24. The regular build intentionally creates a local-only notice; a separate check compiles the full development UI.

## Provenance

The animated diagrams use the visual style developed in [Diagram Motion Lab](https://github.com/diegoag64/diagram-motion-lab). This repository owns the reusable DevTools library and its sample playground. See [third-party notices](../THIRD_PARTY_NOTICES.txt) for design attribution and branding.

## Limits

One Node process/adapter instance, same-origin browser endpoint, memory-only traces, and explicit opt-in. Non-loopback access requires application authorization. Distributed workers, serverless aggregation, edge runtimes, persistent traces, and automatic discovery of arbitrary SDK clients are outside this prototype. Live inference and browser visual QA must be reported separately from sample and SSR checks.

## Isolated UI and diagram camera

The client drawer portals into an open ShadowRoot on a `jev-devtools-root` host. Its root resets inherited typography and layout, while shadow encapsulation keeps host selectors out of internal cards, headers, and controls. `copy-styles.mjs` emits the embedded stylesheet from the same CSS source as the public stylesheet export. Existing stylesheet imports remain compatible. The host and listeners are removed on unmount, including React Strict Mode cleanup.

The diagram camera uses pointer capture and animation-frame transform updates rather than a scrollable scaled container. Wheel zoom preserves the diagram coordinate beneath the pointer, two-finger pinch also follows its moving midpoint, and Fit considers both viewport dimensions. ResizeObserver refits a fitted view or keeps a manually positioned view centered when the drawer changes size. Camera geometry tests cover full-content fitting, anchored/clamped zoom, and moving pinch.
