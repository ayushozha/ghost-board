#!/usr/bin/env python3
"""
Ghost Board - Dashboard Screenshot Capture Script

Captures screenshots of all dashboard screens and the landing page
using headless Chromium via Playwright.

Usage:
    python scripts/capture_demo.py

If Playwright is not installed, creates placeholder text files instead.
"""

import os
import sys
import time
import threading
import http.server
import socketserver
from pathlib import Path

# ── Resolve project paths ──────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DASHBOARD_DIR = PROJECT_ROOT / "dashboard"
LANDING_DIR = PROJECT_ROOT / "landing"
SCREENSHOTS_DIR = PROJECT_ROOT / "demo" / "screenshots"

DASHBOARD_PORT = 8081
LANDING_PORT = 8082
VIEWPORT = {"width": 1920, "height": 1080}

# Screenshots to capture: (filename, description, tab_id_or_none)
# tab_id is the id from the dashboard's mainTabs array, or None for special screens
DASHBOARD_SCREENS = [
    ("01_mission_control.png", "Mission Control - Launch Screen", None),
    ("02_boardroom.png", "Boardroom - Agent Discussion", "boardroom"),
    ("03_market_arena.png", "Market Arena - Simulation Globe", "arena"),
    ("04_pivot_timeline.png", "Pivot Timeline - Causal Chain", "pivots"),
    ("05_sprint_report.png", "Sprint Report - Artifacts", "report"),
]

LANDING_SCREEN = ("06_landing_page.png", "Landing Page")


def ensure_directories():
    """Create output directories if they don't exist."""
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)


def start_http_server(directory: Path, port: int) -> threading.Thread:
    """Start a simple HTTP server in a background thread serving the given directory."""

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(directory), **kwargs)

        def log_message(self, format, *args):
            # Suppress noisy request logs
            pass

    class ReusableServer(socketserver.TCPServer):
        allow_reuse_address = True

    server = ReusableServer(("127.0.0.1", port), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    # Give the server a moment to bind
    time.sleep(0.3)
    print(f"  HTTP server started on http://127.0.0.1:{port} -> {directory.name}/")
    return server


def capture_with_playwright():
    """Capture screenshots using Playwright headless Chromium."""
    from playwright.sync_api import sync_playwright

    ensure_directories()

    # Start HTTP servers for dashboard and landing page
    # The dashboard fetches ../outputs/ so we serve from PROJECT_ROOT
    # and navigate to /dashboard/index.html
    print("\nStarting HTTP servers...")
    root_server = start_http_server(PROJECT_ROOT, DASHBOARD_PORT)
    landing_server = start_http_server(PROJECT_ROOT, LANDING_PORT)

    captured = []
    failed = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport=VIEWPORT,
                device_scale_factor=1,
                color_scheme="dark",
            )
            page = context.new_page()

            # ── Dashboard screenshots ───────────────────────────────
            dashboard_url = f"http://127.0.0.1:{DASHBOARD_PORT}/dashboard/index.html"
            print(f"\nNavigating to dashboard: {dashboard_url}")
            page.goto(dashboard_url, wait_until="networkidle", timeout=15000)

            # Wait for React to mount - the mission control screen has the title
            try:
                page.wait_for_selector("text=GHOST BOARD", timeout=8000)
            except Exception:
                print("  Warning: Could not find 'GHOST BOARD' text, continuing anyway...")

            # Allow animations to settle
            time.sleep(1)

            for filename, description, tab_id in DASHBOARD_SCREENS:
                filepath = SCREENSHOTS_DIR / filename
                print(f"\n  Capturing: {description}")

                if tab_id is None:
                    # Mission Control - already on this screen after page load
                    time.sleep(0.5)
                    page.screenshot(path=str(filepath), full_page=False)
                else:
                    # We need to be on the dashboard view (past mission control)
                    # Check if we're still on mission control by looking for the launch button
                    launch_btn = page.query_selector("text=LAUNCH SPRINT")
                    if launch_btn:
                        print("    Clicking LAUNCH SPRINT to enter dashboard...")
                        launch_btn.click()
                        # Wait for the warp transition (1.2s) + rendering
                        time.sleep(2)
                        # Wait for tab navigation to appear
                        try:
                            page.wait_for_selector(".tab-active", timeout=8000)
                        except Exception:
                            print("    Warning: Tab navigation not found after launch")

                    # Click the appropriate tab
                    # Tabs are buttons inside .tab-nav-wrap with text matching the label
                    tab_labels = {
                        "boardroom": "Boardroom",
                        "arena": "Market Arena",
                        "pivots": "Pivot Trace",
                        "pivotflow": "Pivot Flow",
                        "sentiment": "Sentiment",
                        "analytics": "Analytics",
                        "report": "Sprint Report",
                    }
                    label = tab_labels.get(tab_id, tab_id)

                    # Find and click the tab button by its text content
                    tab_selector = f"button:has-text('{label}')"
                    try:
                        tab_btn = page.wait_for_selector(tab_selector, timeout=5000)
                        if tab_btn:
                            tab_btn.click()
                            print(f"    Switched to tab: {label}")
                    except Exception:
                        print(f"    Warning: Could not find tab '{label}', capturing current view")

                    # Wait for content to render
                    time.sleep(0.8)
                    page.screenshot(path=str(filepath), full_page=False)

                # Verify screenshot size
                if filepath.exists():
                    size_kb = filepath.stat().st_size / 1024
                    if size_kb > 10:
                        captured.append((filename, size_kb))
                        print(f"    Saved: {filepath.name} ({size_kb:.1f} KB)")
                    else:
                        failed.append((filename, f"Too small: {size_kb:.1f} KB"))
                        print(f"    WARNING: {filepath.name} is only {size_kb:.1f} KB (< 10 KB)")
                else:
                    failed.append((filename, "File not created"))
                    print(f"    ERROR: Screenshot file was not created")

            # ── Landing page screenshot ─────────────────────────────
            landing_url = f"http://127.0.0.1:{LANDING_PORT}/landing/index.html"
            landing_file = SCREENSHOTS_DIR / LANDING_SCREEN[0]
            print(f"\n  Capturing: {LANDING_SCREEN[1]}")
            print(f"  Navigating to: {landing_url}")

            try:
                page.goto(landing_url, wait_until="networkidle", timeout=15000)
                # Wait for landing page content
                try:
                    page.wait_for_selector("text=Ghost Board", timeout=5000)
                except Exception:
                    pass
                time.sleep(1)
                page.screenshot(path=str(landing_file), full_page=False)

                if landing_file.exists():
                    size_kb = landing_file.stat().st_size / 1024
                    if size_kb > 10:
                        captured.append((LANDING_SCREEN[0], size_kb))
                        print(f"    Saved: {landing_file.name} ({size_kb:.1f} KB)")
                    else:
                        failed.append((LANDING_SCREEN[0], f"Too small: {size_kb:.1f} KB"))
                        print(f"    WARNING: {landing_file.name} is only {size_kb:.1f} KB (< 10 KB)")
                else:
                    failed.append((LANDING_SCREEN[0], "File not created"))
            except Exception as e:
                failed.append((LANDING_SCREEN[0], str(e)))
                print(f"    ERROR: {e}")

            browser.close()

    finally:
        # Shut down HTTP servers
        root_server.shutdown()
        landing_server.shutdown()
        print("\n  HTTP servers stopped.")

    # ── Summary ─────────────────────────────────────────────────
    print("\n" + "=" * 60)
    total = len(DASHBOARD_SCREENS) + 1  # +1 for landing page
    if captured:
        all_over_10kb = all(kb > 10 for _, kb in captured)
        print(f"Captured {len(captured)}/{total} screenshots"
              f"{', all over 10KB' if all_over_10kb else ''}")
        for name, kb in captured:
            print(f"  {name}: {kb:.1f} KB")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for name, reason in failed:
            print(f"  {name}: {reason}")
    print(f"\nScreenshots saved to: {SCREENSHOTS_DIR}")
    print("=" * 60)

    return len(captured), len(failed)


def create_placeholders():
    """Create placeholder text files when Playwright is not available."""
    ensure_directories()

    all_screens = [
        (s[0], s[1]) for s in DASHBOARD_SCREENS
    ] + [LANDING_SCREEN]

    print("\nCreating placeholder files (Playwright not available)...")

    for filename, description in all_screens:
        # Replace .png with .txt for placeholders
        txt_filename = filename.replace(".png", ".txt")
        filepath = SCREENSHOTS_DIR / txt_filename
        filepath.write_text(
            f"Placeholder for: {description}\n"
            f"\n"
            f"This file would be a {VIEWPORT['width']}x{VIEWPORT['height']} PNG screenshot\n"
            f"of the Ghost Board dashboard.\n"
            f"\n"
            f"To generate real screenshots, install Playwright:\n"
            f"  pip install playwright\n"
            f"  playwright install chromium\n"
            f"\n"
            f"Then run:\n"
            f"  python scripts/capture_demo.py\n",
            encoding="utf-8",
        )
        print(f"  Created: {txt_filename}")

    print(f"\nCreated {len(all_screens)} placeholder files in {SCREENSHOTS_DIR}")


def main():
    print("Ghost Board - Dashboard Screenshot Capture")
    print("=" * 60)

    # Check that dashboard exists
    if not (DASHBOARD_DIR / "index.html").exists():
        print(f"ERROR: Dashboard not found at {DASHBOARD_DIR / 'index.html'}")
        print("Please build the dashboard first.")
        sys.exit(1)

    if not (LANDING_DIR / "index.html").exists():
        print(f"WARNING: Landing page not found at {LANDING_DIR / 'index.html'}")
        print("Landing page screenshot will be skipped.")

    # Check for Playwright
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
        print("Playwright detected. Using headless Chromium for screenshots.")
        captured, failed = capture_with_playwright()
        sys.exit(0 if failed == 0 else 1)
    except ImportError:
        print("\nPlaywright is NOT installed.")
        print("To install:")
        print("  pip install playwright")
        print("  playwright install chromium")
        print("\nFalling back to placeholder files...\n")
        create_placeholders()
        sys.exit(0)


if __name__ == "__main__":
    main()
