import { useState } from "react";
import type { AnswerView } from "@diagram-motion-lab/jev-devtools";

export type RunState = {
  id: string;
  status: "idle" | "pending" | "success" | "error" | "cancelled";
  scenario: string;
  mode: string;
  message: string;
  result?: {
    model: string;
    answers: Record<
      string,
      Omit<AnswerView, "confidence"> & { confidence?: number | null }
    >;
  };
  error?: string;
  elapsedMs?: number;
};
const percent = (v: number) => `${Math.round(v * 100)}%`;
const teams: Record<string, string> = {
  billing: "Billing",
  delivery: "Delivery",
  other: "General support",
};

function TicketResult({ run }: { run: RunState }) {
  const [view, setView] = useState<"ticket" | "signals">("ticket");
  const answers = run.result!.answers;
  const category =
    answers.category?.type === "choice" ? answers.category.choice : undefined;
  const severity =
    answers.severity?.type === "score" ? answers.severity.score : undefined;
  const human = answers.human?.type === "noul" ? answers.human.noul : undefined;
  // Illustrative application policy, deliberately separate from the returned answers.
  const priority =
    severity === undefined
      ? "Not assessed"
      : severity >= 1.5
        ? "High priority"
        : severity >= 0.5
          ? "Standard priority"
          : "Low priority";
  const handoff =
    human === undefined
      ? "Not assessed"
      : human >= 0.5
        ? "Human handoff"
        : "Self-service";
  const team = category ? (teams[category] ?? category) : "Unassigned";
  return (
    <>
      <div className="result-heading">
        <div>
          <span className="eyebrow">SUPPORT INBOX</span>
          <h3>Your message has a destination.</h3>
        </div>
        <div className="result-tabs" role="group" aria-label="Result display">
          <button
            aria-pressed={view === "ticket"}
            onClick={() => setView("ticket")}
          >
            Ticket preview
          </button>
          <button
            aria-pressed={view === "signals"}
            onClick={() => setView("signals")}
          >
            Why this outcome?
          </button>
        </div>
      </div>
      {view === "ticket" ? (
        <div className="ticket-result">
          <article className="ticket-preview">
            <div className="ticket-topline">
              <span className="ticket-number">TICKET PREVIEW</span>
              <span
                className={`priority-pill ${severity !== undefined && severity >= 1.5 ? "priority-high" : ""}`}
              >
                {priority}
              </span>
            </div>
            <blockquote>{run.message}</blockquote>
            <div className="ticket-person">
              <span className="person-avatar" aria-hidden="true">
                C
              </span>
              <div>
                <strong>Customer message</strong>
                <small>Ready for {team.toLowerCase()}</small>
              </div>
            </div>
          </article>
          <div className="result-route" aria-hidden="true">
            <span />
            <b>→</b>
          </div>
          <article className="destination-preview">
            <span className="eyebrow">ASSIGNED QUEUE</span>
            <div className="queue-monogram" aria-hidden="true">
              {team.slice(0, 1)}
            </div>
            <h4>{team}</h4>
            <p>
              {human === undefined
                ? "Awaiting a handoff signal."
                : human >= 0.5
                  ? "A person can take it from here."
                  : "Start with a guided help experience."}
            </p>
            <span className="handoff-pill">
              <span aria-hidden="true">
                {human !== undefined && human >= 0.5 ? "↗" : "⌁"}
              </span>{" "}
              {handoff}
            </span>
          </article>
        </div>
      ) : (
        <div className="result-signals">
          <article>
            <span className="eyebrow">CHOICE → TEAM</span>
            <h4>{team}</h4>
            <p>Uses Jev’s returned choice.</p>
            {Object.entries(answers.category?.probabilities ?? {}).map(
              ([label, p]) => (
                <div className="signal-bar" key={label}>
                  <span>{teams[label] ?? label}</span>
                  <strong>{percent(p)}</strong>
                  <div>
                    <i
                      style={{ width: percent(Math.max(0, Math.min(1, p))) }}
                    />
                  </div>
                </div>
              ),
            )}
          </article>
          <article>
            <span className="eyebrow">SCORE → PRIORITY</span>
            <h4>{priority}</h4>
            <p>
              {severity === undefined
                ? "No score returned."
                : `${severity.toFixed(2)} on the sample’s 0–2 scale.`}
            </p>
            <div className="priority-scale">
              <span className={priority === "Low priority" ? "selected" : ""}>
                Low
              </span>
              <span
                className={priority === "Standard priority" ? "selected" : ""}
              >
                Standard
              </span>
              <span className={priority === "High priority" ? "selected" : ""}>
                High
              </span>
            </div>
          </article>
          <article>
            <span className="eyebrow">NOUL → NEXT STEP</span>
            <h4>{handoff}</h4>
            <p>
              {human === undefined
                ? "No probability returned."
                : `${percent(human)} probability that a human was requested.`}
            </p>
            <div className="human-meter">
              <i
                style={{ width: percent(Math.max(0, Math.min(1, human ?? 0))) }}
              />
            </div>
          </article>
        </div>
      )}
      <p className="policy-note">
        Demo policy: Score ≥ 1.5 means high priority, ≥ 0.5 means standard.
        P(human) ≥ 50% suggests a handoff. These are application rules, not
        decisions made by Jev. No ticket is sent.
      </p>
    </>
  );
}
function ImageResult({ run }: { run: RunState }) {
  const [showRegion, setShowRegion] = useState(true);
  const answer = run.result!.answers.mug;
  const region = answer?.type === "box" ? answer.box : undefined;
  const present =
    run.result!.answers.present?.type === "noul"
      ? run.result!.answers.present.noul
      : undefined;
  const detected = present !== undefined && present >= 0.5;
  const visible = !!region && detected && showRegion;
  return (
    <>
      <div className="result-heading">
        <div>
          <span className="eyebrow">IMAGE REVIEW</span>
          <h3>
            {present === undefined
              ? "Presence is not assessed."
              : detected
                ? "A mug, brought into focus."
                : "No mug to highlight."}
          </h3>
        </div>
        <button
          disabled={!region || !detected}
          aria-pressed={showRegion}
          onClick={() => setShowRegion(!showRegion)}
        >
          {showRegion ? "Hide region" : "Show region"}
        </button>
      </div>
      <div className="image-result">
        <div className="image-result-canvas">
          <img
            src="/mug.png"
            alt="Submitted illustration of a mug beside a book"
          />
          {visible && (
            <div
              className="detected-region"
              aria-label="Returned mug region"
              style={{
                left: percent(region.left),
                top: percent(region.top),
                width: percent(region.right - region.left),
                height: percent(region.bottom - region.top),
              }}
            >
              <span>Mug</span>
            </div>
          )}
        </div>
        <article className="image-assessment">
          <span className="eyebrow">PRESENCE CHECK</span>
          <h4>
            {present === undefined
              ? "Awaiting a signal"
              : detected
                ? "Mug detected"
                : "Mug not detected"}
          </h4>
          <p>
            {present === undefined
              ? "A region alone does not establish presence."
              : `${percent(present)} probability that a mug is present.`}
          </p>
          <div className="human-meter">
            <i
              style={{ width: percent(Math.max(0, Math.min(1, present ?? 0))) }}
            />
          </div>
          <div className="region-summary">
            <span>Region</span>
            <strong>{region ? "Located" : "Unavailable"}</strong>
          </div>
          {typeof answer?.confidence === "number" && (
            <div className="region-summary">
              <span>Box confidence</span>
              <strong>{percent(answer.confidence)}</strong>
            </div>
          )}
          <p>
            Toggle the overlay to compare the returned region with the original
            image.
          </p>
        </article>
      </div>
      <p className="policy-note">
        Demo policy: show the returned Box only when P(present) ≥ 50%. Presence
        comes from Noul; a Box alone does not establish that an object exists.
      </p>
    </>
  );
}
export function ScenarioResult({ run }: { run: RunState }) {
  const finished = run.status === "success" && run.result;
  return (
    <section
      className={`scenario-result result-${run.status}`}
      aria-label="Application result"
      aria-busy={run.status === "pending"}
    >
      <div className="result-section-label">
        <span>APPLICATION RESULT</span>
        <span role="status">
          {run.status === "idle"
            ? "Waiting for a request"
            : run.status === "pending"
              ? "Processing request"
              : run.status === "success"
                ? `${run.mode === "sample" ? "Sample" : "Live"} response · ${run.elapsedMs} ms`
                : run.status === "cancelled"
                  ? "Cancelled"
                  : "Request failed"}
        </span>
      </div>
      {finished ? (
        <div key={run.id} className="result-reveal">
          {run.scenario === "retry" && (
            <div className="recovery-note">
              ✓ Recovered from a rate limit. The SDK retried and returned this
              result.
            </div>
          )}
          {run.scenario === "image" ? (
            <ImageResult key={run.id} run={run} />
          ) : (
            <TicketResult key={run.id} run={run} />
          )}
        </div>
      ) : (
        <div className="result-placeholder">
          <div
            className={`result-orbit ${run.status === "pending" ? "is-running" : ""}`}
            aria-hidden="true"
          >
            {run.status === "error"
              ? "!"
              : run.status === "cancelled"
                ? "∥"
                : "↳"}
          </div>
          <h3>
            {run.status === "pending"
              ? "Turning a question into an outcome…"
              : run.status === "error"
                ? "No answer, no action."
                : run.status === "cancelled"
                  ? "Stopped before an outcome."
                  : "See what your app could do next."}
          </h3>
          <p>
            {run.status === "pending"
              ? run.scenario === "retry"
                ? "This sample includes a rate-limit response and an automatic SDK retry."
                : "Shared context goes in. Typed answers come back."
              : run.status === "error"
                ? `${run.error ?? "The request failed."} Try another run, or inspect the failure in Jev DevTools.`
                : run.status === "cancelled"
                  ? "Run the sample again when you’re ready. No result was applied."
                  : "Run a sample to route a support ticket or highlight an object in an image."}
          </p>
          {run.status === "idle" && (
            <div className="empty-flow">
              <span>Context</span>
              <i>→</i>
              <span>Jev</span>
              <i>→</i>
              <span>Your interface</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
