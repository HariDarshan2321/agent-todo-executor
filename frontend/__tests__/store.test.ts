/**
 * Tests for Zustand executor store.
 */

import { act, renderHook } from '@testing-library/react';
import { useExecutorStore } from '@/store/executorStore';

// Reset store before each test
beforeEach(() => {
  const { result } = renderHook(() => useExecutorStore());
  act(() => {
    result.current.reset();
  });
});

describe('ExecutorStore', () => {
  describe('Initial State', () => {
    it('should have null sessionId initially', () => {
      const { result } = renderHook(() => useExecutorStore());
      expect(result.current.sessionId).toBeNull();
    });

    it('should have empty goal initially', () => {
      const { result } = renderHook(() => useExecutorStore());
      expect(result.current.goal).toBe('');
    });

    it('should have idle phase initially', () => {
      const { result } = renderHook(() => useExecutorStore());
      expect(result.current.phase).toBe('idle');
    });

    it('should not be connected initially', () => {
      const { result } = renderHook(() => useExecutorStore());
      expect(result.current.isConnected).toBe(false);
    });

    it('should have empty tasks initially', () => {
      const { result } = renderHook(() => useExecutorStore());
      expect(result.current.tasks).toEqual([]);
    });

    it('should have empty messages initially', () => {
      const { result } = renderHook(() => useExecutorStore());
      expect(result.current.messages).toEqual([]);
    });
  });

  describe('Session Actions', () => {
    it('should set sessionId', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.setSessionId('test-session-123');
      });

      expect(result.current.sessionId).toBe('test-session-123');
    });

    it('should set goal', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.setGoal('Create a landing page');
      });

      expect(result.current.goal).toBe('Create a landing page');
    });

    it('should set phase', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.setPhase('executing');
      });

      expect(result.current.phase).toBe('executing');
    });

    it('should set connected status', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.setConnected(true);
      });

      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('Task Actions', () => {
    it('should set tasks', () => {
      const { result } = renderHook(() => useExecutorStore());
      const tasks = [
        { id: '1', title: 'Task 1', status: 'pending' },
        { id: '2', title: 'Task 2', status: 'pending' },
      ];

      act(() => {
        result.current.setTasks(tasks);
      });

      expect(result.current.tasks).toEqual(tasks);
    });
  });

  describe('Message Actions', () => {
    it('should add message', () => {
      const { result } = renderHook(() => useExecutorStore());
      const message = {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      act(() => {
        result.current.addMessage(message);
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Hello');
    });

    it('should accumulate messages', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.addMessage({
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        });
        result.current.addMessage({
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date().toISOString(),
        });
      });

      expect(result.current.messages).toHaveLength(2);
    });
  });

  describe('Trace Actions', () => {
    it('should add trace', () => {
      const { result } = renderHook(() => useExecutorStore());
      const trace = {
        timestamp: new Date().toISOString(),
        node: 'analyze_goal',
        action: 'analyzing',
        message: 'Analyzing goal...',
      };

      act(() => {
        result.current.addTrace(trace);
      });

      expect(result.current.traces).toHaveLength(1);
      expect(result.current.traces[0].node).toBe('analyze_goal');
    });
  });

  describe('UI State Actions', () => {
    it('should set loading state', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should set error', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.setError('Something went wrong');
      });

      expect(result.current.error).toBe('Something went wrong');
    });

    it('should clear error when set to null', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.setError('Error');
        result.current.setError(null);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('SSE Event Handler', () => {
    it('should handle connected event', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.handleSSEEvent('connected', {});
      });

      expect(result.current.isConnected).toBe(true);
    });

    it('should handle phase_change event', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.handleSSEEvent('phase_change', { phase: 'executing' });
      });

      expect(result.current.phase).toBe('executing');
    });

    it('should handle tasks_update event', () => {
      const { result } = renderHook(() => useExecutorStore());
      const tasks = [{ id: '1', title: 'Task 1', status: 'completed' }];

      act(() => {
        result.current.handleSSEEvent('tasks_update', { tasks });
      });

      expect(result.current.tasks).toEqual(tasks);
    });

    it('should handle complete event', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.setLoading(true);
        result.current.handleSSEEvent('complete', {});
      });

      expect(result.current.phase).toBe('completed');
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle error event', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.handleSSEEvent('error', { error: 'Connection failed' });
      });

      expect(result.current.error).toBe('Connection failed');
      expect(result.current.phase).toBe('error');
    });

    it('should handle message event', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.handleSSEEvent('message', {
          role: 'assistant',
          content: 'Task completed',
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Task completed');
    });

    it('should handle trace event', () => {
      const { result } = renderHook(() => useExecutorStore());
      const trace = {
        timestamp: new Date().toISOString(),
        node: 'execute_task',
        action: 'started',
        message: 'Starting task...',
      };

      act(() => {
        result.current.handleSSEEvent('trace', { trace });
      });

      expect(result.current.traces).toHaveLength(1);
    });
  });

  describe('Reset', () => {
    it('should reset all state', () => {
      const { result } = renderHook(() => useExecutorStore());

      // Set some state
      act(() => {
        result.current.setSessionId('test-123');
        result.current.setGoal('Test goal');
        result.current.setPhase('executing');
        result.current.setConnected(true);
        result.current.setTasks([{ id: '1', title: 'Task', status: 'pending' }]);
        result.current.addMessage({
          id: '1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        });
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.sessionId).toBeNull();
      expect(result.current.goal).toBe('');
      expect(result.current.phase).toBe('idle');
      expect(result.current.isConnected).toBe(false);
      expect(result.current.tasks).toEqual([]);
      expect(result.current.messages).toEqual([]);
    });
  });

  describe('Resume State', () => {
    it('should set isResuming', () => {
      const { result } = renderHook(() => useExecutorStore());

      act(() => {
        result.current.setIsResuming(true);
      });

      expect(result.current.isResuming).toBe(true);
    });
  });
});
