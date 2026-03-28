"""Tests for simulation module."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock

from simulation.personas import MarketPersona, generate_personas, _fallback_personas
from simulation.engine import run_simulation, SimulationMessage, _shift_stance
from simulation.analyzer import analyze_simulation, MarketSignal
from simulation.engine import SimulationResult, SimulationRound


# Mock helpers
class MockChoice:
    def __init__(self, content):
        self.message = MagicMock(content=content)

class MockUsage:
    total_tokens = 50
    prompt_tokens = 30
    completion_tokens = 20

class MockResponse:
    def __init__(self, content):
        self.choices = [MockChoice(content)]
        self.usage = MockUsage()


class TestPersonas:
    def test_fallback_personas(self):
        personas = _fallback_personas("test idea", 5)
        assert len(personas) == 5
        assert all(isinstance(p, MarketPersona) for p in personas)

    def test_archetype_diversity(self):
        personas = _fallback_personas("test idea", 10)
        archetypes = {p.archetype for p in personas}
        assert len(archetypes) >= 4  # Should have multiple archetypes

    @pytest.mark.asyncio
    async def test_generate_personas_with_mock(self):
        mock_client = AsyncMock()
        personas_json = json.dumps([
            {"name": "Alice", "archetype": "vc", "background": "VC partner", "priorities": ["ROI"], "risk_tolerance": 0.7, "initial_stance": "neutral", "influence_score": 0.8},
            {"name": "Bob", "archetype": "skeptic", "background": "Industry veteran", "priorities": ["security"], "risk_tolerance": 0.2, "initial_stance": "negative", "influence_score": 0.5},
        ])
        mock_client.chat.completions.create = AsyncMock(return_value=MockResponse(personas_json))

        result = await generate_personas("test", "devs", num_personas=2, client=mock_client)
        assert len(result) == 2
        assert result[0].name == "Alice"


class TestEngine:
    def test_shift_stance_positive(self):
        assert _shift_stance("neutral", positive=True) == "positive"
        assert _shift_stance("negative", positive=True) == "neutral"
        assert _shift_stance("positive", positive=True) == "positive"  # already max

    def test_shift_stance_negative(self):
        assert _shift_stance("neutral", positive=False) == "negative"
        assert _shift_stance("hostile", positive=False) == "hostile"  # already min

    @pytest.mark.asyncio
    async def test_run_simulation_with_mock(self):
        mock_client = AsyncMock()
        turn_response = json.dumps({
            "content": "Interesting concept but needs more data.",
            "sentiment": 0.3,
            "references": [],
            "stance_change": "none",
        })
        mock_client.chat.completions.create = AsyncMock(return_value=MockResponse(turn_response))

        personas = [
            MarketPersona(name="Alice", archetype="vc", background="VC", priorities=["ROI"], risk_tolerance=0.7, initial_stance="neutral", influence_score=0.8),
            MarketPersona(name="Bob", archetype="skeptic", background="Skeptic", priorities=["risk"], risk_tolerance=0.2, initial_stance="negative", influence_score=0.5),
        ]

        result = await run_simulation(
            startup_idea="Test startup",
            strategy_summary="SaaS platform",
            personas=personas,
            num_rounds=2,
            client=mock_client,
        )

        assert len(result.rounds) == 2
        assert result.total_messages == 4  # 2 personas * 2 rounds
        assert all(m.persona_name in ["Alice", "Bob"] for r in result.rounds for m in r.messages)


class TestAnalyzer:
    @pytest.mark.asyncio
    async def test_analyze_simulation_with_mock(self):
        mock_client = AsyncMock()
        analysis_response = json.dumps({
            "key_concerns": ["pricing", "competition"],
            "key_strengths": ["innovation", "timing"],
            "pivot_recommended": False,
            "pivot_suggestion": "",
            "confidence": 0.75,
            "summary": "Generally positive reception with some concerns.",
        })
        mock_client.chat.completions.create = AsyncMock(return_value=MockResponse(analysis_response))

        sim_result = SimulationResult(
            rounds=[
                SimulationRound(
                    round_num=1,
                    messages=[
                        SimulationMessage(round_num=1, persona_name="Alice", archetype="vc", content="Good potential", sentiment=0.6),
                        SimulationMessage(round_num=1, persona_name="Bob", archetype="skeptic", content="Too risky", sentiment=-0.4),
                    ],
                    avg_sentiment=0.1,
                ),
            ],
            final_stances={"Alice": "positive", "Bob": "negative"},
            total_messages=2,
        )

        signal = await analyze_simulation(sim_result, "test startup", client=mock_client)

        assert isinstance(signal, MarketSignal)
        assert signal.confidence == 0.75
        assert "pricing" in signal.key_concerns
        assert signal.pivot_recommended is False
