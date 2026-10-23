import { useEffect, useRef, useState } from "react";
import type { AnswerView, Trace } from "./protocol.js";
import { findImage, flowAnswer, stateText } from "./flow-model.js";
const pct = (v: number) => `${Math.round(v * 100)}%`;
function Result({ answer, image }: { answer?: AnswerView; image?: string }) {
  if (!answer) return <p className="lab-copy">No answer received.</p>;
  return (
    <>
      {answer.probabilities &&
        Object.entries(answer.probabilities).map(([key, value]) => (
          <div className="lab-probability" key={key}>
            <div>
              <span
                title={
                  typeof answer.legend?.[key] === "string"
                    ? (answer.legend[key] as string)
                    : key
                }
              >
                {answer.type === "score" && answer.legend?.[key]
                  ? `${key} · ${answer.legend[key]}`
                  : key}
              </span>
              <code>{pct(value)}</code>
            </div>
            <div className="lab-track">
              <i
                className={
                  answer.type === "choice" && answer.choice !== key
                    ? "lab-alternative"
                    : ""
                }
                style={{ width: pct(Math.max(0, Math.min(1, value))) }}
              />
            </div>
          </div>
        ))}
      {answer.choice !== undefined && (
        <p className="lab-result">Selected: {answer.choice}</p>
      )}
      {answer.score !== undefined && (
        <>
          <p className="lab-result">Score {answer.score.toFixed(2)}</p>
          <div className="lab-scale">
            <span
              style={{
                left: pct(
                  Math.max(
                    0,
                    Math.min(
                      1,
                      answer.score /
                        Math.max(
                          1,
                          Object.keys(answer.probabilities ?? {}).length - 1,
                        ),
                    ),
                  ),
                ),
              }}
            />
            {Object.keys(answer.probabilities ?? {}).map((k) => (
              <small key={k}>{k}</small>
            ))}
          </div>
        </>
      )}
      {answer.noul !== undefined && (
        <>
          <strong className="lab-big">{pct(answer.noul)}</strong>
          <p className="lab-small">probability of true</p>
          <div className="lab-track">
            <i style={{ width: pct(answer.noul) }} />
          </div>
          <div className="lab-endpoints">
            <span>False</span>
            <span>True</span>
          </div>
        </>
      )}
      {answer.box && (
        <>
          <div className="lab-image">
            {image ? (
              <img src={image} alt="Captured image with returned Box overlay" />
            ) : (
              <p>Image preview unavailable</p>
            )}
            {image && (
              <div
                className="lab-box"
                style={{
                  left: pct(answer.box.left),
                  top: pct(answer.box.top),
                  width: pct(answer.box.right - answer.box.left),
                  height: pct(answer.box.bottom - answer.box.top),
                }}
              />
            )}
          </div>
          <p className="lab-small lab-coordinates">
            left {answer.box.left.toFixed(2)} · top {answer.box.top.toFixed(2)}
            <br />
            right {answer.box.right.toFixed(2)} · bottom{" "}
            {answer.box.bottom.toFixed(2)}
          </p>
        </>
      )}
      {answer.confidence !== undefined && (
        <p className="lab-small">Confidence {pct(answer.confidence)}</p>
      )}
    </>
  );
}
export function TraceDiagram({ trace }: { trace: Trace }) {
  const [selected, setSelected] = useState(""),
    [zoom, setZoom] = useState(0.8),
    [flow, setFlow] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const entries = Object.entries(trace.request.questions ?? {}).filter(
      ([, q]) => q && typeof q === "object" && typeof q.type === "string",
    ),
    [key, question] = entries.find(([key]) => key === selected) ??
      entries[0] ?? ["", undefined];
  const answer = trace.result?.answers[key],
    image =
      findImage(trace.request.state) ||
      (trace.request.assets ? findImage(trace.request.assets) : undefined),
    outputs = flowAnswer(answer);
  const resultHeight = Math.max(
    280,
    166 +
      Object.keys(answer?.probabilities ?? {}).length * 44 +
      (answer?.score !== undefined ? 50 : 0),
    answer?.box ? 390 : 0,
  );
  const height = Math.max(520, resultHeight + 90, outputs.length * 136 + 60),
    ry = Math.max(40, (height - resultHeight) / 2),
    mid = ry + resultHeight / 2;
  const fit = () => {
    if (viewport.current)
      setZoom(Math.min(1, (viewport.current.clientWidth - 24) / 1120));
  };
  useEffect(() => {
    if (viewport.current)
      setZoom(
        Math.min(1, Math.max(0.75, (viewport.current.clientWidth - 24) / 1120)),
      );
  }, []);
  if (!question)
    return <p className="muted">No questions available in this capture.</p>;
  const sourcePath = (y: number) => `M260 ${y} C325 ${y},325 ${mid},390 ${mid}`;
  const paths = [
    { id: "state", d: sourcePath(122), active: true },
    { id: "question", d: sourcePath(378), active: true },
    ...outputs.map((output, i) => ({
      id: `output-${i}`,
      d: `M710 ${mid} C790 ${mid},790 ${92 + i * 136},870 ${92 + i * 136}`,
      active: output.active,
    })),
  ];
  return (
    <div className="lab-flow">
      <div className="lab-flow-toolbar">
        <label>
          Question
          <select
            aria-label="Diagram question"
            value={key}
            onChange={(event) => setSelected(event.target.value)}
          >
            {entries.map(([name, q]) => (
              <option key={name} value={name}>
                {name} · {q.type}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button
            aria-label="Zoom diagram out"
            onClick={() => setZoom((v) => Math.max(0.4, v - 0.1))}
          >
            −
          </button>
          <output aria-label="Diagram zoom">{Math.round(zoom * 100)}%</output>
          <button
            aria-label="Zoom diagram in"
            onClick={() => setZoom((v) => Math.min(1.5, v + 0.1))}
          >
            +
          </button>
          <button onClick={fit}>Fit</button>
          <button aria-pressed={flow} onClick={() => setFlow(!flow)}>
            {flow ? "Pause flow" : "Play flow"}
          </button>
        </div>
      </div>
      <div
        className="lab-flow-viewport"
        ref={viewport}
        tabIndex={0}
        aria-label="Jev diagram, scroll to explore"
      >
        <div style={{ width: 1120 * zoom, height: height * zoom }}>
          <div
            className="lab-flow-canvas"
            style={{ width: 1120, height, transform: `scale(${zoom})` }}
          >
            <svg
              className="lab-connections"
              width="1120"
              height={height}
              aria-hidden="true"
            >
              {paths.map((path) => (
                <g key={path.id}>
                  <path d={path.d} className={path.active ? "active" : ""} />
                  {flow &&
                    path.active &&
                    !["error", "cancelled"].includes(trace.status) && (
                      <circle r="3" className="lab-flow-dot">
                        <animateMotion
                          dur="3.2s"
                          repeatCount="indefinite"
                          path={path.d}
                        />
                      </circle>
                    )}
                </g>
              ))}
              <text x="305" y={mid - 65}>
                state
              </text>
              <text x="300" y={mid + 65}>
                question
              </text>
            </svg>
            <article
              className="lab-card"
              style={{ left: 20, top: 32, width: 240, height: 180 }}
            >
              <span className="lab-eyebrow">
                {image ? "IMAGE STATE" : "STATE"}
              </span>
              <h3>Shared context</h3>
              {image ? (
                <img
                  className="lab-source-image"
                  src={image}
                  alt="Captured image state"
                />
              ) : (
                <p className="lab-copy" title={stateText(trace)}>
                  {stateText(trace)}
                </p>
              )}
            </article>
            <article
              className="lab-card"
              style={{ left: 20, top: 288, width: 240, height: 180 }}
            >
              <span className="lab-eyebrow">INSTRUCTIONS</span>
              <h3>Question · {question.type}</h3>
              <p
                className="lab-copy"
                title={
                  typeof question.instructions === "string"
                    ? question.instructions
                    : JSON.stringify(question.instructions)
                }
              >
                {typeof question.instructions === "string"
                  ? question.instructions
                  : JSON.stringify(question.instructions)}
              </p>
            </article>
            <article
              className="lab-card lab-answer-card"
              style={{
                left: 390,
                top: ry,
                width: 320,
                minHeight: resultHeight,
              }}
            >
              <span className="lab-eyebrow">
                JEV · {question.type.toUpperCase()}
              </span>
              <h3 title={key}>{key}</h3>
              <Result answer={answer} image={image} />
            </article>
            {outputs.map((output, i) => (
              <article
                key={i}
                className={`lab-card lab-output ${output.active ? "" : "lab-idle"}`}
                style={{
                  left: 870,
                  top: 40 + i * 136,
                  width: 230,
                  minHeight: 104,
                }}
              >
                <span className="lab-eyebrow">{output.eyebrow}</span>
                <h3 title={output.label}>{output.label}</h3>
                <p>{output.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
      <p className="muted">
        {entries.length} parallel question{entries.length === 1 ? "" : "s"} in
        one request. Connections show data flow, not model timing. Application
        routes and thresholds are not captured. Full inputs and criteria are in
        Questions and Context.
      </p>
    </div>
  );
}
