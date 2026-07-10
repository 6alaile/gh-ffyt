"""
logbuf.py — in-memory log buffer + run state for the md2yt-ui runner.

The runner captures `python -m pipeline.cli from-brief ...` stdout and
appends each line to a per-run LogBuffer. The Flask routes serialize
the latest N lines to JSON for the UI's polling endpoint.

Why a deque of fixed length: a render can produce thousands of lines
over 25 minutes; the UI only needs the tail (last few hundred) to
give the user a sense of progress. Cap at 500 lines per run.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any


class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    OK = "ok"
    FAILED = "failed"


@dataclass
class LogBuffer:
    """Bounded ring of log lines. JSON-serializable via `tail()`."""

    max_lines: int = 500
    lines: deque[str] = field(default_factory=deque)

    def append(self, line: str) -> None:
        self.lines.append(line.rstrip("\n"))
        while len(self.lines) > self.max_lines:
            self.lines.popleft()

    def tail(self, n: int | None = None) -> list[str]:
        if n is None or n >= len(self.lines):
            return list(self.lines)
        return list(self.lines)[-n:]


@dataclass
class RunState:
    """One render attempt's lifecycle. Mutated in place by the worker."""

    brief_id: str
    brief_path: Path
    spec_id: str | None = None
    status: RunStatus = RunStatus.QUEUED
    started_at: datetime | None = None
    finished_at: datetime | None = None
    log: LogBuffer = field(default_factory=LogBuffer)
    mp4_path: Path | None = None
    spec_path: Path | None = None
    exit_code: int | None = None

    def to_json(self, log_tail: int = 200) -> dict[str, Any]:
        return {
            "brief_id": self.brief_id,
            "spec_id": self.spec_id,
            "status": self.status.value,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "mp4_path": str(self.mp4_path) if self.mp4_path else None,
            "spec_path": str(self.spec_path) if self.spec_path else None,
            "exit_code": self.exit_code,
            "log": self.log.tail(log_tail),
        }


def utcnow() -> datetime:
    """Timezone-aware UTC now. Keeps ISO timestamps sortable."""
    return datetime.now(timezone.utc)
