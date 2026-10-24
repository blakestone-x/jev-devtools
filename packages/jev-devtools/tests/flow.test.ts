import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  TypeSafeClient,
  choice,
  noul,
  score,
  box,
  type Fetch,
} from "@typesafe-ai/sdk";
import {
  defineJevFlow,
  all,
  any,
  not,
  type FlowExpression,
  type FlowOutcome,
} from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import { formatFlowCondition } from "../src/flow-condition.js";
import type { FlowUpdate } from "../src/flow-protocol.js";
const questions = {
  category: choice("Category?", { refund: null, other: null }),
};
const review = { eligible: noul("Eligible?"), risky: noul("Risky?") };
const origin = "http://localhost:5198";
const options = (fetch: Fetch) => ({
  apiKey: "sample-only",
  fetch,
  logLevel: "off" as const,
  retry: { maxRetries: 0 },
});
function refund() {
  return defineJevFlow<{
    category: "refund" | "other";
    eligible: number;
    risky: number;
  }>("refund", (flow) => {
    const triage = flow.jev("triage", { state: flow.input, questions });
    return flow.branch("refund-request", {
      when: triage.answer("category").choice.eq("refund"),
      then: (branch) => {
        const result = branch.jev("review", {
          state: {
            ticket: flow.input,
            category: triage.answer("category").choice,
          },
          questions: review,
        });
        return branch.branch("approval", {
          when: all(
            result.answer("eligible").noul.gte(0.9),
            not(
              any(
                result.answer("risky").noul.gte(0.2),
                result.answer("eligible").noul.lt(0),
              ),
            ),
          ),
          then: (p) =>
            p.output("approve", {
              eligibility: result.answer("eligible").noul,
            }),
          else: (p) => p.output("manual"),
        });
      },
      else: (p) => p.output("other"),
    });
  });
}
const calls: unknown[] = [];
const transport: Fetch = async (_url, init) => {
  const request = JSON.parse(String(init?.body));
  calls.push(request);
  const state = request.state.ticket ?? request.state;
  return Response.json({
    model: "sample",
    answers: request.questions.category
      ? {
          category: {
            type: "choice",
            choice: state.category,
            probabilities: { refund: 0.8, other: 0.2 },
            confidence: 0.8,
          },
        }
      : {
          eligible: { type: "noul", noul: state.eligible },
          risky: { type: "noul", noul: state.risky },
        },
  });
};
async function history(
  inspector: ReturnType<typeof createJevDevtools>,
  session = "local",
  path = "/flows/events",
) {
  const response = await inspector.handle(
    new Request(origin + "/api/jev-devtools" + path, {
      headers: { "x-session": session },
    }),
  );
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const first = await reader.read();
  await reader.cancel();
  return JSON.parse(
    new TextDecoder().decode(first.value).split("data: ")[1].trim(),
  );
}
test("definitions make no requests; each branch yields only its chosen outcome using actual answers, without recording", async () => {
  calls.length = 0;
  const flow = refund();
  assert.equal(calls.length, 0);
  assert.equal(
    flow.definition.nodes.filter((n) => n.kind === "output").length,
    3,
  );
  const client = new TypeSafeClient(options(transport));
  for (const [input, outcome, count] of [
    [{ category: "refund", eligible: 0.94, risky: 0.1 }, "approve", 2],
    [{ category: "refund", eligible: 0.8, risky: 0.1 }, "manual", 2],
    [{ category: "other", eligible: 0.94, risky: 0.1 }, "other", 1],
  ] as const) {
    calls.length = 0;
    const result = await flow.run(input, { client });
    assert.equal(result.outcome, outcome);
    assert.equal(calls.length, count);
    if (outcome === "approve") {
      assert.deepEqual(result.value, { eligibility: 0.94 });
      assert.equal(
        (calls[1] as { state: { category: string } }).state.category,
        "refund",
      );
    }
  }
});
test("definition validation rejects duplicate, foreign, unavailable lane references and malformed terminals before dispatch", () => {
  assert.throws(
    () =>
      defineJevFlow("duplicate", (f) => {
        f.jev("same", { state: "a", questions });
        f.jev("same", { state: "b", questions });
        return f.output("done");
      }),
    /duplicate/,
  );
  let foreign: FlowExpression<unknown>;
  defineJevFlow("first", (f) => {
    foreign = f.input;
    return f.output("ok");
  });
  assert.throws(
    () =>
      defineJevFlow("foreign", (f) => {
        f.jev("call", { state: foreign, questions });
        return f.output("done");
      }),
    /Foreign/,
  );
  let escaped: FlowExpression<number>;
  assert.throws(
    () =>
      defineJevFlow("lanes", (f) => {
        f.parallel("checks", {
          a: (p) => {
            const a = p.jev("a", { state: "a", questions: review });
            escaped = a.answer("eligible").noul;
            return escaped;
          },
          b: (p) => {
            p.jev("b", { state: escaped, questions });
            return p.input;
          },
        });
        return f.output("done");
      }),
    /Unavailable/,
  );
  assert.throws(
    () =>
      defineJevFlow("unknown", (f) => {
        const q = f.jev("q", { state: "a", questions });
        q.answer("missing" as "category");
        return f.output("done");
      }),
    /Unknown question/,
  );
  assert.throws(
    () =>
      defineJevFlow("terminal", (f) => {
        const result = f.output("done");
        f.jev("late", { state: "x", questions });
        return result;
      }),
    /terminal/,
  );
});
test("mis-scoped builders and non-terminal branch returns fail during definition", () => {
  assert.throws(
    () =>
      defineJevFlow("scope", (f) =>
        f.branch("choice", {
          when: f.input.eq({}),
          then: (p) => {
            f.jev("wrong", { state: "x", questions });
            return p.output("done");
          },
          else: (p) => p.output("other"),
        }),
      ),
    /current branch/,
  );
  assert.throws(
    () =>
      defineJevFlow<{ outcome: string }>("terminal-check", (f) =>
        f.branch("b", {
          when: f.input.get("outcome").eq("x"),
          then: (p) => p.input as FlowExpression<FlowOutcome>,
          else: (p) => p.output("other"),
        }),
      ),
    /end with output/,
  );
});

test("parallel lanes overlap, join before dependent calls, and retain inferred Score/Box references", async () => {
  const seen: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const client = new TypeSafeClient(
    options(async (_url, init) => {
      const req = JSON.parse(String(init?.body));
      seen.push(req.state.name);
      if (req.state.name !== "dependent") {
        if (seen.length === 2) release();
        await barrier;
      } else assert.equal(seen.length, 3);
      return Response.json({
        model: "sample",
        answers: {
          rating: {
            type: "score",
            score: 1.3,
            confidence: 0.8,
            probabilities: { 0: 0.1, 1: 0.5, 2: 0.4 },
            legend: { 0: "bad", 1: "ok", 2: "good" },
          },
          region: {
            type: "box",
            box: { left: 0.1, top: 0.2, right: 0.5, bottom: 0.7 },
            confidence: 0.9,
          },
        },
      });
    }),
  );
  const qs = {
    rating: score("Rating?", ["bad", "ok", "good"]),
    region: box("Region?"),
  };
  const flow = defineJevFlow("parallel", (f) => {
    const results = f.parallel("checks", {
      score: (p) =>
        p
          .jev("rating", { state: { name: "score" }, questions: qs })
          .answer("rating").score,
      box: (p) =>
        p
          .jev("region", { state: { name: "box" }, questions: qs })
          .answer("region")
          .box.get("left"),
    });
    f.jev("dependent", {
      state: { name: "dependent", rating: results.score, left: results.box },
      questions: qs,
    });
    return f.output("done", { rating: results.score, left: results.box });
  });
  assert.deepEqual((await flow.run({}, { client })).value, {
    rating: 1.3,
    left: 0.1,
  });
  assert.deepEqual(seen, ["score", "box", "dependent"]);
});
test("concurrent scoped runs retain independent decisions, request links, redacted request snapshots, and disabled execution works", async () => {
  const inspector = createJevDevtools({
    origin,
    enabled: true,
    getSession: (r) => r.headers.get("x-session") ?? "local",
    redact: (path, value) => (path.at(-1) === "noul" ? "[redacted]" : value),
  });
  try {
    const client = inspector.createClient(options(transport), {
        source: "sample",
      }),
      flow = refund();
    const results = await Promise.all(
      ["a", "b"].map((session, i) =>
        inspector.run(
          new Request(origin, { headers: { "x-session": session } }),
          () =>
            flow.run(
              { category: "refund", eligible: i ? 0.3 : 0.94, risky: 0.1 },
              { client, devtools: inspector },
            ),
        ),
      ),
    );
    assert.notEqual(results[0].runId, results[1].runId);
    await delay(5);
    for (const [i, session] of ["a", "b"].entries()) {
      const captured = (await history(inspector, session)) as FlowUpdate;
      assert.equal(captured.upserts.length, 1);
      const run = captured.upserts[0];
      assert.equal(run.id, results[i].runId);
      assert.equal(run.steps.approval.decision, i === 0);
      assert.equal(run.steps.other.status, "untaken");
      const traces = (await history(inspector, session, "/events")).traces;
      assert.equal(traces.length, 2);
      assert.equal(traces[0].result.answers.eligible.noul, "[redacted]");
      for (const trace of traces) {
        assert.equal(trace.flow.runId, run.id);
        assert.equal(run.steps[trace.flow.stepId].traceId, trace.id);
        assert.equal(
          run.steps[trace.flow.stepId].executionId,
          trace.flow.executionId,
        );
      }
    }
    await inspector.handle(
      new Request(origin + "/api/jev-devtools/clear", {
        method: "DELETE",
        headers: { origin, "x-session": "a" },
      }),
    );
    assert.equal((await history(inspector, "a")).order.length, 0);
    assert.equal((await history(inspector, "b")).order.length, 1);
  } finally {
    inspector.dispose();
  }
  const disabled = createJevDevtools({ origin });
  try {
    assert.equal(
      (
        await refund().run(
          { category: "other", eligible: 0, risky: 0 },
          {
            client: disabled.createClient(options(transport)),
            devtools: disabled,
          },
        )
      ).outcome,
      "other",
    );
  } finally {
    disabled.dispose();
  }
});
test("missing values and invalid comparisons reject instead of taking else paths", async () => {
  const client = new TypeSafeClient(
    options(async () => {
      throw new Error("Must not send");
    }),
  );
  for (const input of [{}, { value: "not-a-number" }]) {
    const flow = defineJevFlow<{ value: number }>("invalid", (f) =>
      f.branch("check", {
        when: f.input.get("value").gte(1),
        then: (p) => p.output("yes"),
        else: (p) => p.output("no"),
      }),
    );
    await assert.rejects(
      flow.run(input as unknown as { value: number }, { client }),
      /Missing value|finite numbers/,
    );
  }
});
test("SDK retries remain within one step; failures cancel sibling lanes and block dependent work", async () => {
  let attempts = 0;
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const retryClient = inspector.createClient({
      ...options(async () => {
        attempts++;
        return attempts === 1
          ? Response.json(
              { error: { message: "retry" } },
              { status: 429, headers: { "retry-after": "0" } },
            )
          : Response.json({
              model: "test",
              answers: {
                category: {
                  type: "choice",
                  choice: "other",
                  confidence: 1,
                  probabilities: { other: 1, refund: 0 },
                },
              },
            });
      }),
      retry: { maxRetries: 1 },
    });
    assert.equal(
      (
        await refund().run(
          { category: "other", eligible: 0, risky: 0 },
          { client: retryClient, devtools: inspector },
        )
      ).outcome,
      "other",
    );
    assert.equal(attempts, 2);
    let siblingAborted = false;
    const client = inspector.createClient(
      options(async (_url, init) => {
        const state = JSON.parse(String(init?.body)).state;
        if (state === "fail") {
          await delay(15);
          return Response.json(
            { error: { message: "failed" } },
            { status: 400 },
          );
        }
        await new Promise<void>((_, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => {
              siblingAborted = true;
              reject(init.signal?.reason);
            },
            { once: true },
          ),
        );
        throw new Error("unreachable");
      }),
    );
    const flow = defineJevFlow("failed-parallel", (f) => {
      f.parallel("join", {
        a: (p) =>
          p.jev("bad", { state: "fail", questions }).answer("category").choice,
        b: (p) =>
          p.jev("slow", { state: "slow", questions }).answer("category").choice,
      });
      f.jev("dependent", { state: "must-not-run", questions });
      return f.output("done");
    });
    await assert.rejects(flow.run({}, { client, devtools: inspector }));
    assert.equal(siblingAborted, true);
    const run = (await history(inspector)).upserts[0];
    assert.equal(run.status, "error");
    assert.equal(run.steps.bad.status, "error");
    assert.equal(run.steps.slow.status, "cancelled");
    assert.equal(run.steps.dependent.status, "blocked");
  } finally {
    inspector.dispose();
  }
});
test("external cancellation is propagated and recorded, including pre-aborted runs", async () => {
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    let started!: () => void;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    const client = inspector.createClient(
      options(async (_url, init) => {
        started();
        await new Promise<void>((_, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          ),
        );
        throw new Error("unreachable");
      }),
    );
    const flow = defineJevFlow("cancel", (f) => {
      f.jev("wait", { state: "wait", questions });
      return f.output("done");
    });
    const controller = new AbortController();
    const pending = flow.run(
      {},
      { client, devtools: inspector, signal: controller.signal },
    );
    await ready;
    controller.abort();
    await assert.rejects(pending);
    const run = (await history(inspector)).upserts[0];
    assert.equal(run.status, "cancelled");
    assert.equal(run.steps.wait.status, "cancelled");
    assert.equal(run.steps.done.status, "cancelled");
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(flow.run({}, { client, signal: aborted.signal }));
  } finally {
    inspector.dispose();
  }
});
test("flow retention is bounded, definitions follow retained runs, and clear prevents late resurrection", async () => {
  const inspector = createJevDevtools({ origin, enabled: true, limit: 1 });
  try {
    let start!: () => void, release!: () => void;
    const ready = new Promise<void>((r) => {
      start = r;
    });
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const client = inspector.createClient(
      options(async () => {
        start();
        await gate;
        return Response.json({
          model: "sample",
          answers: {
            category: {
              type: "choice",
              choice: "other",
              probabilities: { other: 1, refund: 0 },
              confidence: 1,
            },
          },
        });
      }),
    );
    const slow = refund().run(
      { category: "other", eligible: 0, risky: 0 },
      { client, devtools: inspector },
    );
    await ready;
    await inspector.handle(
      new Request(origin + "/api/jev-devtools/clear", {
        method: "DELETE",
        headers: { origin },
      }),
    );
    release();
    await slow;
    assert.deepEqual((await history(inspector)).order, []);
    for (const name of ["first", "second"])
      await defineJevFlow(name, (f) => f.output("done")).run(
        {},
        { client, devtools: inspector },
      );
    const h = await history(inspector);
    assert.equal(h.upserts.length, 1);
    assert.equal(h.upserts[0].name, "second");
    assert.equal(h.definitions.length, 1);
    assert.equal(h.definitions[0].name, "second");
  } finally {
    inspector.dispose();
  }
});
test("invalid null/object equality cannot silently choose an outcome", async () => {
  const flow = defineJevFlow<{ value: null }>("invalid-equality", (f) =>
    f.branch("compare", {
      when: f.input.get("value").eq({} as never),
      then: (p) => p.output("yes"),
      else: (p) => p.output("no"),
    }),
  );
  await assert.rejects(
    flow.run(
      { value: null },
      { client: new TypeSafeClient(options(transport)) },
    ),
    /matching scalar/,
  );
});
test("parallel rejection with an undefined reason is recorded as failure, not cancellation", async () => {
  const flow = defineJevFlow("undefined-rejection", (f) => {
    f.parallel("join", {
      a: (p) =>
        p.jev("call", { state: "x", questions }).answer("category").choice,
    });
    return f.output("must-not-complete");
  });
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    await assert.rejects(
      flow.run(
        {},
        {
          client: {
            systemOne() {
              throw undefined;
            },
          },
          devtools: inspector,
        },
      ),
    );
    const run = (await history(inspector)).upserts[0];
    assert.equal(run.status, "error");
    assert.equal(run.steps.join.status, "error");
    assert.equal(run.steps["must-not-complete"].status, "blocked");
  } finally {
    inspector.dispose();
  }
});

test("authored step context reaches captures without changing requests, routing, or output values", async () => {
  const display = {
    title: "Review context",
    description: "Public explanation for the diagram.",
  };
  const inspector = createJevDevtools({ origin, enabled: true });
  const requests: unknown[] = [];
  const client = inspector.createClient(
    options(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        model: "sample",
        answers: { eligible: { type: "noul", noul: 0.94 } },
      });
    }),
    { source: "sample" },
  );
  try {
    const flow = defineJevFlow<{ ticket: string }>("context", (f) => {
      const checks = f.parallel(
        "checks",
        {
          eligibility: (lane) =>
            lane
              .jev(
                "evaluate",
                { state: f.input, questions: { eligible: noul("Eligible?") } },
                display,
              )
              .answer("eligible").noul,
        },
        { title: "Gather evidence" },
      );
      return f.branch(
        "route",
        {
          when: checks.eligibility.gte(0.9),
          then: (p) =>
            p.output(
              "approved",
              { probability: checks.eligibility },
              {
                title: "Ready for approval",
                description: "The configured threshold was met.",
              },
            ),
          else: (p) => p.output("review"),
        },
        { title: "Check threshold" },
      );
    });
    display.title = "Changed after definition";
    const result = await flow.run(
      { ticket: "sample ticket" },
      { client, devtools: inspector },
    );
    assert.equal(result.outcome, "approved");
    assert.deepEqual(result.value, { probability: 0.94 });
    const captured = (await history(inspector)) as FlowUpdate;
    const nodes = captured.definitions[0].nodes;
    assert.equal(
      nodes.find((n) => n.id === "evaluate")?.title,
      "Review context",
    );
    assert.equal(
      nodes.find((n) => n.id === "evaluate")?.description,
      "Public explanation for the diagram.",
    );
    assert.equal(
      nodes.find((n) => n.id === "checks")?.title,
      "Gather evidence",
    );
    assert.equal(nodes.find((n) => n.id === "route")?.title, "Check threshold");
    assert.equal(
      nodes.find((n) => n.id === "approved")?.description,
      "The configured threshold was met.",
    );
    const request = requests[0] as {
      state: unknown;
      questions: unknown;
      title?: string;
      description?: string;
    };
    assert.deepEqual(request.state, { ticket: "sample ticket" });
    assert.deepEqual(request.questions, {
      eligible: { type: "noul", instructions: "Eligible?" },
    });
    assert.equal(request.title, undefined);
    assert.equal(request.description, undefined);
  } finally {
    inspector.dispose();
  }
});
test("invalid display text is rejected when defining a flow", () => {
  for (const display of [
    { title: " " },
    { title: "x".repeat(121) },
    { description: "x".repeat(601) },
    { description: 42 },
  ]) {
    assert.throws(
      () =>
        defineJevFlow("invalid-copy", (flow) =>
          flow.output(
            "done",
            undefined,
            display as { title?: string; description?: string },
          ),
        ),
      /must be a non-empty string/,
    );
  }
});

test("captured branch rules preserve thresholds and Boolean grouping without changing recorded decisions", async () => {
  const inputRule = defineJevFlow<{ answers: { ready: boolean } }>(
    "input-rule",
    (f) =>
      f.branch("route", {
        when: f.input.get("answers").get("ready").eq(true),
        then: (p) => p.output("yes"),
        else: (p) => p.output("no"),
      }),
  );
  assert.equal(
    formatFlowCondition(inputRule.definition.nodes[0].conditionRule!),
    "input.answers.ready = true",
  );
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const flow = refund();
    const client = inspector.createClient(options(transport), {
      source: "sample",
    });
    await flow.run(
      { category: "refund", eligible: 0.94, risky: 0.1 },
      { client, devtools: inspector },
    );
    const captured = (await history(inspector)) as FlowUpdate;
    const rules = captured.definitions[0].nodes;
    assert.equal(
      formatFlowCondition(
        rules.find((n) => n.id === "refund-request")!.conditionRule!,
      ),
      'triage.category.choice = "refund"',
    );
    assert.equal(
      formatFlowCondition(
        rules.find((n) => n.id === "approval")!.conditionRule!,
      ),
      "(review.eligible ≥ 90% AND NOT ((review.risky ≥ 20% OR review.eligible < 0%)))",
    );
    assert.equal(captured.upserts[0].steps.approval.decision, true);
  } finally {
    inspector.dispose();
  }
});
test("rule literals follow condition redaction and capture failures never expose them or alter execution", async () => {
  const flow = defineJevFlow<string>("private-rule", (f) =>
    f.branch("match", {
      when: f.input.eq("private-code"),
      then: (p) => p.output("matched"),
      else: (p) => p.output("other"),
    }),
  );
  for (const throws of [false, true]) {
    const inspector = createJevDevtools({
      origin,
      enabled: true,
      redact: (path, value) => {
        if (path[0] === "conditions" && path.at(-1) === "value") {
          if (throws) throw new Error("no capture");
          return "[redacted]";
        }
        return value;
      },
    });
    try {
      const result = await flow.run("private-code", {
        client: new TypeSafeClient(options(transport)),
        devtools: inspector,
      });
      assert.equal(result.outcome, "matched");
      const captured = (await history(inspector)) as FlowUpdate;
      assert.equal(JSON.stringify(captured).includes("private-code"), false);
      assert.equal(
        formatFlowCondition(
          captured.definitions[0].nodes.find((n) => n.id === "match")!
            .conditionRule!,
        ),
        throws ? "[rule capture unavailable]" : 'input = "[redacted]"',
      );
      assert.equal(captured.upserts[0].steps.match.decision, true);
    } finally {
      inspector.dispose();
    }
  }
});
