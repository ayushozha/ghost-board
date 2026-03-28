"""Tests for coordination/events.py and coordination/state.py."""

import asyncio
import pytest
from coordination.events import (
    AgentEvent,
    BlockerPayload,
    EventType,
    PivotPayload,
    SimulationResultPayload,
    StrategyPayload,
    UpdatePayload,
)
from coordination.state import StateBus


# --- Event model tests ---

class TestEventModels:
    def test_strategy_payload(self):
        p = StrategyPayload(
            startup_idea="AI compliance tool",
            target_market="fintech startups",
            business_model="SaaS",
            key_differentiators=["real-time monitoring"],
        )
        assert p.startup_idea == "AI compliance tool"
        assert p.iteration == 1

    def test_blocker_payload_with_citations(self):
        p = BlockerPayload(
            severity="CRITICAL",
            area="regulatory",
            description="CFPB requires disclosure",
            citations=["https://www.consumerfinance.gov/rules-policy/"],
            recommended_action="Add disclosure page",
        )
        assert len(p.citations) == 1
        assert p.severity == "CRITICAL"

    def test_pivot_payload(self):
        p = PivotPayload(
            reason="Legal blocker",
            old_strategy="B2C lending",
            new_strategy="B2B compliance SaaS",
            affected_agents=["CTO", "CFO", "CMO"],
        )
        assert "CTO" in p.affected_agents

    def test_simulation_result_payload(self):
        p = SimulationResultPayload(
            overall_sentiment=0.65,
            confidence=0.8,
            num_rounds=5,
            num_personas=10,
            key_concerns=["pricing too high"],
            pivot_recommended=False,
        )
        assert p.overall_sentiment == 0.65

    def test_agent_event_creation(self):
        payload = StrategyPayload(
            startup_idea="Test idea",
            target_market="developers",
            business_model="freemium",
        )
        event = AgentEvent(
            type=EventType.STRATEGY_SET,
            source="CEO",
            payload=payload,
        )
        assert event.type == EventType.STRATEGY_SET
        assert event.source == "CEO"
        assert event.triggered_by is None
        assert event.id  # UUID generated

    def test_agent_event_triggered_by(self):
        blocker = AgentEvent(
            type=EventType.BLOCKER,
            source="Legal",
            payload=BlockerPayload(
                severity="HIGH",
                area="compliance",
                description="Missing KYC",
            ),
        )
        pivot = AgentEvent(
            type=EventType.PIVOT,
            source="CEO",
            payload=PivotPayload(
                reason="Legal blocker",
                old_strategy="direct lending",
                new_strategy="API-only",
            ),
            triggered_by=blocker.id,
        )
        assert pivot.triggered_by == blocker.id

    def test_to_trace_dict(self):
        event = AgentEvent(
            type=EventType.UPDATE,
            source="CTO",
            payload=UpdatePayload(agent="CTO", action="started", details="building prototype"),
        )
        d = event.to_trace_dict()
        assert d["event_type"] == "UPDATE"
        assert d["source"] == "CTO"
        assert "payload" in d


# --- StateBus tests ---

class TestStateBus:
    @pytest.mark.asyncio
    async def test_publish_and_subscribe(self):
        bus = StateBus()
        received = []

        async def handler(event: AgentEvent):
            received.append(event)

        bus.subscribe(EventType.STRATEGY_SET, handler)

        event = AgentEvent(
            type=EventType.STRATEGY_SET,
            source="CEO",
            payload=StrategyPayload(
                startup_idea="test",
                target_market="devs",
                business_model="saas",
            ),
        )
        await bus.publish(event)

        assert len(received) == 1
        assert received[0].source == "CEO"

    @pytest.mark.asyncio
    async def test_multiple_subscribers(self):
        bus = StateBus()
        received_a = []
        received_b = []

        async def handler_a(event: AgentEvent):
            received_a.append(event)

        async def handler_b(event: AgentEvent):
            received_b.append(event)

        bus.subscribe(EventType.BLOCKER, handler_a)
        bus.subscribe(EventType.BLOCKER, handler_b)

        event = AgentEvent(
            type=EventType.BLOCKER,
            source="Legal",
            payload=BlockerPayload(severity="HIGH", area="compliance", description="test"),
        )
        await bus.publish(event)

        assert len(received_a) == 1
        assert len(received_b) == 1

    @pytest.mark.asyncio
    async def test_no_cross_event_delivery(self):
        bus = StateBus()
        received = []

        async def handler(event: AgentEvent):
            received.append(event)

        bus.subscribe(EventType.STRATEGY_SET, handler)

        # Publish a BLOCKER event - handler should NOT receive it
        event = AgentEvent(
            type=EventType.BLOCKER,
            source="Legal",
            payload=BlockerPayload(severity="LOW", area="test", description="test"),
        )
        await bus.publish(event)

        assert len(received) == 0

    @pytest.mark.asyncio
    async def test_get_trace(self):
        bus = StateBus()

        e1 = AgentEvent(
            type=EventType.STRATEGY_SET,
            source="CEO",
            payload=StrategyPayload(startup_idea="a", target_market="b", business_model="c"),
        )
        e2 = AgentEvent(
            type=EventType.BLOCKER,
            source="Legal",
            payload=BlockerPayload(severity="HIGH", area="reg", description="d"),
            triggered_by=e1.id,
        )
        await bus.publish(e1)
        await bus.publish(e2)

        trace = bus.get_trace()
        assert len(trace) == 2
        assert trace[0].id == e1.id
        assert trace[1].triggered_by == e1.id

    @pytest.mark.asyncio
    async def test_get_state(self):
        bus = StateBus()

        e1 = AgentEvent(
            type=EventType.UPDATE,
            source="CTO",
            payload=UpdatePayload(agent="CTO", action="started"),
        )
        e2 = AgentEvent(
            type=EventType.UPDATE,
            source="CTO",
            payload=UpdatePayload(agent="CTO", action="finished"),
        )
        await bus.publish(e1)
        await bus.publish(e2)

        state = bus.get_state(source="CTO")
        # Should only have the latest event
        assert len(state) == 1
        assert state["CTO:UPDATE"].payload.action == "finished"

    @pytest.mark.asyncio
    async def test_get_events_by_type(self):
        bus = StateBus()

        await bus.publish(AgentEvent(
            type=EventType.UPDATE, source="CTO",
            payload=UpdatePayload(agent="CTO", action="a"),
        ))
        await bus.publish(AgentEvent(
            type=EventType.BLOCKER, source="Legal",
            payload=BlockerPayload(severity="HIGH", area="x", description="y"),
        ))
        await bus.publish(AgentEvent(
            type=EventType.UPDATE, source="CFO",
            payload=UpdatePayload(agent="CFO", action="b"),
        ))

        updates = bus.get_events_by_type(EventType.UPDATE)
        assert len(updates) == 2

    @pytest.mark.asyncio
    async def test_subscribe_all(self):
        bus = StateBus()
        received = []

        async def handler(event: AgentEvent):
            received.append(event)

        bus.subscribe_all(handler)

        await bus.publish(AgentEvent(
            type=EventType.STRATEGY_SET, source="CEO",
            payload=StrategyPayload(startup_idea="a", target_market="b", business_model="c"),
        ))
        await bus.publish(AgentEvent(
            type=EventType.BLOCKER, source="Legal",
            payload=BlockerPayload(severity="LOW", area="x", description="y"),
        ))

        assert len(received) == 2

    @pytest.mark.asyncio
    async def test_handler_exception_doesnt_crash_bus(self):
        """A failing handler should not prevent other handlers from running."""
        bus = StateBus()
        received = []

        async def bad_handler(event: AgentEvent):
            raise ValueError("handler error")

        async def good_handler(event: AgentEvent):
            received.append(event)

        bus.subscribe(EventType.UPDATE, bad_handler)
        bus.subscribe(EventType.UPDATE, good_handler)

        await bus.publish(AgentEvent(
            type=EventType.UPDATE, source="test",
            payload=UpdatePayload(agent="test", action="a"),
        ))

        # Good handler should still receive the event (gather with return_exceptions=True)
        assert len(received) == 1

    @pytest.mark.asyncio
    async def test_clear_bus(self):
        bus = StateBus()
        received = []

        async def handler(event: AgentEvent):
            received.append(event)

        bus.subscribe(EventType.UPDATE, handler)
        await bus.publish(AgentEvent(
            type=EventType.UPDATE, source="test",
            payload=UpdatePayload(agent="test", action="a"),
        ))
        assert len(received) == 1

        bus.clear()
        assert bus.get_trace() == []
        assert bus.get_state() == {}

    @pytest.mark.asyncio
    async def test_get_events_by_source(self):
        bus = StateBus()
        await bus.publish(AgentEvent(
            type=EventType.UPDATE, source="CEO",
            payload=UpdatePayload(agent="CEO", action="a"),
        ))
        await bus.publish(AgentEvent(
            type=EventType.UPDATE, source="CTO",
            payload=UpdatePayload(agent="CTO", action="b"),
        ))
        await bus.publish(AgentEvent(
            type=EventType.BLOCKER, source="CEO",
            payload=BlockerPayload(severity="LOW", area="x", description="y"),
        ))

        ceo_events = bus.get_events_by_source("CEO")
        assert len(ceo_events) == 2

    def test_event_unique_ids(self):
        e1 = AgentEvent(
            type=EventType.UPDATE, source="test",
            payload=UpdatePayload(agent="test", action="a"),
        )
        e2 = AgentEvent(
            type=EventType.UPDATE, source="test",
            payload=UpdatePayload(agent="test", action="b"),
        )
        assert e1.id != e2.id

    def test_event_payload_map_coverage(self):
        """Verify all critical event types have a payload model mapping."""
        from coordination.events import EVENT_PAYLOAD_MAP
        critical_types = [
            EventType.STRATEGY_SET, EventType.PIVOT, EventType.BLOCKER,
            EventType.SIMULATION_RESULT, EventType.UPDATE, EventType.ERROR,
        ]
        for et in critical_types:
            assert et in EVENT_PAYLOAD_MAP, f"{et} missing from EVENT_PAYLOAD_MAP"
