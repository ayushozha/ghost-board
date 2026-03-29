"""Ghost Board FastAPI Server.

Serves the REST API, WebSocket live event stream, and static dashboard files.
All sprint data is persisted to a database via SQLAlchemy (SQLite default,
PostgreSQL via DATABASE_URL env var).
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func, select

# asyncpg is optional — if not installed, all pg-pool operations are no-ops
try:
    import asyncpg  # type: ignore
    _ASYNCPG_AVAILABLE = True
except ImportError:
    asyncpg = None  # type: ignore[assignment]
    _ASYNCPG_AVAILABLE = False

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUTS_DIR = ROOT_DIR / "outputs"
DASHBOARD_DIR = ROOT_DIR / "dashboard"
REACT_DIST_DIR = ROOT_DIR / "dashboard-app" / "dist"

# Ensure project root is on sys.path so we can import main, agents, etc.
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from server.database import async_session_factory, create_tables, get_session
from server.models import (
    AgentArtifact,
    PersonaReaction,
    SimulationRun,
    SprintEvent,
    SprintRun,
)

# ---------------------------------------------------------------------------
# asyncpg direct PostgreSQL pool (supplemental, optional)
# ---------------------------------------------------------------------------

_PG_DSN = "postgresql://admin:i87RfJUBx5HZJuykZt4v9u3zaq10wAqV@127.0.0.1:5433/ghost_board"

_db_pool: Any = None  # asyncpg.Pool or None


async def init_db_pool() -> None:
    """Initialise the asyncpg connection pool and ensure sprint_runs table exists.

    Entirely optional — if PostgreSQL is unavailable or asyncpg is not
    installed, the pool stays None and every downstream call silently skips.
    """
    global _db_pool
    if not _ASYNCPG_AVAILABLE:
        return
    try:
        pool = await asyncpg.create_pool(
            dsn=_PG_DSN,
            min_size=1,
            max_size=5,
            command_timeout=10,
            timeout=5,
        )
        async with pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sprint_runs (
                    run_id TEXT PRIMARY KEY,
                    concept TEXT,
                    status TEXT DEFAULT 'running',
                    started_at TIMESTAMP DEFAULT NOW(),
                    model_config JSONB,
                    completed_at TIMESTAMP,
                    total_events INTEGER,
                    total_pivots INTEGER,
                    api_cost_usd FLOAT,
                    artifact_paths JSONB
                );
            """)
        _db_pool = pool
    except Exception:
        # PostgreSQL not reachable — continue without it
        _db_pool = None


async def _pg_insert_run(run_id: str, concept: str, model_config: Optional[dict] = None) -> None:
    """Insert a new sprint run row into PostgreSQL. No-op if pool unavailable."""
    if _db_pool is None:
        return
    try:
        async with _db_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO sprint_runs (run_id, concept, status, started_at, model_config)
                VALUES ($1, $2, 'running', NOW(), $3)
                ON CONFLICT (run_id) DO NOTHING;
                """,
                run_id,
                concept,
                json.dumps(model_config or {}),
            )
    except Exception:
        pass


async def _pg_complete_run(
    run_id: str,
    total_events: int,
    total_pivots: int,
    api_cost_usd: float,
    artifact_paths: Optional[list] = None,
) -> None:
    """Update sprint run to completed in PostgreSQL. No-op if pool unavailable."""
    if _db_pool is None:
        return
    try:
        async with _db_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE sprint_runs
                SET status = 'completed',
                    completed_at = NOW(),
                    total_events = $2,
                    total_pivots = $3,
                    api_cost_usd = $4,
                    artifact_paths = $5
                WHERE run_id = $1;
                """,
                run_id,
                total_events,
                total_pivots,
                api_cost_usd,
                json.dumps(artifact_paths or []),
            )
    except Exception:
        pass


async def _pg_fail_run(run_id: str) -> None:
    """Mark sprint run as failed in PostgreSQL. No-op if pool unavailable."""
    if _db_pool is None:
        return
    try:
        async with _db_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE sprint_runs
                SET status = 'failed', completed_at = NOW()
                WHERE run_id = $1;
                """,
                run_id,
            )
    except Exception:
        pass


async def _pg_list_runs() -> list[dict[str, Any]]:
    """Return all sprint_runs from PostgreSQL as dicts. Returns [] if unavailable."""
    if _db_pool is None:
        return []
    try:
        async with _db_pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM sprint_runs ORDER BY started_at DESC NULLS LAST;"
            )
            result = []
            for row in rows:
                d = dict(row)
                result.append({
                    "run_id": d.get("run_id"),
                    "id": d.get("run_id"),
                    "concept": d.get("concept") or "",
                    "sim_scale": "unknown",
                    "status": d.get("status") or "unknown",
                    "started_at": d["started_at"].isoformat() if d.get("started_at") else None,
                    "finished_at": d["completed_at"].isoformat() if d.get("completed_at") else None,
                    "completed_at": d["completed_at"].isoformat() if d.get("completed_at") else None,
                    "created_at": d["started_at"].isoformat() if d.get("started_at") else None,
                    "total_events": d.get("total_events") or 0,
                    "total_pivots": d.get("total_pivots") or 0,
                    "total_agents_simulated": 0,
                    "api_cost_usd": d.get("api_cost_usd") or 0.0,
                    "events": d.get("total_events") or 0,
                    "pivots": d.get("total_pivots") or 0,
                    "total_cost": d.get("api_cost_usd") or 0.0,
                    "wandb_url": None,
                    "_source": "pg_pool",
                })
            return result
    except Exception:
        return []


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------


class ConnectionManager:
    """Manages WebSocket connections per run_id for live event streaming."""

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, run_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(run_id, []).append(websocket)

    def disconnect(self, run_id: str, websocket: WebSocket) -> None:
        conns = self._connections.get(run_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self._connections.pop(run_id, None)

    async def broadcast(self, run_id: str, data: dict[str, Any]) -> None:
        """Send event data to all WebSocket clients watching a run."""
        conns = self._connections.get(run_id, [])
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(run_id, ws)


ws_manager = ConnectionManager()

# Active background sprint tasks
_running_sprints: dict[str, asyncio.Task] = {}

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class SprintRequest(BaseModel):
    concept: str = Field(..., min_length=1, max_length=1000)
    sim_scale: str = "demo"


class SprintResponse(BaseModel):
    run_id: str
    status: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dt_str(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _run_to_summary(run: SprintRun) -> dict[str, Any]:
    return {
        "run_id": run.id,
        "id": run.id,
        "concept": run.concept,
        "sim_scale": run.sim_scale or "demo",
        "status": run.status,
        "started_at": _dt_str(run.started_at),
        "finished_at": _dt_str(run.completed_at),
        "completed_at": _dt_str(run.completed_at),
        "created_at": _dt_str(run.created_at),
        "total_events": run.total_events,
        "total_pivots": run.total_pivots,
        "total_agents_simulated": run.total_agents_simulated,
        "api_cost_usd": run.api_cost_usd,
        "events": run.total_events,
        "pivots": run.total_pivots,
        "total_cost": run.api_cost_usd,
        "wandb_url": run.wandb_url,
    }


def _run_outputs_dir(run_id: str) -> Path:
    """Return the outputs directory for a given run.

    Completed runs are snapshotted to outputs/runs/<run_id>/ so the API can
    return stable artifacts even after newer runs overwrite outputs/.
    """
    run_dir = OUTPUTS_DIR / "runs" / run_id
    if run_dir.exists():
        return run_dir
    return OUTPUTS_DIR


def _has_run_snapshot(run_id: str) -> bool:
    """Return True when a completed run has an archived outputs snapshot."""
    return (OUTPUTS_DIR / "runs" / run_id).exists()


def _archive_run_outputs(run_id: str) -> Path:
    """Copy the current outputs/ tree into a stable per-run snapshot."""
    archive_dir = OUTPUTS_DIR / "runs" / run_id
    archive_dir.mkdir(parents=True, exist_ok=True)

    files_to_copy = (
        "trace.json",
        "sprint_summary.json",
        "sprint_report.md",
        "board_discussion.json",
        "simulation_results.json",
        "simulation_geo.json",
    )
    dirs_to_copy = (
        "prototype",
        "financial_model",
        "gtm",
        "compliance",
    )

    for file_name in files_to_copy:
        src = OUTPUTS_DIR / file_name
        if src.exists() and src.is_file():
            shutil.copy2(src, archive_dir / file_name)

    for dir_name in dirs_to_copy:
        src_dir = OUTPUTS_DIR / dir_name
        dst_dir = archive_dir / dir_name
        if src_dir.exists() and src_dir.is_dir():
            shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True)

    return archive_dir


def _read_json_file(path: Path) -> Any:
    """Read a JSON file and return its parsed content, or None."""
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
    return None


def _list_artifact_files(base: Path) -> list[dict]:
    """Recursively list artifact files under a directory."""
    results: list[dict] = []
    if not base.exists():
        return results
    for p in sorted(base.rglob("*")):
        if p.is_file() and not p.name.startswith("."):
            results.append({
                "path": str(p.relative_to(OUTPUTS_DIR)),
                "name": p.name,
                "size": p.stat().st_size,
            })
    return results


async def _verify_run_exists(run_id: str) -> bool:
    """Return True if run_id is 'latest' or exists in the database."""
    if run_id == "latest":
        return True
    async with get_session() as session:
        result = await session.execute(
            select(func.count(SprintRun.id)).where(SprintRun.id == run_id)
        )
        count = result.scalar() or 0
        return count > 0


# ---------------------------------------------------------------------------
# Background sprint runner
# ---------------------------------------------------------------------------


async def _run_sprint_background(run_id: str, concept: str, sim_scale: str) -> None:
    """Run the full sprint in the background, persisting results to DB.

    Hooks into the StateBus so every agent event is broadcast to WebSocket
    clients in real-time as it happens (not just after the sprint finishes).
    """
    try:
        # Give the client a brief window to attach its WebSocket right after
        # the POST /api/sprint response returns.
        await asyncio.sleep(0.25)

        # Update status to running
        async with get_session() as session:
            result = await session.execute(
                select(SprintRun).where(SprintRun.id == run_id)
            )
            run = result.scalar_one_or_none()
            if run:
                run.status = "running"
                run.started_at = datetime.now(timezone.utc)

        await ws_manager.broadcast(run_id, {"type": "status", "status": "running"})

        # Broadcast initial agent statuses
        for agent_name in ("CEO", "CTO", "CFO", "CMO", "Legal"):
            await ws_manager.broadcast(run_id, {
                "type": "agent_status",
                "agent": agent_name,
                "status": "idle",
            })

        # Change cwd to project root so relative paths work
        original_cwd = os.getcwd()
        os.chdir(str(ROOT_DIR))

        try:
            from main import run_sprint
            from coordination.state import StateBus
            server_loop = asyncio.get_running_loop()

            # ----------------------------------------------------------
            # Monkey-patch StateBus so ANY instance created by run_sprint
            # automatically broadcasts events to WebSocket clients.
            # ----------------------------------------------------------
            _original_init = StateBus.__init__

            async def _forward_bus_event(event: Any) -> None:
                """Forward every StateBus event to WebSocket clients."""
                try:
                    if hasattr(event, "to_trace_dict"):
                        event_data = event.to_trace_dict()
                    else:
                        event_data = str(event)

                    # Broadcast the event itself
                    await ws_manager.broadcast(run_id, {
                        "type": "event",
                        "data": event_data,
                        "event": {
                            "id": getattr(event, "id", ""),
                            "source_agent": getattr(event, "source", "unknown"),
                            "event_type": event_data.get("event_type", "UPDATE") if isinstance(event_data, dict) else "UPDATE",
                            "payload": event_data.get("payload", {}) if isinstance(event_data, dict) else {},
                            "triggered_by": getattr(event, "triggered_by", None),
                            "iteration": getattr(event, "iteration", 1),
                        },
                    })

                    # Broadcast agent status change based on event type
                    source = getattr(event, "source", None)
                    etype = ""
                    if hasattr(event, "type"):
                        etype = event.type.value if hasattr(event.type, "value") else str(event.type)

                    if source:
                        if etype in ("STRATEGY_SET", "PIVOT"):
                            status = "thinking"
                        elif etype == "BLOCKER":
                            status = "blocked"
                        elif etype in (
                            "UPDATE", "PROTOTYPE_READY",
                            "FINANCIAL_MODEL_READY", "GTM_READY",
                            "COMPLIANCE_REPORT_READY",
                        ):
                            status = "building"
                        elif etype in ("SIMULATION_RESULT", "SIMULATION_ROUND", "SIMULATION_START"):
                            status = "analyzing"
                        else:
                            status = "active"
                        await ws_manager.broadcast(run_id, {
                            "type": "agent_status",
                            "agent": source,
                            "status": status,
                        })
                except Exception:
                    pass  # Never let broadcast errors kill the sprint

            def _patched_init(self_bus: Any, *args: Any, **kwargs: Any) -> None:
                _original_init(self_bus, *args, **kwargs)

                async def _ws_broadcast_hook(event: Any) -> None:
                    future = asyncio.run_coroutine_threadsafe(
                        _forward_bus_event(event),
                        server_loop,
                    )
                    await asyncio.wrap_future(future)

                self_bus.subscribe_all(_ws_broadcast_hook)

            StateBus.__init__ = _patched_init  # type: ignore[assignment]

            try:
                async def _simulation_progress(event_type: str, payload: dict[str, Any]) -> None:
                    """Forward detailed simulation updates to live dashboard clients."""
                    if event_type == "simulation_start":
                        await ws_manager.broadcast(run_id, {
                            "type": "phase",
                            "phase": "simulation",
                            "message": "Phase 2: Market Simulation",
                        })
                    await ws_manager.broadcast(run_id, {
                        "type": event_type,
                        "payload": payload,
                    })

                # Determine scale params
                scale_map = {
                    "demo": (10, 3),
                    "standard": (30, 5),
                    "large": (50, 5),
                    "million": (50, 5),
                }
                personas, rounds = scale_map.get(sim_scale, (10, 3))

                # Broadcast phase start
                await ws_manager.broadcast(run_id, {
                    "type": "phase",
                    "phase": "strategy_build",
                    "message": "Phase 1: Strategy + Build",
                })
                await ws_manager.broadcast(run_id, {
                    "type": "agent_status",
                    "agent": "CEO",
                    "status": "thinking",
                })

                async def _simulation_progress_bridge(event_type: str, payload: dict[str, Any]) -> None:
                    future = asyncio.run_coroutine_threadsafe(
                        _simulation_progress(event_type, payload),
                        server_loop,
                    )
                    await asyncio.wrap_future(future)

                def _run_sprint_sync() -> dict[str, Any]:
                    return asyncio.run(
                        run_sprint(
                            startup_idea=concept,
                            num_personas=personas,
                            num_rounds=rounds,
                            skip_simulation=False,
                            sim_scale=sim_scale if sim_scale in ("demo", "standard", "large", "million") else None,
                            simulation_progress_callback=_simulation_progress_bridge,
                        )
                    )

                sprint_result = await asyncio.to_thread(_run_sprint_sync)
            finally:
                # Always restore the original StateBus.__init__
                StateBus.__init__ = _original_init  # type: ignore[assignment]
        finally:
            os.chdir(original_cwd)

        archive_dir = _archive_run_outputs(run_id)

        # Persist events to database
        # run_sprint() returns "trace" (list of event dicts) and "events" (int count).
        # Prefer the actual trace list; fall back to reading trace.json from disk.
        trace_events = sprint_result.get("trace", [])
        if not isinstance(trace_events, list) or not trace_events:
            trace_data = _read_json_file(archive_dir / "trace.json")
            trace_events = trace_data if isinstance(trace_data, list) else []

        pivots = 0
        total_agents = sprint_result.get("total_agents_simulated", 0)
        api_cost = sprint_result.get("total_cost", sprint_result.get("api_cost_usd", 0.0))
        wandb_url_val = sprint_result.get("wandb_url")

        async with get_session() as session:
            for evt in trace_events:
                if not isinstance(evt, dict):
                    continue

                payload_data = evt.get("payload", {})
                if isinstance(payload_data, str):
                    payload_json = payload_data
                else:
                    payload_json = json.dumps(payload_data, default=str)

                event_type = evt.get("event_type", evt.get("type", "UPDATE"))
                if event_type == "PIVOT":
                    pivots += 1

                db_event = SprintEvent(
                    id=evt.get("event_id", evt.get("id", str(uuid.uuid4()))),
                    run_id=run_id,
                    source_agent=evt.get("source", evt.get("source_agent", "unknown")),
                    event_type=event_type,
                    target_agent=evt.get("target_agent"),
                    payload_json=payload_json,
                    triggered_by=evt.get("triggered_by") or None,
                    iteration=evt.get("iteration", 1),
                )
                session.add(db_event)

                # NOTE: We do NOT re-broadcast events here because
                # the _ws_broadcast_hook on StateBus already sent each
                # event to WebSocket clients in real-time as it happened.
                # Re-broadcasting would cause duplicate events on the client.

            # Persist artifacts from output directories
            artifact_dirs = {
                "prototype": "CTO",
                "financial_model": "CFO",
                "gtm": "CMO",
                "compliance": "Legal",
            }
            for artifact_type, agent_name in artifact_dirs.items():
                art_dir = archive_dir / artifact_type
                if art_dir.is_dir():
                    for fpath in art_dir.iterdir():
                        if fpath.is_file() and not fpath.name.startswith("."):
                            try:
                                preview = fpath.read_text(encoding="utf-8", errors="replace")[:200]
                            except Exception:
                                preview = ""
                            db_artifact = AgentArtifact(
                                run_id=run_id,
                                agent_name=agent_name,
                                artifact_type=artifact_type,
                                file_path=str(fpath.relative_to(ROOT_DIR)),
                                content_preview=preview,
                            )
                            session.add(db_artifact)

            # Persist simulation data
            sim_results_path = archive_dir / "simulation_results.json"
            sim_geo_path = archive_dir / "simulation_geo.json"
            sim_id: Optional[str] = None

            if sim_results_path.exists():
                try:
                    sim_data = json.loads(sim_results_path.read_text(encoding="utf-8"))
                    if isinstance(sim_data, dict):
                        db_sim = SimulationRun(
                            sprint_run_id=run_id,
                            llm_agents=sim_data.get("llm_agents", 0),
                            lightweight_agents=sim_data.get("lightweight_agents", 0),
                            rounds=sim_data.get("rounds", 0),
                            duration_seconds=sim_data.get("duration_seconds", 0.0),
                            overall_sentiment=sim_data.get("overall_sentiment", 0.0),
                        )
                        session.add(db_sim)
                        await session.flush()  # Get the sim id
                        sim_id = db_sim.id

                        if total_agents == 0:
                            total_agents = sim_data.get("llm_agents", 0) + sim_data.get("lightweight_agents", 0)

                        # Persist persona reactions from geo data
                        if sim_geo_path.exists() and sim_id:
                            geo_data = json.loads(sim_geo_path.read_text(encoding="utf-8"))
                            personas = geo_data if isinstance(geo_data, list) else geo_data.get("personas", [])
                            for p in personas[:500]:  # cap to avoid bloat
                                if not isinstance(p, dict):
                                    continue
                                reaction = PersonaReaction(
                                    simulation_run_id=sim_id,
                                    round_num=p.get("round", 1),
                                    persona_name=p.get("name", "unknown"),
                                    archetype=p.get("archetype", "unknown"),
                                    lat=p.get("lat"),
                                    lng=p.get("lng"),
                                    content=p.get("content", ""),
                                    stance=p.get("stance", 0.0),
                                    references_json=json.dumps(p.get("references", []), default=str),
                                )
                                session.add(reaction)
                except Exception:
                    pass  # Non-critical

            # Update the run record
            result = await session.execute(
                select(SprintRun).where(SprintRun.id == run_id)
            )
            run_obj = result.scalar_one_or_none()
            if run_obj:
                run_obj.status = "completed"
                run_obj.completed_at = datetime.now(timezone.utc)
                run_obj.total_events = len(trace_events)
                run_obj.total_pivots = pivots
                run_obj.total_agents_simulated = total_agents
                run_obj.api_cost_usd = api_cost or 0.0
                run_obj.wandb_url = wandb_url_val

        # Also persist completion to asyncpg pool (no-op if pool unavailable)
        await _pg_complete_run(
            run_id,
            total_events=len(trace_events),
            total_pivots=pivots,
            api_cost_usd=api_cost or 0.0,
            artifact_paths=list(artifact_dirs.keys()),
        )

        # Broadcast completion
        await ws_manager.broadcast(run_id, {
            "type": "status",
            "status": "completed",
            "result": {
                "events": len(trace_events),
                "pivots": pivots,
                "total_cost": api_cost or 0.0,
            },
        })

    except Exception as exc:
        # Mark as failed
        async with get_session() as session:
            result = await session.execute(
                select(SprintRun).where(SprintRun.id == run_id)
            )
            run_obj = result.scalar_one_or_none()
            if run_obj:
                run_obj.status = "failed"
                run_obj.completed_at = datetime.now(timezone.utc)

        # Also mark failed in asyncpg pool (no-op if pool unavailable)
        await _pg_fail_run(run_id)

        await ws_manager.broadcast(run_id, {
            "type": "status",
            "status": "failed",
            "error": str(exc),
        })
    finally:
        _running_sprints.pop(run_id, None)


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup and initialise asyncpg pool."""
    await create_tables()
    await init_db_pool()
    yield
    # Close asyncpg pool on shutdown
    global _db_pool
    if _db_pool is not None:
        try:
            await _db_pool.close()
        except Exception:
            pass
        _db_pool = None


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Ghost Board API",
    description="Autonomous AI executive team that builds and validates a startup.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------


@app.post("/api/sprint", response_model=SprintResponse)
async def start_sprint(req: SprintRequest) -> SprintResponse:
    """Start a new sprint in the background. Returns a run_id to track progress."""
    run_id = str(uuid.uuid4())

    async with get_session() as session:
        run = SprintRun(
            id=run_id,
            concept=req.concept,
            status="pending",
            sim_scale=req.sim_scale,
        )
        session.add(run)

    # Also persist to asyncpg pool (no-op if pool unavailable)
    await _pg_insert_run(run_id, req.concept, {"sim_scale": req.sim_scale})

    # Launch background task
    task = asyncio.create_task(
        _run_sprint_background(run_id, req.concept, req.sim_scale)
    )
    _running_sprints[run_id] = task

    return SprintResponse(run_id=run_id, status="pending")


@app.get("/api/runs")
async def list_runs() -> dict[str, Any]:
    """List all sprint runs, most recent first."""
    async with get_session() as session:
        result = await session.execute(
            select(SprintRun).order_by(SprintRun.created_at.desc())
        )
        runs = result.scalars().all()
        run_list = [_run_to_summary(r) for r in runs]

    # Merge in runs from asyncpg pool that are not already in the ORM results
    pg_runs = await _pg_list_runs()
    orm_run_ids = {r["run_id"] for r in run_list}
    for pg_run in pg_runs:
        if pg_run["run_id"] not in orm_run_ids:
            pg_run.pop("_source", None)
            run_list.append(pg_run)

    # Always include a file-based "latest" entry when outputs/trace.json exists.
    # This ensures the dashboard can show real data even when DB runs are stale
    # or empty (e.g. test entries with 0 events).
    if (OUTPUTS_DIR / "trace.json").exists():
        summary = _read_json_file(OUTPUTS_DIR / "sprint_summary.json") or {}
        sim_results = _read_json_file(OUTPUTS_DIR / "simulation_results.json")
        total_agents_sim = 0
        if isinstance(sim_results, dict):
            total_agents_sim = sim_results.get("total_agents", 0)
        trace_data = _read_json_file(OUTPUTS_DIR / "trace.json")
        trace_event_count = len(trace_data) if isinstance(trace_data, list) else summary.get("events", 0)
        pivot_count = summary.get("pivots", 0)
        if isinstance(trace_data, list) and pivot_count == 0:
            pivot_count = sum(1 for e in trace_data if isinstance(e, dict) and e.get("event_type") == "PIVOT")
        latest_entry = {
            "run_id": "latest",
            "id": "latest",
            "concept": summary.get("concept") or "Latest Sprint (from outputs/)",
            "sim_scale": "unknown",
            "status": "completed",
            "started_at": None,
            "finished_at": None,
            "completed_at": None,
            "created_at": None,
            "total_events": trace_event_count,
            "total_pivots": pivot_count,
            "total_agents_simulated": total_agents_sim,
            "api_cost_usd": summary.get("total_cost", 0.0),
            "events": trace_event_count,
            "pivots": pivot_count,
            "total_cost": summary.get("total_cost", 0.0),
            "wandb_url": summary.get("wandb_url"),
        }
        # Insert at the beginning so the file-based run shows first
        run_list.insert(0, latest_entry)

    return {"runs": run_list}


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    """Get full details for a specific sprint run."""
    # Handle "latest" virtual run
    if run_id == "latest":
        summary = _read_json_file(OUTPUTS_DIR / "sprint_summary.json") or {}
        trace_data = _read_json_file(OUTPUTS_DIR / "trace.json")
        trace_event_count = len(trace_data) if isinstance(trace_data, list) else summary.get("events", 0)
        pivot_count = summary.get("pivots", 0)
        if isinstance(trace_data, list) and pivot_count == 0:
            pivot_count = sum(1 for e in trace_data if isinstance(e, dict) and e.get("event_type") == "PIVOT")

        # Count artifact files from filesystem
        artifact_count = 0
        for folder in ("prototype", "financial_model", "gtm", "compliance"):
            artifact_count += len(_list_artifact_files(OUTPUTS_DIR / folder))

        # Build simulation summary from file
        sim_results = _read_json_file(OUTPUTS_DIR / "simulation_results.json")
        simulations = []
        if isinstance(sim_results, dict):
            simulations.append({
                "id": "latest-sim",
                "llm_agents": sim_results.get("total_llm_agents", 0),
                "lightweight_agents": sim_results.get("total_lightweight_agents", 0),
                "rounds": sim_results.get("rounds", 0),
                "duration_seconds": sim_results.get("duration_seconds", 0.0),
                "overall_sentiment": (sim_results.get("final_signal") or {}).get("overall_sentiment", 0.0)
                    if isinstance(sim_results.get("final_signal"), dict) else 0.0,
            })

        total_agents_sim = sim_results.get("total_agents", 0) if isinstance(sim_results, dict) else 0

        return {
            "run_id": "latest",
            "id": "latest",
            "concept": summary.get("concept") or "Latest Sprint (from outputs/)",
            "status": "completed",
            "started_at": None,
            "finished_at": None,
            "completed_at": None,
            "created_at": None,
            "total_events": trace_event_count,
            "total_pivots": pivot_count,
            "total_agents_simulated": total_agents_sim,
            "api_cost_usd": summary.get("total_cost", 0.0),
            "total_cost": summary.get("total_cost", 0.0),
            "wandb_url": summary.get("wandb_url"),
            "events_count": trace_event_count,
            "artifacts_count": artifact_count,
            "simulations": simulations,
        }

    async with get_session() as session:
        result = await session.execute(
            select(SprintRun).where(SprintRun.id == run_id)
        )
        run = result.scalar_one_or_none()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")

        detail = _run_to_summary(run)

        # Count events
        evt_result = await session.execute(
            select(func.count(SprintEvent.id)).where(SprintEvent.run_id == run_id)
        )
        detail["events_count"] = evt_result.scalar() or 0

        # Count artifacts
        art_result = await session.execute(
            select(func.count(AgentArtifact.id)).where(AgentArtifact.run_id == run_id)
        )
        detail["artifacts_count"] = art_result.scalar() or 0

        # Include simulation summaries
        sim_result = await session.execute(
            select(SimulationRun).where(SimulationRun.sprint_run_id == run_id)
        )
        sims = sim_result.scalars().all()
        detail["simulations"] = [
            {
                "id": s.id,
                "llm_agents": s.llm_agents,
                "lightweight_agents": s.lightweight_agents,
                "rounds": s.rounds,
                "duration_seconds": s.duration_seconds,
                "overall_sentiment": s.overall_sentiment,
            }
            for s in sims
        ]

        return detail


@app.get("/api/runs/{run_id}/trace")
async def get_trace(run_id: str) -> dict[str, Any]:
    """Return trace events for a run. Checks DB first, falls back to trace.json."""
    # Handle "latest" virtual run
    if run_id == "latest":
        trace = _read_json_file(OUTPUTS_DIR / "trace.json")
        if trace is None:
            return JSONResponse({"error": "trace.json not found"}, status_code=404)
        return {"trace": trace}

    # Verify run exists in DB
    if not await _verify_run_exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")

    async with get_session() as session:
        result = await session.execute(
            select(SprintEvent)
            .where(SprintEvent.run_id == run_id)
            .order_by(SprintEvent.timestamp)
        )
        events = result.scalars().all()

        if events:
            trace = []
            for e in events:
                try:
                    payload = json.loads(e.payload_json) if e.payload_json else {}
                except json.JSONDecodeError:
                    payload = {}

                trace.append({
                    "event_id": e.id,
                    "id": e.id,
                    "timestamp": _dt_str(e.timestamp),
                    "source": e.source_agent,
                    "source_agent": e.source_agent,
                    "event_type": e.event_type,
                    "target_agent": e.target_agent,
                    "payload": payload,
                    "triggered_by": e.triggered_by,
                    "iteration": e.iteration,
                })
            return {"trace": trace}

    # Completed runs may have an archived snapshot; otherwise return an empty
    # trace so we do not leak stale shared outputs from a different run.
    if _has_run_snapshot(run_id):
        trace = _read_json_file(_run_outputs_dir(run_id) / "trace.json")
        if isinstance(trace, list):
            return {"trace": trace}

    return {"trace": []}


@app.get("/api/runs/{run_id}/artifacts")
async def get_artifacts(run_id: str) -> dict[str, Any]:
    """Return all artifacts for a run. Checks DB first, falls back to filesystem."""
    if run_id == "latest":
        # Fallback: list files from filesystem for "latest"
        artifacts: list[dict] = []
        for folder in ("prototype", "financial_model", "gtm", "compliance"):
            folder_path = OUTPUTS_DIR / folder
            artifacts.extend(_list_artifact_files(folder_path))
        return {"artifacts": artifacts}

    # Verify run exists in DB
    if not await _verify_run_exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")

    async with get_session() as session:
        result = await session.execute(
            select(AgentArtifact)
            .where(AgentArtifact.run_id == run_id)
            .order_by(AgentArtifact.created_at)
        )
        db_artifacts = result.scalars().all()

        if db_artifacts:
            return {
                "artifacts": [
                    {
                        "id": a.id,
                        "agent_name": a.agent_name,
                        "artifact_type": a.artifact_type,
                        "file_path": a.file_path,
                        "path": a.file_path,
                        "name": Path(a.file_path).name,
                        "content_preview": a.content_preview,
                        "created_at": _dt_str(a.created_at),
                    }
                    for a in db_artifacts
                ]
            }

    if _has_run_snapshot(run_id):
        artifacts = []
        out = _run_outputs_dir(run_id)
        for folder in ("prototype", "financial_model", "gtm", "compliance"):
            artifacts.extend(_list_artifact_files(out / folder))
        return {"artifacts": artifacts}

    return {"artifacts": []}


@app.get("/api/runs/{run_id}/board-discussion")
async def get_board_discussion(run_id: str) -> Any:
    """Return board_discussion.json content."""
    # Verify run exists (latest or in DB)
    if not await _verify_run_exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")

    if run_id != "latest" and not _has_run_snapshot(run_id):
        return {"discussion": []}

    out = _run_outputs_dir(run_id)
    discussion = _read_json_file(out / "board_discussion.json")
    if discussion is None:
        return {"discussion": []}
    return {"discussion": discussion}


@app.get("/api/runs/{run_id}/simulation")
async def get_simulation(run_id: str) -> dict[str, Any]:
    """Return simulation data. Checks DB first, falls back to JSON files."""
    # Verify run exists (latest or in DB)
    if not await _verify_run_exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")

    out = _run_outputs_dir(run_id)
    use_snapshot = run_id == "latest" or _has_run_snapshot(run_id)
    file_results = _read_json_file(out / "simulation_results.json") if use_snapshot else None
    file_geo = _read_json_file(out / "simulation_geo.json") if use_snapshot else None

    if run_id != "latest":
        async with get_session() as session:
            sim_result = await session.execute(
                select(SimulationRun).where(SimulationRun.sprint_run_id == run_id)
            )
            sim = sim_result.scalar_one_or_none()

            if sim:
                reaction_result = await session.execute(
                    select(PersonaReaction)
                    .where(PersonaReaction.simulation_run_id == sim.id)
                    .order_by(PersonaReaction.round_num, PersonaReaction.persona_name)
                )
                reactions = reaction_result.scalars().all()

                return {
                    "results": file_results or {
                        "id": sim.id,
                        "llm_agents": sim.llm_agents,
                        "lightweight_agents": sim.lightweight_agents,
                        "rounds": sim.rounds,
                        "duration_seconds": sim.duration_seconds,
                        "overall_sentiment": sim.overall_sentiment,
                    },
                    "geo": file_geo or [
                        {
                            "id": r.id,
                            "round": r.round_num,
                            "name": r.persona_name,
                            "archetype": r.archetype,
                            "lat": r.lat,
                            "lng": r.lng,
                            "content": r.content,
                            "stance": r.stance,
                            "references": json.loads(r.references_json) if r.references_json else [],
                        }
                        for r in reactions
                    ],
                }

    # Fallback: read from JSON files (for "latest" or DB run without sim data)
    return {"results": file_results, "geo": file_geo or []}


@app.get("/api/stats")
async def get_stats() -> dict[str, Any]:
    """Return aggregate statistics across all runs."""
    async with get_session() as session:
        # Total runs
        total_runs_result = await session.execute(select(func.count(SprintRun.id)))
        total_runs = total_runs_result.scalar() or 0

        # Total agents simulated
        total_agents_result = await session.execute(
            select(func.coalesce(func.sum(SprintRun.total_agents_simulated), 0))
        )
        total_agents = total_agents_result.scalar() or 0

        # Total pivots
        total_pivots_result = await session.execute(
            select(func.coalesce(func.sum(SprintRun.total_pivots), 0))
        )
        total_pivots = total_pivots_result.scalar() or 0

        # Average cost
        avg_cost_result = await session.execute(
            select(func.coalesce(func.avg(SprintRun.api_cost_usd), 0.0))
        )
        avg_cost = avg_cost_result.scalar() or 0.0

        # Total cost
        total_cost_result = await session.execute(
            select(func.coalesce(func.sum(SprintRun.api_cost_usd), 0.0))
        )
        total_cost = total_cost_result.scalar() or 0.0

    # Enrich stats from output files when DB has no meaningful data.
    # This covers the case where DB has stale test runs with all-zero stats.
    has_meaningful_db_data = (int(total_agents) > 0 or float(total_cost) > 0 or int(total_pivots) > 0)
    if not has_meaningful_db_data and (OUTPUTS_DIR / "trace.json").exists():
        if total_runs == 0:
            total_runs = 1
        summary = _read_json_file(OUTPUTS_DIR / "sprint_summary.json")
        if summary:
            total_cost = summary.get("total_cost", 0.0)
            total_pivots = summary.get("pivots", 0)
        sim_results = _read_json_file(OUTPUTS_DIR / "simulation_results.json")
        if sim_results and isinstance(sim_results, dict):
            total_agents = sim_results.get("total_agents", total_agents)
        # Count events from trace.json
        trace_data = _read_json_file(OUTPUTS_DIR / "trace.json")
        total_events = len(trace_data) if isinstance(trace_data, list) else 0
        # Count pivots from trace if summary didn't have them
        if int(total_pivots) == 0 and isinstance(trace_data, list):
            total_pivots = sum(1 for e in trace_data if isinstance(e, dict) and e.get("event_type") == "PIVOT")
        avg_cost = total_cost / max(total_runs, 1)

    # Total events across runs (from DB or file)
    total_events_val = 0
    if has_meaningful_db_data:
        async with get_session() as session:
            evt_count_result = await session.execute(
                select(func.coalesce(func.sum(SprintRun.total_events), 0))
            )
            total_events_val = evt_count_result.scalar() or 0
    elif (OUTPUTS_DIR / "trace.json").exists():
        trace_data = _read_json_file(OUTPUTS_DIR / "trace.json")
        total_events_val = len(trace_data) if isinstance(trace_data, list) else 0

    return {
        "total_runs": total_runs,
        "total_agents": int(total_agents),
        "total_agents_simulated": int(total_agents),
        "total_pivots": int(total_pivots),
        "total_events": int(total_events_val),
        "avg_cost": round(float(avg_cost), 4),
        "total_cost": round(float(total_cost), 4),
    }


@app.get("/api/runs/{run_id}/sprint-report")
async def get_sprint_report(run_id: str) -> Any:
    """Return the sprint_report.md content."""
    # Verify run exists (latest or in DB)
    if not await _verify_run_exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")

    if run_id != "latest" and not _has_run_snapshot(run_id):
        return JSONResponse({"error": "sprint_report.md not found"}, status_code=404)

    out = _run_outputs_dir(run_id)
    report_path = out / "sprint_report.md"
    if report_path.exists():
        return {"report": report_path.read_text(encoding="utf-8")}
    return JSONResponse({"error": "sprint_report.md not found"}, status_code=404)


@app.get("/api/runs/{run_id}/summary")
async def get_summary(run_id: str) -> Any:
    """Return sprint_summary.json content."""
    # Verify run exists (latest or in DB)
    if not await _verify_run_exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")

    if run_id != "latest" and not _has_run_snapshot(run_id):
        return JSONResponse({"error": "sprint_summary.json not found"}, status_code=404)

    out = _run_outputs_dir(run_id)
    summary = _read_json_file(out / "sprint_summary.json")
    if summary is None:
        return JSONResponse({"error": "sprint_summary.json not found"}, status_code=404)
    return {"summary": summary}


@app.get("/api/runs/{run_id}/cost")
async def get_cost(run_id: str) -> dict[str, Any]:
    """Return token-usage and cost breakdown for a run.

    Reads from outputs/runs/{run_id}/cost.json (or outputs/cost.json for
    'latest').  Falls back to the api_cost_usd stored in the DB run record.
    Returns zeros with an 'error' key when no cost data is available.
    """
    if not await _verify_run_exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")

    # Try the per-run cost file first
    out = _run_outputs_dir(run_id)
    cost_data = _read_json_file(out / "cost.json")
    if isinstance(cost_data, dict):
        cost_data.setdefault("run_id", run_id)
        return cost_data

    # Fall back to DB api_cost_usd for a real run_id
    if run_id != "latest":
        async with get_session() as session:
            result = await session.execute(
                select(SprintRun).where(SprintRun.id == run_id)
            )
            run = result.scalar_one_or_none()
            if run and run.api_cost_usd:
                return {
                    "run_id": run_id,
                    "total_tokens": 0,
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "estimated_cost_usd": float(run.api_cost_usd),
                    "model_breakdown": {},
                }

    # Also check the shared outputs/sprint_summary.json for 'latest'
    summary = _read_json_file(OUTPUTS_DIR / "sprint_summary.json")
    if isinstance(summary, dict) and summary.get("total_cost"):
        return {
            "run_id": run_id,
            "total_tokens": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "estimated_cost_usd": float(summary["total_cost"]),
            "model_breakdown": {},
        }

    return {
        "run_id": run_id,
        "total_tokens": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "estimated_cost_usd": 0.0,
        "model_breakdown": {},
        "error": "no cost data",
    }


@app.get("/api/runs/{run_id}/wandb")
async def get_wandb(run_id: str) -> dict[str, Any]:
    """Return the W&B run URL for a sprint run, or null if unavailable."""
    if not await _verify_run_exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")

    # Check DB run record first
    if run_id != "latest":
        async with get_session() as session:
            result = await session.execute(
                select(SprintRun).where(SprintRun.id == run_id)
            )
            run = result.scalar_one_or_none()
            if run and run.wandb_url:
                return {"url": run.wandb_url}

    # Fall back to the persisted URL file (written by TraceLogger)
    out = _run_outputs_dir(run_id)
    url_file = out / "wandb_url.txt"
    if url_file.exists():
        try:
            url = url_file.read_text(encoding="utf-8").strip()
            if url:
                return {"url": url}
        except OSError:
            pass

    # Also check the sprint_summary.json which records wandb_url
    summary = _read_json_file(OUTPUTS_DIR / "sprint_summary.json")
    if isinstance(summary, dict) and summary.get("wandb_url"):
        return {"url": summary["wandb_url"]}

    return {"url": None}


@app.get("/api/concepts")
async def list_concepts():
    """List available demo concepts from demo/*.txt files."""
    concepts_dir = Path(__file__).parent.parent / "demo"
    concepts = []
    for f in sorted(concepts_dir.glob("*_concept.txt")):
        name = f.stem.replace("_concept", "")
        content = f.read_text(encoding="utf-8").strip()
        concepts.append({
            "name": name,
            "file": str(f.name),
            "preview": content[:120] + ("..." if len(content) > 120 else ""),
            "full_text": content,
        })
    return {"concepts": concepts}


# ---------------------------------------------------------------------------
# WebSocket for live event streaming
# ---------------------------------------------------------------------------


@app.websocket("/ws/live/{run_id}")
async def websocket_live(websocket: WebSocket, run_id: str) -> None:
    """Stream live sprint events to connected clients."""
    await ws_manager.connect(run_id, websocket)
    try:
        # Send current run status immediately
        try:
            async with get_session() as session:
                result = await session.execute(
                    select(SprintRun).where(SprintRun.id == run_id)
                )
                run = result.scalar_one_or_none()
                if run:
                    await websocket.send_json({
                        "type": "initial_state",
                        "run": _run_to_summary(run),
                    })
                else:
                    await websocket.send_json({
                        "type": "status",
                        "status": "unknown",
                        "message": "Run not found",
                    })
        except Exception:
            # Database may be locked (SQLite) or unavailable — still
            # allow the WebSocket to function for live event streaming.
            await websocket.send_json({
                "type": "status",
                "status": "unknown",
                "message": "Run lookup unavailable",
            })

        # Keep connection alive, listening for client messages
        while True:
            try:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except WebSocketDisconnect:
                break
    finally:
        ws_manager.disconnect(run_id, websocket)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "ghost-board-api"}


# ---------------------------------------------------------------------------
# Serve artifact files directly
# ---------------------------------------------------------------------------


@app.get("/api/artifacts/{file_path:path}")
async def serve_artifact(file_path: str) -> Any:
    """Serve a specific artifact file from outputs/.

    Validates that the resolved path stays within OUTPUTS_DIR to
    prevent path-traversal attacks.
    """
    full_path = (OUTPUTS_DIR / file_path).resolve()
    try:
        full_path.relative_to(OUTPUTS_DIR.resolve())
    except ValueError:
        return JSONResponse({"error": "Access denied"}, status_code=403)
    if full_path.exists() and full_path.is_file():
        return FileResponse(full_path)
    return JSONResponse({"error": "File not found"}, status_code=404)


# ---------------------------------------------------------------------------
# Static file serving (outputs + dashboard)
# ---------------------------------------------------------------------------

# Serve outputs/ at /outputs/ so the dashboard can fetch trace.json,
# board_discussion.json, simulation_results.json, simulation_geo.json, etc.
if OUTPUTS_DIR.exists():
    app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")

# Serve the dashboard.  Priority order:
# 1. dashboard-app/dist/ (React Vite build) -- highest priority
# 2. dashboard/dist/ (legacy Vite build)
# 3. dashboard/ (plain HTML files)
if REACT_DIST_DIR.exists():
    _static_dir = REACT_DIST_DIR
elif (DASHBOARD_DIR / "dist").exists():
    _static_dir = DASHBOARD_DIR / "dist"
elif DASHBOARD_DIR.exists():
    _static_dir = DASHBOARD_DIR
else:
    _static_dir = None

if _static_dir is not None:
    # Explicit route for the root so GET / always returns index.html
    # (the StaticFiles mount with html=True would do this too, but an
    # explicit route is more reliable and lets us return a clear 404).
    @app.get("/")
    async def serve_index() -> Any:
        index = _static_dir / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse({"error": "Dashboard not found. Place index.html in dashboard/"}, status_code=404)

    # Catch-all mount MUST come last -- it serves JS/CSS/assets and
    # sub-pages like boardroom.html, globe.html.
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="dashboard")


# ---------------------------------------------------------------------------
# Direct execution
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.app:app", host="0.0.0.0", port=8000, reload=True)
