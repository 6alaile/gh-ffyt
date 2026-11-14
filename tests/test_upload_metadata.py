"""Upload metadata tests — build_metadata reads the spec, env-var overrides win."""

from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.config import YouTubeDefaults
from pipeline.schema import load_and_validate
from unittest.mock import MagicMock

from pipeline.upload import build_metadata, resolve_thumbnail, upload


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
    assert meta["snippet"]["title"] == "Example Spec — Replace With Your Own"
    assert meta["snippet"]["description"].startswith("This is the minimal reference spec")
    assert meta["snippet"]["tags"] == ["example", "template", "reference"]
    assert meta["snippet"]["categoryId"] == "17"  # Sports
    assert meta["status"]["privacyStatus"] == "private"


def test_build_metadata_privacy_override(example_spec_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = load_and_validate(example_spec_path)
    monkeypatch.setenv("YT_PRIVACY_STATUS", "public")
    meta = build_metadata(spec, _defaults(privacy_status="public"))
    assert meta["status"]["privacyStatus"] == "public"


def test_build_metadata_title_override(example_spec_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = load_and_validate(example_spec_path)
    monkeypatch.setenv("YT_TITLE", "OVERRIDE TITLE")
    meta = build_metadata(spec, _defaults())
    assert meta["snippet"]["title"] == "OVERRIDE TITLE"


def test_build_metadata_tags_override(example_spec_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = load_and_validate(example_spec_path)
    monkeypatch.setenv("YT_TAGS", "x, y ,z")
    meta = build_metadata(spec, _defaults())
    assert meta["snippet"]["tags"] == ["x", "y", "z"]


def test_build_metadata_publish_at_when_set(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    spec["youtube"]["publish_at"] = "2030-01-01T12:00:00Z"
    meta = build_metadata(spec, _defaults())
    assert meta["status"]["publishAt"] == "2030-01-01T12:00:00Z"


def test_build_metadata_publish_at_absent() -> None:
    spec = {
        "id": "x",
        "youtube": {"title": "t", "description": "d", "tags": []},
        "scenes": [],
    }
    meta = build_metadata(spec, _defaults())
    assert "publishAt" not in meta["status"]


def test_build_metadata_defaults_when_spec_fields_missing() -> None:
    spec = {
        "id": "x",
        "youtube": {"title": "t", "description": "d", "tags": []},
        "scenes": [],
    }
    meta = build_metadata(spec, _defaults())
    assert meta["snippet"]["categoryId"] == "17"  # default
    assert meta["status"]["privacyStatus"] == "private"  # default


def test_build_metadata_not_made_for_kids() -> None:
    spec = {"id": "x", "youtube": {"title": "t"}, "scenes": []}
    meta = build_metadata(spec, _defaults())
    assert meta["status"]["selfDeclaredMadeForKids"] is False


def test_upload_sends_snippet_status_body(tmp_path: Path) -> None:
    video = tmp_path / "v.mp4"
    video.write_bytes(b"\x00" * 16)
    spec = {
        "id": "x",
        "youtube": {"title": "T", "description": "D", "tags": ["a", "b"], "category_id": "17"},
        "scenes": [],
    }
    meta = build_metadata(spec, _defaults(privacy_status="private"))

    youtube = MagicMock()
    request = youtube.videos.return_value.insert.return_value
    request.next_chunk.return_value = (None, {"id": "abc123"})

    upload(youtube, video, meta)

    kwargs = youtube.videos.return_value.insert.call_args.kwargs
    assert kwargs["part"] == "snippet,status"
    assert kwargs["body"] == {
        "snippet": {"title": "T", "description": "D", "tags": ["a", "b"], "categoryId": "17"},
        "status": {"privacyStatus": "private", "selfDeclaredMadeForKids": False},
    }


def test_resolve_thumbnail_prefers_env_over_spec() -> None:
    spec = {"youtube": {"thumbnail_path": "thumbs/spec.png"}}
    assert resolve_thumbnail(spec, _defaults(thumbnail_path="env.png")) == "env.png"


def test_resolve_thumbnail_falls_back_to_spec() -> None:
    spec = {"youtube": {"thumbnail_path": "thumbs/spec.png"}}
    assert resolve_thumbnail(spec, _defaults()) == "thumbs/spec.png"


def test_resolve_thumbnail_none_when_unset() -> None:
    assert resolve_thumbnail({"youtube": {}}, _defaults()) is None


def test_upload_sets_thumbnail_after_insert(tmp_path: Path) -> None:
    video = tmp_path / "v.mp4"
    video.write_bytes(b"\x00" * 16)
    thumb = tmp_path / "t.png"
    thumb.write_bytes(b"\x89PNG")
    meta = build_metadata({"youtube": {"title": "T"}}, _defaults())

    youtube = MagicMock()
    youtube.videos.return_value.insert.return_value.next_chunk.return_value = (None, {"id": "vid1"})

    upload(youtube, video, meta, thumbnail=str(thumb))

    assert youtube.thumbnails.return_value.set.call_args.kwargs["videoId"] == "vid1"
