import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { ScenarioResult, type RunState } from "../src/ScenarioResult";
import { sampleTransport, makeRequest } from "../server/scenarios";

const base: RunState = {
  id: "run",
  status: "success",
  scenario: "triage",
  mode: "sample",
  message: "Submitted customer message",
  elapsedMs: 20,
};
// Protect application outcomes at the rendering boundary: these differ even though
// the scenario and input text stay the same. Recorder tests do not cover this UI.
test("application preview adapts to returned answers from each real SDK sample transport", async () => {
  for (const [profile, team, priority, handoff] of [
    ["billing", "Billing", "High priority", "Human handoff"],
    ["delivery", "Delivery", "Standard priority", "Human handoff"],
    ["other", "General support", "Low priority", "Self-service"],
  ] as const) {
    const client = new TypeSafeClient({
      apiKey: "sample",
      logLevel: "off",
      fetch: sampleTransport("triage", profile),
    });
    const response = await client.systemOne(
      await makeRequest("triage", base.message),
    );
    const html = renderToStaticMarkup(
      createElement(ScenarioResult, {
        run: { ...base, result: JSON.parse(JSON.stringify(response)) },
      }),
    );
    for (const visible of [team, priority, handoff, base.message])
      assert.ok(html.includes(visible), `Missing ${visible} for ${profile}`);
    assert.ok(html.includes("No ticket is sent."));
  }
});
test("Box overlay is gated by presence and never inferred from coordinates alone", () => {
  for (const [probability, shown] of [
    [0.9, true],
    [0.1, false],
    [undefined, false],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(ScenarioResult, {
        run: {
          ...base,
          scenario: "image",
          result: {
            model: "sample",
            answers: {
              mug: {
                type: "box",
                box: { left: 0.2, top: 0.1, right: 0.6, bottom: 0.8 },
              },
              ...(probability === undefined
                ? {}
                : { present: { type: "noul", noul: probability } }),
            },
          },
        },
      }),
    );
    assert.equal(html.includes('aria-label="Returned mug region"'), shown);
  }
});
test("pending, failed, and cancelled runs never render an earlier successful action", () => {
  const oldResult = {
    model: "sample",
    answers: { category: { type: "choice", choice: "billing" } },
  };
  for (const status of ["pending", "error", "cancelled"] as const) {
    const html = renderToStaticMarkup(
      createElement(ScenarioResult, {
        run: { ...base, status, result: oldResult },
      }),
    );
    assert.ok(!html.includes("ASSIGNED QUEUE"));
    assert.ok(!html.includes("High priority"));
  }
  const missing = renderToStaticMarkup(
    createElement(ScenarioResult, {
      run: { ...base, result: { model: "sample", answers: {} } },
    }),
  );
  assert.ok(missing.includes("Unassigned"));
  assert.ok(missing.includes("Not assessed"));
});
