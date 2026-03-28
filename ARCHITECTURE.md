# Ghost Board Architecture

## System Overview

Ghost Board is an autonomous AI executive team that coordinates five specialized agents to build and validate a startup in a single sprint. It uses two nested feedback loops and an async event-driven architecture.

## Agent Descriptions

| Agent | Model | Role | Key Methods |
|-------|-------|------|-------------|
| CEO | gpt-4o | Strategy, delegation, pivot decisions | `set_strategy()`, `process_blocker()`, `process_simulation_result()` |
| CTO | gpt-4o | Codex-powered prototype generation | `generate_prototype()`, `handle_pivot()` |
| CFO | gpt-4o | Financial model generation | `generate_financial_model()`, `handle_pivot()` |
| CMO | gpt-4o | GTM strategy, landing page copy | `generate_gtm()`, `handle_pivot()` |
| Legal | gpt-4o | Compliance analysis with web search citations | `analyze_compliance()` |
| Simulation | gpt-4o-mini | Synthetic stakeholder reactions | `run_simulation()`, `analyze_simulation()` |

## Event Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        EVENT BUS (StateBus)                     │
│                                                                 │
│  subscribe(EventType, handler) -> async callback registration   │
│  publish(event) -> concurrent handler invocation                │
│  get_trace() -> full ordered event history                      │
│  get_state() -> latest event per source+type                    │
└─────────────────────────────────────────────────────────────────┘

Phase 1: Strategy + Build
─────────────────────────
  Founder Brief
       │
       ▼
  CEO.set_strategy()
       │
       ├─── publishes STRATEGY_SET ──────┐
       │                                  │
       ▼                                  ▼
  [CTO, CFO, CMO, Legal] receive via subscription
       │
       ├── CTO.generate_prototype()  ──> PROTOTYPE_READY
       ├── CFO.generate_financial_model() ──> FINANCIAL_MODEL_READY
       ├── CMO.generate_gtm()  ──> GTM_READY
       └── Legal.analyze_compliance() ──> COMPLIANCE_REPORT_READY
                                      └──> BLOCKER (if critical issues found)

  If BLOCKER published:
       │
       ▼
  CEO.process_blocker() (subscribed to BLOCKER)
       │
       └── CEO._pivot() ──> publishes PIVOT
                              │
                              ▼
                         [CTO, CFO, CMO] handle_pivot()
                              │
                              └── Rebuild artifacts

Phase 2: Market Simulation
──────────────────────────
  MiroFishBridge.run_full_simulation()
       │
       ├── generate_personas()  (gpt-4o-mini, archetype distribution)
       ├── run_simulation()     (turn-based, agent-to-agent references)
       └── analyze_simulation() (MarketSignal with pivot recommendation)
                │
                └── publishes SIMULATION_RESULT

Phase 3: Pivot + Rebuild (if needed)
────────────────────────────────────
  CEO.process_simulation_result() (subscribed to SIMULATION_RESULT)
       │
       └── If pivot_recommended:
              CEO._pivot() ──> PIVOT ──> agents rebuild
```

## Event Types

| EventType | Payload Model | Published By | Consumed By |
|-----------|--------------|--------------|-------------|
| STRATEGY_SET | StrategyPayload | CEO | CTO, CFO, CMO, Legal |
| PIVOT | PivotPayload | CEO | CTO, CFO, CMO, Legal |
| BLOCKER | BlockerPayload | Legal | CEO |
| SIMULATION_RESULT | SimulationResultPayload | Engine | CEO |
| PROTOTYPE_READY | PrototypePayload | CTO | (trace only) |
| FINANCIAL_MODEL_READY | FinancialModelPayload | CFO | (trace only) |
| GTM_READY | GTMPayload | CMO | (trace only) |
| COMPLIANCE_REPORT_READY | CompliancePayload | Legal | (trace only) |
| UPDATE | UpdatePayload | Any agent | (trace only) |
| ERROR | ErrorPayload | Any agent | (trace only) |

## Causal Chain

Every `AgentEvent` has a `triggered_by` field containing the ID of the event that caused it:

```
STRATEGY_SET (id: abc) ──> BLOCKER (triggered_by: abc) ──> PIVOT (triggered_by: blocker_id)
```

This creates a full causal DAG visible in the W&B trace or JSON log.

## MiroFish Integration

The `MiroFishBridge` class provides automatic fallback:

1. **Try MiroFish first**: If `vendor/MiroFish/` exists with deps installed, run the simulation via subprocess using their OASIS engine
2. **Fall back to local**: If MiroFish fails for any reason, use our own async simulation loop:
   - `simulation/personas.py` - Persona generation with archetype distribution
   - `simulation/engine.py` - Turn-based simulation with stance tracking
   - `simulation/analyzer.py` - Structured MarketSignal extraction

BettaFish sentiment patterns are similarly bridged - try their analyzer, fall back to OpenAI-based sentiment.

## Observability

Two-tier logging:
1. **W&B** (if `WANDB_API_KEY` set): Real-time event streaming, artifacts, cost metrics
2. **JSON fallback** (`outputs/trace.json`): Full trace log in JSON format

Every agent action calls `self.log()` which creates an UPDATE event in the trace.

## Error Recovery

All LLM calls use exponential backoff retry (3 attempts). If all retries fail, agents publish degraded results and continue. No single agent failure crashes the sprint.

## Cost Model

Token costs tracked per agent:
- gpt-4o: $2.50/1M input, $10.00/1M output
- gpt-4o-mini: $0.15/1M input, $0.60/1M output

Sprint summary includes total cost vs human equivalent (~$15,000 consulting engagement).
