"""SQLAlchemy models for Ghost Board simulation history.

Stores simulation runs, persona reactions, and market signals in PostgreSQL.
Connection via SSH tunnel to VPS (see VPS.md).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, JSON,
    ForeignKey, create_engine, Index,
)
from sqlalchemy.orm import DeclarativeBase, relationship, Session, sessionmaker


class Base(DeclarativeBase):
    pass


class SimulationRun(Base):
    """A single Ghost Board simulation run."""
    __tablename__ = "ghost_simulation_runs"

    id = Column(String, primary_key=True)
    concept_name = Column(String, nullable=False)
    concept_text = Column(Text)
    scale = Column(String, default="demo")  # demo, standard, large
    num_personas = Column(Integer, default=10)
    num_rounds = Column(Integer, default=3)
    total_events = Column(Integer, default=0)
    total_pivots = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    total_cost_usd = Column(Float, default=0.0)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, default="running")  # running, completed, failed
    strategy_initial = Column(JSON, nullable=True)
    strategy_final = Column(JSON, nullable=True)
    cost_breakdown = Column(JSON, nullable=True)
    integration_status = Column(JSON, nullable=True)

    # Relationships
    reactions = relationship("PersonaReaction", back_populates="run", cascade="all, delete-orphan")
    signals = relationship("MarketSignalRecord", back_populates="run", cascade="all, delete-orphan")


class PersonaReaction(Base):
    """A single persona reaction in a simulation round."""
    __tablename__ = "ghost_persona_reactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, ForeignKey("ghost_simulation_runs.id"), nullable=False)
    round_num = Column(Integer, nullable=False)
    persona_name = Column(String, nullable=False)
    archetype = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    sentiment = Column(Float, default=0.0)
    stance = Column(String, default="neutral")
    stance_change = Column(String, default="none")
    references = Column(JSON, default=list)
    bettafish_sentiment = Column(Float, nullable=True)
    bettafish_label = Column(String, nullable=True)

    run = relationship("SimulationRun", back_populates="reactions")

    __table_args__ = (
        Index("idx_reactions_run_round", "run_id", "round_num"),
        Index("idx_reactions_archetype", "archetype"),
    )


class MarketSignalRecord(Base):
    """Market signal from simulation analysis."""
    __tablename__ = "ghost_market_signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, ForeignKey("ghost_simulation_runs.id"), nullable=False)
    overall_sentiment = Column(Float, default=0.0)
    confidence = Column(Float, default=0.5)
    pivot_recommended = Column(Boolean, default=False)
    pivot_suggestion = Column(Text, default="")
    key_concerns = Column(JSON, default=list)
    key_strengths = Column(JSON, default=list)
    archetype_breakdown = Column(JSON, default=dict)
    summary = Column(Text, default="")

    run = relationship("SimulationRun", back_populates="signals")


def get_engine(database_url: str | None = None):
    """Create SQLAlchemy engine.

    Uses DATABASE_URL env var or defaults to the VPS PostgreSQL.
    For local dev, uses SQLite fallback.
    """
    url = database_url or os.environ.get("DATABASE_URL")
    if not url:
        # SQLite fallback for local development
        url = "sqlite:///outputs/ghost_board.db"
    return create_engine(url, echo=False)


def init_db(engine=None):
    """Create all tables."""
    if engine is None:
        engine = get_engine()
    Base.metadata.create_all(engine)
    return engine


def get_session(engine=None) -> Session:
    """Get a database session."""
    if engine is None:
        engine = get_engine()
    return sessionmaker(bind=engine)()
