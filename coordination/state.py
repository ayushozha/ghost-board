"""Async pub/sub StateBus for Ghost Board agent coordination."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Callable, Coroutine

from coordination.events import AgentEvent, EventType


# Type alias for async event handlers
EventHandler = Callable[[AgentEvent], Coroutine[Any, Any, None]]


class StateBus:
    """Async pub/sub event bus with full trace history and state tracking.

    Agents subscribe to event types with async callbacks.
    When an event is published, all matching callbacks fire immediately (not polled).
    """

    def __init__(self) -> None:
        self._subscribers: dict[EventType, list[EventHandler]] = defaultdict(list)
        self._trace: list[AgentEvent] = []
        self._state: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """Register an async callback for an event type."""
        self._subscribers[event_type].append(handler)

    def subscribe_all(self, handler: EventHandler) -> None:
        """Register an async callback for ALL event types."""
        for event_type in EventType:
            self._subscribers[event_type].append(handler)

    async def publish(self, event: AgentEvent) -> None:
        """Publish an event and invoke all subscribed callbacks concurrently."""
        async with self._lock:
            self._trace.append(event)
            # Update state with latest event per source+type
            state_key = f"{event.source}:{event.type.value}"
            self._state[state_key] = event

        handlers = self._subscribers.get(event.type, [])
        if handlers:
            await asyncio.gather(
                *(handler(event) for handler in handlers),
                return_exceptions=True,
            )

    def get_trace(self) -> list[AgentEvent]:
        """Return the full ordered trace of all events."""
        return list(self._trace)

    def get_state(self, source: str | None = None, event_type: EventType | None = None) -> dict[str, AgentEvent]:
        """Get current state, optionally filtered by source or event type."""
        if source is None and event_type is None:
            return dict(self._state)
        result = {}
        for key, event in self._state.items():
            src, etype = key.split(":", 1)
            if source and src != source:
                continue
            if event_type and etype != event_type.value:
                continue
            result[key] = event
        return result

    def get_events_by_type(self, event_type: EventType) -> list[AgentEvent]:
        """Return all events of a given type from the trace."""
        return [e for e in self._trace if e.type == event_type]

    def get_events_by_source(self, source: str) -> list[AgentEvent]:
        """Return all events from a given source agent."""
        return [e for e in self._trace if e.source == source]

    def clear(self) -> None:
        """Clear all trace and state data."""
        self._subscribers.clear()
        self._trace.clear()
        self._state.clear()
