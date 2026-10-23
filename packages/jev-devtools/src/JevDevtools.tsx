import { useState } from "react";
import { TraceDiagram } from "./TraceDiagram.js";
import type { AnswerView, Json, Trace } from "./protocol.js";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const ms = (value?: number) =>
  value === undefined ? "—" : `${Math.round(value)} ms`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
function findImage(value: Json): string | undefined {
  if (!value || typeof value !== "object") return;
  if (
    !Array.isArray(value) &&
    typeof value.preview === "string" &&
    /^data:image\/(png|jpeg);base64,/.test(value.preview)
  )
    return value.preview;
  for (const child of Object.values(value)) {
    const found = findImage(child);
    if (found) return found;
  }
}
function JsonBlock({ value }: { value: unknown }) {
  return <pre>{pretty(value)}</pre>;
}
function Answer({ answer, image }: { answer?: AnswerView; image?: string }) {
  if (!answer) return <p className="muted">No answer received.</p>;
  return (
    <div className="answer">
      {answer.choice !== undefined && (
        <strong className="answer-value">{answer.choice}</strong>
      )}
      {answer.score !== undefined && (
        <strong className="answer-value">
          {answer.score.toFixed(2)} <small>score</small>
        </strong>
      )}
      {answer.noul !== undefined && (
        <>
          <strong className="answer-value">
            {percent(answer.noul)} <small>probability of true</small>
          </strong>
          <div className="bar">
            <i style={{ width: percent(answer.noul) }} />
          </div>
        </>
      )}
      {answer.probabilities &&
        Object.entries(answer.probabilities).map(([label, value]) => (
          <div className="probability" key={label}>
            <div>
              <span>{label}</span>
              <b>{percent(value)}</b>
            </div>
            <div className="bar">
              <i style={{ width: percent(value) }} />
            </div>
          </div>
        ))}
      {answer.legend && (
        <details>
          <summary>Score legend</summary>
          <JsonBlock value={answer.legend} />
        </details>
      )}
      {answer.box && (
        <>
          <div className="box-preview">
            {image ? (
              <img src={image} alt="Captured request image" />
            ) : (
              <span>Image preview unavailable</span>
            )}
            <div
              className="bounding-box"
              style={{
                left: percent(answer.box.left),
                top: percent(answer.box.top),
                width: percent(answer.box.right - answer.box.left),
                height: percent(answer.box.bottom - answer.box.top),
              }}
            />
          </div>
          <code className="coordinates">
            {Object.entries(answer.box)
              .map(([k, v]) => `${k} ${v.toFixed(2)}`)
              .join(" · ")}
          </code>
        </>
      )}
      {answer.confidence !== undefined && (
        <p className="confidence">
          Confidence <b>{percent(answer.confidence)}</b>
        </p>
      )}
    </div>
  );
}
export function JevPanel({
  traces,
  connection,
  onClear,
}: {
  traces: Trace[];
  connection: string;
  onClear: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<string>();
  const [tab, setTab] = useState("Flow");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const filtered = traces.filter(
    (t) =>
      (status === "all" || status === t.status) &&
      `${t.label} ${t.request.model} ${t.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const trace = filtered.find((t) => t.id === selected) || filtered[0];
  return (
    <div className="jev-inspector">
      <aside className="request-list">
        <header>
          <h2>
            Jev requests <span>{traces.length}</span>
          </h2>
          <button
            onClick={() => void onClear().catch((e) => setError(e.message))}
            disabled={!traces.length}
          >
            Clear
          </button>
        </header>
        <div className="list-filters">
          <input
            aria-label="Search requests"
            placeholder="Search requests…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Filter request status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["all", "pending", "success", "error", "cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="request-items">
          {filtered.map((t) => (
            <button
              className={`request-row ${trace?.id === t.id ? "selected" : ""}`}
              key={t.id}
              onClick={() => setSelected(t.id)}
            >
              <span className={`status-dot ${t.status}`} />
              <span>
                <strong>{t.label}</strong>
                <small>
                  {new Date(t.startedAt).toLocaleTimeString()} · {t.source} ·{" "}
                  {ms(t.durationMs)}
                </small>
              </span>
              <span className="row-status">{t.status}</span>
            </button>
          ))}
          {!filtered.length && (
            <p className="empty">
              {traces.length
                ? "No matching requests."
                : "Run a scenario to capture your first request."}
            </p>
          )}
        </div>
        {(connection !== "connected" || error) && (
          <footer>
            {connection !== "connected" && (
              <span role="status">{connection}</span>
            )}
            {error && <p role="alert">{error}</p>}
          </footer>
        )}
      </aside>
      <section className="request-detail">
        {trace ? (
          <>
            <header className="detail-header">
              <div>
                <span className="eyebrow">
                  {trace.source} response · {trace.status}
                </span>
                <h2>{trace.label}</h2>
              </div>
              <div className="metrics">
                <span>
                  {ms(trace.durationMs)}
                  <small>Total duration</small>
                </span>
                <span>
                  {trace.attempts.length}
                  <small>Attempts</small>
                </span>
                <span>
                  {trace.result?.usage
                    ? `${trace.result.usage.input_tokens} / ${trace.result.usage.output_tokens}`
                    : "—"}
                  <small>Tokens in / out</small>
                </span>
              </div>
            </header>
            <div className="detail-meta">
              <code>{trace.result?.model || trace.request.model}</code>
              <code>
                {trace.requestId ||
                  (trace.status === "pending"
                    ? "Request ID pending"
                    : "No request ID")}
              </code>
            </div>
            <nav className="detail-tabs" aria-label="Request views">
              {["Flow", "Questions", "Context", "Transport", "Raw"].map(
                (name) => (
                  <button
                    key={name}
                    aria-pressed={tab === name}
                    onClick={() => setTab(name)}
                  >
                    {name}
                  </button>
                ),
              )}
            </nav>
            <div
              className={`detail-body ${tab === "Flow" ? "detail-body-flow" : ""}`}
            >
              {trace.error && (
                <div role="alert" className="error-banner">
                  <strong>{trace.error.name}</strong> {trace.error.message}
                </div>
              )}
              {trace.captureWarnings.map((w) => (
                <p className="warning" key={w}>
                  {w}
                </p>
              ))}
              {tab === "Flow" && <TraceDiagram key={trace.id} trace={trace} />}
              {tab === "Questions" &&
                Object.entries(trace.request.questions ?? {})
                  .filter(
                    ([, q]) =>
                      q && typeof q === "object" && typeof q.type === "string",
                  )
                  .map(([key, q]) => (
                    <article className="question-node standalone" key={key}>
                      <header>
                        <h3>{key}</h3>
                        <span className="type">{q.type}</span>
                      </header>
                      <JsonBlock value={q} />
                      <Answer
                        answer={trace.result?.answers[key]}
                        image={findImage(trace.request.state)}
                      />
                    </article>
                  ))}
              {tab === "Context" && (
                <>
                  <p className="muted">
                    Captured before dispatch. Known credential fields and email
                    are redacted; captures are size limited.
                  </p>
                  {findImage(trace.request.state) && (
                    <img
                      className="context-image"
                      src={findImage(trace.request.state)}
                      alt="Captured context"
                    />
                  )}
                  <JsonBlock value={trace.request.state} />
                  {trace.request.assets && (
                    <JsonBlock value={trace.request.assets} />
                  )}
                </>
              )}
              {tab === "Transport" && (
                <>
                  <h3>HTTP attempts</h3>
                  <p className="muted">
                    Attempt duration ends at response headers. Total duration
                    includes SDK processing and retry waits.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Attempt</th>
                        <th>Status</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.attempts.map((a) => (
                        <tr key={a.number}>
                          <td>{a.number}</td>
                          <td>{a.error || a.status || "Pending"}</td>
                          <td>{ms(a.durationMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!trace.attempts.length && <p>No HTTP attempt recorded.</p>}
                </>
              )}
              {tab === "Raw" && <JsonBlock value={trace} />}
            </div>
          </>
        ) : (
          <div className="empty-detail">
            <span className="empty-symbol">↳</span>
            <h2>Follow a Jev request</h2>
            <p>
              Context, parallel questions, typed answers.
              <br />
              Run a sample above to see the complete flow.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
