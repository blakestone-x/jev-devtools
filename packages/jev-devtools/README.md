# Jev DevTools

[![npm version 0.1.3](https://img.shields.io/badge/npm-v0.1.3-E551BA?labelColor=0D0A0F&logo=npm)](https://www.npmjs.com/package/jev-devtools/v/0.1.3)

A React drawer and Node adapter for inspecting TypeSafe Jev requests with animated diagrams. Includes request history, context, questions, typed answers, transport attempts, and raw snapshots.

**Experimental 0.1.x.** React 18/19 and Node 22.12+ are supported. APIs may change before 1.0. Verification uses sample responses through the real TypeSafe SDK, not live inference.

[Changelog and release history](https://github.com/diegoag64/jev-devtools/blob/main/CHANGELOG.md) — published versions and unreleased work.

## Demo

![Full 28-second Jev DevTools demo showing sample results, the request drawer, and animated diagrams.](https://raw.githubusercontent.com/diegoag64/jev-devtools/main/docs/assets/jev-devtools-preview.gif)

The full sample recording loops above.

## Set up with your coding agent

In your application's coding-agent chat, paste:

```text
Set up jev-devtools in this React app. Read and follow:
https://raw.githubusercontent.com/diegoag64/jev-devtools/main/packages/jev-devtools/skills/setup-jev-devtools/SKILL.md
Choose the recipe for this app's framework, wire the server capture and root
drawer, and verify with a labeled sample request. Preserve existing app behavior.
```

After installing, the version-matched instructions are available locally at `node_modules/jev-devtools/skills/setup-jev-devtools/SKILL.md` with all references included. In a workspace, read the package installed for the consuming app. Agents can follow these files without web access. Tools with skill support can install/copy the entire `setup-jev-devtools` folder into their supported skills location; npm does not register it automatically.

The [setup skill](https://github.com/diegoag64/jev-devtools/blob/main/packages/jev-devtools/skills/setup-jev-devtools/SKILL.md) covers React/Node/Vite and Next.js App Router, with no-key sample verification and troubleshooting. A Node backend is required for live calls; browser-only apps can use a local Vite sample server. [Agent documentation index](https://raw.githubusercontent.com/diegoag64/jev-devtools/main/llms.txt).

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
npm install /absolute/path/to/jev-devtools-0.1.3.tgz
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

Only calls through that client are captured. The React component subscribes via same-origin SSE, receiving an initial snapshot followed by changed traces. Older client/server combinations remain compatible through full snapshots. Both sides default to disabled. API keys remain server-side. Browser code is SSR-safe. The drawer uses a Shadow DOM boundary and its own stylesheet so host page selectors cannot alter its internal layout. Existing stylesheet imports remain supported; no Tailwind or shadcn installation is required. Drag the Flow canvas to pan, scroll/pinch to zoom, or use Fit.

History is bounded to 50 calls in memory by default. API routes and inspector endpoints must share an adapter instance; distributed processes and edge runtimes are not supported. Non-loopback use requires explicit authorization. Captures include bounded/redacted context and answers, not hidden model reasoning.

For Next.js App Router, use `getJevDevtools(appKey, optionsFactory)` from `/server` to share an adapter across server reloads, expose `handleNodeRoute` through an optional catch-all Route Handler, and mount the root component in a client boundary. See the [Next.js guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/nextjs.md) and runnable example. No Next dependency is required by this package.

[Full integration guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md) · [Repository and playground](https://github.com/diegoag64/jev-devtools)

MIT for project code. See bundled LICENSE and THIRD_PARTY_NOTICES.txt for original design attribution and TypeSafe branding.
