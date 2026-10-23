# Jev DevTools

[![npm version](https://img.shields.io/npm/v/jev-devtools/latest?color=E551BA&labelColor=0D0A0F&logo=npm)](https://www.npmjs.com/package/jev-devtools)

A React drawer and Node adapter for inspecting TypeSafe Jev requests with animated diagrams. Includes request history, context, questions, typed answers, transport attempts, and raw snapshots.

**Experimental 0.1.x.** React 18/19 and Node 22.12+ are supported. APIs may change before 1.0. Verification uses sample responses through the real TypeSafe SDK, not live inference.

## Demo

![Full 28-second Jev DevTools demo showing sample results, the request drawer, and animated diagrams.](https://raw.githubusercontent.com/diegoag64/jev-devtools/main/docs/assets/jev-devtools-preview.gif)

The full sample recording loops above. [Download the MP4 (530 KB)](https://github.com/diegoag64/jev-devtools/raw/refs/heads/main/docs/assets/jev-devtools-demo.mp4).

## Install

Install from npm:

```sh
npm install jev-devtools
```

To try unpublished local changes instead:

```sh
# From the jev-devtools repository root:
npm ci
npm run pack:devtools
# From the consuming app:
npm install /absolute/path/to/jev-devtools-0.1.1.tgz
```

Mount once:

```tsx
import { JevDevtools } from 'jev-devtools';
import 'jev-devtools/styles.css';

<JevDevtools enabled={import.meta.env.DEV} defaultOpen={false} />
```

Create one shared Node adapter and instrumented client:

```ts
import { createJevDevtools } from 'jev-devtools/server';

const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === 'development',
  origin: 'http://localhost:3000',
});
const jev = inspector.createClient({ apiKey: process.env.TYPESAFE_API_KEY });
app.use(inspector.middleware); // Mount at root, before fallback handlers.
// Call jev.systemOne(...) in your application's handlers.
// Call inspector.dispose() on shutdown.
```

Only calls through that client are captured. The React component subscribes via same-origin SSE. Both sides default to disabled. API keys remain server-side. Browser code is SSR-safe and styles are scoped; no Tailwind or shadcn installation is required.

History is bounded to 50 calls in memory by default. API routes and inspector endpoints must share an adapter instance; distributed processes and edge runtimes are not supported. Non-loopback use requires explicit authorization. Captures include bounded/redacted context and answers, not hidden model reasoning.

For Next.js App Router, use `getJevDevtools(appKey, optionsFactory)` from `/server` to share an adapter across server reloads, expose `handleNodeRoute` through an optional catch-all Route Handler, and mount the root component in a client boundary. See the [Next.js guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/nextjs.md) and runnable example. No Next dependency is required by this package.

[Full integration guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md) · [Repository and playground](https://github.com/diegoag64/jev-devtools)

MIT for project code. See bundled LICENSE and THIRD_PARTY_NOTICES.txt for original design attribution and TypeSafe branding.
