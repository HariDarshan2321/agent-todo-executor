/**
 * Custom hook for Server-Sent Events (SSE) connection.
 *
 * Features:
 * - Automatic reconnection
 * - Event parsing following AG-UI protocol
 * - Connection state management
 */

import { useEffect, useRef, useCallback } from "react";
import { useExecutorStore } from "@/store/executorStore";
import { SSEEventType } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useSSE(sessionId: string | null, goal: string | null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasConnectedRef = useRef(false);

  // Get store functions once - they're stable
  const handleSSEEvent = useExecutorStore((state) => state.handleSSEEvent);
  const setConnected = useExecutorStore((state) => state.setConnected);
  const setError = useExecutorStore((state) => state.setError);
  const setLoading = useExecutorStore((state) => state.setLoading);

  // Connect to SSE when sessionId and goal are available
  useEffect(() => {
    // Skip if no session/goal or already connected
    if (!sessionId || !goal || hasConnectedRef.current) {
      return;
    }

    // Mark as connecting
    hasConnectedRef.current = true;
    setLoading(true);

    // Build SSE URL with goal as query param
    const url = `${API_BASE}/api/stream/${sessionId}?goal=${encodeURIComponent(goal)}`;
    console.log("Connecting to SSE:", url);

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
      hasConnectedRef.current = false;
    };
  }, [sessionId, goal, handleSSEEvent, setConnected, setError, setLoading]);

  // Manual disconnect function
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnected(false);
      hasConnectedRef.current = false;
    }
  }, [setConnected]);

  return { disconnect };
}
