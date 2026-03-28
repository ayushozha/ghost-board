"""Ghost Board CLI - Autonomous AI executive team that builds and validates a startup."""

from __future__ import annotations

import asyncio
import functools
import json
import os
import sys
import time
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, HTTPServer
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
from simulation.hybrid_engine import run_hybrid_simulation, SCALE_PRESETS


async def run_sprint(
    startup_idea: str,
    num_personas: int = 10,
    num_rounds: int = 3,
    skip_simulation: bool = False,
    sim_scale: str | None = None,
) -> dict:
    """Run the full 3-phase autonomous sprint.

    Phase 1: Strategy + Build (CEO sets strategy, all agents build in parallel)
    Phase 2: Simulate (market stress test with synthetic stakeholders)
    Phase 3: Pivot + Rebuild (CEO pivots based on simulation, agents rebuild)
    """
    # Initialize infrastructure
    bus = StateBus()
    logger = TraceLogger(project="ghost-board")

    # Clear any stale board discussion entries from previous runs
    from agents.base import BaseAgent as _BaseAgent
    _BaseAgent.clear_board_discussion()

    # Initialize agents
    ceo = CEOAgent(bus, logger)
    cto = CTOAgent(bus, logger)
    cfo = CFOAgent(bus, logger)
    cmo = CMOAgent(bus, logger)
    legal = LegalAgent(bus, logger)

    agents = [ceo, cto, cfo, cmo, legal]

    sprint_start = time.time()

    # Determine scale description for banner
    if sim_scale and sim_scale in SCALE_PRESETS:
        llm_n, light_n, rounds_n = SCALE_PRESETS[sim_scale]
        scale_desc = f"{sim_scale} ({llm_n} LLM + {light_n:,} lightweight agents)"
    else:
        scale_desc = f"standard ({num_personas} personas, {num_rounds} rounds)"

    # Truncate concept for display
    concept_display = startup_idea if len(startup_idea) <= 60 else startup_idea[:57] + "..."

    banner = (
        "[bold white]"
        "\n"
        "          [bright_blue]+-----------------------------------------+[/bright_blue]\n"
        "          [bright_blue]|[/bright_blue]          [bold bright_white]* GHOST BOARD *[/bold bright_white]           [bright_blue]|[/bright_blue]\n"
        "          [bright_blue]|[/bright_blue]    Autonomous AI Executive Team    [bright_blue]|[/bright_blue]\n"
        "          [bright_blue]+-----------------------------------------+[/bright_blue]\n"
        "[/bold white]"
    )
    console.print(banner)
    console.print(f"  [bold]Concept:[/bold] {concept_display}")
    console.print(f"  [bold]Scale:[/bold]   {scale_desc}")
    console.print()

    # ── Phase 1: Strategy + Build ──
    console.print("[bold cyan]Phase 1:[/bold cyan] [white]Strategy + Build[/white]")
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

    console.print("[green]v[/green] Phase 1 complete\n")

    # ── Phase 2: Market Simulation ──
    hybrid_stats = None
    if not skip_simulation:
        strategy_summary = (
            f"{strategy.startup_idea} - {strategy.business_model} "
            f"targeting {strategy.target_market}"
        )

        if sim_scale and sim_scale in SCALE_PRESETS:
            # Hybrid engine: LLM agents + lightweight crowd
            llm_n, light_n, rounds_n = SCALE_PRESETS[sim_scale]
            console.print(f"[bold cyan]Phase 2:[/bold cyan] [white]Hybrid Market Simulation[/white]")
            console.print(f"  [bold]{llm_n} LLM agents + {light_n:,} lightweight agents, {rounds_n} rounds[/bold]")
            console.print("[dim]" + "-" * 50 + "[/dim]")

            with console.status(f"[bold green]Running hybrid simulation ({llm_n + light_n:,} total agents)..."):
                sim_result, market_signal, hybrid_stats = await run_hybrid_simulation(
                    startup_idea=startup_idea,
                    strategy_summary=strategy_summary,
                    scale=sim_scale,
                    client=ceo.client,
                )

            console.print(f"  Total agents: [bold]{hybrid_stats['total_agents']:,}[/bold]")
            console.print(f"  Duration: {hybrid_stats['duration_seconds']:.1f}s")
        else:
            # Standard simulation via MiroFish bridge
            console.print(f"[bold cyan]Phase 2:[/bold cyan] [white]Market Simulation[/white] ({num_personas} personas, {num_rounds} rounds)")
            console.print("[dim]" + "-" * 50 + "[/dim]")

            bridge = MiroFishBridge(client=ceo.client)
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

        console.print("[green]v[/green] Phase 2 complete\n")

        # ── Board Discussion: CEO presents findings, agents respond ──
        console.print("[bold cyan]Board Discussion:[/bold cyan] [white]Simulation Debrief[/white]")
        console.print("[dim]" + "-" * 50 + "[/dim]")

        sim_payload = sim_event.payload
        findings = await ceo.present_simulation_findings(sim_payload)
        console.print(f"  [bold yellow]CEO[/bold yellow]: {findings[:200]}{'...' if len(findings) > 200 else ''}")

        strategy_json = ceo.current_strategy.model_dump_json() if ceo.current_strategy else "{}"
        agent_responses = await asyncio.gather(
            cto.respond_to_simulation_findings(findings, strategy_json),
            cfo.respond_to_simulation_findings(findings, strategy_json),
            cmo.respond_to_simulation_findings(findings, strategy_json),
            legal.respond_to_simulation_findings(findings, strategy_json),
            return_exceptions=True,
        )
        for agent, resp in zip([cto, cfo, cmo, legal], agent_responses):
            if isinstance(resp, str):
                color = {"CTO": "blue", "CFO": "green", "CMO": "magenta", "Legal": "red"}.get(agent.name, "white")
                console.print(f"  [bold {color}]{agent.name}[/bold {color}]: {resp[:200]}{'...' if len(resp) > 200 else ''}")

        # ── Phase 3: Pivot + Rebuild (if needed) ──
        if market_signal.pivot_recommended:
            console.print(f"\n[bold cyan]Phase 3:[/bold cyan] [white]Pivot + Rebuild[/white]")
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
            console.print("[green]v[/green] Phase 3 complete\n")
        else:
            console.print("\n[green]v[/green] Phase 3: No pivot needed - market reception positive\n")
    else:
        console.print("\n[dim]Phase 2-3: Skipped (--skip-simulation)[/dim]\n")

    # ── Summary ──
    sprint_duration = time.time() - sprint_start
    trace = bus.get_trace()
    total_events = len(trace)
    pivots = ceo.pivot_count

    costs = {a.name: a.get_cost_summary() for a in agents}

    # Estimate simulation costs (gpt-4o-mini: ~300 tokens per persona turn + analysis)
    if not skip_simulation:
        sim_token_est = num_personas * num_rounds * 300 + 1000  # turns + analysis
        sim_cost_est = sim_token_est * (0.15 + 0.60) / 2 / 1_000_000  # avg in/out
        costs["Simulation"] = {
            "agent": "Simulation",
            "total_tokens": sim_token_est,
            "estimated_cost_usd": round(sim_cost_est, 4),
        }

    total_cost = sum(c["estimated_cost_usd"] for c in costs.values())
    total_tokens = sum(c["total_tokens"] for c in costs.values())
    human_equivalent = 15000.0

    # Compute total agents simulated
    if sim_scale and sim_scale in SCALE_PRESETS:
        _llm_n, _light_n, _ = SCALE_PRESETS[sim_scale]
        total_agents_simulated = _llm_n + _light_n
    else:
        total_agents_simulated = num_personas

    # Format duration
    mins = int(sprint_duration) // 60
    secs = int(sprint_duration) % 60
    duration_str = f"{mins}m {secs:02d}s" if mins > 0 else f"{secs}s"
    savings_mult = human_equivalent / max(total_cost, 0.01)

    # Summary box
    summary_lines = (
        f"[bold white]Events:[/bold white] {total_events}  "
        f"[bold white]Pivots:[/bold white] {pivots}\n"
        f"[bold white]Agents:[/bold white] {total_agents_simulated:,}  "
        f"[bold white]Cost:[/bold white] [green]${total_cost:.4f}[/green]\n"
        f"[bold white]Tokens:[/bold white] {total_tokens:,}  "
        f"[bold white]Duration:[/bold white] {duration_str}\n"
        f"[bold white]Savings:[/bold white] [bold green]{savings_mult:,.0f}x cheaper[/bold green] vs ~${human_equivalent:,.0f} consulting\n"
        f"[bold white]Outputs:[/bold white] outputs/"
    )
    console.print(Panel(
        summary_lines,
        title="[bold bright_white]Sprint Complete[/bold bright_white]",
        border_style="green",
        padding=(1, 2),
    ))

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

    # Save board discussion
    from agents.base import BaseAgent
    BaseAgent.save_board_discussion()

    # Generate sprint report
    _generate_sprint_report(
        startup_idea=startup_idea,
        trace=trace,
        pivots=pivots,
        costs=costs,
        total_cost=total_cost,
        total_tokens=total_tokens,
        human_equivalent=human_equivalent,
        board_discussion=BaseAgent.get_board_discussion(),
    )

    console.print(f"\n  Outputs: [link=file://outputs/]outputs/[/link]")
    console.print(f"  Trace: [link=file://outputs/trace.json]outputs/trace.json[/link]")
    console.print(f"  Board: [link=file://outputs/board_discussion.json]outputs/board_discussion.json[/link]")

    if hasattr(logger, 'wandb_url') and logger.wandb_url:
        console.print(f"  W&B: [link={logger.wandb_url}]{logger.wandb_url}[/link]")
        os.makedirs("demo", exist_ok=True)
        with open("demo/wandb_url.txt", "w") as f:
            f.write(logger.wandb_url + "\n")

    # Save to database
    try:
        from db.storage import save_simulation_run
        run_id = save_simulation_run(
            concept_name=startup_idea[:60],
            concept_text=startup_idea,
            scale="demo",
            num_personas=num_personas,
            num_rounds=num_rounds,
            total_events=total_events,
            total_pivots=pivots,
            total_tokens=total_tokens,
            total_cost=total_cost,
            sim_result=None,  # sim_result is local to phase 2 scope
            market_signal=None,
            cost_breakdown=costs,
            integration_status=status,
        )
        console.print(f"\n  [dim]Saved to database: run_id={run_id}[/dim]")
    except Exception as e:
        console.print(f"\n  [dim]Database save skipped: {e}[/dim]")

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


def _generate_sprint_report(
    startup_idea: str,
    trace: list,
    pivots: int,
    costs: dict,
    total_cost: float,
    total_tokens: int,
    human_equivalent: float,
    board_discussion: list[dict],
) -> None:
    """Generate outputs/sprint_report.md with full sprint analysis."""
    os.makedirs("outputs", exist_ok=True)

    # Collect strategy evolution from trace
    strategies = [e for e in trace if e.type.name == "STRATEGY_SET"]
    blockers = [e for e in trace if e.type.name == "BLOCKER"]
    pivot_events = [e for e in trace if e.type.name == "PIVOT"]
    sim_results = [e for e in trace if e.type.name == "SIMULATION_RESULT"]

    lines = []
    lines.append(f"# Ghost Board Sprint Report")
    lines.append(f"## Concept: {startup_idea}\n")

    # Executive summary
    lines.append("## Executive Summary\n")
    lines.append(f"Ghost Board ran an autonomous AI executive sprint for: **{startup_idea}**.")
    lines.append(f"Five AI agents (CEO, CTO, CFO, CMO, Legal) coordinated through {len(trace)} events,")
    lines.append(f"executing {pivots} strategic pivot(s) in response to regulatory blockers and market simulation feedback.")
    lines.append(f"Total API cost: **${total_cost:.4f}** ({total_tokens:,} tokens) vs estimated **${human_equivalent:,.0f}** consulting equivalent")
    lines.append(f"— **{human_equivalent / max(total_cost, 0.01):,.0f}x cheaper**.\n")

    # Strategy evolution
    lines.append("## Strategy Evolution\n")
    for i, strat in enumerate(strategies):
        p = strat.payload
        label = "Initial Strategy" if i == 0 else f"Post-Pivot #{i} Strategy"
        lines.append(f"### {label}")
        lines.append(f"- **Idea:** {getattr(p, 'startup_idea', 'N/A')}")
        lines.append(f"- **Market:** {getattr(p, 'target_market', 'N/A')}")
        lines.append(f"- **Model:** {getattr(p, 'business_model', 'N/A')}")
        diffs = getattr(p, 'key_differentiators', [])
        if diffs:
            lines.append(f"- **Differentiators:** {', '.join(diffs)}")
        lines.append("")

    # Pivot decisions
    if pivot_events:
        lines.append("## Pivot Decisions\n")
        for i, pev in enumerate(pivot_events):
            p = pev.payload
            lines.append(f"### Pivot #{i + 1}")
            lines.append(f"- **Reason:** {getattr(p, 'reason', 'N/A')}")
            lines.append(f"- **Affected agents:** {', '.join(getattr(p, 'affected_agents', []))}")
            changes = getattr(p, 'changes_required', {})
            if changes:
                for agent, change in changes.items():
                    lines.append(f"  - **{agent}:** {change}")
            lines.append("")

    # Regulatory blockers
    if blockers:
        lines.append("## Compliance Risks\n")
        for b in blockers:
            p = b.payload
            lines.append(f"- **[{getattr(p, 'severity', 'N/A')}]** {getattr(p, 'description', 'N/A')}")
            cites = getattr(p, 'citations', [])
            if cites:
                for c in cites[:3]:
                    lines.append(f"  - Citation: {c}")
        lines.append("")

    # Market simulation
    if sim_results:
        lines.append("## Market Simulation Results\n")
        for sr in sim_results:
            p = sr.payload
            lines.append(f"- **Overall sentiment:** {getattr(p, 'overall_sentiment', 0):.2f}")
            lines.append(f"- **Confidence:** {getattr(p, 'confidence', 0):.2f}")
            lines.append(f"- **Pivot recommended:** {'Yes' if getattr(p, 'pivot_recommended', False) else 'No'}")
            concerns = getattr(p, 'key_concerns', [])
            if concerns:
                lines.append(f"- **Key concerns:** {', '.join(concerns[:5])}")
            strengths = getattr(p, 'key_strengths', [])
            if strengths:
                lines.append(f"- **Key strengths:** {', '.join(strengths[:5])}")
        lines.append("")

    # Board discussion highlights
    if board_discussion:
        lines.append("## Board Discussion Highlights\n")
        for entry in board_discussion:
            agent = entry.get("agent", "?")
            etype = entry.get("event_type", "")
            msg = entry.get("message", "")
            if len(msg) > 300:
                msg = msg[:300] + "..."
            lines.append(f"- **[{agent}]** ({etype}): {msg}")
        lines.append("")

    # Cost breakdown
    lines.append("## Cost Breakdown\n")
    lines.append("| Agent | Tokens | Cost |")
    lines.append("|-------|--------|------|")
    for name, cost in costs.items():
        lines.append(f"| {name} | {cost['total_tokens']:,} | ${cost['estimated_cost_usd']:.4f} |")
    lines.append(f"| **Total** | **{total_tokens:,}** | **${total_cost:.4f}** |")
    lines.append("")

    # Artifacts produced
    lines.append("## Artifacts Produced\n")
    for folder in ["prototype", "financial_model", "gtm", "compliance"]:
        folder_path = Path("outputs") / folder
        if folder_path.exists():
            files = list(folder_path.iterdir())
            lines.append(f"### {folder.replace('_', ' ').title()}")
            for fp in files:
                if fp.name.startswith("."):
                    continue
                size = fp.stat().st_size if fp.is_file() else 0
                lines.append(f"- `{fp.name}` ({size:,} bytes)")
            lines.append("")

    lines.append("---")
    lines.append(f"*Generated by Ghost Board — Autonomous AI Executive Team*")
    lines.append(f"*Sprint cost: ${total_cost:.4f} | Events: {len(trace)} | Pivots: {pivots}*\n")

    report = "\n".join(lines)
    with open("outputs/sprint_report.md", "w", encoding="utf-8") as f:
        f.write(report)


async def _send_webhook(url: str, payload: dict) -> None:
    """POST a JSON payload to the webhook URL. Logs warning on failure."""
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status < 300:
                    console.print(f"  Webhook notification sent to {url}")
                else:
                    body = await resp.text()
                    console.print(
                        f"  [yellow]Webhook returned HTTP {resp.status}: {body[:200]}[/yellow]"
                    )
    except Exception as exc:
        console.print(f"  [yellow]Webhook failed ({type(exc).__name__}): {exc}[/yellow]")


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


def _start_live_server(port: int = 8080) -> threading.Thread:
    """Start a background HTTP server serving the dashboard/ directory."""
    dashboard_dir = Path(__file__).resolve().parent / "dashboard"
    if not dashboard_dir.exists():
        dashboard_dir.mkdir(parents=True, exist_ok=True)

    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(dashboard_dir))
    server = HTTPServer(("0.0.0.0", port), handler)
    server.daemon_threads = True

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return thread


def _open_dashboard(live: bool = False, port: int = 8080) -> str:
    """Open the dashboard in the default browser and return the URL."""
    if live:
        url = f"http://localhost:{port}"
    else:
        dashboard_path = Path(__file__).resolve().parent / "dashboard" / "index.html"
        url = dashboard_path.as_uri()
    webbrowser.open(url)
    return url


@click.command()
@click.argument("startup_idea", default="AI-powered regulatory compliance automation for fintech startups")
@click.option("--personas", "-p", default=30, help="Number of simulation personas")
@click.option("--rounds", "-r", default=5, help="Number of simulation rounds")
@click.option("--sim-scale", type=click.Choice(["demo", "standard", "large", "million"]), default=None, help="Hybrid sim scale: demo=1K crowd, standard=10K, large=100K, million=1M agents")
@click.option("--skip-simulation", is_flag=True, help="Skip market simulation phase")
@click.option("--demo", is_flag=True, help="Run with the Anchrix demo concept")
@click.option("--cached", is_flag=True, help="Play back cached demo results (no API calls)")
@click.option("--json-output", is_flag=True, help="Output sprint result as JSON")
@click.option("--concept", type=click.Choice(["anchrix", "coforge", "medpulse", "learnloop", "saas"]), default=None, help="Load a named demo concept")
@click.option("--no-browser", is_flag=True, help="Do not auto-open the dashboard in a browser after sprint")
@click.option("--live", is_flag=True, help="Start an HTTP server on port 8080 serving the dashboard with live updates")
@click.option("--webhook-url", default=None, help="POST a JSON summary to this URL after sprint completes")
@click.option("--serve", is_flag=True, help="Start the FastAPI API server (uvicorn) instead of running a sprint")
@click.option("--serve-port", default=8000, type=int, help="Port for --serve (default: 8000)")
def main(startup_idea: str, personas: int, rounds: int, sim_scale: str | None, skip_simulation: bool, demo: bool, cached: bool, json_output: bool, concept: str | None, no_browser: bool, live: bool, webhook_url: str | None, serve: bool, serve_port: int):
    """Ghost Board - Autonomous AI executive team sprint.

    Runs five AI agents (CEO, CTO, CFO, CMO, Legal) that coordinate to build
    and validate a startup in a single sprint.
    """
    # --serve: start the FastAPI server and exit
    if serve:
        import uvicorn
        console.print()
        console.print(Panel(
            f"[bold bright_white]Ghost Board Server[/bold bright_white]\n\n"
            f"  Dashboard:  [link=http://localhost:{serve_port}]http://localhost:{serve_port}[/link]\n"
            f"  API docs:   [link=http://localhost:{serve_port}/docs]http://localhost:{serve_port}/docs[/link]\n"
            f"  Health:     [link=http://localhost:{serve_port}/api/health]http://localhost:{serve_port}/api/health[/link]\n"
            f"  WebSocket:  ws://localhost:{serve_port}/ws/live/{{run_id}}\n\n"
            f"  [dim]Open the dashboard, type a concept, and click Launch Sprint.[/dim]",
            title="[bold green]SERVING[/bold green]",
            border_style="green",
            padding=(1, 2),
        ))
        console.print()
        uvicorn.run("server.app:app", host="0.0.0.0", port=serve_port, reload=False)
        return

    if cached or (demo and not os.environ.get("OPENAI_API_KEY")):
        _play_cached_demo()
        return

    # Load named concept
    CONCEPT_FILES = {
        "anchrix": "demo/anchrix_concept.txt",
        "coforge": "demo/coforge_concept.txt",
        "medpulse": "demo/healthtech_concept.txt",
        "learnloop": "demo/edtech_concept.txt",
        "saas": "demo/saas_concept.txt",
    }
    if concept:
        concept_path = Path(CONCEPT_FILES[concept])
        if concept_path.exists():
            startup_idea = concept_path.read_text().strip()
            click.echo(f"[Concept: {concept}] Loaded from {concept_path}")
        demo = False  # override

    if demo:
        demo_path = Path("demo/anchrix_concept.txt")
        if demo_path.exists():
            startup_idea = demo_path.read_text().strip()
            console.print(f"[dim]Demo mode: loaded concept from {demo_path}[/dim]")
        else:
            startup_idea = (
                "Anchrix: AI-powered identity verification and compliance platform "
                "for fintech. Uses biometric + document verification with real-time "
                "regulatory monitoring across CFPB, FinCEN, and state regulations."
            )
            console.print("[dim]Demo mode: using built-in Anchrix concept[/dim]")

    # Start live dashboard server if requested
    if live:
        try:
            _start_live_server(port=8080)
            console.print("[bold green]Live dashboard at http://localhost:8080[/bold green]")
        except OSError as e:
            console.print(f"[bold red]Could not start live server: {e}[/bold red]")

    # Check for required API key
    if not os.environ.get("OPENAI_API_KEY"):
        console.print("[bold red]Error:[/] OPENAI_API_KEY not set.")
        console.print("Copy .env.example to .env and add your OpenAI API key:")
        console.print("  [dim]cp .env.example .env[/dim]")
        console.print("  [dim]# Then edit .env and set OPENAI_API_KEY=sk-...[/dim]")
        raise SystemExit(1)

    sprint_start = time.time()
    result = asyncio.run(run_sprint(
        startup_idea=startup_idea,
        num_personas=personas,
        num_rounds=rounds,
        skip_simulation=skip_simulation,
        sim_scale=sim_scale,
    ))
    sprint_duration = time.time() - sprint_start

    # Save final summary
    os.makedirs("outputs", exist_ok=True)
    with open("outputs/sprint_summary.json", "w") as f:
        json.dump(result, f, indent=2, default=str)

    if json_output:
        click.echo(json.dumps(result, indent=2, default=str))

    # Send webhook notification if URL provided
    if webhook_url:
        # Collect output artifact paths
        artifact_paths: list[str] = []
        for folder in ["prototype", "financial_model", "gtm", "compliance"]:
            folder_path = Path("outputs") / folder
            if folder_path.exists():
                for fp in folder_path.iterdir():
                    if fp.is_file() and not fp.name.startswith("."):
                        artifact_paths.append(str(fp))
        for extra in ["outputs/trace.json", "outputs/sprint_report.md", "outputs/board_discussion.json"]:
            if Path(extra).exists():
                artifact_paths.append(extra)

        # Determine total agents simulated
        agents_simulated = personas
        if sim_scale and sim_scale in SCALE_PRESETS:
            llm_n, light_n, _ = SCALE_PRESETS[sim_scale]
            agents_simulated = llm_n + light_n

        # Extract final sentiment from result trace
        final_sentiment: float | None = None
        for evt in reversed(result.get("trace", [])):
            if evt.get("event_type") == "SIMULATION_RESULT":
                final_sentiment = evt.get("payload", {}).get("overall_sentiment")
                break

        webhook_payload = {
            "concept": startup_idea,
            "status": "completed",
            "pivots": result.get("pivots", 0),
            "events": result.get("events", 0),
            "agents_simulated": agents_simulated,
            "cost_usd": result.get("total_cost", 0.0),
            "sentiment": final_sentiment,
            "artifacts": artifact_paths,
            "wandb_url": result.get("wandb_url"),
            "duration_seconds": round(sprint_duration, 2),
        }
        asyncio.run(_send_webhook(webhook_url, webhook_payload))

    # Auto-open dashboard in browser
    if not no_browser:
        url = _open_dashboard(live=live, port=8080)
        console.print(f"\n  Dashboard opened: [link={url}]{url}[/link]")

    # If live server is running, keep the process alive
    if live:
        console.print("  [dim]Live server running at http://localhost:8080 - Press Ctrl+C to stop.[/dim]")
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            console.print("\n  [dim]Server stopped.[/dim]")


if __name__ == "__main__":
    main()
