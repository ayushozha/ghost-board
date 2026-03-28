# Ghost Board
## Autonomous AI Executive Team
### Ralphthon SF 2026

---

## The Problem

Building a startup takes months of expensive human coordination:
- Strategy consulting: **$5,000-10,000**
- Legal compliance review: **$3,000-5,000**
- Financial modeling: **$2,000-4,000**
- GTM/marketing copy: **$1,500-3,000**
- Prototype development: **$5,000-15,000**

**Total: $15,000-37,000** and **weeks of calendar time**

---

## The Solution: Ghost Board

Give it a startup idea. Five AI agents coordinate autonomously:

| Agent | Role | Model |
|-------|------|-------|
| CEO | Strategy, pivots, decision-making | gpt-4o |
| CTO | Codex-powered prototype generation | gpt-4o |
| CFO | Financial model (3-year projections) | gpt-4o |
| CMO | Positioning, landing page, GTM plan | gpt-4o |
| Legal | Compliance with **real regulation citations** | gpt-4o + web search |

**Result: Complete startup package in ~2 minutes for ~$0.15**

---

## Architecture: Two Nested Feedback Loops

### Inner Loop (Build + Validate)
```
CEO sets strategy
  -> CTO builds prototype
  -> CFO models finances
  -> CMO writes copy
  -> Legal scans regulations (with web search)
     -> BLOCKER event with real citations!
        -> CEO pivots strategy
           -> All agents rebuild
```

### Outer Loop (Market Stress Test)
```
V1 artifacts ready
  -> Generate 10 synthetic stakeholders (VCs, skeptics, journalists...)
  -> Run 3-round turn-based simulation
  -> Produce MarketSignal
     -> CEO pivots again if negative
        -> Final package produced
```

---

## Key Technical Innovations

### 1. Async Event Bus (Not a Pipeline)
- Typed Pydantic payloads, not loose dicts
- `triggered_by` field creates full causal DAG
- Concurrent handler invocation via `asyncio.gather`
- Max 3 pivots to prevent infinite cascades

### 2. Legal Agent with Real Citations
- Uses OpenAI Responses API with `web_search_preview`
- Cites actual CFPB, FinCEN, SEC regulations
- Real URLs, not hallucinated references
- Example: `31 CFR 1010`, `https://www.fincen.gov/...`

### 3. MiroFish-Inspired Market Simulation
- Archetype distribution: VCs (2), early adopters (3), skeptics (2), journalist (1), competitor (1), regulator (1)
- Turn-based with agent-to-agent references
- Stance tracking and sentiment evolution
- Automatic fallback from MiroFish to local engine

### 4. Error Recovery
- All LLM calls retry 3x with exponential backoff
- Degraded results on failure (never crashes)
- W&B logging with JSON fallback

---

## Live Demo: Anchrix

```bash
python main.py --demo
```

### What Happens:
1. CEO defines strategy for AI compliance platform
2. Legal finds **CRITICAL blocker**: money transmitter licensing (31 CFR 1010)
3. CEO **pivots** to SaaS monitoring (no fund handling)
4. All agents rebuild with new strategy
5. Market simulation: 5 personas, 2 rounds
6. Sentiment: 0.10 (slightly positive), pivot recommended
7. CEO pivots again based on market feedback
8. Final package produced

### Results:
```
Events: 35
Pivots: 3
API cost: $0.15
Human equivalent: ~$15,000
Savings: 98,232x cheaper
```

---

## Output Artifacts

| Artifact | Contents |
|----------|----------|
| `outputs/prototype/` | FastAPI app with Pydantic models, routes, fraud detection |
| `outputs/financial_model/` | 3-year projections, $250K Y1 revenue, 12mo runway, LTV/CAC analysis |
| `outputs/gtm/` | Landing page copy, launch plan, competitive positioning matrix |
| `outputs/compliance/` | HIGH risk report with 4 blockers, real citations to EFTA, BSA, GDPR |
| `outputs/trace.json` | Full 35-event trace with causal chain |

---

## The Causal Chain (What Makes This Special)

```
STRATEGY_SET (CEO)
  -> BLOCKER (Legal, triggered_by: strategy)
     "CFPB violation: money transmitter licensing required"
     Citation: https://www.fincen.gov/msb-registrant-search
  -> PIVOT (CEO, triggered_by: blocker)
     "Restructure as SaaS tool, not fund handler"
  -> PROTOTYPE_READY (CTO, triggered_by: pivot)
  -> FINANCIAL_MODEL_READY (CFO, triggered_by: pivot)
  -> GTM_READY (CMO, triggered_by: pivot)
  -> SIMULATION_RESULT (Engine)
     sentiment: 0.10, pivot_recommended: true
  -> PIVOT (CEO, triggered_by: simulation)
     "Enhance data privacy, differentiation strategy"
```

Every decision is traceable. Every pivot has a reason. Every artifact has lineage.

---

## Tech Stack

- **Python 3.11+** / asyncio
- **OpenAI API** (gpt-4o + gpt-4o-mini)
- **Pydantic v2** for typed event payloads
- **W&B** for execution traces
- **Click** CLI
- **39 tests** (events, agents, simulation, E2E)

---

## Credits

- **Ralph Loop** by Geoffrey Huntley
- **MiroFish** by Guo Hangjiang - simulation inspiration
- **BettaFish** - sentiment analysis patterns
- **W&B** - execution tracing
- **oh-my-opencode** by Q
- **oh-my-claude-code** by Yeachan Heo
- **OpenClaw** by George Zhang

---

## Try It

```bash
# Clone and run
git clone https://github.com/ayushozha/ghost-board
cd ghost-board
pip install -r requirements.txt
export OPENAI_API_KEY="sk-..."

# Full demo
python main.py --demo

# Cached playback (no API key needed)
python main.py --cached

# Your own idea
python main.py "AI tutor for K-12 math"
```

**Built at Ralphthon SF 2026**
