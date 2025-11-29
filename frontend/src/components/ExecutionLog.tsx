"use client";

import React, { useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useExecutorStore } from "@/store/executorStore";
import { formatTimestamp, cn } from "@/lib/utils";
import { Terminal, ChevronRight } from "lucide-react";

function getActionColor(action: string): string {
  if (action.includes("start")) return "text-blue-400";
  if (action.includes("success") || action.includes("complete")) return "text-green-400";
  if (action.includes("error") || action.includes("fail")) return "text-red-400";
  if (action.includes("reflection")) return "text-purple-400";
  if (action.includes("selected")) return "text-yellow-400";
  return "text-muted-foreground";
}

function getNodeColor(node: string): string {
  switch (node) {
    case "analyze_goal":
      return "text-purple-500";
    case "plan_todos":
      return "text-blue-500";
    case "select_task":
      return "text-yellow-500";
    case "execute_task":
      return "text-amber-500";
    case "reflect":
      return "text-cyan-500";
    case "complete":
      return "text-green-500";
    default:
      return "text-muted-foreground";
  }
}

export function ExecutionLog() {
  const { traces, isConnected } = useExecutorStore();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [traces]);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Execution Log</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">
            {traces.length} events
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="h-full overflow-y-auto bg-slate-950 rounded-b-lg">
          <div className="p-4 font-mono text-xs space-y-1">
            {traces.length === 0 && (
              <div className="text-slate-500 py-8 text-center">
                <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Execution traces will appear here</p>
              </div>
            )}

            {traces.map((trace, index) => (
              <div
                key={index}
                className="flex items-start gap-2 hover:bg-slate-900/50 p-1 rounded transition-colors"
              >
                {/* Timestamp */}
                <span className="text-slate-500 flex-shrink-0 w-20">
                  {formatTimestamp(trace.timestamp)}
                </span>

                {/* Node */}
                <span
                  className={cn(
                    "flex-shrink-0 w-24 truncate",
                    getNodeColor(trace.node)
                  )}
                >
                  [{trace.node}]
                </span>

                {/* Action */}
                <span
                  className={cn(
                    "flex-shrink-0",
                    getActionColor(trace.action)
                  )}
                >
                  <ChevronRight className="w-3 h-3 inline-block" />
                  {trace.action}
                </span>

                {/* Message */}
                <span className="text-slate-300 flex-1 truncate">
                  {trace.message}
                </span>

                {/* Task ID if present */}
                {trace.task_id && (
                  <span className="text-slate-600 flex-shrink-0">
                    #{trace.task_id.slice(0, 4)}
                  </span>
                )}
              </div>
            ))}

            {/* Live indicator */}
            {isConnected && traces.length > 0 && (
              <div className="flex items-center gap-2 text-green-500 pt-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span>Live</span>
              </div>
            )}

            <div ref={logEndRef} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
