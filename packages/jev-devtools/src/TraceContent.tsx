import type { AnswerView, Json } from "./protocol.js";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const percent = (value: number) => `${Math.round(value * 100)}%`;
export function findImage(value: Json): string | undefined {
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
export function JsonBlock({ value }: { value: unknown }) {
  return <pre>{pretty(value)}</pre>;
}
export function Answer({
  answer,
  image,
  legendOpen,
  onLegendToggle,
}: {
  answer?: AnswerView;
  image?: string;
  legendOpen: boolean;
  onLegendToggle: (open: boolean) => void;
}) {
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
        <details
          open={legendOpen}
          onToggle={(event) => onLegendToggle(event.currentTarget.open)}
        >
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
