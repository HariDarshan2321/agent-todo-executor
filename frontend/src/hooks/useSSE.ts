/**
 * Custom hook for Server-Sent Events (SSE) connection.
 *
 * Features:
 * - Automatic reconnection
 * - Event parsing following AG-UI protocol
 * - Connection state management
 * - View-only mode support (prevents auto-execution)
 */

import { useEffect, useRef, useCallback } from "react";
import { useExecutorStore } from "@/store/executorStore";
import { SSEEventType } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useSSE(sessionId: string | null, goal: string | null, isResuming: boolean = false, userInput: string | null = null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastSessionRef = useRef<string | null>(null);
  const lastResumingRef = useRef<boolean>(false);

  // Get store functions once - they're stable
  const handleSSEEvent = useExecutorStore((state) => state.handleSSEEvent);
  const setConnected = useExecutorStore((state) => state.setConnected);
  const setError = useExecutorStore((state) => state.setError);
  const setLoading = useExecutorStore((state) => state.setLoading);
  const setPhase = useExecutorStore((state) => state.setPhase);
  const setIsResuming = useExecutorStore((state) => state.setIsResuming);
  const isViewOnly = useExecutorStore((state) => state.isViewOnly);

  // Connect to SSE when sessionId and goal are available
  useEffect(() => {
    // NEVER connect if in view-only mode
    if (isViewOnly) {
      console.log("View-only mode: skipping SSE connection");
      return;
    }

    // For resuming, we need sessionId and isResuming must be true
    // For new execution, we need sessionId and goal
    const shouldConnect = isResuming ? (sessionId && isResuming) : (sessionId && goal && !isViewOnly);

    // Skip if nothing to connect to
    if (!shouldConnect) {
      return;
    }

    // Skip if already connected to this session (unless resuming state changed)
    if (lastSessionRef.current === sessionId &&
        lastResumingRef.current === isResuming &&
        eventSourceRef.current) {
      return;
    }

    // Close previous connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Mark as connecting to this session
    lastSessionRef.current = sessionId;
    lastResumingRef.current = isResuming;
    setLoading(true);
    setPhase("connecting");

    // Build SSE URL - use resume endpoint if resuming
    let url: string;
    if (isResuming) {
      url = `${API_BASE}/api/session/${sessionId}/resume`;
      if (userInput) {
        url += `?user_input=${encodeURIComponent(userInput)}`;
      }
    } else {
      url = `${API_BASE}/api/stream/${sessionId}?goal=${encodeURIComponent(goal || "")}`;
    }
    console.log("Connecting to SSE:", url, isResuming ? "(resuming)" : "");

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE Connected");
      setConnected(true);
    };

    eventSource.onerror = (error) => {
      console.error("SSE Error:", error);
      setConnected(false);
      setError("Connection lost. Please try again.");
      eventSource.close();
    };

    // Listen for all event types
    const eventTypes: SSEEventType[] = [
      "connected",
      "node_start",
      "node_end",
      "phase_change",
      "tasks_update",
      "trace",
      "message",
      "complete",
      "error",
      "ping",
    ];

    eventTypes.forEach((eventType) => {
      eventSource.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          handleSSEEvent(eventType, data);

          // Close connection on complete or error
          if (eventType === "complete" || eventType === "error") {
            eventSource.close();
            setConnected(false);
            setIsResuming(false);
          }
        } catch (e) {
          console.error("Failed to parse SSE event:", e);
        }
      });
    });

    // Cleanup on unmount
    return () => {
      console.log("Closing SSE connection");
      eventSource.close();
      setConnected(false);
    };
  }, [sessionId, goal, isResuming, isViewOnly, userInput, handleSSEEvent, setConnected, setError, setLoading, setPhase, setIsResuming]);

  // Manual disconnect function
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnected(false);
      lastSessionRef.current = null;
    }
  }, [setConnected]);

  return { disconnect };
}
