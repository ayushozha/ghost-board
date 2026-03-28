"""CTO Agent: Codex-powered prototype generation with pivot support."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from coordination.events import (
    AgentEvent,
    EventType,
    PivotPayload,
    PrototypePayload,
    StrategyPayload,
    UpdatePayload,
)
from coordination.state import StateBus
from coordination.trace import TraceLogger

from agents.base import BaseAgent


class CTOAgent(BaseAgent):
    """CTO agent that uses OpenAI API to generate prototype code.

    Uses the chat completions API with code-focused prompting
    (Hackathon requirement: Codex-Powered Services).
    """

    name = "CTO"
    model = "gpt-4o"

    def __init__(self, bus: StateBus, logger: TraceLogger) -> None:
        super().__init__(bus, logger)
        self.output_dir = Path("outputs/prototype")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.current_strategy: StrategyPayload | None = None
        self.subscribe(EventType.STRATEGY_SET, EventType.PIVOT)

    async def handle_event(self, event: AgentEvent) -> None:
        if event.type == EventType.STRATEGY_SET:
            payload = event.payload
            if isinstance(payload, StrategyPayload):
                self.current_strategy = payload
        elif event.type == EventType.PIVOT:
            await self.handle_pivot(event)

    async def generate_prototype(self, strategy: StrategyPayload) -> PrototypePayload:
        """Generate a working prototype using OpenAI code generation."""
        self.current_strategy = strategy
        self.log("Generating prototype code", action="codex_generate")

        prompt = f"""You are a senior software engineer building a working prototype.

Startup: {strategy.startup_idea}
Target market: {strategy.target_market}
Business model: {strategy.business_model}
Key differentiators: {', '.join(strategy.key_differentiators)}
Constraints: {', '.join(strategy.constraints)}

Generate a Python prototype with:
1. A main application file (app.py) with core business logic
2. A data models file (models.py) with Pydantic models
3. An API routes file (routes.py) with key endpoints using FastAPI-style definitions

For each file, respond in this JSON format:
{{
  "files": [
    {{"filename": "app.py", "content": "...full code...", "description": "..."}},
    {{"filename": "models.py", "content": "...full code...", "description": "..."}},
    {{"filename": "routes.py", "content": "...full code...", "description": "..."}}
  ],
  "description": "Overall prototype description"
}}

Write REAL working code, not pseudocode. Include imports, type hints, and docstrings."""

        response = await self.call_llm(
            [
                {"role": "system", "content": "You are a Codex-powered code generation engine. Output only valid JSON with working Python code."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=4096,
        )

        files_generated = []
        description = ""

        try:
            data = json.loads(response.strip().removeprefix("```json").removesuffix("```").strip())
            files = data.get("files", [])
            description = data.get("description", "")

            for file_info in files:
                filename = file_info["filename"]
                content = file_info["content"]
                filepath = self.output_dir / filename
                filepath.write_text(content, encoding="utf-8")
                files_generated.append(str(filepath))
                self.log(f"Generated {filename}", action="file_write")

        except (json.JSONDecodeError, KeyError) as e:
            self.log(f"Parse error, saving raw response: {e}", action="error")
            raw_path = self.output_dir / "prototype_raw.py"
            raw_path.write_text(response, encoding="utf-8")
            files_generated.append(str(raw_path))
            description = "Raw prototype (parse failed)"

        payload = PrototypePayload(
            files_generated=files_generated,
            language="python",
            description=description,
            output_dir=str(self.output_dir),
        )

        await self.publish(AgentEvent(
            type=EventType.PROTOTYPE_READY,
            source=self.name,
            payload=payload,
            iteration=self._current_iteration,
        ))

        return payload

    async def handle_pivot(self, event: AgentEvent) -> None:
        """Handle a PIVOT event by modifying the prototype."""
        payload = event.payload
        if not isinstance(payload, PivotPayload):
            return

        changes = payload.changes_required.get("CTO", "Update prototype to match new strategy")
        self.log(f"Handling pivot: {changes}", action="pivot_response")

        # Re-generate with the new strategy
        new_strategy_data = {}
        try:
            new_strategy_data = json.loads(payload.new_strategy)
        except json.JSONDecodeError:
            pass

        if new_strategy_data:
            new_strategy = StrategyPayload(**new_strategy_data)
        elif self.current_strategy:
            new_strategy = self.current_strategy
        else:
            return

        self._current_iteration += 1
        await self.generate_prototype(new_strategy)

    async def run(self, context: dict[str, Any] | None = None) -> None:
        """Run CTO agent - waits for strategy, then generates prototype."""
        if self.current_strategy:
            await self.generate_prototype(self.current_strategy)
        else:
            self.log("Waiting for strategy from CEO", action="waiting")
