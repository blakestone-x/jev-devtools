import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { JevDevtools } from "@diagram-motion-lab/jev-devtools";
import { ScenarioResult, type RunState } from "./ScenarioResult";
import { sampleProfiles, type SampleProfile } from "./sample-profiles";
import { Button } from "./components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "./components/ui/native-select";
import { Textarea } from "./components/ui/textarea";
import { Label } from "./components/ui/label";
import { ArrowRight, LoaderCircle } from "lucide-react";
import "./controls.css";
import "@diagram-motion-lab/jev-devtools/styles.css";
import "./style.css";

const savedSession = sessionStorage.getItem("jev-inspector-session");
const session = savedSession || crypto.randomUUID();
sessionStorage.setItem("jev-inspector-session", session);
const endpoint = (path: string) => `/__jev/${path}?session=${session}`;
class RunError extends Error {
  constructor(
    message: string,
    public cancelled = false,
  ) {
    super(message);
  }
}
async function post(path: string, body: unknown = {}) {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new RunError(data.error || "Request failed", data.cancelled === true);
  return data;
}
function App() {
  const [profile, setProfile] = useState<SampleProfile>("billing");
  const [outcome, setOutcome] = useState<RunState>({
    id: "initial",
    status: "idle",
    scenario: "triage",
    mode: "sample",
    message: "",
  });
  const resetOutcome = () => {
    setOutcome({ id: "idle", status: "idle", scenario, mode, message });
    setFeedback("Ready to capture a request.");
  };
  const [scenario, setScenario] = useState("triage"),
    [mode, setMode] = useState("sample"),
    [live, setLive] = useState(false);
  const [message, setMessage] = useState(
    "I was charged twice and checkout is blocked. I need a human to help me today.",
  );
  const [runId, setRunId] = useState<string>(),
    [feedback, setFeedback] = useState("Ready to capture a request.");
  useEffect(() => {
    void fetch(endpoint("config"))
      .then((r) => r.json())
      .then((c) => setLive(c.liveAvailable))
      .catch(() => setFeedback("Cannot connect to the local recorder."));
  }, []);
  async function run() {
    const id = crypto.randomUUID();
    const started = performance.now();
    const captured = { id, scenario, mode, message };
    setOutcome({ ...captured, status: "pending" });
    setRunId(id);
    setFeedback("Request running…");
    try {
      const data = await post("run", {
        runId: id,
        scenario,
        mode,
        message,
        profile,
      });
      setOutcome({
        ...captured,
        status: "success",
        result: data.result,
        elapsedMs: Math.round(performance.now() - started),
      });
      setFeedback("Response ready. Explore the result below.");
    } catch (e) {
      setOutcome({
        ...captured,
        status: e instanceof RunError && e.cancelled ? "cancelled" : "error",
        error: e instanceof Error ? e.message : "Request failed",
      });
      setFeedback(
        `${e instanceof Error ? e.message : "Request failed"}. See the inspector for details.`,
      );
    } finally {
      setRunId(undefined);
    }
  }
  return (
    <>
      <main className="playground dark">
        <section className="run-form" aria-label="Request playground">
          <div className="form-row">
            <div className="form-field scenario-field">
              <Label htmlFor="scenario">Scenario</Label>
              <NativeSelect
                id="scenario"
                className="w-full"
                value={scenario}
                disabled={!!runId}
                onChange={(e) => {
                  setScenario(e.target.value);
                  resetOutcome();
                  if (["retry", "error"].includes(e.target.value))
                    setMode("sample");
                }}
              >
                <NativeSelectOption value="triage">
                  Support triage · Choice, Score, Noul
                </NativeSelectOption>
                <NativeSelectOption value="image">
                  Locate a mug · Box, Noul
                </NativeSelectOption>
                <NativeSelectOption value="retry">
                  Rate limit → retry
                </NativeSelectOption>
                <NativeSelectOption value="error">
                  Failed request
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="form-field">
              <Label htmlFor="transport">Transport</Label>
              <NativeSelect
                id="transport"
                className="w-full"
                value={mode}
                disabled={!!runId}
                onChange={(e) => {
                  setMode(e.target.value);
                  resetOutcome();
                }}
              >
                <NativeSelectOption value="sample">Sample</NativeSelectOption>
                <NativeSelectOption
                  value="live"
                  disabled={!live || ["retry", "error"].includes(scenario)}
                >
                  Live{!live ? " · no server key" : ""}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            {mode === "sample" && scenario !== "image" && (
              <div className="form-field">
                <Label htmlFor="sample-outcome">Sample outcome</Label>
                <NativeSelect
                  id="sample-outcome"
                  className="w-full"
                  value={profile}
                  disabled={!!runId}
                  onChange={(e) => {
                    const key = e.target.value as SampleProfile;
                    setProfile(key);
                    setMessage(sampleProfiles[key].message);
                    resetOutcome();
                  }}
                >
                  {Object.entries(sampleProfiles).map(([key, fixture]) => (
                    <NativeSelectOption key={key} value={key}>
                      {fixture.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
          {scenario === "image" ? (
            <div className="image-input">
              <img
                src="/mug.png"
                alt="Sample illustration of a pink mug and a book"
              />
              <p>Find the mug and estimate whether a mug is present.</p>
            </div>
          ) : (
            <div className="form-field context-field">
              <Label htmlFor="context">Context</Label>
              <Textarea
                id="context"
                className="min-h-32 resize-y"
                disabled={!!runId}
                maxLength={8000}
                value={message}
                aria-describedby="sample-note"
                onChange={(e) => {
                  setMessage(e.target.value);
                  resetOutcome();
                }}
              />
            </div>
          )}
          <div className="run-actions">
            <Button disabled={!!runId} onClick={() => void run()}>
              {runId ? (
                <>
                  <LoaderCircle
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />{" "}
                  Running…
                </>
              ) : (
                <>
                  {mode === "sample" ? "Run sample" : "Run live query"}
                  <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
            {runId && (
              <Button
                variant="outline"
                onClick={() =>
                  void post("cancel", { runId }).catch((e) =>
                    setFeedback(e.message),
                  )
                }
              >
                Cancel
              </Button>
            )}
            <span role="status">{feedback}</span>
          </div>
          <p id="sample-note" className="sample-note">
            {mode === "sample"
              ? "Fixed sample answers, including when you edit context. No external API calls."
              : "Live inference uses your server key and may incur API charges."}
          </p>
        </section>
        {outcome.status !== "idle" && <ScenarioResult run={outcome} />}
      </main>
      <JevDevtools
        enabled={import.meta.env.DEV}
        endpoint="/api/jev-devtools"
        defaultOpen={false}
      />
    </>
  );
}
export function mount() {
  createRoot(document.getElementById("root")!).render(<App />);
}
