import { memo, useMemo, useState } from "react";
import type { Json } from "./protocol.js";

const PAGE_SIZE = 12;
function TextValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = value.length > 140 || value.split("\n").length > 3;
  return (
    <span className="diagram-text-value">
      <span className={long && !expanded ? "diagram-text-preview" : undefined}>
        {value === "" ? (
          <span className="diagram-value-empty">empty string</span>
        ) : long && !expanded ? (
          `${value.slice(0, 140)}${value.length > 140 ? "…" : ""}`
        ) : (
          value
        )}
      </span>
      {long && (
        <button
          type="button"
          className="diagram-content-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Less text" : "Full text"}
        </button>
      )}
    </span>
  );
}
function Properties({ value }: { value: Json[] | { [key: string]: Json } }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const entries = useMemo(() => Object.entries(value), [value]);
  if (!entries.length)
    return (
      <span className="diagram-value-empty">
        {Array.isArray(value) ? "[] Empty array" : "{} Empty object"}
      </span>
    );
  return (
    <div className="diagram-properties">
      {entries.slice(0, visible).map(([name, child]) => (
        <Property key={name} name={name} value={child} />
      ))}
      {visible < entries.length && (
        <button
          type="button"
          className="diagram-content-toggle"
          onClick={() => setVisible((count) => count + PAGE_SIZE)}
        >
          Show {Math.min(PAGE_SIZE, entries.length - visible)} more (
          {entries.length - visible} remaining)
        </button>
      )}
      {visible > PAGE_SIZE && (
        <button
          type="button"
          className="diagram-content-toggle"
          onClick={() => setVisible(PAGE_SIZE)}
        >
          Fewer properties
        </button>
      )}
    </div>
  );
}
function Scalar({ value }: { value: Json | undefined }) {
  if (typeof value === "string") return <TextValue value={value} />;
  return (
    <span
      className={`diagram-value-${value === null || value === undefined ? "empty" : typeof value}`}
    >
      {value === undefined ? "Not captured" : String(value)}
    </span>
  );
}
function Property({ name, value }: { name: string; value: Json }) {
  const [expanded, setExpanded] = useState(false);
  const object = value !== null && typeof value === "object";
  if (!object)
    return (
      <div
        className={`diagram-property ${typeof value === "string" ? "diagram-property-text" : ""}`}
      >
        <span className="diagram-property-key">{name || '""'}</span>
        <Scalar value={value} />
      </div>
    );
  const count = Object.keys(value).length;
  return (
    <div className="diagram-property-group">
      <button
        type="button"
        className="diagram-property-disclosure"
        aria-label={`${expanded ? "Collapse" : "Expand"} ${name || '""'}`}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span aria-hidden="true" className="diagram-property-caret">
          {expanded ? "▾" : "▸"}
        </span>
        <span className="diagram-property-key">{name || '""'}</span>
        <span className="diagram-property-type">
          {Array.isArray(value) ? `[${count}]` : `{${count}}`}
        </span>
      </button>
      {expanded && (
        <div className="diagram-property-children">
          <Properties value={value} />
        </div>
      )}
    </div>
  );
}
/** Bounded, lazy property rendering inside a fixed-size diagram card. */
export const DiagramContent = memo(function DiagramContent({
  value,
  label,
}: {
  value: Json | undefined;
  label: string;
}) {
  return (
    <div
      className="diagram-content"
      data-diagram-scroll
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {value !== null && typeof value === "object" ? (
        <Properties value={value} />
      ) : (
        <Scalar value={value} />
      )}
    </div>
  );
});
