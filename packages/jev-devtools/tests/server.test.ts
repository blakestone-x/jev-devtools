import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { createJevDevtools, getJevDevtools } from "../server/index";
import { choice } from "@typesafe-ai/sdk";
import { flowAnswer } from "../src/flow-model";
import type { Trace } from "../src/protocol";

const origin = "http://localhost:5199";
const req = (path = "", init: RequestInit = {}) =>
  new Request(origin + "/api/jev-devtools" + path, init);
const answer = {
  model: "test",
  answers: {
    team: {
      type: "choice",
      choice: "delivery",
      probabilities: { billing: 0.76, delivery: 0.14, other: 0.1 },
      confidence: 0.27,
    },
  },
};
const request = {
  state: { message: "Sample", apiKey: "secret" },
  questions: {
    team: choice("Which team?", {
      billing: "Billing",
      delivery: "Delivery",
      other: "Other",
    }),
  },
};
const clientOptions = {
  apiKey: "fake",
  fetch: async () => Response.json(answer),
  logLevel: "off" as const,
};
async function snapshot(
  adapter: ReturnType<typeof createJevDevtools>,
  headers: HeadersInit = {},
) {
  const response = await adapter.handle(req("/events", { headers }));
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const first = await reader.read();
  await reader.cancel();
  return JSON.parse(
    new TextDecoder().decode(first.value).split("data: ")[1].trim(),
  ).traces;
}

test("public factory records real SDK calls and exposes replayable SSE snapshots with safe clear", async () => {
  const adapter = createJevDevtools({ origin, enabled: true });
  try {
    const client = adapter.createClient(clientOptions, {
      label: "Route",
      source: "sample",
    });
    const result = await client.systemOne(request);
    assert.equal(result.answers.team.choice, "delivery");
    await delay(10);
    const traces = await snapshot(adapter);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].status, "success");
    assert.equal(traces[0].request.state.apiKey, "[redacted]");
    assert.equal(traces[0].attempts[0].status, 200);
    assert.equal(
      (await adapter.handle(req("/clear", { method: "DELETE" }))).status,
      403,
    );
    assert.equal(
      (
        await adapter.handle(
          req("/clear", { method: "DELETE", headers: { origin } }),
        )
      ).status,
      200,
    );
    assert.deepEqual(await snapshot(adapter), []);
    adapter.dispose();
    assert.equal((await adapter.handle(req())).status, 404);
  } finally {
    adapter.dispose();
  }
});
test("disabled by default, rejects cross-origin access and enforces authorization before streaming", async () => {
  const disabled = createJevDevtools({ origin });
  const plain = disabled.createClient(clientOptions);
  assert.equal(
    (await plain.systemOne(request)).answers.team.choice,
    "delivery",
  );
  assert.equal((await disabled.handle(req())).status, 404);
  assert.throws(
    () => createJevDevtools({ origin: "https://example.com", enabled: true }),
    /authorize/,
  );
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    authorize: (r) => r.headers.get("authorization") === "allowed",
  });
  try {
    assert.equal((await adapter.handle(req("/events"))).status, 403);
    assert.equal(
      (
        await adapter.handle(
          req("/events", {
            headers: { origin: "https://evil.test", authorization: "allowed" },
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await adapter.handle(
          new Request("http://evil.test/api/jev-devtools", {
            headers: { authorization: "allowed" },
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (await adapter.handle(req("", { headers: { authorization: "allowed" } })))
        .status,
      200,
    );
    assert.equal(
      (
        await adapter.handle(
          req("/events", {
            method: "POST",
            headers: { authorization: "allowed" },
          }),
        )
      ).status,
      405,
    );
  } finally {
    adapter.dispose();
    disabled.dispose();
  }
});
test("server-derived scopes isolate concurrent calls and clear only the authorized scope", async () => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    authorize: (r) => !!r.headers.get("x-test-user"),
    getSession: (r) => r.headers.get("x-test-user")!,
  });
  try {
    const client = adapter.createClient(clientOptions);
    await Promise.all(
      ["alice", "bob"].map((user) =>
        adapter.run(req("", { headers: { "x-test-user": user } }), () =>
          client.systemOne({ ...request, state: { owner: user } }),
        ),
      ),
    );
    await delay(10);
    for (const user of ["alice", "bob"]) {
      const traces = await snapshot(adapter, { "x-test-user": user });
      assert.equal(traces.length, 1);
      assert.equal(traces[0].request.state.owner, user);
    }
    await adapter.handle(
      req("/clear", {
        method: "DELETE",
        headers: { origin, "x-test-user": "alice" },
      }),
    );
    assert.deepEqual(await snapshot(adapter, { "x-test-user": "alice" }), []);
    assert.equal((await snapshot(adapter, { "x-test-user": "bob" })).length, 1);
  } finally {
    adapter.dispose();
  }
});
test("Node middleware serves actual HTTP/SSE, delegates unrelated routes, and disconnects cleanly", async () => {
  let adapter: ReturnType<typeof createJevDevtools>;
  const server = createServer(
    (req, res) =>
      void adapter.middleware(req, res, () => res.writeHead(201).end("app")),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  adapter = createJevDevtools({
    origin: base,
    enabled: true,
    endpoint: "/inspect",
  });
  try {
    assert.equal((await fetch(base + "/app")).status, 201);
    assert.equal((await fetch(base + "/inspect")).status, 200);
    const response = await fetch(base + "/inspect/events");
    const reader = response.body!.getReader();
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /"traces":\[\]/,
    );
    await reader.cancel();
    const clear = await fetch(base + "/inspect/clear", {
      method: "DELETE",
      headers: { origin: base },
    });
    assert.equal(clear.status, 200);
  } finally {
    adapter.dispose();
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
test("flow branches preserve the returned choice even when it is not the highest probability", () => {
  const branches = flowAnswer({ ...answer.answers.team, type: "choice" });
  assert.deepEqual(
    branches.filter((b) => b.active).map((b) => b.label),
    ["delivery"],
  );
  assert.equal(
    flowAnswer({ type: "score", score: 1.23 })[0].label,
    "Score 1.23",
  );
  assert.deepEqual(flowAnswer(), []);
});

// Adapter lifetime is distinct from the existing request/SSE contract tests:
// module re-evaluation must retain history, while dispose must release the key.
test("shared adapters retain history per application key and release disposed instances", async () => {
  const key = "shared-lifecycle-test";
  const first = getJevDevtools(key, () => ({ origin, enabled: true }));
  const other = getJevDevtools(key + "-other", () => ({
    origin,
    enabled: true,
  }));
  let replacement: ReturnType<typeof getJevDevtools> | undefined;
  try {
    await first.createClient(clientOptions).systemOne(request);
    await delay(10);
    const reused = getJevDevtools(key, () => {
      throw new Error("Configuration must be initialized once");
    });
    assert.equal(
      (await snapshot(reused))[0].result.answers.team.choice,
      "delivery",
    );
    assert.deepEqual(await snapshot(other), []);
    first.dispose();
    assert.equal((await first.handle(req())).status, 404);
    replacement = getJevDevtools(key, () => ({ origin, enabled: true }));
    assert.deepEqual(await snapshot(replacement), []);
    first.dispose(); // A stale owner must not evict the replacement.
    await replacement.createClient(clientOptions).systemOne(request);
    await delay(10);
    assert.equal(
      (await snapshot(getJevDevtools(key, () => ({ origin }))))[0].result
        .answers.team.choice,
      "delivery",
    );
  } finally {
    first.dispose();
    other.dispose();
    replacement?.dispose();
  }
});

// Next may reconstruct Request.url using localhost while Host contains the
// configured browser authority. Normalize only after validating that Host.
test("Node framework routes use the verified Host without trusting forwarded headers", async () => {
  const adapter = createJevDevtools({ origin, enabled: true });
  const internal = "http://127.0.0.1:9999/api/jev-devtools";
  try {
    for (const [headers, status] of [
      [{ host: "localhost:5199" }, 200],
      [{ host: "evil.test" }, 403],
      [{ "x-forwarded-host": "localhost:5199" }, 403],
      [{ host: "localhost:5199", origin: "https://evil.test" }, 403],
      [{ host: "localhost:5199", "sec-fetch-site": "cross-site" }, 403],
    ] as [HeadersInit, number][]) {
      assert.equal(
        (await adapter.handleNodeRoute(new Request(internal, { headers })))
          .status,
        status,
      );
    }
    assert.equal(
      (
        await adapter.handle(
          new Request(internal, { headers: { host: "localhost:5199" } }),
        )
      ).status,
      403,
    );
    adapter.dispose();
    assert.equal(
      (await adapter.handleNodeRoute(new Request(internal))).status,
      404,
    );
  } finally {
    adapter.dispose();
  }
});

// These cases exercise delivery on an already-open stream. Reconnecting for each
// assertion would miss batching, stale queued data, and scheduled-flush cleanup.
async function watch(
  adapter: ReturnType<typeof createJevDevtools>,
  headers: HeadersInit = {},
) {
  const response = await adapter.handle(req("/events", { headers }));
  const reader = response.body!.getReader();
  const received: { traces: Trace[] }[] = [];
  const done = (async () => {
    let pending = "";
    const decoder = new TextDecoder();
    for (;;) {
      const next = await reader.read();
      if (next.done) return;
      pending += decoder.decode(next.value, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n\n")) >= 0) {
        const event = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (event.startsWith("event: snapshot\ndata: "))
          received.push(
            JSON.parse(event.slice("event: snapshot\ndata: ".length)),
          );
      }
    }
  })();
  return { received, done, cancel: () => reader.cancel() };
}
async function eventually(condition: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await delay(5);
  }
  assert.fail("Expected SSE state was not delivered");
}

test("open SSE viewers receive one coherent burst instead of every intermediate request state", async () => {
  const adapter = createJevDevtools({ origin, enabled: true });
  const viewers = await Promise.all([watch(adapter), watch(adapter)]);
  try {
    await eventually(() => viewers.every((v) => v.received.length === 1));
    const client = adapter.createClient(clientOptions);
    await Promise.all(
      Array.from({ length: 4 }, (_, n) =>
        client.systemOne({ ...request, state: { n } }),
      ),
    );
    await eventually(() =>
      viewers.every(
        (v) =>
          v.received.at(-1)?.traces.length === 4 &&
          v.received.at(-1)!.traces.every((t) => t.status === "success"),
      ),
    );
    for (const viewer of viewers) {
      // A fast burst may finish capture in a later turn, but must not send all
      // four lifecycle notifications for each of the four calls.
      assert.ok(
        viewer.received.length <= 3,
        `Expected initial + at most two burst snapshots; got ${viewer.received.length}`,
      );
      assert.deepEqual(
        viewer.received
          .at(-1)!
          .traces.map((t) => (t.request.state as { n: number }).n)
          .sort((a, b) => a - b),
        [0, 1, 2, 3],
      );
      assert.ok(
        viewer.received
          .at(-1)!
          .traces.every(
            (t) =>
              t.attempts.length === 1 &&
              t.result?.answers.team.choice === "delivery",
          ),
      );
    }
    assert.deepEqual(viewers[0].received.at(-1), viewers[1].received.at(-1));
  } finally {
    await Promise.all(viewers.map((v) => v.cancel()));
    await Promise.all(viewers.map((v) => v.done));
    adapter.dispose();
  }
});

test("batched streams retain session isolation and deliver final errors, cancellation, and clear", async () => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    getSession: (r) => r.headers.get("x-test-user") || "local",
  });
  const alice = await watch(adapter, { "x-test-user": "alice" });
  const bob = await watch(adapter, { "x-test-user": "bob" });
  try {
    const client = adapter.createClient({
      ...clientOptions,
      retry: { maxRetries: 0 },
      fetch: async () =>
        Response.json(
          { error: { message: "sample failure" } },
          { status: 400 },
        ),
    });
    const abort = new AbortController();
    abort.abort();
    await Promise.allSettled([
      adapter.run(req("", { headers: { "x-test-user": "alice" } }), () =>
        client.systemOne(request),
      ),
      adapter.run(req("", { headers: { "x-test-user": "bob" } }), () =>
        client.systemOne(request, { signal: abort.signal }),
      ),
    ]);
    await eventually(
      () =>
        alice.received.at(-1)?.traces[0]?.status === "error" &&
        bob.received.at(-1)?.traces[0]?.status === "cancelled",
    );
    assert.ok(
      alice.received
        .flatMap((s) => s.traces)
        .every((t) => t.session === "alice"),
    );
    assert.ok(
      bob.received.flatMap((s) => s.traces).every((t) => t.session === "bob"),
    );
    await adapter.handle(
      req("/clear", {
        method: "DELETE",
        headers: { origin, "x-test-user": "alice" },
      }),
    );
    await eventually(() => alice.received.at(-1)?.traces.length === 0);
    assert.equal(bob.received.at(-1)!.traces[0].status, "cancelled");
  } finally {
    await Promise.all([alice.cancel(), bob.cancel()]);
    await Promise.all([alice.done, bob.done]);
    adapter.dispose();
  }
});

test("a backpressured stream catches up to retained final state and disposal cancels pending delivery", async () => {
  const adapter = createJevDevtools({ origin, enabled: true, limit: 2 });
  const response = await adapter.handle(req("/events"));
  const reader = response.body!.getReader();
  try {
    const client = adapter.createClient(clientOptions);
    for (let n = 0; n < 5; n++)
      await client.systemOne({ ...request, state: { n } });
    await delay(20);
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /"traces":\[\]/,
    );
    const next = await reader.read();
    const traces: Trace[] = JSON.parse(
      new TextDecoder().decode(next.value).split("data: ")[1],
    ).traces;
    assert.equal(traces.length, 2);
    assert.deepEqual(
      traces.map((t) => (t.request.state as { n: number }).n),
      [4, 3],
    );
    assert.ok(traces.every((t) => t.status === "success"));
    // Clearing queues another update. Disposal must cancel it before delivery.
    await adapter.handle(
      req("/clear", { method: "DELETE", headers: { origin } }),
    );
    adapter.dispose();
    assert.equal((await reader.read()).done, true);
  } finally {
    await reader.cancel();
    adapter.dispose();
  }
});

test("viewers own independent bytes when receiving the same batched session snapshot", async () => {
  const adapter = createJevDevtools({ origin, enabled: true });
  const readers = await Promise.all(
    [0, 1].map(async () =>
      (await adapter.handle(req("/events"))).body!.getReader(),
    ),
  );
  try {
    await Promise.all(readers.map((r) => r.read()));
    await adapter.createClient(clientOptions).systemOne(request);
    const [first, second] = await Promise.all(readers.map((r) => r.read()));
    assert.ok(first.value && second.value);
    first.value.fill(0);
    const data = JSON.parse(
      new TextDecoder().decode(second.value).split("data: ")[1],
    );
    assert.equal(data.traces[0].request.state.message, "Sample");
  } finally {
    await Promise.all(readers.map((r) => r.cancel()));
    adapter.dispose();
  }
});

test("an outstanding request stays visible as pending before its final result arrives", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const adapter = createJevDevtools({ origin, enabled: true });
  const viewer = await watch(adapter);
  const client = adapter.createClient({
    ...clientOptions,
    fetch: async () => {
      await gate;
      return Response.json(answer);
    },
  });
  const call = client.systemOne(request);
  try {
    await eventually(
      () => viewer.received.at(-1)?.traces[0]?.status === "pending",
    );
    const id = viewer.received.at(-1)!.traces[0].id;
    release();
    await call;
    await eventually(
      () => viewer.received.at(-1)?.traces[0]?.status === "success",
    );
    assert.equal(viewer.received.at(-1)!.traces[0].id, id);
    assert.equal(
      viewer.received.at(-1)!.traces[0].result?.answers.team.choice,
      "delivery",
    );
  } finally {
    release();
    await call;
    await viewer.cancel();
    await viewer.done;
    adapter.dispose();
  }
});
