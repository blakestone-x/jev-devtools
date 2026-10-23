import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { JevRecorder } from "jev-devtools/server";
import { setImmediate as tick } from "node:timers/promises";

// Synthetic, deterministic local transport: no credentials, network inference, or customer data.
export const scenarios = [
  { id: "small", history: 1, choices: 3, questions: 1, stateChars: 120 },
  {
    id: "default-history",
    history: 50,
    choices: 3,
    questions: 1,
    stateChars: 120,
  },
  {
    id: "max-history",
    history: 200,
    choices: 3,
    questions: 1,
    stateChars: 120,
  },
  {
    id: "wide-choice",
    history: 1,
    choices: 150,
    questions: 1,
    stateChars: 120,
  },
  {
    id: "many-questions",
    history: 1,
    choices: 3,
    questions: 150,
    stateChars: 120,
  },
  {
    id: "large-state",
    history: 200,
    choices: 3,
    questions: 1,
    stateChars: 80000,
  },
  {
    id: "combined",
    history: 200,
    choices: 150,
    questions: 1,
    stateChars: 80000,
  },
];
export function fixture(spec) {
  const criteria = Object.fromEntries(
    Array.from({ length: spec.choices }, (_, i) => [
      `category_${i}`,
      `Category ${i}`,
    ]),
  );
  const probabilities = Object.fromEntries(
    Object.keys(criteria).map((key, i) => [
      key,
      i ? 0.2 / (spec.choices - 1) : 0.8,
    ]),
  );
  const questions = Object.fromEntries(
    Array.from({ length: spec.questions }, (_, i) => [
      `question_${i}`,
      choice(`Classify synthetic item ${i}.`, { ...criteria }),
    ]),
  );
  const answers = Object.fromEntries(
    Object.keys(questions).map((key) => [
      key,
      {
        type: "choice",
        choice: "category_0",
        probabilities: { ...probabilities },
        confidence: 0.9,
      },
    ]),
  );
  const state = Object.fromEntries(
    Array.from({ length: Math.ceil(spec.stateChars / 10000) }, (_, i) => [
      `field_${i}`,
      "benchmark "
        .repeat(1000)
        .slice(0, Math.min(10000, spec.stateChars - i * 10000)),
    ]),
  );
  const request = { state, questions };
  const body = JSON.stringify({ model: "benchmark-sample", answers });
  const clientOptions = {
    apiKey: "local-benchmark-not-a-key",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async () =>
      new Response(body, {
        headers: {
          "content-type": "application/json",
          "x-typesafe-request-id": "benchmark-sample",
        },
      }),
  };
  return { request, clientOptions };
}
export async function invoke(client, request) {
  await client.systemOne(request);
  // The capture reads a cloned Response independently from the caller's promise.
  await tick();
}
export async function recordedFixture(spec) {
  const recorder = new JevRecorder({ limit: spec.history });
  const { request, clientOptions } = fixture(spec);
  let index = 0;
  const client = recorder.instrument(
    new TypeSafeClient({
      ...clientOptions,
      fetch: recorder.transport(clientOptions.fetch),
    }),
    () => ({ session: "local", label: `Sample ${++index}`, source: "sample" }),
  );
  for (let i = 0; i < spec.history; i++) await invoke(client, request);
  const traces = recorder.snapshot("local");
  if (
    traces.length !== Math.min(200, spec.history) ||
    traces.some((t) => t.status !== "success")
  )
    throw new Error("Fixture capture did not settle");
  return { recorder, snapshot: { version: 1, traces } };
}
export function stats(values) {
  const v = [...values].sort((a, b) => a - b);
  const at = (p) => v[Math.max(0, Math.ceil(v.length * p) - 1)] ?? 0;
  return { n: v.length, median: at(0.5), p95: at(0.95), max: at(1) };
}
