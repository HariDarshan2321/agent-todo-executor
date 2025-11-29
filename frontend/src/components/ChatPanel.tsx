"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useExecutorStore } from "@/store/executorStore";
import { cn, getPhaseColor } from "@/lib/utils";
import {
  Send,
  Loader2,
  Sparkles,
  User,
  Bot,
  Pause,
  Play,
  Minimize2,
  Maximize2,
} from "lucide-react";

interface ChatPanelProps {
  onStartExecution: (goal: string) => void;
  onContinueExecution: (userInput?: string) => void;
  onPauseExecution?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ChatPanel({ onStartExecution, onContinueExecution, onPauseExecution, isCollapsed = false, onToggleCollapse }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    phase,
    isLoading,
    isConnected,
    goal,
    tasks,
    sessionId,
  } = useExecutorStore();

  // Check if there are incomplete tasks (pending or failed) that can be resumed
  const incompleteTasks = tasks.filter((t) => t.status === "pending" || t.status === "failed");
  const canResume = incompleteTasks.length > 0 && phase === "completed";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // If we have pending tasks and a session, treat input as context for resuming
    if (canResume && sessionId) {
      onContinueExecution(input.trim());
    } else {
      // Otherwise, start a new execution
      onStartExecution(input.trim());
    }
    setInput("");
  };

  const isExecuting = phase !== "idle" && phase !== "completed" && phase !== "error";

  return (
    <Card className="flex flex-col h-full border-r">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Goal Planning</h2>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Connected
            </span>
          )}
          {phase !== "idle" && (
            <Badge className={cn("capitalize", getPhaseColor(phase))}>
              {phase}
            </Badge>
          )}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onToggleCollapse}
              title={isCollapsed ? "Expand Goal Planning" : "Collapse Goal Planning"}
            >
              {isCollapsed ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Messages - Collapsible */}
      {!isCollapsed && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !goal && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Sparkles className="w-12 h-12 mb-4 opacity-50" />
                <h3 className="font-medium text-lg mb-2">Welcome to TODO Executor</h3>
                <p className="text-sm max-w-xs">
                  Enter a high-level goal below, and I&apos;ll break it down into
                  actionable tasks and execute them for you.
                </p>
              </div>
            )}

            {/* Show goal if set */}
            {goal && messages.length === 0 && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1">You</p>
                  <p className="text-sm">{goal}</p>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className="flex gap-3">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    message.role === "user"
                      ? "bg-primary/10"
                      : "bg-secondary"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="w-4 h-4 text-primary" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1 capitalize">
                    {message.role === "user" ? "You" : "Agent"}
                  </p>
                  <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                    {message.content.split("\n").map((line, i) => (
                      <p key={i} className="mb-1">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && phase !== "completed" && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1">Agent</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="capitalize">{phase}...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t">
            {/* Show Continue button when session has incomplete tasks */}
            {canResume && (
              <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-sm text-amber-600 mb-2">
                  {incompleteTasks.length} incomplete task(s) remaining
                </p>
                <Button
                  onClick={() => onContinueExecution()}
                  className="w-full"
                  variant="default"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Continue Execution
                </Button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isExecuting
                    ? "Execution in progress..."
                    : canResume
                    ? "Provide context for next task, or leave empty to continue..."
                    : "Enter your goal (e.g., 'Plan a weekend trip to Paris')"
                }
                disabled={isExecuting || isLoading}
                className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
              <Button
                type="submit"
                disabled={(!input.trim() && !canResume) || isExecuting || isLoading}
                size="icon"
                title={canResume ? "Continue with input" : "Start execution"}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : canResume ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </form>

            {/* Control buttons during execution */}
            {isExecuting && onPauseExecution && (
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={onPauseExecution}
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
