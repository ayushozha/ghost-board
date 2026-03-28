"""Trace logger with W&B integration and JSON fallback."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from coordination.events import AgentEvent


class TraceLogger:
    """Logs agent events to W&B (if available) or local JSON file.

    Usage:
        logger = TraceLogger(project="ghost-board")
        logger.log_event(event)
        logger.log_metric("ceo/pivots", 2)
        logger.finish()
    """

    def __init__(self, project: str = "ghost-board", run_name: str | None = None) -> None:
        self.project = project
        self.run_name = run_name or f"sprint-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
        self._wandb_run = None
        self._use_wandb = False
        self._json_path = Path("outputs/trace.json")
        self._json_log: list[dict[str, Any]] = []

        self._init_wandb()

    def _init_wandb(self) -> None:
        """Try to initialize W&B. Fall back to JSON if unavailable."""
        if not os.environ.get("WANDB_API_KEY"):
            self._use_wandb = False
            return

        try:
            import wandb
            self._wandb_run = wandb.init(
                project=self.project,
                name=self.run_name,
                config={"system": "ghost-board"},
                reinit=True,
            )
            self._use_wandb = True
        except Exception:
            self._use_wandb = False

    def log_event(self, event: AgentEvent) -> None:
        """Log an agent event."""
        trace_dict = event.to_trace_dict()

        if self._use_wandb and self._wandb_run:
            try:
                import wandb
                wandb.log(trace_dict)
            except Exception:
                pass

        self._json_log.append(trace_dict)

    def log_metric(self, key: str, value: Any) -> None:
        """Log a single metric."""
        if self._use_wandb and self._wandb_run:
            try:
                import wandb
                wandb.log({key: value})
            except Exception:
                pass

        self._json_log.append({
            "metric": key,
            "value": value,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    def log_artifact(self, name: str, path: str, artifact_type: str = "output") -> None:
        """Log a file artifact to W&B or record in JSON."""
        if self._use_wandb and self._wandb_run:
            try:
                import wandb
                artifact = wandb.Artifact(name, type=artifact_type)
                if os.path.isdir(path):
                    artifact.add_dir(path)
                else:
                    artifact.add_file(path)
                self._wandb_run.log_artifact(artifact)
            except Exception:
                pass

        self._json_log.append({
            "artifact": name,
            "path": path,
            "type": artifact_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    def finish(self) -> None:
        """Flush JSON log and finish W&B run."""
        self._flush_json()
        if self._use_wandb and self._wandb_run:
            try:
                self._wandb_run.finish()
            except Exception:
                pass

    def _flush_json(self) -> None:
        """Write the JSON log to disk."""
        self._json_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._json_path, "w") as f:
            json.dump(self._json_log, f, indent=2, default=str)

    def get_json_log(self) -> list[dict[str, Any]]:
        """Return the in-memory JSON log."""
        return list(self._json_log)
