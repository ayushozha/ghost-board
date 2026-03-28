"""Ghost Board CLI - Autonomous AI executive team that builds and validates a startup."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import click
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

console = Console()

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
from simulation.mirofish_bridge import MiroFishBridge, get_integration_status


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

    console.print(Panel.fit(
        "[bold white]GHOST BOARD[/bold white]\n[dim]Autonomous AI Executive Team[/dim]",
        border_style="bright_blue",
    ))

    # ── Phase 1: Strategy + Build ──
    console.print("\n[bold cyan]Phase 1: Strategy + Build[/bold cyan]")
    console.print("[dim]" + "-" * 50 + "[/dim]")

    # CEO sets strategy
    with console.status("[bold green]CEO setting initial strategy..."):
        strategy = await ceo.set_strategy(startup_idea)
    console.print(f"  [bold yellow]CEO[/bold yellow]: {strategy.business_model} targeting {strategy.target_market}")

    # All other agents receive strategy via event bus and build concurrently
    cto.current_strategy = strategy
    cfo.current_strategy = strategy
    cmo.current_strategy = strategy
    legal.current_strategy = strategy

    with console.status("[bold green]All agents building concurrently..."):
        build_results = await asyncio.gather(
            cto.generate_prototype(strategy),
            cfo.generate_financial_model(strategy),
            cmo.generate_gtm(strategy),
            legal.analyze_compliance(strategy),
            return_exceptions=True,
        )

    agent_names = ["CTO", "CFO", "CMO", "Legal"]
    agent_colors = ["blue", "green", "magenta", "red"]
    for i, result in enumerate(build_results):
        if isinstance(result, Exception):
            console.print(f"  [{agent_colors[i]}]{agent_names[i]}[/{agent_colors[i]}]: [red]ERROR[/red] - {result}")
        else:
            console.print(f"  [{agent_colors[i]}]{agent_names[i]}[/{agent_colors[i]}]: [green]Done[/green]")

    # Check if Legal published blockers
    blockers = bus.get_events_by_type(EventType.BLOCKER)
    if blockers:
        console.print(f"\n  [bold red]! Legal found {len(blockers)} blocker(s)[/bold red]")
        # CEO processes blockers (which may trigger pivots)
        for blocker in blockers:
            await ceo.process_blocker(blocker)

        if ceo.pivot_count > 0:
            console.print(f"  [bold yellow]CEO[/bold yellow]: Pivoted strategy ({ceo.pivot_count} pivot(s))")
            with console.status("[bold green]Rebuilding after pivot..."):
                await asyncio.gather(
                    cto.run(),
                    cfo.run(),
                    cmo.run(),
                    return_exceptions=True,
                )

    # ── Phase 2: Market Simulation ──
    if not skip_simulation:
        console.print(f"\n[bold cyan]Phase 2: Market Simulation[/bold cyan] ({num_personas} personas, {num_rounds} rounds)")
        console.print("[dim]" + "-" * 50 + "[/dim]")

        bridge = MiroFishBridge(client=ceo.client)
        strategy_summary = (
            f"{strategy.startup_idea} - {strategy.business_model} "
            f"targeting {strategy.target_market}"
        )

        with console.status("[bold green]Running market simulation..."):
            sim_result, market_signal = await bridge.run_full_simulation(
                startup_idea=startup_idea,
                strategy_summary=strategy_summary,
                num_personas=num_personas,
                num_rounds=num_rounds,
            )

        sentiment_color = "green" if market_signal.overall_sentiment > 0.3 else ("yellow" if market_signal.overall_sentiment > -0.3 else "red")
        console.print(f"  Sentiment: [{sentiment_color}]{market_signal.overall_sentiment:.2f}[/{sentiment_color}]")
        console.print(f"  Confidence: {market_signal.confidence:.2f}")
        console.print(f"  Pivot recommended: {'[red]Yes[/red]' if market_signal.pivot_recommended else '[green]No[/green]'}")
        if market_signal.key_concerns:
            console.print(f"  Top concerns: {', '.join(market_signal.key_concerns[:3])}")

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
            console.print(f"\n[bold cyan]Phase 3: Pivot + Rebuild[/bold cyan]")
            console.print("[dim]" + "-" * 50 + "[/dim]")
            console.print(f"  [bold yellow]CEO[/bold yellow]: Pivoting - {market_signal.pivot_suggestion}")

            await ceo.process_simulation_result(sim_event)

            if ceo.pivot_count > 0:
                console.print(f"  [bold yellow]CEO[/bold yellow]: Strategy pivoted (total pivots: {ceo.pivot_count})")
                with console.status("[bold green]Rebuilding all artifacts..."):
                    await asyncio.gather(
                        cto.run(),
                        cfo.run(),
                        cmo.run(),
                        legal.run(),
                        return_exceptions=True,
                    )
                console.print("  [green]Rebuild complete.[/green]")
        else:
            console.print("\n[bold green]Phase 3: No pivot needed - market reception positive[/bold green]")
    else:
        console.print("\n[dim]Phase 2-3: Skipped (--skip-simulation)[/dim]")

    # ── Summary ──
    trace = bus.get_trace()
    total_events = len(trace)
    pivots = ceo.pivot_count

    costs = {a.name: a.get_cost_summary() for a in agents}
    total_cost = sum(c["estimated_cost_usd"] for c in costs.values())

    total_tokens = sum(c["total_tokens"] for c in costs.values())
    human_equivalent = 15000.0

    # Summary table
    summary_table = Table(title="Sprint Complete!", border_style="bright_blue")
    summary_table.add_column("Metric", style="bold")
    summary_table.add_column("Value", justify="right")
    summary_table.add_row("Events", str(total_events))
    summary_table.add_row("Pivots", str(pivots))
    summary_table.add_row("Total tokens", f"{total_tokens:,}")
    summary_table.add_row("API cost", f"[green]${total_cost:.4f}[/green]")
    summary_table.add_row("Human equivalent", f"[dim]~${human_equivalent:,.0f}[/dim]")
    summary_table.add_row("Savings", f"[bold green]{human_equivalent / max(total_cost, 0.01):,.0f}x cheaper[/bold green]")
    console.print()
    console.print(summary_table)

    # Cost breakdown
    cost_table = Table(title="Cost by Agent", border_style="dim")
    cost_table.add_column("Agent", style="bold")
    cost_table.add_column("Tokens", justify="right")
    cost_table.add_column("Cost", justify="right")
    for name, cost in costs.items():
        cost_table.add_row(name, f"{cost['total_tokens']:,}", f"${cost['estimated_cost_usd']:.4f}")
    console.print(cost_table)

    # Integration status
    status = get_integration_status()
    if status:
        int_table = Table(title="Vendor Integration", border_style="dim")
        int_table.add_column("Component", style="bold")
        int_table.add_column("Status")
        for component, st in status.items():
            color = "green" if "ACTIVE" in st else ("yellow" if "REPLACED" in st or "FALLBACK" in st else "red")
            int_table.add_row(component, f"[{color}]{st}[/{color}]")
        console.print(int_table)

    console.print(f"\n  Outputs: [link=file://outputs/]outputs/[/link]")
    console.print(f"  Trace: [link=file://outputs/trace.json]outputs/trace.json[/link]")

    if hasattr(logger, 'wandb_url') and logger.wandb_url:
        console.print(f"  W&B: [link={logger.wandb_url}]{logger.wandb_url}[/link]")
        os.makedirs("demo", exist_ok=True)
        with open("demo/wandb_url.txt", "w") as f:
            f.write(logger.wandb_url + "\n")

    # Finalize trace
    logger.finish()

    return {
        "events": total_events,
        "pivots": pivots,
        "costs": costs,
        "total_cost": total_cost,
        "total_tokens": total_tokens,
        "trace": [e.to_trace_dict() for e in trace],
        "wandb_url": getattr(logger, 'wandb_url', None),
    }


def _play_cached_demo() -> None:
    """Play back cached demo results without API calls."""
    import time

    cached_trace = Path("demo/cached_trace.json")
    cached_summary = Path("demo/cached_artifacts/sprint_summary.json")

    if not cached_trace.exists():
        print("No cached demo found. Run with --demo first to generate one.")
        return

    print("=" * 60)
    print("  GHOST BOARD - Cached Demo Playback")
    print("  (No API calls - instant replay)")
    print("=" * 60)

    trace_data = json.loads(cached_trace.read_text())
    for entry in trace_data:
        event_type = entry.get("event_type", "")
        source = entry.get("source", "")
        payload = entry.get("payload", {})

        if event_type == "STRATEGY_SET":
            print(f"\n  [{source}] Strategy: {payload.get('startup_idea', '')}")
            print(f"    Market: {payload.get('target_market', '')}")
            print(f"    Model: {payload.get('business_model', '')}")
        elif event_type == "BLOCKER":
            print(f"\n  [{source}] BLOCKER ({payload.get('severity', '')}): {payload.get('description', '')}")
            for cite in payload.get("citations", []):
                print(f"    Citation: {cite}")
        elif event_type == "PIVOT":
            print(f"\n  [{source}] PIVOT: {payload.get('reason', '')}")
        elif event_type == "PROTOTYPE_READY":
            print(f"\n  [{source}] Prototype: {len(payload.get('files_generated', []))} files")
        elif event_type == "FINANCIAL_MODEL_READY":
            print(f"\n  [{source}] Financial: Y1=${payload.get('revenue_year1', 0):,.0f}, Runway={payload.get('runway_months', 0)}mo")
        elif event_type == "GTM_READY":
            print(f"\n  [{source}] GTM: \"{payload.get('tagline', '')}\"")
        elif event_type == "COMPLIANCE_REPORT_READY":
            print(f"\n  [{source}] Compliance: {payload.get('risk_level', '')} risk, {payload.get('blockers_found', 0)} blockers")
        elif event_type == "SIMULATION_RESULT":
            print(f"\n  [{source}] Simulation: sentiment={payload.get('overall_sentiment', 0):.2f}")

        time.sleep(0.05)  # Brief delay for readability

    if cached_summary.exists():
        summary = json.loads(cached_summary.read_text())
        print("\n" + "=" * 60)
        print("  Sprint Complete! (cached)")
        print("=" * 60)
        print(f"  Events: {summary.get('events', '?')}")
        print(f"  Pivots: {summary.get('pivots', '?')}")
        print(f"  Original API cost: ${summary.get('total_cost', 0):.4f}")

    print("\n  Cached artifacts in: demo/cached_artifacts/")


@click.command()
@click.argument("startup_idea", default="AI-powered regulatory compliance automation for fintech startups")
@click.option("--personas", "-p", default=10, help="Number of simulation personas")
@click.option("--rounds", "-r", default=3, help="Number of simulation rounds")
@click.option("--skip-simulation", is_flag=True, help="Skip market simulation phase")
@click.option("--demo", is_flag=True, help="Run with the Anchrix demo concept")
@click.option("--cached", is_flag=True, help="Play back cached demo results (no API calls)")
def main(startup_idea: str, personas: int, rounds: int, skip_simulation: bool, demo: bool, cached: bool):
    """Ghost Board - Autonomous AI executive team sprint.

    Runs five AI agents (CEO, CTO, CFO, CMO, Legal) that coordinate to build
    and validate a startup in a single sprint.
    """
    if cached or (demo and not os.environ.get("OPENAI_API_KEY")):
        _play_cached_demo()
        return

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
