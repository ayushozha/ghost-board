"""Database persistence layer for Ghost Board sprint events.

Hooks into the StateBus via subscribe_all() to automatically capture
every AgentEvent and persist it to PostgreSQL (or SQLite fallback).
Also handles SprintRun lifecycle: create, update totals, complete.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text, JSON,
    ForeignKey, Index,
)
from sqlalchemy.orm import Session, relationship

from db.models import Base, SimulationRun, PersonaReaction, MarketSignalRecord, init_db, get_session
from coordination.events import AgentEvent, EventType

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Additional SQLAlchemy model: per-event storage
# ---------------------------------------------------------------------------

class SprintEvent(Base):
    """Individual event captured during a sprint run.

    One row per AgentEvent published on the StateBus.
    """
    __tablename__ = "ghost_sprint_events"

    id = Column(String, primary_key=True)
    run_id = Column(String, ForeignKey("ghost_simulation_runs.id"), nullable=False)
    event_type = Column(String, nullable=False)
    source = Column(String, nullable=False)
    triggered_by = Column(String, nullable=True)
    payload = Column(JSON, nullable=True)
    iteration = Column(Integer, default=1)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_sprint_events_run", "run_id"),
        Index("idx_sprint_events_type", "event_type"),
        Index("idx_sprint_events_source", "source"),
    )


class SprintArtifact(Base):
    """Artifact path produced during a sprint (prototype files, reports, etc.)."""
    __tablename__ = "ghost_sprint_artifacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, ForeignKey("ghost_simulation_runs.id"), nullable=False)
    artifact_type = Column(String, nullable=False)  # prototype, financial_model, gtm, compliance
    file_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_sprint_artifacts_run", "run_id"),
    )


# ---------------------------------------------------------------------------
# SprintPersistence - hooks into StateBus
# ---------------------------------------------------------------------------

class SprintPersistence:
    """Persists every StateBus event to the database and manages SprintRun lifecycle.

    Usage::

        from coordination.state import StateBus
        from server.persistence import SprintPersistence

        bus = StateBus()
        persistence = SprintPersistence()
        run_id = persistence.start_run("My Startup Idea", concept_text="...", bus=bus)
        # ... run your sprint, events auto-captured via subscribe_all ...
        persistence.complete_run(run_id)

    The persistence layer subscribes to ALL event types on the bus,
    so every published AgentEvent is recorded as a SprintEvent row.
    """

    def __init__(self, session: Session | None = None, engine=None) -> None:
        """Initialize persistence.

        Args:
            session: An existing SQLAlchemy session. If None, one is created.
            engine: An existing SQLAlchemy engine. If None, one is created from env.
        """
        if engine is None:
            engine = init_db()
        else:
            # Ensure tables exist (including new ones defined above)
            Base.metadata.create_all(engine)
        self._engine = engine
        self._session = session or get_session(engine)
        self._run_ids: dict[str, str] = {}  # bus_id -> run_id mapping (future use)
        self._event_counts: dict[str, int] = {}  # run_id -> count
        self._pivot_counts: dict[str, int] = {}  # run_id -> pivot count

    # ------------------------------------------------------------------
    # Run lifecycle
    # ------------------------------------------------------------------

    def start_run(
        self,
        concept_name: str,
        concept_text: str = "",
        scale: str = "demo",
        num_personas: int = 10,
        num_rounds: int = 3,
        bus=None,
    ) -> str:
        """Create a SprintRun record and optionally subscribe to a StateBus.

        Returns:
            The run_id (8 char UUID prefix).
        """
        run_id = str(uuid.uuid4())[:8]

        run = SimulationRun(
            id=run_id,
            concept_name=concept_name,
            concept_text=concept_text,
            scale=scale,
            num_personas=num_personas,
            num_rounds=num_rounds,
            total_events=0,
            total_pivots=0,
            total_tokens=0,
            total_cost_usd=0.0,
            started_at=datetime.now(timezone.utc),
            status="running",
        )

        try:
            self._session.add(run)
            self._session.commit()
        except Exception:
            self._session.rollback()
            logger.exception("Failed to create SprintRun %s", run_id)
            raise

        self._event_counts[run_id] = 0
        self._pivot_counts[run_id] = 0

        # Hook into the event bus
        if bus is not None:
            self._subscribe_to_bus(bus, run_id)

        logger.info("Started sprint run %s: %s", run_id, concept_name)
        return run_id

    def _subscribe_to_bus(self, bus, run_id: str) -> None:
        """Subscribe to all events on the bus, binding them to run_id."""
        from coordination.state import StateBus  # local import to avoid circular

        async def _on_event(event: AgentEvent) -> None:
            self.save_event(run_id, event)

        bus.subscribe_all(_on_event)

    # ------------------------------------------------------------------
    # Event persistence
    # ------------------------------------------------------------------

    def save_event(self, run_id: str, event: AgentEvent) -> None:
        """Persist a single AgentEvent to the SprintEvent table.

        Also tracks running totals (event count, pivot count).
        """
        sprint_event = SprintEvent(
            id=event.id,
            run_id=run_id,
            event_type=event.type.value,
            source=event.source,
            triggered_by=event.triggered_by,
            payload=event.payload.model_dump() if event.payload else None,
            iteration=event.iteration,
            timestamp=event.timestamp,
        )

        try:
            self._session.add(sprint_event)
            self._session.commit()
        except Exception:
            self._session.rollback()
            logger.warning("Failed to persist event %s for run %s", event.id, run_id)
            return

        # Update running counts
        self._event_counts[run_id] = self._event_counts.get(run_id, 0) + 1
        if event.type == EventType.PIVOT:
            self._pivot_counts[run_id] = self._pivot_counts.get(run_id, 0) + 1

    # ------------------------------------------------------------------
    # Simulation data
    # ------------------------------------------------------------------

    def save_simulation_data(
        self,
        run_id: str,
        sim_result=None,
        market_signal=None,
    ) -> None:
        """Save simulation persona reactions and market signal for a run.

        Args:
            run_id: The sprint run ID.
            sim_result: A SimulationResult (from simulation.engine) or None.
            market_signal: A MarketSignal (from simulation.analyzer) or None.
        """
        try:
            if sim_result is not None:
                for round_data in getattr(sim_result, "rounds", []):
                    for msg in getattr(round_data, "messages", []):
                        reaction = PersonaReaction(
                            run_id=run_id,
                            round_num=getattr(msg, "round_num", 0),
                            persona_name=getattr(msg, "persona_name", "unknown"),
                            archetype=getattr(msg, "archetype", "unknown"),
                            content=getattr(msg, "content", ""),
                            sentiment=getattr(msg, "sentiment", 0.0),
                            stance=sim_result.final_stances.get(
                                getattr(msg, "persona_name", ""), "neutral"
                            ),
                            stance_change=getattr(msg, "stance_change", "none"),
                            references=getattr(msg, "references", []),
                        )
                        self._session.add(reaction)

            if market_signal is not None:
                signal = MarketSignalRecord(
                    run_id=run_id,
                    overall_sentiment=getattr(market_signal, "overall_sentiment", 0.0),
                    confidence=getattr(market_signal, "confidence", 0.5),
                    pivot_recommended=getattr(market_signal, "pivot_recommended", False),
                    pivot_suggestion=getattr(market_signal, "pivot_suggestion", ""),
                    key_concerns=getattr(market_signal, "key_concerns", []),
                    key_strengths=getattr(market_signal, "key_strengths", []),
                    archetype_breakdown=getattr(market_signal, "archetype_breakdown", {}),
                    summary=getattr(market_signal, "summary", ""),
                )
                self._session.add(signal)

            self._session.commit()
        except Exception:
            self._session.rollback()
            logger.exception("Failed to save simulation data for run %s", run_id)

    # ------------------------------------------------------------------
    # Artifacts
    # ------------------------------------------------------------------

    def save_artifact(self, run_id: str, artifact_type: str, file_path: str) -> None:
        """Record an artifact path for a sprint run."""
        artifact = SprintArtifact(
            run_id=run_id,
            artifact_type=artifact_type,
            file_path=file_path,
        )
        try:
            self._session.add(artifact)
            self._session.commit()
        except Exception:
            self._session.rollback()
            logger.warning("Failed to save artifact %s for run %s", file_path, run_id)

    def save_artifacts_batch(self, run_id: str, artifacts: dict[str, str]) -> None:
        """Save multiple artifacts at once.

        Args:
            run_id: The sprint run ID.
            artifacts: Mapping of artifact_type -> file_path.
        """
        for artifact_type, file_path in artifacts.items():
            self.save_artifact(run_id, artifact_type, file_path)

    # ------------------------------------------------------------------
    # Run completion
    # ------------------------------------------------------------------

    def complete_run(
        self,
        run_id: str,
        status: str = "completed",
        total_tokens: int = 0,
        total_cost: float = 0.0,
        strategy_initial: dict[str, Any] | None = None,
        strategy_final: dict[str, Any] | None = None,
        cost_breakdown: dict[str, Any] | None = None,
        integration_status: dict[str, str] | None = None,
    ) -> None:
        """Mark a sprint run as complete and update summary totals."""
        try:
            run = self._session.query(SimulationRun).filter_by(id=run_id).first()
            if run is None:
                logger.warning("Cannot complete unknown run %s", run_id)
                return

            run.status = status
            run.completed_at = datetime.now(timezone.utc)
            run.total_events = self._event_counts.get(run_id, 0)
            run.total_pivots = self._pivot_counts.get(run_id, 0)
            run.total_tokens = total_tokens
            run.total_cost_usd = total_cost

            if strategy_initial is not None:
                run.strategy_initial = strategy_initial
            if strategy_final is not None:
                run.strategy_final = strategy_final
            if cost_breakdown is not None:
                run.cost_breakdown = cost_breakdown
            if integration_status is not None:
                run.integration_status = integration_status

            self._session.commit()
            logger.info(
                "Completed run %s: %d events, %d pivots",
                run_id,
                run.total_events,
                run.total_pivots,
            )
        except Exception:
            self._session.rollback()
            logger.exception("Failed to complete run %s", run_id)

    def fail_run(self, run_id: str, error_message: str = "") -> None:
        """Mark a sprint run as failed."""
        self.complete_run(
            run_id,
            status="failed",
            integration_status={"error": error_message} if error_message else None,
        )

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_run(self, run_id: str) -> Optional[SimulationRun]:
        """Retrieve a SprintRun by ID."""
        return self._session.query(SimulationRun).filter_by(id=run_id).first()

    def get_run_events(self, run_id: str) -> list[dict[str, Any]]:
        """Get all SprintEvents for a run as dicts, ordered by timestamp."""
        events = (
            self._session.query(SprintEvent)
            .filter_by(run_id=run_id)
            .order_by(SprintEvent.timestamp)
            .all()
        )
        return [
            {
                "id": e.id,
                "event_type": e.event_type,
                "source": e.source,
                "triggered_by": e.triggered_by,
                "payload": e.payload,
                "iteration": e.iteration,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            }
            for e in events
        ]

    def get_run_artifacts(self, run_id: str) -> list[dict[str, str]]:
        """Get all artifacts for a run."""
        artifacts = (
            self._session.query(SprintArtifact)
            .filter_by(run_id=run_id)
            .order_by(SprintArtifact.created_at)
            .all()
        )
        return [
            {
                "artifact_type": a.artifact_type,
                "file_path": a.file_path,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in artifacts
        ]

    def get_recent_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get recent sprint runs with summary info."""
        runs = (
            self._session.query(SimulationRun)
            .order_by(SimulationRun.started_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "concept": r.concept_name,
                "scale": r.scale,
                "personas": r.num_personas,
                "rounds": r.num_rounds,
                "events": r.total_events,
                "pivots": r.total_pivots,
                "tokens": r.total_tokens,
                "cost": r.total_cost_usd,
                "status": r.status,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in runs
        ]

    def close(self) -> None:
        """Close the database session."""
        self._session.close()
