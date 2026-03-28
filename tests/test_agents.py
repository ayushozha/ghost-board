"""Tests for all agent classes with mocked LLM calls."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

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


# --- Mock helpers ---

class MockChoice:
    def __init__(self, content: str):
        self.message = MagicMock(content=content)

class MockUsage:
    def __init__(self):
        self.total_tokens = 100
        self.prompt_tokens = 60
        self.completion_tokens = 40

class MockResponse:
    def __init__(self, content: str):
        self.choices = [MockChoice(content)]
        self.usage = MockUsage()


def make_strategy_json(**overrides) -> str:
    data = {
        "startup_idea": "AI compliance tool",
        "target_market": "fintech",
        "business_model": "SaaS",
        "key_differentiators": ["real-time"],
        "constraints": ["CFPB regulations"],
    }
    data.update(overrides)
    return json.dumps(data)


def make_bus_and_logger() -> tuple[StateBus, TraceLogger]:
    bus = StateBus()
    logger = TraceLogger.__new__(TraceLogger)
    logger._use_wandb = False
    logger._wandb_run = None
    logger._json_log = []
    logger._json_path = "outputs/trace.json"
    return bus, logger


# --- CEO Tests ---

class TestCEOAgent:
    @pytest.mark.asyncio
    @patch("agents.base.AsyncOpenAI")
    async def test_set_strategy(self, mock_openai_cls):
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=MockResponse(make_strategy_json())
        )
        mock_openai_cls.return_value = mock_client

        bus, logger = make_bus_and_logger()
        from agents.ceo import CEOAgent
        ceo = CEOAgent(bus, logger)
        ceo.client = mock_client

        strategy = await ceo.set_strategy("AI compliance tool")

        assert strategy.startup_idea == "AI compliance tool"
        assert strategy.business_model == "SaaS"
        assert ceo.current_strategy is not None

        # Check event was published
        events = bus.get_events_by_type(EventType.STRATEGY_SET)
        assert len(events) == 1

    @pytest.mark.asyncio
    @patch("agents.base.AsyncOpenAI")
    async def test_process_blocker_triggers_pivot(self, mock_openai_cls):
        mock_client = AsyncMock()

        # First call: set_strategy, Second call: pivot
        pivot_response = json.dumps({
            "startup_idea": "B2B compliance API",
            "target_market": "banks",
            "business_model": "API",
            "key_differentiators": ["enterprise"],
            "constraints": [],
            "pivot_reason": "Legal blocker",
            "changes_for_cto": "Rebuild as API",
            "changes_for_cfo": "Adjust pricing",
            "changes_for_cmo": "Target enterprise",
        })
        mock_client.chat.completions.create = AsyncMock(
            side_effect=[
                MockResponse(make_strategy_json()),
                MockResponse(pivot_response),
            ]
        )
        mock_openai_cls.return_value = mock_client

        bus, logger = make_bus_and_logger()
        from agents.ceo import CEOAgent
        ceo = CEOAgent(bus, logger)
        ceo.client = mock_client

        await ceo.set_strategy("AI compliance tool")

        blocker_event = AgentEvent(
            type=EventType.BLOCKER,
            source="Legal",
            payload=BlockerPayload(
                severity="CRITICAL",
                area="regulatory",
                description="CFPB violation",
                citations=["https://cfpb.gov/rules"],
            ),
        )
        await ceo.process_blocker(blocker_event)

        assert ceo.pivot_count == 1
        pivot_events = bus.get_events_by_type(EventType.PIVOT)
        assert len(pivot_events) == 1


# --- CTO Tests ---

class TestCTOAgent:
    @pytest.mark.asyncio
    @patch("agents.base.AsyncOpenAI")
    async def test_generate_prototype(self, mock_openai_cls):
        mock_client = AsyncMock()
        code_response = json.dumps({
            "files": [
                {"filename": "app.py", "content": "print('hello')", "description": "Main app"},
                {"filename": "models.py", "content": "class User: pass", "description": "Models"},
            ],
            "description": "Test prototype",
        })
        mock_client.chat.completions.create = AsyncMock(
            return_value=MockResponse(code_response)
        )
        mock_openai_cls.return_value = mock_client

        bus, logger = make_bus_and_logger()
        from agents.cto import CTOAgent
        cto = CTOAgent(bus, logger)
        cto.client = mock_client

        strategy = StrategyPayload(
            startup_idea="test", target_market="devs", business_model="SaaS"
        )
        result = await cto.generate_prototype(strategy)

        assert len(result.files_generated) == 2
        events = bus.get_events_by_type(EventType.PROTOTYPE_READY)
        assert len(events) == 1


# --- Legal Tests ---

class TestLegalAgent:
    @pytest.mark.asyncio
    @patch("agents.base.AsyncOpenAI")
    async def test_compliance_analysis(self, mock_openai_cls):
        mock_client = AsyncMock()
        compliance_response = json.dumps({
            "risk_level": "HIGH",
            "regulations_checked": ["CFPB", "FinCEN"],
            "blockers": [
                {
                    "severity": "HIGH",
                    "area": "lending",
                    "description": "Requires state lending license",
                    "citations": ["12 CFR 1026"],
                    "recommended_action": "Obtain license",
                }
            ],
        })
        mock_client.chat.completions.create = AsyncMock(
            return_value=MockResponse(compliance_response)
        )
        mock_openai_cls.return_value = mock_client

        bus, logger = make_bus_and_logger()
        from agents.legal import LegalAgent
        legal = LegalAgent(bus, logger)
        legal.client = mock_client

        # Force fallback path (no responses API in mock)
        strategy = StrategyPayload(
            startup_idea="lending platform",
            target_market="consumers",
            business_model="marketplace",
        )

        # Patch the responses API to raise so it falls back to chat
        mock_client.responses = MagicMock()
        mock_client.responses.create = AsyncMock(side_effect=Exception("no responses API"))

        result = await legal.analyze_compliance(strategy)
        assert result.risk_level == "HIGH"
        assert result.blockers_found == 1

        # Should have published a BLOCKER event
        blockers = bus.get_events_by_type(EventType.BLOCKER)
        assert len(blockers) == 1


# --- CFO Tests ---

class TestCFOAgent:
    @pytest.mark.asyncio
    @patch("agents.base.AsyncOpenAI")
    async def test_generate_financial_model(self, mock_openai_cls):
        mock_client = AsyncMock()
        model_response = json.dumps({
            "revenue_year1": 120000,
            "revenue_year3": 2500000,
            "burn_rate_monthly": 45000,
            "runway_months": 18,
            "funding_required": 1500000,
            "cac": 200,
            "ltv": 3000,
            "gross_margin": 75,
        })
        mock_client.chat.completions.create = AsyncMock(
            return_value=MockResponse(model_response)
        )
        mock_openai_cls.return_value = mock_client

        bus, logger = make_bus_and_logger()
        from agents.cfo import CFOAgent
        cfo = CFOAgent(bus, logger)
        cfo.client = mock_client

        strategy = StrategyPayload(
            startup_idea="test", target_market="smb", business_model="SaaS"
        )
        result = await cfo.generate_financial_model(strategy)

        assert result.revenue_year1 == 120000
        assert result.runway_months == 18

        events = bus.get_events_by_type(EventType.FINANCIAL_MODEL_READY)
        assert len(events) == 1


# --- CMO Tests ---

class TestCMOAgent:
    @pytest.mark.asyncio
    @patch("agents.base.AsyncOpenAI")
    async def test_generate_gtm(self, mock_openai_cls):
        mock_client = AsyncMock()
        gtm_response = json.dumps({
            "positioning": "The compliance autopilot for fintech",
            "tagline": "Compliance on autopilot",
            "value_props": ["Save time", "Reduce risk"],
            "target_channels": ["LinkedIn", "Product Hunt"],
            "landing_page": {
                "hero_headline": "Compliance on Autopilot",
                "hero_subheadline": "Let AI handle your regulatory burden",
                "cta_text": "Start Free Trial",
                "features_section": [],
                "faq": [],
            },
        })
        mock_client.chat.completions.create = AsyncMock(
            return_value=MockResponse(gtm_response)
        )
        mock_openai_cls.return_value = mock_client

        bus, logger = make_bus_and_logger()
        from agents.cmo import CMOAgent
        cmo = CMOAgent(bus, logger)
        cmo.client = mock_client

        strategy = StrategyPayload(
            startup_idea="compliance tool",
            target_market="fintech",
            business_model="SaaS",
        )
        result = await cmo.generate_gtm(strategy)

        assert result.tagline == "Compliance on autopilot"
        assert "LinkedIn" in result.target_channels

        events = bus.get_events_by_type(EventType.GTM_READY)
        assert len(events) == 1


# --- Edge case tests ---

class TestCEOMaxPivots:
    @pytest.mark.asyncio
    @patch("agents.base.AsyncOpenAI")
    async def test_max_pivot_limit(self, mock_openai_cls):
        """CEO should stop pivoting after MAX_PIVOTS."""
        mock_client = AsyncMock()
        pivot_json = json.dumps({
            "startup_idea": "pivoted",
            "target_market": "new",
            "business_model": "new",
            "key_differentiators": [],
            "constraints": [],
            "pivot_reason": "test",
            "changes_for_cto": "x",
            "changes_for_cfo": "x",
            "changes_for_cmo": "x",
        })
        mock_client.chat.completions.create = AsyncMock(
            side_effect=[
                MockResponse(make_strategy_json()),
                MockResponse(pivot_json),
                MockResponse(pivot_json),
                MockResponse(pivot_json),
                MockResponse(pivot_json),
            ]
        )

        bus, logger = make_bus_and_logger()
        from agents.ceo import CEOAgent
        ceo = CEOAgent(bus, logger)
        ceo.client = mock_client

        await ceo.set_strategy("test")

        # Send 5 critical blockers - only MAX_PIVOTS should trigger pivots
        for i in range(5):
            blocker = AgentEvent(
                type=EventType.BLOCKER,
                source="Legal",
                payload=BlockerPayload(severity="CRITICAL", area="test", description=f"blocker {i}"),
            )
            await ceo.process_blocker(blocker)

        assert ceo.pivot_count == ceo.MAX_PIVOTS  # Should cap at MAX_PIVOTS

    @pytest.mark.asyncio
    @patch("agents.base.AsyncOpenAI")
    async def test_low_severity_no_pivot(self, mock_openai_cls):
        """LOW/MEDIUM blockers should not trigger pivots."""
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=MockResponse(make_strategy_json())
        )

        bus, logger = make_bus_and_logger()
        from agents.ceo import CEOAgent
        ceo = CEOAgent(bus, logger)
        ceo.client = mock_client

        await ceo.set_strategy("test")

        for severity in ["LOW", "MEDIUM"]:
            blocker = AgentEvent(
                type=EventType.BLOCKER,
                source="Legal",
                payload=BlockerPayload(severity=severity, area="test", description="minor"),
            )
            await ceo.process_blocker(blocker)

        assert ceo.pivot_count == 0


class TestRetryLogic:
    @pytest.mark.asyncio
    @patch("agents.base.AsyncOpenAI")
    async def test_call_llm_retry_on_failure(self, mock_openai_cls):
        """call_llm should retry on failure and return {} on exhaustion."""
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("API error")
        )

        bus, logger = make_bus_and_logger()
        from agents.base import BaseAgent
        agent = BaseAgent(bus, logger)
        agent.client = mock_client
        agent.name = "TestAgent"

        result = await agent.call_llm(
            [{"role": "user", "content": "test"}],
            retries=2,
        )

        assert result == "{}"
        assert mock_client.chat.completions.create.call_count == 2
