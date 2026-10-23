# Jev DevTools

A React drawer and Node adapter for inspecting TypeSafe Jev requests with animated diagrams. Includes request history, context, questions, typed answers, transport attempts, and raw snapshots.

This is an installable prototype, not a published npm release. React 18/19 and Node 22.12+ are supported. The package name is retained from Diagram Motion Lab pending a publishing decision.

```sh
# From the jev-devtools repository root:
npm ci
npm run pack:devtools
# From the consuming app:
npm install /absolute/path/to/diagram-motion-lab-jev-devtools-0.1.0.tgz
```

Mount once:

```tsx
import { JevDevtools } from '@diagram-motion-lab/jev-devtools';
import '@diagram-motion-lab/jev-devtools/styles.css';

<JevDevtools enabled={import.meta.env.DEV} defaultOpen={false} />
```

Create one shared Node adapter and instrumented client:

```ts
import { createJevDevtools } from '@diagram-motion-lab/jev-devtools/server';

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
