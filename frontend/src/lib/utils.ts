import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-green-500";
    case "in_progress":
      return "text-blue-500";
    case "failed":
      return "text-red-500";
    case "needs_followup":
      return "text-yellow-500";
    case "pending":
    default:
      return "text-muted-foreground";
  }
}

export function getPhaseColor(phase: string): string {
  switch (phase) {
    case "analyzing":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "planning":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "executing":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "reflecting":
      return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
    case "completed":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "error":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "paused":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    default:
      return "bg-muted text-muted-foreground border-muted";
  }
}
