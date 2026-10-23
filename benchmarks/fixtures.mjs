import { choice, score, noul, box, TypeSafeClient } from "@typesafe-ai/sdk";
import { JevRecorder } from "jev-devtools/server";
import { setImmediate as tick } from "node:timers/promises";

// Synthetic, deterministic local transport: no credentials, network inference, or customer data.
export const scenarios = [
  {
    id: "choice-edge",
    history: 1,
    choices: 150,
    questions: 1,
    stateChars: 120,
    returnedLast: true,
    tied: true,
  },
  {
    id: "mixed-questions",
    history: 1,
    choices: 3,
    questions: 150,
    stateChars: 120,
    mixed: true,
  },
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
      spec.tied ? 1 / spec.choices : i ? 0.2 / (spec.choices - 1) : 0.8,
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
        choice: spec.returnedLast
          ? `category_${spec.choices - 1}`
          : "category_0",
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
  if (spec.mixed) {
    state.preview =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afooAAAAASUVORK5CYII=";
    for (let i = 1; i < spec.questions; i++) {
      const key = `question_${i}`;
      if (i % 4 === 1) {
        questions[key] = score(`Score sample ${i}.`, ["Low", "High"]);
        answers[key] = {
          type: "score",
          score: 0.75,
          probabilities: { 0: 0.25, 1: 0.75 },
          legend: { 0: "Low", 1: "High" },
          confidence: 0.8,
        };
      } else if (i % 4 === 2) {
        questions[key] = noul(`Is sample ${i} present?`);
        answers[key] = { type: "noul", noul: 0.65 };
      } else if (i % 4 === 3) {
        questions[key] = box(`Locate sample ${i}.`);
        answers[key] = {
          type: "box",
          box: { left: 0.1, top: 0.2, right: 0.8, bottom: 0.9 },
        };
      }
    }
    questions.question_72 = choice(
      "Long instructions. ".repeat(300) + "End of full instructions.",
      criteria,
    );
  }
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
