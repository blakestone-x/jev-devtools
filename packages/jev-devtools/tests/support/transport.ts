import { choice, box, image } from "@typesafe-ai/sdk";
import type { Fetch, SystemOneRequest, Questions } from "@typesafe-ai/sdk";

// Small transport fixtures owned by recorder tests, independent of the demo.
export async function makeRequest(
  scenario: string,
): Promise<SystemOneRequest<Questions>> {
  return scenario === "image"
    ? {
        state: {
          photo: image(
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=",
              "base64",
            ),
          ),
        },
        questions: { mug: box("Mug region") },
      }
    : {
        state: { message: "Test request" },
        questions: {
          category: choice("Team?", {
            billing: "Billing",
            delivery: "Delivery",
            other: "Other",
          }),
        },
      };
}
export function sampleTransport(scenario: string): Fetch {
  let attempt = 0;
  return async (_url, init) => {
    attempt++;
    await new Promise<void>((resolve, reject) => {
      const signal = init?.signal;
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, 50);
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(signal?.reason ?? new Error("Aborted"));
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
    const status =
      scenario === "error"
        ? 400
        : scenario === "retry" && attempt === 1
          ? 429
          : 200;
    const answers =
      scenario === "image"
        ? {
            mug: {
              type: "box",
              box: { left: 0.35, top: 0.19, right: 0.78, bottom: 0.81 },
              confidence: 0.92,
            },
          }
        : {
            category: {
              type: "choice",
              choice: "billing",
              probabilities: { billing: 0.8, delivery: 0.1, other: 0.1 },
              confidence: 0.7,
            },
          };
    return Response.json(
      status === 200
        ? { model: "test", answers }
        : { error: { message: "Test transport failure" } },
      {
        status,
        headers: {
          "x-typesafe-request-id": `sample-${scenario}-${attempt}`,
          "retry-after": "0",
        },
      },
    );
  };
}
