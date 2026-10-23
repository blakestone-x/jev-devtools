import { test, type TestContext } from "node:test";
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

function browserTransport(t: TestContext) {
  const original = new Map(
    ["EventSource", "requestAnimationFrame", "cancelAnimationFrame"].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
    ),
  );
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
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
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (id: number) => frames.delete(id),
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    sources,
    frame() {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(0);
    },
  };
}

test("browser transport resynchronizes a gap, ignores stale events and cancels retries on unmount", (t) => {
  const { sources, frame } = browserTransport(t);
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
    frame();
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
    frame();
    assert.deepEqual(received.at(-1), []);
    sources[1].onerror?.();
    assert.equal(statuses.at(-1), "reconnecting");
    // Native EventSource reconnection sends another full snapshot on this source.
    sources[1].send("snapshot", {
      version: 2,
      revision: 5,
      traces: [trace("b")],
    });
    frame();
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

test("browser delivery coalesces a burst without dropping terminal states, clear, or background updates", (t) => {
  const { sources, frame } = browserTransport(t);
  const received: Trace[][] = [];
  const stop = connectTraceStream(
    "/api/jev",
    (traces) => received.push(traces),
    () => {},
  );
  t.after(stop);
  const source = sources[0];
  source.send("snapshot", { version: 2, revision: 0, traces: [] });
  frame();
  source.send("delta", {
    version: 2,
    base: 0,
    revision: 1,
    upserts: [trace("a")],
    order: ["a"],
  });
  source.send("delta", {
    version: 2,
    base: 1,
    revision: 2,
    upserts: [
      trace("a", "success"),
      trace("b", "error"),
      trace("c", "cancelled"),
    ],
    order: ["c", "b", "a"],
  });
  assert.equal(
    received.length,
    1,
    "updates arriving before a frame must not publish intermediate history",
  );
  frame();
  assert.deepEqual(
    received[1].map((t) => [t.id, t.status]),
    [
      ["c", "cancelled"],
      ["b", "error"],
      ["a", "success"],
    ],
  );
  t.mock.timers.tick(100);
  assert.equal(
    received.length,
    2,
    "fallback must not redeliver a painted update",
  );

  // With animation frames suspended, the latest state still reaches consumers.
  source.send("delta", {
    version: 2,
    base: 2,
    revision: 3,
    upserts: [trace("d")],
    order: ["d", "c", "b", "a"],
  });
  source.send("delta", {
    version: 2,
    base: 3,
    revision: 4,
    upserts: [],
    order: [],
  });
  t.mock.timers.tick(100);
  assert.deepEqual(
    received[2],
    [],
    "clear must win over an earlier queued update",
  );
  frame();
  assert.equal(received.length, 3);

  source.send("delta", {
    version: 2,
    base: 4,
    revision: 5,
    upserts: [trace("queued")],
    order: ["queued"],
  });
  // Invalid data discards queued state while a fresh snapshot is requested.
  source.send("delta", {
    version: 2,
    base: 9,
    revision: 10,
    upserts: [],
    order: [],
  });
  frame();
  t.mock.timers.tick(100);
  assert.equal(received.length, 3);
  t.mock.timers.tick(900);
  sources[1].send("snapshot", {
    version: 2,
    revision: 0,
    traces: [trace("replacement")],
  });
  frame();
  assert.equal(received[3][0].id, "replacement");
  sources[1].send("snapshot", {
    version: 2,
    revision: 1,
    traces: [trace("unmounted")],
  });
  stop();
  frame();
  t.mock.timers.tick(100);
  assert.equal(
    received.length,
    4,
    "unmount cancels queued frame and fallback delivery",
  );
});
