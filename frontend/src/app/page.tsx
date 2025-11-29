"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { TaskList } from "@/components/TaskList";
import { ExecutionLog } from "@/components/ExecutionLog";
import { useExecutorStore } from "@/store/executorStore";
import { useSSE } from "@/hooks/useSSE";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import {
  History,
  X,
  Loader2,
  Play,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Zap,
  LogIn,
} from "lucide-react";

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
    savedSessions,
    isLoadingSessions,
    loadSavedSessions,
    loadSession,
    isResuming,
    setIsResuming,
    setViewOnly,
    phase,
    tasks,
    resumeInput,
    setResumeInput,
  } = useExecutorStore();

  const [showHistory, setShowHistory] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [viewedSession, setViewedSession] = useState<any>(null);

  // Resizable panel state
  const [taskPanelHeight, setTaskPanelHeight] = useState(60); // percentage
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Collapsible panel state
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isTasksCollapsed, setIsTasksCollapsed] = useState(false);

  // Connect to SSE when we have session and goal (or when resuming)
  useSSE(sessionId, goal, isResuming, resumeInput);

  // Load saved sessions when history panel opens
  useEffect(() => {
    if (showHistory) {
      loadSavedSessions();
    }
  }, [showHistory, loadSavedSessions]);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;
      const percentage = (y / height) * 100;

      // Clamp between 20% and 80%
      setTaskPanelHeight(Math.max(20, Math.min(80, percentage)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleStartExecution = useCallback(
    (newGoal: string) => {
      // Reset previous state
      reset();
      setViewedSession(null);

      // Generate new session ID
      const newSessionId = generateId();

      // Add user message
      addMessage({
        id: generateId(),
        role: "user",
        content: newGoal,
        timestamp: new Date().toISOString(),
      });

      // Clear view-only mode and set state to trigger SSE connection
      setViewOnly(false);
      setSessionId(newSessionId);
      setGoal(newGoal);
      setLoading(true);
    },
    [reset, addMessage, setSessionId, setGoal, setLoading, setViewOnly]
  );

  // View session (load WITHOUT auto-running - just view)
  const handleViewSession = useCallback(
    async (sid: string) => {
      setSelectedSession(sid);
      await loadSession(sid);
      // Find the session data to display
      const session = savedSessions.find(s => s.session_id === sid);
      setViewedSession(session);
      setShowHistory(false);
    },
    [loadSession, savedSessions]
  );

  // Resume execution - explicit user action
  const handleResumeSession = useCallback(
    async (sid: string) => {
      setSelectedSession(sid);
      await loadSession(sid);
      setShowHistory(false);
      // Now trigger resume
      setIsResuming(true);
      setLoading(true);
    },
    [loadSession, setIsResuming, setLoading]
  );

  const handleContinueExecution = useCallback((userInput?: string) => {
    // Store user input if provided (for human-in-the-loop)
    if (userInput) {
      setResumeInput(userInput);
    }
    // Trigger resume by setting isResuming to true
    // The useSSE hook will connect to the resume endpoint
    setIsResuming(true);
    setLoading(true);
    setViewedSession(null);
  }, [setIsResuming, setLoading, setResumeInput]);

  const handlePauseExecution = useCallback(async () => {
    if (!sessionId) return;

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      await fetch(`${API_BASE}/api/session/${sessionId}/pause`, {
        method: "POST",
      });
      // The SSE will receive the pause event and update the state
    } catch (error) {
      console.error("Failed to pause execution:", error);
    }
  }, [sessionId]);

  const handleNewSession = useCallback(() => {
    reset();
    setSelectedSession(null);
    setViewedSession(null);
  }, [reset]);

  // Get phase badge styling
  const getPhaseInfo = (p: string) => {
    switch (p) {
      case "completed":
        return { icon: CheckCircle2, color: "bg-green-500/10 text-green-500 border-green-500/20" };
      case "executing":
        return { icon: Zap, color: "bg-blue-500/10 text-blue-500 border-blue-500/20" };
      case "error":
        return { icon: AlertCircle, color: "bg-red-500/10 text-red-500 border-red-500/20" };
      default:
        return { icon: Clock, color: "bg-gray-500/10 text-gray-500 border-gray-500/20" };
    }
  };

  // Login page for unauthenticated users
  const LoginPage = () => (
    <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="text-center space-y-8 p-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-2xl">
            <Zap className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white mb-3">TODO Executor</h1>
          <p className="text-lg text-gray-400 max-w-md mx-auto">
            AI-Powered Task Automation Platform
          </p>
        </div>

        <div className="space-y-4 pt-4">
          <SignInButton mode="modal">
            <Button size="lg" className="w-64 h-12 text-lg">
              <LogIn className="w-5 h-5 mr-2" />
              Sign In
            </Button>
          </SignInButton>

          <div className="text-gray-500 text-sm">or</div>

          <SignUpButton mode="modal">
            <Button variant="outline" size="lg" className="w-64 h-12 text-lg">
              Create Account
            </Button>
          </SignUpButton>
        </div>

        <p className="text-sm text-gray-500 mt-8">
          Powered by LangGraph + OpenAI
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Show login page for unauthenticated users */}
      <SignedOut>
        <LoginPage />
      </SignedOut>

      {/* Show main app for authenticated users */}
      <SignedIn>
        <main className="h-screen flex flex-col bg-background">
          {/* Header with Auth */}
          <header className="border-b px-6 py-4 flex items-center justify-between bg-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                <Zap className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-bold text-lg">TODO Executor</h1>
                <p className="text-xs text-muted-foreground">
                  AI-Powered Task Automation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* History Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                History
              </Button>

              {/* New Session Button */}
              {sessionId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewSession}
                  className="flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  New Session
                </Button>
              )}

              {/* Auth Section */}
              <div className="flex items-center gap-3 pl-4 border-l">
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-9 h-9",
                    },
                  }}
                />
              </div>

              {/* External Links */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground pl-4 border-l">
                <a
                  href="http://localhost:8000/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  API
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
            </div>
          </header>

          {/* Main content - Split view */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* History Sidebar - View Only with Resume Button */}
            {showHistory && (
              <>
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/20 z-40"
                  onClick={() => setShowHistory(false)}
                />
                {/* Sidebar */}
                <div className="absolute top-0 left-0 h-full w-96 bg-card border-r z-50 flex flex-col shadow-2xl">
                  <div className="p-4 border-b flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">Session History</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowHistory(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {isLoadingSessions && (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      </div>
                    )}

                    {!isLoadingSessions && savedSessions.length === 0 && (
                      <div className="text-center py-12">
                        <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                          No sessions yet
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          Start a new task to see history
                        </p>
                      </div>
                    )}

                    {savedSessions.map((session) => {
                      const phaseInfo = getPhaseInfo(session.phase);
                      const PhaseIcon = phaseInfo.icon;
                      const hasPending = session.completed_count < session.task_count;

                      return (
                        <div
                          key={session.session_id}
                          className={`p-4 border rounded-xl transition-all ${
                            selectedSession === session.session_id ? "ring-2 ring-primary bg-muted/50" : "hover:bg-muted/30"
                          }`}
                        >
                          <p className="text-sm font-medium line-clamp-2 mb-3">
                            {session.goal}
                          </p>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={phaseInfo.color}>
                                <PhaseIcon className="w-3 h-3 mr-1" />
                                {session.phase}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {session.completed_count}/{session.task_count} tasks
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* View Button - just loads and views */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-3"
                                onClick={() => handleViewSession(session.session_id)}
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                View
                              </Button>

                              {/* Resume Button - only if has pending tasks */}
                              {hasPending && session.phase !== "completed" && (
                                <Button
                                  size="sm"
                                  className="h-8 px-3 bg-green-600 hover:bg-green-700"
                                  onClick={() => handleResumeSession(session.session_id)}
                                >
                                  <Play className="w-3.5 h-3.5 mr-1" />
                                  Resume
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Left Panel - Chat */}
            <div className={`${isChatCollapsed ? "w-auto" : "w-1/3 min-w-[360px] max-w-[480px]"} border-r transition-all`}>
              <ChatPanel
                onStartExecution={handleStartExecution}
                onContinueExecution={handleContinueExecution}
                onPauseExecution={handlePauseExecution}
                isCollapsed={isChatCollapsed}
                onToggleCollapse={() => setIsChatCollapsed(!isChatCollapsed)}
              />
            </div>

            {/* Right Panel - Resizable Artifact Workspace */}
            <div
              ref={containerRef}
              className="flex-1 flex flex-col p-4 gap-0 overflow-hidden bg-muted/20"
            >
              {/* Task List - Resizable */}
              <div
                className="min-h-0 overflow-hidden"
                style={{ height: isTasksCollapsed ? "auto" : `${taskPanelHeight}%` }}
              >
                <TaskList
                  isCollapsed={isTasksCollapsed}
                  onToggleCollapse={() => setIsTasksCollapsed(!isTasksCollapsed)}
                />
              </div>

              {/* Resize Handle */}
              <div
                className={`h-2 flex items-center justify-center cursor-row-resize group hover:bg-primary/20 transition-colors ${
                  isResizing ? "bg-primary/30" : ""
                }`}
                onMouseDown={handleMouseDown}
              >
                <div className={`w-16 h-1 rounded-full transition-colors ${
                  isResizing ? "bg-primary" : "bg-muted-foreground/30 group-hover:bg-primary/50"
                }`} />
              </div>

              {/* Execution Log - Takes remaining space */}
              <div
                className="min-h-0 overflow-hidden flex-1"
                style={{ height: isTasksCollapsed ? undefined : `${100 - taskPanelHeight}%` }}
              >
                <ExecutionLog />
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="border-t px-6 py-2 text-xs text-muted-foreground flex items-center justify-between bg-card">
            <div className="flex items-center gap-4">
              <span className="font-medium">TODO Executor v1.0</span>
              <span className="text-muted-foreground/60">|</span>
              <span>Powered by LangGraph + OpenAI</span>
            </div>
            <div className="flex items-center gap-2">
              {phase !== "idle" && (
                <Badge variant="outline" className="text-xs">
                  {phase}
                </Badge>
              )}
              <span>
                Session: {sessionId?.slice(0, 8) || "Not started"}
              </span>
            </div>
          </footer>
        </main>
      </SignedIn>
    </>
  );
}
