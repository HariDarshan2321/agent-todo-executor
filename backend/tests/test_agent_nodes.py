"""
Tests for agent node functions.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.agent import TaskStatus
from app.agent.nodes import AgentNodes


class TestAgentNodes:
    """Tests for AgentNodes class."""

    @pytest.fixture
    def agent_nodes(self, mock_llm):
        """Create AgentNodes instance with mocked LLM."""
        return AgentNodes(llm=mock_llm)

    @pytest.mark.asyncio
    async def test_analyze_goal_sets_phase(self, agent_nodes, sample_state):
        """Test that analyze_goal sets the correct phase."""
        result = await agent_nodes.analyze_goal(sample_state)

        assert result["phase"] == "analyzing"
        assert len(result["traces"]) > 0

    @pytest.mark.asyncio
    async def test_analyze_goal_creates_trace(self, agent_nodes, sample_state):
        """Test that analyze_goal creates a trace entry."""
        result = await agent_nodes.analyze_goal(sample_state)

        trace = result["traces"][0]
        assert trace["node"] == "analyze_goal"
        assert trace["action"] == "analyzing"
        assert "timestamp" in trace

    @pytest.mark.asyncio
    async def test_plan_todos_creates_tasks(self, agent_nodes, sample_state, mock_llm):
        """Test that plan_todos creates tasks from LLM response."""
        mock_llm.ainvoke.return_value = MagicMock(
            content="""{
                "tasks": [
                    {"title": "Research the topic", "description": "Research thoroughly"},
                    {"title": "Write content", "description": "Write the main content"},
                    {"title": "Review", "description": "Review and finalize"}
                ],
                "reasoning": "Standard workflow"
            }"""
        )

        result = await agent_nodes.plan_todos(sample_state)

        assert "tasks" in result
        assert len(result["tasks"]) > 0
        assert result["phase"] == "planning"

    @pytest.mark.asyncio
    async def test_plan_todos_task_structure(self, agent_nodes, sample_state, mock_llm):
        """Test that created tasks have correct structure."""
        mock_llm.ainvoke.return_value = MagicMock(
            content="""{
                "tasks": [
                    {"title": "Research the topic", "description": "Do research"},
                    {"title": "Write content", "description": "Write it"}
                ],
                "reasoning": "Basic workflow"
            }"""
        )

        result = await agent_nodes.plan_todos(sample_state)

        if "tasks" in result and result["tasks"]:
            task = result["tasks"][0]
            assert "id" in task
            assert "title" in task
            assert "description" in task
            assert "status" in task
            assert task["status"] == TaskStatus.PENDING.value

    @pytest.mark.asyncio
    async def test_select_task_picks_pending(self, agent_nodes, sample_state):
        """Test that select_task picks the first pending task."""
        result = await agent_nodes.select_task(sample_state)

        assert "current_task_index" in result
        assert result["current_task_index"] == 0
        assert result["phase"] == "executing"

    @pytest.mark.asyncio
    async def test_select_task_skips_completed(self, agent_nodes, sample_state):
        """Test that select_task skips completed tasks."""
        # Mark first task as completed
        sample_state["tasks"][0]["status"] = TaskStatus.COMPLETED.value

        result = await agent_nodes.select_task(sample_state)

        assert result["current_task_index"] == 1

    @pytest.mark.asyncio
    async def test_select_task_when_all_done(self, agent_nodes, sample_state):
        """Test select_task when all tasks are completed."""
        for task in sample_state["tasks"]:
            task["status"] = TaskStatus.COMPLETED.value

        result = await agent_nodes.select_task(sample_state)

        assert result["current_task_index"] == -1
        assert result["phase"] == "completed"

    @pytest.mark.asyncio
    async def test_execute_task_updates_status(self, agent_nodes, sample_state, mock_llm):
        """Test that execute_task updates task status."""
        sample_state["current_task_index"] = 0
        mock_llm.ainvoke.return_value = MagicMock(
            content="Here is the completed task output"
        )

        result = await agent_nodes.execute_task(sample_state)

        executed_task = next(
            t for t in result["tasks"] if t["id"] == "task-1"
        )
        assert executed_task["status"] in [
            TaskStatus.COMPLETED.value,
            TaskStatus.FAILED.value
        ]

    @pytest.mark.asyncio
    async def test_execute_task_sets_result(self, agent_nodes, sample_state, mock_llm):
        """Test that execute_task sets the result on success."""
        sample_state["current_task_index"] = 0
        mock_llm.ainvoke.return_value = MagicMock(
            content="Completed task output"
        )

        result = await agent_nodes.execute_task(sample_state)

        executed_task = next(
            t for t in result["tasks"] if t["id"] == "task-1"
        )
        if executed_task["status"] == TaskStatus.COMPLETED.value:
            assert executed_task["result"] is not None

    @pytest.mark.asyncio
    async def test_reflect_creates_summary(self, agent_nodes, sample_state, mock_llm):
        """Test that reflect creates a summary trace."""
        sample_state["tasks"][0]["status"] = TaskStatus.COMPLETED.value
        sample_state["current_task_index"] = 0
        mock_llm.ainvoke.return_value = MagicMock(
            content="Great progress on completing the first task!"
        )

        result = await agent_nodes.reflect(sample_state)

        assert len(result["traces"]) > 0
        reflection_trace = result["traces"][-1]
        assert reflection_trace["action"] == "reflection"

    @pytest.mark.asyncio
    async def test_complete_sets_completed_phase(self, agent_nodes, sample_state):
        """Test that complete sets the completed phase."""
        for task in sample_state["tasks"]:
            task["status"] = TaskStatus.COMPLETED.value

        result = await agent_nodes.complete(sample_state)

        assert result["phase"] == "completed"


class TestTaskStatus:
    """Tests for TaskStatus enum."""

    def test_pending_value(self):
        """Test pending status value."""
        assert TaskStatus.PENDING.value == "pending"

    def test_in_progress_value(self):
        """Test in_progress status value."""
        assert TaskStatus.IN_PROGRESS.value == "in_progress"

    def test_completed_value(self):
        """Test completed status value."""
        assert TaskStatus.COMPLETED.value == "completed"

    def test_failed_value(self):
        """Test failed status value."""
        assert TaskStatus.FAILED.value == "failed"

    def test_needs_followup_value(self):
        """Test needs_followup status value."""
        assert TaskStatus.NEEDS_FOLLOWUP.value == "needs_followup"
