"""
runner.py — runs `python -m pipeline.cli from-brief` in a worker thread.

The pipeline is invoked as a subprocess (not imported and called
directly) for two reasons:
  1. The UI is fully decoupled from pipeline internals — it works
     against the existing CLI as-is.
  2. `python -u` forces unbuffered stdout, so progress lines stream
     into the LogBuffer in real time.

Concurrency policy: at most one render alive at any moment. The UI
rejects uploads while a run is active (per the product requirement).
If a second brief is uploaded during a run, it is **rejected**, not
queued — keeping the worker dead simple (one thread, no queue).

The output-dir convention matches the existing CLI:
  <output_dir>/<spec.id>/<spec.id>.mp4      final video
  <output_dir>/<spec.id>/spec.json          filled spec
"""

from __future__ import annotations

import re
import subprocess
import sys
import threading
from pathlib import Path

from pipeline.md2yt_ui.logbuf import LogBuffer, RunState, RunStatus, utcnow


# Regex to find the line `Spec:     <path>` from `from-brief` stdout,
# which tells us where the filled spec landed (the spec.id is encoded
# in the directory name).
_SPEC_LINE_RE = re.compile(r"^Spec:\s+(.+)$", re.MULTILINE)
# `MP4:      <path>` is printed once compose finishes successfully.
_MP4_LINE_RE = re.compile(r"^MP4:\s+(.+)$", re.MULTILINE)


class BriefRunner:
    """Owns the worker thread + RunState registry. Single instance per app."""

    def __init__(self, briefs_dir: Path, build_dir: Path) -> None:
        self.briefs_dir = briefs_dir
        self.build_dir = build_dir
        self.briefs_dir.mkdir(parents=True, exist_ok=True)
        self.build_dir.mkdir(parents=True, exist_ok=True)
        self._runs: dict[str, RunState] = {}
        self._lock = threading.Lock()  # guards _runs + "is active"
        self._busy = False
        self._thread: threading.Thread | None = None
    # ─────────────────────────────────────────────────────────────────
    # Registry accessors (called from Flask handlers — thread-safe).
    # ─────────────────────────────────────────────────────────────────
    def all_runs(self) -> list[RunState]:
        with self._lock:
            # Most recent first.
            return sorted(
                self._runs.values(),
                key=lambda r: r.started_at or utcnow(),
                reverse=True,
            )

    def get(self, brief_id: str) -> RunState | None:
        with self._lock:
            return self._runs.get(brief_id)

    @property
    def is_busy(self) -> bool:
        with self._lock:
            return self._busy

    # ─────────────────────────────────────────────────────────────────
    # Job submission
    # ─────────────────────────────────────────────────────────────────
    def enqueue(self, brief_path: Path) -> str:
        """Save brief to briefs/, register RunState, kick worker. Returns brief_id.

        Raises RuntimeError if a render is already active.
        """
        brief_id = brief_path.stem
        with self._lock:
            if self._busy:
                raise RuntimeError("a render is already in progress")
            self._busy = True
            state = RunState(brief_id=brief_id, brief_path=brief_path)
            state.status = RunStatus.RUNNING  # set BEFORE releasing the lock
            state.started_at = utcnow()
            self._runs[brief_id] = state
            self._thread = threading.Thread(
                target=self._run, args=(state,), daemon=True
            )
        self._thread.start()
        return brief_id

    # ─────────────────────────────────────────────────────────────────
    # Worker
    # ─────────────────────────────────────────────────────────────────
    def _run(self, state: RunState) -> None:
        # State is set to RUNNING in enqueue() so polling clients see it
        # immediately. _run() only adds the log entry + spawns subprocess.
        state.log.append(f"$ python -u -m pipeline.cli from-brief --input {state.brief_path}")

        cmd = [
            sys.executable, "-u", "-m", "pipeline.cli", "from-brief",
            "--input", str(state.brief_path),
            "--output-dir", str(self.build_dir),
            "--no-render",
        ]
        # Two-phase: phase 1 parses + writes the spec under
        # build/<spec.id>/spec.json. Phase 2 invokes compose.main against
        # that spec directly. This avoids relying on the CLI's own
        # compose dispatch (which loses the spec_out -> compose chain
        # when --spec-out points outside build/<id>/).
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=str(self.build_dir.parent),
            )
        except OSError as e:
            state.log.append(f"FAIL: could not start phase-1 subprocess: {e}")
            state.status = RunStatus.FAILED
            state.finished_at = utcnow()
            with self._lock:
                self._busy = False
            return

        assert proc.stdout is not None
        for line in proc.stdout:
            state.log.append(line)
            self._capture_artifacts(state, line)
        proc.wait()
        if proc.returncode != 0:
            state.exit_code = proc.returncode
            state.finished_at = utcnow()
            state.status = RunStatus.FAILED
            state.log.append(
                f"\n[phase 1 exit {proc.returncode}] FAILED"
            )
            with self._lock:
                self._busy = False
            return

        # Phase 1 succeeded — spec_path is set, build/<id>/spec.json exists.
        assert state.spec_path is not None
        compose_cmd = [
            sys.executable, "-u", "-m", "pipeline.cli", "compose",
            "--spec", str(state.spec_path),
            "--output-dir", str(self.build_dir),
            "--hyperframes-version", "0.6.103",
            "--quality", "high",
            "--xfade", "0.3",
        ]  # explicit defaults match compose.parse_args; without
           # --hyperframes-version / --quality / --xfade argparse trips
           # on a float default when the CLI dispatch is invoked
           # positionally with a partial argv (see cli.py:97).
        try:
            proc = subprocess.Popen(
                compose_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=str(self.build_dir.parent),
            )
        except OSError as e:
            state.log.append(f"FAIL: could not start phase-2 subprocess: {e}")
            state.status = RunStatus.FAILED
            state.finished_at = utcnow()
            with self._lock:
                self._busy = False
            return

        assert proc.stdout is not None
        for line in proc.stdout:
            state.log.append(line)
            self._capture_artifacts(state, line)
        proc.wait()
        # After compose finishes successfully the final MP4 lives at
        # build/<spec_id>/<spec_id>.mp4 per the compose contract. Use
        # the captured spec_id to compute that path; the `MP4:` line
        # printed by the from-brief dispatcher is for the chained CLI
        # run, but in our two-phase flow compose.main prints `DONE:`
        # instead, so resolve the artifact directly.
        if proc.returncode == 0 and state.spec_id is not None:
            mp4 = Path(self.build_dir) / state.spec_id / f"{state.spec_id}.mp4"
            if mp4.exists():
                state.mp4_path = mp4

        state.exit_code = proc.returncode
        state.finished_at = utcnow()
        state.status = RunStatus.OK if proc.returncode == 0 else RunStatus.FAILED
        state.log.append(
            f"\n[phase 2 exit {proc.returncode}] {'OK' if proc.returncode == 0 else 'FAILED'}"
        )

        with self._lock:
            self._busy = False

    def _capture_artifacts(self, state: RunState, line: str) -> None:
        """Pull spec path + mp4 path out of the CLI prints we care about."""
        if state.spec_path is None:
            m = _SPEC_LINE_RE.search(line)
            if m:
                spec_path = Path(m.group(1).strip())
                state.spec_path = spec_path
                # spec.id is the directory name; e.g. build/world_cup_2026/spec.json
                state.spec_id = spec_path.parent.name
        if state.mp4_path is None:
            m = _MP4_LINE_RE.search(line)
            if m:
                state.mp4_path = Path(m.group(1).strip())


# ─────────────────────────────────────────────────────────────────
# Module-level singleton (per-process). The Flask app uses this.
# ─────────────────────────────────────────────────────────────────
_runner: BriefRunner | None = None


def get_runner() -> BriefRunner:
    """Return the process-wide runner, lazily constructing it on first call."""
    global _runner
    if _runner is None:
        root = Path(__file__).resolve().parents[3]  # <repo-root>
        _runner = BriefRunner(
            briefs_dir=root / "briefs",
            build_dir=root / "build",
        )
    return _runner


def reset_runner_for_tests() -> None:
    """Test hook: drop the module singleton so the next get_runner() rebuilds."""
    global _runner
    _runner = None
