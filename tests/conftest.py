"""Shared test fixtures for Ghost Board test suite."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock

from coordination.state import StateBus
from coordination.trace import TraceLogger


class MockChoice:
    def __init__(self, content: str):
        self.message = MagicMock(content=content)

class MockUsage:
    total_tokens = 100
    prompt_tokens = 60
    completion_tokens = 40

class MockResponse:
    def __init__(self, content: str):
        self.choices = [MockChoice(content)]
        self.usage = MockUsage()


@pytest.fixture
def mock_openai_client():
    """Create a mock AsyncOpenAI client."""
    client = AsyncMock()
    mock_responses_api = MagicMock()
    mock_responses_api.create = AsyncMock(side_effect=Exception("no responses API"))
    client.responses = mock_responses_api
    return client


@pytest.fixture
def bus_and_logger():
    """Create a StateBus and TraceLogger pair for testing."""
    bus = StateBus()
    logger = TraceLogger.__new__(TraceLogger)
    logger._use_wandb = False
    logger._wandb_run = None
    logger._json_log = []
    logger._json_path = "outputs/trace.json"
    return bus, logger


@pytest.fixture
def db_engine():
    """Create an in-memory SQLite database for testing."""
    from sqlalchemy import create_engine
    from db.models import Base
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
