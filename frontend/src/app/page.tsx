"use client";

import React, { useCallback } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { TaskList } from "@/components/TaskList";
import { ExecutionLog } from "@/components/ExecutionLog";
import { useExecutorStore } from "@/store/executorStore";
import { useSSE } from "@/hooks/useSSE";

// Simple ID generator (no external dependency needed)
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export default function Home() {
  const {
    sessionId,
    goal,
    setSessionId,
    setGoal,
    addMessage,
    setLoading,
    reset,
  } = useExecutorStore();

  // Connect to SSE when we have session and goal
  useSSE(sessionId, goal);

  const handleStartExecution = useCallback(
    (newGoal: string) => {
      // Reset previous state
      reset();

      // Generate new session ID
      const newSessionId = generateId();

      // Add user message
      addMessage({
        id: generateId(),
        role: "user",
        content: newGoal,
        timestamp: new Date().toISOString(),
      });

      // Set state to trigger SSE connection
      setSessionId(newSessionId);
      setGoal(newGoal);
      setLoading(true);
    },
    [reset, addMessage, setSessionId, setGoal, setLoading]
  );

  return (
    <main className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">TE</span>
          </div>
          <div>
            <h1 className="font-semibold">TODO Executor Agent</h1>
            <p className="text-xs text-muted-foreground">
              Powered by LangGraph + OpenAI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            API Docs
          </a>
          <a
            href="https://github.com/HariDarshan2321/agent-todo-executor"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Main content - Split view */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Chat */}
        <div className="w-1/3 min-w-[320px] max-w-[480px] border-r">
          <ChatPanel onStartExecution={handleStartExecution} />
        </div>

        {/* Right Panel - Artifact Workspace */}
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          {/* Task List */}
          <div className="flex-1 min-h-0">
            <TaskList />
          </div>

          {/* Execution Log */}
          <div className="h-64 flex-shrink-0">
            <ExecutionLog />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t px-6 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>
          TODO Executor Agent v1.0
        </span>
        <span>
          Session: {sessionId?.slice(0, 8) || "Not started"}
        </span>
      </footer>
    </main>
  );
}
