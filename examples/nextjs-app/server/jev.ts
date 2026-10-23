import "server-only";
import { getJevDevtools } from "@diagram-motion-lab/jev-devtools/server";

export const origin =
  process.env.JEV_DEVTOOLS_ORIGIN || "http://127.0.0.1:4184";
export const inspector = getJevDevtools("nextjs-example", () => ({
  enabled: process.env.NODE_ENV === "development",
  origin,
  redact: (path, value) => (path.at(-1) === "email" ? "[redacted]" : value),
}));

// Samples only: all three server entry points exercise the real SDK transport.
// To use live Jev, replace this fetch fixture and supply a server-side API key.
export async function classify(source: string) {
  const jev = inspector.createClient(
    {
      apiKey: "sample-not-a-real-key",
      logLevel: "off",
      fetch: async () =>
        Response.json({
          model: "jev-sample",
          answers: {
            category: {
              type: "choice",
              choice: "billing",
              probabilities: { billing: 0.8, delivery: 0.15, other: 0.05 },
              confidence: 0.7,
            },
          },
        }),
    },
    { source: "sample", label: source },
  );
  const response = await jev.systemOne({
    state: { message: "I was charged twice.", email: "sample@example.com" },
    questions: {
      category: {
        type: "choice",
        instructions: "Which team should handle this message?",
        criteria: {
          billing: "Payment issues",
          delivery: "Shipping issues",
          other: "Everything else",
        },
      },
    },
  });
  return response.answers.category.choice;
}
