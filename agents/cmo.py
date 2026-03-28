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
        self._pivot_context: str = ""
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
        self.log(
            "Generating GTM strategy, competitive analysis, and marketing copy",
            action="gtm_generate",
            reasoning=(
                f"Building comprehensive go-to-market package for '{strategy.startup_idea}' targeting "
                f"'{strategy.target_market}' with {strategy.business_model} model. "
                f"Will produce positioning, competitive matrix, customer journey, ICP, messaging framework, "
                f"landing page, and taglines."
            ),
            in_response_to="CEO strategy set",
        )

        pivot_section = ""
        if self._pivot_context:
            pivot_section = f"""
IMPORTANT - PIVOT CONTEXT:
{self._pivot_context}
You MUST update competitive positioning to reflect this new direction.
Reframe strengths/weaknesses of competitors relative to the pivoted strategy.
Update the customer journey and messaging to match the new positioning.
"""

        prompt = f"""You are a startup CMO with deep market research expertise. Create a COMPREHENSIVE go-to-market package for:

Startup: {strategy.startup_idea}
Market: {strategy.target_market}
Model: {strategy.business_model}
Differentiators: {', '.join(strategy.key_differentiators)}
{pivot_section}
Respond in JSON with ALL these sections filled out in detail:
{{
  "positioning": "2-3 paragraph positioning statement with market context, unique value, and brand promise",
  "messaging_framework": {{
    "core_value_proposition": "One sentence that captures the unique value",
    "by_persona": {{
      "technical_buyer": {{
        "headline": "Message for CTOs/engineers",
        "key_messages": ["3 messages focused on technical merit, API quality, reliability"],
        "proof_points": ["Concrete evidence: benchmarks, uptime, integrations"]
      }},
      "business_buyer": {{
        "headline": "Message for VPs/Directors of Operations or Finance",
        "key_messages": ["3 messages focused on ROI, efficiency, risk reduction"],
        "proof_points": ["Concrete evidence: cost savings, time saved, compliance"]
      }},
      "executive_buyer": {{
        "headline": "Message for C-suite decision makers",
        "key_messages": ["3 messages focused on strategic advantage, market positioning, growth"],
        "proof_points": ["Concrete evidence: market share, competitive moat, scalability"]
      }}
    }},
    "elevator_pitch_30s": "A crisp 30-second elevator pitch",
    "elevator_pitch_60s": "A fuller 60-second version with a proof point and call to action",
    "proof_points": ["5+ concrete proof points: metrics, benchmarks, case studies, certifications"]
  }},
  "elevator_pitch": "30-second elevator pitch (same as messaging_framework.elevator_pitch_30s)",
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
  "competitive_matrix": {{
    "competitors": [
      {{
        "name": "Real company name (e.g., Circle, Stripe Treasury, Zero Hash for fintech)",
        "description": "One-line description of what they do",
        "pricing": "Their actual pricing model and price points",
        "compliance_coverage": "Which regulations/jurisdictions they cover",
        "api_quality": "Rate 1-5 with justification (docs quality, SDKs, uptime SLA)",
        "geographic_coverage": "Countries and regions they serve",
        "supported_features": ["List of key features they offer"],
        "strengths": "Their key advantages in the market",
        "weaknesses": "Their gaps and shortcomings",
        "our_advantage": "How we specifically beat them on this dimension"
      }}
    ],
    "summary": "2-3 sentence summary of our competitive positioning",
    "dimension_comparison": {{
      "pricing": {{"us": "Our pricing", "competitor_1": "...", "competitor_2": "...", "competitor_3": "..."}},
      "compliance": {{"us": "Our coverage", "competitor_1": "...", "competitor_2": "...", "competitor_3": "..."}},
      "api_quality": {{"us": "Our rating", "competitor_1": "...", "competitor_2": "...", "competitor_3": "..."}},
      "geographic_reach": {{"us": "Our coverage", "competitor_1": "...", "competitor_2": "...", "competitor_3": "..."}},
      "time_to_integrate": {{"us": "Our time", "competitor_1": "...", "competitor_2": "...", "competitor_3": "..."}}
    }}
  }},
  "customer_journey": [
    {{
      "stage": "Awareness",
      "touchpoints": ["Where they first hear about us"],
      "customer_actions": ["What the customer does at this stage"],
      "pain_points": ["What frustrations they experience"],
      "our_actions": ["What we do to engage them"],
      "content_needed": ["Blog posts, ads, social content"],
      "success_metrics": ["KPIs for this stage"]
    }},
    {{
      "stage": "Consideration",
      "touchpoints": ["Where they evaluate us"],
      "customer_actions": ["Research, compare, demo requests"],
      "pain_points": ["Comparison paralysis, unclear pricing, trust gaps"],
      "our_actions": ["How we nurture and educate"],
      "content_needed": ["Case studies, comparison pages, webinars"],
      "success_metrics": ["KPIs"]
    }},
    {{
      "stage": "Decision",
      "touchpoints": ["Where they decide to buy"],
      "customer_actions": ["Procurement, legal review, pilot"],
      "pain_points": ["Budget approval, security review, integration risk"],
      "our_actions": ["How we close the deal"],
      "content_needed": ["ROI calculator, security whitepaper, pilot program"],
      "success_metrics": ["KPIs"]
    }},
    {{
      "stage": "Onboarding",
      "touchpoints": ["First 30 days"],
      "customer_actions": ["Integration, training, first transactions"],
      "pain_points": ["Technical setup complexity, team adoption"],
      "our_actions": ["How we ensure successful activation"],
      "content_needed": ["Quick start guides, API docs, onboarding calls"],
      "success_metrics": ["KPIs"]
    }},
    {{
      "stage": "Expansion",
      "touchpoints": ["Post-onboarding growth"],
      "customer_actions": ["Add use cases, increase volume, refer others"],
      "pain_points": ["Feature gaps, scaling limits, support quality"],
      "our_actions": ["How we grow the account"],
      "content_needed": ["Advanced guides, roadmap previews, loyalty programs"],
      "success_metrics": ["KPIs"]
    }}
  ],
  "launch_plan": [
    {{"week": 1, "action": "Specific action item", "channel": "Channel", "kpi": "Success metric"}}
  ],
  "gtm_phases": [
    {{"phase": "Phase 1: Foundation (Weeks 1-4)", "goals": "...", "activities": ["..."], "budget": "..."}},
    {{"phase": "Phase 2: Launch (Weeks 5-8)", "goals": "...", "activities": ["..."], "budget": "..."}},
    {{"phase": "Phase 3: Scale (Weeks 9-12)", "goals": "...", "activities": ["..."], "budget": "..."}}
  ]
}}

CRITICAL REQUIREMENTS:
- Use REAL competitor names. For fintech/payments: consider Circle, Stripe Treasury, Zero Hash, Fireblocks, Paxos, Modulr. For other verticals: name the actual market leaders.
- Competitive matrix must compare across AT LEAST 5 dimensions: pricing, compliance coverage, API quality, geographic coverage, supported features.
- Customer journey must cover ALL 5 stages: Awareness, Consideration, Decision, Onboarding, Expansion.
- Messaging framework must have distinct messages for technical buyer, business buyer, and executive buyer.
- Include both 30-second and 60-second elevator pitches.
- Include at least 5 taglines, 3 real competitors, 5 features, 5 FAQ items, 3 GTM phases, and a detailed ICP."""

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
        """Re-generate GTM after a pivot, updating competitive positioning for the new direction."""
        payload = event.payload
        if not isinstance(payload, PivotPayload):
            return

        changes = payload.changes_required.get("CMO", "Update positioning and copy")
        self.log(
            f"Handling pivot: {changes}",
            action="pivot_response",
            reasoning=(
                f"CEO has pivoted the strategy. I need to update all GTM materials: {changes}. "
                f"This requires repositioning, new competitive analysis, updated messaging, "
                f"and revised landing page copy to match the new direction."
            ),
            addressed_to="CEO",
            in_response_to=f"CEO PIVOT: {payload.reason[:100]}",
        )

        # Build pivot context so the LLM knows what changed and why
        self._pivot_context = (
            f"The company just pivoted.\n"
            f"Reason: {payload.reason}\n"
            f"Old strategy: {payload.old_strategy}\n"
            f"New strategy: {payload.new_strategy}\n"
            f"CMO-specific changes required: {changes}\n"
            f"All affected agents: {', '.join(payload.affected_agents)}"
        )

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

        # Clear pivot context after generation so next non-pivot run is clean
        self._pivot_context = ""

    def _save_gtm(self, data: dict[str, Any]) -> None:
        """Save comprehensive GTM package to outputs/gtm/."""
        os.makedirs("outputs/gtm", exist_ok=True)

        # Full JSON dump
        with open(f"outputs/gtm/gtm_v{self._current_iteration}.json", "w") as f:
            json.dump(data, f, indent=2)

        # 1. gtm_strategy.md - Phased go-to-market with timeline
        self._save_gtm_strategy(data)

        # 2. positioning.md - Statement, messaging framework, elevator pitch
        self._save_positioning(data)

        # 3. competitive_matrix.md AND competitive_matrix.json
        self._save_competitive_matrix(data)

        # 4. icp_profile.md - Ideal customer with firmographics and psychographics
        self._save_icp(data)

        # 5. landing_page.html - Actual rendered HTML landing page
        self._save_landing_page(data)

        # 6. taglines.json - 5 options with reasoning
        self._save_taglines(data)

        # 7. customer_journey.md - Full 5-stage customer journey map
        self._save_customer_journey(data)

        # 8. messaging_framework.md - Messaging by persona with elevator pitches
        self._save_messaging_framework(data)

        # Count competitors for log
        cm = data.get("competitive_matrix", {})
        num_competitors = len(cm.get("competitors", [])) if isinstance(cm, dict) else len(cm) if isinstance(cm, list) else 0
        taglines = data.get("taglines", [])

        self.log(
            "GTM package saved: gtm_strategy.md, positioning.md, competitive_matrix.md, "
            "competitive_matrix.json, customer_journey.md, messaging_framework.md, "
            "icp_profile.md, landing_page.html, taglines.json",
            action="gtm_save",
            reasoning=(
                f"Complete GTM package with {num_competitors} competitors analyzed, "
                f"{len(data.get('gtm_phases', []))} launch phases, "
                f"{len(data.get('customer_journey', []))} journey stages, "
                f"and {len(taglines)} tagline options. "
                f"Positioning: {data.get('positioning', '')[:100]}..."
            ),
        )

    def _save_gtm_strategy(self, data: dict[str, Any]) -> None:
        """Save GTM strategy overview markdown."""
        with open("outputs/gtm/gtm_strategy.md", "w") as f:
            f.write("# Go-To-Market Strategy\n\n")
            f.write(f"## Positioning\n{data.get('positioning', '')}\n\n")

            # Handle messaging_framework as either dict (new) or string (legacy)
            mf = data.get("messaging_framework", "")
            if isinstance(mf, dict):
                f.write(f"## Core Value Proposition\n{mf.get('core_value_proposition', '')}\n\n")
            else:
                f.write(f"## Messaging Framework\n{mf}\n\n")

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
            # Inline customer journey summary table in GTM strategy
            if data.get("customer_journey"):
                f.write("\n## Customer Journey Overview\n\n")
                journey = data["customer_journey"]
                if journey and isinstance(journey[0], dict):
                    if "customer_actions" in journey[0]:
                        f.write("| Stage | Pain Points | Our Actions | Metrics |\n")
                        f.write("|-------|------------|-------------|----------|\n")
                        for stage in journey:
                            pains = ", ".join(stage.get("pain_points", [])) if isinstance(stage.get("pain_points"), list) else stage.get("pain_points", "")
                            actions = ", ".join(stage.get("our_actions", [])) if isinstance(stage.get("our_actions"), list) else stage.get("our_actions", "")
                            metrics = ", ".join(stage.get("success_metrics", [])) if isinstance(stage.get("success_metrics"), list) else stage.get("success_metrics", "")
                            f.write(f"| {stage.get('stage', '')} | {pains} | {actions} | {metrics} |\n")
                    else:
                        # Legacy format
                        f.write("| Stage | Touchpoints | Content | Metrics |\n|-------|------------|---------|----------|\n")
                        for stage in journey:
                            f.write(f"| {stage.get('stage', '')} | {stage.get('touchpoints', '')} | {stage.get('content', '')} | {stage.get('metrics', '')} |\n")

    def _save_positioning(self, data: dict[str, Any]) -> None:
        """Save positioning statement markdown."""
        with open("outputs/gtm/positioning.md", "w") as f:
            f.write("# Brand Positioning\n\n")
            f.write(f"## Positioning Statement\n{data.get('positioning', '')}\n\n")

            mf = data.get("messaging_framework", "")
            if isinstance(mf, dict):
                f.write(f"## Core Value Proposition\n{mf.get('core_value_proposition', '')}\n\n")
                f.write(f"## Elevator Pitch (30s)\n{mf.get('elevator_pitch_30s', data.get('elevator_pitch', ''))}\n\n")
                f.write(f"## Elevator Pitch (60s)\n{mf.get('elevator_pitch_60s', '')}\n\n")
            else:
                f.write(f"## Messaging Framework\n{mf}\n\n")
                f.write(f"## Elevator Pitch\n{data.get('elevator_pitch', '')}\n\n")

            if data.get("value_props"):
                f.write("## Core Value Propositions\n")
                for vp in data["value_props"]:
                    f.write(f"- {vp}\n")

    def _save_competitive_matrix(self, data: dict[str, Any]) -> None:
        """Save competitive matrix as both markdown and JSON."""
        cm = data.get("competitive_matrix", {})

        # Normalize: handle both new dict format and legacy list format
        if isinstance(cm, list):
            # Legacy format: list of dicts with competitor/strengths/weaknesses
            competitors = cm
            summary = ""
            dimension_comparison: dict[str, Any] = {}
        elif isinstance(cm, dict):
            competitors = cm.get("competitors", [])
            summary = cm.get("summary", "")
            dimension_comparison = cm.get("dimension_comparison", {})
        else:
            competitors = []
            summary = ""
            dimension_comparison = {}

        # --- competitive_matrix.json ---
        with open("outputs/gtm/competitive_matrix.json", "w") as f:
            json.dump({
                "competitors": competitors,
                "summary": summary,
                "dimension_comparison": dimension_comparison,
            }, f, indent=2)

        # --- competitive_matrix.md ---
        with open("outputs/gtm/competitive_matrix.md", "w") as f:
            f.write("# Competitive Positioning Matrix\n\n")

            if summary:
                f.write(f"## Summary\n{summary}\n\n")

            if competitors:
                # Main comparison table
                f.write("## Head-to-Head Comparison\n\n")
                f.write("| Competitor | Pricing | Compliance | API Quality | Geographic Reach | Our Advantage |\n")
                f.write("|-----------|---------|------------|-------------|-----------------|---------------|\n")
                for comp in competitors:
                    name = comp.get("name", comp.get("competitor", ""))
                    pricing = comp.get("pricing", "")
                    compliance = comp.get("compliance_coverage", "")
                    api_q = comp.get("api_quality", "")
                    geo = comp.get("geographic_coverage", "")
                    adv = comp.get("our_advantage", "")
                    f.write(f"| {name} | {pricing} | {compliance} | {api_q} | {geo} | {adv} |\n")

                # Detailed per-competitor analysis
                f.write("\n## Detailed Analysis\n\n")
                for comp in competitors:
                    name = comp.get("name", comp.get("competitor", ""))
                    f.write(f"### vs {name}\n\n")
                    if comp.get("description"):
                        f.write(f"_{comp['description']}_\n\n")
                    f.write(f"**Pricing:** {comp.get('pricing', 'N/A')}\n\n")
                    f.write(f"**Compliance Coverage:** {comp.get('compliance_coverage', comp.get('strengths', 'N/A'))}\n\n")
                    f.write(f"**API Quality:** {comp.get('api_quality', 'N/A')}\n\n")
                    f.write(f"**Geographic Coverage:** {comp.get('geographic_coverage', 'N/A')}\n\n")
                    features = comp.get("supported_features", [])
                    if features:
                        f.write("**Key Features:**\n")
                        for feat in features:
                            f.write(f"- {feat}\n")
                        f.write("\n")
                    f.write(f"**Their Strengths:** {comp.get('strengths', 'N/A')}\n\n")
                    f.write(f"**Their Weaknesses:** {comp.get('weaknesses', 'N/A')}\n\n")
                    f.write(f"**Our Advantage:** {comp.get('our_advantage', 'N/A')}\n\n")
                    f.write("---\n\n")

            # Dimension comparison table
            if dimension_comparison:
                f.write("## Dimension-by-Dimension Comparison\n\n")
                # Build header from the first dimension's keys
                first_dim = next(iter(dimension_comparison.values()), {})
                cols = list(first_dim.keys()) if isinstance(first_dim, dict) else []
                if cols:
                    header = "| Dimension | " + " | ".join(cols) + " |\n"
                    sep = "|-----------|" + "|".join(["----------"] * len(cols)) + "|\n"
                    f.write(header)
                    f.write(sep)
                    for dim_name, dim_vals in dimension_comparison.items():
                        if isinstance(dim_vals, dict):
                            row_vals = " | ".join(str(dim_vals.get(c, "")) for c in cols)
                            f.write(f"| {dim_name} | {row_vals} |\n")

    def _save_icp(self, data: dict[str, Any]) -> None:
        """Save ICP profile markdown."""
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

    def _save_landing_page(self, data: dict[str, Any]) -> None:
        """Save landing page HTML."""
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

    def _save_taglines(self, data: dict[str, Any]) -> None:
        """Save taglines JSON."""
        taglines = data.get("taglines", [])
        if not taglines and data.get("tagline"):
            taglines = [{"tagline": data["tagline"], "reasoning": "Primary brand tagline"}]
        with open("outputs/gtm/taglines.json", "w") as f:
            json.dump(taglines, f, indent=2)

    def _save_customer_journey(self, data: dict[str, Any]) -> None:
        """Save detailed customer journey map markdown with all 5 stages."""
        journey = data.get("customer_journey", [])
        with open("outputs/gtm/customer_journey.md", "w") as f:
            f.write("# Customer Journey Map\n\n")
            f.write("_From first awareness through expansion and advocacy_\n\n")

            if not journey:
                f.write("_No journey data available._\n")
                return

            # Overview diagram
            stage_names = [s.get("stage", "?") for s in journey]
            f.write("## Journey Stages\n\n")
            f.write("```\n")
            f.write(" --> ".join(stage_names))
            f.write("\n```\n\n")

            for stage in journey:
                stage_name = stage.get("stage", "Unknown")
                f.write(f"## {stage_name}\n\n")

                # Handle both new (list-based) and legacy (string-based) formats
                touchpoints = stage.get("touchpoints", [])
                if isinstance(touchpoints, list) and touchpoints:
                    f.write("### Touchpoints\n")
                    for tp in touchpoints:
                        f.write(f"- {tp}\n")
                    f.write("\n")
                elif isinstance(touchpoints, str) and touchpoints:
                    f.write(f"### Touchpoints\n{touchpoints}\n\n")

                customer_actions = stage.get("customer_actions", [])
                if isinstance(customer_actions, list) and customer_actions:
                    f.write("### Customer Actions\n")
                    for ca in customer_actions:
                        f.write(f"- {ca}\n")
                    f.write("\n")

                pain_points = stage.get("pain_points", [])
                if isinstance(pain_points, list) and pain_points:
                    f.write("### Pain Points\n")
                    for pp in pain_points:
                        f.write(f"- {pp}\n")
                    f.write("\n")

                our_actions = stage.get("our_actions", [])
                if isinstance(our_actions, list) and our_actions:
                    f.write("### Our Actions\n")
                    for oa in our_actions:
                        f.write(f"- {oa}\n")
                    f.write("\n")

                content_needed = stage.get("content_needed", stage.get("content", []))
                if isinstance(content_needed, list) and content_needed:
                    f.write("### Content Needed\n")
                    for cn in content_needed:
                        f.write(f"- {cn}\n")
                    f.write("\n")
                elif isinstance(content_needed, str) and content_needed:
                    f.write(f"### Content Needed\n{content_needed}\n\n")

                metrics = stage.get("success_metrics", stage.get("metrics", []))
                if isinstance(metrics, list) and metrics:
                    f.write("### Success Metrics\n")
                    for m in metrics:
                        f.write(f"- {m}\n")
                    f.write("\n")
                elif isinstance(metrics, str) and metrics:
                    f.write(f"### Success Metrics\n{metrics}\n\n")

                f.write("---\n\n")

    def _save_messaging_framework(self, data: dict[str, Any]) -> None:
        """Save messaging framework markdown with per-persona messages and elevator pitches."""
        mf = data.get("messaging_framework", {})
        with open("outputs/gtm/messaging_framework.md", "w") as f:
            f.write("# Messaging Framework\n\n")

            if isinstance(mf, str):
                # Legacy format: just a string
                f.write(f"{mf}\n\n")
                f.write(f"## Elevator Pitch\n{data.get('elevator_pitch', '')}\n")
                return

            if not isinstance(mf, dict):
                f.write(f"## Elevator Pitch\n{data.get('elevator_pitch', '')}\n")
                return

            # Core value proposition
            cvp = mf.get("core_value_proposition", "")
            if cvp:
                f.write(f"## Core Value Proposition\n\n{cvp}\n\n")

            # Elevator pitches
            pitch_30 = mf.get("elevator_pitch_30s", data.get("elevator_pitch", ""))
            pitch_60 = mf.get("elevator_pitch_60s", "")
            if pitch_30:
                f.write(f"## Elevator Pitch (30 seconds)\n\n{pitch_30}\n\n")
            if pitch_60:
                f.write(f"## Elevator Pitch (60 seconds)\n\n{pitch_60}\n\n")

            # Per-persona messaging
            by_persona = mf.get("by_persona", {})
            if by_persona:
                f.write("## Messaging by Persona\n\n")
                persona_labels = {
                    "technical_buyer": "Technical Buyer (CTO / Engineering Lead)",
                    "business_buyer": "Business Buyer (VP Operations / Finance Director)",
                    "executive_buyer": "Executive Buyer (CEO / Board)",
                }
                for persona_key, persona_data in by_persona.items():
                    label = persona_labels.get(persona_key, persona_key.replace("_", " ").title())
                    f.write(f"### {label}\n\n")
                    if isinstance(persona_data, dict):
                        headline = persona_data.get("headline", "")
                        if headline:
                            f.write(f"**Headline:** {headline}\n\n")
                        key_msgs = persona_data.get("key_messages", [])
                        if key_msgs:
                            f.write("**Key Messages:**\n")
                            for msg in key_msgs:
                                f.write(f"- {msg}\n")
                            f.write("\n")
                        proof = persona_data.get("proof_points", [])
                        if proof:
                            f.write("**Proof Points:**\n")
                            for pp in proof:
                                f.write(f"- {pp}\n")
                            f.write("\n")
                    elif isinstance(persona_data, str):
                        f.write(f"{persona_data}\n\n")

            # Global proof points
            proof_points = mf.get("proof_points", [])
            if proof_points:
                f.write("## Proof Points\n\n")
                for pp in proof_points:
                    f.write(f"- {pp}\n")
                f.write("\n")

    async def run(self, context: dict[str, Any] | None = None) -> None:
        if self.current_strategy:
            await self.generate_gtm(self.current_strategy)
        else:
            self.log("No strategy set yet", action="waiting")
