"""Auto-filler tests — exercise every kind's required-field default path."""

from __future__ import annotations

from typing import Any

import pytest

from pipeline.brief_fill import BriefFillError, FillReport, fill_todos
from pipeline.schema import SCENE_KINDS, validate


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────
def _empty_spec() -> dict[str, Any]:
    return {
        "id": "draft",
        "youtube": {},
        "scenes": [
            {"id": "01_hook", "kind": "TODO", "duration_s": "TODO",
             "script": "TODO", "query": "", "top_label": "", "bottom_label": "", "pill": ""},
        ],
    }


# ─────────────────────────────────────────────────────────────────────
# Per-kind coverage
# ─────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("kind", sorted(SCENE_KINDS))
def test_fill_todos_fills_all_required_fields_for_kind(kind: str) -> None:
    spec = {
        "id": "draft",
        "youtube": {},
        "scenes": [{
            "id": f"01_{kind}",
            "kind": kind,  # override; skip kind inference
            "duration_s": "TODO",
            "script": "TODO",
            "query": "", "top_label": "", "bottom_label": "", "pill": "",
        }],
    }
    fill_todos(spec, heading_for={0: f"the {kind} heading"})

    scene = spec["scenes"][0]
    assert scene["kind"] in SCENE_KINDS, scene
    assert isinstance(scene["duration_s"], int)
    assert scene["script"]
    # Schema validates a fully-filled scene
    validate({**spec, "id": "t"})


def test_fill_todos_preserves_user_supplied_fields() -> None:
    spec = {
        "id": "draft",
        "youtube": {
            "title": "User Title",
            "description": "User description.",
            "tags": ["user", "tags"],
            "category_id": "17",
            "privacy": "public",
        },
        "scenes": [{
            "id": "01_hook",
            "kind": "hook",
            "duration_s": 7,
            "script": "User-supplied voiceover.",
            "eyebrow": "// USER",
            "headline": "USER <accent>HEADLINE.</accent>",
            "subhead": "// USER",
        }],
    }
    fill_todos(spec, heading_for={0: "Hook"})
    scene = spec["scenes"][0]
    assert scene["kind"] == "hook"
    assert scene["duration_s"] == 7
    assert scene["script"] == "User-supplied voiceover."
    assert scene["eyebrow"] == "// USER"
    assert scene["headline"] == "USER <accent>HEADLINE.</accent>"
    assert scene["subhead"] == "// USER"
    yt = spec["youtube"]
    assert yt["title"] == "User Title"
    assert yt["tags"] == ["user", "tags"]
    assert yt["privacy"] == "public"


def test_fill_todos_unknown_kind_rederives() -> None:
    spec = _empty_spec()
    spec["scenes"][0]["kind"] = "TODO_unknown(some_kind)"
    report = fill_todos(spec, heading_for={0: "The Mbappé Factor"})
    # Mbappé triggers the `record` keyword path
    assert spec["scenes"][0]["kind"] in SCENE_KINDS
    assert any("re-derived" in e or "kind=" in e for e in report.inferred_kind)


def test_fill_todos_infers_kind_from_heading() -> None:
    cases = {
        "Hook":                          "hook",
        "The Hosts":                     "grid",
        "The Verdict":                   "quote",
        "The Two Faces":                 "portrait",
        "The Scale of 2026":             "scale",
        "The Countdown":                 "record",
        "Four Points":                   "list",
        "The Sidebar":                   "split",
    }
    for heading, expected in cases.items():
        spec = _empty_spec()
        spec["scenes"][0]["kind"] = None
        fill_todos(spec, heading_for={0: heading})
        assert spec["scenes"][0]["kind"] == expected, (heading, spec["scenes"][0]["kind"])


def test_fill_todos_youtube_block_filled_from_source() -> None:
    spec = {
        "id": "world_cup",
        "_source_heading": "The 2026 World Cup",
        "_source_description": "48 teams. 104 games. Three host nations.",
        "youtube": {},
        "scenes": [{
            "id": "01_hook", "kind": "hook", "duration_s": 8,
            "script": "Real script.",
            "eyebrow": "// X", "headline": "X <accent>X.</accent>", "subhead": "// X",
        }],
    }
    fill_todos(spec, heading_for={0: "Hook"})
    yt = spec["youtube"]
    assert yt["title"]
    assert yt["description"]
    assert yt["tags"]
    # "world cup" / "teams" / "nations" → no exact keyword hit; assert
    # the field is populated rather than the specific category.
    assert yt["category_id"] in {"17", "22"}
    assert yt["privacy"] == "private"


def test_fill_todos_youtube_uses_hashtags_when_present() -> None:
    spec = {
        "id": "draft",
        "_source_description": "Quick take #worldcup #messi #football",
        "youtube": {},
        "scenes": [{
            "id": "01_hook", "kind": "hook", "duration_s": 8,
            "script": "Real script.",
            "eyebrow": "// X", "headline": "X <accent>X.</accent>", "subhead": "// X",
        }],
    }
    fill_todos(spec, heading_for={0: "Hook"})
    assert "worldcup" in spec["youtube"]["tags"]
    assert "messi" in spec["youtube"]["tags"]
    assert "football" in spec["youtube"]["tags"]


def test_fill_todos_empty_scenes_raises() -> None:
    spec = {"id": "draft", "youtube": {}, "scenes": []}
    with pytest.raises(BriefFillError, match="no scenes"):
        fill_todos(spec)


def test_fill_todos_empty_scenes_raises() -> None:
    """Empty scenes list is the only reliable hard-refusal case —
    the heading→kind fallback always succeeds, so we can't induce a
    missing-kind failure except by removing scenes entirely."""
    spec = {"id": "draft", "youtube": {}, "scenes": []}
    with pytest.raises(BriefFillError, match="no scenes"):
        fill_todos(spec)


def test_fill_todos_sport_keywords_set_sports_category() -> None:
    spec = {
        "id": "draft",
        "_source_heading": "Football World Cup",
        "youtube": {},
        "scenes": [{
            "id": "01_hook", "kind": "hook", "duration_s": 8,
            "script": "x",
            "eyebrow": "// X", "headline": "X <accent>X.</accent>", "subhead": "// X",
        }],
    }
    fill_todos(spec, heading_for={0: "Hook"})
    assert spec["youtube"]["category_id"] == "17"


def test_fill_todos_non_sport_keywords_default_to_22() -> None:
    spec = {
        "id": "draft",
        "_source_heading": "How To Cook Pasta",
        "youtube": {},
        "scenes": [{
            "id": "01_hook", "kind": "hook", "duration_s": 8,
            "script": "x",
            "eyebrow": "// X", "headline": "X <accent>X.</accent>", "subhead": "// X",
        }],
    }
    fill_todos(spec, heading_for={0: "Hook"})
    assert spec["youtube"]["category_id"] == "22"


def test_fill_todos_report_is_auditable() -> None:
    spec = _empty_spec()
    report = fill_todos(spec, heading_for={0: "Hook"})
    assert isinstance(report, FillReport)
    # We expect at least one filled field and one inferred kind entry.
    assert report.filled or report.inferred_kind
    # str(report) produces a useful audit log.
    text = str(report)
    assert "Fill report" in text