"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useExecutorStore } from "@/store/executorStore";
import { cn, getStatusColor } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  AlertCircle,
  ListTodo,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { TaskStatus } from "@/types";

function getStatusIcon(status: TaskStatus) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "in_progress":
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    case "failed":
      return <XCircle className="w-5 h-5 text-red-500" />;
    case "needs_followup":
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    case "pending":
    default:
      return <Circle className="w-5 h-5 text-muted-foreground" />;
  }
}

function getStatusBadgeVariant(status: TaskStatus) {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "info";
    case "failed":
      return "destructive";
    case "needs_followup":
      return "warning";
    case "pending":
    default:
      return "secondary";
  }
}

// Skeleton loader for tasks
function TaskSkeleton() {
  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-full skeleton" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 skeleton rounded" />
          <div className="h-3 w-1/2 skeleton rounded" />
        </div>
        <div className="h-5 w-16 skeleton rounded-full" />
      </div>
    </div>
  );
}

// Task item component with expandable output
function TaskItem({ task, index }: { task: any; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasOutput = task.result && task.result.length > 0;
  const hasError = task.error && task.error.length > 0;

  const handleCopy = async () => {
    if (task.result) {
      await navigator.clipboard.writeText(task.result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={cn(
        "border rounded-lg transition-all duration-300",
        task.status === "in_progress" && "border-blue-500/50 bg-blue-500/5",
        task.status === "completed" && "border-green-500/30 bg-green-500/5",
        task.status === "failed" && "border-red-500/30 bg-red-500/5"
      )}
    >
      {/* Task Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {getStatusIcon(task.status as TaskStatus)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">
                #{index + 1}
              </span>
              <h4 className="font-medium text-sm truncate">{task.title}</h4>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant={getStatusBadgeVariant(task.status as TaskStatus) as any}
              className="flex-shrink-0"
            >
              {task.status.replace("_", " ")}
            </Badge>

            {/* Expand/Collapse button for completed tasks with output */}
            {hasOutput && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Output Section */}
      {isExpanded && hasOutput && (
        <div className="px-4 pb-4 pt-0">
          <div className="mt-2 p-3 bg-muted/50 rounded-md relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-600">Output:</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <pre className="text-xs whitespace-pre-wrap font-mono overflow-x-auto max-h-64 overflow-y-auto">
              {task.result}
            </pre>
          </div>
        </div>
      )}

      {/* Error display (always visible) */}
      {hasError && !isExpanded && (
        <div className="px-4 pb-4 pt-0">
          <p className="text-xs text-red-500 mt-2">
            ✗ {task.error}
          </p>
        </div>
      )}
    </div>
  );
}

interface TaskListProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TaskList({ isCollapsed = false, onToggleCollapse }: TaskListProps) {
  const { tasks, phase, isLoading } = useExecutorStore();

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? ((completedCount + failedCount) / totalCount) * 100 : 0;

  const showSkeleton = isLoading && tasks.length === 0 && phase === "planning";

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Tasks</CardTitle>
            {totalCount > 0 && (
              <span className="text-sm text-muted-foreground">
                ({completedCount}/{totalCount})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onToggleCollapse}
                title={isCollapsed ? "Expand Tasks" : "Collapse Tasks"}
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
        {totalCount > 0 && !isCollapsed && (
          <Progress value={progress} className="mt-2" />
        )}
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="flex-1 overflow-y-auto space-y-3">
          {/* Empty state */}
          {!showSkeleton && tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
              <ListTodo className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">
                Tasks will appear here once planning begins
              </p>
            </div>
          )}

          {/* Skeleton loading */}
          {showSkeleton && (
            <div className="space-y-3">
              <TaskSkeleton />
              <TaskSkeleton />
              <TaskSkeleton />
            </div>
          )}

          {/* Task list */}
          {tasks.map((task, index) => (
            <TaskItem key={task.id} task={task} index={index} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}
