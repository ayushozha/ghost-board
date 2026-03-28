"""CMO Agent: Positioning, taglines, landing page copy, and GTM strategy."""

from __future__ import annotations

import json
import os
from typing import Any

from coordination.events import (
    AgentEvent,
    EventType,
    GTMPayload,
    PivotPayload,
    StrategyPayload,
)
from coordination.state import StateBus
from coordination.trace import TraceLogger

from agents.base import BaseAgent


class CMOAgent(BaseAgent):
    name = "CMO"
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

    async def generate_gtm(self, strategy: StrategyPayload) -> GTMPayload:
        """Generate go-to-market strategy and copy."""
        self.current_strategy = strategy
        self.log("Generating GTM strategy and copy", action="gtm_generate")

        prompt = f"""You are a startup CMO. Create a complete go-to-market strategy for:

Startup: {strategy.startup_idea}
Market: {strategy.target_market}
Model: {strategy.business_model}
Differentiators: {', '.join(strategy.key_differentiators)}

Respond in JSON:
{{
  "positioning": "One paragraph positioning statement",
  "tagline": "Catchy tagline under 10 words",
  "value_props": ["3-5 value propositions"],
  "target_channels": ["marketing channels to use"],
  "icp": "Ideal customer profile description",
  "landing_page": {{
    "hero_headline": "...",
    "hero_subheadline": "...",
    "cta_text": "...",
    "features_section": [
      {{"title": "...", "description": "..."}}
    ],
    "social_proof": "...",
    "faq": [
      {{"question": "...", "answer": "..."}}
    ]
  }},
  "competitive_matrix": [
    {{"competitor": "name", "strengths": "their advantages", "weaknesses": "their gaps", "our_advantage": "how we win"}}
  ],
  "launch_plan": [
    {{"week": 1, "action": "...", "channel": "..."}},
    ...
  ]
}}"""

        response = await self.call_llm([
            {"role": "system", "content": "You are a startup CMO. Respond only with valid JSON."},
            {"role": "user", "content": prompt},
        ])

        try:
            data = json.loads(response.strip().removeprefix("```json").removesuffix("```").strip())
        except json.JSONDecodeError:
            data = {
                "positioning": "AI-powered solution for modern businesses",
                "tagline": "Automate the impossible",
                "target_channels": ["Product Hunt", "LinkedIn", "Twitter"],
            }

        payload = GTMPayload(
            positioning=data.get("positioning", ""),
            tagline=data.get("tagline", ""),
            target_channels=data.get("target_channels", []),
            output_path="outputs/gtm",
        )

        self._save_gtm(data)

        await self.publish(AgentEvent(
            type=EventType.GTM_READY,
            source=self.name,
            payload=payload,
            iteration=self._current_iteration,
        ))

        return payload

    async def handle_pivot(self, event: AgentEvent) -> None:
        """Re-generate GTM after a pivot."""
        payload = event.payload
        if not isinstance(payload, PivotPayload):
            return

        changes = payload.changes_required.get("CMO", "Update positioning and copy")
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
        await self.generate_gtm(new_strategy)

    def _save_gtm(self, data: dict[str, Any]) -> None:
        """Save GTM materials to outputs."""
        os.makedirs("outputs/gtm", exist_ok=True)

        json_path = f"outputs/gtm/gtm_v{self._current_iteration}.json"
        with open(json_path, "w") as f:
            json.dump(data, f, indent=2)

        # Landing page copy
        lp = data.get("landing_page", {})
        md_path = f"outputs/gtm/landing_page_v{self._current_iteration}.md"
        with open(md_path, "w") as f:
            f.write(f"# {lp.get('hero_headline', data.get('tagline', 'Landing Page'))}\n\n")
            f.write(f"## {lp.get('hero_subheadline', '')}\n\n")
            f.write(f"**[{lp.get('cta_text', 'Get Started')}]**\n\n")
            f.write(f"---\n\n")
            f.write(f"## Positioning\n{data.get('positioning', '')}\n\n")

            if data.get("value_props"):
                f.write("## Why Us\n")
                for vp in data["value_props"]:
                    f.write(f"- {vp}\n")
                f.write("\n")

            features = lp.get("features_section", [])
            if features:
                f.write("## Features\n")
                for feat in features:
                    f.write(f"\n### {feat.get('title', '')}\n{feat.get('description', '')}\n")

            faq = lp.get("faq", [])
            if faq:
                f.write("\n## FAQ\n")
                for item in faq:
                    f.write(f"\n**{item.get('question', '')}**\n{item.get('answer', '')}\n")

        # Launch plan
        if data.get("launch_plan"):
            plan_path = f"outputs/gtm/launch_plan_v{self._current_iteration}.md"
            with open(plan_path, "w") as f:
                f.write(f"# Launch Plan v{self._current_iteration}\n\n")
                f.write("| Week | Action | Channel |\n|------|--------|--------|\n")
                for step in data["launch_plan"]:
                    f.write(f"| {step.get('week', '')} | {step.get('action', '')} | {step.get('channel', '')} |\n")

        # Competitive positioning matrix
        if data.get("competitive_matrix"):
            matrix_path = f"outputs/gtm/competitive_matrix_v{self._current_iteration}.md"
            with open(matrix_path, "w") as f:
                f.write(f"# Competitive Positioning Matrix v{self._current_iteration}\n\n")
                f.write("| Competitor | Strengths | Weaknesses | Our Advantage |\n")
                f.write("|-----------|-----------|------------|---------------|\n")
                for comp in data["competitive_matrix"]:
                    f.write(f"| {comp.get('competitor', '')} | {comp.get('strengths', '')} | {comp.get('weaknesses', '')} | {comp.get('our_advantage', '')} |\n")

        self.log(f"GTM saved to {md_path}", action="gtm_save")

    async def run(self, context: dict[str, Any] | None = None) -> None:
        if self.current_strategy:
            await self.generate_gtm(self.current_strategy)
        else:
            self.log("No strategy set yet", action="waiting")
