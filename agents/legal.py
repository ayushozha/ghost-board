"""Legal Agent: Compliance analysis with real regulation citations."""

from __future__ import annotations

import json
from typing import Any

from coordination.events import (
    AgentEvent,
    BlockerPayload,
    CompliancePayload,
    EventType,
    PivotPayload,
    StrategyPayload,
)
from coordination.state import StateBus
from coordination.trace import TraceLogger

from agents.base import BaseAgent


class LegalAgent(BaseAgent):
    """Legal/compliance agent that uses OpenAI web search to find real regulations.

    Publishes BLOCKER events with actual citation URLs when risks are found.
    """

    name = "Legal"
    model = "gpt-4o"

    def __init__(self, bus: StateBus, logger: TraceLogger) -> None:
        super().__init__(bus, logger)
        self.current_strategy: StrategyPayload | None = None
        self.blockers_published: list[BlockerPayload] = []
        self.subscribe(EventType.STRATEGY_SET, EventType.PIVOT)

    async def handle_event(self, event: AgentEvent) -> None:
        if event.type == EventType.STRATEGY_SET:
            payload = event.payload
            if isinstance(payload, StrategyPayload):
                self.current_strategy = payload
        elif event.type == EventType.PIVOT:
            payload = event.payload
            if isinstance(payload, PivotPayload):
                # Re-analyze after pivot
                if self.current_strategy:
                    await self.analyze_compliance(self.current_strategy)

    async def analyze_compliance(self, strategy: StrategyPayload) -> CompliancePayload:
        """Analyze regulatory risks using web search for real citations."""
        self.current_strategy = strategy
        self.log("Analyzing regulatory compliance", action="compliance_scan")

        # Use the responses API with web_search_preview for real citations
        try:
            response = await self.client.responses.create(
                model="gpt-4o",
                tools=[{"type": "web_search_preview"}],
                input=f"""You are a startup legal counsel. Analyze regulatory risks for:

Startup idea: {strategy.startup_idea}
Target market: {strategy.target_market}
Business model: {strategy.business_model}
Constraints: {', '.join(strategy.constraints)}

Search for REAL regulations from CFPB, FinCEN, SEC, FTC, GDPR, and state regulators.

Respond in JSON:
{{
  "risk_level": "HIGH" or "MEDIUM" or "LOW",
  "regulations_checked": ["list of regulation names checked"],
  "blockers": [
    {{
      "severity": "CRITICAL" or "HIGH" or "MEDIUM" or "LOW",
      "area": "regulatory area",
      "description": "what the issue is",
      "citations": ["real URLs or regulation numbers"],
      "recommended_action": "what to do"
    }}
  ]
}}

Only include blockers for regulations that ACTUALLY APPLY. Cite real URLs.""",
            )

            response_text = ""
            for item in response.output:
                if hasattr(item, "content"):
                    for block in item.content:
                        if hasattr(block, "text"):
                            response_text += block.text
        except Exception as e:
            self.log(f"Web search failed, falling back to chat: {e}", action="fallback")
            response_text = await self._fallback_analysis(strategy)

        return await self._process_response(response_text, strategy)

    async def _fallback_analysis(self, strategy: StrategyPayload) -> str:
        """Fallback to regular chat completions if responses API fails."""
        return await self.call_llm([
            {"role": "system", "content": "You are a startup legal counsel. Respond only with valid JSON."},
            {"role": "user", "content": f"""Analyze regulatory risks for:
Idea: {strategy.startup_idea}
Market: {strategy.target_market}
Model: {strategy.business_model}

Respond in JSON with:
- risk_level: HIGH/MEDIUM/LOW
- regulations_checked: list of regulation names
- blockers: list of {{severity, area, description, citations (regulation numbers), recommended_action}}"""},
        ])

    async def _process_response(self, response_text: str, strategy: StrategyPayload) -> CompliancePayload:
        """Process LLM response into compliance payload and publish blockers."""
        try:
            data = json.loads(
                response_text.strip()
                .removeprefix("```json").removesuffix("```").strip()
            )
        except json.JSONDecodeError:
            data = {"risk_level": "MEDIUM", "regulations_checked": [], "blockers": []}

        blockers_data = data.get("blockers", [])
        blockers_found = 0

        for b in blockers_data:
            blocker = BlockerPayload(
                severity=b.get("severity", "MEDIUM"),
                area=b.get("area", "regulatory"),
                description=b.get("description", ""),
                citations=b.get("citations", []),
                recommended_action=b.get("recommended_action", ""),
            )
            self.blockers_published.append(blocker)
            blockers_found += 1

            if blocker.severity in ("CRITICAL", "HIGH"):
                self.log(f"BLOCKER: {blocker.severity} - {blocker.area}", action="blocker_found")
                await self.publish(AgentEvent(
                    type=EventType.BLOCKER,
                    source=self.name,
                    payload=blocker,
                    iteration=self._current_iteration,
                ))

        compliance = CompliancePayload(
            risk_level=data.get("risk_level", "MEDIUM"),
            regulations_checked=data.get("regulations_checked", []),
            blockers_found=blockers_found,
            output_path="outputs/compliance",
        )

        # Save compliance report
        self._save_report(data)

        await self.publish(AgentEvent(
            type=EventType.COMPLIANCE_REPORT_READY,
            source=self.name,
            payload=compliance,
            iteration=self._current_iteration,
        ))

        return compliance

    def _save_report(self, data: dict[str, Any]) -> None:
        """Save compliance report to outputs/compliance/."""
        import os
        os.makedirs("outputs/compliance", exist_ok=True)
        report_path = f"outputs/compliance/report_v{self._current_iteration}.json"
        with open(report_path, "w") as f:
            json.dump(data, f, indent=2)

        md_path = f"outputs/compliance/report_v{self._current_iteration}.md"
        with open(md_path, "w") as f:
            f.write(f"# Compliance Report v{self._current_iteration}\n\n")
            f.write(f"**Risk Level:** {data.get('risk_level', 'UNKNOWN')}\n\n")
            f.write("## Regulations Checked\n")
            for reg in data.get("regulations_checked", []):
                f.write(f"- {reg}\n")
            f.write("\n## Blockers\n")
            for b in data.get("blockers", []):
                f.write(f"\n### [{b.get('severity', 'UNKNOWN')}] {b.get('area', '')}\n")
                f.write(f"{b.get('description', '')}\n")
                if b.get("citations"):
                    f.write("**Citations:**\n")
                    for c in b["citations"]:
                        f.write(f"- {c}\n")
                f.write(f"\n**Action:** {b.get('recommended_action', '')}\n")

        self.log(f"Report saved to {md_path}", action="report_save")

    async def run(self, context: dict[str, Any] | None = None) -> None:
        """Run legal analysis on current strategy."""
        if self.current_strategy:
            await self.analyze_compliance(self.current_strategy)
        else:
            self.log("No strategy set yet", action="waiting")
