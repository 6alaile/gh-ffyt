"""CLI tests for `md2yt from-brief` — smoke + dispatch with mocked deps."""

from __future__ import annotations

from pathlib import Path

import pytest


def test_from_brief_no_render_writes_spec(tmp_path: Path, monkeypatch) -> None:
    brief = tmp_path / "brief.md"
    brief.write_text(
        "# T\n\n## Hook\n**Kind:** hook\n**Duration:** 5s\n**Eyebrow:** // X\n"
        "**Headline:** H <accent>X.</accent>\n**Subhead:** // S\n> \"Hello.\"\n",
        encoding="utf-8",
    )
    out_dir = tmp_path / "build"
    from pipeline.cli import main as cli_main

    rc = cli_main(["from-brief", "--input", str(brief),
                   "--no-render", "--output-dir", str(out_dir)])
    assert rc == 0
    spec_path = out_dir / "draft" / "spec.json"
    assert spec_path.exists()


def test_from_brief_missing_input_exits_1(tmp_path: Path) -> None:
    from pipeline.cli import main as cli_main
    rc = cli_main(["from-brief", "--input", str(tmp_path / "nope.md"),
                   "--no-render", "--output-dir", str(tmp_path / "build")])
    assert rc == 1


def test_from_brief_invokes_compose_then_upload(tmp_path: Path, monkeypatch) -> None:
    """`--upload` runs compose, then upload.main(). Both are mocked."""
    brief = tmp_path / "brief.md"
    brief.write_text(
        "# T\n\n## Hook\n**Kind:** hook\n**Duration:** 5s\n**Eyebrow:** // X\n"
        "**Headline:** H <accent>X.</accent>\n**Subhead:** // S\n> \"Hello.\"\n",
        encoding="utf-8",
    )

    compose_calls: list[list[str]] = []
    upload_calls: list[dict] = []

    def fake_compose(argv):
        compose_calls.append(list(argv))
        # Simulate the final MP4 landing where the CLI expects it.
        spec_id = "draft"
        mp4 = tmp_path / "build" / spec_id / f"{spec_id}.mp4"
        mp4.parent.mkdir(parents=True, exist_ok=True)
        mp4.write_bytes(b"")
        return 0

    def fake_upload():
        upload_calls.append({"video": __import__("os").environ.get("VIDEO_FILE"),
                             "spec":  __import__("os").environ.get("YT_SPEC_PATH")})
        return 0

    # Patch the symbols the CLI dispatcher imports INSIDE the function.
    import pipeline.cli as cli_mod
    monkeypatch.setattr("pipeline.compose.main", fake_compose)
    monkeypatch.setattr("pipeline.upload.main", fake_upload)

    from pipeline.cli import main as cli_main
    rc = cli_main(["from-brief", "--input", str(brief),
                   "--output-dir", str(tmp_path / "build"), "--upload"])
    assert rc == 0
    assert len(compose_calls) == 1
    assert len(upload_calls) == 1
    assert upload_calls[0]["video"].endswith(".mp4")
    assert upload_calls[0]["spec"].endswith("spec.json")


def test_from_brief_compose_failure_propagates(tmp_path: Path, monkeypatch) -> None:
    brief = tmp_path / "brief.md"
    brief.write_text(
        "# T\n\n## Hook\n**Kind:** hook\n**Duration:** 5s\n**Eyebrow:** // X\n"
        "**Headline:** H <accent>X.</accent>\n**Subhead:** // S\n> \"Hello.\"\n",
        encoding="utf-8",
    )

    def fake_compose(argv):
        return 7

    upload_called = {"n": 0}
    def fake_upload():
        upload_called["n"] += 1
        return 0

    monkeypatch.setattr("pipeline.compose.main", fake_compose)
    monkeypatch.setattr("pipeline.upload.main", fake_upload)

    from pipeline.cli import main as cli_main
    rc = cli_main(["from-brief", "--input", str(brief),
                   "--output-dir", str(tmp_path / "build"), "--upload"])
    assert rc == 7
    assert upload_called["n"] == 0  # upload skipped because compose failed