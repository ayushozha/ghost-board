"""Hybrid simulation engine: LLM agents + lightweight agents.

LLM agents (30-50): Full personality, real text responses via gpt-4o-mini.
Lightweight agents (1K-1M): Rule-based stance updates via numpy, no LLM calls.

LLM agents drive the narrative. Lightweight agents provide crowd sentiment.
Both contribute to the final MarketSignal.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

import numpy as np
from openai import AsyncOpenAI

from simulation.personas import MarketPersona, generate_personas
from simulation.engine import run_simulation, SimulationResult, SimulationRound, SimulationMessage
from simulation.analyzer import analyze_simulation, MarketSignal
from simulation.lightweight_agents import (
    LightweightSwarm, spawn_swarm, update_stances, collect_votes, get_swarm_summary,
)


# Scale presets: (llm_agents, lightweight_agents, rounds)
SCALE_PRESETS = {
    "demo": (30, 1_000, 5),
    "standard": (50, 10_000, 10),
    "large": (50, 100_000, 15),
    "million": (50, 1_000_000, 20),
}


async def run_hybrid_simulation(
    startup_idea: str,
    strategy_summary: str,
    scale: str = "demo",
    client: AsyncOpenAI | None = None,
) -> tuple[SimulationResult, MarketSignal, dict[str, Any]]:
    """Run hybrid simulation with LLM + lightweight agents.

    Returns (SimulationResult, MarketSignal, hybrid_stats).
    """
    if client is None:
        client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

    llm_count, lightweight_count, num_rounds = SCALE_PRESETS.get(scale, SCALE_PRESETS["demo"])

    start_time = time.time()

    # Phase 1: Generate LLM personas
    llm_personas = await generate_personas(
        startup_idea=startup_idea,
        target_market=strategy_summary,
        num_personas=llm_count,
        client=client,
    )

    # Phase 2: Spawn lightweight swarm
    swarm = spawn_swarm(lightweight_count)

    # Phase 3: Run hybrid rounds
    all_rounds: list[SimulationRound] = []
    rng = np.random.default_rng(42)
    swarm_history: list[dict[str, Any]] = []

    for round_num in range(1, num_rounds + 1):
        # 3a: LLM agents take their turns (real text)
        llm_result = await run_simulation(
            startup_idea=startup_idea,
            strategy_summary=strategy_summary,
            personas=llm_personas,
            num_rounds=1,  # one round at a time
            client=client,
        )

        round_messages = llm_result.rounds[0].messages if llm_result.rounds else []
        # Fix round numbers
        for msg in round_messages:
            msg.round_num = round_num

        # 3b: Calculate LLM sentiment for this round
        if round_messages:
            llm_sentiment = sum(m.sentiment for m in round_messages) / len(round_messages)
        else:
            llm_sentiment = 0.0

        # 3c: Update lightweight agent stances based on LLM output
        update_stances(swarm, llm_sentiment=llm_sentiment, rng=rng)

        # 3d: Collect lightweight votes
        votes = collect_votes(swarm, rng=rng)
        swarm_summary = get_swarm_summary(swarm)
        swarm_history.append({
            "round": round_num,
            "llm_sentiment": llm_sentiment,
            "crowd_sentiment": votes["avg_sentiment"],
            "crowd_positive": votes["positive"],
            "crowd_negative": votes["negative"],
            "crowd_neutral": votes["neutral"],
            "voters": votes["voters"],
            **swarm_summary,
        })

        # 3e: Blend sentiments for this round
        # Weight: 60% LLM (qualitative), 40% crowd (quantitative mass)
        blended_sentiment = 0.6 * llm_sentiment + 0.4 * votes["avg_sentiment"]

        all_rounds.append(SimulationRound(
            round_num=round_num,
            messages=round_messages,
            avg_sentiment=blended_sentiment,
        ))

    # Phase 4: Build combined result
    final_stances = {}
    for p in llm_personas:
        final_stances[p.name] = "positive" if llm_sentiment > 0.2 else ("negative" if llm_sentiment < -0.2 else "neutral")

    sim_result = SimulationResult(
        rounds=all_rounds,
        final_stances=final_stances,
        total_messages=sum(len(r.messages) for r in all_rounds),
    )

    # Phase 5: Analyze with LLM
    signal = await analyze_simulation(
        result=sim_result,
        startup_idea=startup_idea,
        client=client,
    )

    # Blend crowd sentiment into signal
    if swarm_history:
        final_crowd = swarm_history[-1]
        crowd_avg = final_crowd["crowd_sentiment"]
        signal.overall_sentiment = 0.6 * signal.overall_sentiment + 0.4 * crowd_avg

        # Add crowd data to archetype breakdown
        if final_crowd.get("archetype_sentiments"):
            for arch, sent in final_crowd["archetype_sentiments"].items():
                signal.archetype_breakdown[f"{arch}_crowd"] = sent

    duration = time.time() - start_time
    total_agents = llm_count + lightweight_count

    hybrid_stats = {
        "scale": scale,
        "llm_agents": llm_count,
        "lightweight_agents": lightweight_count,
        "total_agents": total_agents,
        "rounds": num_rounds,
        "duration_seconds": round(duration, 2),
        "agents_per_second": round(total_agents * num_rounds / max(duration, 0.01)),
        "swarm_history": swarm_history,
    }

    # Save structured outputs for dashboard
    _save_hybrid_outputs(sim_result, signal, llm_personas, hybrid_stats)

    return sim_result, signal, hybrid_stats


def _save_hybrid_outputs(
    sim_result: SimulationResult,
    signal: MarketSignal,
    personas: list,
    hybrid_stats: dict[str, Any],
) -> None:
    """Save simulation geo and results data for dashboard."""
    os.makedirs("outputs", exist_ok=True)

    # Geo data
    geo_data = []
    for p in personas:
        geo = getattr(p, 'geographic_location', None)
        entry = {
            "name": p.name,
            "archetype": p.archetype,
            "lat": geo.lat if geo else 0.0,
            "lng": geo.lng if geo else 0.0,
            "city": geo.city if geo else "",
            "country": geo.country if geo else "",
            "initial_stance": p.initial_stance,
            "influence": p.influence_score,
            "final_stance": sim_result.final_stances.get(p.name, "neutral"),
        }
        msgs = [m for r in sim_result.rounds for m in r.messages if m.persona_name == p.name]
        entry["messages"] = [{"round": m.round_num, "content": m.content, "sentiment": m.sentiment} for m in msgs]
        geo_data.append(entry)

    with open("outputs/simulation_geo.json", "w", encoding="utf-8") as f:
        json.dump(geo_data, f, indent=2)

    # Structured results
    rounds_data = []
    for rd in sim_result.rounds:
        sentiment_by_archetype: dict[str, list[float]] = {}
        posts = []
        for m in rd.messages:
            posts.append({
                "persona": m.persona_name,
                "archetype": m.archetype,
                "content": m.content,
                "sentiment": m.sentiment,
                "references": m.references,
            })
            if m.archetype not in sentiment_by_archetype:
                sentiment_by_archetype[m.archetype] = []
            sentiment_by_archetype[m.archetype].append(m.sentiment)

        avg_by_archetype = {k: sum(v) / len(v) for k, v in sentiment_by_archetype.items() if v}
        rounds_data.append({
            "round_number": rd.round_num,
            "posts": posts,
            "avg_sentiment": rd.avg_sentiment,
            "sentiment_by_archetype": avg_by_archetype,
        })

    results = {
        "total_llm_agents": hybrid_stats["llm_agents"],
        "total_lightweight_agents": hybrid_stats["lightweight_agents"],
        "total_agents": hybrid_stats["total_agents"],
        "rounds": hybrid_stats["rounds"],
        "rounds_data": rounds_data,
        "final_signal": {
            "overall_sentiment": signal.overall_sentiment,
            "confidence": signal.confidence,
            "key_concerns": signal.key_concerns,
            "key_strengths": signal.key_strengths,
            "pivot_recommended": signal.pivot_recommended,
            "pivot_suggestion": signal.pivot_suggestion,
        },
        "final_stances": sim_result.final_stances,
        "total_messages": sim_result.total_messages,
        "duration_seconds": hybrid_stats["duration_seconds"],
        "swarm_history": hybrid_stats.get("swarm_history", []),
    }

    with open("outputs/simulation_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
