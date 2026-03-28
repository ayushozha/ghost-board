"""Lightweight rule-based agents for massive-scale simulation.

No LLM calls - uses numpy-vectorized math for stance updates.
Can simulate 1M agents updating in under 1 second per round.

Each agent has:
  - archetype (str): vc, early_adopter, skeptic, journalist, competitor, regulator
  - stance (float): -1.0 to 1.0 (negative to positive)
  - influence (float): 0.0 to 1.0 (how much they affect neighbors)
  - drift_rate (float): how quickly stance changes per round
  - response_probability (float): chance of voting in each round
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

# Archetype parameters: (initial_stance_mean, initial_stance_std, influence, drift_rate, response_prob)
ARCHETYPE_PARAMS = {
    "vc":            (0.1,  0.3, 0.7, 0.15, 0.8),
    "early_adopter": (0.3,  0.2, 0.4, 0.20, 0.9),
    "skeptic":       (-0.3, 0.2, 0.5, 0.10, 0.7),
    "journalist":    (0.0,  0.4, 0.8, 0.25, 0.6),
    "competitor":    (-0.4, 0.2, 0.6, 0.05, 0.5),
    "regulator":     (-0.2, 0.1, 0.9, 0.03, 0.4),
}

# Distribution weights for spawning (same as personas.py)
ARCHETYPE_WEIGHTS = {
    "vc": 0.15, "early_adopter": 0.30, "skeptic": 0.20,
    "journalist": 0.10, "competitor": 0.10, "regulator": 0.15,
}


@dataclass
class LightweightSwarm:
    """Vectorized swarm of lightweight agents using numpy arrays."""
    count: int
    archetypes: np.ndarray       # int array (archetype index)
    stances: np.ndarray          # float array (-1 to 1)
    influences: np.ndarray       # float array (0 to 1)
    drift_rates: np.ndarray      # float array
    response_probs: np.ndarray   # float array (0 to 1)
    archetype_names: list[str]   # index -> name mapping


def spawn_swarm(count: int, seed: int = 42) -> LightweightSwarm:
    """Spawn a swarm of lightweight agents with archetype distribution.

    Uses numpy for vectorized initialization - 1M agents in ~0.1 seconds.
    """
    rng = np.random.default_rng(seed)

    arch_list = list(ARCHETYPE_WEIGHTS.keys())
    arch_probs = np.array([ARCHETYPE_WEIGHTS[a] for a in arch_list])
    arch_probs /= arch_probs.sum()

    # Assign archetypes
    archetype_indices = rng.choice(len(arch_list), size=count, p=arch_probs)

    # Initialize arrays
    stances = np.zeros(count, dtype=np.float32)
    influences = np.zeros(count, dtype=np.float32)
    drift_rates = np.zeros(count, dtype=np.float32)
    response_probs = np.zeros(count, dtype=np.float32)

    # Vectorized initialization by archetype
    for idx, arch_name in enumerate(arch_list):
        mask = archetype_indices == idx
        n = mask.sum()
        if n == 0:
            continue

        mean, std, influence, drift, resp = ARCHETYPE_PARAMS[arch_name]
        stances[mask] = np.clip(rng.normal(mean, std, n), -1.0, 1.0).astype(np.float32)
        influences[mask] = influence + rng.normal(0, 0.05, n).astype(np.float32)
        drift_rates[mask] = drift
        response_probs[mask] = resp + rng.normal(0, 0.05, n).astype(np.float32)

    influences = np.clip(influences, 0.0, 1.0)
    response_probs = np.clip(response_probs, 0.1, 1.0)

    return LightweightSwarm(
        count=count,
        archetypes=archetype_indices,
        stances=stances,
        influences=influences,
        drift_rates=drift_rates,
        response_probs=response_probs,
        archetype_names=arch_list,
    )


def update_stances(
    swarm: LightweightSwarm,
    llm_sentiment: float,
    llm_influence: float = 0.3,
    noise_scale: float = 0.05,
    rng: np.random.Generator | None = None,
) -> None:
    """Update all agent stances in one vectorized operation.

    Formula per agent:
      new_stance = stance + drift_rate * (
          llm_influence * (llm_sentiment - stance) +    # pull toward LLM signal
          (1 - llm_influence) * archetype_bias +        # archetype bias
          noise                                          # random noise
      )

    This runs in ~10ms for 1M agents.
    """
    if rng is None:
        rng = np.random.default_rng()

    # Archetype biases (pull toward archetype mean)
    arch_means = np.array([ARCHETYPE_PARAMS[a][0] for a in swarm.archetype_names], dtype=np.float32)
    archetype_bias = arch_means[swarm.archetypes] - swarm.stances

    # LLM pull (toward the LLM agents' average sentiment)
    llm_pull = llm_sentiment - swarm.stances

    # Random noise
    noise = rng.normal(0, noise_scale, swarm.count).astype(np.float32)

    # Update
    delta = swarm.drift_rates * (
        llm_influence * llm_pull +
        (1 - llm_influence) * archetype_bias * 0.3 +
        noise
    )
    swarm.stances = np.clip(swarm.stances + delta, -1.0, 1.0)


def collect_votes(swarm: LightweightSwarm, rng: np.random.Generator | None = None) -> dict[str, Any]:
    """Collect stance votes from the swarm.

    Each agent votes with probability response_prob.
    Returns aggregated results.
    """
    if rng is None:
        rng = np.random.default_rng()

    # Determine which agents vote
    vote_mask = rng.random(swarm.count) < swarm.response_probs
    voting_stances = swarm.stances[vote_mask]

    if len(voting_stances) == 0:
        return {"avg_sentiment": 0.0, "positive": 0, "neutral": 0, "negative": 0, "voters": 0, "total": swarm.count}

    positive = int((voting_stances > 0.2).sum())
    negative = int((voting_stances < -0.2).sum())
    neutral = int(len(voting_stances) - positive - negative)

    # Per-archetype breakdown
    archetype_sentiments = {}
    for idx, name in enumerate(swarm.archetype_names):
        arch_mask = swarm.archetypes[vote_mask] == idx
        if arch_mask.sum() > 0:
            archetype_sentiments[name] = float(voting_stances[arch_mask].mean())

    return {
        "avg_sentiment": float(voting_stances.mean()),
        "std_sentiment": float(voting_stances.std()),
        "positive": positive,
        "neutral": neutral,
        "negative": negative,
        "voters": int(vote_mask.sum()),
        "total": swarm.count,
        "participation_rate": float(vote_mask.mean()),
        "archetype_breakdown": archetype_sentiments,
    }


def get_swarm_summary(swarm: LightweightSwarm) -> dict[str, Any]:
    """Get current swarm state summary."""
    arch_counts = {}
    arch_sentiments = {}
    for idx, name in enumerate(swarm.archetype_names):
        mask = swarm.archetypes == idx
        count = int(mask.sum())
        if count > 0:
            arch_counts[name] = count
            arch_sentiments[name] = float(swarm.stances[mask].mean())

    return {
        "total_agents": swarm.count,
        "avg_sentiment": float(swarm.stances.mean()),
        "std_sentiment": float(swarm.stances.std()),
        "archetype_counts": arch_counts,
        "archetype_sentiments": arch_sentiments,
    }
