import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlowDefinition, FlowNode, FlowRun } from "./flow-protocol.js";
import type { Trace } from "./protocol.js";
import { useDiagramViewport } from "./useDiagramViewport.js";
import { RequestDetail } from "./JevDevtools.js";
import { JsonBlock } from "./TraceContent.js";
import { TraceDiagram } from "./TraceDiagram.js";
type Bounds = { x: number; y: number; width: number; height: number };
const RequestNode = memo(function RequestNode({
  node,
  trace,
  status,
  selected,
  x,
  y,
  onSelect,
  onResize,
}: {
  node: FlowNode;
  trace: Trace;
  status: string;
  selected: boolean;
  x: number;
  y: number;
  onSelect: (id: string) => void;
  onResize: (id: string, height: number) => void;
}) {
  const measure = useCallback(
    (height: number) => onResize(node.id, height + 64),
    [node.id, onResize],
  );
  return (
    <article
      className={`flow-step flow-request ${selected ? "selected" : ""}`}
      data-status={status}
      aria-label={`Request ${node.id}`}
      style={{ left: x, top: y, width: 1120 }}
    >
      <button
        className="flow-request-heading"
        aria-label={`Step ${node.id}, jev, ${status}`}
        aria-pressed={selected}
        onClick={() => onSelect(node.id)}
      >
        <span>
          <span className="eyebrow">Jev request</span>
          <strong>{node.id}</strong>
        </span>
        <span>
          {status}
          {trace.durationMs !== undefined
            ? ` · ${Math.round(trace.durationMs)} ms`
            : ""}
        </span>
      </button>
      <TraceDiagram trace={trace} embedded onHeightChange={measure} />
    </article>
  );
});
function joinTitle(count: number) {
  return count === 2 ? "Wait for both checks" : `Wait for all ${count} paths`;
}
const Card = memo(function Card({
  node,
  status,
  decision,
  selected,
  bounds,
  onSelect,
  dependencies,
}: {
  node: FlowNode;
  status: string;
  decision?: boolean;
  selected: boolean;
  bounds: Bounds;
  onSelect: (id: string) => void;
  dependencies: string[];
}) {
  const join = node.kind === "parallel";
  return (
    <button
      className={`flow-step ${selected ? "selected" : ""}`}
      data-status={status}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
      aria-label={`Step ${node.id}, ${node.kind}, ${status}`}
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
    >
      <span className="eyebrow">
        {join
          ? "Parallel checks"
          : node.kind === "branch"
            ? "Condition"
            : node.kind}
      </span>
      <strong>{join ? joinTitle(dependencies.length) : node.id}</strong>
      {join && (
        <span className="flow-step-description">
          {dependencies.join(" + ")}
        </span>
      )}
      <small>
        {join && status === "completed" ? "All finished · continue" : status}
        {decision !== undefined ? ` · ${decision ? "then" : "else"}` : ""}
      </small>
      {node.kind === "jev" && (
        <small>
          {status === "untaken"
            ? "This request was not run."
            : "Request details are not captured yet or no longer retained."}
        </small>
      )}
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
  const [selected, setSelected] = useState(
    () => definition.nodes.find((n) => n.kind === "jev")?.id ?? "",
  );
  const [details, setDetails] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const tracesById = useMemo(
    () => new Map(traces.map((trace) => [trace.id, trace])),
    [traces],
  );
  // Omit redundant transitive edges so a reference does not draw through an
  // intervening condition. Execution ordering still includes every dependency.
  const links = useMemo(() => {
    const byId = new Map(definition.nodes.map((node) => [node.id, node]));
    const ancestors = (id: string) => {
      const seen = new Set<string>(),
        pending = [...(byId.get(id)?.dependencies ?? [])];
      while (pending.length) {
        const next = pending.pop()!;
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(...(byId.get(next)?.dependencies ?? []));
      }
      return seen;
    };
    const parents = new Map(
      definition.nodes.map((node) => [node.id, ancestors(node.id)]),
    );
    return new Map(
      definition.nodes.map((node) => [
        node.id,
        node.dependencies.filter(
          (id) =>
            !node.dependencies.some(
              (other) => other !== id && parents.get(other)?.has(id),
            ),
        ),
      ]),
    );
  }, [definition]);
  const layout = useMemo(() => {
    const columns = new Map<string, number>();
    let remaining = [...definition.nodes];
    while (remaining.length) {
      const ready = remaining.filter((node) =>
        node.dependencies.every((id) => columns.has(id)),
      );
      if (!ready.length) break;
      for (const node of ready)
        columns.set(
          node.id,
          node.dependencies.length
            ? Math.max(...node.dependencies.map((id) => columns.get(id)!)) + 1
            : 0,
        );
      const ids = new Set(ready.map((node) => node.id));
      remaining = remaining.filter((node) => !ids.has(node.id));
    }
    const points = new Map<string, Bounds>();
    let x = 40;
    for (let column = 0; column <= Math.max(0, ...columns.values()); column++) {
      const nodes = definition.nodes.filter(
        (node) => columns.get(node.id) === column,
      );
      let bottom = 40,
        width = 280;
      for (const node of nodes) {
        const captured =
          node.kind === "jev" &&
          tracesById.has(run.steps[node.id]?.traceId ?? "");
        const w = captured ? 1120 : 280,
          h = captured ? (heights[node.id] ?? 640) : 180;
        const parents = (links.get(node.id) ?? [])
          .map((id) => points.get(id)!)
          .filter(Boolean);
        const center = parents.length
          ? parents.reduce((sum, p) => sum + p.y + p.height / 2, 0) /
            parents.length
          : h / 2 + 40;
        const y = Math.max(bottom, center - h / 2);
        points.set(node.id, { x, y, width: w, height: h });
        bottom = y + h + 100;
        width = Math.max(width, w);
      }
      x += width + 160;
    }
    return {
      points,
      width: Math.max(700, x - 120),
      height: Math.max(
        400,
        ...[...points.values()].map((p) => p.y + p.height + 40),
      ),
    };
  }, [definition, run.steps, tracesById, heights, links]);
  const { viewport, canvas, zoom, zoomBy, fit, preserveCamera, focusArea } =
    useDiagramViewport(layout.width, layout.height, run.id);
  const onResize = useCallback(
    (id: string, height: number) => {
      preserveCamera();
      setHeights((previous) =>
        previous[id] === height ? previous : { ...previous, [id]: height },
      );
    },
    [preserveCamera],
  );
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    const first = layout.points.get(selected);
    if (first) {
      started.current = true;
      focusArea(first);
    }
  }, [layout, selected, focusArea]);
  const selectStep = (id: string) => {
    setSelected(id);
    const bounds = layout.points.get(id);
    if (bounds) focusArea(bounds);
  };
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
          <button disabled={!selected} onClick={() => selectStep(selected)}>
            Focus step
          </button>
        </div>
        <label>
          Step
          <select
            aria-label="Flow step"
            value={selected}
            onChange={(e) => selectStep(e.target.value)}
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
              (links.get(n.id) ?? []).map((id) => {
                const a = layout.points.get(id),
                  b = layout.points.get(n.id);
                if (!a || !b) return null;
                const active = ["running", "completed"].includes(
                  run.steps[n.id]?.status,
                );
                return (
                  <path
                    key={`${id}-${n.id}`}
                    d={`M${a.x + a.width},${a.y + a.height / 2} C${a.x + a.width + 80},${a.y + a.height / 2} ${b.x - 80},${b.y + b.height / 2} ${b.x},${b.y + b.height / 2}`}
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
            if (!p) return null;
            const captured = tracesById.get(run.steps[n.id]?.traceId ?? "");
            return n.kind === "jev" && captured ? (
              <RequestNode
                key={n.id}
                node={n}
                trace={captured}
                status={run.steps[n.id]?.status ?? "waiting"}
                selected={selected === n.id}
                x={p.x}
                y={p.y}
                onSelect={setSelected}
                onResize={onResize}
              />
            ) : (
              <Card
                key={n.id}
                node={n}
                status={run.steps[n.id]?.status ?? "waiting"}
                decision={run.steps[n.id]?.decision}
                selected={selected === n.id}
                bounds={p}
                onSelect={setSelected}
                dependencies={n.lanes ?? n.dependencies}
              />
            );
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
            {node.kind === "parallel" && (
              <p>
                These paths run at the same time:{" "}
                {(node.lanes ?? node.dependencies).join(", ")}. The next step
                starts only after all finish successfully. This marker waits for
                their results; it does not make another Jev request.
              </p>
            )}
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
            Each request diagram shows its context, question and answer. Use its
            question picker for other answers. Lines between requests show
            execution dependencies.
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
