"""
Regression tests for sprint output files.
These tests verify that when a sprint has been run, the outputs have correct structure.
All tests skip gracefully if outputs/ doesn't exist or sprint hasn't been run.
"""
import json
import re
import pytest
from pathlib import Path

OUTPUTS = Path("outputs")


def outputs_exist():
    return OUTPUTS.exists() and (OUTPUTS / "trace.json").exists()


# ---------------------------------------------------------------------------
# Test 1: trace.json has >= 20 events
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not outputs_exist(), reason="No sprint outputs found")
def test_trace_has_minimum_events():
    trace_path = OUTPUTS / "trace.json"
    data = json.loads(trace_path.read_text(encoding="utf-8"))
    assert isinstance(data, list), "trace.json must be a JSON array"
    assert len(data) >= 20, (
        f"Expected at least 20 events in trace.json, got {len(data)}. "
        "Run a full sprint first: python main.py \"some concept\""
    )


# ---------------------------------------------------------------------------
# Test 2: each event in trace.json has required fields
# ---------------------------------------------------------------------------

def test_trace_events_have_required_fields():
    trace_path = OUTPUTS / "trace.json"
    if not trace_path.exists():
        pytest.skip("trace.json not found — run a sprint first")

    data = json.loads(trace_path.read_text(encoding="utf-8"))
    assert isinstance(data, list), "trace.json must be a JSON array"

    # Accept either snake_case or camelCase variants for each required concept
    id_keys        = {"id", "event_id", "eventId"}
    type_keys      = {"type", "event_type", "eventType"}
    source_keys    = {"source", "agent", "agent_id", "agentId"}
    timestamp_keys = {"timestamp", "ts", "created_at", "createdAt", "time"}

    for i, event in enumerate(data):
        assert isinstance(event, dict), f"Event {i} is not a dict: {event!r}"

        assert id_keys & event.keys(), (
            f"Event {i} missing an id field (tried {id_keys}): {event}"
        )
        assert type_keys & event.keys(), (
            f"Event {i} missing a type field (tried {type_keys}): {event}"
        )
        assert source_keys & event.keys(), (
            f"Event {i} missing a source/agent field (tried {source_keys}): {event}"
        )
        assert timestamp_keys & event.keys(), (
            f"Event {i} missing a timestamp field (tried {timestamp_keys}): {event}"
        )


# ---------------------------------------------------------------------------
# Test 3: board_discussion.json valid structure
# ---------------------------------------------------------------------------

def test_board_discussion_valid():
    discussion_path = OUTPUTS / "board_discussion.json"
    if not discussion_path.exists():
        pytest.skip("board_discussion.json not found — run a sprint first")

    data = json.loads(discussion_path.read_text(encoding="utf-8"))
    assert isinstance(data, list), "board_discussion.json must be a JSON array"
    assert len(data) > 0, "board_discussion.json must not be empty"

    agent_keys   = {"agent", "speaker", "name", "agent_name"}
    message_keys = {"message", "content", "text", "body"}

    for i, entry in enumerate(data):
        assert isinstance(entry, dict), f"Entry {i} is not a dict: {entry!r}"
        assert agent_keys & entry.keys(), (
            f"Entry {i} missing an agent field (tried {agent_keys}): {entry}"
        )
        assert message_keys & entry.keys(), (
            f"Entry {i} missing a message/content field (tried {message_keys}): {entry}"
        )


# ---------------------------------------------------------------------------
# Test 4: financial model files are valid JSON with at least one numeric value
# ---------------------------------------------------------------------------

def test_financial_model_valid():
    fin_dir = OUTPUTS / "financial_model"
    if not fin_dir.exists():
        pytest.skip("outputs/financial_model/ directory not found")

    json_files = list(fin_dir.glob("*.json"))
    if not json_files:
        pytest.skip("No .json files found in outputs/financial_model/")

    def _has_numeric(obj):
        """Recursively search for at least one int or float value."""
        if isinstance(obj, (int, float)) and not isinstance(obj, bool):
            return True
        if isinstance(obj, dict):
            return any(_has_numeric(v) for v in obj.values())
        if isinstance(obj, list):
            return any(_has_numeric(item) for item in obj)
        return False

    for json_file in json_files:
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            pytest.fail(f"{json_file.name} is not valid JSON: {exc}")

        assert _has_numeric(data), (
            f"{json_file.name} parsed successfully but contains no numeric values. "
            "A financial model should include revenue projections, costs, etc."
        )


# ---------------------------------------------------------------------------
# Test 5: prototype directory has at least one code file
# ---------------------------------------------------------------------------

def test_prototype_has_code():
    proto_dir = OUTPUTS / "prototype"
    if not proto_dir.exists():
        pytest.skip("outputs/prototype/ directory not found")

    code_extensions = {
        ".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".rs",
        ".rb", ".java", ".c", ".cpp", ".h", ".cs", ".sh",
        ".sql", ".yaml", ".yml", ".json", ".toml",
    }

    code_files = [
        f for f in proto_dir.rglob("*")
        if f.is_file() and f.suffix.lower() in code_extensions
    ]

    assert len(code_files) >= 1, (
        f"outputs/prototype/ exists but contains no code files "
        f"(checked extensions: {sorted(code_extensions)}). "
        "CTO agent should have generated at least one source file."
    )


# ---------------------------------------------------------------------------
# Test 6: compliance output contains citations (http URLs or CFR references)
# ---------------------------------------------------------------------------

def test_compliance_has_citations():
    compliance_dir = OUTPUTS / "compliance"
    if not compliance_dir.exists():
        pytest.skip("outputs/compliance/ directory not found")

    all_files = list(compliance_dir.rglob("*"))
    text_files = [f for f in all_files if f.is_file()]
    if not text_files:
        pytest.skip("No files found in outputs/compliance/")

    citation_pattern = re.compile(
        r"https?://"                   # HTTP/HTTPS URL
        r"|cfr\b"                      # Code of Federal Regulations
        r"|\d+\s+c\.?f\.?r\.?"        # e.g. "31 CFR" or "31 C.F.R."
        r"|usc\b"                      # United States Code
        r"|\d+\s+u\.?s\.?c\.?"        # e.g. "12 U.S.C."
        r"|pub\.?\s*l\.?\s*\d+"       # Public Law reference
        r"|sec\.?\s+\d{3,}"            # SEC rule number
        r"|finra\b|cfpb\b|fincen\b"   # Regulator names
        r"|FinCEN|CFPB|FINRA|SEC\b"
        r"|bank\s+secrecy\s+act"
        r"|dodd.frank",
        re.IGNORECASE,
    )

    found_citation = False
    for text_file in text_files:
        try:
            content = text_file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if citation_pattern.search(content):
            found_citation = True
            break

    assert found_citation, (
        "outputs/compliance/ contains no regulatory citations. "
        "Legal agent should cite real regulations (URLs, CFR references, "
        "regulator names like FinCEN/CFPB/SEC, or statutory references)."
    )


# ---------------------------------------------------------------------------
# Test 7: sprint_report.md has substantial content (> 100 chars)
# ---------------------------------------------------------------------------

def test_sprint_report_substantial():
    report_path = OUTPUTS / "sprint_report.md"
    if not report_path.exists():
        pytest.skip("outputs/sprint_report.md not found — run a sprint first")

    content = report_path.read_text(encoding="utf-8")
    stripped = content.strip()

    assert len(stripped) > 100, (
        f"sprint_report.md only has {len(stripped)} characters after stripping. "
        "Expected a substantial report (>100 chars) covering strategy, pivots, "
        "financial summary, and next steps."
    )
