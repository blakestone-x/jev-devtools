import { test } from "node:test";
import assert from "node:assert/strict";
import type { Trace } from "../src/protocol";
import { TraceStore } from "../src/trace-store";
import { connectTraceStream } from "../src/trace-stream";

const trace = (id: string, status: Trace["status"] = "pending"): Trace => ({
  version: 1,
  id,
  session: "local",
  label: id,
  source: "sample",
  startedAt: 1,
  status,
  request: { model: "sample", state: {}, questions: {} },
  attempts: [],
  captureWarnings: [],
});

test("delta merging preserves unchanged objects and server order, including removal and clear", () => {
  const store = new TraceStore();
  const a = trace("a"),
    b = trace("b"),
    c = trace("c", "success");
  store.apply("snapshot", { version: 2, revision: 10, traces: [b, a] });
  const finishedB = trace("b", "success");
  const next = store.apply("delta", {
    version: 2,
    base: 10,
    revision: 12,
    upserts: [finishedB, c],
    order: ["c", "b", "a"],
  });
  assert.deepEqual(
    next.map((t) => t.id),
    ["c", "b", "a"],
  );
  assert.equal(next[2], a);
  assert.equal(next[1].status, "success");
  assert.equal(b.status, "pending", "prior state must not be mutated");
  assert.deepEqual(
    store.apply("delta", {
      version: 2,
      base: 12,
      revision: 13,
      upserts: [],
      order: ["c"],
    }),
    [c],
  );
  assert.deepEqual(
    store.apply("delta", {
      version: 2,
      base: 13,
      revision: 14,
      upserts: [],
      order: [],
    }),
    [],
  );
});

test("invalid or out-of-sequence deltas cannot corrupt state; a fresh snapshot resets the cursor", () => {
  const store = new TraceStore();
  const a = trace("a");
  store.apply("snapshot", { version: 2, revision: 10, traces: [a] });
  const valid = {
    version: 2,
    base: 10,
    revision: 11,
    upserts: [],
    order: ["a"],
  };
  for (const patch of [
    { base: 9 },
    { base: 11 },
    { revision: 10 },
    { revision: NaN },
    { version: 3 },
    { order: ["missing"] },
    { order: ["a", "a"] },
    { upserts: [trace("unretained")] },
    { upserts: [a, a] },
  ])
    assert.throws(() => store.apply("delta", { ...valid, ...patch }));
  assert.deepEqual(store.apply("delta", valid), [a]);
  // Reconnect to a restarted server, whose revision counter starts again.
  const replacement = trace("replacement");
  assert.deepEqual(
    store.apply("snapshot", { version: 2, revision: 0, traces: [replacement] }),
    [replacement],
  );
  assert.deepEqual(
    store.apply("delta", {
      version: 2,
      base: 0,
      revision: 1,
      upserts: [],
      order: [],
    }),
    [],
  );
  assert.deepEqual(
    store.apply("snapshot", { version: 1, traces: [a] }),
    [a],
    "legacy servers remain supported",
  );
  assert.throws(
    () => store.apply("delta", valid),
    "legacy snapshots establish no incremental cursor",
  );
});

test("browser transport resynchronizes a gap, ignores stale events and cancels retries on unmount", (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
  const sources: FakeSource[] = [];
  class FakeSource extends EventTarget {
    closed = false;
    onerror: (() => void) | undefined;
    constructor(readonly url: string) {
      super();
      sources.push(this);
    }
    close() {
      this.closed = true;
    }
    send(kind: string, data: unknown) {
      this.dispatchEvent(
        new MessageEvent(kind, { data: JSON.stringify(data) }),
      );
    }
  }
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value: FakeSource,
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "EventSource", original);
    else Reflect.deleteProperty(globalThis, "EventSource");
  });
  const received: Trace[][] = [],
    statuses: string[] = [];
  const stop = connectTraceStream(
    "/api/jev",
    (traces) => received.push(traces),
    (status) => statuses.push(status),
  );
  try {
    assert.equal(sources[0].url, "/api/jev/events?protocol=2");
    sources[0].send("snapshot", {
      version: 2,
      revision: 1,
      traces: [trace("a")],
    });
    sources[0].send("delta", {
      version: 2,
      base: 2,
      revision: 3,
      upserts: [],
      order: [],
    });
    assert.equal(sources[0].closed, true);
    assert.equal(statuses.at(-1), "resynchronizing");
    assert.equal(received.length, 1, "gap must not publish partial state");
    t.mock.timers.tick(1000);
    assert.equal(sources.length, 2);
    sources[0].send("snapshot", { version: 1, traces: [] });
    assert.equal(
      received.length,
      1,
      "closed source cannot overwrite new connection",
    );
    sources[1].send("snapshot", { version: 2, revision: 0, traces: [] });
    assert.deepEqual(received.at(-1), []);
    sources[1].onerror?.();
    assert.equal(statuses.at(-1), "reconnecting");
    // Native EventSource reconnection sends another full snapshot on this source.
    sources[1].send("snapshot", {
      version: 2,
      revision: 5,
      traces: [trace("b")],
    });
    assert.equal(received.at(-1)![0].id, "b");
    sources[1].send("delta", {
      version: 2,
      base: 0,
      revision: 1,
      upserts: [],
      order: [],
    });
    stop();
    t.mock.timers.tick(1000);
    assert.equal(sources.length, 2, "unmount cancels resync timer");
  } finally {
    stop();
  }
});
