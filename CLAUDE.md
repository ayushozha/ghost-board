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
