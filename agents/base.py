"""Base agent class with LLM calls, logging, and event bus integration."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic import BaseModel

from coordination.events import AgentEvent, EventType, UpdatePayload
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
        self.prompt_tokens = 0
        self.completion_tokens = 0
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
                    self.prompt_tokens += usage.prompt_tokens
                    self.completion_tokens += usage.completion_tokens
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
                    self.prompt_tokens += usage.prompt_tokens
                    self.completion_tokens += usage.completion_tokens
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

    _board_discussion: list[dict[str, Any]] = []

    def log(
        self,
        message: str,
        action: str = "info",
        reasoning: str = "",
        addressed_to: str = "",
        in_response_to: str = "",
    ) -> None:
        """Log an action to the trace logger and board discussion.

        Args:
            message: The main content/decision text.
            action: Event type tag (strategy, pivot, blocker_found, etc.).
            reasoning: WHY the agent made this decision. Must not be empty for
                       board-visible actions.
            addressed_to: Which agent(s) this is directed at, if any (e.g. "CEO", "all agents").
            in_response_to: What event/action triggered this (e.g. "Legal BLOCKER: MSB licensing").
        """
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
                                     "codex_generate", "pivot_response", "simulation_review",
                                     "simulation_response", "pivot_decision"):
            BaseAgent._board_discussion.append({
                "agent": self.name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event_type": action,
                "message": message,
                "reasoning": reasoning or message,
                "addressed_to": addressed_to or "",
                "in_response_to": in_response_to or "",
                "iteration": self._current_iteration,
            })

    @classmethod
    def clear_board_discussion(cls) -> None:
        """Clear accumulated board discussion entries (call at start of each sprint)."""
        cls._board_discussion.clear()

    @classmethod
    def save_board_discussion(cls) -> None:
        """Save board discussion to JSON file."""
        os.makedirs("outputs", exist_ok=True)
        with open("outputs/board_discussion.json", "w", encoding="utf-8") as f:
            json.dump(cls._board_discussion, f, indent=2)

    @classmethod
    def get_board_discussion(cls) -> list[dict[str, Any]]:
        """Return a copy of the board discussion log."""
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

    async def respond_to_simulation_findings(self, ceo_findings: str, strategy_json: str) -> str:
        """Respond to CEO's presentation of simulation findings.

        Each agent proposes how they would adapt their work based on the market
        feedback. Override in subclasses for specialized responses.
        """
        prompt = f"""You are the {self.name} of a startup. The CEO just presented market simulation results to the executive team:

"{ceo_findings}"

Current strategy: {strategy_json}

As {self.name}, respond in 1-2 sentences with what YOU will specifically change or do differently based on this feedback. Be concrete and actionable. Reference specific concerns raised.

Respond with ONLY your response text."""

        response = await self.call_llm([
            {"role": "system", "content": f"You are a startup {self.name}. Be specific and actionable."},
            {"role": "user", "content": prompt},
        ])

        text = response.strip()
        self.log(
            text,
            action="simulation_response",
            reasoning=f"Responding to CEO's simulation findings with proposed adaptations for {self.name}'s domain. Market sentiment and stakeholder concerns require adjustments to my deliverables.",
            addressed_to="CEO",
            in_response_to="CEO simulation debrief",
        )
        return text

    async def run(self, context: dict[str, Any] | None = None) -> None:
        """Main agent execution. Override in subclasses."""
        raise NotImplementedError(f"{self.name}.run() not implemented")

    def get_cost_summary(self) -> dict[str, Any]:
        """Return cost tracking summary with per-token breakdown."""
        return {
            "agent": self.name,
            "total_tokens": self.total_tokens,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "estimated_cost_usd": round(self.estimated_cost, 4),
        }

    def reset_costs(self) -> None:
        """Clear all token and cost accumulators."""
        self.total_tokens = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.estimated_cost = 0.0

    # ------------------------------------------------------------------
    # Agent memory (file-based, persists across rounds)
    # ------------------------------------------------------------------

    def _memory_path(self) -> Path:
        """Return the path to this agent's memory file."""
        memory_dir = Path("outputs/memory")
        memory_dir.mkdir(parents=True, exist_ok=True)
        return memory_dir / f"{self.name}.json"

    def load_memory(self) -> list[dict[str, Any]]:
        """Load past memory entries from disk.

        Returns an empty list if the file does not exist yet.
        Each entry has keys: timestamp, sprint_id, key_decision, outcome.
        """
        path = self._memory_path()
        if not path.exists():
            return []
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, OSError):
            return []

    def save_memory(self, entry: dict[str, Any]) -> None:
        """Append *entry* to the agent's memory file, keeping only the last 3 entries.

        Expected entry structure: {timestamp, sprint_id, key_decision, outcome}.
        """
        entries = self.load_memory()
        entries.append(entry)
        # Keep only the most recent 3 entries
        entries = entries[-3:]
        path = self._memory_path()
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(entries, f, indent=2)
        except OSError as exc:
            self.log(f"Failed to save memory: {exc}", action="error")

    def get_memory_context(self) -> str:
        """Return a human-readable summary of past decisions for inclusion in LLM prompts.

        Returns an empty string when there are no past entries.
        """
        entries = self.load_memory()
        if not entries:
            return ""
        lines = ["PAST DECISIONS (from previous sprints):"]
        for i, e in enumerate(entries, 1):
            ts = e.get("timestamp", "unknown time")
            decision = e.get("key_decision", "")
            outcome = e.get("outcome", "")
            sprint = e.get("sprint_id", "")
            lines.append(
                f"  [{i}] Sprint {sprint} ({ts}): {decision}"
                + (f" -> Outcome: {outcome}" if outcome else "")
            )
        return "\n".join(lines)
