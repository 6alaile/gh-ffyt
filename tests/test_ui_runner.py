"""Tests for the BriefRunner: enqueue, worker, status transitions.

Subprocess is mocked so the tests don't need ffmpeg / npx / TTS.
We patch `subprocess.Popen` at `pipeline.md2yt_ui.runner.subprocess.Popen`.
"""

from __future__ import annotations

import io
import threading
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from pipeline.md2yt_ui.logbuf import RunStatus
from pipeline.md2yt_ui.runner import BriefRunner


class _FakeProcess:
    """Stand-in for subprocess.Popen. Streams a canned list of lines."""

    def __init__(self, lines: list[str], returncode: int = 0) -> None:
        self._lines = lines
        self.returncode = returncode
        self.stdout = io.StringIO("".join(l + "\n" for l in lines))
        self._waited = threading.Event()
        self._waited.set()

    def wait(self) -> int:
        self._waited.wait()
        return self.returncode


def _wait_for_terminal(runner: BriefRunner, brief_id: str, timeout: float = 2.0) -> None:
    """Block until the worker's RunState leaves RUNNING/QUEUED."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        state = runner.get(brief_id)
        if state and state.status in (RunStatus.OK, RunStatus.FAILED):
            return
        time.sleep(0.02)
    raise AssertionError(f"run {brief_id} did not finish within {timeout}s")


def test_enqueue_creates_run_and_worker_progresses(tmp_path: Path) -> None:
    runner = BriefRunner(briefs_dir=tmp_path / "briefs", build_dir=tmp_path / "build")
    brief = tmp_path / "briefs" / "abc.md"
    brief.parent.mkdir(parents=True, exist_ok=True)
    brief.write_text("# Brief\n", encoding="utf-8")

    # Two-phase: phase 1 emits Spec:; phase 2 emits MP4:. We feed both
    # through the same fake by using a side_effect that returns one fake
    # per call to subprocess.Popen, in order.
    phase1 = _FakeProcess([
        "Brief:    abc.md",
        "Scenes:   3",
        "Spec:     build/abc/spec.json",
    ])
    phase2 = _FakeProcess([
        "Spec:    build/abc/spec.json",
        "Output:  build/abc",
        "DONE:    build/abc/abc.mp4",
        "MP4:      build/abc/abc.mp4",
    ])

    popens = [phase1, phase2]
    def fake_popen(*args, **kwargs):
        return popens.pop(0)

    with patch("pipeline.md2yt_ui.runner.subprocess.Popen", side_effect=fake_popen):
        brief_id = runner.enqueue(brief)

    assert brief_id == "abc"
    _wait_for_terminal(runner, brief_id)

    state = runner.get(brief_id)
    assert state is not None
    assert state.status == RunStatus.OK
    assert state.exit_code == 0
    assert state.spec_id == "abc"
    assert state.spec_path == Path("build/abc/spec.json")
    assert state.mp4_path == Path("build/abc/abc.mp4")
    assert state.started_at is not None
    assert state.finished_at is not None
    assert any("Spec:" in line for line in state.log.lines)


def test_enqueue_rejects_while_busy(tmp_path: Path) -> None:
    runner = BriefRunner(briefs_dir=tmp_path / "briefs", build_dir=tmp_path / "build")
    a = tmp_path / "briefs" / "a.md"
    a.parent.mkdir(parents=True, exist_ok=True)
    a.write_text("# A\n", encoding="utf-8")
    b = tmp_path / "briefs" / "b.md"
    b.write_text("# B\n", encoding="utf-8")

    # A subprocess whose stdout blocks forever (no EOF, no value). The
    # worker's `for line in proc.stdout` loop is therefore stuck, busy
    # flag stays True, second enqueue is rejected.
    block = threading.Event()  # never set
    class _Hanging:
        returncode = 0
        def __init__(self):
            self.stdout = _BlockingIter(block)
        def wait(self):
            block.wait()
            return 0

    class _BlockingIter:
        def __init__(self, ev: threading.Event):
            self._ev = ev
        def __iter__(self):
            return self
        def __next__(self):
            self._ev.wait()  # blocks forever
            raise StopIteration

    with patch("pipeline.md2yt_ui.runner.subprocess.Popen", return_value=_Hanging()):
        runner.enqueue(a)
        # Wait until the worker thread has set _busy=True.
        for _ in range(50):
            if runner.is_busy:
                break
            time.sleep(0.02)
        assert runner.is_busy, "worker should hold the busy flag while subprocess is alive"
        with pytest.raises(RuntimeError, match="already in progress"):
            runner.enqueue(b)
        # Release the hanging worker so the test cleans up.
        block.set()


def test_runner_captures_phase2_failure(tmp_path: Path) -> None:
    runner = BriefRunner(briefs_dir=tmp_path / "briefs", build_dir=tmp_path / "build")
    brief = tmp_path / "briefs" / "fail.md"
    brief.parent.mkdir(parents=True, exist_ok=True)
    brief.write_text("# F\n", encoding="utf-8")

    phase1 = _FakeProcess(["Spec:     build/fail/spec.json"], returncode=0)
    phase2 = _FakeProcess(["FAIL: something broke"], returncode=1)

    popens = [phase1, phase2]
    def fake_popen(*args, **kwargs):
        return popens.pop(0)

    with patch("pipeline.md2yt_ui.runner.subprocess.Popen", side_effect=fake_popen):
        runner.enqueue(brief)
        _wait_for_terminal(runner, "fail")

    state = runner.get("fail")
    assert state is not None
    assert state.status == RunStatus.FAILED
    assert state.exit_code == 1


def test_runner_propagates_phase1_failure(tmp_path: Path) -> None:
    """If phase 1 (parse+fill+spec write) fails, the worker reports it
    and never invokes phase 2 (compose)."""
    runner = BriefRunner(briefs_dir=tmp_path / "briefs", build_dir=tmp_path / "build")
    brief = tmp_path / "briefs" / "bad.md"
    brief.parent.mkdir(parents=True, exist_ok=True)
    brief.write_text("# B\n", encoding="utf-8")

    phase1 = _FakeProcess(["FAIL: brief parse error"], returncode=1)
    with patch("pipeline.md2yt_ui.runner.subprocess.Popen", return_value=phase1) as popen_mock:
        runner.enqueue(brief)
        _wait_for_terminal(runner, "bad")

    state = runner.get("bad")
    assert state is not None
    assert state.status == RunStatus.FAILED
    assert state.exit_code == 1
    assert popen_mock.call_count == 1  # phase 2 never started


def test_all_runs_returns_most_recent_first(tmp_path: Path) -> None:
    runner = BriefRunner(briefs_dir=tmp_path / "briefs", build_dir=tmp_path / "build")
    for name in ("a", "b"):
        (tmp_path / "briefs" / f"{name}.md").parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / "briefs" / f"{name}.md").write_text(f"# {name}\n", encoding="utf-8")
        phase1 = _FakeProcess([f"Spec:     build/{name}/spec.json"], returncode=0)
        phase2 = _FakeProcess([f"DONE:    build/{name}/{name}.mp4"], returncode=0)
        popens = [phase1, phase2]
        popens_local = popens
        def fake_popen(*args, **kwargs):
            return popens_local.pop(0)
        with patch("pipeline.md2yt_ui.runner.subprocess.Popen", side_effect=fake_popen):
            runner.enqueue(tmp_path / "briefs" / f"{name}.md")
            _wait_for_terminal(runner, name)
            time.sleep(0.01)  # ensure started_at ordering differs

    runs = runner.all_runs()
    assert [r.brief_id for r in runs] == ["b", "a"]
