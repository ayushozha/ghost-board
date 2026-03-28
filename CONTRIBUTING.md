# Contributing to Ghost Board

## Development Setup

### Prerequisites

- Python 3.11 or later
- An OpenAI API key (set as `OPENAI_API_KEY` in `.env`)
- (Optional) A Weights & Biases API key (set as `WANDB_API_KEY` in `.env`)
- (Optional) PostgreSQL for persistent storage (defaults to SQLite otherwise)

### Installation

```bash
# Clone the repository
git clone <repo-url> ghost-board
cd ghost-board

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate    # Linux/macOS
.venv\Scripts\activate       # Windows

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env   # or create .env manually
# Edit .env and add:
#   OPENAI_API_KEY=sk-...
#   WANDB_API_KEY=...       (optional)
#   DATABASE_URL=...        (optional, defaults to SQLite)
```

### Verify the installation

```bash
# CLI should print help text
python main.py --help

# All tests should pass
python -m pytest tests/ -v --tb=short
```

---

## Running Tests

Tests live in the `tests/` directory. Run them with:

```bash
# Run all tests with verbose output
python -m pytest tests/ -v --tb=short

# Run a specific test file
python -m pytest tests/test_events.py -v

# Run tests and stop on first failure
python -m pytest tests/ -x --tb=short

# Run only tests matching a pattern
python -m pytest tests/ -k "test_pivot" -v
```

All LLM-dependent tests are mocked. You do not need an API key to run the test suite.

### Writing Tests

Mock LLM calls using `unittest.mock`:

```python
from unittest.mock import AsyncMock, patch, MagicMock
import pytest

@pytest.mark.asyncio
@patch('agents.base.AsyncOpenAI')
async def test_my_agent_behavior(mock_openai):
    # Create a mock response
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content='{"key": "value"}'))]
    mock_response.usage = MagicMock(total_tokens=100, prompt_tokens=50, completion_tokens=50)

    mock_openai.return_value.chat.completions.create = AsyncMock(return_value=mock_response)

    # Your test logic here
    ...
```

---

## How to Add a New Agent Type

Ghost Board agents extend `BaseAgent` (`agents/base.py`). Follow these steps to add a new specialized agent.

### Step 1: Create the agent file

Create `agents/my_agent.py`:

```python
"""MyAgent - description of what this agent does."""

from __future__ import annotations

import json
from typing import Any

from agents.base import BaseAgent
from coordination.events import AgentEvent, EventType, UpdatePayload
from coordination.state import StateBus
from coordination.trace import TraceLogger


class MyAgent(BaseAgent):
    name = "MyAgent"
    model = "gpt-4o"  # or "gpt-4o-mini" for cost-sensitive work

    def __init__(self, bus: StateBus, logger: TraceLogger) -> None:
        super().__init__(bus, logger)
        self.current_strategy = None

    async def do_work(self, strategy) -> str:
        """Main work method. Call the LLM and produce an artifact."""
        messages = [
            {"role": "system", "content": "You are a specialist..."},
            {"role": "user", "content": f"Strategy: {strategy}"},
        ]
        result = await self.call_llm(messages)

        # Log what you did (this creates a board discussion entry)
        self.log(
            f"Completed analysis: {result[:100]}",
            action="my_analysis",
            reasoning="Explaining why I made these choices...",
        )

        # Publish a completion event
        await self.publish(AgentEvent(
            type=EventType.UPDATE,
            source=self.name,
            payload=UpdatePayload(
                agent=self.name,
                action="analysis_complete",
                details=result,
            ),
        ))
        return result

    async def handle_pivot(self, pivot_event: AgentEvent) -> None:
        """React when CEO pivots strategy."""
        self.log("Adapting to pivot...", action="pivot_response")
        # Redo work with new strategy context

    async def run(self, context: dict[str, Any] | None = None) -> None:
        """Entry point for rebuild cycles."""
        if self.current_strategy:
            await self.do_work(self.current_strategy)
```

### Step 2: Register event subscriptions

If your agent needs to react to specific events, subscribe in the orchestrator or in `__init__`:

```python
def __init__(self, bus: StateBus, logger: TraceLogger) -> None:
    super().__init__(bus, logger)
    self.subscribe(EventType.STRATEGY_SET, EventType.PIVOT)
```

### Step 3: Add to the orchestrator

In `main.py :: run_sprint()`, instantiate your agent alongside the others:

```python
my_agent = MyAgent(bus, logger)
agents = [ceo, cto, cfo, cmo, legal, my_agent]
```

Add it to the concurrent build step:

```python
build_results = await asyncio.gather(
    cto.generate_prototype(strategy),
    cfo.generate_financial_model(strategy),
    cmo.generate_gtm(strategy),
    legal.analyze_compliance(strategy),
    my_agent.do_work(strategy),       # <-- add here
    return_exceptions=True,
)
```

### Step 4: Add a typed payload (optional)

If your agent publishes a new event type, add it to `coordination/events.py`:

1. Add the event type to the `EventType` enum
2. Create a Pydantic payload model
3. Register it in `EVENT_PAYLOAD_MAP`

### Step 5: Write tests

Create `tests/test_my_agent.py` with mocked LLM calls to verify your agent's behavior.

---

## How to Add New Simulation Archetypes

Simulation personas are assigned archetypes that determine their behavior. To add a new archetype:

### Step 1: Update `simulation/personas.py`

Add the archetype to `ARCHETYPE_DISTRIBUTION`:

```python
ARCHETYPE_DISTRIBUTION = {
    "vc": 2,
    "early_adopter": 3,
    "skeptic": 2,
    "journalist": 1,
    "competitor": 1,
    "regulator": 1,
    "enterprise_buyer": 2,    # <-- new archetype
}
```

Update the persona generation prompt to include the new archetype's personality traits.

### Step 2: Update `simulation/lightweight_agents.py`

Add parameters for the new archetype in `ARCHETYPE_PARAMS`:

```python
ARCHETYPE_PARAMS = {
    ...
    "enterprise_buyer": (0.0, 0.25, 0.6, 0.12, 0.7),
    # (initial_stance_mean, initial_stance_std, influence, drift_rate, response_prob)
}
```

Add the archetype weight in `ARCHETYPE_WEIGHTS`:

```python
ARCHETYPE_WEIGHTS = {
    ...
    "enterprise_buyer": 0.10,
}
```

Make sure all weights still sum to approximately 1.0 (they are normalized during swarm spawn).

### Step 3: Add real persona profiles (optional)

Create or update a JSON file in `personas/profiles/` with real-company-grounded personas for the new archetype:

```json
[
  {
    "name": "Sarah Chen, VP Engineering at Stripe",
    "archetype": "enterprise_buyer",
    "investment_thesis_or_beat": "Evaluates B2B API tools for payment infrastructure",
    "known_positions": ["API-first", "compliance automation", "developer experience"],
    "risk_tolerance": 0.4,
    "initial_stance": "neutral",
    "influence_score": 0.7,
    "real_company_reference": "Stripe",
    "geographic_location": {"city": "San Francisco", "country": "US", "lat": 37.77, "lng": -122.42}
  }
]
```

### Step 4: Test

Run `python -m pytest tests/test_simulation.py -v` and verify the new archetype appears in simulation output.

---

## How to Add New Demo Concepts

Demo concepts are pre-written startup ideas stored in `demo/`.

### Step 1: Create the concept file

Create `demo/my_concept.txt` with a detailed startup description:

```
MyStartup: AI-powered supply chain optimization for mid-market manufacturers.
Uses real-time sensor data and predictive models to reduce inventory waste by 40%.
Target market: US manufacturers with $10M-$500M revenue. Business model: SaaS
with usage-based pricing. Key differentiator: integrates with existing ERP systems
(SAP, Oracle) without custom development.
```

More detail in the concept leads to better agent output. Include: business model, target market, key differentiators, regulatory considerations.

### Step 2: Register in `main.py`

Add the concept to the `CONCEPT_FILES` dict in the `main()` function:

```python
CONCEPT_FILES = {
    "anchrix": "demo/anchrix_concept.txt",
    "coforge": "demo/coforge_concept.txt",
    "medpulse": "demo/healthtech_concept.txt",
    "learnloop": "demo/edtech_concept.txt",
    "saas": "demo/saas_concept.txt",
    "supply": "demo/my_concept.txt",       # <-- add here
}
```

Update the `--concept` Click option's `type=click.Choice(...)` to include the new name.

### Step 3: Run and cache

```bash
# Run the sprint with the new concept
python main.py --concept supply --sim-scale demo

# The outputs will be saved to outputs/
# Optionally copy to demo/cached_artifacts/ for offline playback
```

### Step 4: Verify output quality

- Check that `outputs/prototype/` contains real code (not empty files)
- Check that `outputs/compliance/` has specific regulation citations
- Check that `outputs/trace.json` has 20+ events
- Check that the simulation shows varied archetype responses

---

## How to Customize the Dashboard

The dashboard lives in `dashboard/` and reads data from `outputs/`. It consists of three HTML files:

| File | Screen |
|------|--------|
| `dashboard/index.html` | Mission Control + Pivot Timeline + Sprint Report |
| `dashboard/boardroom.html` | The Boardroom (agent discussion) |
| `dashboard/globe.html` | Market Arena (3D globe simulation view) |

### Modifying Screen Content

Each screen reads from specific JSON files in `outputs/`. To change what data is displayed:

1. **Boardroom** reads `outputs/board_discussion.json` -- array of `{agent, timestamp, event_type, message, reasoning, iteration}` objects. Add new fields to `BaseAgent.log()` in `agents/base.py` and they will appear in the JSON.

2. **Market Arena** reads `outputs/simulation_geo.json` (persona positions + messages) and `outputs/simulation_results.json` (round data + archetype breakdowns). These are written by `hybrid_engine.py :: _save_hybrid_outputs()`.

3. **Pivot Timeline** reads `outputs/trace.json`. Every event is rendered as a timeline node. Event types are color-coded:
   - Blue: STRATEGY_SET
   - Red: BLOCKER
   - Yellow: PIVOT
   - Green: UPDATE / *_READY
   - Purple: SIMULATION_*

4. **Sprint Report** reads from `outputs/sprint_report.md` and artifact directories (`outputs/prototype/`, `outputs/financial_model/`, `outputs/gtm/`, `outputs/compliance/`).

### Adding a New Dashboard Screen

1. Create a new HTML file in `dashboard/`
2. Add navigation links in the existing screens' nav headers
3. Read from the appropriate `outputs/` JSON file using `fetch()`
4. Style with the existing dark terminal aesthetic (CSS is inline in each HTML file)

### Running the Dashboard

```bash
# Option 1: Auto-open after a sprint (default)
python main.py "my concept"

# Option 2: Live server on port 8080
python main.py "my concept" --live

# Option 3: Open directly without running a sprint
# Just open dashboard/index.html in a browser (needs outputs/ from a previous run)
```

---

## Code Style and Conventions

- **Type hints**: All function signatures and Pydantic models must have full type annotations
- **Async**: All LLM calls and agent methods that call LLM are `async`. Use `asyncio.gather` for concurrent execution
- **Pydantic**: All structured data uses Pydantic `BaseModel`, never loose dicts
- **Logging**: Every significant agent action must call `self.log()`. This feeds both the trace and the board discussion
- **Causal chains**: Every published event should set `triggered_by` to the ID of the event that caused it
- **Error handling**: LLM calls use retry with exponential backoff. Never let a single failure crash the sprint
- **No hardcoded keys**: All secrets come from environment variables via `.env`

---

## Project Task Tracking

Tasks are tracked in `progress.txt` using a checkbox format:

```
[x] PRD-01: Project skeleton
[x] PRD-02: Event types
[ ] PRD-XX: Next task
```

When contributing, check `progress.txt` for the next uncompleted task, or propose new tasks at the end of the file.
