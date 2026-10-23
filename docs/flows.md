# Define and inspect connected Jev calls

This API is unreleased; it is not included in npm 0.2.0. Use a locally packed build of this branch until a new version is published. Existing single-request integrations are unchanged.

`jev-devtools/flow` is a TypeScript/Node entry point. A definition builds an inspectable, bounded graph once; each `run()` executes an independent instance. This is an in-process helper for Jev calls, not a durable workflow engine or a business-action executor.

```ts
import { choice, noul } from "@typesafe-ai/sdk";
import { defineJevFlow, all } from "jev-devtools/flow";
import { createJevDevtools } from "jev-devtools/server";

type Ticket = { message: string };
const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === "development",
  origin: "http://localhost:3000",
});
const client = inspector.createClient({ apiKey: process.env.TYPESAFE_API_KEY });

const refundFlow = defineJevFlow<Ticket>("refund-review", (flow) => {
  const triage = flow.jev("triage", {
    state: flow.input,
    questions: { category: choice("Refund request?", { refund: null, other: null }) },
  });
  return flow.branch("refund-request", {
    when: triage.answer("category").choice.eq("refund"),
    then: (branch) => {
      const review = branch.jev("review", {
        state: { ticket: flow.input, category: triage.answer("category").choice },
        questions: { eligible: noul("Eligible?"), risky: noul("Risky?") },
      });
      return branch.branch("approval", {
        when: all(review.answer("eligible").noul.gte(0.9), review.answer("risky").noul.lt(0.2)),
        then: (path) => path.output("approve", { eligibility: review.answer("eligible").noul }),
        else: (path) => path.output("manual-review"),
      });
    },
    else: (branch) => branch.output("other"),
  });
});
const abortController = new AbortController();
const result = await refundFlow.run({ message: "Please refund my duplicate charge." }, {
  client,
  devtools: inspector,
  signal: abortController.signal, // optional
});
// { runId, outcome: "approve", value: { eligibility: 0.94 } }
// Your application decides what to do with the outcome. No refund is executed.
```

Mount the existing `<JevDevtools enabled={...} />` and serve the inspector endpoint as in the [integration guide](integration.md). In Next.js, define and run the flow in Node server code; keep the drawer in its existing client component. Do not import `/flow` into the browser.

## Operations and references

- `jev(id, request)` queues one ordinary SDK `systemOne` call. Preserve SDK questions, model selection, assets, and multiple questions. `state` may contain nested expressions. SDK assets remain SDK assets; the flow does not invent another question format.
- `flow.input` references the run input. Use `flow.input.get("message")` for typed fields. Answer names and fields come from the supplied questions: Choice labels/probabilities, Score numbers/legend, Noul probabilities, and Box coordinates/confidence. Use `.get(key)` to select nested fields.
- Scalar references support `.eq(value)`. Numeric references support `.lt(value)` and `.gte(value)`. `all`, `any`, and `not` compose Boolean expressions. There is no `eval`, arbitrary predicate callback, or CEL interpreter. All operands are evaluated; a missing value is an error even if another operand would short-circuit. Equality requires matching scalar types; ordering requires finite numbers.
- `branch(id, { when, then, else })` is terminal in its block. Both synchronous callbacks build possible paths; exactly one executes. Each path must return its terminal `output()` or nested `branch()`. Branches cannot fall through to subsequent work in v1.
- `output(name, value?)` returns a named outcome and optional resolved value. Output names are also node IDs, so they must be unique across the definition. This is data, not an action.
- IDs are unique across the whole definition, including untaken paths and parallel lanes: 1–80 letters, digits, `_`, or `-`, starting with a letter or digit. Definitions are limited to 256 nodes and 16 nested blocks. No loops.

Definitions are synchronous and make no SDK calls. Plain request/value templates are copied at definition time. Treat SDK asset instances as immutable. References from another definition, a sibling lane, or a branch-local scope cannot be used outside their available scope. Structural validation happens while defining, before any run can dispatch; input-dependent missing values and invalid comparisons fail when reached during execution.

Question/answer reference types are inferred. `run()` returns `{runId, outcome: string, value?: unknown}` in v1: supplying `defineJevFlow<Ticket>` keeps the input ergonomic, but does not infer a discriminated union of all terminal values. Narrow the returned value in application code.

## Parallel calls and the join

Steps in a block are sequential. Explicit named lanes overlap; their result references become available only after all lanes complete:

```ts
const reviewFlow = defineJevFlow<Ticket>("parallel-review", (flow) => {
  const checks = flow.parallel("checks", {
    eligibility: (lane) => lane.jev("eligibility", {
      state: flow.input,
      questions: { eligible: noul("Eligible?") },
    }).answer("eligible").noul,
    risk: (lane) => lane.jev("risk", {
      state: flow.input,
      questions: { risky: noul("Risky?") },
    }).answer("risky").noul,
  });
  const decision = flow.jev("combined", {
    state: { ticket: flow.input, eligibility: checks.eligibility, risk: checks.risk },
    questions: { ready: noul("Ready?") },
  });
  return flow.output("reviewed", { readiness: decision.answer("ready").noul });
});
```

Each lane returns an expression. The join exposes a named reference with that expression's type. Lane-local references cannot escape directly or be consumed by a sibling; use the returned `checks` references. The diagram's parallel node represents the join, with incoming edges from lane tails.

## Errors, cancellation, and recording

The flow preserves SDK retries within each Jev step and adds no flow retries. Failed work blocks dependents. A failed parallel lane aborts sibling calls, waits for them to settle, then rejects with the first failure. An external abort propagates through SDK request signals and rejects; work already completed remains completed. Untaken branches remain untaken. Remaining unreachable work is blocked on failure or cancelled on external abort. Successful steps record duration and decision nodes record the evaluated Boolean independently of captured/redacted answers.

`run()` works with an ordinary SDK client and no inspector, or a disabled inspector. To link nodes to request details, pass a client created by the **same** inspector. A plain client still executes and records flow-level states when an inspector is supplied, but there is no request capture to link. For custom session scoping, wrap `run()` in the inspector's existing `inspector.run(request, callback)` helper.

Definitions and runs are separate schema-version-1 records. Each definition instance has a unique ID; re-defining it creates a new identity (including hot reload). Each run and each potential step have independent IDs. The flow stream sends retained order, changed runs, and newly encountered definitions; reconnect receives a full retained snapshot. It uses the same origin, authorization, and server-derived session gates as requests.

The existing `limit` bounds flow-run history independently from request history (default 50, maximum 200). Definitions are pruned when no retained run references them. Clear affects both histories and cannot resurrect an in-flight cleared run. Requests can be evicted before their flow; the overview then explains that details are unavailable. Capture, transport and parsing continue while the drawer is closed; its React work remains suspended.

Definition captures contain structural IDs/dependencies and parallel lane names and condition expressions with literal values hidden. State, questions, probabilities, and images stay in the ordinary bounded/redacted request captures. Outcome values use the existing redaction/size limits. Decision results are actual execution facts; they are not recalculated from snapshots. Step IDs, flow names, output names, and branch decisions are structural metadata: do not put secrets in their names. Errors show error classes rather than possibly sensitive application messages.

## Drawer and samples

Choose **Flows** after capturing a run. Captured Jev calls render their existing request diagrams together on **one canvas**: state, instructions, the selected question's answer, probabilities and output branches. Each request keeps its question picker, Show More and complete probability table. Long input previews remain bounded; **Inspect request** opens Questions/Context/Transport/Raw for the full captured details.

Arrows connect requests, conditions and outcomes in execution order; redundant transitive edges are omitted so they do not cross intervening steps. Parallel paths converge at **Wait for both checks** (or **Wait for all N paths**), showing their lane names. Selecting it explains that downstream calls wait until every lane succeeds, and that the marker does not make another Jev call. Untaken, waiting or evicted requests show an explicit placeholder rather than invented content.

The view starts focused on the first Jev request. Use the **Step** picker or **Focus step** to frame a request, and **Fit flow** for the whole graph. All diagrams share pan/zoom; there are no nested cameras. Opening Flows pins the displayed run. Camera, run/node selection, question selection and expanded categories survive incoming updates and closing/reopening. Switching runs starts a new view. Resizing a request updates the layout without resetting the camera.

Run `npm run dev` and choose the Flow samples: Approve, Manual review, Other, Parallel checks + join, Failed review, and Slow call (then press Cancel). These are fixed samples and never use live inference.

Local verification/scaling harness (no hosted benchmarks):

```sh
npm run build:package
node --import tsx benchmarks/flow-server.mjs  # http://127.0.0.1:4230
# In another terminal:
node scripts/verify-flows.mjs
node benchmarks/flows-isolated.mjs
```

The new-flow scaling suite measures 11/51/151-node linear graphs and 200 retained 11-node runs, opening and keyboard pan CPU in isolated Chromium. It is not a before/after optimization claim. For existing request regressions, use `BENCH_SUITE=rerenders npm run bench:compare -- main` and keep those findings separate. Generated data and screenshots stay in ignored `benchmarks/results/`; report comparisons and limitations in the PR.

V1 has no standalone viewer, generic tasks, arbitrary callbacks at execution time, loops, automatic business actions, durable execution, cross-process coordination, or distributed persistence. A run belongs to one process and its supplied SDK client. Large flow canvases are bounded, not virtualized. They mount the retained request diagrams; CSS content visibility skips offscreen layout/paint where supported while preserving local controls. This uses more DOM and memory than status cards. Only the selected full tabbed inspector mounts; all captured answers remain accessible through each request’s question picker and the Questions tab.
