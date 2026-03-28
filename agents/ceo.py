"""CEO Agent: Strategy setting, blocker handling, pivot decisions."""

from __future__ import annotations

import json
from typing import Any

from coordination.events import (
    AgentEvent,
    BlockerPayload,
    EventType,
    PivotPayload,
    SimulationResultPayload,
    StrategyPayload,
)
from coordination.state import StateBus
from coordination.trace import TraceLogger

from agents.base import BaseAgent


class CEOAgent(BaseAgent):
    name = "CEO"
    model = "gpt-4o"

    MAX_PIVOTS = 3  # Prevent infinite cascade loops

    def __init__(self, bus: StateBus, logger: TraceLogger) -> None:
        super().__init__(bus, logger)
        self.current_strategy: StrategyPayload | None = None
        self.blockers: list[AgentEvent] = []
        self.pivot_count = 0
        self.subscribe(EventType.BLOCKER, EventType.SIMULATION_RESULT)

    async def handle_event(self, event: AgentEvent) -> None:
        if event.type == EventType.BLOCKER:
            await self.process_blocker(event)
        elif event.type == EventType.SIMULATION_RESULT:
            await self.process_simulation_result(event)

    async def set_strategy(self, startup_idea: str, context: dict[str, Any] | None = None) -> StrategyPayload:
        """Generate initial strategy using LLM."""
        self.log("Setting initial strategy", action="strategy")

        prompt = f"""You are the CEO of a startup. Define a clear strategy for:
Idea: {startup_idea}

Additional context: {json.dumps(context or {})}

Respond in JSON with these exact fields:
- startup_idea: string
- target_market: string
- business_model: string (e.g., SaaS, marketplace, API)
- key_differentiators: list of strings
- constraints: list of strings (regulatory, technical, market)"""

        response = await self.call_llm([
            {"role": "system", "content": "You are a startup CEO. Respond only with valid JSON."},
            {"role": "user", "content": prompt},
        ])

        try:
            data = json.loads(response.strip().removeprefix("```json").removesuffix("```").strip())
            strategy = StrategyPayload(**data)
        except (json.JSONDecodeError, Exception):
            strategy = StrategyPayload(
                startup_idea=startup_idea,
                target_market="general",
                business_model="SaaS",
            )

        self.current_strategy = strategy
        await self.publish(AgentEvent(
            type=EventType.STRATEGY_SET,
            source=self.name,
            payload=strategy,
            iteration=self._current_iteration,
        ))

        return strategy

    async def process_blocker(self, event: AgentEvent) -> None:
        """Process a BLOCKER event and decide whether to pivot."""
        self.blockers.append(event)
        payload = event.payload
        if not isinstance(payload, BlockerPayload):
            return

        self.log(f"Processing blocker: {payload.severity} - {payload.description}", action="blocker_review")

        if self.pivot_count >= self.MAX_PIVOTS:
            self.log(f"Max pivots ({self.MAX_PIVOTS}) reached, absorbing blocker", action="max_pivots")
            return

        if payload.severity in ("CRITICAL", "HIGH") and self.current_strategy:
            await self._pivot(
                reason=f"Legal blocker ({payload.severity}): {payload.description}",
                triggered_by=event.id,
            )

    async def process_simulation_result(self, event: AgentEvent) -> None:
        """Process simulation results and decide whether to pivot."""
        payload = event.payload
        if not isinstance(payload, SimulationResultPayload):
            return

        self.log(f"Reviewing simulation: sentiment={payload.overall_sentiment:.2f}", action="simulation_review")

        if self.pivot_count >= self.MAX_PIVOTS:
            self.log(f"Max pivots ({self.MAX_PIVOTS}) reached, absorbing simulation signal", action="max_pivots")
            return

        if payload.pivot_recommended and self.current_strategy:
            await self._pivot(
                reason=f"Market simulation: {payload.pivot_suggestion}",
                triggered_by=event.id,
            )

    async def _pivot(self, reason: str, triggered_by: str | None = None) -> PivotPayload:
        """Execute a strategy pivot using LLM reasoning."""
        self.pivot_count += 1
        self.log(f"Pivot #{self.pivot_count}: {reason}", action="pivot")

        old_strategy_str = self.current_strategy.model_dump_json() if self.current_strategy else "{}"

        prompt = f"""You are a startup CEO. You need to pivot your strategy.

Current strategy: {old_strategy_str}
Reason for pivot: {reason}
Previous pivots: {self.pivot_count - 1}

Define the NEW strategy. Respond in JSON:
- startup_idea: string (refined version)
- target_market: string (may change)
- business_model: string
- key_differentiators: list of strings
- constraints: list of strings
- pivot_reason: string (one sentence summary of why)
- changes_for_cto: string (what CTO needs to change)
- changes_for_cfo: string (what CFO needs to change)
- changes_for_cmo: string (what CMO needs to change)"""

        response = await self.call_llm([
            {"role": "system", "content": "You are a startup CEO making a strategic pivot. Respond only with valid JSON."},
            {"role": "user", "content": prompt},
        ])

        try:
            data = json.loads(response.strip().removeprefix("```json").removesuffix("```").strip())
        except json.JSONDecodeError:
            data = {}

        new_strategy = StrategyPayload(
            startup_idea=data.get("startup_idea", self.current_strategy.startup_idea if self.current_strategy else ""),
            target_market=data.get("target_market", ""),
            business_model=data.get("business_model", ""),
            key_differentiators=data.get("key_differentiators", []),
            constraints=data.get("constraints", []),
            iteration=self._current_iteration + 1,
        )

        pivot_payload = PivotPayload(
            reason=reason,
            old_strategy=old_strategy_str,
            new_strategy=new_strategy.model_dump_json(),
            affected_agents=["CTO", "CFO", "CMO"],
            changes_required={
                "CTO": data.get("changes_for_cto", "Update prototype"),
                "CFO": data.get("changes_for_cfo", "Update financial model"),
                "CMO": data.get("changes_for_cmo", "Update positioning"),
            },
            iteration=self._current_iteration + 1,
        )

        self.current_strategy = new_strategy
        self._current_iteration += 1

        await self.publish(AgentEvent(
            type=EventType.PIVOT,
            source=self.name,
            payload=pivot_payload,
            triggered_by=triggered_by,
            iteration=self._current_iteration,
        ))

        # Also publish the new strategy
        await self.publish(AgentEvent(
            type=EventType.STRATEGY_SET,
            source=self.name,
            payload=new_strategy,
            triggered_by=triggered_by,
            iteration=self._current_iteration,
        ))

        return pivot_payload

    async def run(self, context: dict[str, Any] | None = None) -> None:
        """Run the CEO agent (initial strategy phase)."""
        ctx = context or {}
        idea = ctx.get("startup_idea", "AI-powered compliance automation")
        await self.set_strategy(idea, ctx)
