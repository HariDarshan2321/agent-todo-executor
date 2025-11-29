/**
 * Zustand store for TODO Executor state management.
 *
 * This store manages:
 * - Session state (tasks, traces, messages)
 * - Real-time updates from SSE stream
 * - UI state (loading, errors)
 */

import { create } from "zustand";
import {
  Task,
  TraceEntry,
  Message,
  ExecutionPhase,
  SSEEventType,
} from "@/types";

interface ExecutorState {
  // Session
  sessionId: string | null;
  goal: string;
  phase: ExecutionPhase;
  isConnected: boolean;

  // Data
  tasks: Task[];
  traces: TraceEntry[];
  messages: Message[];

  // UI State
  isLoading: boolean;
  error: string | null;

  // Actions
  setSessionId: (id: string) => void;
  setGoal: (goal: string) => void;
  setPhase: (phase: ExecutionPhase) => void;
  setConnected: (connected: boolean) => void;
  setTasks: (tasks: Task[]) => void;
  addTrace: (trace: TraceEntry) => void;
  addMessage: (message: Message) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // SSE Event Handlers
  handleSSEEvent: (eventType: SSEEventType, data: Record<string, unknown>) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  sessionId: null,
  goal: "",
  phase: "idle" as ExecutionPhase,
  isConnected: false,
  tasks: [],
  traces: [],
  messages: [],
  isLoading: false,
  error: null,
};

export const useExecutorStore = create<ExecutorState>((set, get) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setGoal: (goal) => set({ goal }),
  setPhase: (phase) => set({ phase }),
  setConnected: (connected) => set({ isConnected: connected }),
  setTasks: (tasks) => set({ tasks }),

  addTrace: (trace) =>
    set((state) => ({
      traces: [...state.traces, trace],
    })),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  handleSSEEvent: (eventType, data) => {
    const state = get();

    switch (eventType) {
      case "connected":
        set({ isConnected: true });
        break;

      case "phase_change":
        set({ phase: data.phase as ExecutionPhase });
        break;

      case "tasks_update":
        set({ tasks: data.tasks as Task[] });
        break;

      case "trace":
        const trace = data.trace as TraceEntry;
        set((state) => ({
          traces: [...state.traces, trace],
        }));
        break;

      case "message":
        const newMessage: Message = {
          id: `msg-${Date.now()}`,
          role: data.role as "user" | "assistant",
          content: data.content as string,
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          messages: [...state.messages, newMessage],
        }));
        break;

      case "complete":
        set({ phase: "completed", isLoading: false });
        break;

      case "error":
        set({
          error: data.error as string,
          phase: "error",
          isLoading: false,
        });
        break;

      case "ping":
        // Keepalive, no action needed
        break;

      default:
        console.log("Unknown event:", eventType, data);
    }
  },

  reset: () => set(initialState),
}));
