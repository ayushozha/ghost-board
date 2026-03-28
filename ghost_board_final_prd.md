# Ghost Board Final PRD

## 1. Product Overview

Ghost Board is an autonomous executive harness for founders. A founder provides a company goal, a one pager, or a short product brief. Ghost Board spins up five specialized agents, CEO, CTO, CFO, CMO, and Legal, and runs a full company sprint end to end. The system produces a working prototype, a financial model, positioning assets, and a grounded compliance memo while logging every decision, handoff, and pivot.

Ghost Board does not build in a vacuum. After the first artifact set is produced, the CEO triggers a lightweight market stress test inspired by MiroFish. Synthetic stakeholders such as buyers, investors, journalists, and competitors react to the current product, pitch, pricing, and GTM. Their reactions are converted into structured market signals and fed back into the board so strategy, code, pricing, and messaging can change before the sprint ends.

The product claim is not that the simulation perfectly predicts reality. The claim is that structured pressure produces better artifacts than no pressure.

## 2. Hackathon Thesis

Ghost Board is the combination of two feedback loops in one autonomous sprint.

### Inner loop

The executive team coordinates over a typed event bus with shared world state. Legal can raise a blocker. CEO can pivot. CTO, CFO, and CMO can rebuild based on the pivot.

### Outer loop

The market stress test reacts to version one artifacts and returns structured signals. CEO reads those signals and re delegates with updated constraints.

This gives Ghost Board a real causal chain:

Founder goal → version one artifacts → market pressure → CEO pivot → updated artifacts

## 3. Problem Statement Fit

### Statement 1

CTO uses Codex to build the prototype.

### Statement 2

Agents are each other’s primary customers during execution. The market simulation reacts to agent outputs, not new human prompts.

### Statement 3

Ghost Board is a useful AI application that produces a complete, auditable company sprint.

## 4. Product Goal

Build a hackathon ready autonomous company sprint that can:

1. Generate real artifacts from a founder brief
2. Show visible multi agent state passing
3. Show one undeniable pivot cascade across multiple artifacts
4. Add external market pressure as structured input, not final truth
5. Produce a live execution trace that proves causality

## 5. Non Goals

Ghost Board is not trying to:

1. Replace actual legal counsel
2. Predict startup success with scientific certainty
3. Build a full enterprise platform in one day
4. Run a heavy, dependency rich MiroFish stack during the hackathon
5. Support every startup category in the first version

## 6. Final Scope Lock

For the hackathon build, use a lightweight custom simulation inspired by MiroFish.

Do not attempt:

1. Direct MiroFish fork during the core build
2. BettaFish integration
3. Continuous always on simulation
4. More than one external market feedback cycle

### Final simulation scope

1. 20 to 25 synthetic stakeholders
2. 4 to 5 rounds of turn based interaction
3. One structured signal object returned to CEO
4. One final pivot and rebuild cycle

## 7. User Input

The founder provides:

1. Company goal
2. Optional one pager
3. Optional constraints such as target market, budget, and business model

### Example input

Launch Anchrix, a stablecoin payout platform for US fintechs.

## 8. Core Output Bundle

Ghost Board must produce five outputs.

1. Prototype artifact from CTO
2. Financial model from CFO
3. GTM and positioning copy from CMO
4. Compliance memo from Legal
5. Execution trace plus pivot timeline from the coordination harness

If the market loop is enabled, Ghost Board must also produce:

6. Version one versus version two artifact diff
7. Market signal summary

## 9. Architecture Overview

```text
Founder Goal / One Pager / Constraints
                    ↓
      Open Source Coordination Harness
   typed event bus • shared world state • execution trace
       artifact store • agent memory • task registry
                    ↓
                 CEO Agent
      plan • delegate • read signals • pivot
         ↙          ↓          ↘
   CTO Agent    Legal Agent    CFO Agent
Codex build     grounded       unit economics
prototype       retrieval      pricing / burn
         ↘          ↓          ↙
                 CMO Agent
    landing page • positioning • GTM copy
                    ↓
         Version 1 artifacts published
                    ↓
   Lightweight Market Stress Test Tool
 buyers • VCs • journalists • competitors
                    ↓
      Structured market signal object
 sentiment • objections • pricing signal
 narrative risk • GTM risk • ICP fit
                    ↓
            CEO pivot decision
                    ↓
     new task specs broadcast on bus
                    ↓
 Final sprint package + pivot timeline + diff
```

## 10. Coordination Harness Requirements

The harness is the technical contribution. It must be open source and self hostable.

### Required capabilities

1. Typed event bus
2. Shared world state
3. Execution trace with event lineage
4. Artifact store
5. Agent memory
6. Task registry for re delegation
7. Live trace view during the sprint

### Design rule

Agents must remain alive during the sprint and react to events through callbacks or queued handlers. The system must not behave like a sequential pipeline where CEO only checks messages between phases.

## 11. Event Model

Use typed payloads, not raw dicts.

### Event types

1. `STRATEGY_CREATED`
2. `TASK_ASSIGNED`
3. `ARTIFACT_UPDATED`
4. `BLOCKER_RAISED`
5. `PIVOT_DECISION`
6. `SIMULATION_STARTED`
7. `SIMULATION_SIGNAL_READY`
8. `TASK_SUPERSEDED`
9. `SPRINT_COMPLETED`

### Common event envelope

```python
class AgentEvent(BaseModel):
    id: str
    event_type: EventType
    source_agent: str
    target_agent: str | None
    timestamp: datetime
    triggered_by: str | None
    payload: BaseModel
```

### Typed payloads

```python
class StrategyPayload(BaseModel):
    company_name: str
    target_market: str
    value_prop: str
    MVP_scope: list[str]
    GTM_strategy: str
    pricing_hypothesis: str
    key_risks: list[str]

class TaskSpecPayload(BaseModel):
    owner: str
    objective: str
    constraints: list[str]
    affected_artifacts: list[str]
    acceptance_criteria: list[str]

class BlockerPayload(BaseModel):
    title: str
    severity: Literal["blocking", "advisory"]
    issue: str
    citations: list[str]
    recommended_action: str
    confidence: float

class PivotDecisionPayload(BaseModel):
    pivot_title: str
    rationale: str
    caused_by_events: list[str]
    changed_constraints: list[str]
    affected_agents: list[str]
    expected_artifact_changes: list[str]

class SimulationSignalPayload(BaseModel):
    overall_sentiment: float
    sentiment_by_archetype: dict[str, float]
    top_objections: list[str]
    top_praise: list[str]
    pricing_signal: str
    narrative_risk: str
    GTM_risk: str
    ICP_fit: str
    pivot_suggestion: str | None
    supporting_quotes: list[dict]

class ArtifactUpdatePayload(BaseModel):
    artifact_type: str
    artifact_path: str
    summary_of_change: str
    supersedes: str | None
```
```

### Hard requirement

Every event must include `triggered_by` so the trace can show causality.

## 12. Agent Roles

### CEO Agent

CEO is the orchestrator.

Responsibilities:

1. Parse founder input into initial strategy
2. Publish initial strategy and task specs
3. Listen for blockers, updates, and simulation signals
4. Make actual pivot decisions, not simple relays
5. Re delegate updated task specs after pivots
6. Compile final executive summary

CEO must explain why a pivot happened. For example, if Legal raises money transmitter risk and the market loop flags enterprise pricing mismatch, CEO should decide between options such as narrowing to B2B, reducing state coverage, or changing pricing structure.

### CTO Agent

CTO builds the prototype using Codex.

Responsibilities:

1. Convert task spec into runnable scaffold
2. Build a narrow MVP
3. Save code artifacts to outputs/prototype
4. React to pivot decisions by modifying existing code
5. Publish artifact update events with clear summaries

Hard rule: after a pivot, CTO should update the existing prototype rather than regenerate everything from scratch whenever possible.

### CFO Agent

CFO builds a compact financial model.

Responsibilities:

1. Model revenue, costs, and runway
2. Produce unit economics
3. Flag implausible assumptions
4. React to pivots by updating pricing, CAC, growth assumptions, and compliance cost structure
5. Save both readable markdown and structured JSON

### CMO Agent

CMO builds positioning and GTM assets.

Responsibilities:

1. Create landing page hero, subhead, features, and CTA
2. Define ICP and category framing
3. Write short competitor positioning
4. React to pivots and market signals by updating messaging

### Legal Agent

Legal must be grounded in retrieval over real regulatory text.

Responsibilities:

1. Inspect strategy for regulatory risk
2. Retrieve relevant material from CFPB, FinCEN, SEC, or domain appropriate sources
3. Publish blocker or advisory events
4. Generate a compliance memo with citations
5. Optionally inspect prototype structure for obvious compliance gaps

### Legal memo format

Every legal finding must include:

1. Issue
2. Severity
3. Source title
4. Source URL
5. Extracted passage or clause summary
6. Why it matters
7. Recommended action
8. Confidence
9. Not legal advice disclaimer

## 13. Market Stress Test Design

The market loop is a tool that CEO calls after version one artifacts exist.

### Design principle

This is structured pressure, not a market oracle.

### Persona archetypes

1. Early adopter
2. Skeptical user
3. Enterprise buyer
4. VC
5. Competitor
6. Journalist

### Minimum simulation behavior

1. Personas must see current artifacts or summaries derived from them
2. Personas must react to each other, not only to the founder brief
3. At least some posts must reference earlier posts by name or role
4. The analyzer must return a typed signal object CEO can use

### Simulation limits for hackathon safety

1. 20 to 25 personas maximum
2. 4 to 5 rounds maximum
3. Use a smaller model for personas
4. End early if a clear dominant objection emerges

## 14. Execution Flow

### Phase 1

CEO creates strategy and assigns initial tasks.

### Phase 2

CTO, CFO, CMO, and Legal work in parallel and publish updates. Legal may interrupt at any time with a blocker.

### Phase 3

CEO receives blocker events and may emit a pivot decision immediately. New task specs are broadcast. Agents update artifacts.

### Phase 4

Once version one artifacts exist, CEO triggers the market stress test.

### Phase 5

The simulation returns a structured signal event. CEO reads the actual objections and emits a pivot decision or no change.

### Phase 6

Affected agents rebuild based on the new task specs.

### Phase 7

The harness emits sprint completed and stores final artifacts, diffs, and trace.

## 15. Build Layer for Ralphthon

Keep the build layer simple.

### Default path

Ralph plus Codex builds the project from this PRD and AGENT instructions.

### Optional path

Claude Code may be used as a secondary builder if a second terminal is available.

### Not required

OpenClaw, oh my opencode, and other builder tools are optional implementation details, not part of the core product requirement.

## 16. Tech Stack

1. Python 3.11+
2. `asyncio` for concurrency
3. `pydantic` for typed models
4. OpenAI SDK for agent calls
5. Codex for CTO
6. Weights and Biases for trace and metrics
7. `rich` or lightweight UI for terminal trace
8. Local JSON artifact backups

## 17. Privacy and Deployment

Ghost Board’s coordination harness is open source and self hostable.

For the demo, the market stress test should also be designed to run in the same self hosted environment. Company inputs are not retained by the harness.

## 18. Build Order

### Must have

1. Project skeleton
2. Typed event bus
3. Base agent with trace logging
4. CEO agent
5. CTO agent
6. Legal agent
7. Main orchestration loop

### Should have

8. CFO agent
9. CMO agent
10. Lightweight market simulation
11. Market signal analyzer
12. Artifact diff generator

### Nice to have

13. Weights and Biases dashboard polish
14. Demo cache mode
15. Fancy live trace UI

## 19. Acceptance Criteria

### System level

1. `python main.py "your idea"` runs end to end without crashing
2. At least one blocker event can interrupt the sprint
3. CEO emits at least one real pivot decision containing rationale and changed constraints
4. CTO changes an existing artifact after a pivot
5. Legal memo includes real citations
6. Market loop returns a structured signal object
7. The execution trace shows a causal chain across at least three agents

### Demo level

The demo must make one chain undeniable:

Legal finding → CEO pivot → CTO artifact change

The stretch version makes a second chain undeniable:

Market objection → CEO pivot → CFO or CMO artifact change

## 20. Benchmark Task

Ghost Board must include one internal benchmark.

### A/B sprint comparison

Run the same founder concept twice.

### Run A

Without market loop

### Run B

With market loop

### Compare

1. Pricing defensibility
2. GTM specificity
3. Risk coverage
4. Prototype scope clarity
5. Artifact quality by simple rubric

### Purpose

The benchmark is not trying to prove perfect simulation accuracy. It is trying to show that structured pressure improves artifacts.

## 21. Repo Structure

```text
ghost-board/
├── README.md
├── requirements.txt
├── pyproject.toml
├── .env.example
├── main.py
├── agents/
│   ├── base.py
│   ├── ceo.py
│   ├── cto.py
│   ├── cfo.py
│   ├── cmo.py
│   └── legal.py
├── coordination/
│   ├── events.py
│   ├── bus.py
│   ├── world_state.py
│   └── trace.py
├── simulation/
│   ├── personas.py
│   ├── engine.py
│   └── analyzer.py
├── outputs/
│   ├── prototype/
│   ├── finance/
│   ├── gtm/
│   └── compliance/
├── benchmarks/
│   └── ab_diff.py
└── demo/
    └── anchrix_concept.txt
```

## 22. Demo Plan

### Demo beat 1

One command. Five executives. Autonomous company sprint.

### Demo beat 2

Show the live trace. Focus on Legal raising a blocker with a real citation.

### Demo beat 3

Show CEO’s pivot event payload and the new CTO task spec.

### Demo beat 4

Open the prototype diff showing the post pivot change.

### Demo beat 5

Show the market signal object and the second pivot or messaging update.

### Demo beat 6

Show the final artifact bundle and, if available, the A/B diff.

## 23. Demo Script Snapshot

Ghost Board is an open source autonomous executive harness. We gave it a startup goal and walked away. Legal retrieved a real regulatory blocker, CEO pivoted the strategy, CTO changed the prototype, then the market loop pressure tested version one and sent structured signals back into the board. The result is not just code or advice. It is a company sprint with working artifacts and a visible causal decision trail.

## 24. Risks and Mitigations

### Risk 1

The bus looks event driven on paper but behaves like a pipeline.

### Mitigation

Keep agents alive and subscribed throughout the sprint. Show raw event payloads.

### Risk 2

The market loop is too heavy.

### Mitigation

Lock the lightweight custom simulation and cap persona count and rounds.

### Risk 3

Legal feels hallucinated.

### Mitigation

Require citations and extracted source text in every blocker.

### Risk 4

The full system does not finish.

### Mitigation

Ship the harness, CEO, CTO, Legal, and one pivot chain first.

## 25. Final Positioning

Ghost Board does not just generate artifacts. It builds a company sprint under pressure. The inner loop creates real work. The outer loop challenges that work. The harness records e