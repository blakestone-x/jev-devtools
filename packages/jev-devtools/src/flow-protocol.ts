import type { Json } from "./protocol.js";
/** Authored diagram copy, never instructions for Jev or executable routing logic. */
export type FlowDisplay = { title?: string; description?: string };
/** Structural metadata only: literals, inputs, and question content stay in request captures. */
export type FlowNode = FlowDisplay & {
  id: string;
  kind: "jev" | "branch" | "parallel" | "output";
  dependencies: string[];
  path: string[];
  condition?: string;
  /** Named concurrent lanes; optional for older captures. */
  lanes?: string[];
};
export type FlowDefinition = {
  version: 1;
  id: string;
  name: string;
  nodes: FlowNode[];
};
export type FlowStep = {
  id: string;
  executionId: string;
  status:
    | "waiting"
    | "running"
    | "completed"
    | "untaken"
    | "blocked"
    | "error"
    | "cancelled";
  startedAt?: number;
  durationMs?: number;
  decision?: boolean;
  traceId?: string;
  error?: string;
};
export type FlowRun = {
  version: 1;
  id: string;
  definitionId: string;
  name: string;
  startedAt: number;
  durationMs?: number;
  status: "pending" | "success" | "error" | "cancelled";
  steps: Record<string, FlowStep>;
  outcome?: string;
  value?: Json;
  error?: string;
};
export type FlowUpdate = {
  version: 1;
  definitions: FlowDefinition[];
  upserts: FlowRun[];
  order: string[];
};
