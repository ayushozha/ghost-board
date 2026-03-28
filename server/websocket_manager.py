"""WebSocket manager for live-streaming Ghost Board sprint events.

Maintains per-run WebSocket connection pools and broadcasts events
in real time as they flow through the StateBus. Designed for use
with FastAPI WebSocket endpoints.

Message format sent to clients::

    {"type": "agent_status", "agent": "ceo", "status": "thinking", "timestamp": "..."}
    {"type": "event", "data": {... AgentEvent as dict ...}}
    {"type": "simulation_round", "round": 3, "sentiment": 0.23, "active_agents": 50}
    {"type": "sprint_complete", "summary": {... sprint summary ...}}
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from coordination.events import AgentEvent, EventType

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections grouped by sprint run_id.

    Usage with FastAPI::

        ws_manager = WebSocketManager()

        @app.websocket("/ws/live/{run_id}")
        async def websocket_endpoint(websocket: WebSocket, run_id: str):
            await websocket.accept()
            await ws_manager.connect(run_id, websocket)
            try:
                while True:
                    # Keep connection alive; client can send pings
                    data = await websocket.receive_text()
            except WebSocketDisconnect:
                ws_manager.disconnect(run_id, websocket)

    Hook into StateBus::

        bus = StateBus()
        ws_manager.subscribe_to_bus(bus, run_id="abc123")
        # Every event published on bus now broadcasts to WebSocket clients
    """

    def __init__(self) -> None:
        self._connections: dict[str, list[Any]] = {}  # run_id -> [WebSocket, ...]
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    async def connect(self, run_id: str, websocket: Any) -> None:
        """Register a WebSocket connection for a sprint run.

        Args:
            run_id: The sprint run identifier.
            websocket: A FastAPI WebSocket (or any object with send_json/send_text).
        """
        async with self._lock:
            if run_id not in self._connections:
                self._connections[run_id] = []
            self._connections[run_id].append(websocket)
        logger.info("WebSocket connected for run %s (total: %d)", run_id, len(self._connections[run_id]))

    def disconnect(self, run_id: str, websocket: Any) -> None:
        """Remove a WebSocket connection.

        Args:
            run_id: The sprint run identifier.
            websocket: The WebSocket to remove.
        """
        if run_id in self._connections:
            try:
                self._connections[run_id].remove(websocket)
            except ValueError:
                pass
            if not self._connections[run_id]:
                del self._connections[run_id]
        logger.info("WebSocket disconnected for run %s", run_id)

    def connection_count(self, run_id: str) -> int:
        """Return the number of active connections for a run."""
        return len(self._connections.get(run_id, []))

    def active_runs(self) -> list[str]:
        """Return run_ids with at least one active connection."""
        return list(self._connections.keys())

    # ------------------------------------------------------------------
    # Broadcasting
    # ------------------------------------------------------------------

    async def broadcast(self, run_id: str, data: dict[str, Any]) -> None:
        """Send a JSON message to all WebSocket connections for a run.

        Silently removes connections that have been closed.

        Args:
            run_id: The sprint run identifier.
            data: Dict that will be JSON-serialized and sent.
        """
        connections = self._connections.get(run_id, [])
        if not connections:
            return

        dead: list[Any] = []
        message = json.dumps(data, default=str)

        for ws in connections:
            try:
                # Try send_text first (FastAPI WebSocket), fall back to send_json
                if hasattr(ws, "send_text"):
                    await ws.send_text(message)
                elif hasattr(ws, "send_json"):
                    await ws.send_json(data)
                else:
                    await ws.send(message)
            except Exception:
                dead.append(ws)
                logger.debug("Removing dead WebSocket for run %s", run_id)

        # Clean up dead connections
        for ws in dead:
            self.disconnect(run_id, ws)

    async def broadcast_all(self, data: dict[str, Any]) -> None:
        """Broadcast a message to ALL connected runs."""
        for run_id in list(self._connections.keys()):
            await self.broadcast(run_id, data)

    # ------------------------------------------------------------------
    # Typed message helpers
    # ------------------------------------------------------------------

    async def send_agent_status(
        self,
        run_id: str,
        agent: str,
        status: str,
        detail: str = "",
    ) -> None:
        """Send an agent status update.

        Args:
            run_id: The sprint run identifier.
            agent: Agent name (e.g. "ceo", "cto").
            status: Status string (e.g. "thinking", "building", "done", "error").
            detail: Optional detail text.
        """
        await self.broadcast(run_id, {
            "type": "agent_status",
            "agent": agent,
            "status": status,
            "detail": detail,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def send_event(self, run_id: str, event: AgentEvent) -> None:
        """Send an AgentEvent as a WebSocket message.

        Args:
            run_id: The sprint run identifier.
            event: The AgentEvent to broadcast.
        """
        await self.broadcast(run_id, {
            "type": "event",
            "data": event.to_trace_dict(),
        })

    async def send_simulation_round(
        self,
        run_id: str,
        round_num: int,
        sentiment: float,
        active_agents: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Send simulation round progress.

        Args:
            run_id: The sprint run identifier.
            round_num: Current round number.
            sentiment: Aggregate sentiment score.
            active_agents: Number of active simulation agents.
            details: Optional additional round details.
        """
        msg: dict[str, Any] = {
            "type": "simulation_round",
            "round": round_num,
            "sentiment": sentiment,
            "active_agents": active_agents,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if details:
            msg["details"] = details
        await self.broadcast(run_id, msg)

    async def send_sprint_complete(
        self,
        run_id: str,
        summary: dict[str, Any],
    ) -> None:
        """Send sprint completion message.

        Args:
            run_id: The sprint run identifier.
            summary: Sprint summary dict with totals, costs, etc.
        """
        await self.broadcast(run_id, {
            "type": "sprint_complete",
            "summary": summary,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def send_error(
        self,
        run_id: str,
        error: str,
        agent: str = "",
        recoverable: bool = True,
    ) -> None:
        """Send an error message.

        Args:
            run_id: The sprint run identifier.
            error: Error description.
            agent: Which agent errored (if applicable).
            recoverable: Whether the sprint can continue.
        """
        await self.broadcast(run_id, {
            "type": "error",
            "error": error,
            "agent": agent,
            "recoverable": recoverable,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # ------------------------------------------------------------------
    # StateBus integration
    # ------------------------------------------------------------------

    def subscribe_to_bus(self, bus, run_id: str) -> None:
        """Subscribe to ALL events on a StateBus and broadcast them.

        Every event published on the bus will be sent to all WebSocket
        clients connected to this run_id.

        Args:
            bus: A StateBus instance.
            run_id: The sprint run to broadcast events for.
        """

        async def _on_event(event: AgentEvent) -> None:
            await self.send_event(run_id, event)

            # Also send agent status updates for key event types
            status_map = {
                EventType.STRATEGY_SET: ("ceo", "strategy_set"),
                EventType.PIVOT: ("ceo", "pivoting"),
                EventType.BLOCKER: (event.source, "blocker_found"),
                EventType.BLOCKER_RESOLVED: (event.source, "blocker_resolved"),
                EventType.PROTOTYPE_READY: ("cto", "done"),
                EventType.FINANCIAL_MODEL_READY: ("cfo", "done"),
                EventType.GTM_READY: ("cmo", "done"),
                EventType.COMPLIANCE_REPORT_READY: ("legal", "done"),
                EventType.SIMULATION_START: ("simulation", "running"),
                EventType.SIMULATION_ROUND: ("simulation", "running"),
                EventType.SIMULATION_RESULT: ("simulation", "done"),
                EventType.ERROR: (event.source, "error"),
            }

            if event.type in status_map:
                agent, status = status_map[event.type]
                detail = ""
                if hasattr(event.payload, "description"):
                    detail = event.payload.description
                elif hasattr(event.payload, "reason"):
                    detail = event.payload.reason
                elif hasattr(event.payload, "message"):
                    detail = event.payload.message
                await self.send_agent_status(run_id, agent, status, detail=detail)

        bus.subscribe_all(_on_event)
        logger.info("WebSocketManager subscribed to StateBus for run %s", run_id)

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    async def close_all(self, run_id: str | None = None) -> None:
        """Close all connections for a run (or all runs if run_id is None).

        Sends a close frame where possible before removing connections.
        """
        targets = [run_id] if run_id else list(self._connections.keys())
        for rid in targets:
            connections = self._connections.get(rid, [])
            for ws in connections:
                try:
                    if hasattr(ws, "close"):
                        await ws.close()
                except Exception:
                    pass
            if rid in self._connections:
                del self._connections[rid]
        logger.info("Closed all WebSocket connections%s", f" for run {run_id}" if run_id else "")
