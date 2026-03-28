"""Ghost Board coordination layer."""

from coordination.events import AgentEvent, EventType
from coordination.state import StateBus
from coordination.trace import TraceLogger

__all__ = ["AgentEvent", "EventType", "StateBus", "TraceLogger"]
