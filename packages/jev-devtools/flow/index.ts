import { randomUUID } from "node:crypto";
import type {
  Questions,
  ResultFor,
  SystemOneRequest,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import type {
  FlowDefinition,
  FlowNode,
  FlowRun,
  FlowStep,
} from "../src/flow-protocol.js";
export type {
  FlowDefinition,
  FlowRun,
  FlowStep,
} from "../src/flow-protocol.js";

type Ast =
  | { op: "input" }
  | { op: "ref"; id: string }
  | { op: "get"; from: Ast; key: string }
  | { op: "literal"; value: unknown }
  | { op: "eq" | "lt" | "gte" | "all" | "any" | "not"; args: Ast[] };
const owners = new WeakMap<object, object>();
function freezeAst(ast: Ast, depth = 0): void {
  if (depth > 80) throw new Error("Expression nesting exceeds 80");
  if (Object.isFrozen(ast)) return;
  if (ast.op === "get") freezeAst(ast.from, depth + 1);
  if ("args" in ast) {
    if (ast.args.length > 256) throw new Error("Too many condition operands");
    for (const child of ast.args) freezeAst(child, depth + 1);
    Object.freeze(ast.args);
  }
  Object.freeze(ast);
}
/** Inspectable expression, not an application callback. Use get() for input fields. */
export class FlowExpression<T> {
  declare private readonly valueType: T;
  constructor(
    readonly ast: Ast,
    owner?: object,
  ) {
    if (owner) owners.set(this, owner);
    freezeAst(ast);
    Object.freeze(this);
  }
  get<K extends keyof T & (string | number)>(key: K): FlowExpression<T[K]> {
    return expression({ op: "get", from: this.ast, key: String(key) }, [this]);
  }
  eq(value: T | FlowExpression<T>): FlowExpression<boolean> {
    return operation("eq", [this, value]);
  }
  lt(
    this: FlowExpression<number>,
    value: number | FlowExpression<number>,
  ): FlowExpression<boolean> {
    return operation("lt", [this, value]);
  }
  gte(
    this: FlowExpression<number>,
    value: number | FlowExpression<number>,
  ): FlowExpression<boolean> {
    return operation("gte", [this, value]);
  }
}
function expression<T>(ast: Ast, values: unknown[]): FlowExpression<T> {
  const tokens = new Set(
    values
      .filter((v) => v instanceof FlowExpression)
      .map((v) => owners.get(v as object))
      .filter(Boolean),
  );
  if (tokens.size > 1) throw new Error("References belong to different flows");
  return new FlowExpression<T>(ast, tokens.values().next().value);
}
function operation(
  op: "eq" | "lt" | "gte" | "all" | "any" | "not",
  args: unknown[],
): FlowExpression<boolean> {
  return expression(
    {
      op,
      args: args.map((v) =>
        v instanceof FlowExpression ? v.ast : { op: "literal", value: v },
      ),
    },
    args,
  );
}
export const all = (...conditions: FlowExpression<boolean>[]) =>
  operation("all", conditions);
export const any = (...conditions: FlowExpression<boolean>[]) =>
  operation("any", conditions);
export const not = (condition: FlowExpression<boolean>) =>
  operation("not", [condition]);
export type FlowOutcome = { outcome: string; value?: unknown };
type AnswerRefs<Q extends Questions> = {
  answer<K extends keyof Q & string>(
    name: K,
  ): { [F in keyof ResultFor<Q[K]>]: FlowExpression<ResultFor<Q[K]>[F]> };
};
type Request<Q extends Questions> = Omit<SystemOneRequest<Q>, "state"> & {
  state: unknown;
};
type Block = { nodes: Step[]; result?: FlowExpression<unknown> };
type Step = {
  id: string;
  kind: FlowNode["kind"];
  request?: Request<Questions>;
  when?: FlowExpression<boolean>;
  then?: Block;
  else?: Block;
  lanes?: Record<string, Block>;
  value?: unknown;
  outcome?: string;
};
/** Observer contract used by createJevDevtools; execution never depends on successful recording. */
export type FlowObserver = {
  startFlow(
    definition: FlowDefinition,
    run: FlowRun,
  ):
    | {
        update(run: FlowRun): void;
        request<T>(
          link: { runId: string; stepId: string; executionId: string },
          onTrace: (id: string) => void,
          callback: () => T,
        ): T;
      }
    | undefined;
};
export type FlowRunOptions = {
  client: Pick<TypeSafeClient, "systemOne">;
  devtools?: FlowObserver;
  signal?: AbortSignal;
};
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === "object" &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);
function mapValue(
  value: unknown,
  ref: (expr: FlowExpression<unknown>) => unknown,
  seen = new Set<object>(),
  depth = 0,
): unknown {
  if (depth > 40) throw new Error("Flow value nesting exceeds 40");
  if (value instanceof FlowExpression) return ref(value);
  if (typeof value === "function")
    throw new Error("Flow values cannot contain callbacks");
  if (!Array.isArray(value) && !plain(value)) return value; // Preserve SDK assets.
  if (seen.has(value)) throw new Error("Cyclic flow value");
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((v) => mapValue(v, ref, seen, depth + 1))
    : Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          mapValue(v, ref, seen, depth + 1),
        ]),
      );
  seen.delete(value);
  return result;
}
const inspectAst = (ast: Ast, ref: (id: string) => void): void => {
  if (ast.op === "ref") ref(ast.id);
  else if (ast.op === "get") inspectAst(ast.from, ref);
  else if ("args" in ast) ast.args.forEach((a) => inspectAst(a, ref));
};
function describe(ast: Ast): string {
  if (ast.op === "input") return "input";
  if (ast.op === "ref") return ast.id;
  if (ast.op === "get") return `${describe(ast.from)}.${ast.key}`;
  if (ast.op === "literal") return "[literal]";
  return `${ast.op}(${ast.args.map(describe).join(", ")})`;
}
function evaluate(
  ast: Ast,
  input: unknown,
  values: Map<string, unknown>,
): unknown {
  if (ast.op === "input") return input;
  if (ast.op === "literal") return ast.value;
  if (ast.op === "ref") {
    if (!values.has(ast.id)) throw new Error(`Unavailable result: ${ast.id}`);
    return values.get(ast.id);
  }
  if (ast.op === "get") {
    const obj = evaluate(ast.from, input, values);
    if (
      obj === null ||
      typeof obj !== "object" ||
      !Object.hasOwn(obj, ast.key) ||
      (obj as Record<string, unknown>)[ast.key] === undefined
    )
      throw new Error(`Missing value: ${describe(ast)}`);
    return (obj as Record<string, unknown>)[ast.key];
  }
  // Evaluate every operand: a missing value must never hide behind short-circuiting.
  const args = ast.args.map((a) => evaluate(a, input, values));
  if (ast.op === "all" || ast.op === "any" || ast.op === "not") {
    if (args.some((v) => typeof v !== "boolean"))
      throw new Error("Boolean condition required");
    return ast.op === "not"
      ? !args[0]
      : ast.op === "all"
        ? args.every(Boolean)
        : args.some(Boolean);
  }
  const [a, b] = args;
  if (ast.op === "eq") {
    if (
      a === undefined ||
      b === undefined ||
      (a !== null && !["string", "number", "boolean"].includes(typeof a)) ||
      typeof a !== typeof b ||
      (typeof a === "number" && (!Number.isFinite(a) || !Number.isFinite(b)))
    )
      throw new Error("eq requires matching scalar values");
    return a === b;
  }
  if (
    typeof a !== "number" ||
    typeof b !== "number" ||
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  )
    throw new Error("Numeric comparison requires finite numbers");
  return ast.op === "lt" ? a < b : a >= b;
}

export interface FlowBuilder<T> {
  readonly input: FlowExpression<T>;
  jev<const Q extends Questions>(
    id: string,
    request: Request<Q>,
  ): AnswerRefs<Q>;
  /** Terminal decision: each callback must return output() or another branch(). */
  branch(
    id: string,
    paths: {
      when: FlowExpression<boolean>;
      then: (path: FlowBuilder<T>) => FlowExpression<FlowOutcome>;
      else: (path: FlowBuilder<T>) => FlowExpression<FlowOutcome>;
    },
  ): FlowExpression<FlowOutcome>;
  parallel<
    const B extends Record<
      string,
      (lane: FlowBuilder<T>) => FlowExpression<unknown>
    >,
  >(
    id: string,
    lanes: B,
  ): { [K in keyof B]: ReturnType<B[K]> };
  output(name: string, value?: unknown): FlowExpression<FlowOutcome>;
}
export function defineJevFlow<T>(
  name: string,
  build: (flow: FlowBuilder<T>) => FlowExpression<FlowOutcome>,
) {
  const owner = {},
    ids = new Set<string>(),
    nodes: FlowNode[] = [];
  const input = new FlowExpression<T>({ op: "input" }, owner);
  let building = true;
  let activeBlock: object | undefined;
  function block(
    callback: (builder: FlowBuilder<T>) => FlowExpression<unknown>,
    available: Set<string>,
    path: string[],
    previous: string[] = [],
    depth = 0,
    requireOutcome = false,
  ): Block {
    if (depth > 16) throw new Error("Flow nesting exceeds 16");
    const token = {};
    const result: Block = { nodes: [] };
    let terminal = false;
    const validate = (value: unknown) =>
      mapValue(value, (expr) => {
        if (owners.get(expr) !== owner)
          throw new Error("Foreign or unowned flow reference");
        inspectAst(expr.ast, (id) => {
          if (!available.has(id))
            throw new Error(`Unavailable reference: ${id}`);
        });
        return expr;
      });
    function add(id: string, kind: FlowNode["kind"], value?: unknown): Step {
      if (!building) throw new Error("Flow definition is closed");
      if (activeBlock !== token)
        throw new Error("Use the current branch or lane builder for steps");
      if (terminal)
        throw new Error("No steps allowed after a terminal output or branch");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id) || ids.has(id))
        throw new Error(`Invalid or duplicate step ID: ${id}`);
      if (ids.size >= 256) throw new Error("Flows support at most 256 steps");
      ids.add(id);
      validate(value);
      const dependencies = new Set(previous);
      mapValue(value, (expr) => {
        inspectAst(expr.ast, (r) => dependencies.add(r));
        return expr;
      });
      nodes.push({
        id,
        kind,
        dependencies: [...dependencies],
        path: [...path],
      });
      previous = [id];
      available.add(id);
      const step: Step = { id, kind };
      result.nodes.push(step);
      return step;
    }
    const builder: FlowBuilder<T> = {
      input,
      jev(id, request) {
        const frozen = mapValue(request, (expr) => expr) as Request<Questions>;
        const step = add(id, "jev", frozen);
        step.request = frozen;
        return {
          answer(question: string) {
            if (!Object.hasOwn(frozen.questions, question))
              throw new Error(`Unknown question: ${question}`);
            const type = frozen.questions[question].type;
            const fields =
              type === "noul"
                ? ["type", "noul"]
                : type === "choice"
                  ? ["type", "choice", "confidence", "probabilities"]
                  : type === "score"
                    ? ["type", "score", "confidence", "probabilities", "legend"]
                    : ["type", "box", "confidence"];
            return Object.fromEntries(
              fields.map((field) => [
                field,
                new FlowExpression(
                  {
                    op: "get",
                    from: {
                      op: "get",
                      from: {
                        op: "get",
                        from: { op: "ref", id },
                        key: "answers",
                      },
                      key: question,
                    },
                    key: field,
                  },
                  owner,
                ),
              ]),
            ) as never;
          },
        };
      },
      branch(id, paths) {
        const step = add(id, "branch", paths.when);
        step.when = paths.when;
        if (!(paths.when instanceof FlowExpression))
          throw new Error("branch requires a condition expression");
        nodes.find((n) => n.id === id)!.condition = describe(paths.when.ast);
        step.then = block(
          paths.then,
          new Set(available),
          [...path, `${id}:then`],
          [id],
          depth + 1,
          true,
        );
        step.else = block(
          paths.else,
          new Set(available),
          [...path, `${id}:else`],
          [id],
          depth + 1,
          true,
        );
        terminal = true;
        return new FlowExpression<FlowOutcome>({ op: "ref", id }, owner);
      },
      parallel(id, lanes) {
        const prior = [...previous],
          base = new Set(available);
        const step = add(id, "parallel");
        step.lanes = {};
        if (!Object.keys(lanes).length)
          throw new Error("parallel requires at least one lane");
        const refs: Record<string, FlowExpression<unknown>> = {};
        const tails: string[] = [];
        for (const [key, callback] of Object.entries(lanes)) {
          if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(key))
            throw new Error("Invalid lane name");
          const lane = block(
            callback,
            new Set(base),
            [...path, `${id}:${key}`],
            prior,
            depth + 1,
          );
          step.lanes[key] = lane;
          tails.push(lane.nodes.at(-1)?.id ?? prior.at(-1) ?? "");
          refs[key] = new FlowExpression(
            { op: "get", from: { op: "ref", id }, key },
            owner,
          );
        }
        nodes.find((n) => n.id === id)!.dependencies = tails.filter(Boolean);
        return refs as never;
      },
      output(outcome, value) {
        const step = add(outcome, "output", value);
        step.outcome = outcome;
        step.value = mapValue(value, (e) => e);
        terminal = true;
        return new FlowExpression<FlowOutcome>(
          { op: "ref", id: outcome },
          owner,
        );
      },
    };
    const parentBlock = activeBlock;
    activeBlock = token;
    let returned: FlowExpression<unknown>;
    try {
      returned = callback(builder);
    } finally {
      activeBlock = parentBlock;
    }
    if (!(returned instanceof FlowExpression))
      throw new Error(
        "Flow callbacks must return an expression, output, or branch",
      );
    if (requireOutcome && !terminal)
      throw new Error("Branch paths must end with output or branch");
    if (
      terminal &&
      (returned.ast.op !== "ref" || returned.ast.id !== result.nodes.at(-1)!.id)
    )
      throw new Error("Return the terminal output or branch");
    validate(returned);
    result.result = returned;
    return result;
  }
  if (!name.trim() || name.length > 100) throw new Error("Invalid flow name");
  let program: Block;
  try {
    program = block(build, new Set(), [], [], 0, true);
  } finally {
    building = false;
  }
  if (!["branch", "output"].includes(program.nodes.at(-1)?.kind ?? ""))
    throw new Error("Flow must end with output or branch");
  const definition: FlowDefinition = {
    version: 1,
    id: randomUUID(),
    name,
    nodes,
  };
  const definitionView = structuredClone(definition);
  for (const node of definitionView.nodes) {
    Object.freeze(node.dependencies);
    Object.freeze(node.path);
    Object.freeze(node);
  }
  Object.freeze(definitionView.nodes);
  Object.freeze(definitionView);
  return {
    definition: definitionView,
    async run(
      data: T,
      options: FlowRunOptions,
    ): Promise<{ runId: string; outcome: string; value?: unknown }> {
      const controller = new AbortController();
      const cancel = () => controller.abort(options.signal?.reason);
      if (options.signal?.aborted) cancel();
      else options.signal?.addEventListener("abort", cancel, { once: true });
      const run: FlowRun = {
        version: 1,
        id: randomUUID(),
        definitionId: definition.id,
        name,
        startedAt: Date.now(),
        status: "pending",
        steps: Object.fromEntries(
          nodes.map((n) => [
            n.id,
            { id: n.id, executionId: randomUUID(), status: "waiting" },
          ]),
        ),
      };
      const started = performance.now(),
        values = new Map<string, unknown>();
      let observer: ReturnType<FlowObserver["startFlow"]>;
      try {
        observer = options.devtools?.startFlow(
          structuredClone(definition),
          structuredClone(run),
        );
      } catch {
        /* Recording cannot stop execution. */
      }
      const emit = () => {
        try {
          if (observer) {
            const { value, ...metadata } = run;
            observer.update({
              ...structuredClone(metadata),
              ...(value !== undefined ? { value } : {}),
            });
          }
        } catch {
          /* Best effort capture. */
        }
      };
      const abortCheck = () => {
        if (controller.signal.aborted)
          throw new DOMException("Flow cancelled", "AbortError");
      };
      const mark = (b: Block, status: FlowStep["status"]) => {
        for (const step of b.nodes) {
          if (run.steps[step.id].status === "waiting")
            run.steps[step.id].status = status;
          if (step.then) mark(step.then, status);
          if (step.else) mark(step.else, status);
          for (const lane of Object.values(step.lanes ?? {}))
            mark(lane, status);
        }
      };
      async function execute(b: Block): Promise<unknown> {
        for (const step of b.nodes) {
          abortCheck();
          const state = run.steps[step.id],
            time = performance.now();
          state.status = "running";
          state.startedAt = Date.now();
          emit();
          try {
            let value: unknown;
            if (step.kind === "jev") {
              const request = mapValue(step.request, (e) =>
                evaluate(e.ast, data, values),
              ) as SystemOneRequest<Questions>;
              const call = () =>
                options.client.systemOne(request, {
                  signal: controller.signal,
                });
              const link = {
                runId: run.id,
                stepId: step.id,
                executionId: state.executionId,
              };
              value = await (observer
                ? observer.request(
                    link,
                    (id) => {
                      state.traceId = id;
                      emit();
                    },
                    call,
                  )
                : call());
              abortCheck();
            } else if (step.kind === "branch") {
              const decision = evaluate(step.when!.ast, data, values);
              if (typeof decision !== "boolean")
                throw new Error("Branch condition did not return a boolean");
              state.decision = decision;
              mark(decision ? step.else! : step.then!, "untaken");
              emit();
              value = await execute(decision ? step.then! : step.else!);
            } else if (step.kind === "parallel") {
              const entries = Object.entries(step.lanes!);
              let firstError: unknown;
              const results = await Promise.allSettled(
                entries.map(async ([, lane]) => {
                  try {
                    return await execute(lane);
                  } catch (e) {
                    if (firstError === undefined) firstError = e;
                    controller.abort(e);
                    throw e;
                  }
                }),
              );
              if (firstError !== undefined) throw firstError;
              value = Object.fromEntries(
                results.map((r, i) => [
                  entries[i][0],
                  (r as PromiseFulfilledResult<unknown>).value,
                ]),
              );
            } else
              value = {
                outcome: step.outcome!,
                value: mapValue(step.value, (e) =>
                  evaluate(e.ast, data, values),
                ),
              };
            values.set(step.id, value);
            state.status = "completed";
          } catch (error) {
            state.status =
              error instanceof Error &&
              ["AbortError", "APIUserAbortError"].includes(error.name)
                ? "cancelled"
                : "error";
            state.error = error instanceof Error ? error.name : "FlowError";
            throw error;
          } finally {
            state.durationMs = performance.now() - time;
            emit();
          }
        }
        return evaluate(b.result!.ast, data, values);
      }
      try {
        const result = (await execute(program)) as FlowOutcome;
        abortCheck();
        if (!result || typeof result.outcome !== "string")
          throw new Error("Flow must return a named output");
        run.status = "success";
        run.outcome = result.outcome;
        // Only the recorder snapshots output data; runtime keeps the actual typed value.
        if (result.value !== undefined)
          run.value = result.value as FlowRun["value"];
        return { runId: run.id, ...result };
      } catch (error) {
        run.status =
          error instanceof Error &&
          ["AbortError", "APIUserAbortError"].includes(error.name)
            ? "cancelled"
            : "error";
        run.error = error instanceof Error ? error.name : "FlowError";
        mark(program, run.status === "cancelled" ? "cancelled" : "blocked");
        throw error;
      } finally {
        run.durationMs = performance.now() - started;
        emit();
        options.signal?.removeEventListener("abort", cancel);
      }
    },
  };
}
