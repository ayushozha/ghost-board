"""CFO Agent: Financial model generation with pivot support."""

from __future__ import annotations

import json
import os
from typing import Any

from coordination.events import (
    AgentEvent,
    EventType,
    FinancialModelPayload,
    PivotPayload,
    StrategyPayload,
)
from coordination.state import StateBus
from coordination.trace import TraceLogger

from agents.base import BaseAgent


class CFOAgent(BaseAgent):
    name = "CFO"
    model = "gpt-4o"

    def __init__(self, bus: StateBus, logger: TraceLogger) -> None:
        super().__init__(bus, logger)
        self.current_strategy: StrategyPayload | None = None
        self.subscribe(EventType.STRATEGY_SET, EventType.PIVOT)

    async def handle_event(self, event: AgentEvent) -> None:
        if event.type == EventType.STRATEGY_SET:
            payload = event.payload
            if isinstance(payload, StrategyPayload):
                self.current_strategy = payload
        elif event.type == EventType.PIVOT:
            await self.handle_pivot(event)

    async def generate_financial_model(self, strategy: StrategyPayload) -> FinancialModelPayload:
        """Generate a financial model using LLM."""
        self.current_strategy = strategy
        self.log("Generating financial model", action="financial_model")

        prompt = f"""You are a startup CFO. Build a realistic financial model for:

Startup: {strategy.startup_idea}
Market: {strategy.target_market}
Model: {strategy.business_model}
Differentiators: {', '.join(strategy.key_differentiators)}

Create a 3-year financial projection. Respond in JSON:
{{
  "revenue_year1": number,
  "revenue_year2": number,
  "revenue_year3": number,
  "burn_rate_monthly": number,
  "runway_months": number (with current funding),
  "funding_required": number (seed/Series A),
  "cac": number (customer acquisition cost),
  "ltv": number (lifetime value),
  "gross_margin": number (percentage),
  "headcount_year1": number,
  "unit_economics": "brief description",
  "key_assumptions": ["list of assumptions"],
  "risks": ["list of financial risks"],
  "monthly_breakdown": [
    {{"month": 1, "revenue": number, "expenses": number, "customers": number}},
    ...first 12 months...
  ]
}}

Use realistic numbers for a pre-seed/seed stage startup. Be conservative."""

        response = await self.call_llm([
            {"role": "system", "content": "You are a startup CFO. Respond only with valid JSON."},
            {"role": "user", "content": prompt},
        ])

        try:
            data = json.loads(response.strip().removeprefix("```json").removesuffix("```").strip())
        except json.JSONDecodeError:
            data = {
                "revenue_year1": 0,
                "revenue_year3": 0,
                "burn_rate_monthly": 50000,
                "runway_months": 18,
                "funding_required": 1000000,
            }

        payload = FinancialModelPayload(
            revenue_year1=data.get("revenue_year1", 0),
            revenue_year3=data.get("revenue_year3", 0),
            burn_rate_monthly=data.get("burn_rate_monthly", 0),
            runway_months=data.get("runway_months", 0),
            funding_required=data.get("funding_required", 0),
            output_path="outputs/financial_model",
        )

        self._save_model(data)

        await self.publish(AgentEvent(
            type=EventType.FINANCIAL_MODEL_READY,
            source=self.name,
            payload=payload,
            iteration=self._current_iteration,
        ))

        return payload

    async def handle_pivot(self, event: AgentEvent) -> None:
        """Re-generate financial model after a pivot."""
        payload = event.payload
        if not isinstance(payload, PivotPayload):
            return

        changes = payload.changes_required.get("CFO", "Update financial projections")
        self.log(f"Handling pivot: {changes}", action="pivot_response")

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
        await self.generate_financial_model(new_strategy)

    def _save_model(self, data: dict[str, Any]) -> None:
        """Save financial model to outputs."""
        os.makedirs("outputs/financial_model", exist_ok=True)

        json_path = f"outputs/financial_model/model_v{self._current_iteration}.json"
        with open(json_path, "w") as f:
            json.dump(data, f, indent=2)

        md_path = f"outputs/financial_model/model_v{self._current_iteration}.md"
        with open(md_path, "w") as f:
            f.write(f"# Financial Model v{self._current_iteration}\n\n")
            f.write(f"| Metric | Value |\n|--------|-------|\n")
            f.write(f"| Revenue Y1 | ${data.get('revenue_year1', 0):,.0f} |\n")
            f.write(f"| Revenue Y3 | ${data.get('revenue_year3', 0):,.0f} |\n")
            f.write(f"| Burn Rate | ${data.get('burn_rate_monthly', 0):,.0f}/mo |\n")
            f.write(f"| Runway | {data.get('runway_months', 0)} months |\n")
            f.write(f"| Funding Req | ${data.get('funding_required', 0):,.0f} |\n")
            f.write(f"| CAC | ${data.get('cac', 0):,.0f} |\n")
            f.write(f"| LTV | ${data.get('ltv', 0):,.0f} |\n")
            f.write(f"| Gross Margin | {data.get('gross_margin', 0)}% |\n\n")

            if data.get("key_assumptions"):
                f.write("## Key Assumptions\n")
                for a in data["key_assumptions"]:
                    f.write(f"- {a}\n")

            if data.get("risks"):
                f.write("\n## Risks\n")
                for r in data["risks"]:
                    f.write(f"- {r}\n")

        self.log(f"Model saved to {md_path}", action="model_save")

    async def run(self, context: dict[str, Any] | None = None) -> None:
        if self.current_strategy:
            await self.generate_financial_model(self.current_strategy)
        else:
            self.log("No strategy set yet", action="waiting")
