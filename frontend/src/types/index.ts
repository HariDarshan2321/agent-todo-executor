/**
 * Type definitions for the TODO Executor frontend.
 */

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "needs_followup";

export type ExecutionPhase =
  | "idle"
  | "connecting"
  | "analyzing"
  | "planning"
  | "executing"
  | "reflecting"
  | "paused"
  | "completed"
  | "error";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface TraceEntry {
  timestamp: string;
  node: string;
  action: string;
  task_id?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Session {
  session_id: string;
  goal: string;
  phase: ExecutionPhase;
  tasks: Task[];
  traces: TraceEntry[];
  messages: Message[];
  is_paused: boolean;
  error?: string;
}

// SSE Event Types (AG-UI Protocol)
export type SSEEventType =
  | "connected"
  | "node_start"
  | "node_end"
  | "phase_change"
  | "tasks_update"
  | "trace"
  | "message"
  | "complete"
  | "error"
  | "ping";

export interface SSEEvent {
  event: SSEEventType;
  data: Record<string, unknown>;
}

// API Types
export interface StartExecutionResponse {
  session_id: string;
  goal: string;
  stream_url: string;
}
