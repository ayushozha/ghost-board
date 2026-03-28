"""Base agent class with LLM calls, logging, and event bus integration."""

from __future__ import annotations

import asyncio
import os
from typing import Any

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic import BaseModel

from coordination.events import AgentEvent, EventType
from coordination.state import StateBus
from coordination.trace import TraceLogger

load_dotenv()

# Cost estimates per 1M tokens (gpt-4o / gpt-4o-mini)
MODEL_COSTS = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
}


class BaseAgent:
    """Base class for all Ghost Board agents.

    Provides:
    - Async LLM calls via OpenAI API
    - Event bus publishing and subscription
    - W&B / JSON trace logging
    - Cost tracking
    """

    name: str = "BaseAgent"
    model: str = "gpt-4o"

    def __init__(self, bus: StateBus, logger: TraceLogger) -> None:
        self.bus = bus
        self.logger = logger
        self.client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
        self.total_tokens = 0
        self.estimated_cost = 0.0
        self._current_iteration = 1

    async def call_llm(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: type[BaseModel] | None = None,
        retries: int = 3,
    ) -> str:
        """Make an async LLM call with retry and track usage."""
        use_model = model or self.model
        self.log(f"Calling {use_model}", action="llm_call")

        kwargs: dict[str, Any] = {
            "model": use_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        last_error: Exception | None = None
        for attempt in range(retries):
            try:
                response = await self.client.chat.completions.create(**kwargs)

                content = response.choices[0].message.content or ""
                usage = response.usage
                if usage:
                    self.total_tokens += usage.total_tokens
                    costs = MODEL_COSTS.get(use_model, MODEL_COSTS["gpt-4o"])
                    self.estimated_cost += (
                        usage.prompt_tokens * costs["input"] / 1_000_000
                        + usage.completion_tokens * costs["output"] / 1_000_000
                    )

                return content
            except Exception as e:
                last_error = e
                if attempt < retries - 1:
                    wait = 2 ** attempt
                    self.log(f"LLM call failed (attempt {attempt + 1}/{retries}), retrying in {wait}s: {e}", action="retry")
                    await asyncio.sleep(wait)

        # All retries exhausted - return degraded result instead of crashing
        self.log(f"LLM call failed after {retries} attempts: {last_error}", action="error")
        return "{}"

    async def call_llm_with_tools(
        self,
        messages: list[dict[str, str]],
        tools: list[dict[str, Any]],
        model: str | None = None,
        temperature: float = 0.7,
        retries: int = 3,
    ) -> Any:
        """Make an LLM call with tool/function definitions and retry."""
        use_model = model or self.model
        self.log(f"Calling {use_model} with tools", action="llm_tool_call")

        last_error: Exception | None = None
        for attempt in range(retries):
            try:
                response = await self.client.chat.completions.create(
                    model=use_model,
                    messages=messages,
                    tools=tools,
                    temperature=temperature,
                )

                usage = response.usage
                if usage:
                    self.total_tokens += usage.total_tokens
                    costs = MODEL_COSTS.get(use_model, MODEL_COSTS["gpt-4o"])
                    self.estimated_cost += (
                        usage.prompt_tokens * costs["input"] / 1_000_000
                        + usage.completion_tokens * costs["output"] / 1_000_000
                    )

                return response
            except Exception as e:
                last_error = e
                if attempt < retries - 1:
                    wait = 2 ** attempt
                    self.log(f"Tool call failed (attempt {attempt + 1}/{retries}), retrying in {wait}s: {e}", action="retry")
                    await asyncio.sleep(wait)

        self.log(f"Tool call failed after {retries} attempts: {last_error}", action="error")
        return None

    _board_discussion: list[dict] = []

    def log(self, message: str, action: str = "info", reasoning: str = "") -> None:
        """Log an action to the trace logger and board discussion."""
        from coordination.events import UpdatePayload

        event = AgentEvent(
            type=EventType.UPDATE,
            source=self.name,
            payload=UpdatePayload(
                agent=self.name,
                action=action,
                details=message,
            ),
            iteration=self._current_iteration,
        )
        self.logger.log_event(event)

        # Board discussion entry
        if reasoning or action in ("strategy", "pivot", "blocker_found", "blocker_review",
                                     "compliance_scan", "financial_model", "gtm_generate",
                                     "codex_generate", "pivot_response", "simulation_review"):
            from datetime import datetime, timezone
            BaseAgent._board_discussion.append({
                "agent": self.name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event_type": action,
                "message": message,
                "reasoning": reasoning or message,
                "iteration": self._current_iteration,
            })

    @classmethod
    def save_board_discussion(cls) -> None:
        """Save board discussion to JSON file."""
        import json, os
        os.makedirs("outputs", exist_ok=True)
        with open("outputs/board_discussion.json", "w", encoding="utf-8") as f:
            json.dump(cls._board_discussion, f, indent=2)

    @classmethod
    def get_board_discussion(cls) -> list[dict]:
        return list(cls._board_discussion)

    async def publish(self, event: AgentEvent) -> None:
        """Publish an event to the bus and log it."""
        self.logger.log_event(event)
        await self.bus.publish(event)

    async def handle_event(self, event: AgentEvent) -> None:
        """Handle an incoming event. Override in subclasses."""
        pass

    def subscribe(self, *event_types: EventType) -> None:
        """Subscribe this agent to specific event types on the bus."""
        for et in event_types:
            self.bus.subscribe(et, self.handle_event)

    async def run(self, context: dict[str, Any] | None = None) -> None:
        """Main agent execution. Override in subclasses."""
        raise NotImplementedError(f"{self.name}.run() not implemented")

    def get_cost_summary(self) -> dict[str, Any]:
        """Return cost tracking summary."""
        return {
            "agent": self.name,
            "total_tokens": self.total_tokens,
            "estimated_cost_usd": round(self.estimated_cost, 4),
        }
