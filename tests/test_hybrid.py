"""Tests for lightweight agents and hybrid simulation engine."""

import asyncio
import time
import numpy as np
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from simulation.lightweight_agents import (
    spawn_swarm, update_stances, collect_votes, get_swarm_summary,
)
from simulation.hybrid_engine import run_hybrid_simulation
from simulation.analyzer import MarketSignal
from simulation.engine import SimulationMessage
from simulation.personas import MarketPersona


class TestLightweightAgents:
    def test_spawn_swarm_count(self):
        swarm = spawn_swarm(1000)
        assert swarm.count == 1000
        assert len(swarm.stances) == 1000
        assert len(swarm.archetypes) == 1000

    def test_spawn_swarm_archetype_distribution(self):
        swarm = spawn_swarm(10000)
        summary = get_swarm_summary(swarm)
        counts = summary["archetype_counts"]
        # Should have all archetypes
        assert len(counts) >= 5
        # early_adopter should be most common (30% weight)
        assert counts.get("early_adopter", 0) > counts.get("regulator", 0)

    def test_stances_in_range(self):
        swarm = spawn_swarm(5000)
        assert swarm.stances.min() >= -1.0
        assert swarm.stances.max() <= 1.0

    def test_update_stances_shifts_toward_signal(self):
        swarm = spawn_swarm(1000, seed=123)
        initial_mean = swarm.stances.mean()

        # Push strongly positive
        for _ in range(10):
            update_stances(swarm, llm_sentiment=0.9, llm_influence=0.5)

        # Mean should have shifted positive
        assert swarm.stances.mean() > initial_mean

    def test_update_stances_negative_signal(self):
        swarm = spawn_swarm(1000, seed=456)
        initial_mean = swarm.stances.mean()

        for _ in range(10):
            update_stances(swarm, llm_sentiment=-0.8, llm_influence=0.5)

        assert swarm.stances.mean() < initial_mean

    def test_collect_votes(self):
        swarm = spawn_swarm(5000)
        votes = collect_votes(swarm)
        assert "avg_sentiment" in votes
        assert "positive" in votes
        assert "negative" in votes
        assert "neutral" in votes
        assert votes["voters"] > 0
        assert votes["voters"] <= swarm.count

    def test_collect_votes_archetype_breakdown(self):
        swarm = spawn_swarm(5000)
        votes = collect_votes(swarm)
        assert "archetype_breakdown" in votes
        assert len(votes["archetype_breakdown"]) >= 4

    def test_performance_100k_spawn(self):
        """100K agents should spawn in under 1 second."""
        start = time.time()
        swarm = spawn_swarm(100_000)
        duration = time.time() - start
        assert duration < 1.0, f"100K spawn took {duration:.2f}s"
        assert swarm.count == 100_000

    def test_performance_100k_update(self):
        """100K agents should update in under 0.5 seconds."""
        swarm = spawn_swarm(100_000)
        start = time.time()
        update_stances(swarm, llm_sentiment=0.5)
        duration = time.time() - start
        assert duration < 0.5, f"100K update took {duration:.2f}s"

    def test_performance_1m_spawn(self):
        """1M agents should spawn in under 5 seconds."""
        start = time.time()
        swarm = spawn_swarm(1_000_000)
        duration = time.time() - start
        assert duration < 5.0, f"1M spawn took {duration:.2f}s"
        assert swarm.count == 1_000_000

    def test_performance_1m_update(self):
        """1M agents should update in under 1 second."""
        swarm = spawn_swarm(1_000_000)
        start = time.time()
        update_stances(swarm, llm_sentiment=0.3)
        duration = time.time() - start
        assert duration < 1.0, f"1M update took {duration:.2f}s"

    def test_swarm_summary(self):
        swarm = spawn_swarm(1000)
        summary = get_swarm_summary(swarm)
        assert summary["total_agents"] == 1000
        assert -1.0 <= summary["avg_sentiment"] <= 1.0
        assert summary["std_sentiment"] >= 0

    def test_determinism_same_seed(self):
        """Same seed should produce identical swarms."""
        swarm1 = spawn_swarm(5000, seed=999)
        swarm2 = spawn_swarm(5000, seed=999)
        assert np.array_equal(swarm1.stances, swarm2.stances)
        assert np.array_equal(swarm1.archetypes, swarm2.archetypes)

    def test_different_seeds_differ(self):
        """Different seeds should produce different swarms."""
        swarm1 = spawn_swarm(5000, seed=1)
        swarm2 = spawn_swarm(5000, seed=2)
        assert not np.array_equal(swarm1.stances, swarm2.stances)


# ---------------------------------------------------------------------------
# Helpers for mocking the hybrid simulation LLM calls
# ---------------------------------------------------------------------------

def _make_fake_personas(count: int) -> list[MarketPersona]:
    """Generate deterministic fake personas for testing."""
    archetypes = ["vc", "early_adopter", "skeptic", "journalist", "competitor", "regulator"]
    stances = ["positive", "neutral", "negative", "neutral", "hostile", "negative"]
    personas = []
    for i in range(count):
        arch = archetypes[i % len(archetypes)]
        personas.append(MarketPersona(
            name=f"TestPersona_{i}",
            archetype=arch,
            background=f"Background for persona {i}",
            priorities=["growth", "compliance"],
            risk_tolerance=0.5,
            initial_stance=stances[i % len(stances)],
            influence_score=0.5,
        ))
    return personas


def _make_fake_message(persona: MarketPersona, round_num: int, idx: int) -> SimulationMessage:
    """Create a deterministic fake simulation message."""
    sentiment = 0.2 if persona.initial_stance == "positive" else -0.2
    return SimulationMessage(
        round_num=round_num,
        persona_name=persona.name,
        archetype=persona.archetype,
        content=f"Test message from {persona.name} in round {round_num}. "
                f"This is a promising and innovative approach with some regulatory concern.",
        sentiment=sentiment,
        references=[],
        stance_change="none",
    )


def _make_fake_signal() -> MarketSignal:
    """Return a plausible MarketSignal for mocking."""
    return MarketSignal(
        overall_sentiment=0.15,
        confidence=0.7,
        key_concerns=["Regulatory uncertainty", "Market competition"],
        key_strengths=["Strong technology", "Good team"],
        pivot_recommended=False,
        pivot_suggestion="",
        archetype_breakdown={"vc": 0.3, "skeptic": -0.2},
        stance_shifts={"TestPersona_0": "more_positive"},
        summary="The market shows cautious optimism with regulatory concerns.",
    )


# ---------------------------------------------------------------------------
# Hybrid simulation performance and integration tests
# ---------------------------------------------------------------------------

class TestHybridSimulationPerformance:
    """Performance and integration tests for the hybrid simulation engine."""

    @pytest.mark.asyncio
    @patch("simulation.hybrid_engine._save_hybrid_outputs")
    @patch("simulation.hybrid_engine.analyze_simulation")
    @patch("simulation.hybrid_engine._persona_turn")
    @patch("simulation.hybrid_engine.generate_personas")
    async def test_hybrid_10k_agents_performance(
        self,
        mock_generate_personas,
        mock_persona_turn,
        mock_analyze_simulation,
        mock_save_outputs,
    ):
        """10K lightweight + 50 LLM agents should complete in under 10 seconds."""
        # Setup: 50 fake LLM personas
        fake_personas = _make_fake_personas(50)
        mock_generate_personas.return_value = fake_personas

        # _persona_turn returns a fake message based on persona + round
        call_count = 0

        async def fake_persona_turn(client, persona, startup_idea, strategy_summary,
                                    round_num, message_history, current_stance,
                                    other_personas):
            nonlocal call_count
            call_count += 1
            return _make_fake_message(persona, round_num, call_count)

        mock_persona_turn.side_effect = fake_persona_turn

        # analyze_simulation returns a fake MarketSignal
        mock_analyze_simulation.return_value = _make_fake_signal()

        # _save_hybrid_outputs is a no-op
        mock_save_outputs.return_value = None

        # Create a mock client (won't be used since everything is mocked)
        mock_client = MagicMock()

        start = time.time()
        sim_result, signal, hybrid_stats = await run_hybrid_simulation(
            startup_idea="Test fintech startup for performance benchmarking",
            strategy_summary="B2B compliance API for mid-size banks",
            scale="standard",  # 50 LLM + 10,000 lightweight
            client=mock_client,
        )
        duration = time.time() - start

        # Performance: must complete in under 10 seconds
        assert duration < 10.0, f"Hybrid simulation took {duration:.2f}s, expected < 10s"

        # Total agents must be >= 10,000
        assert hybrid_stats["total_agents"] >= 10_000, (
            f"Expected >= 10,000 total agents, got {hybrid_stats['total_agents']}"
        )

        # swarm_history should have one entry per round
        num_rounds = hybrid_stats["rounds"]
        assert len(hybrid_stats["swarm_history"]) == num_rounds, (
            f"Expected {num_rounds} swarm_history entries, got {len(hybrid_stats['swarm_history'])}"
        )

        # Each swarm_history entry should have crowd sentiment data
        for entry in hybrid_stats["swarm_history"]:
            assert "round" in entry
            assert "crowd_sentiment" in entry
            assert "crowd_positive" in entry
            assert "crowd_negative" in entry
            assert "voters" in entry

        # sim_result should have rounds with messages
        assert len(sim_result.rounds) == num_rounds
        assert sim_result.total_messages > 0

    @pytest.mark.asyncio
    @patch("simulation.hybrid_engine._save_hybrid_outputs")
    @patch("simulation.hybrid_engine.analyze_simulation")
    @patch("simulation.hybrid_engine._persona_turn")
    @patch("simulation.hybrid_engine.generate_personas")
    async def test_hybrid_simulation_produces_market_signal(
        self,
        mock_generate_personas,
        mock_persona_turn,
        mock_analyze_simulation,
        mock_save_outputs,
    ):
        """Hybrid simulation must produce a valid MarketSignal with real data."""
        fake_personas = _make_fake_personas(30)
        mock_generate_personas.return_value = fake_personas

        async def fake_persona_turn(client, persona, startup_idea, strategy_summary,
                                    round_num, message_history, current_stance,
                                    other_personas):
            return _make_fake_message(persona, round_num, 0)

        mock_persona_turn.side_effect = fake_persona_turn
        mock_analyze_simulation.return_value = _make_fake_signal()
        mock_save_outputs.return_value = None

        mock_client = MagicMock()

        sim_result, signal, hybrid_stats = await run_hybrid_simulation(
            startup_idea="Stablecoin payout platform for gig workers",
            strategy_summary="API-first B2B targeting 5 states initially",
            scale="demo",  # 30 LLM + 1,000 lightweight
            client=mock_client,
        )

        # Signal must be a MarketSignal instance
        assert isinstance(signal, MarketSignal)

        # overall_sentiment (after crowd blending) must be in valid range
        assert -1.0 <= signal.overall_sentiment <= 1.0, (
            f"Blended sentiment {signal.overall_sentiment} out of [-1, 1] range"
        )

        # Must have non-empty key_concerns
        assert len(signal.key_concerns) > 0, "MarketSignal has no key_concerns"

        # Must have non-empty key_strengths
        assert len(signal.key_strengths) > 0, "MarketSignal has no key_strengths"

        # Must have non-empty summary
        assert signal.summary, "MarketSignal summary is empty"

        # confidence should be a valid float
        assert 0.0 <= signal.confidence <= 1.0

        # archetype_breakdown should have entries (from analyze + crowd blending)
        assert len(signal.archetype_breakdown) > 0, "archetype_breakdown is empty"

    @pytest.mark.asyncio
    @patch("simulation.hybrid_engine._save_hybrid_outputs")
    @patch("simulation.hybrid_engine.analyze_simulation")
    @patch("simulation.hybrid_engine._persona_turn")
    @patch("simulation.hybrid_engine.generate_personas")
    async def test_hybrid_simulation_emits_live_progress(
        self,
        mock_generate_personas,
        mock_persona_turn,
        mock_analyze_simulation,
        mock_save_outputs,
    ):
        fake_personas = _make_fake_personas(4)
        mock_generate_personas.return_value = fake_personas

        async def fake_persona_turn(client, persona, startup_idea, strategy_summary,
                                    round_num, message_history, current_stance,
                                    other_personas):
            msg = _make_fake_message(persona, round_num, 0)
            msg.references = [other_personas[0]] if other_personas else []
            return msg

        mock_persona_turn.side_effect = fake_persona_turn
        mock_analyze_simulation.return_value = _make_fake_signal()
        mock_save_outputs.return_value = None

        seen_events = []

        async def record_progress(event_type, payload):
            seen_events.append((event_type, payload))

        await run_hybrid_simulation(
            startup_idea="Realtime simulation test",
            strategy_summary="B2B compliance API",
            scale="demo",
            client=MagicMock(),
            progress_callback=record_progress,
        )

        event_types = [event_type for event_type, _payload in seen_events]
        assert event_types[0] == "simulation_start"
        assert event_types[-1] == "simulation_complete"
        assert "simulation_round" in event_types
        assert event_types.count("persona_post") == 4 * 5  # demo scale = 5 rounds

        round_payload = next(payload for event_type, payload in seen_events if event_type == "simulation_round")
        assert "sentiment_by_archetype" in round_payload
        assert "crowd_sentiment" in round_payload

    def test_lightweight_agents_stance_convergence(self):
        """1000 agents should converge toward strong positive signal over 15 rounds."""
        swarm = spawn_swarm(1000, seed=777)
        initial_mean = swarm.stances.mean()

        rng = np.random.default_rng(42)

        # Run 15 rounds with strong positive LLM signal.
        # Some archetypes (competitor, regulator) have negative bias which
        # partially counteracts the positive pull, so we need enough rounds.
        for _ in range(15):
            update_stances(
                swarm,
                llm_sentiment=0.8,
                llm_influence=0.5,
                noise_scale=0.02,
                rng=rng,
            )

        final_mean = swarm.stances.mean()

        # Average stance must have moved toward positive, past 0.3
        assert final_mean > 0.3, (
            f"Expected average stance > 0.3 after 15 rounds of +0.8 signal, "
            f"got {final_mean:.4f} (started at {initial_mean:.4f})"
        )

        # Must have shifted significantly from initial
        assert final_mean > initial_mean + 0.1, (
            f"Stance did not converge enough: initial={initial_mean:.4f}, final={final_mean:.4f}"
        )

        # Verify stances stay in valid range
        assert swarm.stances.min() >= -1.0
        assert swarm.stances.max() <= 1.0
