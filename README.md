![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Tests](https://img.shields.io/badge/tests-68%20passed-brightgreen.svg)
![W&B](https://img.shields.io/badge/W%26B-enabled-yellow.svg)
![Agents](https://img.shields.io/badge/agents-1%2C000%2C050-purple.svg)
![Built at Ralphthon SF 2026](https://img.shields.io/badge/built%20at-Ralphthon%20SF%202026-ff69b4.svg)

# Ghost Board

Autonomous AI executive team that builds AND validates a startup in a single sprint.

```
CEO ──> Strategy ──> CTO (Codex prototype)
  |                  CFO (Financial model)
  |                  CMO (GTM & copy)
  |                  Legal (Compliance + citations)
  |
  |   BLOCKER? ──> CEO pivots ──> All agents rebuild
  |
  └──> Simulation (synthetic VCs, users, journalists, competitors)
       |
       └──> Market signal ──> CEO pivots again if needed ──> Final output
```

## Architecture

Two nested feedback loops:

**Inner loop:** Five AI agents (CEO, CTO, CFO, CMO, Legal) coordinate via an async event bus. When Legal flags a compliance blocker with real regulation citations, CEO pivots strategy, and the pivot cascades to all other agents.

**Outer loop:** After v1 artifacts are produced, CEO triggers a MiroFish-inspired market stress test. Synthetic stakeholders (VCs, early adopters, skeptics, journalists, competitors, regulators) react in a turn-based simulation. Their structured feedback flows back to CEO, who pivots again if needed.

```mermaid
flowchart TD
    A["Founder brief"] --> B["CEO Agent"]
    B --> C["STRATEGY_SET event"]
    C --> D["CTO: Codex prototype"]
    C --> E["CFO: Financial model"]
    C --> F["CMO: GTM copy"]
    C --> G["Legal: Compliance scan"]
    G -->|BLOCKER| B
    B -->|PIVOT| D
    B -->|PIVOT| E
    B -->|PIVOT| F
    D --> H["V1 Artifacts"]
    E --> H
    F --> H
    H --> I["Market Simulation"]
    I --> J["MarketSignal"]
    J --> B
    B --> K["Final Sprint Package + W&B Trace"]
```

## Quick Start

```bash
git clone https://github.com/ayushozha/ghost-board.git
cd ghost-board
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your OpenAI API key
python main.py "Your startup idea here"
```

### More Options

```bash
# Run demo (Anchrix fintech concept)
python main.py --demo

# Customize simulation scale
python main.py --personas 15 --rounds 5

# Skip simulation (build only)
python main.py --skip-simulation
```

## Screenshots

### Mission Control
![Mission Control](demo/screenshots/01_mission_control.png)

### The Boardroom
![Boardroom](demo/screenshots/02_boardroom.png)

### Market Arena
![Market Arena](demo/screenshots/03_market_arena.png)

### Pivot Timeline
![Pivot Timeline](demo/screenshots/04_pivot_timeline.png)

### Sprint Report
![Sprint Report](demo/screenshots/05_sprint_report.png)

## Running the Server

```bash
# Start the API server
python -m server.app
# or
uvicorn server.app:app --host 0.0.0.0 --port 8000 --reload

# In another terminal, start the React dashboard dev server
cd dashboard-react && npm run dev

# API: http://localhost:8000
# Dashboard: http://localhost:5173
```

### Docker

```bash
docker compose up --build
```

## Deployment (VPS)

Ghost Board deploys to a VPS behind nginx with a systemd-managed FastAPI service.

### Prerequisites

- SSH key at `~/.ssh/id_ed25519` with root access to the VPS (72.62.82.57)
- `rsync` installed locally
- A `.env` file on the VPS at `/opt/ghost-board/.env` containing at minimum:
  ```
  OPENAI_API_KEY=sk-...
  DATABASE_URL=postgresql+asyncpg://admin:PASSWORD@localhost:5433/ghost_board
  ```

### Deploy Commands

```bash
# Full deployment (sync code, install deps, configure systemd + nginx)
./scripts/deploy.sh

# Sync code only (fast redeploy)
./scripts/deploy.sh sync

# Restart the ghost-board service
./scripts/deploy.sh restart

# Check service and port status
./scripts/deploy.sh status

# Tail live server logs
./scripts/deploy.sh logs
```

### What the deploy script does

1. **Syncs code** to `/opt/ghost-board/` via rsync (excludes vendor/, node_modules/, .git/, outputs/, .env)
2. **Builds the React dashboard** locally before syncing (if npm is available)
3. **Creates a Python virtualenv** and installs dependencies at `/opt/ghost-board/.venv`
4. **Creates a systemd service** (`ghost-board.service`) running uvicorn on 127.0.0.1:8000 with 2 workers
5. **Configures nginx** as a reverse proxy on port 80 with WebSocket upgrade support

### Endpoints after deployment

| URL | Description |
|-----|-------------|
| `http://72.62.82.57/` | API root (FastAPI) |
| `http://72.62.82.57/docs` | Interactive API documentation |
| `http://72.62.82.57/dashboard/` | React dashboard |
| `http://72.62.82.57/ws/live/{run_id}` | WebSocket live event stream |
| `http://72.62.82.57/outputs/` | Browsable output artifacts |

### PostgreSQL

The VPS runs a shared PostgreSQL 17.7 instance in a Docker container (`projects-db`) on port 5433, bound to localhost. The Ghost Board service connects via the `DATABASE_URL` in `.env`. See `VPS.md` for full database connection details.

## Output

All artifacts are saved to `outputs/`:

| Directory | Contents |
|-----------|----------|
| `outputs/prototype/` | Generated Python code (via OpenAI Codex) |
| `outputs/financial_model/` | 3-year projections (JSON + Markdown) |
| `outputs/gtm/` | Landing page copy, launch plan |
| `outputs/compliance/` | Regulatory analysis with real citations |
| `outputs/trace.json` | Full event trace (W&B fallback) |
| `outputs/sprint_summary.json` | Final summary with costs |

## Event System

Agents communicate via typed events on an async pub/sub bus:

| Event | Source | Triggers |
|-------|--------|----------|
| `STRATEGY_SET` | CEO | All agents start building |
| `BLOCKER` | Legal | CEO evaluates pivot |
| `PIVOT` | CEO | All agents rebuild |
| `SIMULATION_RESULT` | Engine | CEO evaluates second pivot |
| `PROTOTYPE_READY` | CTO | Logged to trace |
| `FINANCIAL_MODEL_READY` | CFO | Logged to trace |
| `GTM_READY` | CMO | Logged to trace |

Every event has a `triggered_by` field linking it to its cause, creating a full causal chain visible in W&B or the JSON trace.

## Project Structure

```
ghost-board/
|-- main.py                # CLI entry point + 3-phase orchestration
|-- agents/
|   |-- base.py            # BaseAgent with LLM calls + W&B logging
|   |-- ceo.py             # Strategy, blocker handling, pivots
|   |-- cto.py             # Codex-powered prototype generation
|   |-- cfo.py             # Financial model generation
|   |-- cmo.py             # Positioning and GTM copy
|   └── legal.py           # Compliance with real citations
|-- coordination/
|   |-- events.py          # EventType enum + typed Pydantic payloads
|   |-- state.py           # Async pub/sub StateBus
|   └── trace.py           # W&B + JSON trace logger
|-- simulation/
|   |-- personas.py        # MarketPersona generator
|   |-- engine.py          # Turn-based social simulation
|   |-- analyzer.py        # Sentiment aggregation -> MarketSignal
|   └── mirofish_bridge.py # MiroFish/BettaFish bridge with fallback
|-- tests/
|   |-- test_events.py     # Event bus pub/sub tests
|   |-- test_agents.py     # Agent behavior tests (mocked LLM)
|   |-- test_simulation.py # Simulation tests
|   └── test_e2e.py        # Full cascade E2E test
|-- demo/
|   └── anchrix_concept.txt
|-- outputs/               # Runtime artifacts (gitignored)
└── vendor/                # MiroFish + BettaFish reference repos
```

## Tech Stack

- **Python 3.11+** with asyncio for agent coordination
- **OpenAI API** (gpt-4o for C-suite, gpt-4o-mini for simulation)
- **Pydantic** for typed event payloads
- **W&B** for execution traces (optional, graceful JSON fallback)
- **Click** for CLI
- **MiroFish bridge** with automatic fallback to local simulation

## Testing

```bash
python -m pytest tests/ -x --tb=short
```

68 tests covering:
- Event bus pub/sub mechanics (19 tests including edge cases)
- Agent behavior with mocked LLM responses (9 tests including max pivot, retry)
- Simulation personas, engine, and analyzer (7 tests)
- Full cascade E2E: strategy -> build -> blocker -> pivot -> rebuild (4 tests)
- API server endpoints, WebSocket streaming, and database integration (29 tests)

## Demo Concept

The included demo concept (`--demo` flag) is **Anchrix**: an AI-powered identity verification and compliance platform for fintech. It naturally creates legal blockers (money transmission, KYC/AML), pricing tradeoffs, and visible pivot cascades.

## Credits

- **[Ralph Loop](https://github.com/anthropics/claude-code)** by Geoffrey Huntley - Autonomous build loop technique
- **[MiroFish](https://github.com/666ghj/MiroFish)** by Guo Hangjiang - Social simulation architecture inspiration
- **[BettaFish](https://github.com/666ghj/BettaFish)** - Sentiment analysis patterns
- **[W&B](https://wandb.ai)** - Execution tracing and observability
- **[oh-my-opencode](https://github.com/nicepkg/oh-my-opencode)** by Q - Claude Code extensions
- **[oh-my-claude-code](https://github.com/nicepkg/oh-my-claude-code)** by Yeachan Heo - Claude Code plugins
- **[OpenClaw](https://github.com/nicepkg/OpenClaw)** by George Zhang - Agent orchestration patterns

## License

MIT

---

*Built at Ralphthon SF 2026*
