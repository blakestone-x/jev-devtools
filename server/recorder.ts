import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Image, TypeSafeClient } from "@typesafe-ai/sdk";
import type {
  Fetch,
  Questions,
  SystemOneRequest,
  RequestOptions,
} from "@typesafe-ai/sdk";
import type { Json, Trace } from "../src/protocol.js";

const secretKey =
  /^(authorization|cookie|set-cookie|api[-_]?key|password|secret|access[-_]?token|refresh[-_]?token)$/i;
const safeMessage = (value: string) =>
  value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
export type CaptureOptions = {
  limit?: number;
  redact?: (path: string[], value: unknown) => unknown;
};

// Snapshot before the caller can mutate its request. Bounded and cycle-safe;
// image handles become explicit previews/references instead of opaque SDK objects.
function capture(
  value: unknown,
  warnings: Set<string>,
  redact?: CaptureOptions["redact"],
): Json {
  const seen = new WeakSet<object>();
  let budget = 96_000;
  const visit = (input: unknown, path: string[], depth: number): Json => {
    if (secretKey.test(path.at(-1) || "")) return "[redacted]";
    if (redact) input = redact(path, input);
    budget -= 8 + (path.at(-1)?.length ?? 0);
    if (budget <= 0 || depth > 12) {
      warnings.add("Capture size/depth limit reached.");
      return "[truncated]";
    }
    if (input === null || input === undefined) return null;
    if (typeof input === "string") {
      const text = input.slice(0, Math.min(budget, 16_000));
      budget -= text.length;
      if (text.length < input.length)
        warnings.add("Long text truncated in capture.");
      return text;
    }
    if (typeof input === "boolean") return input;
    if (typeof input === "number")
      return Number.isFinite(input) ? input : String(input);
    if (typeof input !== "object") return String(input);
    if (seen.has(input)) return "[circular/repeated reference]";
    seen.add(input);
    if (input instanceof Image) {
      const bytes = input.data,
        result: { [key: string]: Json } = {
          kind: "image",
          ref: String(input),
          bytes: bytes instanceof Blob ? bytes.size : bytes.byteLength,
        };
      if (
        bytes instanceof Uint8Array &&
        bytes.byteLength < 48_000 &&
        budget > bytes.byteLength * 1.4
      ) {
        const format =
          bytes[0] === 137 && bytes[1] === 80
            ? "png"
            : bytes[0] === 255 && bytes[1] === 216
              ? "jpeg"
              : null;
        if (format) {
          result.preview = `data:image/${format};base64,${Buffer.from(bytes).toString("base64")}`;
          budget -= bytes.byteLength * 1.4;
        }
      }
      if (!result.preview)
        warnings.add(
          "Image preview omitted (Blob, unsupported format, or size limit).",
        );
      return result;
    }
    if (Array.isArray(input)) {
      if (input.length > 150)
        warnings.add("Long collection truncated in capture.");
      return input
        .slice(0, 150)
        .map((v, i) => visit(v, [...path, String(i)], depth + 1));
    }
    const entries = Object.entries(input);
    if (entries.length > 150)
      warnings.add("Long collection truncated in capture.");
    return Object.fromEntries(
      entries
        .slice(0, 150)
        .map(([key, v]) => [key, visit(v, [...path, key], depth + 1)]),
    );
  };
  return visit(value, [], 0);
}

export class JevRecorder {
  private traces = new Map<string, Trace>();
  private listeners = new Set<() => void>();
  private context = new AsyncLocalStorage<string>();
  private limit: number;
  constructor(private options: CaptureOptions = {}) {
    this.limit = Math.max(1, Math.min(200, options.limit ?? 50));
  }
  snapshot(session: string) {
    return structuredClone(
      [...this.traces.values()].filter((t) => t.session === session).reverse(),
    );
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  clear(session: string) {
    for (const [id, t] of this.traces)
      if (t.session === session) this.traces.delete(id);
    this.notify();
  }
  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* Observers must not affect inference. */
      }
    }
  }
  private update(id: string, update: (trace: Trace) => void) {
    const t = this.traces.get(id);
    if (t) {
      update(t);
      this.notify();
    }
  }

  // Use this in TypeSafeClient's supported `fetch` option. It observes attempts
  // only and returns the original Response without reading or changing its body.
  transport(fetcher: Fetch): Fetch {
    return async (url, init) => {
      const id = this.context.getStore();
      if (!id) return fetcher(url, init);
      const attempt = {
          number: (this.traces.get(id)?.attempts.length ?? 0) + 1,
        } as Trace["attempts"][number],
        started = performance.now();
      this.update(id, (t) => {
        t.attempts.push(attempt);
      });
      try {
        const response = await fetcher(url, init);
        this.update(id, () => {
          attempt.durationMs = performance.now() - started;
          attempt.status = response.status;
        });
        return response;
      } catch (error) {
        this.update(id, () => {
          attempt.durationMs = performance.now() - started;
          attempt.error =
            error instanceof Error ? error.name : "TransportError";
        });
        throw error;
      }
    };
  }

  // Preserve the SDK's original APIPromise (including map/withResponse/asResponse)
  // and method receiver. The inspector reads a clone, never the caller's body.
  instrument<T extends TypeSafeClient>(
    client: T,
    meta:
      | { session: string; label: string; source: "sample" | "live" }
      | (() => { session: string; label: string; source: "sample" | "live" }),
  ): T {
    return new Proxy(client, {
      get: (target, property) => {
        if (property !== "systemOne") {
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (
          request: SystemOneRequest<Questions>,
          options?: RequestOptions,
        ) => {
          const id = randomUUID(),
            started = performance.now(),
            warnings = new Set<string>();
          let captured: Trace["request"];
          try {
            captured = capture(
              { ...request, model: request.model ?? client.defaultModel },
              warnings,
              this.options.redact,
            ) as Trace["request"];
          } catch {
            captured = {
              model: client.defaultModel,
              state: "[capture unavailable]",
              questions: {},
            };
            warnings.add("Input snapshot failed; request continues normally.");
          }
          this.traces.set(id, {
            version: 1,
            id,
            ...(typeof meta === "function" ? meta() : meta),
            startedAt: Date.now(),
            status: "pending",
            request: captured,
            attempts: [],
            captureWarnings: [...warnings],
          });
          while (this.traces.size > this.limit)
            this.traces.delete(this.traces.keys().next().value!);
          this.notify();
          const fail = (error: unknown) =>
            this.update(id, (t) => {
              const e = error as {
                name?: string;
                message?: string;
                status?: number;
                requestId?: string;
              };
              t.status = e.name === "APIUserAbortError" ? "cancelled" : "error";
              t.durationMs = performance.now() - started;
              t.error = {
                name: e.name || "Error",
                message: safeMessage(e.message || "Request failed"),
                status: e.status,
              };
              t.requestId = e.requestId;
            });
          try {
            const promise = this.context.run(id, () =>
              target.systemOne(request, options),
            );
            void promise
              .asResponse()
              .then(async (response) => {
                const data = await response.clone().json();
                this.update(id, (t) => {
                  t.status = "success";
                  t.durationMs = performance.now() - started;
                  t.requestId =
                    response.headers.get("x-typesafe-request-id") ?? undefined;
                  t.result = capture(
                    data,
                    warnings,
                    this.options.redact,
                  ) as Trace["result"];
                  t.captureWarnings = [...warnings];
                });
              }, fail)
              .catch((error) => {
                fail(error);
              });
            return promise;
          } catch (error) {
            fail(error);
            throw error;
          }
        };
      },
    });
  }
}
