import { lazy, startTransition, Suspense, useState } from "react";
import { TraceDiagram } from "./TraceDiagram.js";
import type { Trace } from "./protocol.js";
import { JsonBlock, findImage } from "./TraceContent.js";
const Questions = lazy(() =>
  import("./Questions.js").then((module) => ({ default: module.Questions })),
);
const ms = (value?: number) =>
  value === undefined ? "—" : `${Math.round(value)} ms`;
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
                    onClick={() => {
                      if (name === "Questions")
                        startTransition(() => setTab(name));
                      else setTab(name);
                    }}
                  >
                    {name}
                  </button>
                ),
              )}
            </nav>
            <div
              className={`detail-body ${tab === "Flow" ? "detail-body-flow" : tab === "Questions" ? "detail-body-questions" : ""}`}
            >
              <Suspense
                fallback={
                  <p className="muted" role="status">
                    Loading questions…
                  </p>
                }
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
                {tab === "Flow" && (
                  <TraceDiagram key={trace.id} trace={trace} />
                )}
                {tab === "Questions" && (
                  <Questions key={trace.id} trace={trace} />
                )}
                {tab === "Context" && (
                  <>
                    <p className="muted">
                      Captured before dispatch. Known credential fields and
                      email are redacted; captures are size limited.
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
              </Suspense>
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
