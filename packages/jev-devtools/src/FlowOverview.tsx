import { memo, useMemo, useState } from "react";
import type { FlowDefinition, FlowRun } from "./flow-protocol.js";
import type { Trace } from "./protocol.js";
import { useDiagramViewport } from "./useDiagramViewport.js";
import { RequestDetail } from "./JevDevtools.js";
import { JsonBlock } from "./TraceContent.js";
const Card = memo(function Card({
  id,
  kind,
  status,
  decision,
  selected,
  x,
  y,
  onSelect,
}: {
  id: string;
  kind: string;
  status: string;
  decision?: boolean;
  selected: boolean;
  x: number;
  y: number;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className={`flow-step ${selected ? "selected" : ""}`}
      data-status={status}
      style={{ left: x, top: y }}
      aria-label={`Step ${id}, ${kind}, ${status}`}
      aria-pressed={selected}
      onClick={() => onSelect(id)}
    >
      <span className="eyebrow">
        {kind === "parallel" ? "parallel join" : kind}
      </span>
      <strong>{id}</strong>
      <small>
        {status}
        {decision !== undefined ? ` · ${decision ? "then" : "else"}` : ""}
      </small>
    </button>
  );
});
export const FlowOverview = memo(function FlowOverview({
  definition,
  run,
  traces,
}: {
  definition: FlowDefinition;
  run: FlowRun;
  traces: Trace[];
}) {
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState(false);
  const layout = useMemo(() => {
    const points = new Map<string, { x: number; y: number }>(),
      rows = new Map<number, number>();
    let remaining = [...definition.nodes];
    while (remaining.length) {
      const ready = remaining.filter((n) =>
        n.dependencies.every((id) => points.has(id)),
      );
      if (!ready.length) break;
      for (const node of ready) {
        const x = node.dependencies.length
          ? Math.max(...node.dependencies.map((id) => points.get(id)!.x)) + 280
          : 40;
        const row = rows.get(x) ?? 0;
        rows.set(x, row + 1);
        points.set(node.id, { x, y: 50 + row * 150 });
      }
      const ids = new Set(ready.map((n) => n.id));
      remaining = remaining.filter((n) => !ids.has(n.id));
    }
    return {
      points,
      width: Math.max(700, ...[...points.values()].map((p) => p.x + 260)),
      height: Math.max(400, ...[...points.values()].map((p) => p.y + 140)),
    };
  }, [definition]);
  const { viewport, canvas, zoom, zoomBy, fit } = useDiagramViewport(
    layout.width,
    layout.height,
    run.id,
  );
  const node = definition.nodes.find((n) => n.id === selected);
  const step = node ? run.steps[node.id] : undefined;
  const trace = step?.traceId
    ? traces.find((t) => t.id === step.traceId)
    : undefined;
  return (
    <section className="request-detail whole-flow" aria-label="Whole flow">
      <header className="detail-header">
        <div>
          <span className="eyebrow">Flow run · {run.status}</span>
          <h2>{run.name}</h2>
        </div>
        <div>
          {run.outcome ? (
            <strong>Outcome: {run.outcome}</strong>
          ) : (
            (run.error ?? "Execution paths")
          )}
          <small className="muted">
            {run.durationMs !== undefined
              ? ` · ${Math.round(run.durationMs)} ms`
              : ""}
          </small>
        </div>
      </header>
      <div className="lab-flow-toolbar">
        <div>
          <button aria-label="Zoom flow out" onClick={() => zoomBy(1 / 1.2)}>
            −
          </button>
          <output aria-label="Flow zoom">{zoom}%</output>
          <button aria-label="Zoom flow in" onClick={() => zoomBy(1.2)}>
            +
          </button>
          <button onClick={fit}>Fit flow</button>
        </div>
        <label>
          Step
          <select
            aria-label="Flow step"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select a step</option>
            {definition.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} · {run.steps[n.id]?.status ?? "waiting"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className="flow-overview-viewport diagram-viewport"
        ref={viewport}
        tabIndex={0}
        aria-label="Flow canvas"
        role="region"
      >
        <div
          ref={canvas}
          className="flow-overview-canvas"
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
            className="flow-connections"
          >
            <defs>
              <marker
                id={`arrow-${run.id}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M0 0L10 5L0 10z" fill="currentColor" />
              </marker>
            </defs>
            {definition.nodes.flatMap((n) =>
              n.dependencies.map((id) => {
                const a = layout.points.get(id),
                  b = layout.points.get(n.id);
                if (!a || !b) return null;
                const active = ["running", "completed"].includes(
                  run.steps[n.id]?.status,
                );
                return (
                  <path
                    key={`${id}-${n.id}`}
                    d={`M${a.x + 220},${a.y + 48} C${a.x + 250},${a.y + 48} ${b.x - 30},${b.y + 48} ${b.x},${b.y + 48}`}
                    stroke={active ? "#E551BA" : "currentColor"}
                    opacity={active ? 1 : 0.35}
                    fill="none"
                    strokeWidth="2"
                    markerEnd={`url(#arrow-${run.id})`}
                  />
                );
              }),
            )}
          </svg>
          {definition.nodes.map((n) => {
            const p = layout.points.get(n.id);
            return p ? (
              <Card
                key={n.id}
                id={n.id}
                kind={n.kind}
                status={run.steps[n.id]?.status ?? "waiting"}
                decision={run.steps[n.id]?.decision}
                selected={selected === n.id}
                x={p.x}
                y={p.y}
                onSelect={setSelected}
              />
            ) : null;
          })}
        </div>
      </div>
      <div className="flow-selection">
        {node && step ? (
          <>
            <strong>
              {node.id} · {step.status}
            </strong>
            <span className="muted">
              {step.durationMs !== undefined
                ? ` · ${Math.round(step.durationMs)} ms`
                : ""}
            </span>
            {node.condition && (
              <p>
                <code>{node.condition}</code> ·{" "}
                {step.decision === undefined
                  ? "not evaluated"
                  : String(step.decision)}
              </p>
            )}
            <p className="muted">
              {node.path.length ? node.path.join(" / ") : "Main path"}
            </p>
            {step.error && <p role="alert">{step.error}</p>}
            {node.kind === "jev" &&
              (trace ? (
                <button onClick={() => setDetails(!details)}>
                  {details ? "Hide request details" : "Inspect request"}
                </button>
              ) : (
                <p>
                  {step.traceId
                    ? "Request capture was cleared or evicted."
                    : "No captured request linked yet. Use a client created by this inspector."}
                </p>
              ))}
          </>
        ) : (
          <p className="muted">
            Select a node to inspect its execution. Lines show dependencies, not
            inferred model reasoning.
          </p>
        )}
        {run.value !== undefined && (
          <details>
            <summary>Captured outcome value</summary>
            <JsonBlock value={run.value} />
          </details>
        )}
      </div>
      {details && trace && (
        <div className="flow-request-detail">
          <RequestDetail trace={trace} />
        </div>
      )}
    </section>
  );
});
