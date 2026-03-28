"""Ghost Board FastAPI Server.

Serves the REST API, WebSocket live event stream, and static dashboard files.
All sprint data is persisted to a database via SQLAlchemy (SQLite default,
PostgreSQL via DATABASE_URL env var).
"""

from __future__ import annotations

import asyncio
import json
import os
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

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUTS_DIR = ROOT_DIR / "outputs"
DASHBOARD_DIR = ROOT_DIR / "dashboard"

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

    For now everything goes to the shared outputs/ folder.
    """
    return OUTPUTS_DIR


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


# ---------------------------------------------------------------------------
# Background sprint runner
# ---------------------------------------------------------------------------


async def _run_sprint_background(run_id: str, concept: str, sim_scale: str) -> None:
    """Run the full sprint in the background, persisting results to DB."""
    try:
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

        # Change cwd to project root so relative paths work
        original_cwd = os.getcwd()
        os.chdir(str(ROOT_DIR))

        try:
            from main import run_sprint

            # Determine scale params
            scale_map = {
                "demo": (10, 3),
                "standard": (30, 5),
                "large": (50, 5),
                "million": (50, 5),
            }
            personas, rounds = scale_map.get(sim_scale, (10, 3))

            sprint_result = await run_sprint(
                startup_idea=concept,
                num_personas=personas,
                num_rounds=rounds,
                skip_simulation=False,
                sim_scale=sim_scale if sim_scale in ("demo", "standard", "large", "million") else None,
            )
        finally:
            os.chdir(original_cwd)

        # Persist events to database
        trace_events = sprint_result.get("events", [])
        if isinstance(trace_events, int):
            # If events is just a count, try reading trace.json
            trace_data = _read_json_file(OUTPUTS_DIR / "trace.json")
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

                # Broadcast each event live
                await ws_manager.broadcast(run_id, {
                    "type": "event",
                    "event": {
                        "id": db_event.id,
                        "source_agent": db_event.source_agent,
                        "event_type": db_event.event_type,
                        "payload": payload_data,
                        "triggered_by": db_event.triggered_by,
                        "iteration": db_event.iteration,
                    },
                })

            # Persist artifacts from output directories
            artifact_dirs = {
                "prototype": "CTO",
                "financial_model": "CFO",
                "gtm": "CMO",
                "compliance": "Legal",
            }
            for artifact_type, agent_name in artifact_dirs.items():
                art_dir = OUTPUTS_DIR / artifact_type
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
            sim_results_path = OUTPUTS_DIR / "simulation_results.json"
            sim_geo_path = OUTPUTS_DIR / "simulation_geo.json"
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
    """Create database tables on startup."""
    await create_tables()
    yield


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
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:8080",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:3000",
    ],
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

    # If no DB runs but outputs/ has trace.json, show a "latest" entry
    if not run_list and (OUTPUTS_DIR / "trace.json").exists():
        summary = _read_json_file(OUTPUTS_DIR / "sprint_summary.json") or {}
        run_list.append({
            "run_id": "latest",
            "id": "latest",
            "concept": summary.get("concept", "Unknown"),
            "sim_scale": "unknown",
            "status": "completed",
            "started_at": None,
            "finished_at": None,
            "completed_at": None,
            "created_at": None,
            "total_events": summary.get("events", 0),
            "total_pivots": summary.get("pivots", 0),
            "total_agents_simulated": 0,
            "api_cost_usd": summary.get("total_cost", 0.0),
            "events": summary.get("events", 0),
            "pivots": summary.get("pivots", 0),
            "total_cost": summary.get("total_cost", 0.0),
            "wandb_url": None,
        })

    return {"runs": run_list}


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    """Get full details for a specific sprint run."""
    # Handle "latest" virtual run
    if run_id == "latest":
        summary = _read_json_file(OUTPUTS_DIR / "sprint_summary.json") or {}
        return {
            "run_id": "latest",
            "id": "latest",
            "concept": summary.get("concept", "Unknown"),
            "status": "completed",
            "events_count": summary.get("events", 0),
            "artifacts_count": 0,
            "simulations": [],
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

    # Fallback: read from trace.json file
    out = _run_outputs_dir(run_id)
    trace = _read_json_file(out / "trace.json")
    if trace is None:
        return JSONResponse({"error": "trace.json not found"}, status_code=404)
    return {"trace": trace}


@app.get("/api/runs/{run_id}/artifacts")
async def get_artifacts(run_id: str) -> dict[str, Any]:
    """Return all artifacts for a run. Checks DB first, falls back to filesystem."""
    if run_id != "latest":
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

    # Fallback: list files from filesystem
    out = _run_outputs_dir(run_id)
    artifacts: list[dict] = []
    for folder in ("prototype", "financial_model", "gtm", "compliance"):
        folder_path = out / folder
        artifacts.extend(_list_artifact_files(folder_path))
    return {"artifacts": artifacts}


@app.get("/api/runs/{run_id}/board-discussion")
async def get_board_discussion(run_id: str) -> Any:
    """Return board_discussion.json content."""
    out = _run_outputs_dir(run_id)
    discussion = _read_json_file(out / "board_discussion.json")
    if discussion is None:
        return JSONResponse({"error": "board_discussion.json not found"}, status_code=404)
    return {"discussion": discussion}


@app.get("/api/runs/{run_id}/simulation")
async def get_simulation(run_id: str) -> dict[str, Any]:
    """Return simulation data. Checks DB first, falls back to JSON files."""
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
                    "results": {
                        "id": sim.id,
                        "llm_agents": sim.llm_agents,
                        "lightweight_agents": sim.lightweight_agents,
                        "rounds": sim.rounds,
                        "duration_seconds": sim.duration_seconds,
                        "overall_sentiment": sim.overall_sentiment,
                    },
                    "geo": [
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

    # Fallback: read from JSON files
    out = _run_outputs_dir(run_id)
    results = _read_json_file(out / "simulation_results.json")
    geo = _read_json_file(out / "simulation_geo.json")
    return {"results": results, "geo": geo}


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

    # If no DB data, try reading from latest outputs
    if total_runs == 0 and (OUTPUTS_DIR / "trace.json").exists():
        total_runs = 1
        summary = _read_json_file(OUTPUTS_DIR / "sprint_summary.json")
        if summary:
            total_cost = summary.get("total_cost", 0.0)
        sim_results = _read_json_file(OUTPUTS_DIR / "simulation_results.json")
        if sim_results and isinstance(sim_results, dict):
            total_agents = sim_results.get("total_agents", total_agents)
        avg_cost = total_cost / max(total_runs, 1)

    return {
        "total_runs": total_runs,
        "total_agents": int(total_agents),
        "total_agents_simulated": int(total_agents),
        "total_pivots": int(total_pivots),
        "avg_cost": round(float(avg_cost), 4),
        "total_cost": round(float(total_cost), 4),
    }


@app.get("/api/runs/{run_id}/sprint-report")
async def get_sprint_report(run_id: str) -> Any:
    """Return the sprint_report.md content."""
    out = _run_outputs_dir(run_id)
    report_path = out / "sprint_report.md"
    if report_path.exists():
        return {"report": report_path.read_text(encoding="utf-8")}
    return JSONResponse({"error": "sprint_report.md not found"}, status_code=404)


@app.get("/api/runs/{run_id}/summary")
async def get_summary(run_id: str) -> Any:
    """Return sprint_summary.json content."""
    out = _run_outputs_dir(run_id)
    summary = _read_json_file(out / "sprint_summary.json")
    if summary is None:
        return JSONResponse({"error": "sprint_summary.json not found"}, status_code=404)
    return {"summary": summary}


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
# Static file serving (dashboard)
# ---------------------------------------------------------------------------

_dashboard_dist = DASHBOARD_DIR / "dist"
_static_dir = _dashboard_dist if _dashboard_dist.exists() else DASHBOARD_DIR

if _static_dir.exists():
    @app.get("/")
    async def serve_index() -> Any:
        index = _static_dir / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse({"error": "Dashboard not found"}, status_code=404)

    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="dashboard")


# ---------------------------------------------------------------------------
# Direct execution
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.app:app", host="0.0.0.0", port=8000, reload=True)
