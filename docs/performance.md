# Performance baseline — October 23, 2026

The biggest measured scaling cost is repeatedly cloning and sending the entire retained history. Large diagrams have a separate layout/legibility problem. Pan and zoom at rest were responsive in the manual stress check. These measurements identify follow-up work; this PR changes no library runtime behavior.

## Environment and method

- Apple M2, macOS arm64, Node 24.19.0; Chrome 154, 1710 × 961 viewport, device pixel ratio 2. Drawer height 420 px.
- Runtime: `jev-devtools` 0.1.3, checked-out commit `4e1613254e5ca87699923d211e55c4ccf30c2ca1` (later changes on this branch are benchmark tooling/docs only).
- Real SDK and recorder, deterministic local sample transport. No live inference, API keys, or customer data. Sample probability values do not establish model quality.
- Server timings: three rounds of 20 sequential calls per case, after pre-filling history. Includes the SDK call and an event-loop turn for asynchronous capture. Fast SSE readers consume the actual adapter stream in-process; this isolates clone/serialization/encoding costs, not network latency. Slow-reader cases deliberately stop consuming.
- Browser: production React, public `<JevDevtools>` entry point and real EventSource consumption. Fixtures are generated through the real recorder. The browser server replays pre-serialized snapshots, separating browser work from server capture costs.
- Three mount repeats per scenario. Readiness checks the rendered request/output counts, then waits two animation frames. These are end-to-end mount-to-ready measurements, **not React commit times**. The first mount also includes cold lazy-module loading.
- Streaming: three approximately five-second windows per case, targeting 5 snapshots/sec. Replays retain the same data/IDs, measuring the current client response to full-history snapshots. The server skips writes under socket backpressure; the actual send rate is reported. This is not a count of browser commits; buffered work can finish after a sampling window.
- Frame gaps come from `requestAnimationFrame`; they are a main-thread scheduling proxy, not GPU frame-present measurements. Long tasks are browser-reported tasks over 50 ms. The normal UI and browser extensions were present; this is a single-machine baseline, not a statistically controlled cross-device study.

Raw measurements: [server](benchmarks/2026-10-23-server.json), [browser](benchmarks/2026-10-23-browser.json). The browser file retains the three formal repetitions per case and a separate native interaction session. Extra exploratory runs are excluded. Approximate server heap readings include **both recorder storage and a cloned snapshot**; they are diagnostic only. No browser heap/leak claim is made.

## Actual supported scale

History defaults to 50 and is capped at 200 across the recorder, not per session. A probe requesting a 205-item history retained 200 after 205 calls. Capture collections are capped at 150 entries, individual strings at 16,000 characters, and input/result captures each have a 96,000-unit traversal budget. The large-state fixture uses eight distinct 10,000-character fields; all measured fixtures produced no capture warnings.

The Flow tab displays **one selected question**, not all parallel questions simultaneously. Thus 150 questions mostly stress the selector until the Questions tab is opened. Choice results do render every category as a probability row and output card. Only the selected Choice branch is animated: even 150 categories produce three moving dots (two inputs and one returned choice).

## Server results

Median / p95 milliseconds per sequential call, including capture settling. “No viewer” means capture enabled with no SSE subscription. Disabled is the adapter's opt-out path. These figures exclude inference and external HTTP time.

| Retained workload                              |    Disabled |   No viewer | One fast viewer | Three fast viewers |
| ---------------------------------------------- | ----------: | ----------: | --------------: | -----------------: |
| 50 small requests                              | 0.05 / 0.11 | 0.08 / 0.13 |     1.37 / 2.02 |        3.55 / 4.21 |
| 200 small requests                             | 0.04 / 0.05 | 0.05 / 0.07 |     4.80 / 5.86 |      14.66 / 16.49 |
| 200 requests, 80 KB state each                 | 0.23 / 0.43 | 0.23 / 0.46 |   73.68 / 94.63 |    224.31 / 239.17 |
| 200 requests, 80 KB state and 150 choices each | 0.33 / 0.65 | 0.40 / 0.59 | 110.71 / 127.37 |    331.40 / 349.65 |

Sub-millisecond differences are noisy; a slightly lower recorded result does not imply recording accelerates the SDK. The plain-SDK control and disabled adapter were similar. A backpressured reader stayed near no-viewer costs after its initial queued snapshot, confirming that the existing stream backpressure prevents repeated serialization when its queue is full. A healthy, fast reader does not receive that protection.

| Workload                 | One snapshot | Snapshots per successful call/viewer | Bytes per call/viewer |
| ------------------------ | -----------: | -----------------------------------: | --------------------: |
| 50 small requests        |        43 KB |                                    4 |               0.17 MB |
| 200 small requests       |       172 KB |                                    4 |               0.69 MB |
| 200 large-state requests |     16.17 MB |                                    4 |              64.67 MB |
| Combined stress          |     18.05 MB |                                    4 |              72.19 MB |

Units are decimal, uncompressed bytes. The four updates correspond to request creation, attempt start, response headers, and final capture. Three viewers multiply the emitted work and bytes; the combined case emitted about **216.6 MB per new call** across three consumers.

For the 16.17 MB snapshot, median isolated clone/stringify/parse times were 4.82 / 9.50 / 9.59 ms in Node. For 18.05 MB, they were 7.35 / 12.98 / 15.97 ms. Parsing is not included in server SSE work; encoding/allocation and repeated updates account for additional costs.

## Browser results

| Workload                           | Median mount-to-ready | Inspector DOM elements | Canvas height |
| ---------------------------------- | --------------------: | ---------------------: | ------------: |
| 1 small request                    |               51 ms\* |                    135 |        520 px |
| 50 small requests                  |                 67 ms |                    429 |        520 px |
| 200 small requests                 |                109 ms |                  1,329 |        520 px |
| 1 request, 150 choices             |                144 ms |                  1,899 |     20,460 px |
| 1 request, 150 questions           |                 50 ms |                    284 |        520 px |
| 200 requests with 80 KB state each |                266 ms |                  1,329 |        520 px |
| Combined stress                    |                364 ms |                  3,093 |     20,460 px |

\* Small-request samples were 467 ms cold, then 48 and 51 ms warm. Other scenarios reused loaded code; these numbers are not cold page-load comparisons. Idle frame-gap p95 varied between roughly 17 and 33 ms across cases; large idle diagrams were not uniquely expensive.

Five updates/sec, three windows per case:

| Workload                       | Frame-gap p95 across runs | Total long-task time per window | Sent snapshots/sec |
| ------------------------------ | ------------------------: | ------------------------------: | -------------------: |
| 50 small requests              |              18.1–18.3 ms |                         0–65 ms |        4.92–4.93/sec |
| 200 small requests             |              18.0–18.2 ms |                        0–111 ms |             4.93/sec |
| 200 large-state requests       |              18.3–33.3 ms |                      199–336 ms |        4.90–4.91/sec |
| Combined stress, drawer open   |             66.7–215.1 ms |                  1,737–4,057 ms |        2.56–4.91/sec |
| Combined stress, drawer closed |                     50 ms |                  1,317–1,363 ms |        4.91–4.92/sec |

The combined open runs degraded substantially with repeated load, so the full range is reported. This baseline does not establish whether the variation is GC, browser scheduling, or resource contention. The backpressure-limited runs also received fewer snapshots, so open/closed rows are not equal-throughput CPU comparisons. Even hidden, the drawer processed ~451 MB of snapshot payload per five-second window and incurred substantial long tasks.

Native interaction spot checks (not percentile studies):

- 200-request filtering returned 11 matches for `Sample 19`; restoring the list and selecting request 199 produced no long task in the measured interaction window.
- Panning, wheel zoom, and Fit on the combined diagram produced no long task; measured handler-to-two-frame delays were about 14–35 ms. This was **without concurrent streaming**.
- Opening the Questions tab for 150 questions rendered 150 articles and produced a 177 ms long task; click-to-two-frame delay was about 228 ms. Returning to Flow was about 52 ms. Event Timing entries were unavailable through the Shadow DOM in the final spot checks, so these are not INP measurements.
- The 150-category scene is 20,460 px tall. The camera clamps fit at 10%, leaving it 2,046 px tall even though the default drawer's diagram viewport is much smaller. Large diagrams become unreadable/clipped before animation count becomes the issue.

## Improvement priorities

1. **Coalesce notifications and remove snapshot work from the request's synchronous update path.** `JevRecorder.notify()` calls the adapter's `flush()`, which clones, serializes, and encodes the entire session for every ready subscriber. Schedule bounded updates and share serialized data for subscribers in the same authorized session. Four updates per fast successful call are an immediate batching opportunity. Preserve error/cancellation/final states, session isolation, abort cleanup, and backpressure. The speedup has not yet been measured.
2. **Send changed traces after an initial snapshot, or fetch large detail payloads on demand.** History rows need summary data; they do not need all retained states in every event. The large-state dataset is dominated by repeated 80 KB payloads. Delta transport should include versioning, retention/removal and clear events, plus a resync path on reconnect. Keep authorization/session rules intact.
3. **Avoid hidden inspector render work.** Closing currently hides the drawer but retains its child tree and SSE subscription. Unmount or defer the expensive panel while closed; optionally retain a compact store and refresh once on reopen. Simply hiding the panel will not eliminate server serialization or client JSON parsing; this needs coordination with transport.
4. **Reduce rendering for large collections.** Paginate/virtualize Questions and, if needed, history rows; retain selection and keyboard access. Memoize unchanged summaries/detail views once the transport preserves trace identities. Search over 200 rows was not the first bottleneck in this baseline; the 150-question tab has stronger evidence for immediate improvement.
5. **Make wide Choice diagrams legible.** Offer top categories plus an expandable remainder, compact/multi-column layouts, or a focused selected-branch view. Preserve access to every probability. Correct fit behavior for scenes exceeding the minimum zoom. Offscreen culling may help, but reducing the scene's height is also a usability requirement.

Suggested next experiment: implement only notification coalescing first, rerun the same server workloads, and compare emitted snapshots/bytes and call latency. Then repeat browser streaming to distinguish server wins from remaining client parsing/rendering costs. Treat idle animations as a lower priority until a frame-present/GPU profile shows otherwise.

## Reproduce

```sh
npm ci
npm run bench:server
npm run bench:browser
```

Node 22.12+ is required; use Node 24 for this baseline. `bench:server` writes `benchmarks/results/server.json`. `bench:browser` builds production React, binds only `127.0.0.1:4190`, and uses captured synthetic snapshots. It does not touch the running playground/Next.js example. Override the port with `BENCH_PORT` if needed.

Open http://127.0.0.1:4190/ in a single foreground Chrome tab and wait for “Ready.” Run the mount suite, then the streaming suite **sequentially**. Keep the server benchmark, builds, and other CPU-heavy work stopped during browser measurement. The streaming suite takes about 80 seconds and transfers substantial loopback data in the stress cases. Each page load starts a new report; saves write a timestamped JSON file and `browser.json` under ignored `benchmarks/results/`.

For interaction measurements, select a scenario and Load, wait for “Loaded,” click Reset interaction metrics, use the actual inspector, and Save measurements. The streaming buttons replay unchanged captured snapshots, not new inference calls. Stop/restart the browser server and reload the page after source changes; this is a production build, not HMR.

These benchmarks are opt-in diagnostics, not hardware-sensitive CI pass/fail thresholds. Current gaps: low-end/mobile hardware, sustained minute-scale sessions, retained browser-heap/leak profiling, concurrent pan/zoom under streaming, image-heavy Box payloads, and live inference/network conditions. Browser events and in-process SSE do not replace a CPU/GPU profiler.
