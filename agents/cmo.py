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

        prompt = f"""You are a startup CMO. Create a COMPREHENSIVE go-to-market package for:

Startup: {strategy.startup_idea}
Market: {strategy.target_market}
Model: {strategy.business_model}
Differentiators: {', '.join(strategy.key_differentiators)}

Respond in JSON with ALL these sections filled out in detail:
{{
  "positioning": "2-3 paragraph positioning statement with market context, unique value, and brand promise",
  "messaging_framework": "Core narrative: problem, solution, differentiation, proof points",
  "elevator_pitch": "30-second elevator pitch",
  "taglines": [
    {{"tagline": "...", "reasoning": "why this works for the target audience"}}
  ],
  "value_props": ["5+ specific value propositions with measurable benefits"],
  "target_channels": ["prioritized marketing channels with rationale"],
  "icp": {{
    "title": "Ideal Customer Profile",
    "firmographics": "Company size, industry, revenue range, geography, tech stack",
    "psychographics": "Pain points, motivations, buying triggers, decision process",
    "buyer_persona": "Job title, responsibilities, goals, frustrations",
    "budget_range": "Expected budget allocation for this solution",
    "buying_process": "How they evaluate and purchase solutions like this"
  }},
  "landing_page": {{
    "hero_headline": "Compelling headline",
    "hero_subheadline": "Supporting line that explains the value",
    "cta_text": "Action button text",
    "features_section": [
      {{"title": "Feature name", "description": "2-3 sentence description with benefit"}}
    ],
    "social_proof": "Trust signals and proof points",
    "faq": [
      {{"question": "Common question", "answer": "Detailed answer"}}
    ],
    "pricing_hint": "Pricing positioning (e.g., 'Starting at $X/mo')"
  }},
  "competitive_matrix": [
    {{"competitor": "Real company name", "strengths": "their advantages", "weaknesses": "their gaps", "our_advantage": "how we win", "pricing": "their pricing model"}}
  ],
  "launch_plan": [
    {{"week": 1, "action": "Specific action item", "channel": "Channel", "kpi": "Success metric"}}
  ],
  "gtm_phases": [
    {{"phase": "Phase 1: Foundation (Weeks 1-4)", "goals": "...", "activities": ["..."], "budget": "..."}},
    {{"phase": "Phase 2: Launch (Weeks 5-8)", "goals": "...", "activities": ["..."], "budget": "..."}},
    {{"phase": "Phase 3: Scale (Weeks 9-12)", "goals": "...", "activities": ["..."], "budget": "..."}}
  ],
  "customer_journey": [
    {{"stage": "Awareness", "touchpoints": "...", "content": "...", "metrics": "..."}},
    {{"stage": "Consideration", "touchpoints": "...", "content": "...", "metrics": "..."}},
    {{"stage": "Decision", "touchpoints": "...", "content": "...", "metrics": "..."}},
    {{"stage": "Onboarding", "touchpoints": "...", "content": "...", "metrics": "..."}}
  ]
}}

Include at least 5 taglines, 3 real competitors, 5 features, 5 FAQ items, 3 GTM phases, and a detailed ICP."""

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

        tagline = data.get("tagline", "")
        if not tagline and data.get("taglines"):
            tagline = data["taglines"][0].get("tagline", "")
        payload = GTMPayload(
            positioning=data.get("positioning", ""),
            tagline=tagline,
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
        """Save comprehensive GTM package to outputs/gtm/."""
        os.makedirs("outputs/gtm", exist_ok=True)

        # Full JSON dump
        with open(f"outputs/gtm/gtm_v{self._current_iteration}.json", "w") as f:
            json.dump(data, f, indent=2)

        # 1. gtm_strategy.md - Phased go-to-market with timeline
        with open("outputs/gtm/gtm_strategy.md", "w") as f:
            f.write("# Go-To-Market Strategy\n\n")
            f.write(f"## Positioning\n{data.get('positioning', '')}\n\n")
            f.write(f"## Messaging Framework\n{data.get('messaging_framework', '')}\n\n")
            f.write(f"## Elevator Pitch\n{data.get('elevator_pitch', '')}\n\n")
            if data.get("value_props"):
                f.write("## Value Propositions\n")
                for vp in data["value_props"]:
                    f.write(f"- {vp}\n")
                f.write("\n")
            if data.get("target_channels"):
                f.write("## Target Channels\n")
                for ch in data["target_channels"]:
                    f.write(f"- {ch}\n")
                f.write("\n")
            phases = data.get("gtm_phases", [])
            if phases:
                f.write("## GTM Phases\n\n")
                for phase in phases:
                    f.write(f"### {phase.get('phase', '')}\n")
                    f.write(f"**Goals:** {phase.get('goals', '')}\n")
                    f.write(f"**Budget:** {phase.get('budget', '')}\n\n")
                    for act in phase.get("activities", []):
                        f.write(f"- {act}\n")
                    f.write("\n")
            if data.get("launch_plan"):
                f.write("## Weekly Launch Plan\n\n")
                f.write("| Week | Action | Channel | KPI |\n|------|--------|---------|-----|\n")
                for step in data["launch_plan"]:
                    f.write(f"| {step.get('week', '')} | {step.get('action', '')} | {step.get('channel', '')} | {step.get('kpi', '')} |\n")
            if data.get("customer_journey"):
                f.write("\n## Customer Journey\n\n")
                f.write("| Stage | Touchpoints | Content | Metrics |\n|-------|------------|---------|----------|\n")
                for stage in data["customer_journey"]:
                    f.write(f"| {stage.get('stage', '')} | {stage.get('touchpoints', '')} | {stage.get('content', '')} | {stage.get('metrics', '')} |\n")

        # 2. positioning.md - Statement, messaging framework, elevator pitch
        with open("outputs/gtm/positioning.md", "w") as f:
            f.write("# Brand Positioning\n\n")
            f.write(f"## Positioning Statement\n{data.get('positioning', '')}\n\n")
            f.write(f"## Messaging Framework\n{data.get('messaging_framework', '')}\n\n")
            f.write(f"## Elevator Pitch\n{data.get('elevator_pitch', '')}\n\n")
            if data.get("value_props"):
                f.write("## Core Value Propositions\n")
                for vp in data["value_props"]:
                    f.write(f"- {vp}\n")

        # 3. competitive_matrix.md - Us vs competitors
        with open("outputs/gtm/competitive_matrix.md", "w") as f:
            f.write("# Competitive Positioning Matrix\n\n")
            matrix = data.get("competitive_matrix", [])
            if matrix:
                f.write("| Competitor | Strengths | Weaknesses | Our Advantage | Pricing |\n")
                f.write("|-----------|-----------|------------|---------------|----------|\n")
                for comp in matrix:
                    f.write(f"| {comp.get('competitor', '')} | {comp.get('strengths', '')} | {comp.get('weaknesses', '')} | {comp.get('our_advantage', '')} | {comp.get('pricing', '')} |\n")
                f.write("\n## Detailed Analysis\n\n")
                for comp in matrix:
                    f.write(f"### vs {comp.get('competitor', '')}\n")
                    f.write(f"**Their strengths:** {comp.get('strengths', '')}\n")
                    f.write(f"**Their weaknesses:** {comp.get('weaknesses', '')}\n")
                    f.write(f"**Our advantage:** {comp.get('our_advantage', '')}\n\n")

        # 4. icp_profile.md - Ideal customer with firmographics and psychographics
        icp = data.get("icp", {})
        with open("outputs/gtm/icp_profile.md", "w") as f:
            f.write("# Ideal Customer Profile\n\n")
            if isinstance(icp, dict):
                f.write(f"## Firmographics\n{icp.get('firmographics', '')}\n\n")
                f.write(f"## Psychographics\n{icp.get('psychographics', '')}\n\n")
                f.write(f"## Buyer Persona\n{icp.get('buyer_persona', '')}\n\n")
                f.write(f"## Budget Range\n{icp.get('budget_range', '')}\n\n")
                f.write(f"## Buying Process\n{icp.get('buying_process', '')}\n\n")
            else:
                f.write(f"{icp}\n")

        # 5. landing_page.html - Actual rendered HTML landing page
        lp = data.get("landing_page", {})
        tagline = data.get("taglines", [{}])[0].get("tagline", data.get("tagline", "")) if data.get("taglines") else data.get("tagline", "")
        with open("outputs/gtm/landing_page.html", "w") as f:
            features_html = ""
            for feat in lp.get("features_section", []):
                features_html += f"""
              <div class="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 class="text-xl font-semibold text-white mb-2">{feat.get('title', '')}</h3>
                <p class="text-slate-400">{feat.get('description', '')}</p>
              </div>"""

            faq_html = ""
            for item in lp.get("faq", []):
                faq_html += f"""
              <details class="border border-white/10 rounded-lg p-4">
                <summary class="text-white font-medium cursor-pointer">{item.get('question', '')}</summary>
                <p class="mt-2 text-slate-400">{item.get('answer', '')}</p>
              </details>"""

            f.write(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{lp.get('hero_headline', 'Launch')}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body {{ background: #0a0a0f; color: #e2e8f0; font-family: system-ui, sans-serif; }}
</style>
</head>
<body>
  <div class="min-h-screen">
    <header class="max-w-4xl mx-auto px-6 py-20 text-center">
      <h1 class="text-5xl font-bold text-white mb-4">{lp.get('hero_headline', '')}</h1>
      <p class="text-xl text-slate-400 mb-8">{lp.get('hero_subheadline', '')}</p>
      <a href="#" class="inline-block px-8 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-500 transition">{lp.get('cta_text', 'Get Started')}</a>
      <p class="mt-4 text-sm text-slate-500">{lp.get('pricing_hint', '')}</p>
    </header>

    <section class="max-w-5xl mx-auto px-6 py-16">
      <h2 class="text-3xl font-bold text-white mb-8 text-center">Why Choose Us</h2>
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features_html}
      </div>
    </section>

    <section class="max-w-3xl mx-auto px-6 py-16">
      <h2 class="text-3xl font-bold text-white mb-8 text-center">FAQ</h2>
      <div class="space-y-3">
        {faq_html}
      </div>
    </section>

    <section class="max-w-4xl mx-auto px-6 py-16 text-center">
      <p class="text-slate-500">{lp.get('social_proof', '')}</p>
    </section>
  </div>
</body>
</html>""")

        # 6. taglines.json - 5 options with reasoning
        taglines = data.get("taglines", [])
        if not taglines and data.get("tagline"):
            taglines = [{"tagline": data["tagline"], "reasoning": "Primary brand tagline"}]
        with open("outputs/gtm/taglines.json", "w") as f:
            json.dump(taglines, f, indent=2)

        self.log(
            f"GTM package saved: gtm_strategy.md, positioning.md, competitive_matrix.md, icp_profile.md, landing_page.html, taglines.json",
            action="gtm_save",
            reasoning=f"Complete GTM package with {len(data.get('competitive_matrix', []))} competitors analyzed, {len(data.get('gtm_phases', []))} launch phases, and {len(taglines)} tagline options.",
        )

    async def run(self, context: dict[str, Any] | None = None) -> None:
        if self.current_strategy:
            await self.generate_gtm(self.current_strategy)
        else:
            self.log("No strategy set yet", action="waiting")
