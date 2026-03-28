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
        self.log(
            f"Strategy: {strategy.startup_idea} - {strategy.business_model} for {strategy.target_market}",
            action="strategy",
            reasoning=f"Chose {strategy.business_model} model because it aligns with {strategy.target_market}. Key differentiators: {', '.join(strategy.key_differentiators)}. Constraints to address: {', '.join(strategy.constraints)}.",
        )
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
            # Build a precise trigger quote including citations
            citations_str = "; ".join(payload.citations) if payload.citations else "no citations"
            trigger_quote = (
                f"[Legal BLOCKER - {payload.severity}] {payload.description} "
                f"(Citations: {citations_str}). "
                f"Recommended action: {payload.recommended_action}"
            )
            await self._pivot(
                reason=f"Legal blocker ({payload.severity}): {payload.description}",
                trigger_quote=trigger_quote,
                triggered_by=event.id,
            )

    async def present_simulation_findings(self, payload: SimulationResultPayload) -> str:
        """CEO presents simulation findings to the board for discussion."""
        concerns = ", ".join(payload.key_concerns[:5]) if payload.key_concerns else "none flagged"
        strengths = ", ".join(payload.key_strengths[:5]) if payload.key_strengths else "none noted"
        strategy_str = self.current_strategy.model_dump_json() if self.current_strategy else "{}"

        prompt = f"""You are a CEO presenting market simulation results to your executive team.

Simulation data:
- Overall sentiment: {payload.overall_sentiment:.2f} (-1 negative, +1 positive)
- Confidence: {payload.confidence:.2f}
- Key concerns from simulated stakeholders: {concerns}
- Key strengths noted: {strengths}
- Pivot recommendation: {"Yes - " + (payload.pivot_suggestion or "") if payload.pivot_recommended else "No"}
- Current strategy: {strategy_str}

Present findings in 2-3 sentences. Be specific about what VCs, journalists, early adopters, and competitors said. Reference specific concerns and positive signals. End by asking each executive how they would adapt.

Respond with ONLY the presentation text, no JSON."""

        response = await self.call_llm([
            {"role": "system", "content": "You are a startup CEO presenting market research findings concisely."},
            {"role": "user", "content": prompt},
        ])

        findings = response.strip()
        self.log(
            findings,
            action="simulation_review",
            reasoning=f"Presenting simulation results to board. Sentiment: {payload.overall_sentiment:.2f}, concerns: {concerns}, strengths: {strengths}. Asking team to propose adaptations before making pivot decision.",
        )
        return findings

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
            # Build a detailed trigger quote from simulation data
            concerns = "; ".join(payload.key_concerns[:5]) if payload.key_concerns else "general negative sentiment"
            strengths = "; ".join(payload.key_strengths[:3]) if payload.key_strengths else "none noted"
            trigger_quote = (
                f"[Market Simulation Result] Overall sentiment: {payload.overall_sentiment:.2f}, "
                f"confidence: {payload.confidence:.2f}. "
                f"Key concerns from stakeholders: {concerns}. "
                f"Strengths noted: {strengths}. "
                f"Pivot suggestion: {payload.pivot_suggestion}"
            )
            await self._pivot(
                reason=f"Market simulation: {payload.pivot_suggestion}",
                trigger_quote=trigger_quote,
                triggered_by=event.id,
            )

    async def _pivot(
        self,
        reason: str,
        trigger_quote: str = "",
        triggered_by: str | None = None,
    ) -> PivotPayload:
        """Execute a strategy pivot using structured LLM reasoning.

        The pivot produces rich reasoning with 5 components:
        1. Exact trigger quote
        2. Options considered (2-3 alternatives)
        3. Chosen direction with rationale
        4. Expected impact on each agent
        5. Risk assessment
        """
        self.pivot_count += 1
        self.log(
            f"Pivot #{self.pivot_count}: {reason}",
            action="pivot",
            reasoning=(
                f"Triggering pivot because: {reason}. "
                f"Exact trigger: \"{trigger_quote}\". "
                f"This is pivot #{self.pivot_count}. "
                f"Evaluating 2-3 strategic alternatives before choosing direction."
            ),
        )

        old_strategy_str = self.current_strategy.model_dump_json() if self.current_strategy else "{}"

        prompt = f"""You are a startup CEO. You need to pivot your strategy based on a critical signal.

CURRENT STRATEGY:
{old_strategy_str}

TRIGGER (exact text that forced this pivot):
"{trigger_quote or reason}"

PREVIOUS PIVOTS: {self.pivot_count - 1}

You MUST think through this pivot carefully. Respond in JSON with ALL of the following fields:

{{
  "trigger_quote": "<copy the exact trigger text above that caused this pivot>",
  "options_considered": [
    {{
      "option": "<brief name of alternative 1>",
      "description": "<1-2 sentence description of this alternative>",
      "pros": "<key advantages>",
      "cons": "<key disadvantages>"
    }},
    {{
      "option": "<brief name of alternative 2>",
      "description": "<1-2 sentence description>",
      "pros": "<key advantages>",
      "cons": "<key disadvantages>"
    }},
    {{
      "option": "<brief name of alternative 3>",
      "description": "<1-2 sentence description>",
      "pros": "<key advantages>",
      "cons": "<key disadvantages>"
    }}
  ],
  "chosen_option": "<name of the option you chose>",
  "rationale": "<2-3 sentences explaining WHY you chose this option over the others>",
  "risk_assessment": "<1-2 sentences on what could go wrong with this pivot and how to mitigate>",
  "startup_idea": "<refined startup idea after pivot>",
  "target_market": "<may change>",
  "business_model": "<may change>",
  "key_differentiators": ["<list of strings>"],
  "constraints": ["<list of strings>"],
  "impact_on_cto": "<specific changes CTO must make to prototype, endpoints, architecture>",
  "impact_on_cfo": "<specific changes CFO must make to financial model, projections, costs>",
  "impact_on_cmo": "<specific changes CMO must make to positioning, messaging, channels>",
  "impact_on_legal": "<specific changes Legal must review or update in compliance analysis>"
}}

Be SPECIFIC. Reference concrete numbers, regulations, market segments, and technical changes. Do not use vague language like 'adjust accordingly'."""

        response = await self.call_llm([
            {"role": "system", "content": (
                "You are a startup CEO making a strategic pivot. "
                "You consider multiple alternatives before deciding. "
                "Respond only with valid JSON. No markdown fences."
            )},
            {"role": "user", "content": prompt},
        ])

        try:
            data = json.loads(response.strip().removeprefix("```json").removesuffix("```").strip())
        except json.JSONDecodeError:
            data = {}

        # --- Extract structured pivot reasoning ---
        trigger_quote_from_llm = data.get("trigger_quote", trigger_quote or reason)
        options_considered = data.get("options_considered", [
            {"option": "Stay the course", "description": "Continue current strategy", "pros": "No disruption", "cons": "Does not address the trigger"},
            {"option": "Minor adjustment", "description": "Small tweak to strategy", "pros": "Low risk", "cons": "May not fully address concern"},
            {"option": "Major pivot", "description": "Significant strategic change", "pros": "Directly addresses trigger", "cons": "High disruption"},
        ])
        chosen_option = data.get("chosen_option", "Strategic pivot")
        rationale = data.get("rationale", f"Pivoting to address: {reason}")
        risk_assessment = data.get("risk_assessment", "Risk of disrupting current momentum; mitigated by clear communication to all agents.")

        # Build per-agent impact map
        impact_cto = data.get("impact_on_cto", data.get("changes_for_cto", "Update prototype"))
        impact_cfo = data.get("impact_on_cfo", data.get("changes_for_cfo", "Update financial model"))
        impact_cmo = data.get("impact_on_cmo", data.get("changes_for_cmo", "Update positioning"))
        impact_legal = data.get("impact_on_legal", "Review updated compliance requirements")

        # --- New strategy ---
        new_strategy = StrategyPayload(
            startup_idea=data.get("startup_idea", self.current_strategy.startup_idea if self.current_strategy else ""),
            target_market=data.get("target_market", ""),
            business_model=data.get("business_model", ""),
            key_differentiators=data.get("key_differentiators", []),
            constraints=data.get("constraints", []),
            iteration=self._current_iteration + 1,
        )

        # --- Build enriched reason as structured JSON for PivotPayload ---
        # This allows downstream consumers to parse reason as JSON for the full pivot context.
        structured_reason = json.dumps({
            "summary": reason,
            "trigger_quote": trigger_quote_from_llm,
            "options_considered": [
                opt.get("option", str(opt)) if isinstance(opt, dict) else str(opt)
                for opt in options_considered
            ],
            "chosen_option": chosen_option,
            "rationale": rationale,
            "risk": risk_assessment,
        })

        pivot_payload = PivotPayload(
            reason=structured_reason,
            old_strategy=old_strategy_str,
            new_strategy=new_strategy.model_dump_json(),
            affected_agents=["CTO", "CFO", "CMO"],
            changes_required={
                "CTO": impact_cto,
                "CFO": impact_cfo,
                "CMO": impact_cmo,
                "Legal": impact_legal,
                # Structured pivot metadata for consumers that inspect changes_required
                "_trigger_quote": trigger_quote_from_llm,
                "_options_considered": json.dumps(options_considered),
                "_chosen_option": chosen_option,
                "_rationale": rationale,
                "_risk": risk_assessment,
            },
            iteration=self._current_iteration + 1,
        )

        self.current_strategy = new_strategy
        self._current_iteration += 1

        # --- Write structured board discussion entry with all 5 reasoning fields ---
        from datetime import datetime, timezone
        option_names = [
            opt.get("option", str(opt)) if isinstance(opt, dict) else str(opt)
            for opt in options_considered
        ]
        options_detail = []
        for opt in options_considered:
            if isinstance(opt, dict):
                options_detail.append(
                    f"  - {opt.get('option', '?')}: {opt.get('description', '')} "
                    f"(Pros: {opt.get('pros', 'N/A')}, Cons: {opt.get('cons', 'N/A')})"
                )
            else:
                options_detail.append(f"  - {opt}")
        options_text = "\n".join(options_detail) if options_detail else "No alternatives recorded"

        board_entry = {
            "agent": self.name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": "pivot_decision",
            "message": f"PIVOT #{self.pivot_count}: {chosen_option}",
            "reasoning": (
                f"Exact trigger: \"{trigger_quote_from_llm}\"\n\n"
                f"Options considered:\n{options_text}\n\n"
                f"Chosen direction: {chosen_option}\n"
                f"Rationale: {rationale}\n\n"
                f"Expected impact on each agent:\n"
                f"  - CTO: {impact_cto}\n"
                f"  - CFO: {impact_cfo}\n"
                f"  - CMO: {impact_cmo}\n"
                f"  - Legal: {impact_legal}\n\n"
                f"Risk assessment: {risk_assessment}"
            ),
            "iteration": self._current_iteration,
            # Structured fields for programmatic access
            "pivot_reasoning": {
                "exact_trigger": trigger_quote_from_llm,
                "options_considered": options_considered,
                "chosen_direction": {
                    "option": chosen_option,
                    "rationale": rationale,
                },
                "expected_impact": {
                    "CTO": impact_cto,
                    "CFO": impact_cfo,
                    "CMO": impact_cmo,
                    "Legal": impact_legal,
                },
                "risk_assessment": risk_assessment,
            },
        }
        BaseAgent._board_discussion.append(board_entry)

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
