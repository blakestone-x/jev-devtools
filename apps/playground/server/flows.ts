import { choice, noul, type Fetch } from "@typesafe-ai/sdk";
import { defineJevFlow, all } from "jev-devtools/flow";
export const refundFlow = defineJevFlow<{ message: string }>(
  "refund-review",
  (flow) => {
    const triage = flow.jev("triage", {
      state: flow.input,
      questions: {
        category: choice("Is this a refund request?", {
          refund: null,
          other: null,
        }),
      },
    });
    return flow.branch("refund-request", {
      when: triage.answer("category").choice.eq("refund"),
      then: (branch) => {
        const review = branch.jev("review", {
          state: {
            ticket: flow.input,
            category: triage.answer("category").choice,
          },
          questions: {
            eligible: noul("Is the refund eligible?"),
            risky: noul("Is this risky?"),
          },
        });
        return branch.branch("approval", {
          when: all(
            review.answer("eligible").noul.gte(0.9),
            review.answer("risky").noul.lt(0.2),
          ),
          then: (path) =>
            path.output("approve", {
              eligibility: review.answer("eligible").noul,
            }),
          else: (path) => path.output("manual-review"),
        });
      },
      else: (branch) => branch.output("other"),
    });
  },
);
export const parallelFlow = defineJevFlow<{ message: string }>(
  "parallel-review",
  (flow) => {
    const checks = flow.parallel("checks", {
      eligibility: (lane) =>
        lane
          .jev("eligibility", {
            state: flow.input,
            questions: { eligible: noul("Eligible?") },
          })
          .answer("eligible").noul,
      risk: (lane) =>
        lane
          .jev("risk", {
            state: flow.input,
            questions: { risky: noul("Risky?") },
          })
          .answer("risky").noul,
    });
    const decision = flow.jev("combined", {
      state: {
        ticket: flow.input,
        eligibility: checks.eligibility,
        risk: checks.risk,
      },
      questions: { ready: noul("Ready for approval?") },
    });
    return flow.branch("ready", {
      when: decision.answer("ready").noul.gte(0.9),
      then: (p) =>
        p.output("ready-output", {
          eligibility: checks.eligibility,
          risk: checks.risk,
        }),
      else: (p) => p.output("review-output"),
    });
  },
);
/** Deterministic fixtures, never inference. Delay makes progress/cancellation visible. */
export function flowTransport(scenario: string): Fetch {
  return async (_url, init) => {
    await new Promise<void>((resolve, reject) => {
      const signal = init?.signal;
      const timer = setTimeout(
        () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        },
        scenario === "flow-cancel" ? 5000 : 500,
      );
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(signal?.reason);
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
    const req = JSON.parse(String(init?.body));
    if (scenario === "flow-error" && !req.questions.category)
      return Response.json(
        { error: { message: "Sample review failed" } },
        { status: 400 },
      );
    const answers = Object.fromEntries(
      Object.entries(req.questions as Record<string, { type: string }>).map(
        ([key, q]) => [
          key,
          q.type === "choice"
            ? {
                type: "choice",
                choice: scenario === "flow-other" ? "other" : "refund",
                probabilities: {
                  refund: scenario === "flow-other" ? 0.1 : 0.9,
                  other: scenario === "flow-other" ? 0.9 : 0.1,
                },
                confidence: 0.9,
              }
            : {
                type: "noul",
                noul:
                  key === "risky"
                    ? 0.1
                    : scenario === "flow-manual"
                      ? 0.65
                      : 0.94,
              },
        ],
      ),
    );
    return Response.json({ model: "sample-flow", answers });
  };
}
