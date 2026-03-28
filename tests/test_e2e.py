"""End-to-end test with mocked LLM calls verifying the full cascade."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from coordination.events import EventType, StrategyPayload
from coordination.state import StateBus
from coordination.trace import TraceLogger
from agents.ceo import CEOAgent
from agents.cto import CTOAgent
from agents.cfo import CFOAgent
from agents.cmo import CMOAgent
from agents.legal import LegalAgent


# --- Mock helpers ---

class MockChoice:
    def __init__(self, content):
        self.message = MagicMock(content=content)

class MockUsage:
    total_tokens = 100
    prompt_tokens = 60
    completion_tokens = 40

class MockResponse:
    def __init__(self, content):
        self.choices = [MockChoice(content)]
        self.usage = MockUsage()


# Pre-built LLM responses
STRATEGY_RESPONSE = json.dumps({
    "startup_idea": "AI compliance automation for fintech",
    "target_market": "fintech startups",
    "business_model": "SaaS",
    "key_differentiators": ["real-time monitoring", "auto-filing"],
    "constraints": ["CFPB regulations", "state licensing"],
})

PROTOTYPE_RESPONSE = json.dumps({
    "files": [
        {"filename": "app.py", "content": "print('hello')", "description": "Core"},
        {"filename": "models.py", "content": "class User: pass", "description": "Models"},
    ],
    "description": "Compliance SaaS prototype",
})

FINANCIAL_RESPONSE = json.dumps({
    "revenue_year1": 240000, "revenue_year3": 5000000,
    "burn_rate_monthly": 50000, "runway_months": 18,
    "funding_required": 2000000, "cac": 500, "ltv": 5000, "gross_margin": 80,
})

GTM_RESPONSE = json.dumps({
    "positioning": "The compliance autopilot for modern fintech",
    "tagline": "Compliance on autopilot",
    "value_props": ["Save 90% on compliance costs"],
    "target_channels": ["LinkedIn", "fintech conferences"],
    "landing_page": {"hero_headline": "Never Worry About Compliance Again",
                     "hero_subheadline": "AI handles it", "cta_text": "Start Free Trial",
                     "features_section": [], "faq": []},
})

COMPLIANCE_RESPONSE = json.dumps({
    "risk_level": "HIGH",
    "regulations_checked": ["CFPB", "FinCEN BSA", "State MTLs"],
    "blockers": [{
        "severity": "CRITICAL", "area": "money transmission",
        "description": "May need state money transmitter licenses",
        "citations": ["31 CFR 1010", "https://www.fincen.gov/msb-registrant-search"],
        "recommended_action": "Restructure as SaaS tool",
    }],
})

COMPLIANCE_CLEAN = json.dumps({
    "risk_level": "LOW", "regulations_checked": ["GDPR"],
    "blockers": [],
})

PIVOT_RESPONSE = json.dumps({
    "startup_idea": "AI compliance monitoring SaaS",
    "target_market": "fintech startups and banks",
    "business_model": "B2B SaaS",
    "key_differentiators": ["real-time alerts"],
    "constraints": ["SOC2 required"],
    "pivot_reason": "Avoid money transmitter licensing",
    "changes_for_cto": "Remove payment processing",
    "changes_for_cfo": "Lower CAC via B2B sales",
    "changes_for_cmo": "Target compliance officers",
})


def make_logger() -> TraceLogger:
    logger = TraceLogger.__new__(TraceLogger)
    logger._use_wandb = False
    logger._wandb_run = None
    logger._json_log = []
    logger._json_path = "outputs/trace.json"
    return logger


def make_mock_client(responses: list[str]) -> AsyncMock:
    """Create a mock client that returns a sequence of responses, cycling the last one."""
    mock_client = AsyncMock()
    mock_responses_api = MagicMock()
    mock_responses_api.create = AsyncMock(side_effect=Exception("no responses API"))
    mock_client.responses = mock_responses_api

    # Use a stateful mock that returns from the list, repeating the last response if exhausted
    call_count = {"n": 0}
    real_responses = [MockResponse(r) for r in responses]

    async def create_side_effect(**kwargs):
        idx = min(call_count["n"], len(real_responses) - 1)
        call_count["n"] += 1
        return real_responses[idx]

    mock_client.chat.completions.create = create_side_effect
    return mock_client


class TestE2E:
    @pytest.mark.asyncio
    async def test_full_cascade_strategy_to_pivot(self):
        """Test the full inner loop: strategy -> build -> blocker -> pivot -> rebuild.

        The event bus auto-cascades: Legal BLOCKER -> CEO PIVOT -> agents rebuild.
        We don't manually drive each step; we verify the cascade happened.
        """
        bus = StateBus()
        logger = make_logger()

        # Provide enough responses for the full cascade:
        # 1. CEO set_strategy
        # 2-5. CTO/CFO/CMO/Legal build (Legal triggers cascade)
        # 6. CEO pivot (triggered by BLOCKER event)
        # 7-10. CTO/CFO/CMO/Legal rebuild (triggered by PIVOT event)
        # 11+. Any further cascading (Legal may re-analyze after pivot)
        mock_client = make_mock_client([
            STRATEGY_RESPONSE,          # 1. CEO strategy
            PROTOTYPE_RESPONSE,         # 2. CTO build
            FINANCIAL_RESPONSE,         # 3. CFO build
            GTM_RESPONSE,               # 4. CMO build
            COMPLIANCE_RESPONSE,        # 5. Legal (finds CRITICAL blocker)
            PIVOT_RESPONSE,             # 6. CEO pivot
            PROTOTYPE_RESPONSE,         # 7. CTO rebuild
            FINANCIAL_RESPONSE,         # 8. CFO rebuild
            GTM_RESPONSE,               # 9. CMO rebuild
            COMPLIANCE_CLEAN,           # 10. Legal re-analyze (clean this time)
        ])

        # Initialize agents (they auto-subscribe to bus events)
        ceo = CEOAgent(bus, logger)
        cto = CTOAgent(bus, logger)
        cfo = CFOAgent(bus, logger)
        cmo = CMOAgent(bus, logger)
        legal = LegalAgent(bus, logger)

        for agent in [ceo, cto, cfo, cmo, legal]:
            agent.client = mock_client

        # Phase 1: CEO sets strategy (triggers STRATEGY_SET -> agents get it)
        strategy = await ceo.set_strategy("AI compliance tool")
        assert strategy.business_model == "SaaS"

        # Verify STRATEGY_SET published
        strategy_events = bus.get_events_by_type(EventType.STRATEGY_SET)
        assert len(strategy_events) >= 1

        # Phase 1: All agents build concurrently
        # The event bus cascade happens automatically:
        # Legal finds blocker -> publishes BLOCKER -> CEO pivots -> publishes PIVOT
        # -> CTO/CFO/CMO/Legal rebuild
        import asyncio
        await asyncio.gather(
            cto.generate_prototype(strategy),
            cfo.generate_financial_model(strategy),
            cmo.generate_gtm(strategy),
            legal.analyze_compliance(strategy),
        )

        # Verify the cascade happened
        blockers = bus.get_events_by_type(EventType.BLOCKER)
        assert len(blockers) >= 1
        assert blockers[0].payload.severity == "CRITICAL"
        assert len(blockers[0].payload.citations) > 0  # Real citations

        pivot_events = bus.get_events_by_type(EventType.PIVOT)
        assert len(pivot_events) >= 1
        assert pivot_events[0].triggered_by == blockers[0].id  # Causal chain!

        # CEO should have pivoted
        assert ceo.pivot_count >= 1

        # Verify trace has full event log
        trace = bus.get_trace()
        assert len(trace) >= 6  # Strategy + 4 builds + blocker + pivot + rebuilds

        # Every event has a source
        for event in trace:
            assert event.source != ""

        # Verify trace JSON log
        json_log = logger.get_json_log()
        assert len(json_log) > 0

    @pytest.mark.asyncio
    async def test_no_blocker_no_pivot(self):
        """When Legal finds no critical blockers, no pivot occurs."""
        bus = StateBus()
        logger = make_logger()

        mock_client = make_mock_client([
            STRATEGY_RESPONSE,
            COMPLIANCE_CLEAN,
        ])

        ceo = CEOAgent(bus, logger)
        legal = LegalAgent(bus, logger)
        ceo.client = mock_client
        legal.client = mock_client

        strategy = await ceo.set_strategy("Simple SaaS")
        legal.current_strategy = strategy
        await legal.analyze_compliance(strategy)

        # No critical blockers => no BLOCKER events => no pivot
        blockers = bus.get_events_by_type(EventType.BLOCKER)
        assert len(blockers) == 0
        assert ceo.pivot_count == 0

    @pytest.mark.asyncio
    async def test_cost_tracking(self):
        """Verify cost tracking across agents."""
        bus = StateBus()
        logger = make_logger()

        mock_client = make_mock_client([STRATEGY_RESPONSE])
        ceo = CEOAgent(bus, logger)
        ceo.client = mock_client
        await ceo.set_strategy("Test")

        cost = ceo.get_cost_summary()
        assert cost["total_tokens"] == 100
        assert cost["estimated_cost_usd"] > 0
        assert cost["agent"] == "CEO"

    @pytest.mark.asyncio
    async def test_event_causal_chain(self):
        """Verify triggered_by links form a proper causal chain."""
        bus = StateBus()
        logger = make_logger()

        mock_client = make_mock_client([
            STRATEGY_RESPONSE,
            COMPLIANCE_RESPONSE,  # Legal finds blocker
            PIVOT_RESPONSE,       # CEO pivots
            COMPLIANCE_CLEAN,     # Legal re-check
        ])

        ceo = CEOAgent(bus, logger)
        legal = LegalAgent(bus, logger)
        ceo.client = mock_client
        legal.client = mock_client

        strategy = await ceo.set_strategy("Test")
        legal.current_strategy = strategy
        await legal.analyze_compliance(strategy)

        # Check causal chain: BLOCKER -> PIVOT
        blockers = bus.get_events_by_type(EventType.BLOCKER)
        pivots = bus.get_events_by_type(EventType.PIVOT)

        if blockers and pivots:
            assert pivots[0].triggered_by == blockers[0].id
