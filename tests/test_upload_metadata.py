"""Upload metadata tests — build_metadata reads the spec, env-var overrides win."""

from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.config import YouTubeDefaults
from pipeline.schema import load_and_validate
from pipeline.upload import build_metadata


def _defaults(**overrides) -> YouTubeDefaults:
    """Build a YouTubeDefaults with sensible test defaults; override any field."""
    base = dict(
        spec_path=None,
        video_file="out.mp4",
        privacy_status=None,
        thumbnail_path=None,
        captions_path=None,
    )
    base.update(overrides)
    return YouTubeDefaults(**base)


def test_build_metadata_reads_spec(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    meta = build_metadata(spec, _defaults())
    assert meta["title"] == "Example Spec — Replace With Your Own"
    assert meta["description"].startswith("This is the minimal reference spec")
    assert meta["tags"] == ["example", "template", "reference"]
    assert meta["categoryId"] == "17"  # Sports
    assert meta["privacyStatus"] == "private"


def test_build_metadata_privacy_override(example_spec_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = load_and_validate(example_spec_path)
    monkeypatch.setenv("YT_PRIVACY_STATUS", "public")
    meta = build_metadata(spec, _defaults(privacy_status="public"))
    assert meta["privacyStatus"] == "public"


def test_build_metadata_title_override(example_spec_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = load_and_validate(example_spec_path)
    monkeypatch.setenv("YT_TITLE", "OVERRIDE TITLE")
    meta = build_metadata(spec, _defaults())
    assert meta["title"] == "OVERRIDE TITLE"


def test_build_metadata_tags_override(example_spec_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = load_and_validate(example_spec_path)
    monkeypatch.setenv("YT_TAGS", "x, y ,z")
    meta = build_metadata(spec, _defaults())
    assert meta["tags"] == ["x", "y", "z"]


def test_build_metadata_publish_at_when_set(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    spec["youtube"]["publish_at"] = "2030-01-01T12:00:00Z"
    meta = build_metadata(spec, _defaults())
    assert meta["publishAt"] == "2030-01-01T12:00:00Z"


def test_build_metadata_publish_at_absent() -> None:
    spec = {
        "id": "x",
        "youtube": {"title": "t", "description": "d", "tags": []},
        "scenes": [],
    }
    meta = build_metadata(spec, _defaults())
    assert "publishAt" not in meta


def test_build_metadata_defaults_when_spec_fields_missing() -> None:
    spec = {
        "id": "x",
        "youtube": {"title": "t", "description": "d", "tags": []},
        "scenes": [],
    }
    meta = build_metadata(spec, _defaults())
    assert meta["categoryId"] == "17"  # default
    assert meta["privacyStatus"] == "private"  # default
