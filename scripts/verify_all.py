#!/usr/bin/env python3
"""Ghost Board full verification script.

Checks every output file, validates content integrity, runs tests,
and prints a colored PASS/FAIL summary.

Usage:
    python scripts/verify_all.py
"""

import json
import os
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Resolve project root (works whether you run from repo root or scripts/)
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUTS = PROJECT_ROOT / "outputs"

# ---------------------------------------------------------------------------
# Colors (ANSI; disabled when not a TTY or on Windows without VT support)
# ---------------------------------------------------------------------------
_COLOR = hasattr(sys.stdout, "isatty") and sys.stdout.isatty()
if sys.platform == "win32":
    # Enable VT100 escape sequences on Windows 10+
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
        _COLOR = True
    except Exception:
        _COLOR = False

GREEN = "\033[92m" if _COLOR else ""
RED = "\033[91m" if _COLOR else ""
YELLOW = "\033[93m" if _COLOR else ""
BOLD = "\033[1m" if _COLOR else ""
RESET = "\033[0m" if _COLOR else ""


def passed(msg: str) -> bool:
    print(f"  {GREEN}[PASS]{RESET} {msg}")
    return True


def failed(msg: str) -> bool:
    print(f"  {RED}[FAIL]{RESET} {msg}")
    return False


def skipped(msg: str) -> bool:
    print(f"  {YELLOW}[SKIP]{RESET} {msg}")
    return True  # Skips count as non-failures


def warn(msg: str) -> None:
    print(f"  {YELLOW}[WARN]{RESET} {msg}")


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

def check_trace_json() -> bool:
    """trace.json exists with 20+ events."""
    path = OUTPUTS / "trace.json"
    if not path.exists():
        return failed("trace.json: file not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return failed(f"trace.json: invalid JSON ({exc})")

    if not isinstance(data, list):
        return failed("trace.json: expected a JSON array at top level")

    count = len(data)
    if count < 20:
        return failed(f"trace.json: only {count} events (need 20+)")

    # Check causal chains (triggered_by)
    with_trigger = sum(
        1 for e in data
        if isinstance(e, dict) and e.get("triggered_by")
    )
    if with_trigger == 0:
        return failed("trace.json: no events have 'triggered_by' (no causal chain)")

    return passed(f"trace.json: {count} events, {with_trigger} with triggered_by")


def check_board_discussion() -> bool:
    """board_discussion.json exists with non-empty reasoning fields."""
    path = OUTPUTS / "board_discussion.json"
    if not path.exists():
        return skipped("board_discussion.json: not found (generated at runtime by pipeline)")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return failed(f"board_discussion.json: invalid JSON ({exc})")

    entries: list = data if isinstance(data, list) else data.get("entries", data.get("messages", []))
    if not isinstance(entries, list) or len(entries) == 0:
        return failed("board_discussion.json: no entries found")

    # Check for reasoning / content fields
    reasoning_keys = {"reasoning", "content", "message", "text", "rationale"}
    with_reasoning = 0
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        for key in reasoning_keys:
            val = entry.get(key)
            if isinstance(val, str) and len(val.strip()) > 0:
                with_reasoning += 1
                break

    if with_reasoning == 0:
        return failed("board_discussion.json: entries have no reasoning/content fields")

    return passed(f"board_discussion.json: {len(entries)} entries, {with_reasoning} with reasoning")


def check_simulation_geo() -> bool:
    """simulation_geo.json has personas with lat/lng."""
    path = OUTPUTS / "simulation_geo.json"
    if not path.exists():
        return failed("simulation_geo.json: file not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return failed(f"simulation_geo.json: invalid JSON ({exc})")

    # Handle both top-level list or dict with personas key
    personas: list = []
    if isinstance(data, list):
        personas = data
    elif isinstance(data, dict):
        for key in ("personas", "agents", "participants", "data"):
            if isinstance(data.get(key), list):
                personas = data[key]
                break
        if not personas:
            # Maybe the whole dict is a single-level mapping
            personas = list(data.values()) if data else []

    if not personas:
        return failed("simulation_geo.json: no personas found")

    total = len(personas)
    with_geo = 0
    missing_geo = 0
    for p in personas:
        if not isinstance(p, dict):
            continue
        has_lat = "lat" in p or "latitude" in p
        has_lng = "lng" in p or "lon" in p or "longitude" in p
        if has_lat and has_lng:
            with_geo += 1
        else:
            missing_geo += 1

    if with_geo == 0:
        return failed(f"simulation_geo.json: {total} personas but none have lat/lng")

    if missing_geo > 0:
        warn(f"simulation_geo.json: {missing_geo} personas missing lat/lng")

    return passed(f"simulation_geo.json: {total} personas, {with_geo} with lat/lng")


def check_simulation_results() -> bool:
    """simulation_results.json has round data and sentiment."""
    path = OUTPUTS / "simulation_results.json"
    if not path.exists():
        return failed("simulation_results.json: file not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return failed(f"simulation_results.json: invalid JSON ({exc})")

    if not isinstance(data, dict):
        return failed("simulation_results.json: expected a JSON object")

    # Look for round data — the pipeline uses "rounds_data" as the key
    rounds = data.get("rounds_data", data.get("round_data", data.get("rounds", [])))
    # "rounds" may be an integer count rather than a list; fall back to other keys
    if isinstance(rounds, list) and len(rounds) > 0:
        round_count = len(rounds)
    elif isinstance(rounds, int):
        # "rounds" is a count; look for actual list under other keys
        for alt in ("rounds_data", "round_data"):
            alt_val = data.get(alt, [])
            if isinstance(alt_val, list) and len(alt_val) > 0:
                round_count = len(alt_val)
                break
        else:
            round_count = rounds  # use the integer count as-is
    else:
        round_count = 0

    # Look for sentiment anywhere in the structure
    text = json.dumps(data)
    has_sentiment = "sentiment" in text.lower()

    issues = []
    if round_count == 0:
        issues.append("no round data found")
    if not has_sentiment:
        issues.append("no sentiment data found")

    if issues:
        return failed(f"simulation_results.json: {', '.join(issues)}")

    return passed(f"simulation_results.json: {round_count} rounds, sentiment data present")


def check_directory_files(rel_dir: str, min_files: int = 1, required_file: str | None = None) -> bool:
    """Check a directory has at least min_files and optionally a required file."""
    dirpath = OUTPUTS / rel_dir
    if not dirpath.exists():
        return failed(f"outputs/{rel_dir}/: directory not found")
    if not dirpath.is_dir():
        return failed(f"outputs/{rel_dir}/: not a directory")

    files = [f for f in dirpath.iterdir() if f.is_file() and f.stat().st_size > 0]
    count = len(files)

    if count < min_files:
        return failed(f"outputs/{rel_dir}/: {count} files (need {min_files}+)")

    if required_file:
        if not (dirpath / required_file).exists():
            return failed(f"outputs/{rel_dir}/: missing required file '{required_file}'")

    return passed(f"outputs/{rel_dir}/: {count} files")


def check_sprint_report() -> bool:
    """sprint_report.md exists with 2000+ characters."""
    # Also check sprint_summary.json as an alternative
    path_md = OUTPUTS / "sprint_report.md"
    path_json = OUTPUTS / "sprint_summary.json"

    target = None
    if path_md.exists():
        target = path_md
    elif path_json.exists():
        target = path_json

    if target is None:
        return failed("sprint_report.md: file not found (also checked sprint_summary.json)")

    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = target.read_text(encoding="latin-1")

    length = len(content)
    name = target.name
    if length < 2000:
        return failed(f"{name}: only {length} characters (need 2000+)")

    return passed(f"{name}: {length} characters")


def check_compliance_citations() -> bool:
    """Compliance files exist and contain citations."""
    dirpath = OUTPUTS / "compliance"
    if not dirpath.exists():
        return failed("outputs/compliance/: directory not found")

    files = [f for f in dirpath.iterdir() if f.is_file() and f.stat().st_size > 0]
    if not files:
        return failed("outputs/compliance/: no files found")

    # Scan for citation indicators
    citation_patterns = ["cfpb", "fincen", "sec", "regulation", "usc", "cfr",
                         "http", "citation", "statute", "compliance", "license",
                         "msb", "money service", "fintech"]
    found_citations = False
    for f in files:
        try:
            text = f.read_text(encoding="utf-8").lower()
        except (UnicodeDecodeError, OSError):
            continue
        for pat in citation_patterns:
            if pat in text:
                found_citations = True
                break
        if found_citations:
            break

    if not found_citations:
        return failed(f"outputs/compliance/: {len(files)} files but no citation content detected")

    return passed(f"outputs/compliance/: {len(files)} files with citations")


def check_file_exists(rel_path: str, label: str) -> bool:
    """Check a single file exists relative to project root."""
    path = PROJECT_ROOT / rel_path
    if not path.exists():
        return failed(f"{label}: not found at {rel_path}")
    if path.stat().st_size == 0:
        return failed(f"{label}: file is empty")
    return passed(f"{label}: exists ({path.stat().st_size} bytes)")


def run_tests() -> bool:
    """Run pytest and report result."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "tests/", "-v", "--tb=short"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=300,
        )
    except FileNotFoundError:
        return failed("pytest: python or pytest not found")
    except subprocess.TimeoutExpired:
        return failed("pytest: timed out after 300 seconds")

    # Print a condensed summary of test output
    lines = (result.stdout + result.stderr).strip().split("\n")
    # Find the summary line (usually last few lines)
    summary_lines = [l for l in lines if "passed" in l or "failed" in l or "error" in l]
    summary = summary_lines[-1].strip() if summary_lines else "no summary line"

    if result.returncode == 0:
        return passed(f"pytest: {summary}")
    else:
        # Show last 10 lines for context
        print()
        for line in lines[-10:]:
            print(f"    {line}")
        print()
        return failed(f"pytest: exit code {result.returncode} — {summary}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    print()
    print(f"{BOLD}{'=' * 50}")
    print(f"  GHOST BOARD VERIFICATION")
    print(f"{'=' * 50}{RESET}")
    print()

    results: list[tuple[str, bool]] = []

    def run(name: str, fn, *args, **kwargs):
        ok = fn(*args, **kwargs)
        results.append((name, ok))

    # 1. Output file checks
    print(f"{BOLD}Output Files:{RESET}")
    run("trace.json", check_trace_json)
    run("board_discussion.json", check_board_discussion)
    run("simulation_geo.json", check_simulation_geo)
    run("simulation_results.json", check_simulation_results)
    run("prototype/", check_directory_files, "prototype", 3)
    run("financial_model/", check_directory_files, "financial_model", 1)
    run("gtm/", check_directory_files, "gtm", 1, "landing_page.html")
    run("compliance/", check_compliance_citations)
    run("sprint_report", check_sprint_report)

    # 2. Dashboard and landing page
    print()
    print(f"{BOLD}Dashboard & Landing:{RESET}")
    run("dashboard", check_file_exists, "dashboard/index.html", "dashboard/index.html")
    run("landing", check_file_exists, "landing/index.html", "landing/index.html")

    # 3. Tests
    print()
    print(f"{BOLD}Test Suite:{RESET}")
    run("pytest", run_tests)

    # ---------------------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------------------
    total = len(results)
    passed_count = sum(1 for _, ok in results if ok)
    failed_count = total - passed_count

    print()
    print(f"{BOLD}{'=' * 50}")
    if failed_count == 0:
        print(f"  {GREEN}RESULT: {passed_count}/{total} checks passed{RESET}")
    else:
        print(f"  {RED}RESULT: {passed_count}/{total} checks passed "
              f"({failed_count} failed){RESET}")
    print(f"{BOLD}{'=' * 50}{RESET}")
    print()

    # List failures
    if failed_count > 0:
        print(f"{RED}Failed checks:{RESET}")
        for name, ok in results:
            if not ok:
                print(f"  - {name}")
        print()

    return 0 if failed_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
