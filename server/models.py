"""SQLAlchemy 2.0 models for Ghost Board persistence layer."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# SprintRun - top-level record for each Ghost Board sprint
# ---------------------------------------------------------------------------

class SprintRun(Base):
    __tablename__ = "sprint_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    concept: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending | running | completed | failed
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    total_events: Mapped[int] = mapped_column(Integer, default=0)
    total_pivots: Mapped[int] = mapped_column(Integer, default=0)
    total_agents_simulated: Mapped[int] = mapped_column(Integer, default=0)
    api_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    wandb_url: Mapped[Optional[str]] = mapped_column(Text, default=None)
    sim_scale: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    # Relationships
    events: Mapped[list["SprintEvent"]] = relationship(
        back_populates="run", cascade="all, delete-orphan", lazy="selectin"
    )
    simulations: Mapped[list["SimulationRun"]] = relationship(
        back_populates="sprint_run", cascade="all, delete-orphan", lazy="selectin"
    )
    artifacts: Mapped[list["AgentArtifact"]] = relationship(
        back_populates="run", cascade="all, delete-orphan", lazy="selectin"
    )


# ---------------------------------------------------------------------------
# SprintEvent - individual event from the agent event bus
# ---------------------------------------------------------------------------

class SprintEvent(Base):
    __tablename__ = "sprint_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sprint_runs.id", ondelete="CASCADE"), nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    source_agent: Mapped[str] = mapped_column(String(50), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_agent: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    triggered_by: Mapped[Optional[str]] = mapped_column(String(36), default=None)
    iteration: Mapped[int] = mapped_column(Integer, default=1)

    # Relationships
    run: Mapped["SprintRun"] = relationship(back_populates="events")


# ---------------------------------------------------------------------------
# SimulationRun - record for each market simulation execution
# ---------------------------------------------------------------------------

class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    sprint_run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sprint_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    llm_agents: Mapped[int] = mapped_column(Integer, default=0)
    lightweight_agents: Mapped[int] = mapped_column(Integer, default=0)
    rounds: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    overall_sentiment: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    # Relationships
    sprint_run: Mapped["SprintRun"] = relationship(back_populates="simulations")
    reactions: Mapped[list["PersonaReaction"]] = relationship(
        back_populates="simulation", cascade="all, delete-orphan", lazy="selectin"
    )


# ---------------------------------------------------------------------------
# PersonaReaction - individual persona reaction within a simulation round
# ---------------------------------------------------------------------------

class PersonaReaction(Base):
    __tablename__ = "persona_reactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    simulation_run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("simulation_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    round_num: Mapped[int] = mapped_column(Integer, nullable=False)
    persona_name: Mapped[str] = mapped_column(String(100), nullable=False)
    archetype: Mapped[str] = mapped_column(String(50), nullable=False)
    lat: Mapped[Optional[float]] = mapped_column(Float, default=None)
    lng: Mapped[Optional[float]] = mapped_column(Float, default=None)
    content: Mapped[str] = mapped_column(Text, default="")
    stance: Mapped[float] = mapped_column(Float, default=0.0)
    references_json: Mapped[str] = mapped_column(Text, default="[]")

    # Relationships
    simulation: Mapped["SimulationRun"] = relationship(back_populates="reactions")


# ---------------------------------------------------------------------------
# AgentArtifact - output artifacts produced by agents
# ---------------------------------------------------------------------------

class AgentArtifact(Base):
    __tablename__ = "agent_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sprint_runs.id", ondelete="CASCADE"), nullable=False
    )
    agent_name: Mapped[str] = mapped_column(String(50), nullable=False)
    artifact_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # prototype | financial_model | gtm | compliance
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    content_preview: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    # Relationships
    run: Mapped["SprintRun"] = relationship(back_populates="artifacts")
