# Ghost Board Architecture

## 1. System Overview

Ghost Board is an autonomous AI executive team that builds and validates a startup concept in a single sprint. Five specialized AI agents -- CEO, CTO, CFO, CMO, and Legal -- coordinate via an async event bus, produce real artifacts (prototype code, financial models, GTM copy, compliance memos), then subject those artifacts to a synthetic market stress test with up to 1,000,000 simulated stakeholders.

The system is structured around two nested feedback loops:

- **Inner loop (Boardroom):** Agents build concurrently. When Legal publishes a compliance BLOCKER, CEO pivots strategy, and the pivot cascades to all other agents who rebuild their artifacts.
- **Outer loop (Market Arena):** After v1 artifacts ship, a MiroFish-inspired simulation generates synthetic stakeholder reactions. The structured feedback flows back to CEO, who may pivot again.

Output of a single sprint: working prototype, financial model, GTM landing page copy, compliance memo, a causal event trace, and a cost comparison against human consulting equivalents.

### High-Level Component Map

```
ghost-board/
  main.py                    CLI entry point + 3-phase orchestrator
  agents/                    5 specialized AI agents
    base.py                  BaseAgent (LLM calls, logging, cost tracking)
    ceo.py, cto.py, cfo.py, cmo.py, legal.py
  coordination/              Event-driven infrastructure
    events.py                EventType enum, AgentEvent, typed Pydantic payloads
    state.py                 StateBus (async pub/sub)
    trace.py                 TraceLogger (W&B + JSON fallback)
  simulation/                Market stress test engine
    personas.py              MarketPersona generator (LLM + JSON profiles)
    engine.py                Turn-based LLM simulation
    analyzer.py              MarketSignal structured output
    hybrid_engine.py         LLM + lightweight agent hybrid
    lightweight_agents.py    NumPy-vectorized crowd simulation (up to 1M)
    mirofish_bridge.py       MiroFish/BettaFish integration with fallback
  db/                        Persistence layer
    models.py                SQLAlchemy ORM (SimulationRun, PersonaReaction, MarketSignalRecord)
    storage.py               Save/query functions
  dashboard/                 Static HTML dashboard (5 screens)
  outputs/                   Runtime artifacts (gitignored)
  demo/                      Pre-built demo concepts
  vendor/                    MiroFish + BettaFish reference repos
```

---

## 2. Event Bus Design

The event bus (`coordination/state.py :: StateBus`) is the backbone of agent coordination. It is an **async pub/sub system with immediate callbacks**, not a polling loop.

### Core API

| Method | Description |
|--------|-------------|
| `subscribe(EventType, handler)` | Register an async callback for one event type |
| `subscribe_all(handler)` | Register a callback for every event type |
| `publish(event)` | Append to trace, update state, invoke all matching handlers concurrently via `asyncio.gather` |
| `get_trace()` | Return full ordered list of all events |
| `get_state(source?, event_type?)` | Return latest event per `source:type` key |
| `get_events_by_type(EventType)` | Filter trace by event type |
| `get_events_by_source(source)` | Filter trace by source agent |

### Typed Payloads

Every `AgentEvent` carries a Pydantic model payload, never a loose dict. The mapping is defined in `EVENT_PAYLOAD_MAP`:

| EventType | Payload Model | Key Fields |
|-----------|--------------|------------|
| `STRATEGY_SET` | `StrategyPayload` | startup_idea, target_market, business_model, key_differentiators |
| `PIVOT` | `PivotPayload` | reason, old_strategy, new_strategy, affected_agents, changes_required |
| `BLOCKER` | `BlockerPayload` | severity, area, description, citations (real regulation URLs), recommended_action |
| `SIMULATION_RESULT` | `SimulationResultPayload` | overall_sentiment, confidence, key_concerns, key_strengths, pivot_recommended |
| `PROTOTYPE_READY` | `PrototypePayload` | files_generated, language, output_dir |
| `FINANCIAL_MODEL_READY` | `FinancialModelPayload` | revenue_year1, revenue_year3, burn_rate_monthly, runway_months |
| `GTM_READY` | `GTMPayload` | positioning, tagline, target_channels |
| `COMPLIANCE_REPORT_READY` | `CompliancePayload` | risk_level, regulations_checked, blockers_found |
| `UPDATE` | `UpdatePayload` | agent, action, details, artifacts |
| `ERROR` | `ErrorPayload` | agent, error_type, message, recoverable |

### Causal Chain (`triggered_by`)

Every `AgentEvent` has a `triggered_by` field containing the UUID of the event that caused it. This creates a directed acyclic graph of causality:

```
STRATEGY_SET (id: abc123)
  --> BLOCKER (triggered_by: abc123)
    --> PIVOT (triggered_by: blocker_id)
      --> PROTOTYPE_READY (triggered_by: pivot_id)
```

The complete causal chain is written to `outputs/trace.json` and visualized in the dashboard's Pivot Timeline screen.

### Concurrency Model

Publishing an event acquires an `asyncio.Lock` for trace append and state update, then releases it before invoking handlers. Handlers execute concurrently via `asyncio.gather(return_exceptions=True)` -- a failing handler does not block others.

---

## 3. Agent Lifecycle

### BaseAgent (`agents/base.py`)

All agents inherit from `BaseAgent`, which provides:

- **`call_llm(messages, model?, temperature?, max_tokens?, response_format?, retries=3)`** -- Async OpenAI chat completion with exponential backoff retry. Tracks token usage and estimated cost per call. Returns degraded `"{}"` instead of crashing on exhausted retries.
- **`call_llm_with_tools(messages, tools, ...)`** -- LLM call with function/tool definitions.
- **`log(message, action, reasoning)`** -- Creates an UPDATE event, logs to TraceLogger, and appends to the board discussion feed (for qualifying action types).
- **`publish(event)`** -- Publishes to the bus and logs to trace.
- **`subscribe(*event_types)`** -- Registers `self.handle_event` for the given types.
- **`respond_to_simulation_findings(ceo_findings, strategy_json)`** -- Standard method for simulation debrief responses.
- **`get_cost_summary()`** -- Returns `{agent, total_tokens, estimated_cost_usd}`.

### Specialized Agents

| Agent | Model | Key Methods | Subscribes To | Publishes |
|-------|-------|-------------|---------------|-----------|
| **CEO** | gpt-4o | `set_strategy()`, `process_blocker()`, `process_simulation_result()`, `_pivot()`, `present_simulation_findings()` | BLOCKER, SIMULATION_RESULT | STRATEGY_SET, PIVOT |
| **CTO** | gpt-4o | `generate_prototype()`, `handle_pivot()`, `run()` | STRATEGY_SET, PIVOT | PROTOTYPE_READY |
| **CFO** | gpt-4o | `generate_financial_model()`, `handle_pivot()`, `run()` | STRATEGY_SET, PIVOT | FINANCIAL_MODEL_READY |
| **CMO** | gpt-4o | `generate_gtm()`, `handle_pivot()`, `run()` | STRATEGY_SET, PIVOT | GTM_READY |
| **Legal** | gpt-4o | `analyze_compliance()` (with web search citations) | STRATEGY_SET | COMPLIANCE_REPORT_READY, BLOCKER |

### Cost Tracking

Per-model token costs are tracked in `MODEL_COSTS`:
- gpt-4o: $2.50/1M input, $10.00/1M output
- gpt-4o-mini: $0.15/1M input, $0.60/1M output

Every `call_llm` invocation updates `self.total_tokens` and `self.estimated_cost`. The sprint summary aggregates across all agents.

### Error Recovery

All LLM calls use exponential backoff retry (3 attempts, delays of 1s, 2s, 4s). If all retries fail, agents return degraded results (`"{}"`) and continue execution. No single agent failure crashes the sprint. Handler failures in `asyncio.gather` are caught via `return_exceptions=True`.

---

## 4. Three-Phase Sprint

The sprint is orchestrated in `main.py :: run_sprint()`.

### Phase 1: Strategy + Build

1. CEO calls `set_strategy(startup_idea)` which produces a `StrategyPayload` and publishes `STRATEGY_SET`.
2. All agents receive the strategy. CTO, CFO, CMO, and Legal build concurrently via `asyncio.gather`:
   - CTO generates prototype code (Codex-powered)
   - CFO generates financial model
   - CMO generates GTM copy and positioning
   - Legal analyzes compliance (with real regulation citations)
3. If Legal published any BLOCKER events, CEO processes each one, potentially calling `_pivot()`.
4. On pivot, CEO publishes a PIVOT event. CTO, CFO, and CMO rebuild their artifacts.

### Phase 2: Market Simulation

Two simulation modes:

- **Standard mode** (`MiroFishBridge`): Generates personas, runs turn-based LLM simulation, analyzes results.
- **Hybrid mode** (`--sim-scale`): LLM agents + lightweight NumPy crowd. Scale presets from 1K to 1M total agents.

The simulation result is published as a `SIMULATION_RESULT` event. CEO then presents findings to the board, and each agent responds with proposed adaptations.

### Phase 3: Pivot + Rebuild

If `market_signal.pivot_recommended` is true, CEO processes the simulation result, pivots strategy, and all agents rebuild their artifacts concurrently.

### Sprint Output

After all phases, the system:
- Saves `outputs/trace.json` (full event trace)
- Saves `outputs/board_discussion.json` (agent reasoning feed)
- Saves `outputs/sprint_report.md` (executive summary)
- Saves `outputs/sprint_summary.json` (machine-readable)
- Saves simulation geo/results data for the dashboard
- Optionally saves to PostgreSQL database
- Opens the dashboard in a browser (unless `--no-browser`)

---

## 5. Simulation Architecture

### Two Tiers

The simulation uses a hybrid approach inspired by MiroFish:

**Tier 1: LLM Agents (30-50)**
- Full personality via `MarketPersona` (name, archetype, background, priorities, risk tolerance, geographic location)
- Real text responses generated by gpt-4o-mini each round
- Six archetypes: VC, early_adopter, skeptic, journalist, competitor, regulator
- Agent-to-agent references (personas respond to each other's posts)
- Loaded from JSON profiles (`personas/profiles/`) or generated via LLM

**Tier 2: Lightweight Agents (1K to 1M)**
- No LLM calls -- pure NumPy vectorized math
- Each agent: archetype (int index), stance (float -1 to 1), influence, drift_rate, response_probability
- Spawned in ~0.1 seconds for 1M agents via `spawn_swarm()`
- Stance update formula per round:
  ```
  delta = drift_rate * (
      llm_influence * (llm_sentiment - stance) +     // pull toward LLM signal
      (1 - llm_influence) * archetype_bias * 0.3 +   // pull toward archetype mean
      noise                                            // random noise
  )
  stance = clip(stance + delta, -1, 1)
  ```
- Votes collected probabilistically based on `response_probability`

### Archetype Parameters (Lightweight)

| Archetype | Mean Stance | Std | Influence | Drift Rate | Response Prob |
|-----------|-------------|-----|-----------|------------|---------------|
| vc | +0.1 | 0.3 | 0.7 | 0.15 | 0.8 |
| early_adopter | +0.3 | 0.2 | 0.4 | 0.20 | 0.9 |
| skeptic | -0.3 | 0.2 | 0.5 | 0.10 | 0.7 |
| journalist | 0.0 | 0.4 | 0.8 | 0.25 | 0.6 |
| competitor | -0.4 | 0.2 | 0.6 | 0.05 | 0.5 |
| regulator | -0.2 | 0.1 | 0.9 | 0.03 | 0.4 |

### Scale Presets (`SCALE_PRESETS`)

| Preset | LLM Agents | Lightweight | Rounds |
|--------|------------|-------------|--------|
| demo | 30 | 1,000 | 5 |
| standard | 50 | 10,000 | 10 |
| large | 50 | 100,000 | 15 |
| million | 50 | 1,000,000 | 20 |

### Sentiment Blending

Each round blends LLM and crowd sentiments: `blended = 0.6 * llm + 0.4 * crowd`. The final MarketSignal also blends: `signal.overall_sentiment = 0.6 * llm_signal + 0.4 * crowd_avg`.

### Output Data

- `outputs/simulation_geo.json` -- Per-persona geographic data, messages, stance changes
- `outputs/simulation_results.json` -- Round-by-round data, archetype breakdowns, swarm history, final signal

---

## 6. MiroFish Integration

The `MiroFishBridge` class (`simulation/mirofish_bridge.py`) implements a bridge pattern with automatic fallback:

### Integration Attempt

1. Check if `vendor/MiroFish/backend/` exists
2. Import `SimulationRunner`, `AgentAction`, `AgentActivityConfig` from MiroFish
3. Use MiroFish's config generation patterns (LLM-based batched persona config)
4. Replace MiroFish's Zep Cloud dependency with local persona generation
5. Replace MiroFish's OASIS subprocess simulation with our async simulation loop

### Fallback Chain

If MiroFish is unavailable or fails for any reason:

1. Fall back to `simulation/personas.py` for persona generation
2. Fall back to `simulation/engine.py` for turn-based simulation
3. Fall back to `simulation/analyzer.py` for MarketSignal extraction

The integration status is tracked in `_integration_status` dict and displayed in the sprint summary table (INTEGRATED / FALLBACK / NOT_FOUND).

### What Was Replaced

| MiroFish Component | Ghost Board Replacement |
|-------------------|------------------------|
| KuzuDB / Zep Cloud | Local persona profiles + LLM generation |
| OASIS subprocess simulation | Async turn-based simulation loop |
| Playwright web crawlers | OpenAI web search via Legal agent |
| Cloud memory | Local file-based agent memory |

---

## 7. BettaFish Sentiment

BettaFish's `WeiboMultilingualSentimentAnalyzer` (a torch + transformers model) is attempted for import in the MiroFish bridge. If the model loads successfully, persona reactions are scored with BettaFish sentiment in addition to LLM-based sentiment.

When BettaFish is unavailable (torch/transformers not installed, model cannot load), the system falls back to OpenAI gpt-4o-mini for sentiment analysis.

The `PersonaReaction` database model includes dedicated fields for BettaFish output:
- `bettafish_sentiment` (Float) -- numeric sentiment score
- `bettafish_label` (String) -- categorical label

---

## 8. PostgreSQL Schema

Database models are defined in `db/models.py` using SQLAlchemy ORM. The system defaults to SQLite (`outputs/ghost_board.db`) for local development and connects to PostgreSQL via `DATABASE_URL` environment variable in production.

### Tables

**`ghost_simulation_runs`**
| Column | Type | Description |
|--------|------|-------------|
| id | String (PK) | 8-char UUID prefix |
| concept_name | String | Startup concept name (max 60 chars) |
| concept_text | Text | Full concept description |
| scale | String | demo / standard / large / million |
| num_personas | Integer | LLM persona count |
| num_rounds | Integer | Simulation rounds |
| total_events | Integer | Event bus event count |
| total_pivots | Integer | CEO pivot count |
| total_tokens | Integer | Total LLM tokens consumed |
| total_cost_usd | Float | Total API cost |
| started_at | DateTime | Sprint start time (UTC) |
| completed_at | DateTime | Sprint completion time (UTC) |
| status | String | running / completed / failed |
| strategy_initial | JSON | First StrategyPayload |
| strategy_final | JSON | Final StrategyPayload (post-pivots) |
| cost_breakdown | JSON | Per-agent cost breakdown |
| integration_status | JSON | MiroFish/BettaFish status |

**`ghost_persona_reactions`**
| Column | Type | Description |
|--------|------|-------------|
| id | Integer (PK) | Auto-increment |
| run_id | String (FK) | References simulation_runs.id |
| round_num | Integer | Simulation round number |
| persona_name | String | Persona name |
| archetype | String | vc, early_adopter, skeptic, etc. |
| content | Text | Full reaction text |
| sentiment | Float | Sentiment score (-1 to 1) |
| stance | String | Final stance (positive/neutral/negative) |
| stance_change | String | more_positive / more_negative / none |
| references | JSON | List of referenced persona names |
| bettafish_sentiment | Float | BettaFish model score (nullable) |
| bettafish_label | String | BettaFish label (nullable) |

Indexes: `(run_id, round_num)`, `(archetype)`

**`ghost_market_signals`**
| Column | Type | Description |
|--------|------|-------------|
| id | Integer (PK) | Auto-increment |
| run_id | String (FK) | References simulation_runs.id |
| overall_sentiment | Float | Blended sentiment (-1 to 1) |
| confidence | Float | Signal confidence (0 to 1) |
| pivot_recommended | Boolean | Whether CEO should pivot |
| pivot_suggestion | Text | Suggested pivot direction |
| key_concerns | JSON | List of top concerns |
| key_strengths | JSON | List of top strengths |
| archetype_breakdown | JSON | Per-archetype average sentiment |
| summary | Text | LLM-generated analysis summary |

---

## 9. W&B Integration

The `TraceLogger` (`coordination/trace.py`) implements two-tier observability:

### Tier 1: Weights & Biases (if `WANDB_API_KEY` is set)

- Initializes a W&B run with project name `ghost-board`
- Logs every `AgentEvent` as a W&B log entry (flat dict via `to_trace_dict()`)
- Logs scalar metrics via `log_metric(key, value)`
- Logs file artifacts via `log_artifact(name, path, type)` (directories or single files)
- Run URL is saved to `demo/wandb_url.txt` for dashboard linking
- Timeout: 30 seconds for init (graceful fallback on timeout)

### Tier 2: JSON Fallback (always active)

- All events are appended to an in-memory list
- On `finish()`, flushed to `outputs/trace.json`
- Each entry includes: `event_id`, `event_type`, `source`, `triggered_by`, `timestamp`, `iteration`, `payload`
- Metrics are also logged with `{metric, value, timestamp}` format

The JSON fallback is always active regardless of W&B status, ensuring traces are never lost.

---

## 10. Dashboard Architecture

The dashboard (`dashboard/`) is a multi-screen static HTML application that reads from the `outputs/` directory. It tells the story of a company being built, not a static report.

### Five Screens

| Screen | File | Data Source | Key Visuals |
|--------|------|-------------|-------------|
| 1. Mission Control | `index.html` | -- | Dark terminal aesthetic, concept input, Launch Sprint button, warp transition |
| 2. The Boardroom | `boardroom.html` | `outputs/board_discussion.json` | 5 agent cards in circle, animated connection lines, discussion feed, BLOCKER flash (red), PIVOT cascade (yellow) |
| 3. Market Arena | `globe.html` | `outputs/simulation_geo.json`, `outputs/simulation_results.json` | Three.js 3D globe with persona dots at lat/lng, arc lines between referencing personas, scrolling post feed, live sentiment charts by archetype |
| 4. Pivot Timeline | `index.html` (section) | `outputs/trace.json` | Horizontal scrollable timeline, color-coded nodes (blue=strategy, red=blocker, yellow=pivot, green=update, purple=simulation), click-to-expand detail panels, triggered_by chain visualization |
| 5. Sprint Report | `index.html` (section) | `outputs/sprint_report.md`, `outputs/prototype/*`, `outputs/financial_model/*`, `outputs/gtm/*`, `outputs/compliance/*` | Tabbed artifact viewer, cost comparison bar chart, syntax-highlighted code, linkable citations |

### Screen Transitions

```
Mission Control --[Launch]--> Boardroom --[Sim starts]--> Market Arena
Market Arena --[Sim ends]--> Pivot Timeline --[Rebuild done]--> Sprint Report
```

Manual navigation tabs allow jumping between screens at any time.

### Data Files

| File | Content | Used By |
|------|---------|---------|
| `outputs/trace.json` | Full event trace with payloads | Pivot Timeline, Sprint Report |
| `outputs/board_discussion.json` | Agent reasoning feed | Boardroom |
| `outputs/simulation_geo.json` | Persona lat/lng + messages | Market Arena globe |
| `outputs/simulation_results.json` | Round data, archetype breakdowns, swarm history | Market Arena charts |
| `outputs/sprint_report.md` | Markdown executive summary | Sprint Report |
| `outputs/sprint_summary.json` | Machine-readable result | Sprint Report cost tab |
| `outputs/prototype/*` | Generated code files | Sprint Report prototype tab |
| `outputs/financial_model/*` | Financial projections | Sprint Report financial tab |
| `outputs/gtm/*` | GTM copy and positioning | Sprint Report GTM tab |
| `outputs/compliance/*` | Compliance memos + citations | Sprint Report legal tab |

### Live Server Mode

Running `python main.py --live` starts a background HTTP server on port 8080 serving the `dashboard/` directory. The dashboard can also be opened directly as a local file (default behavior).

---

## 11. Data Flow Diagram

```
                              User Input
                                 |
                          "startup concept"
                                 |
                                 v
                     +---------------------+
                     |     main.py CLI      |
                     |  (3-phase sprint)    |
                     +---------------------+
                                 |
            +--------------------+--------------------+
            |                                         |
            v                                         v
   Phase 1: STRATEGY + BUILD                Phase 2: SIMULATE
   ========================                 ==================

   CEO.set_strategy()                       MiroFishBridge  OR  HybridEngine
        |                                        |
        | STRATEGY_SET                    generate_personas()
        |                                        |
        +--+--+--+--+                    run_simulation() [LLM tier]
        |  |  |  |  |                            +
       CTO CFO CMO Legal              spawn_swarm() [Lightweight tier]
        |  |  |  |  |                            |
        |  |  |  |  +--BLOCKER?           N rounds of:
        |  |  |  |     |                   - LLM agents post
        |  |  |  |     v                   - Lightweight stances update
        |  |  |  |  CEO._pivot()           - Votes collected
        |  |  |  |     |                   - Sentiments blended
        |  |  |  |     | PIVOT                   |
        |  |  |  |     +-->rebuild          analyze_simulation()
        |  |  |  |                               |
        v  v  v  v                               v
   PROTOTYPE_READY                      SIMULATION_RESULT
   FINANCIAL_MODEL_READY                     |
   GTM_READY                                 v
   COMPLIANCE_REPORT_READY          Phase 3: PIVOT + REBUILD
                                    ========================
                                    CEO.process_simulation_result()
                                         |
                                    if pivot_recommended:
                                         CEO._pivot() -> PIVOT
                                              |
                                         all agents rebuild
                                              |
                                              v
                                    +-------------------+
                                    |     OUTPUTS       |
                                    +-------------------+
                                    | trace.json        |
                                    | board_discussion  |
                                    | simulation_geo    |
                                    | simulation_results|
                                    | sprint_report.md  |
                                    | prototype/*       |
                                    | financial_model/* |
                                    | gtm/*             |
                                    | compliance/*      |
                                    +-------------------+
                                              |
                                    +---------+---------+
                                    |         |         |
                                    v         v         v
                                Dashboard  Database  W&B Trace
                               (5 screens) (Postgres) (optional)
```

---

## Appendix: Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | Python | 3.11+ |
| Async runtime | asyncio | stdlib |
| Data models | Pydantic | 2.0+ |
| LLM provider | OpenAI SDK (async) | 1.30+ |
| Observability | Weights & Biases | 0.17+ |
| CLI | Click | 8.0+ |
| Console output | Rich | 13.0+ |
| Environment | python-dotenv | 1.0+ |
| Numerical | NumPy | 1.26+ |
| Database ORM | SQLAlchemy | 2.0+ |
| Database driver | asyncpg | 0.29+ |
| Testing | pytest + pytest-asyncio | 8.0+ / 0.23+ |
| HTTP | aiohttp | 3.9+ |
