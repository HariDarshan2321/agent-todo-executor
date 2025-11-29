"""
LangGraph Node Functions.
Each node is a pure function that takes state and returns state updates.
"""

import asyncio
import random
from datetime import datetime
from typing import Any
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from .state import AgentState, Task, TaskStatus, TraceEntry, ExecutionPhase


def create_trace(node: str, action: str, message: str, task_id: str = None, details: dict = None) -> dict:
    """Helper to create a trace entry."""
    return TraceEntry(
        timestamp=datetime.utcnow(),
        node=node,
        action=action,
        task_id=task_id,
        message=message,
        details=details
    ).model_dump()


class AgentNodes:
    """
    Collection of node functions for the TODO executor agent.

    Design principles:
    - Each node is focused on a single responsibility
    - Nodes return only state updates (not full state)
    - All LLM calls are isolated and traceable
    """

    def __init__(self, llm: ChatOpenAI):
        self.llm = llm

    async def analyze_goal(self, state: AgentState) -> dict:
        """
        Analyze the user's goal and prepare for planning.
        This node validates the goal and extracts key requirements.
        """
        goal = state["goal"]

        trace = create_trace(
            node="analyze_goal",
            action="analyzing",
            message=f"Analyzing goal: {goal[:100]}..."
        )

        # Quick validation - in production, this could do more analysis
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content="""You are a task planning assistant.
Briefly acknowledge the user's goal and confirm you'll create a task list.
Be concise - 1-2 sentences max."""),
            HumanMessage(content=f"Goal: {goal}")
        ])

        response = await self.llm.ainvoke(prompt.format_messages())

        return {
            "phase": ExecutionPhase.ANALYZING.value,
            "messages": [AIMessage(content=response.content)],
            "traces": [trace]
        }

    async def plan_todos(self, state: AgentState) -> dict:
        """
        Generate a structured TODO list from the user's goal.
        Uses Tree of Thoughts approach - generate, then refine.
        """
        goal = state["goal"]

        trace_start = create_trace(
            node="plan_todos",
            action="planning_started",
            message="Generating task breakdown..."
        )

        # Structured output prompt for reliable JSON
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content="""You are an expert task planner. Break down the user's goal into 3-6 concrete, actionable tasks.

Output ONLY valid JSON in this exact format:
{
  "tasks": [
    {"title": "Task title", "description": "Brief description of what to do"},
    {"title": "Another task", "description": "Its description"}
  ],
  "reasoning": "Brief explanation of why you chose these tasks"
}

Rules:
- Each task should be independently executable
- Tasks should be in logical order
- Be specific and actionable
- Keep descriptions under 100 characters"""),
            HumanMessage(content=f"Break down this goal into tasks:\n\n{goal}")
        ])

        response = await self.llm.ainvoke(prompt.format_messages())

        # Parse the response
        try:
            import json
            # Clean up response - handle markdown code blocks
            content = response.content.strip()
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            content = content.strip()

            result = json.loads(content)
            tasks_data = result.get("tasks", [])
            reasoning = result.get("reasoning", "")

            # Create Task objects
            tasks = []
            for t in tasks_data:
                task = Task.create(
                    title=t["title"],
                    description=t["description"]
                )
                tasks.append(task.model_dump())

            trace_complete = create_trace(
                node="plan_todos",
                action="planning_complete",
                message=f"Created {len(tasks)} tasks. {reasoning}",
                details={"task_count": len(tasks)}
            )

            # Create a nice message for the user
            task_list = "\n".join([f"  {i+1}. **{t['title']}** - {t['description']}"
                                   for i, t in enumerate(tasks)])
            ai_message = f"I've broken down your goal into {len(tasks)} tasks:\n\n{task_list}\n\nStarting execution..."

            return {
                "phase": ExecutionPhase.PLANNING.value,
                "tasks": tasks,
                "messages": [AIMessage(content=ai_message)],
                "traces": [trace_start, trace_complete]
            }

        except (json.JSONDecodeError, KeyError) as e:
            trace_error = create_trace(
                node="plan_todos",
                action="planning_error",
                message=f"Failed to parse task list: {str(e)}"
            )
            return {
                "phase": ExecutionPhase.ERROR.value,
                "error": f"Failed to generate task list: {str(e)}",
                "traces": [trace_start, trace_error]
            }

    async def select_task(self, state: AgentState) -> dict:
        """
        Select the next task to execute.
        Simple policy: first pending task.
        """
        tasks = state["tasks"]

        # Find first pending task
        for i, task in enumerate(tasks):
            if task["status"] == TaskStatus.PENDING.value:
                trace = create_trace(
                    node="select_task",
                    action="task_selected",
                    message=f"Selected task: {task['title']}",
                    task_id=task["id"]
                )
                return {
                    "current_task_index": i,
                    "phase": ExecutionPhase.EXECUTING.value,
                    "traces": [trace]
                }

        # No pending tasks - we're done
        trace = create_trace(
            node="select_task",
            action="all_tasks_complete",
            message="All tasks have been processed"
        )
        return {
            "current_task_index": -1,
            "phase": ExecutionPhase.COMPLETED.value,
            "traces": [trace]
        }

    async def execute_task(self, state: AgentState) -> dict:
        """
        Execute the current task using LLM to generate real output.

        The agent generates actual content/deliverables for each task
        based on the task description and overall goal.
        """
        task_index = state["current_task_index"]
        tasks = state["tasks"]
        goal = state.get("goal", "")

        if task_index < 0 or task_index >= len(tasks):
            return {"error": "Invalid task index"}

        task = tasks[task_index].copy()

        trace_start = create_trace(
            node="execute_task",
            action="execution_started",
            message=f"Starting: {task['title']}",
            task_id=task["id"]
        )

        # Update task to in_progress
        task["status"] = TaskStatus.IN_PROGRESS.value
        task["started_at"] = datetime.utcnow().isoformat()

        try:
            # Generate real output using LLM
            prompt = ChatPromptTemplate.from_messages([
                SystemMessage(content="""You are an expert task executor. Execute the given task and provide a concrete, actionable output.

Your response should be the ACTUAL DELIVERABLE for this task - not just a description of what to do.

For example:
- If the task is "Write a headline", output the actual headline text
- If the task is "Create HTML structure", output the actual HTML code
- If the task is "Define color scheme", output the actual colors (hex codes)
- If the task is "Write copy", output the actual text content

Be specific and provide real, usable output. Keep responses concise but complete (under 500 characters).
Format code blocks with triple backticks if providing code."""),
                HumanMessage(content=f"""Goal: {goal}

Task to execute: {task['title']}
Description: {task['description']}

Please execute this task and provide the actual output/deliverable:""")
            ])

            response = await self.llm.ainvoke(prompt.format_messages())
            result_content = response.content.strip()

            task["status"] = TaskStatus.COMPLETED.value
            task["result"] = result_content
            task["completed_at"] = datetime.utcnow().isoformat()

            trace_complete = create_trace(
                node="execute_task",
                action="execution_success",
                message=f"Completed: {task['title']}",
                task_id=task["id"],
                details={"output_length": len(result_content)}
            )

        except Exception as e:
            task["status"] = TaskStatus.FAILED.value
            task["error"] = f"Execution failed: {str(e)}"
            task["completed_at"] = datetime.utcnow().isoformat()

            trace_complete = create_trace(
                node="execute_task",
                action="execution_failed",
                message=f"Failed: {task['title']} - {str(e)}",
                task_id=task["id"]
            )

        # Update just this task in the list
        updated_tasks = tasks.copy()
        updated_tasks[task_index] = task

        return {
            "tasks": updated_tasks,
            "traces": [trace_start, trace_complete]
        }

    async def reflect(self, state: AgentState) -> dict:
        """
        Reflect on the execution result and decide next action.
        This provides transparency into agent reasoning.
        """
        task_index = state["current_task_index"]
        tasks = state["tasks"]
        task = tasks[task_index]

        # Count progress
        completed = sum(1 for t in tasks if t["status"] == TaskStatus.COMPLETED.value)
        failed = sum(1 for t in tasks if t["status"] == TaskStatus.FAILED.value)
        total = len(tasks)

        # Generate reflection using LLM
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content="""You are reflecting on task execution progress.
Give a brief (1 sentence) status update on the completed task and overall progress.
Be encouraging but factual."""),
            HumanMessage(content=f"""
Task completed: {task['title']}
Status: {task['status']}
Result: {task.get('result') or task.get('error', 'N/A')}

Overall progress: {completed}/{total} completed, {failed} failed
""")
        ])

        response = await self.llm.ainvoke(prompt.format_messages())

        trace = create_trace(
            node="reflect",
            action="reflection",
            message=response.content,
            task_id=task["id"],
            details={
                "completed": completed,
                "failed": failed,
                "total": total,
                "progress_percent": round((completed + failed) / total * 100)
            }
        )

        return {
            "phase": ExecutionPhase.REFLECTING.value,
            "messages": [AIMessage(content=response.content)],
            "traces": [trace]
        }

    async def complete(self, state: AgentState) -> dict:
        """
        Final node - summarize execution results.
        """
        tasks = state["tasks"]
        completed = sum(1 for t in tasks if t["status"] == TaskStatus.COMPLETED.value)
        failed = sum(1 for t in tasks if t["status"] == TaskStatus.FAILED.value)

        summary = f"✅ Execution complete!\n\n"
        summary += f"**Results:** {completed}/{len(tasks)} tasks completed"
        if failed > 0:
            summary += f", {failed} failed"
        summary += "\n\n**Task Summary:**\n"

        for task in tasks:
            status_emoji = "✓" if task["status"] == TaskStatus.COMPLETED.value else "✗"
            summary += f"- {status_emoji} {task['title']}\n"

        trace = create_trace(
            node="complete",
            action="execution_complete",
            message=f"Finished: {completed}/{len(tasks)} tasks completed",
            details={"completed": completed, "failed": failed}
        )

        return {
            "phase": ExecutionPhase.COMPLETED.value,
            "messages": [AIMessage(content=summary)],
            "traces": [trace]
        }
