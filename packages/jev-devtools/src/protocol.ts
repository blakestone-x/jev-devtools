// Browser-safe, versioned snapshots. Never send SDK clients, options, or headers.
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type QuestionView = {
  type: string;
  instructions?: Json;
  criteria?: Json;
};
export type AnswerView = {
  type: string;
  choice?: string;
  score?: number;
  noul?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, Json>;
  box?: { left: number; top: number; right: number; bottom: number };
};
export type Trace = {
  version: 1;
  id: string;
  session: string;
  label: string;
  source: "sample" | "live";
  startedAt: number;
  durationMs?: number;
  status: "pending" | "success" | "error" | "cancelled";
  request: {
    model: string;
    state: Json;
    questions: Record<string, QuestionView>;
    assets?: Json;
  };
  result?: {
    model: string;
    answers: Record<string, AnswerView>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  requestId?: string;
  error?: { name: string; message: string; status?: number };
  attempts: {
    number: number;
    durationMs?: number;
    status?: number;
    error?: string;
  }[];
  captureWarnings: string[];
};
export type Snapshot = { version: 1; traces: Trace[] };
