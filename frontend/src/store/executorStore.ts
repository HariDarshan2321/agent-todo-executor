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

interface SavedSession {
  session_id: string;
  goal: string;
  phase: string;
  task_count: number;
  completed_count: number;
}

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

  // Saved sessions
  savedSessions: SavedSession[];
  isLoadingSessions: boolean;

  // UI State
  isLoading: boolean;
  error: string | null;

  // View-only mode (for viewing history without auto-execution)
  isViewOnly: boolean;

  // User input for resume (human-in-the-loop)
  resumeInput: string | null;

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
  setViewOnly: (viewOnly: boolean) => void;
  setResumeInput: (input: string | null) => void;

  // SSE Event Handlers
  handleSSEEvent: (eventType: SSEEventType, data: Record<string, unknown>) => void;

  // Session management
  loadSavedSessions: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  setIsResuming: (isResuming: boolean) => void;
  isResuming: boolean;

  // Reset
  reset: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const initialState = {
  sessionId: null,
  goal: "",
  phase: "idle" as ExecutionPhase,
  isConnected: false,
  tasks: [] as Task[],
  traces: [] as TraceEntry[],
  messages: [] as Message[],
  savedSessions: [] as SavedSession[],
  isLoadingSessions: false,
  isLoading: false,
  isResuming: false,
  isViewOnly: false,
  resumeInput: null,
  error: null,
};

export const useExecutorStore = create<ExecutorState>((set, get) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setGoal: (goal) => set({ goal }),
  setPhase: (phase) => set({ phase }),
  setConnected: (connected) => set({ isConnected: connected }),
  setTasks: (tasks) => set({ tasks }),
  setViewOnly: (viewOnly) => set({ isViewOnly: viewOnly }),
  setResumeInput: (input) => set({ resumeInput: input }),

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
  setIsResuming: (isResuming) => set({ isResuming, isViewOnly: false }), // Clear viewOnly when resuming

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

  loadSavedSessions: async () => {
    set({ isLoadingSessions: true });
    try {
      const response = await fetch(`${API_BASE}/api/sessions`);
      if (response.ok) {
        const sessions = await response.json();
        set({ savedSessions: sessions, isLoadingSessions: false });
      } else {
        set({ isLoadingSessions: false });
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
      set({ isLoadingSessions: false });
    }
  },

  loadSession: async (sessionId: string) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`${API_BASE}/api/session/${sessionId}`);
      if (response.ok) {
        const session = await response.json();
        const completedCount = session.tasks.filter((t: Task) => t.status === "completed").length;
        const pendingCount = session.tasks.filter((t: Task) => t.status === "pending").length;

        set({
          sessionId: session.session_id,
          goal: session.goal,
          phase: session.phase as ExecutionPhase,
          tasks: session.tasks,
          traces: session.traces,
          messages: [
            {
              id: `loaded-${Date.now()}`,
              role: "user" as const,
              content: session.goal,
              timestamp: new Date().toISOString(),
            },
            {
              id: `loaded-status-${Date.now()}`,
              role: "assistant" as const,
              content: pendingCount > 0
                ? `Session restored. ${completedCount}/${session.tasks.length} tasks completed. ${pendingCount} tasks pending. Click "Continue" button below to resume execution.`
                : `Session restored. All ${session.tasks.length} tasks completed.`,
              timestamp: new Date().toISOString(),
            },
          ],
          isLoading: false,
          isViewOnly: true, // IMPORTANT: Mark as view-only to prevent auto-execution
          isResuming: false, // Ensure not resuming
        });
      } else {
        set({ error: "Failed to load session", isLoading: false });
      }
    } catch (error) {
      console.error("Failed to load session:", error);
      set({ error: "Failed to load session", isLoading: false });
    }
  },

  reset: () => set(initialState),
}));
