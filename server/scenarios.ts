import { readFile } from "node:fs/promises";
import { choice, score, noul, box, image } from "@typesafe-ai/sdk";
import type { Fetch, Questions, SystemOneRequest } from "@typesafe-ai/sdk";
import { sampleProfiles, type SampleProfile } from "../src/sample-profiles.js";
export type Scenario = "triage" | "image" | "retry" | "error";
export const defaultMessage =
  "I was charged twice for my order. Checkout is now blocked, and I need a person to help me.";
export async function makeRequest(
  scenario: Scenario,
  message = defaultMessage,
): Promise<SystemOneRequest<Questions>> {
  if (scenario === "image")
    return {
      model: "jev-preview",
      state: {
        photo: image(
          await readFile(new URL("../public/mug.png", import.meta.url)),
        ),
        description: "A sample illustration of a mug on a desk.",
      },
      questions: {
        mug: box("The mug in `photo`"),
        present: noul("Is a mug present in `photo`?"),
      },
    };
  return {
    state: {
      message,
      channel: "support",
      customer: { email: "[sample@example.com]" },
    },
    questions: {
      category: choice("Which team should handle `message`?", {
        billing: "Charges, payments, or refunds.",
        delivery: "Shipment status or delivery issues.",
        other: "Anything outside billing or delivery.",
      }),
      severity: score(
        "How much does the issue in `message` disrupt the customer?",
        [
          "Cosmetic inconvenience.",
          "A workaround is available.",
          "The customer is blocked.",
        ],
      ),
      human: noul("Does `message` explicitly request a human agent?", {
        true: "A person is requested.",
        false: "Self-service help is sufficient.",
      }),
    },
  };
}
// Fixtures pass through the real SDK transport, including retry and abort logic.
// They never pretend to infer an answer from edited input.
export function sampleTransport(
  scenario: Scenario,
  profile: SampleProfile = "billing",
): Fetch {
  const fixture = sampleProfiles[profile];
  let attempt = 0;
  return async (_url, init) => {
    attempt++;
    await new Promise<void>((resolve, reject) => {
      const signal = init?.signal;
      const finish = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const timer = setTimeout(finish, 450);
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(signal?.reason ?? new Error("Aborted"));
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
    const headers = {
      "content-type": "application/json",
      "x-typesafe-request-id": `sample-${scenario}-${attempt}`,
    };
    if (scenario === "error")
      return new Response(
        JSON.stringify({
          error: {
            message:
              "Sample invalid request: the supplied criteria need revision.",
          },
        }),
        { status: 400, headers },
      );
    if (scenario === "retry" && attempt === 1)
      return new Response(
        JSON.stringify({
          error: { message: "Sample rate limit. The SDK will retry." },
        }),
        { status: 429, headers: { ...headers, "retry-after": "1" } },
      );
    const answers =
      scenario === "image"
        ? {
            mug: {
              type: "box",
              box: { left: 0.35, top: 0.19, right: 0.78, bottom: 0.81 },
              confidence: 0.92,
            },
            present: { type: "noul", noul: 0.96 },
          }
        : {
            category: {
              type: "choice",
              choice: profile,
              probabilities: fixture.probabilities,
              confidence: 0.64,
            },
            severity: {
              type: "score",
              score: fixture.severity,
              legend: {
                0: "Cosmetic inconvenience.",
                1: "A workaround is available.",
                2: "The customer is blocked.",
              },
              probabilities: fixture.severityProbabilities,
              confidence: 0.475,
            },
            human: { type: "noul", noul: fixture.human },
          };
    return Response.json(
      {
        model: scenario === "image" ? "jev-1.14.0" : "jev-sample",
        answers,
        usage: { input_tokens: 210, output_tokens: 42 },
      },
      { headers },
    );
  };
}
