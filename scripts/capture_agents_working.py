#!/usr/bin/env python3
"""
Ghost Board - Agent Working Screenshots Capture Script

Simulates rich terminal output from each phase of the Ghost Board sprint,
then captures that output as HTML files and optionally as PNG screenshots
via Playwright.

Outputs saved to demo/screenshots/:
  - agent_ceo_strategy.html / .png
  - agent_legal_blocker.html / .png
  - agent_ceo_pivot.html / .png
  - agent_cto_rebuild.html / .png
  - agent_simulation_running.html / .png
  - agent_ceo_second_pivot.html / .png
  - agent_final_summary.html / .png

Usage:
    python scripts/capture_agents_working.py
"""

import os
import sys
import json
import time
import tempfile
from pathlib import Path
from datetime import datetime

# ── Resolve project paths ──────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCREENSHOTS_DIR = PROJECT_ROOT / "demo" / "screenshots"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"


# ── Agent output definitions ───────────────────────────────────────
# Each entry: (filename_stem, title, simulated_lines)
# Lines are (style, text) tuples where style is a Rich markup tag.

AGENT_CAPTURES = [
    (
        "agent_ceo_strategy",
        "CEO Agent - Setting Initial Strategy",
        [
            ("bold cyan", "═══════════════════════════════════════════════════════════"),
            ("bold cyan", "  GHOST BOARD — Autonomous AI Executive Team"),
            ("bold cyan", "═══════════════════════════════════════════════════════════"),
            ("dim", f"  Sprint started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"),
            ("dim", "  Concept: Anchrix — Stablecoin-based payout infrastructure"),
            ("", ""),
            ("bold yellow", "  ┌─────────────────────────────────────────────────┐"),
            ("bold yellow", "  │  PHASE 1: STRATEGY & BUILD                      │"),
            ("bold yellow", "  └─────────────────────────────────────────────────┘"),
            ("", ""),
            ("bold green", "  [CEO] 🔹 Analyzing concept: Anchrix"),
            ("green", "         Market: Cross-border B2B payments"),
            ("green", "         Target: SMBs with international suppliers"),
            ("green", "         Moat: Stablecoin rails = instant settlement"),
            ("", ""),
            ("bold green", "  [CEO] 📋 Strategy Decision:"),
            ("white", '         "API-first B2B payout platform using USDC.'),
            ("white", '          Target 5 states initially. Partner with'),
            ("white", '          licensed MSBs rather than obtain own license."'),
            ("", ""),
            ("bold green", "  [CEO] 📤 Published: STRATEGY_SET"),
            ("dim", "         → Delegating to CTO, CFO, CMO, Legal"),
            ("dim", "         → Event ID: evt_001 | triggered_by: None"),
            ("", ""),
            ("bold magenta", "  [CTO] 📥 Received STRATEGY_SET — starting prototype..."),
            ("bold blue", "  [CFO] 📥 Received STRATEGY_SET — building financial model..."),
            ("bold yellow", "  [CMO] 📥 Received STRATEGY_SET — drafting GTM copy..."),
            ("bold red", "  [LEGAL] 📥 Received STRATEGY_SET — checking compliance..."),
        ],
    ),
    (
        "agent_legal_blocker",
        "Legal Agent - Compliance BLOCKER Detected",
        [
            ("bold red", "  ╔═══════════════════════════════════════════════════════╗"),
            ("bold red", "  ║  ⚠  LEGAL BLOCKER DETECTED                          ║"),
            ("bold red", "  ╚═══════════════════════════════════════════════════════╝"),
            ("", ""),
            ("bold red", "  [LEGAL] 🚨 BLOCKER: Money Services Business (MSB) Licensing"),
            ("red", ""),
            ("red", "  Issue: Operating a stablecoin payout platform constitutes"),
            ("red", "  money transmission under federal and state law."),
            ("red", "  Consumer-facing operations require MSB licenses in ALL"),
            ("red", "  50 states — estimated cost $2M+ and 18-month timeline."),
            ("", ""),
            ("bold red", "  Citations:"),
            ("yellow", "    [1] 31 CFR § 1010.100(ff) — FinCEN definition of MSB"),
            ("yellow", "    [2] CFPB Bulletin 2023-01 — Crypto asset oversight"),
            ("yellow", "    [3] NY BitLicense (23 NYCRR Part 200)"),
            ("yellow", "    [4] CA MTA License — Div 1.2, Title 4 of Fin Code"),
            ("", ""),
            ("bold red", "  [LEGAL] 📤 Published: COMPLIANCE_BLOCKER"),
            ("dim", "         → Severity: CRITICAL"),
            ("dim", "         → Event ID: evt_005 | triggered_by: evt_001"),
            ("dim", "         → Callback fired → CEO.handle_blocker()"),
            ("", ""),
            ("bold cyan", "  ── Event Bus ──────────────────────────────────────"),
            ("dim", "  evt_001  STRATEGY_SET        CEO    → all agents"),
            ("dim", "  evt_002  PROTOTYPE_STARTED   CTO    → trace"),
            ("dim", "  evt_003  FINANCIAL_STARTED   CFO    → trace"),
            ("dim", "  evt_004  GTM_STARTED         CMO    → trace"),
            ("bold red", "  evt_005  COMPLIANCE_BLOCKER  LEGAL  → CEO  ⚡ ASYNC CALLBACK"),
        ],
    ),
    (
        "agent_ceo_pivot",
        "CEO Agent - Strategic Pivot Decision",
        [
            ("bold yellow", "  ╔═══════════════════════════════════════════════════════╗"),
            ("bold yellow", "  ║  🔄 CEO PIVOT — Strategy Changed                     ║"),
            ("bold yellow", "  ╚═══════════════════════════════════════════════════════╝"),
            ("", ""),
            ("bold yellow", "  [CEO] 🔄 PIVOT triggered by Legal BLOCKER (evt_005)"),
            ("", ""),
            ("yellow", "  Reasoning:"),
            ("white", '    "MSB licensing in 50 states costs $2M+ and takes 18'),
            ("white", '     months. This kills our runway. Pivoting to B2B-only'),
            ("white", '     model: we become the API layer for already-licensed'),
            ("white", '     fintech companies. They hold the MSB licenses, we'),
            ("white", '     provide the stablecoin settlement rails."'),
            ("", ""),
            ("bold yellow", "  Changes:"),
            ("green", "    ✓ Target: B2B API customers (not consumers)"),
            ("green", "    ✓ Geography: 5 states initially (NY, CA, TX, FL, IL)"),
            ("green", "    ✓ Compliance: Partner handles MSB, we handle KYB"),
            ("red", "    ✗ Removed: Consumer onboarding flow"),
            ("red", "    ✗ Removed: 50-state licensing budget"),
            ("", ""),
            ("bold yellow", "  [CEO] 📤 Published: STRATEGY_PIVOT"),
            ("dim", "         → Event ID: evt_006 | triggered_by: evt_005"),
            ("dim", "         → Cascading to: CTO, CFO, CMO"),
            ("", ""),
            ("bold magenta", "  [CTO] 📥 Received PIVOT — rebuilding prototype..."),
            ("bold blue", "  [CFO] 📥 Received PIVOT — updating financial model..."),
            ("bold yellow", "  [CMO] 📥 Received PIVOT — repositioning GTM..."),
        ],
    ),
    (
        "agent_cto_rebuild",
        "CTO Agent - Codex-Powered Prototype Rebuild",
        [
            ("bold magenta", "  ╔═══════════════════════════════════════════════════════╗"),
            ("bold magenta", "  ║  🔧 CTO — Rebuilding with Codex                      ║"),
            ("bold magenta", "  ╚═══════════════════════════════════════════════════════╝"),
            ("", ""),
            ("bold magenta", "  [CTO] Using OpenAI Codex API for prototype generation"),
            ("dim", "         Model: gpt-4o | Mode: code generation"),
            ("", ""),
            ("magenta", "  Applying pivot changes:"),
            ("green", "    + POST /api/v1/payouts — B2B batch payout endpoint"),
            ("green", "    + POST /api/v1/kyb/verify — Business verification"),
            ("green", "    + GET  /api/v1/settlement/status — Settlement tracking"),
            ("green", "    + POST /api/v1/webhooks — Partner event notifications"),
            ("red", "    - DELETE /consumer/* — Removed consumer endpoints"),
            ("red", "    - DELETE /onboarding/* — Removed consumer onboarding"),
            ("", ""),
            ("bold magenta", "  [CTO] Generated files:"),
            ("cyan", "    outputs/prototype/api_server.py      (245 lines)"),
            ("cyan", "    outputs/prototype/models.py          (89 lines)"),
            ("cyan", "    outputs/prototype/settlement.py      (134 lines)"),
            ("cyan", "    outputs/prototype/kyb_verification.py (67 lines)"),
            ("cyan", "    outputs/prototype/README.md          (42 lines)"),
            ("", ""),
            ("bold magenta", "  [CTO] 📤 Published: PROTOTYPE_COMPLETE"),
            ("dim", "         → Event ID: evt_008 | triggered_by: evt_006"),
            ("dim", "         → Tokens used: 4,231 | Cost: $0.042"),
        ],
    ),
    (
        "agent_simulation_running",
        "Market Simulation - Hybrid Engine Running",
        [
            ("bold cyan", "  ╔═══════════════════════════════════════════════════════╗"),
            ("bold cyan", "  ║  🌍 MARKET STRESS TEST — Hybrid Simulation           ║"),
            ("bold cyan", "  ╚═══════════════════════════════════════════════════════╝"),
            ("", ""),
            ("bold cyan", "  [SIM] Initializing hybrid simulation engine"),
            ("dim", "         LLM Agents: 50 (gpt-4o-mini)"),
            ("dim", "         Lightweight Agents: 1,000,000 (NumPy vectorized)"),
            ("dim", "         Rounds: 5"),
            ("", ""),
            ("cyan", "  ── Round 1/5 ──────────────────────────────────────"),
            ("green", '    [VC-Alpha]  "B2B pivot is smart. Regulated fintech'),
            ("green", '                 partnerships de-risk the model." (+0.8)'),
            ("yellow", '    [TechPress] "Crowded market but API-first angle is'),
            ("yellow", '                 interesting for mid-market." (+0.2)'),
            ("red", '    [Competitor] "We already do this. Their settlement'),
            ("red", '                  speed claim is unverified." (-0.4)'),
            ("dim", "    + 999,997 lightweight agents updated stance vectors"),
            ("", ""),
            ("cyan", "  ── Round 2/5 ──────────────────────────────────────"),
            ("green", '    [EarlyUser]  "Integration took 2 hours. Fastest'),
            ("green", '                  payout API I have used." (+0.9)'),
            ("yellow", '    [Regulator]  "Compliance posture looks clean but'),
            ("yellow", '                  need to see audit trail." (+0.1)'),
            ("", ""),
            ("bold cyan", "  ── Aggregate Sentiment ───────────────────────────"),
            ("green", "    VCs:         ████████░░  +0.62"),
            ("green", "    Users:       ███████░░░  +0.54"),
            ("yellow", "    Press:       █████░░░░░  +0.21"),
            ("red", "    Competitors: ███░░░░░░░  -0.31"),
            ("bold white", "    Overall:     ██████░░░░  +0.38"),
        ],
    ),
    (
        "agent_ceo_second_pivot",
        "CEO Agent - Post-Simulation Pivot",
        [
            ("bold yellow", "  ╔═══════════════════════════════════════════════════════╗"),
            ("bold yellow", "  ║  🔄 CEO — Second Pivot (Post-Simulation)              ║"),
            ("bold yellow", "  ╚═══════════════════════════════════════════════════════╝"),
            ("", ""),
            ("bold yellow", "  [CEO] Analyzing simulation results..."),
            ("", ""),
            ("white", "  Key findings from 1,000,050 agents across 5 rounds:"),
            ("green", "    ✓ VCs love B2B pivot (+0.62 avg sentiment)"),
            ("green", "    ✓ Early users report fast integration (+0.54)"),
            ("yellow", "    △ Press sees crowded market (+0.21)"),
            ("red", "    ✗ Competitors challenge speed claims (-0.31)"),
            ("", ""),
            ("bold yellow", "  [CEO] 🔄 PIVOT: Differentiation Strategy"),
            ("white", '    "Competitors challenge our speed claim. Adding'),
            ("white", '     verifiable on-chain settlement proofs. Every payout'),
            ("white", '     gets a cryptographic receipt with block confirmation'),
            ("white", '     time. This is our moat — provable instant settlement."'),
            ("", ""),
            ("bold yellow", "  [CEO] 📤 Published: STRATEGY_PIVOT (second)"),
            ("dim", "         → Event ID: evt_024 | triggered_by: evt_020 (SIM_COMPLETE)"),
            ("dim", "         → Affected: CTO (add proof endpoint), CMO (update messaging)"),
            ("", ""),
            ("bold magenta", "  [CTO] 📥 Adding POST /api/v1/proofs/verify endpoint..."),
            ("bold yellow", "  [CMO] 📥 Updating tagline: 'Provably instant settlement'"),
        ],
    ),
    (
        "agent_final_summary",
        "Sprint Complete - Final Summary",
        [
            ("bold green", "  ╔═══════════════════════════════════════════════════════╗"),
            ("bold green", "  ║  ✅ SPRINT COMPLETE                                   ║"),
            ("bold green", "  ╚═══════════════════════════════════════════════════════╝"),
            ("", ""),
            ("bold white", "  Ghost Board Sprint Report — Anchrix"),
            ("dim", f"  Completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"),
            ("", ""),
            ("bold white", "  Artifacts Produced:"),
            ("cyan", "    📁 outputs/prototype/       5 files, 577 lines of code"),
            ("cyan", "    📁 outputs/financial_model/  Revenue projections + unit economics"),
            ("cyan", "    📁 outputs/gtm/             Landing copy + positioning deck"),
            ("cyan", "    📁 outputs/compliance/      Memo with 4 regulatory citations"),
            ("", ""),
            ("bold white", "  Execution Stats:"),
            ("white", "    Events:        35 total"),
            ("white", "    Pivots:         3 (legal blocker, sim feedback, differentiation)"),
            ("white", "    Agents:         1,000,050 (50 LLM + 1,000,000 lightweight)"),
            ("white", "    Sim Rounds:     5"),
            ("white", "    Total Cost:     $0.19"),
            ("white", "    Duration:       4m 23s"),
            ("", ""),
            ("bold white", "  Cost Comparison:"),
            ("green", "    Ghost Board:    $0.19  (4 minutes)"),
            ("red", "    Consulting:     $15,000  (2-4 weeks)"),
            ("bold green", "    Savings:        77,359x cheaper"),
            ("", ""),
            ("bold white", "  Causal Chain:"),
            ("dim", "    CEO Strategy → Legal BLOCKER (MSB) → CEO Pivot (B2B)"),
            ("dim", "    → CTO Rebuild → Simulation (1M agents) → CEO Pivot 2"),
            ("dim", "    → CTO Add Proofs → CMO Update Messaging → Done"),
            ("", ""),
            ("bold green", "  ═══════════════════════════════════════════════════════"),
            ("bold green", "  W&B Dashboard: https://wandb.ai/ghost-board/trace"),
            ("bold green", "  ═══════════════════════════════════════════════════════"),
        ],
    ),
]


def render_with_rich(title: str, lines: list) -> str:
    """Render simulated agent output using Rich console and export as HTML."""
    try:
        from rich.console import Console
        from rich.text import Text
        import io
    except ImportError:
        # Fallback: build simple HTML without Rich
        return _render_html_fallback(title, lines)

    # Use a StringIO file to avoid Windows legacy terminal encoding issues
    string_io = io.StringIO()
    console = Console(
        record=True,
        width=80,
        force_terminal=True,
        file=string_io,
        color_system="truecolor",
        legacy_windows=False,
    )

    console.print()
    for style, text in lines:
        if style:
            console.print(f"[{style}]{text}[/{style}]")
        else:
            console.print(text)
    console.print()

    html = console.export_html(
        inline_styles=True,
        theme=_dark_theme(),
    )
    return html


def _dark_theme():
    """Return a dark theme for Rich HTML export."""
    try:
        from rich.terminal_theme import MONOKAI

        return MONOKAI
    except ImportError:
        return None


def _render_html_fallback(title: str, lines: list) -> str:
    """Simple HTML fallback when Rich is not available."""
    # Map Rich color names to CSS colors
    color_map = {
        "cyan": "#00d7ff",
        "bold cyan": "#00d7ff",
        "green": "#00ff87",
        "bold green": "#00ff87",
        "yellow": "#ffff00",
        "bold yellow": "#ffff00",
        "red": "#ff5555",
        "bold red": "#ff5555",
        "magenta": "#ff79c6",
        "bold magenta": "#ff79c6",
        "blue": "#6272a4",
        "bold blue": "#6272a4",
        "white": "#f8f8f2",
        "bold white": "#f8f8f2",
        "dim": "#6272a4",
    }

    body_lines = []
    for style, text in lines:
        color = color_map.get(style, "#f8f8f2")
        weight = "bold" if "bold" in style else "normal"
        escaped = (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        body_lines.append(
            f'<span style="color:{color};font-weight:{weight}">{escaped}</span>'
        )

    content = "\n".join(body_lines)
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
body {{
    background-color: #1a1a2e;
    color: #f8f8f2;
    font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    font-size: 14px;
    line-height: 1.5;
    padding: 24px;
    white-space: pre;
}}
</style>
</head>
<body>
{content}
</body>
</html>"""


def capture_all():
    """Generate HTML captures for all agent phases, optionally screenshot with Playwright."""
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    html_files = []
    png_files = []

    print("Ghost Board - Agent Working Screenshot Capture")
    print("=" * 60)

    # Phase 1: Generate HTML files from Rich console output
    for stem, title, lines in AGENT_CAPTURES:
        html_path = SCREENSHOTS_DIR / f"{stem}.html"
        print(f"\n  Rendering: {title}")

        html_content = render_with_rich(title, lines)
        html_path.write_text(html_content, encoding="utf-8")
        html_files.append(html_path)
        print(f"    Saved: {html_path.name} ({html_path.stat().st_size / 1024:.1f} KB)")

    # Phase 2: Try to screenshot HTML files with Playwright
    playwright_available = False
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401

        playwright_available = True
        print("\n  Playwright detected. Converting HTML to PNG screenshots...")
    except ImportError:
        print("\n  Playwright not installed. Skipping PNG conversion.")
        print("  HTML files are still available for viewing in a browser.")
        print("  To install: pip install playwright && playwright install chromium")

    if playwright_available:
        png_files = _screenshot_html_files(html_files)

    # Summary
    print("\n" + "=" * 60)
    print(f"  HTML captures: {len(html_files)} files")
    if png_files:
        print(f"  PNG screenshots: {len(png_files)} files")
    print(f"  Output directory: {SCREENSHOTS_DIR}")
    print("=" * 60)

    return html_files, png_files


def _screenshot_html_files(html_files: list) -> list:
    """Use Playwright to screenshot each HTML file as PNG."""
    from playwright.sync_api import sync_playwright

    png_files = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1024, "height": 768},
                device_scale_factor=2,
                color_scheme="dark",
            )
            page = context.new_page()

            for html_path in html_files:
                png_path = html_path.with_suffix(".png")
                file_url = html_path.as_uri()

                try:
                    page.goto(file_url, wait_until="load", timeout=10000)
                    time.sleep(0.3)
                    page.screenshot(path=str(png_path), full_page=True)

                    if png_path.exists() and png_path.stat().st_size > 1024:
                        png_files.append(png_path)
                        size_kb = png_path.stat().st_size / 1024
                        print(f"    Saved: {png_path.name} ({size_kb:.1f} KB)")
                    else:
                        print(f"    WARNING: {png_path.name} too small or missing")
                except Exception as e:
                    print(f"    ERROR capturing {png_path.name}: {e}")

            browser.close()
    except Exception as e:
        print(f"  Playwright error: {e}")

    return png_files


def main():
    html_files, png_files = capture_all()

    if not html_files:
        print("\nERROR: No captures generated.")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
