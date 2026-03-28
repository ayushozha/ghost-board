"""Event types and typed payload models for Ghost Board agent coordination."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """All event types in the Ghost Board system."""
    # Strategy events
    STRATEGY_SET = "STRATEGY_SET"
    PIVOT = "PIVOT"

    # Agent output events
    PROTOTYPE_READY = "PROTOTYPE_READY"
    FINANCIAL_MODEL_READY = "FINANCIAL_MODEL_READY"
    GTM_READY = "GTM_READY"
    COMPLIANCE_REPORT_READY = "COMPLIANCE_REPORT_READY"

    # Blocker events
    BLOCKER = "BLOCKER"
    BLOCKER_RESOLVED = "BLOCKER_RESOLVED"

    # Simulation events
    SIMULATION_START = "SIMULATION_START"
    SIMULATION_ROUND = "SIMULATION_ROUND"
    SIMULATION_RESULT = "SIMULATION_RESULT"

    # General
    UPDATE = "UPDATE"
    TASK_COMPLETE = "TASK_COMPLETE"
    ERROR = "ERROR"


# --- Typed Payload Models ---

class StrategyPayload(BaseModel):
    """Payload for STRATEGY_SET events."""
    startup_idea: str
    target_market: str
    business_model: str
    key_differentiators: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    iteration: int = 1


class BlockerPayload(BaseModel):
    """Payload for BLOCKER events from Legal or other agents."""
    severity: str = Field(description="CRITICAL, HIGH, MEDIUM, LOW")
    area: str = Field(description="e.g., compliance, regulatory, technical")
    description: str
    citations: list[str] = Field(default_factory=list, description="Real regulation URLs or references")
    recommended_action: str = ""
    blocking_tasks: list[str] = Field(default_factory=list)


class PivotPayload(BaseModel):
    """Payload for PIVOT events when CEO decides to change direction."""
    reason: str
    old_strategy: str
    new_strategy: str
    affected_agents: list[str] = Field(default_factory=list)
    changes_required: dict[str, str] = Field(default_factory=dict)
    iteration: int = 1


class SimulationResultPayload(BaseModel):
    """Payload for SIMULATION_RESULT events."""
    overall_sentiment: float = Field(description="Score from -1.0 (negative) to 1.0 (positive)")
    confidence: float = Field(ge=0.0, le=1.0)
    num_rounds: int = 0
    num_personas: int = 0
    key_concerns: list[str] = Field(default_factory=list)
    key_strengths: list[str] = Field(default_factory=list)
    pivot_recommended: bool = False
    pivot_suggestion: str = ""
    raw_signals: list[dict[str, Any]] = Field(default_factory=list)


class UpdatePayload(BaseModel):
    """Payload for general UPDATE events."""
    agent: str
    action: str
    details: str = ""
    artifacts: list[str] = Field(default_factory=list)


class PrototypePayload(BaseModel):
    """Payload for PROTOTYPE_READY events."""
    files_generated: list[str] = Field(default_factory=list)
    language: str = "python"
    description: str = ""
    output_dir: str = "outputs/prototype"


class FinancialModelPayload(BaseModel):
    """Payload for FINANCIAL_MODEL_READY events."""
    revenue_year1: float = 0.0
    revenue_year3: float = 0.0
    burn_rate_monthly: float = 0.0
    runway_months: int = 0
    funding_required: float = 0.0
    output_path: str = "outputs/financial_model"


class GTMPayload(BaseModel):
    """Payload for GTM_READY events."""
    positioning: str = ""
    tagline: str = ""
    target_channels: list[str] = Field(default_factory=list)
    output_path: str = "outputs/gtm"


class CompliancePayload(BaseModel):
    """Payload for COMPLIANCE_REPORT_READY events."""
    risk_level: str = "MEDIUM"
    regulations_checked: list[str] = Field(default_factory=list)
    blockers_found: int = 0
    output_path: str = "outputs/compliance"


class ErrorPayload(BaseModel):
    """Payload for ERROR events."""
    agent: str
    error_type: str
    message: str
    recoverable: bool = True


# Map event types to their payload models
EVENT_PAYLOAD_MAP: dict[EventType, type[BaseModel]] = {
    EventType.STRATEGY_SET: StrategyPayload,
    EventType.PIVOT: PivotPayload,
    EventType.BLOCKER: BlockerPayload,
    EventType.BLOCKER_RESOLVED: BlockerPayload,
    EventType.SIMULATION_RESULT: SimulationResultPayload,
    EventType.UPDATE: UpdatePayload,
    EventType.PROTOTYPE_READY: PrototypePayload,
    EventType.FINANCIAL_MODEL_READY: FinancialModelPayload,
    EventType.GTM_READY: GTMPayload,
    EventType.COMPLIANCE_REPORT_READY: CompliancePayload,
    EventType.ERROR: ErrorPayload,
}


class AgentEvent(BaseModel):
    """Core event model for all inter-agent communication."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: EventType
    source: str = Field(description="Agent that produced this event")
    payload: BaseModel
    triggered_by: Optional[str] = Field(default=None, description="ID of the event that caused this one")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    iteration: int = 1

    model_config = {"arbitrary_types_allowed": True}

    def to_trace_dict(self) -> dict[str, Any]:
        """Convert to a flat dict suitable for W&B logging."""
        return {
            "event_id": self.id,
            "event_type": self.type.value,
            "source": self.source,
            "triggered_by": self.triggered_by or "",
            "timestamp": self.timestamp.isoformat(),
            "iteration": self.iteration,
            "payload": self.payload.model_dump(),
        }
