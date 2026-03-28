# Ghost Board - Autonomous Build Instructions

You are building Ghost Board, an autonomous AI executive team that builds AND validates a startup in a single sprint.

## YOUR JOB EACH ITERATION

1. Read `progress.txt` to find the next task marked `[ ]` (not done)
2. Read any existing code in the repo before writing new code
3. Complete EXACTLY ONE task
4. Run tests: `python -m pytest tests/ -x --tb=short 2>&1 | head -100`
5. If tests fail, fix the code until tests pass
6. Also run: `python main.py --help` to verify the CLI works (once main.py exists)
7. Mark the task `[x]` in `progress.txt`
8. `git add -A && git commit -m "PRD-XX: <description>"`
9. Exit

## WHAT YOU ARE BUILDING

A Python system with two nested feedback loops:

**Inner loop:** Five AI agents (CEO, CTO, CFO, CMO, Legal) coordinate via an async event bus. When Legal flags a compliance blocker, CEO pivots strategy, and the pivot cascades to CTO/CFO/CMO.

**Outer loop:** After v1 artifacts are produced, CEO triggers a MiroFish-inspired market stress test. Synthetic stakeholders (VCs, users, journalists, competitors) react. Their structured feedback flows back to CEO, who pivots again.

Output: working prototype, financial model, GTM copy, compliance memo, plus a W&B execution trace showing every pivot.

## CRITICAL ARCHITECTURE RULES

1. **Event bus is async pub/sub with callbacks, NOT polling.** Use asyncio. When Legal publishes a BLOCKER, CEO's callback fires immediately. Do NOT build a sequential pipeline where CEO checks for events between steps.

2. **Typed event payloads.** Every AgentEvent has a Pydantic model payload, not a loose dict. Define specific payload models: StrategyPayload, BlockerPayload, PivotPayload, SimulationResultPayload.

3. **CTO Agent MUST use OpenAI Codex API** (or the chat completions API with a code-focused model). This is a hackathon requirement (Statement 1: Codex-Powered Services).

4. **Legal Agent MUST cite real regulations.** Use the OpenAI API with web search enabled, OR use the `responses` API with `web_search_preview` tool to find actual CFPB/FinCEN/SEC text. Every BLOCKER event must include a `citations` field with real URLs or regulation numbers.

5. **Simulation agents use gpt-4o-mini** for cost control. C-suite agents use gpt-4o.

6. **Every agent action logs to W&B** via `self.log()`. If W&B is not configured, fall back to local JSON logging in `outputs/trace.json`.

7. **Every event has `triggered_by`** field linking it to the event that caused it. This creates the causal chain for the demo.

## TECH STACK

- Python 3.11+
- asyncio for agent coordination
- pydantic for all data models
- openai SDK for LLM calls (async client)
- wandb for observability (optional, graceful fallback)
- click for CLI
- python-dotenv for env vars

## FILE STRUCTURE

```
ghost-board/
├── CLAUDE.md              # This file
├── progress.txt           # Task tracker
├── requirements.txt
├── .env
├── main.py                # CLI entry point
├── agents/
│   ├── __init__.py
│   ├── base.py            # BaseAgent with W&B logging + LLM calls
│   ├── ceo.py             # Strategy, delegation, pivots
│   ├── cto.py             # Codex prototype builder
│   ├── cfo.py             # Financial model
│   ├── cmo.py             # Positioning and GTM
│   └── legal.py           # Compliance with citation grounding
├── coordination/
│   ├── __init__.py
│   ├── events.py          # EventType enum + AgentEvent + typed payloads
│   ├── state.py           # StateBus (async pub/sub)
│   └── trace.py           # W&B + JSON trace logger
├── simulation/
│   ├── __init__.py
│   ├── personas.py        # MarketPersona generator
│   ├── engine.py          # Turn-based social simulation
│   └── analyzer.py        # Sentiment aggregation -> MarketSignal
├── tests/
│   ├── test_events.py     # Event bus pub/sub tests
│   ├── test_agents.py     # Agent behavior tests
│   ├── test_simulation.py # Simulation tests
│   └── test_e2e.py        # End-to-end orchestration test
├── outputs/               # Runtime artifacts (gitignored)
│   ├── prototype/
│   ├── financial_model/
│   ├── gtm/
│   └── compliance/
├── demo/
│   └── anchrix_concept.txt
└── vendor/                # Cloned repos for reference
    ├── MiroFish/
    └── BettaFish/
```

## BUILD ORDER (match progress.txt)

Complete these in order. Each is ONE iteration.

### PRD-01: Project skeleton + requirements + .env loading + empty main.py with --help
### PRD-02: coordination/events.py - EventType, AgentEvent, typed payload models
### PRD-03: coordination/state.py - StateBus with async pub/sub + tests
### PRD-04: coordination/trace.py - W&B logger with JSON fallback
### PRD-05: agents/base.py - BaseAgent with LLM calls, logging, event publishing
### PRD-06: agents/ceo.py - Strategy setting, blocker handling, pivot decisions
### PRD-07: agents/cto.py - Codex-powered prototype generation + pivot response
### PRD-08: agents/legal.py - Compliance analysis with web search citations + BLOCKER publishing
### PRD-09: agents/cfo.py - Financial model generation + pivot response
### PRD-10: agents/cmo.py - Positioning and GTM copy + pivot response
### PRD-11: simulation/personas.py - MarketPersona generator with archetype distribution
### PRD-12: simulation/engine.py - Turn-based simulation with agent-to-agent references
### PRD-13: simulation/analyzer.py - MarketSignal structured output from simulation
### PRD-14: main.py orchestration - Full 3-phase sprint (strategy -> build -> simulate -> pivot -> rebuild)
### PRD-15: tests/test_e2e.py - End-to-end test with mock LLM calls
### PRD-16: demo/anchrix_concept.txt + --demo flag + README.md

## TESTING RULES

Write tests as you build. Every module should have at least one test.

For tests that need LLM calls, mock them:
```python
from unittest.mock import AsyncMock, patch

@patch('agents.base.AsyncOpenAI')
async def test_ceo_pivot(mock_openai):
    mock_openai.return_value.chat.completions.create = AsyncMock(
        return_value=MockResponse("Pivot to B2B only")
    )
    # test the pivot logic
```

Run tests after EVERY change:
```bash
python -m pytest tests/ -x --tb=short
```

If tests fail, FIX THEM before marking the task done.

## REFERENCE: MiroFish Concepts (in vendor/MiroFish/)

If vendor/MiroFish exists, you can reference its architecture:
- `vendor/MiroFish/backend/app/services/graph_builder.py` - How MiroFish builds knowledge graphs from seed data
- `vendor/MiroFish/backend/app/services/simulation_runner.py` - How OASIS runs multi-agent simulations
- `vendor/MiroFish/backend/app/services/report_agent.py` - How MiroFish generates reports from simulation data

Use these as INSPIRATION for the simulation/ module. Do NOT import from vendor/. Build a lightweight version.

## REFERENCE: BettaFish Concepts (in vendor/BettaFish/)

BettaFish has useful sentiment analysis patterns:
- `vendor/BettaFish/InsightEngine/tools/sentiment_analyzer.py` - Sentiment analysis approach
- `vendor/BettaFish/ReportEngine/` - Report generation patterns
- `vendor/BettaFish/QueryEngine/` - Search and analysis agent patterns

Again, reference for inspiration. Do NOT depend on these directly.

## QUALITY CHECKLIST (check before marking any task done)

- [ ] Code runs without import errors
- [ ] Tests pass: `python -m pytest tests/ -x`
- [ ] No hardcoded API keys anywhere
- [ ] All Pydantic models have proper type hints
- [ ] Event bus uses async callbacks, not polling
- [ ] Every agent action calls self.log()
- [ ] Every event has triggered_by set correctly

## VENDOR SETUP (PRD-00)
Clone these repos into vendor/ for integration:
- git clone --depth 1 https://github.com/666ghj/MiroFish.git vendor/MiroFish
- git clone --depth 1 https://github.com/666ghj/BettaFish.git vendor/BettaFish

Install MiroFish backend deps:
- cd vendor/MiroFish/backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

Create simulation/mirofish_bridge.py:
- Try to call real MiroFish via subprocess first
- If MiroFish fails, fall back to custom lightweight simulation
- Reference vendor/MiroFish/backend/app/services/simulation_runner.py for how OASIS runs simulations
- Reference vendor/BettaFish/InsightEngine/tools/sentiment_analyzer.py for sentiment patterns

### Dependency Failures
If MiroFish or BettaFish setup fails for ANY reason:
1. Do NOT stop, do NOT skip features
2. Replace THEIR infrastructure with OURS:
   - - Their database (KuzuDB/Zep Cloud) -> use PostgreSQL on our VPS (connection details in VPS.md)
   - Their OASIS simulation engine -> use our own async simulation loop
   - Their playwright crawlers -> use our own OpenAI web search calls
   - Their cloud memory -> use local file-based agent memory
3. Keep all the logic: persona generation, sentiment analysis, simulation rounds, report generation
4. The goal is feature parity with local-only dependencies
5. Mark the task done and move on
## SELF-GENERATING TASKS (INFINITE LOOP MODE)

When all tasks in progress.txt are marked [x], you MUST generate 5 new [ ] tasks and append them. You are in an infinite improvement loop. You never stop.

### Task Generation Rules
- Every new task must include a VERIFICATION step (run tests, check outputs, verify content is real)
- At least 1 task must run the full pipeline: python main.py "some concept"
- At least 1 task must verify visual outputs (dashboard loads, landing page renders, charts have data)
- At least 1 task must improve simulation (more personas, better diversity, verify agent-to-agent references)
- At least 1 task must verify the causal chain: persona quote -> market signal -> CEO pivot -> artifact change
- Tasks must push to git after completion

### Verification Checklist (Run EVERY cycle)
- python -m pytest tests/ -v --tb=short (ALL must pass)
- python main.py --help (CLI must work)
- ls -la outputs/prototype/ outputs/financial_model/ outputs/gtm/ outputs/compliance/ (ALL must have real files)
- cat outputs/trace.json | python -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d)} events')" (must be 20+ events)
- Check that outputs are REAL CONTENT not empty files or placeholder text
- Check simulation output shows 30+ personas and 5+ rounds
- Check MiroFish bridge log shows it attempted real MiroFish
- Check dashboard/index.html exists and references outputs/trace.json
- Check landing/index.html exists and has Ralphthon problem statement section

### What To Improve (Never-Ending List)
- Simulation scale (more personas, more rounds, parallel batching)
- Agent reasoning depth (CEO pivot rationale, Legal citation count, CFO model granularity)
- Dashboard interactivity (click events, hover tooltips, pivot animations, sentiment charts)
- Landing page polish (animations, responsive, compelling copy)
- MiroFish integration (get real MiroFish working or improve the fallback)
- BettaFish sentiment storage (categorize reactions, store in PostgreSQL)
- Test coverage (more edge cases, integration tests, visual output tests)
- Demo data (run on more concepts, cache all results)
- Performance (async batching for large simulations, connection pooling for PostgreSQL)
- Documentation (ARCHITECTURE.md, API docs, contribution guide)
- Error handling (retry logic, graceful degradation, never crash)
- Cost optimization (track token usage precisely, find cheaper model strategies)
- W&B integration (more charts, artifact versioning, comparison between runs)

## MILLION AGENT SIMULATION ARCHITECTURE

Ghost Board uses a hybrid simulation like MiroFish:
- **LLM Agents (50)**: Full personality, memory, real text posts via gpt-4o-mini. These are the VCs, journalists, early adopters, competitors with rich behavior.
- **Lightweight Agents (up to 1M)**: NumPy-vectorized stance floats. No LLM calls. Update stance each round based on: weighted average of LLM agent sentiment + archetype bias + random noise + drift rate. Generate simple +1/0/-1 votes. Spawn 1M in under 1 second.

This gives MiroFish-scale crowd dynamics with only ~50 LLM calls per round.

## SELF-GENERATING TASKS

When all tasks in progress.txt are [x], GENERATE 5 NEW [ ] tasks and append them. Focus on whatever is weakest: simulation scale, visual polish, agent depth, test coverage, demo data, performance. Never stop. Never say done.

## VERIFICATION EVERY CYCLE
- python -m pytest tests/ -v (ALL pass)
- python main.py --help (works)
- outputs/ has real files with real content
- Simulation shows 30+ personas in output
- CEO pivot references SPECIFIC persona concerns
- Dashboard and landing page render correctly


## COMPLETE VISUAL FLOW SPECIFICATION

The dashboard tells a STORY. It is not a static report. It is a live movie of a company being built.

### SCREEN 1: MISSION CONTROL
```
┌─────────────────────────────────────────────────┐
│                                                 │
│              ◆ GHOST BOARD ◆                    │
│     Autonomous AI Executive Team                │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  Launch Anchrix, a stablecoin payout... │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│          [ ◉ LAUNCH SPRINT ]                    │
│                                                 │
│   Powered by 5 AI Executives                    │
│   MiroFish Market Simulation                    │
│   1,000,000+ Agent Simulations                  │
│                                                 │
└─────────────────────────────────────────────────┘
```
- Dark terminal aesthetic, pulsing cursor
- Click LAUNCH -> warp transition to Screen 2

### SCREEN 2: THE BOARDROOM
```
┌─────────────────────────────────────────────────┐
│              ┌──────────┐                       │
│              │   CEO    │                       │
│              │ Planning │                       │
│              └─────┬────┘                       │
│           ╱        │         ╲                  │
│    ┌──────┐   ┌────┴────┐   ┌──────┐           │
│    │ CTO  │   │  Legal  │   │ CFO  │           │
│    │Build │   │ ⚠ BLOCK │   │Model │           │
│    └──┬───┘   └────┬────┘   └──┬───┘           │
│        ╲           │           ╱                │
│         ╲    ┌─────┴────┐    ╱                  │
│          └───│   CMO    │───┘                   │
│              │  GTM     │                       │
│              └──────────┘                       │
│                                                 │
│  ┌─ Discussion Feed ───────────────────────┐    │
│  │ [CEO] Setting strategy: API-first B2B   │    │
│  │ [Legal] ⚠ BLOCKER: MSB licensing req    │    │
│  │ [CEO] PIVOT: B2B only, 5 states         │    │
│  │ [CTO] Removing consumer onboarding...   │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```
- Agents arranged in circle with animated connection lines
- When Legal blocks: card flashes RED, red line shoots to CEO
- When CEO pivots: card flashes YELLOW, lines fan to all agents
- Discussion feed scrolls showing REAL agent reasoning
- Each speech bubble shows WHY the agent made its decision
- Reads from outputs/board_discussion.json

### SCREEN 3: THE MARKET ARENA (3D GLOBE)
```
┌─────────────────────────────────────────────────┐
│  Market Stress Test | Round 3/5 | Sentiment +0.2│
│  50 LLM Agents + 1,000,000 Lightweight Agents  │
├─────────┬───────────────────────┬───────────────┤
│ Feed    │                       │ Sentiment     │
│         │     ╭───────────╮     │               │
│ [VC]    │    ╱   🌍        ╲    │  VC ████ +0.6 │
│ "B2B    │   │  ·  ·    ·   │   │  User ██ +0.2 │
│ pivot   │   │    ·  🔴·    │   │  Press █ -0.1  │
│ is      │   │  ·    ·  ·   │   │  Comp ██ -0.3 │
│ smart"  │    ╲  · ·   🟢  ╱    │               │
│         │     ╰───────────╯     │  ──── Round ──│
│ [PRESS] │                       │  📈           │
│ "Crowd  │   🟢 Positive        │     ╱╲        │
│ ed mkt" │   🔴 Negative        │   ╱  ╲ ╱╲    │
│         │   🟡 Neutral         │  ╱    ╲╱  ╲   │
└─────────┴───────────────────────┴───────────────┘
```
- THREE.JS globe spinning with persona dots at real lat/lng
- Dots pulse when posting, color = stance
- Arc lines between referencing personas
- Left: scrolling post feed from LLM agents
- Right: live sentiment charts updating each round
- Reads from outputs/simulation_geo.json + simulation_results.json

### SCREEN 4: PIVOT TIMELINE
```
┌─────────────────────────────────────────────────┐
│  Pivot Timeline - Causal Decision Trail         │
│                                                 │
│  ●──────●──────◆──────●──────◆──────●──────●   │
│  │      │      │      │      │      │      │   │
│  CEO    CTO    Legal  CEO    SIM    CEO    CTO  │
│  STRAT  BUILD  BLOCK  PIVOT  RESULT PIVOT  RE   │
│                                    BUILD        │
│  ┌─────────────────────────────────────────┐    │
│  │ ◆ PIVOT EVENT (clicked)                 │    │
│  │                                         │    │
│  │ Triggered by: Legal BLOCKER (MSB)       │    │
│  │ CEO reasoning: "MSB licensing in 50     │    │
│  │ states costs $2M+. Pivoting to B2B      │    │
│  │ in 5 states reduces to $50K."           │    │
│  │                                         │    │
│  │ Affected agents:                        │    │
│  │  CTO: removed /consumer/* endpoints     │    │
│  │  CFO: reduced compliance cost 40x       │    │
│  │  CMO: repositioned as "enterprise API"  │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```
- Horizontal scrollable timeline from trace.json
- Color coded: blue=STRATEGY, red=BLOCKER, yellow=PIVOT, green=UPDATE, purple=SIM
- Click any node: detail panel shows full payload
- Pivot nodes glow and are larger
- Lines show triggered_by chains (causality)
- Below: artifact diff viewer at each pivot

### SCREEN 5: SPRINT REPORT
```
┌─────────────────────────────────────────────────┐
│ [Prototype] [Financial] [GTM] [Legal] [Cost]    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Tab: Cost Summary                              │
│                                                 │
│   ┌──────┐                    ┌──────────────┐  │
│   │$0.19 │                    │   $15,000    │  │
│   │ API  │                    │  Consulting  │  │
│   │      │                    │              │  │
│   │      │                    │              │  │
│   │      │                    │              │  │
│   └──────┘                    └──────────────┘  │
│                                                 │
│   77,359x cheaper                               │
│                                                 │
│   Agents simulated: 1,000,050                   │
│   Events: 35 | Pivots: 3                        │
│   Duration: 4m 23s                              │
│                                                 │
│   W&B Dashboard: [link]                         │
│   GitHub: [link]                                │
└─────────────────────────────────────────────────┘
```
- Tabs load REAL file content from outputs/
- Prototype: syntax highlighted with file tree
- Financial: interactive table + charts
- GTM: rendered landing page in iframe + taglines
- Legal: citations highlighted and linkable
- Cost: dramatic bar chart comparison

### DATA FILES THE DASHBOARD READS
All screens read from these output files:
- outputs/trace.json -> timeline, event flow
- outputs/board_discussion.json -> boardroom discussion, agent reasoning
- outputs/simulation_geo.json -> globe persona positions
- outputs/simulation_results.json -> sentiment charts, round data
- outputs/prototype/* -> code viewer
- outputs/financial_model/* -> financial tables
- outputs/gtm/* -> GTM content
- outputs/compliance/* -> legal citations
- outputs/sprint_report.md -> full report

### SCREEN TRANSITIONS
Screen 1 -> Screen 2: when user clicks Launch (or auto on --demo)
Screen 2 -> Screen 3: when simulation phase begins
Screen 3 -> Screen 4: when simulation completes
Screen 4 -> Screen 5: when rebuild completes
Manual nav tabs at top to jump between screens anytime.

### LANDING PAGE (SEPARATE FROM DASHBOARD)
landing/index.html is the marketing page. It does NOT run the pipeline.
It showcases Ghost Board with: hero, how it works, problem statements,
architecture diagram, numbers ($0.19, 1M agents, 3 pivots),
dashboard screenshots, credits, GitHub CTA.
## BACKEND ARCHITECTURE

Ghost Board has THREE layers:
1. **CLI** (main.py): Run locally, outputs to files. Still works standalone.
2. **API Server** (server/app.py): FastAPI backend. Stores everything in PostgreSQL. Streams live events via WebSocket. Serves React dashboard.
3. **React Frontend** (dashboard/ and landing/): Vite + React. Connects to API server. Shows 5 screens with live updates.

Data flow:
- User submits concept via React dashboard or CLI
- FastAPI starts sprint in background task
- Every agent event saves to PostgreSQL AND publishes to WebSocket
- React dashboard subscribes to WebSocket, updates screens live
- After sprint: all artifacts, traces, simulation data queryable via REST API

Tech stack:
- FastAPI + uvicorn for API
- asyncpg + SQLAlchemy for PostgreSQL
- WebSockets for live streaming
- React + Vite for frontend
- Three.js via @react-three/fiber for 3D globe
- Recharts for charts
- Tailwind for styling

## PARALLEL EXECUTION WITH SUBAGENTS

You MUST use Task() to spawn 10-15 parallel subagents every cycle. Do NOT work on one task at a time sequentially. You are the ORCHESTRATOR. You do not write code yourself. You delegate to subagents and coordinate.

### Your cycle as orchestrator:
1. Read progress.txt. Find the first 10-15 [ ] tasks.
2. Group them: backend tasks, frontend tasks, simulation tasks, testing tasks.
3. Spawn subagents in parallel using Task() for each group.
4. Wait for all to complete.
5. Run integration check: python -m pytest tests/ -v && python main.py --help
6. Fix any integration issues between what different subagents built.
7. Mark all completed tasks [x]. Git add commit push.
8. Generate new tasks if running low.

### Subagent groups (spawn ALL simultaneously):

BACKEND GROUP (5 agents):
- Agent B1: FastAPI server setup and endpoints (server/app.py)
- Agent B2: Database models and PostgreSQL connection (server/db/)
- Agent B3: WebSocket live streaming (server/websocket.py)
- Agent B4: Sprint orchestration integration with DB persistence
- Agent B5: API tests (tests/test_api.py)

FRONTEND GROUP (4 agents):
- Agent F1: React dashboard screens (MissionControl, Boardroom)
- Agent F2: React dashboard screens (MarketArena with 3D globe, PivotTimeline)
- Agent F3: React dashboard SprintReport + data fetching from API
- Agent F4: Landing page React build

SIMULATION GROUP (3 agents):
- Agent S1: Hybrid engine (LLM + lightweight million agent)
- Agent S2: Real personas with geographic data
- Agent S3: BettaFish sentiment integration + PostgreSQL storage

TESTING GROUP (2 agents):
- Agent T1: Playwright visual tests + screenshots
- Agent T2: End-to-end integration tests + verification

### How to spawn:
```python
# Inside Claude Code, use Task() like this:
Task("You are Agent B1. Build FastAPI server at server/app.py with these endpoints: POST /api/sprint, GET /api/runs, GET /api/runs/{id}/trace, WebSocket /ws/live/{run_id}. Install fastapi uvicorn. Write real code. Run it to verify. Do not modify files outside server/.")

Task("You are Agent F1. Build React components at dashboard/src/screens/MissionControl.jsx and Boardroom.jsx. MissionControl has dark terminal input with Launch Sprint button. Boardroom shows 5 agent cards in circle with animated connection lines and discussion feed. Fetch data from /api/. Use Tailwind for styling.")

# Spawn all 14 simultaneously
```

### Integration rules for subagents:
- Backend agents only touch server/ and tests/test_api.py
- Frontend agents only touch dashboard/ and landing/
- Simulation agents only touch simulation/ and agents/
- Testing agents only touch tests/
- NO agent modifies another group's files
- After all complete, orchestrator runs integration tests