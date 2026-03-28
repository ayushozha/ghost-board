"""Tests for lightweight agents and hybrid simulation engine."""

import time
import numpy as np
import pytest
from simulation.lightweight_agents import (
    spawn_swarm, update_stances, collect_votes, get_swarm_summary,
)


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
