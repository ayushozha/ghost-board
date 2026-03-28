"""Storage functions for recording simulation runs to database."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from db.models import (
    SimulationRun, PersonaReaction, MarketSignalRecord,
    get_engine, init_db, get_session,
)
from simulation.engine import SimulationResult
from simulation.analyzer import MarketSignal


def save_simulation_run(
    concept_name: str,
    concept_text: str,
    scale: str,
    num_personas: int,
    num_rounds: int,
    total_events: int,
    total_pivots: int,
    total_tokens: int,
    total_cost: float,
    sim_result: SimulationResult | None,
    market_signal: MarketSignal | None,
    cost_breakdown: dict[str, Any] | None = None,
    strategy_initial: dict[str, Any] | None = None,
    strategy_final: dict[str, Any] | None = None,
    integration_status: dict[str, str] | None = None,
) -> str:
    """Save a complete simulation run to the database.

    Returns the run ID.
    """
    engine = init_db()
    session = get_session(engine)

    run_id = str(uuid.uuid4())[:8]

    try:
        run = SimulationRun(
            id=run_id,
            concept_name=concept_name,
            concept_text=concept_text,
            scale=scale,
            num_personas=num_personas,
            num_rounds=num_rounds,
            total_events=total_events,
            total_pivots=total_pivots,
            total_tokens=total_tokens,
            total_cost_usd=total_cost,
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            status="completed",
            strategy_initial=strategy_initial,
            strategy_final=strategy_final,
            cost_breakdown=cost_breakdown,
            integration_status=integration_status,
        )
        session.add(run)

        # Save persona reactions
        if sim_result:
            for round_data in sim_result.rounds:
                for msg in round_data.messages:
                    reaction = PersonaReaction(
                        run_id=run_id,
                        round_num=msg.round_num,
                        persona_name=msg.persona_name,
                        archetype=msg.archetype,
                        content=msg.content,
                        sentiment=msg.sentiment,
                        stance=sim_result.final_stances.get(msg.persona_name, "neutral"),
                        stance_change=msg.stance_change,
                        references=msg.references,
                    )
                    session.add(reaction)

        # Save market signal
        if market_signal:
            signal = MarketSignalRecord(
                run_id=run_id,
                overall_sentiment=market_signal.overall_sentiment,
                confidence=market_signal.confidence,
                pivot_recommended=market_signal.pivot_recommended,
                pivot_suggestion=market_signal.pivot_suggestion,
                key_concerns=market_signal.key_concerns,
                key_strengths=market_signal.key_strengths,
                archetype_breakdown=market_signal.archetype_breakdown,
                summary=market_signal.summary,
            )
            session.add(signal)

        session.commit()
        return run_id

    except Exception as e:
        session.rollback()
        raise
    finally:
        session.close()


def get_run_history(limit: int = 50) -> list[dict[str, Any]]:
    """Get recent simulation run history."""
    engine = init_db()
    session = get_session(engine)

    try:
        runs = session.query(SimulationRun).order_by(
            SimulationRun.started_at.desc()
        ).limit(limit).all()

        return [
            {
                "id": r.id,
                "concept": r.concept_name,
                "scale": r.scale,
                "personas": r.num_personas,
                "rounds": r.num_rounds,
                "events": r.total_events,
                "pivots": r.total_pivots,
                "cost": r.total_cost_usd,
                "status": r.status,
                "started_at": r.started_at.isoformat() if r.started_at else None,
            }
            for r in runs
        ]
    finally:
        session.close()


def get_total_runs() -> int:
    """Get total number of simulation runs."""
    engine = init_db()
    session = get_session(engine)
    try:
        return session.query(SimulationRun).count()
    finally:
        session.close()
