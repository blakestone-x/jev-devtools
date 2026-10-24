import { useEffect, useMemo, useRef, useState } from "react";
import type { FlowDefinition, FlowRun } from "./flow-protocol.js";
import type { Trace } from "./protocol.js";
import {
  flowFixture,
  hasCompletedJev,
  type BuiltFlowFixture,
} from "./flow-fixture.js";

type CopyResult = {
  built: BuiltFlowFixture;
  json: string;
  copied: boolean;
  status: FlowRun["status"];
};
export type FixtureCopy = {
  copy: () => void;
  disabled: boolean;
  result?: CopyResult;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;
function partial(status: FlowRun["status"]) {
  return status === "error"
    ? "Run failed. The fixture has completed Jev responses only."
    : status === "cancelled"
      ? "Run cancelled. The fixture has completed Jev responses only."
      : undefined;
}

export function useFixtureCopy(
  definition: FlowDefinition,
  run: FlowRun,
  traces: ReadonlyMap<string, Trace>,
): FixtureCopy {
  const [result, setResult] = useState<CopyResult>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const completed = useMemo(
    () => hasCompletedJev(definition, run),
    [definition, run],
  );
  const copy = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const built = flowFixture(definition, run, traces);
    const json = JSON.stringify(built.fixture, null, 2);
    let copied = false;
    try {
      await navigator.clipboard.writeText(json);
      copied = true;
    } catch {
      // Clipboard access can be refused; show the JSON for manual copying instead.
    }
    setResult({ built, json, copied, status: run.status });
    pending.current = false;
    setBusy(false);
  };
  return {
    copy: () => void copy(),
    disabled: busy || run.status === "pending" || !completed,
    result,
  };
}
export function CopyFixtureButton({ control }: { control: FixtureCopy }) {
  const [confirmation, setConfirmation] = useState<CopyResult>();
  useEffect(() => {
    setConfirmation(control.result?.copied ? control.result : undefined);
    if (!control.result?.copied) return;
    const timer = setTimeout(() => setConfirmation(undefined), 2000);
    return () => clearTimeout(timer);
  }, [control.result]);
  const copied = !!control.result?.copied && confirmation === control.result;
  return (
    <button
      className="flow-fixture-button"
      data-copied={copied || undefined}
      aria-live="polite"
      aria-atomic="true"
      disabled={control.disabled}
      onClick={control.copy}
    >
      {copied ? "Copied" : "Copy fixture"}
    </button>
  );
}
export function CopyFixtureReport({ control }: { control: FixtureCopy }) {
  const { result } = control;
  const note = result && partial(result.status);
  if (
    !result ||
    (result.copied && !note && !result.built.missing.length && !result.built.warnings.length)
  ) {
    return null;
  }
  return (
    <div className="flow-fixture">
      <div role="status">
        {!result.copied && (
          <p className="muted">Clipboard unavailable. Select the JSON below.</p>
        )}
        {result.built.missing.length > 0 && (
          <p className="warning">
            {plural(result.built.missing.length, "Jev response")} missing from the
            fixture.
          </p>
        )}
        {note && <p className="warning">{note}</p>}
        {result.built.warnings.length > 0 && (
          <p className="warning">
            Capture warnings: {result.built.warnings.join(" ")}
          </p>
        )}
      </div>
      {result.built.missing.length > 0 && (
        <details>
          <summary>Missing steps</summary>
          {/* Focusable so keyboard users can scroll a long list. */}
          <ul tabIndex={0} aria-label="Steps missing from the fixture">
            {result.built.missing.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </details>
      )}
      {!result.copied && (
        <textarea
          aria-label="Fixture JSON"
          readOnly
          value={result.json}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
