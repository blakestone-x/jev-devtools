import type { Trace } from "./protocol.js";

const revision = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function traces(value: unknown): Trace[] {
  if (!Array.isArray(value) || value.length > 200)
    throw new Error("Invalid traces");
  const ids = new Set<string>();
  for (const trace of value) {
    if (
      !trace ||
      trace.version !== 1 ||
      typeof trace.id !== "string" ||
      !trace.id ||
      ids.has(trace.id)
    )
      throw new Error("Invalid trace ID");
    ids.add(trace.id);
  }
  return value;
}

// Owned by one EventSource connection. Unchanged trace objects keep their
// identity; validate the complete update before replacing any current state.
export class TraceStore {
  private current: Trace[] = [];
  private revision: number | undefined;
  apply(event: "snapshot" | "delta", input: unknown): Trace[] {
    if (!input || typeof input !== "object") throw new Error("Invalid update");
    const data = input as Record<string, unknown>;
    if (event === "snapshot") {
      if (data.version !== 1 && data.version !== 2)
        throw new Error("Unsupported stream");
      if (data.version === 2 && !revision(data.revision))
        throw new Error("Invalid revision");
      const next = traces(data.traces);
      this.current = next;
      this.revision =
        data.version === 2 ? (data.revision as number) : undefined;
      return next;
    }
    if (
      data.version !== 2 ||
      this.revision === undefined ||
      data.base !== this.revision ||
      !revision(data.revision) ||
      data.revision <= this.revision
    )
      throw new Error("Inspector stream needs a fresh snapshot");
    if (
      !Array.isArray(data.order) ||
      data.order.length > 200 ||
      data.order.some((id) => typeof id !== "string") ||
      new Set(data.order).size !== data.order.length
    )
      throw new Error("Invalid retained order");
    const order = data.order as string[];
    const retained = new Set(order);
    const upserts = traces(data.upserts);
    if (upserts.some((t) => !retained.has(t.id)))
      throw new Error("Unexpected upsert");
    const byId = new Map(this.current.map((t) => [t.id, t]));
    for (const trace of upserts) byId.set(trace.id, trace);
    const next = order.map((id) => {
      const trace = byId.get(id);
      if (!trace) throw new Error("Missing retained trace");
      return trace;
    });
    this.current = next;
    this.revision = data.revision;
    return next;
  }
}
