"""Ghost Board CLI - Autonomous AI executive team that builds and validates a startup."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import click
from dotenv import load_dotenv

load_dotenv()

from coordination.events import (
    AgentEvent,
    EventType,
    SimulationResultPayload,
    StrategyPayload,
)
from coordination.state import StateBus
from coordination.trace import TraceLogger
from agents.ceo import CEOAgent
from agents.cto import CTOAgent
from agents.cfo import CFOAgent
from agents.cmo import CMOAgent
from agents.legal import LegalAgent
from simulation.mirofish_bridge import MiroFishBridge


async def run_sprint(
    startup_idea: str,
    num_personas: int = 10,
    num_rounds: int = 3,
    skip_simulation: bool = False,
) -> dict:
    """Run the full 3-phase autonomous sprint.

    Phase 1: Strategy + Build (CEO sets strategy, all agents build in parallel)
    Phase 2: Simulate (market stress test with synthetic stakeholders)
    Phase 3: Pivot + Rebuild (CEO pivots based on simulation, agents rebuild)
    """
    # Initialize infrastructure
    bus = StateBus()
    logger = TraceLogger(project="ghost-board")

    # Initialize agents
    ceo = CEOAgent(bus, logger)
    cto = CTOAgent(bus, logger)
    cfo = CFOAgent(bus, logger)
    cmo = CMOAgent(bus, logger)
    legal = LegalAgent(bus, logger)

    agents = [ceo, cto, cfo, cmo, legal]

    print("=" * 60)
    print("  GHOST BOARD - Autonomous AI Executive Team")
    print("=" * 60)

    # ── Phase 1: Strategy + Build ──
    print("\n[Phase 1] Strategy + Build")
    print("-" * 40)

    # CEO sets strategy
    print("  CEO: Setting initial strategy...")
    strategy = await ceo.set_strategy(startup_idea)
    print(f"  CEO: Strategy set - {strategy.business_model} targeting {strategy.target_market}")

    # All other agents receive strategy via event bus and build concurrently
    print("  Building artifacts concurrently...")
    cto.current_strategy = strategy
    cfo.current_strategy = strategy
    cmo.current_strategy = strategy
    legal.current_strategy = strategy

    build_results = await asyncio.gather(
        cto.generate_prototype(strategy),
        cfo.generate_financial_model(strategy),
        cmo.generate_gtm(strategy),
        legal.analyze_compliance(strategy),
        return_exceptions=True,
    )

    for i, result in enumerate(build_results):
        agent_name = ["CTO", "CFO", "CMO", "Legal"][i]
        if isinstance(result, Exception):
            print(f"  {agent_name}: ERROR - {result}")
        else:
            print(f"  {agent_name}: Done")

    # Check if Legal published blockers
    blockers = bus.get_events_by_type(EventType.BLOCKER)
    if blockers:
        print(f"\n  ! Legal found {len(blockers)} blocker(s)")
        # CEO processes blockers (which may trigger pivots)
        for blocker in blockers:
            await ceo.process_blocker(blocker)

        if ceo.pivot_count > 0:
            print(f"  CEO: Pivoted strategy ({ceo.pivot_count} pivot(s))")
            # Rebuild after pivot
            print("  Rebuilding after pivot...")
            await asyncio.gather(
                cto.run(),
                cfo.run(),
                cmo.run(),
                return_exceptions=True,
            )

    # ── Phase 2: Market Simulation ──
    if not skip_simulation:
        print(f"\n[Phase 2] Market Simulation ({num_personas} personas, {num_rounds} rounds)")
        print("-" * 40)

        bridge = MiroFishBridge(client=ceo.client)
        strategy_summary = (
            f"{strategy.startup_idea} - {strategy.business_model} "
            f"targeting {strategy.target_market}"
        )

        sim_result, market_signal = await bridge.run_full_simulation(
            startup_idea=startup_idea,
            strategy_summary=strategy_summary,
            num_personas=num_personas,
            num_rounds=num_rounds,
        )

        print(f"  Sentiment: {market_signal.overall_sentiment:.2f}")
        print(f"  Confidence: {market_signal.confidence:.2f}")
        print(f"  Pivot recommended: {market_signal.pivot_recommended}")
        if market_signal.key_concerns:
            print(f"  Top concerns: {', '.join(market_signal.key_concerns[:3])}")

        # Publish simulation result to bus
        sim_event = AgentEvent(
            type=EventType.SIMULATION_RESULT,
            source="Simulation",
            payload=SimulationResultPayload(
                overall_sentiment=market_signal.overall_sentiment,
                confidence=market_signal.confidence,
                num_rounds=len(sim_result.rounds),
                num_personas=len(sim_result.rounds[0].messages) if sim_result.rounds else 0,
                key_concerns=market_signal.key_concerns,
                key_strengths=market_signal.key_strengths,
                pivot_recommended=market_signal.pivot_recommended,
                pivot_suggestion=market_signal.pivot_suggestion,
            ),
        )
        await bus.publish(sim_event)

        # ── Phase 3: Pivot + Rebuild (if needed) ──
        if market_signal.pivot_recommended:
            print(f"\n[Phase 3] Pivot + Rebuild")
            print("-" * 40)
            print(f"  CEO: Pivoting - {market_signal.pivot_suggestion}")

            # CEO processes simulation result (triggers pivot via event handler)
            await ceo.process_simulation_result(sim_event)

            if ceo.pivot_count > 0:
                print(f"  CEO: Strategy pivoted (total pivots: {ceo.pivot_count})")
                # Rebuild everything
                print("  Rebuilding all artifacts...")
                await asyncio.gather(
                    cto.run(),
                    cfo.run(),
                    cmo.run(),
                    legal.run(),
                    return_exceptions=True,
                )
                print("  Rebuild complete.")
        else:
            print("\n[Phase 3] No pivot needed - market reception positive")
    else:
        print("\n[Phase 2-3] Skipped (--skip-simulation)")

    # ── Summary ──
    print("\n" + "=" * 60)
    print("  Sprint Complete!")
    print("=" * 60)

    trace = bus.get_trace()
    total_events = len(trace)
    pivots = ceo.pivot_count

    costs = {a.name: a.get_cost_summary() for a in agents}
    total_cost = sum(c["estimated_cost_usd"] for c in costs.values())

    print(f"  Events: {total_events}")
    print(f"  Pivots: {pivots}")
    print(f"  Est. cost: ${total_cost:.4f}")
    print(f"\n  Outputs saved to: outputs/")
    print(f"  Trace log: outputs/trace.json")

    for name, cost in costs.items():
        print(f"    {name}: {cost['total_tokens']} tokens (${cost['estimated_cost_usd']:.4f})")

    # Finalize trace
    logger.finish()

    return {
        "events": total_events,
        "pivots": pivots,
        "costs": costs,
        "total_cost": total_cost,
        "trace": [e.to_trace_dict() for e in trace],
    }


@click.command()
@click.argument("startup_idea", default="AI-powered regulatory compliance automation for fintech startups")
@click.option("--personas", "-p", default=10, help="Number of simulation personas")
@click.option("--rounds", "-r", default=3, help="Number of simulation rounds")
@click.option("--skip-simulation", is_flag=True, help="Skip market simulation phase")
@click.option("--demo", is_flag=True, help="Run with the Anchrix demo concept")
def main(startup_idea: str, personas: int, rounds: int, skip_simulation: bool, demo: bool):
    """Ghost Board - Autonomous AI executive team sprint.

    Runs five AI agents (CEO, CTO, CFO, CMO, Legal) that coordinate to build
    and validate a startup in a single sprint.
    """
    if demo:
        demo_path = Path("demo/anchrix_concept.txt")
        if demo_path.exists():
            startup_idea = demo_path.read_text().strip()
            print(f"[Demo mode] Using Anchrix concept from {demo_path}")
        else:
            startup_idea = (
                "Anchrix: AI-powered identity verification and compliance platform "
                "for fintech. Uses biometric + document verification with real-time "
                "regulatory monitoring across CFPB, FinCEN, and state regulations."
            )
            print("[Demo mode] Using built-in Anchrix concept")

    if not os.environ.get("OPENAI_API_KEY"):
        click.echo("ERROR: OPENAI_API_KEY not set. Run: export OPENAI_API_KEY='sk-...'")
        sys.exit(1)

    result = asyncio.run(run_sprint(
        startup_idea=startup_idea,
        num_personas=personas,
        num_rounds=rounds,
        skip_simulation=skip_simulation,
    ))

    # Save final summary
    os.makedirs("outputs", exist_ok=True)
    with open("outputs/sprint_summary.json", "w") as f:
        json.dump(result, f, indent=2, default=str)


if __name__ == "__main__":
    main()
