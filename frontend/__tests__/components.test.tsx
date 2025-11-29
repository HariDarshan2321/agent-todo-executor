/**
 * Tests for React components.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskList } from '@/components/TaskList';
import { ExecutionLog } from '@/components/ExecutionLog';
import { ChatPanel } from '@/components/ChatPanel';
import { useExecutorStore } from '@/store/executorStore';

// Mock the store
jest.mock('@/store/executorStore', () => ({
  useExecutorStore: jest.fn(),
}));

const mockUseExecutorStore = useExecutorStore as jest.MockedFunction<typeof useExecutorStore>;

describe('TaskList Component', () => {
  beforeEach(() => {
    mockUseExecutorStore.mockReturnValue({
      tasks: [],
      phase: 'idle',
    } as any);
  });

  it('should render empty state when no tasks', () => {
    render(<TaskList />);
    expect(screen.getByText(/Tasks will appear here/i)).toBeInTheDocument();
  });

  it('should render tasks when available', () => {
    mockUseExecutorStore.mockReturnValue({
      tasks: [
        { id: '1', title: 'Research topic', description: 'Research the main topic', status: 'pending' },
        { id: '2', title: 'Write content', description: 'Write the main content', status: 'completed' },
      ],
      phase: 'executing',
    } as any);

    render(<TaskList />);
    expect(screen.getByText('Research topic')).toBeInTheDocument();
    expect(screen.getByText('Write content')).toBeInTheDocument();
  });

  it('should show correct task count', () => {
    mockUseExecutorStore.mockReturnValue({
      tasks: [
        { id: '1', title: 'Task 1', description: 'Desc 1', status: 'completed' },
        { id: '2', title: 'Task 2', description: 'Desc 2', status: 'pending' },
        { id: '3', title: 'Task 3', description: 'Desc 3', status: 'pending' },
      ],
      phase: 'executing',
    } as any);

    render(<TaskList />);
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
  });

  it('should display pending status badge', () => {
    mockUseExecutorStore.mockReturnValue({
      tasks: [
        { id: '1', title: 'Pending Task', description: 'A pending task', status: 'pending' },
      ],
      phase: 'executing',
    } as any);

    render(<TaskList />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('should display completed status badge', () => {
    mockUseExecutorStore.mockReturnValue({
      tasks: [
        { id: '1', title: 'Done Task', description: 'A done task', status: 'completed' },
      ],
      phase: 'completed',
    } as any);

    render(<TaskList />);
    expect(screen.getByText('completed')).toBeInTheDocument();
  });
});

describe('ExecutionLog Component', () => {
  beforeEach(() => {
    mockUseExecutorStore.mockReturnValue({
      traces: [],
    } as any);
  });

  it('should render empty state when no traces', () => {
    render(<ExecutionLog />);
    expect(screen.getByText(/Execution traces will appear here/i)).toBeInTheDocument();
  });

  it('should render traces when available', () => {
    mockUseExecutorStore.mockReturnValue({
      traces: [
        {
          timestamp: '2024-01-01T10:00:00Z',
          node: 'analyze_goal',
          action: 'analyzing',
          message: 'Analyzing the goal...',
        },
      ],
    } as any);

    render(<ExecutionLog />);
    expect(screen.getByText(/Analyzing the goal/i)).toBeInTheDocument();
  });

  it('should show event count', () => {
    mockUseExecutorStore.mockReturnValue({
      traces: [
        { timestamp: '2024-01-01T10:00:00Z', node: 'n1', action: 'a1', message: 'Msg 1' },
        { timestamp: '2024-01-01T10:01:00Z', node: 'n2', action: 'a2', message: 'Msg 2' },
      ],
    } as any);

    render(<ExecutionLog />);
    expect(screen.getByText(/2 events/i)).toBeInTheDocument();
  });
});

describe('ChatPanel Component', () => {
  const mockOnStartExecution = jest.fn();
  const mockOnContinueExecution = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseExecutorStore.mockReturnValue({
      messages: [],
      phase: 'idle',
      isLoading: false,
      isConnected: false,
      goal: '',
      tasks: [],
      sessionId: null,
    } as any);
  });

  it('should render welcome message when no messages', () => {
    render(
      <ChatPanel
        onStartExecution={mockOnStartExecution}
        onContinueExecution={mockOnContinueExecution}
      />
    );
    expect(screen.getByText(/Welcome to TODO Executor/i)).toBeInTheDocument();
  });

  it('should have input field for goal', () => {
    render(
      <ChatPanel
        onStartExecution={mockOnStartExecution}
        onContinueExecution={mockOnContinueExecution}
      />
    );
    expect(screen.getByPlaceholderText(/Enter your goal/i)).toBeInTheDocument();
  });

  it('should call onStartExecution when form submitted', () => {
    render(
      <ChatPanel
        onStartExecution={mockOnStartExecution}
        onContinueExecution={mockOnContinueExecution}
      />
    );

    const input = screen.getByPlaceholderText(/Enter your goal/i);
    fireEvent.change(input, { target: { value: 'Create a landing page' } });

    // Find submit button by title or type
    const button = screen.getByRole('button', { name: /start execution/i });
    fireEvent.click(button);

    expect(mockOnStartExecution).toHaveBeenCalledWith('Create a landing page');
  });

  it('should disable input during execution', () => {
    mockUseExecutorStore.mockReturnValue({
      messages: [],
      phase: 'executing',
      isLoading: true,
      isConnected: true,
      goal: 'Test goal',
      tasks: [],
      sessionId: 'test-123',
    } as any);

    render(
      <ChatPanel
        onStartExecution={mockOnStartExecution}
        onContinueExecution={mockOnContinueExecution}
      />
    );

    const input = screen.getByPlaceholderText(/Execution in progress/i);
    expect(input).toBeDisabled();
  });

  it('should render messages', () => {
    mockUseExecutorStore.mockReturnValue({
      messages: [
        { id: '1', role: 'user', content: 'Create a landing page', timestamp: '2024-01-01T10:00:00Z' },
        { id: '2', role: 'assistant', content: 'I will create 5 tasks...', timestamp: '2024-01-01T10:00:01Z' },
      ],
      phase: 'completed',
      isLoading: false,
      isConnected: false,
      goal: 'Create a landing page',
      tasks: [],
      sessionId: 'test-123',
    } as any);

    render(
      <ChatPanel
        onStartExecution={mockOnStartExecution}
        onContinueExecution={mockOnContinueExecution}
      />
    );

    expect(screen.getByText('Create a landing page')).toBeInTheDocument();
    expect(screen.getByText(/I will create 5 tasks/i)).toBeInTheDocument();
  });

  it('should show connected indicator when connected', () => {
    mockUseExecutorStore.mockReturnValue({
      messages: [],
      phase: 'executing',
      isLoading: true,
      isConnected: true,
      goal: 'Test goal',
      tasks: [],
      sessionId: 'test-123',
    } as any);

    render(
      <ChatPanel
        onStartExecution={mockOnStartExecution}
        onContinueExecution={mockOnContinueExecution}
      />
    );

    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('should show Continue Execution button when there are pending tasks', () => {
    mockUseExecutorStore.mockReturnValue({
      messages: [],
      phase: 'completed',
      isLoading: false,
      isConnected: false,
      goal: 'Test goal',
      tasks: [
        { id: '1', title: 'Task 1', status: 'completed' },
        { id: '2', title: 'Task 2', status: 'pending' },
      ],
      sessionId: 'test-123',
    } as any);

    render(
      <ChatPanel
        onStartExecution={mockOnStartExecution}
        onContinueExecution={mockOnContinueExecution}
      />
    );

    expect(screen.getByText('Continue Execution')).toBeInTheDocument();
    expect(screen.getByText(/1 incomplete task/i)).toBeInTheDocument();
  });

  it('should call onContinueExecution when Continue button clicked', () => {
    mockUseExecutorStore.mockReturnValue({
      messages: [],
      phase: 'completed',
      isLoading: false,
      isConnected: false,
      goal: 'Test goal',
      tasks: [
        { id: '1', title: 'Task 1', status: 'pending' },
      ],
      sessionId: 'test-123',
    } as any);

    render(
      <ChatPanel
        onStartExecution={mockOnStartExecution}
        onContinueExecution={mockOnContinueExecution}
      />
    );

    fireEvent.click(screen.getByText('Continue Execution'));
    expect(mockOnContinueExecution).toHaveBeenCalled();
  });
});
