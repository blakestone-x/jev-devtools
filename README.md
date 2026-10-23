# Jev DevTools

A drop-in React drawer for inspecting TypeSafe Jev requests. See context, questions, Choice probabilities, Score values, Noul probabilities, Box regions, and transport attempts through animated diagrams.

Extracted from [Diagram Motion Lab](https://github.com/diegoag64/diagram-motion-lab). Uses a custom Jev drawer; TanStack DevTools inspired the workflow but is not a dependency.

## Run the playground

Requires Node **22.12+** (24 recommended).

```sh
git clone https://github.com/diegoag64/jev-devtools.git
cd jev-devtools
npm ci
npm run dev
```

Open http://127.0.0.1:4182/. Sample mode needs no API key. Run a scenario to see its application result, then open **Jev DevTools** in the bottom-right corner to inspect the call. Samples cover Choice, Score, Noul, Box, retries, errors, and cancellation. Fixture responses do not change when you edit context.

For optional live mode, copy `apps/playground/.env.example` to `apps/playground/.env.local`, set `TYPESAFE_API_KEY`, and restart. Keys stay on the server. Live inference has not been verified during extraction.

## Install in another React app

This prototype is **not published to npm**. The existing name `@diagram-motion-lab/jev-devtools` is retained for compatibility; a publishing scope will be chosen before release.

```sh
# In this repository:
npm ci
npm run pack:devtools

# In your React application:
npm install /absolute/path/to/jev-devtools/diagram-motion-lab-jev-devtools-0.1.0.tgz
```

Mount once near the root:

```tsx
import { JevDevtools } from '@diagram-motion-lab/jev-devtools';
import '@diagram-motion-lab/jev-devtools/styles.css';

export function Root() {
  return <>
    <App />
    <JevDevtools enabled={import.meta.env.DEV} defaultOpen={false} />
  </>;
}
```

On the Node server:

```ts
import { createJevDevtools } from '@diagram-motion-lab/jev-devtools/server';

const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === 'development',
  origin: 'http://localhost:3000',
});
const jev = inspector.createClient({ apiKey: process.env.TYPESAFE_API_KEY });
app.use(inspector.middleware); // At root, before fallback routes.
// Your handlers continue to call jev.systemOne(...).
// Call inspector.dispose() when shutting down the server.
```

Only calls through this client are recorded. Both routes and inspector must share the same adapter instance. History is bounded and in memory, and the browser connects over same-origin SSE. React 18/19 are peer dependencies. Tailwind, shadcn, and the playground are not bundled with the library.

See the [complete integration guide](docs/integration.md) for Next.js, proxies, custom endpoints, authorization, redaction, session scoping, and runtime limits. The adapter currently targets Node, not edge runtimes or distributed/serverless aggregation. Capture and display are both disabled by default.

## Next.js and server frameworks

Next.js App Router has a [complete setup guide](docs/nextjs.md) and [sample app](examples/nextjs-app) covering Route Handlers, Server Actions, and Server Components. Use `getJevDevtools(appKey, optionsFactory)` on the server to retain a shared recorder across module reloads, and mount the same `<JevDevtools />` component in your root layout. No Next.js dependency is added to the package.

`handle(request)` supports Node frameworks with Web Request/Response; `middleware` supports Express/Connect. Histories remain local to one Node realm/process. Edge runtimes and distributed/serverless aggregation are not supported.

## Repository layout

| Path | Purpose |
| --- | --- |
| `packages/jev-devtools` | React drawer, diagrams, recorder, Node adapter, scoped CSS |
| `apps/playground` | Sample/live scenarios, minimal shadcn form, application previews |
| `examples/react-vite` | Independent consumer using only public package exports |
| `examples/nextjs-app` | Next.js App Router consumer using the packed package |
| `docs` | Integration, architecture, provenance, and release process |

The playground consumes built public exports, so restart `npm run dev` after library edits, or run `npm run build:package` separately. The static diagram lab and its `/docs/` replica remain in the original repo.

## Verify

```sh
npm run check
npm test
npm run build
npm run check:playground
npm run verify:package
npm run verify:nextjs
```

`verify:package` packs the library and installs it in a temporary independent React app, checks SSR/disabled behavior, and builds the consumer with a browser/server boundary check. Set `JEV_VERIFY_REACT=18.3.1` to verify React 18 instead of the default React 19. Registry access is allowed by default; `JEV_VERIFY_OFFLINE=1` is available when all dependencies are cached.

`check:playground` compiles the full interactive development UI into a temporary directory. The regular production build intentionally contains only a local-tool notice; it is not a hosted demo.

After `npm run pack:devtools`, you can also run `npm install && npm run dev` inside `examples/react-vite` (port 4183, sample-only).

Changes use feature branches and PRs by default. See [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/architecture.md), and [release instructions](docs/releases.md). No workflow publishes packages or deploys the playground.

MIT for project code; see [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.txt) for design provenance and branding.
