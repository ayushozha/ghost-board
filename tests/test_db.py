"""Tests for database models and storage layer."""

import os
import pytest
from sqlalchemy import create_engine

from db.models import Base, SimulationRun, PersonaReaction, MarketSignalRecord, init_db, get_session
from db.storage import save_simulation_run, get_run_history, get_total_runs


@pytest.fixture
def db_engine():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def db_session(db_engine):
    """Get a test database session."""
    from sqlalchemy.orm import sessionmaker
    session = sessionmaker(bind=db_engine)()
    yield session
    session.close()


class TestDatabaseModels:
    def test_create_simulation_run(self, db_session):
        run = SimulationRun(
            id="test-001",
            concept_name="Test Concept",
            concept_text="A test startup idea",
            scale="demo",
            num_personas=30,
            num_rounds=5,
            total_events=35,
            total_pivots=3,
            total_tokens=21000,
            total_cost_usd=0.15,
            status="completed",
        )
        db_session.add(run)
        db_session.commit()

        result = db_session.query(SimulationRun).filter_by(id="test-001").first()
        assert result is not None
        assert result.concept_name == "Test Concept"
        assert result.total_pivots == 3
        assert result.total_cost_usd == 0.15

    def test_create_persona_reaction(self, db_session):
        run = SimulationRun(id="test-002", concept_name="Test", status="completed")
        db_session.add(run)
        db_session.commit()

        reaction = PersonaReaction(
            run_id="test-002",
            round_num=1,
            persona_name="Alice",
            archetype="vc",
            content="Looks promising for ROI",
            sentiment=0.6,
            stance="positive",
        )
        db_session.add(reaction)
        db_session.commit()

        result = db_session.query(PersonaReaction).filter_by(run_id="test-002").first()
        assert result.persona_name == "Alice"
        assert result.archetype == "vc"
        assert result.sentiment == 0.6

    def test_create_market_signal(self, db_session):
        run = SimulationRun(id="test-003", concept_name="Test", status="completed")
        db_session.add(run)
        db_session.commit()

        signal = MarketSignalRecord(
            run_id="test-003",
            overall_sentiment=0.25,
            confidence=0.75,
            pivot_recommended=True,
            pivot_suggestion="Focus on enterprise",
            key_concerns=["pricing", "competition"],
        )
        db_session.add(signal)
        db_session.commit()

        result = db_session.query(MarketSignalRecord).filter_by(run_id="test-003").first()
        assert result.overall_sentiment == 0.25
        assert result.pivot_recommended is True
        assert "pricing" in result.key_concerns

    def test_simulation_run_relationships(self, db_session):
        run = SimulationRun(id="test-004", concept_name="Test", status="completed")
        db_session.add(run)
        db_session.commit()

        for i in range(3):
            db_session.add(PersonaReaction(
                run_id="test-004", round_num=1,
                persona_name=f"Person{i}", archetype="vc",
                content=f"Comment {i}", sentiment=0.5,
            ))
        db_session.add(MarketSignalRecord(
            run_id="test-004", overall_sentiment=0.3, confidence=0.8,
        ))
        db_session.commit()

        run = db_session.query(SimulationRun).filter_by(id="test-004").first()
        assert len(run.reactions) == 3
        assert len(run.signals) == 1

    def test_multiple_runs_query(self, db_session):
        for i in range(5):
            db_session.add(SimulationRun(
                id=f"run-{i}", concept_name=f"Concept {i}",
                status="completed", num_personas=30 + i,
            ))
        db_session.commit()

        runs = db_session.query(SimulationRun).all()
        assert len(runs) == 5


class TestStorage:
    def test_save_and_retrieve(self, monkeypatch):
        """Test save_simulation_run with SQLite in-memory."""
        monkeypatch.setenv("DATABASE_URL", "sqlite:///outputs/test_ghost.db")

        run_id = save_simulation_run(
            concept_name="Storage Test",
            concept_text="Testing storage layer",
            scale="demo",
            num_personas=10,
            num_rounds=3,
            total_events=20,
            total_pivots=1,
            total_tokens=5000,
            total_cost=0.05,
            sim_result=None,
            market_signal=None,
        )
        assert run_id is not None
        assert len(run_id) == 8

        total = get_total_runs()
        assert total >= 1

        history = get_run_history(limit=10)
        assert len(history) >= 1
        assert any(h["id"] == run_id for h in history)

        # Cleanup (ignore Windows file lock errors)
        try:
            os.remove("outputs/test_ghost.db")
        except (PermissionError, OSError):
            pass
