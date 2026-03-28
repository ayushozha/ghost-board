"""CTO Agent: Codex-powered multi-file prototype generation with pivot support."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from coordination.events import (
    AgentEvent,
    EventType,
    PivotPayload,
    PrototypePayload,
    StrategyPayload,
)
from coordination.state import StateBus
from coordination.trace import TraceLogger

from agents.base import BaseAgent


# ---------------------------------------------------------------------------
# Prompt templates for each file the CTO generates
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are a Codex-powered senior Python engineer. "
    "Output ONLY valid, runnable Python (or text for non-.py files). "
    "No markdown fences. No commentary. Just the file content."
)

_FILE_SPECS: list[dict[str, str]] = [
    {
        "filename": "app.py",
        "instruction": (
            "Create a FastAPI application entry point. "
            "Import and mount all routers from routes/. "
            "Include CORS middleware, a lifespan handler that prints startup/shutdown, "
            "and a root endpoint that returns {{\"service\": \"<name>\", \"version\": \"0.1.0\"}}. "
            "Use proper type hints and docstrings."
        ),
    },
    {
        "filename": "models.py",
        "instruction": (
            "Create Pydantic v2 models (at least 5) for the core domain entities. "
            "Include validators, Field descriptions, example values via model_config, "
            "and relationships between models (e.g. a Transaction references a User). "
            "Include both request and response models where appropriate. "
            "Add created_at/updated_at datetime fields with defaults."
        ),
    },
    {
        "filename": "config.py",
        "instruction": (
            "Create a Settings class using pydantic-settings (BaseSettings). "
            "Load from environment variables with sensible defaults: "
            "APP_NAME, DEBUG, DATABASE_URL, API_KEY, RATE_LIMIT_PER_MINUTE, "
            "LOG_LEVEL, ALLOWED_ORIGINS. "
            "Include a get_settings() cached function."
        ),
    },
    {
        "filename": "routes/__init__.py",
        "instruction": (
            "Create an __init__.py that imports all routers from the routes package "
            "and exposes them in an __all__ list."
        ),
    },
    {
        "filename": "routes/users.py",
        "instruction": (
            "Create a FastAPI APIRouter with prefix '/api/v1/users'. "
            "Endpoints: POST / (create user), GET / (list with pagination), "
            "GET /{{user_id}} (get by id), PATCH /{{user_id}} (update), "
            "DELETE /{{user_id}} (soft-delete). "
            "Use proper request/response models from models.py. "
            "Include HTTPException for 404/400 errors. "
            "Use an in-memory dict as a fake datastore for now."
        ),
    },
    {
        "filename": "routes/transactions.py",
        "instruction": (
            "Create a FastAPI APIRouter with prefix '/api/v1/transactions'. "
            "Endpoints: POST / (create transaction), GET / (list with filters: "
            "status, date range, user_id, pagination), "
            "GET /{{tx_id}} (get by id), POST /{{tx_id}}/approve, POST /{{tx_id}}/reject. "
            "Include business logic validation (amount > 0, valid currency, etc.). "
            "Use in-memory dict store."
        ),
    },
    {
        "filename": "routes/health.py",
        "instruction": (
            "Create a FastAPI APIRouter with prefix '/api/v1'. "
            "Endpoints: GET /health (basic), GET /health/ready (checks dependencies), "
            "GET /metrics (request count, uptime, memory usage via psutil-free approach). "
            "Return structured JSON with timestamps."
        ),
    },
    {
        "filename": "requirements.txt",
        "instruction": (
            "Generate a requirements.txt for this FastAPI project. Include: "
            "fastapi, uvicorn[standard], pydantic, pydantic-settings, "
            "python-dotenv, httpx (for testing), pytest, pytest-asyncio. "
            "Pin to recent stable versions. One package per line."
        ),
    },
    {
        "filename": "test_app.py",
        "instruction": (
            "Create a pytest test file using httpx.AsyncClient and FastAPI TestClient. "
            "Write at least 6 tests: "
            "1) test root endpoint returns service name, "
            "2) test health endpoint returns ok, "
            "3) test create user with valid data returns 201, "
            "4) test create user with invalid data returns 422, "
            "5) test create transaction with valid data, "
            "6) test get nonexistent resource returns 404. "
            "Use pytest.mark.asyncio and proper assertions."
        ),
    },
    {
        "filename": "README.md",
        "instruction": (
            "Generate a README.md in markdown. Sections: "
            "# <Project Name>, ## Overview (2-3 sentences), "
            "## Quick Start (pip install, uvicorn run), "
            "## API Endpoints (table with Method, Path, Description), "
            "## Configuration (env vars table), "
            "## Running Tests (pytest command), "
            "## Architecture (brief description of file layout)."
        ),
    },
]


def _build_file_prompt(
    spec: dict[str, str],
    strategy: StrategyPayload,
    generated_so_far: dict[str, str],
) -> str:
    """Build the user prompt for generating a single file."""
    context_files = ""
    if generated_so_far:
        # Give the LLM awareness of files already generated so imports align
        names = ", ".join(generated_so_far.keys())
        context_files = (
            f"\n\nFiles already generated in this project: {names}\n"
            "Make sure your imports are consistent with those files.\n"
        )
        # Include models.py and config.py content for route files to reference
        for key in ("models.py", "config.py", "app.py"):
            if key in generated_so_far:
                context_files += f"\n--- {key} ---\n{generated_so_far[key][:3000]}\n"

    return (
        f"You are building a prototype for this startup:\n"
        f"  Idea: {strategy.startup_idea}\n"
        f"  Target market: {strategy.target_market}\n"
        f"  Business model: {strategy.business_model}\n"
        f"  Differentiators: {', '.join(strategy.key_differentiators)}\n"
        f"  Constraints: {', '.join(strategy.constraints)}\n"
        f"{context_files}\n"
        f"Generate the file '{spec['filename']}'.\n"
        f"Requirements: {spec['instruction']}\n\n"
        f"Output ONLY the raw file content. No markdown fences, no explanation."
    )


def _build_pivot_prompt(
    filename: str,
    old_content: str,
    pivot_instruction: str,
    strategy: StrategyPayload,
) -> str:
    """Build prompt for modifying an existing file during a pivot."""
    return (
        f"You are modifying an existing prototype file during a strategic pivot.\n\n"
        f"Startup: {strategy.startup_idea}\n"
        f"Target market: {strategy.target_market}\n"
        f"Business model: {strategy.business_model}\n"
        f"Differentiators: {', '.join(strategy.key_differentiators)}\n"
        f"Constraints: {', '.join(strategy.constraints)}\n\n"
        f"PIVOT INSTRUCTION: {pivot_instruction}\n\n"
        f"--- Current content of {filename} ---\n"
        f"{old_content}\n"
        f"--- End of {filename} ---\n\n"
        f"Rewrite this file to comply with the pivot. "
        f"Keep as much working code as possible but make all necessary changes. "
        f"Output ONLY the new file content. No markdown fences, no explanation."
    )


def _build_changes_summary_prompt(
    pivot_instruction: str,
    old_files: dict[str, str],
    new_files: dict[str, str],
) -> str:
    """Build prompt to summarize what changed across files."""
    diffs = []
    for fname in new_files:
        if fname in old_files:
            diffs.append(f"  - {fname}: was {len(old_files[fname])} chars, now {len(new_files[fname])} chars")
        else:
            diffs.append(f"  - {fname}: NEW file")
    diff_text = "\n".join(diffs)

    return (
        f"Summarize in 2-4 bullet points what changed in the prototype during this pivot.\n"
        f"Pivot instruction: {pivot_instruction}\n"
        f"Files touched:\n{diff_text}\n\n"
        f"Be specific about code-level changes (endpoints removed/added, models changed, etc.)."
    )


class CTOAgent(BaseAgent):
    """CTO agent that uses OpenAI API to generate multi-file prototypes.

    Generates a realistic FastAPI project structure with:
    - Main application entry point (app.py)
    - Domain models (models.py)
    - Configuration (config.py)
    - Multiple route files under routes/
    - requirements.txt
    - Test file (test_app.py)
    - README.md

    Uses the chat completions API with code-focused prompting
    (Hackathon requirement: Codex-Powered Services).
    """

    name = "CTO"
    model = "gpt-4o"

    def __init__(self, bus: StateBus, logger: TraceLogger) -> None:
        super().__init__(bus, logger)
        self.output_dir = Path("outputs/prototype")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.current_strategy: StrategyPayload | None = None
        self._generated_files: dict[str, str] = {}  # filename -> content cache
        self.subscribe(EventType.STRATEGY_SET, EventType.PIVOT)

    # ------------------------------------------------------------------
    # Event handling
    # ------------------------------------------------------------------

    async def handle_event(self, event: AgentEvent) -> None:
        if event.type == EventType.STRATEGY_SET:
            payload = event.payload
            if isinstance(payload, StrategyPayload):
                self.current_strategy = payload
        elif event.type == EventType.PIVOT:
            await self.handle_pivot(event)

    # ------------------------------------------------------------------
    # Single-file generation helper
    # ------------------------------------------------------------------

    async def _generate_single_file(
        self,
        spec: dict[str, str],
        strategy: StrategyPayload,
        generated_so_far: dict[str, str],
    ) -> tuple[str, str]:
        """Generate one file and return (filename, content)."""
        user_prompt = _build_file_prompt(spec, strategy, generated_so_far)

        content = await self.call_llm(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=4096,
        )

        # Strip markdown fences if the model wraps anyway
        cleaned = content.strip()
        for prefix in ("```python", "```markdown", "```txt", "```"):
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):]
                break
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        return spec["filename"], cleaned

    # ------------------------------------------------------------------
    # Full prototype generation
    # ------------------------------------------------------------------

    async def generate_prototype(self, strategy: StrategyPayload) -> PrototypePayload:
        """Generate a multi-file working prototype using OpenAI code generation.

        Files are generated sequentially so later files can reference earlier
        ones (e.g., routes import from models.py).
        """
        self.current_strategy = strategy
        self.log(
            f"Generating multi-file prototype for: {strategy.startup_idea}",
            action="codex_generate",
            reasoning=(
                f"Building a FastAPI prototype targeting {strategy.target_market} "
                f"with {strategy.business_model} model. Will generate {len(_FILE_SPECS)} files "
                f"including app.py, models, config, 3 route files, tests, and README. "
                f"Differentiators to implement: {', '.join(strategy.key_differentiators) if strategy.key_differentiators else 'general'}."
            ),
            in_response_to="CEO strategy set",
        )

        generated_so_far: dict[str, str] = {}
        files_generated: list[str] = []

        for spec in _FILE_SPECS:
            filename, content = await self._generate_single_file(
                spec, strategy, generated_so_far,
            )

            # Ensure subdirectories exist (e.g., routes/)
            filepath = self.output_dir / filename
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_text(content, encoding="utf-8")

            generated_so_far[filename] = content
            files_generated.append(str(filepath))
            self.log(f"Generated {filename} ({len(content)} chars)", action="file_write")

        # Cache for pivot use
        self._generated_files = dict(generated_so_far)

        description = (
            f"Multi-file FastAPI prototype for {strategy.startup_idea} — "
            f"{len(files_generated)} files generated"
        )

        payload = PrototypePayload(
            files_generated=files_generated,
            language="python",
            description=description,
            output_dir=str(self.output_dir),
        )

        await self.publish(AgentEvent(
            type=EventType.PROTOTYPE_READY,
            source=self.name,
            payload=payload,
            iteration=self._current_iteration,
        ))

        return payload

    # ------------------------------------------------------------------
    # Pivot handling — reads existing files, modifies them, reports diffs
    # ------------------------------------------------------------------

    async def handle_pivot(self, event: AgentEvent) -> None:
        """Handle a PIVOT event by reading existing prototype files, modifying
        them according to the pivot direction, and reporting what changed."""
        payload = event.payload
        if not isinstance(payload, PivotPayload):
            return

        pivot_instruction = payload.changes_required.get(
            "CTO", "Update prototype to match new strategy"
        )
        self.log(
            f"Handling pivot: {pivot_instruction}",
            action="pivot_response",
            reasoning=(
                f"CEO has pivoted the strategy. Pivot reason: {payload.reason[:200]}. "
                f"I need to modify {len(self._generated_files) or 'all'} prototype files "
                f"to comply with the new direction. Specific changes: {pivot_instruction}."
            ),
            addressed_to="CEO",
            in_response_to=f"CEO PIVOT: {payload.reason[:100]}",
        )

        # Resolve the new strategy
        new_strategy = self._resolve_strategy(payload)
        if new_strategy is None:
            self.log("Cannot resolve strategy for pivot, skipping", action="error")
            return

        # Load existing files from disk (in case they were generated in a
        # previous run or by a different process)
        old_files = self._load_existing_files()

        # If we have no files at all, just regenerate from scratch
        if not old_files:
            self._current_iteration += 1
            await self.generate_prototype(new_strategy)
            return

        # Modify each existing file through the LLM
        new_files: dict[str, str] = {}
        files_generated: list[str] = []

        for filename, old_content in old_files.items():
            new_content = await self._pivot_single_file(
                filename, old_content, pivot_instruction, new_strategy,
            )
            filepath = self.output_dir / filename
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_text(new_content, encoding="utf-8")

            new_files[filename] = new_content
            files_generated.append(str(filepath))
            self.log(f"Pivoted {filename} ({len(old_content)} -> {len(new_content)} chars)", action="file_write")

        # Generate a human-readable summary of changes
        changes_summary = await self._summarize_changes(
            pivot_instruction, old_files, new_files,
        )

        self.log(
            f"Pivot complete — {changes_summary}",
            action="pivot_response",
            reasoning=f"Prototype rebuild finished. Changes made: {changes_summary}",
            addressed_to="CEO",
            in_response_to=f"CEO PIVOT instruction: {pivot_instruction[:100]}",
        )

        # Update cache
        self._generated_files = new_files
        self._current_iteration += 1

        proto_payload = PrototypePayload(
            files_generated=files_generated,
            language="python",
            description=f"Pivoted prototype: {changes_summary}",
            output_dir=str(self.output_dir),
        )

        await self.publish(AgentEvent(
            type=EventType.PROTOTYPE_READY,
            source=self.name,
            payload=proto_payload,
            iteration=self._current_iteration,
            triggered_by=event.id,
        ))

    async def _pivot_single_file(
        self,
        filename: str,
        old_content: str,
        pivot_instruction: str,
        strategy: StrategyPayload,
    ) -> str:
        """Send one file to the LLM for pivot modification."""
        user_prompt = _build_pivot_prompt(
            filename, old_content, pivot_instruction, strategy,
        )

        content = await self.call_llm(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=4096,
        )

        cleaned = content.strip()
        for prefix in ("```python", "```markdown", "```txt", "```"):
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):]
                break
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        return cleaned.strip()

    async def _summarize_changes(
        self,
        pivot_instruction: str,
        old_files: dict[str, str],
        new_files: dict[str, str],
    ) -> str:
        """Ask the LLM to summarize what changed across all files."""
        prompt = _build_changes_summary_prompt(pivot_instruction, old_files, new_files)
        summary = await self.call_llm(
            [
                {"role": "system", "content": "Summarize code changes concisely."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=512,
        )
        return summary.strip()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolve_strategy(self, pivot: PivotPayload) -> StrategyPayload | None:
        """Try to build a StrategyPayload from the pivot's new_strategy field,
        falling back to the agent's cached strategy."""
        try:
            data = json.loads(pivot.new_strategy)
            return StrategyPayload(**data)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        return self.current_strategy

    def _load_existing_files(self) -> dict[str, str]:
        """Load all files from outputs/prototype/ into a dict.

        Walks subdirectories (like routes/) so the pivot can modify them.
        Falls back to the in-memory cache if the directory is empty.
        """
        files: dict[str, str] = {}
        if self.output_dir.exists():
            for path in self.output_dir.rglob("*"):
                if path.is_file():
                    rel = path.relative_to(self.output_dir).as_posix()
                    try:
                        files[rel] = path.read_text(encoding="utf-8")
                    except Exception:
                        pass
        if not files and self._generated_files:
            files = dict(self._generated_files)
        return files

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    async def run(self, context: dict[str, Any] | None = None) -> None:
        """Run CTO agent — waits for strategy, then generates prototype."""
        if self.current_strategy:
            await self.generate_prototype(self.current_strategy)
        else:
            self.log("Waiting for strategy from CEO", action="waiting")
