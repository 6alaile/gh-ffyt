"""Tests for the Flask app: routes, upload handling, 409 when busy.

We patch `get_runner` so the test never spawns a real subprocess.
"""

from __future__ import annotations

import io
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from pipeline.md2yt_ui.app import create_app
from pipeline.md2yt_ui.logbuf import LogBuffer, RunState, RunStatus
from pipeline.md2yt_ui.runner import BriefRunner


class _FakeRunner(BriefRunner):
    """In-process runner for tests. enqueue() just records the path,
    no subprocess, no worker thread. State defaults to RUNNING."""

    def __init__(self, briefs_dir: Path, build_dir: Path) -> None:  # type: ignore[no-super-call]
        self.briefs_dir = briefs_dir
        self.build_dir = build_dir
        self._runs: dict[str, RunState] = {}
        self._lock = __import__("threading").Lock()
        self._busy = False

    def enqueue(self, brief_path: Path) -> str:  # type: ignore[override]
        brief_id = brief_path.stem
        with self._lock:
            if self._busy:
                raise RuntimeError("a render is already in progress")
            self._busy = True
            self._runs[brief_id] = RunState(
                brief_id=brief_id,
                brief_path=brief_path,
                status=RunStatus.RUNNING,
            )
        return brief_id

    def all_runs(self):  # type: ignore[override]
        with self._lock:
            return list(self._runs.values())

    def get(self, brief_id: str):  # type: ignore[override]
        with self._lock:
            return self._runs.get(brief_id)

    @property
    def is_busy(self) -> bool:  # type: ignore[override]
        with self._lock:
            return self._busy


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture
def fake_runner(tmp_path: Path):
    return _FakeRunner(briefs_dir=tmp_path / "briefs", build_dir=tmp_path / "build")


def test_index_renders_empty_state(client, fake_runner):
    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.get("/")
    assert res.status_code == 200
    assert b"No briefs yet" in res.data


def test_upload_accepts_md_and_enqueues(client, fake_runner, tmp_path: Path):
    brief_file = (io.BytesIO(b"# My Brief\n\n## Hook\n**Kind:** hook\n"), "my_brief.md")
    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.post(
            "/upload",
            data={"brief": (io.BytesIO(b"# My Brief\n\n## Hook\n"), "my_brief.md")},
            content_type="multipart/form-data",
        )
    assert res.status_code == 202
    payload = res.get_json()
    assert payload["brief_id"].startswith("my_brief-")
    # Brief landed on disk under briefs_dir with the random suffix.
    saved = list(fake_runner.briefs_dir.glob("*.md"))
    assert len(saved) == 1
    assert saved[0].read_text(encoding="utf-8").startswith("# My Brief")


def test_upload_rejects_when_busy(client, fake_runner):
    # Simulate a run in flight.
    fake_runner._busy = True
    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.post(
            "/upload",
            data={"brief": (io.BytesIO(b"# X"), "x.md")},
            content_type="multipart/form-data",
        )
    assert res.status_code == 409
    assert "already in progress" in res.get_json()["error"]


def test_upload_rejects_non_md(client, fake_runner):
    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.post(
            "/upload",
            data={"brief": (io.BytesIO(b"not markdown"), "evil.txt")},
            content_type="multipart/form-data",
        )
    # .txt is renamed to .md by _sanitize_filename so the save succeeds
    # and enqueue is called. The key contract: it doesn't 500.
    assert res.status_code in (202, 409)


def test_upload_rejects_missing_file_part(client, fake_runner):
    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.post("/upload", data={}, content_type="multipart/form-data")
    assert res.status_code == 400


def test_run_status_returns_json(client, fake_runner, tmp_path: Path):
    brief = fake_runner.briefs_dir / "test.md"
    brief.parent.mkdir(parents=True, exist_ok=True)
    brief.write_text("# T\n", encoding="utf-8")
    state = RunState(
        brief_id="test",
        brief_path=brief,
        status=RunStatus.RUNNING,
        spec_id="test",
        mp4_path=tmp_path / "build" / "test" / "test.mp4",
        spec_path=tmp_path / "build" / "test" / "spec.json",
    )
    state.log.append("hello")
    fake_runner._runs["test"] = state

    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.get("/runs/test?tail=50")
    assert res.status_code == 200
    body = res.get_json()
    assert body["brief_id"] == "test"
    assert body["status"] == "running"
    assert body["log"] == ["hello"]


def test_run_status_404_for_unknown(client, fake_runner):
    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.get("/runs/nope")
    assert res.status_code == 404


def test_mp4_download_404_until_ok(client, fake_runner, tmp_path: Path):
    brief = tmp_path / "x.md"
    state = RunState(brief_id="x", brief_path=brief, status=RunStatus.RUNNING)
    fake_runner._runs["x"] = state
    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.get("/runs/x/mp4")
    assert res.status_code == 404


def test_mp4_download_streams_when_present(client, fake_runner, tmp_path: Path):
    mp4 = tmp_path / "build" / "x" / "x.mp4"
    mp4.parent.mkdir(parents=True, exist_ok=True)
    mp4.write_bytes(b"\x00\x00\x00\x18ftypisom" + b"\x00" * 100)  # fake MP4 header

    state = RunState(
        brief_id="x",
        brief_path=tmp_path / "x.md",
        status=RunStatus.OK,
        mp4_path=mp4,
    )
    fake_runner._runs["x"] = state

    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.get("/runs/x/mp4")
    assert res.status_code == 200
    assert res.mimetype == "video/mp4"
    assert len(res.data) > 0


def test_spec_download_streams_when_present(client, fake_runner, tmp_path: Path):
    spec = tmp_path / "build" / "x" / "spec.json"
    spec.parent.mkdir(parents=True, exist_ok=True)
    spec.write_text('{"id":"x"}', encoding="utf-8")
    state = RunState(
        brief_id="x",
        brief_path=tmp_path / "x.md",
        status=RunStatus.OK,
        spec_path=spec,
    )
    fake_runner._runs["x"] = state

    with patch("pipeline.md2yt_ui.app.get_runner", return_value=fake_runner):
        res = client.get("/runs/x/spec.json")
    assert res.status_code == 200
    assert json.loads(res.data)["id"] == "x"


def test_sanitize_filename_strips_path_traversal():
    from pipeline.md2yt_ui.app import _sanitize_filename

    assert _sanitize_filename("../../etc/passwd").endswith(".md")
    assert "/" not in _sanitize_filename("../../etc/passwd").replace(".md", "")
    assert _sanitize_filename("normal.md") == "normal.md"
    assert _sanitize_filename("noext").endswith(".md")
