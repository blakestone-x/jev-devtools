import type {
  FlowDefinition,
  FlowRun,
  FlowUpdate,
} from "../src/flow-protocol.js";
import { capture, type CaptureOptions } from "./recorder.js";
/** Independent bounded run store. Definitions are retained only while referenced. */
export class FlowRecorder {
  private runs = new Map<string, FlowRun>();
  private definitions = new Map<string, FlowDefinition>();
  private sessions = new Map<string, string>();
  private definitionRevisions = new Map<string, number>();
  private revisions = new Map<string, number>();
  private revision = 0;
  private listeners = new Set<(sessions: Set<string>) => void>();
  constructor(private options: CaptureOptions) {}
  subscribe(fn: (sessions: Set<string>) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private notify(sessions: Set<string>) {
    for (const fn of this.listeners) {
      try {
        fn(sessions);
      } catch {}
    }
  }
  start(definition: FlowDefinition, run: FlowRun, session: string) {
    if (!this.definitions.has(definition.id)) {
      const stored = structuredClone(definition);
      for (const node of stored.nodes) {
        if (node.conditionRule === undefined) continue;
        try {
          node.conditionRule = capture(
            node.conditionRule,
            new Set(),
            this.options.redact
              ? (path, value) =>
                  this.options.redact!(["conditions", node.id, ...path], value)
              : undefined,
          );
        } catch {
          node.conditionRule = "[rule capture unavailable]";
        }
      }
      this.definitions.set(definition.id, stored);
      this.definitionRevisions.set(definition.id, ++this.revision);
    }
    this.runs.set(run.id, run);
    this.sessions.set(run.id, session);
    this.revisions.set(run.id, ++this.revision);
    const sessions = new Set([session]);
    const limit = Math.max(1, Math.min(200, this.options.limit ?? 50));
    while (this.runs.size > limit) {
      const id = this.runs.keys().next().value!;
      sessions.add(this.sessions.get(id)!);
      this.remove(id);
    }
    this.prune();
    this.notify(sessions);
  }
  update(run: FlowRun) {
    if (!this.runs.has(run.id)) return; // Clear/eviction cannot resurrect pending runs.
    const stored = { ...run };
    if ("value" in stored) {
      try {
        stored.value = capture(stored.value, new Set(), this.options.redact);
      } catch {
        stored.value = "[capture unavailable]";
      }
    }
    this.runs.set(run.id, stored);
    this.revisions.set(run.id, ++this.revision);
    this.notify(new Set([this.sessions.get(run.id)!]));
  }
  private remove(id: string) {
    this.runs.delete(id);
    this.sessions.delete(id);
    this.revisions.delete(id);
  }
  private prune() {
    const used = new Set([...this.runs.values()].map((r) => r.definitionId));
    for (const id of this.definitions.keys())
      if (!used.has(id)) {
        this.definitions.delete(id);
        this.definitionRevisions.delete(id);
      }
  }
  clear(session: string) {
    for (const id of this.runs.keys())
      if (this.sessions.get(id) === session) this.remove(id);
    this.prune();
    this.revision++;
    this.notify(new Set([session]));
  }
  changes(
    session: string,
    cursor?: number,
  ): { revision: number; data: FlowUpdate } {
    const current = [...this.runs.values()]
      .filter((r) => this.sessions.get(r.id) === session)
      .reverse();
    const used = new Set(current.map((r) => r.definitionId));
    return {
      revision: this.revision,
      data: structuredClone({
        version: 1,
        definitions: [...used]
          .filter(
            (id) =>
              cursor === undefined ||
              this.definitionRevisions.get(id)! > cursor,
          )
          .map((id) => this.definitions.get(id)!),
        upserts: current.filter(
          (r) => cursor === undefined || this.revisions.get(r.id)! > cursor,
        ),
        order: current.map((r) => r.id),
      }),
    };
  }
}
