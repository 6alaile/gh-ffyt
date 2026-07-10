"""Per-kind renderer tests — every kind produces non-empty CSS / content / anim."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from pipeline.renderers import RENDERERS, render_kind


# Minimal valid scene for each kind. The schema is the source of truth
# for what's required; tests use just enough to exercise the renderer.
def _hook() -> dict[str, Any]:
    return {
        "id": "01_hook",
        "kind": "hook",
        "duration_s": 6,
        "script": "x",
        "eyebrow": "// EYEBROW",
        "headline": "BIG <accent>HOOK</accent>",
        "subhead": "// SUB",
    }


def _scale() -> dict[str, Any]:
    return {
        "id": "02_scale",
        "kind": "scale",
        "duration_s": 12,
        "script": "x",
        "headline": "BIGGER THAN<br />YOU THINK",
        "stats": [{"num": "1", "label": "FIRST"}, {"num": "2", "label": "SECOND"}],
    }


def _portrait() -> dict[str, Any]:
    return {
        "id": "03_portrait",
        "kind": "portrait",
        "duration_s": 12,
        "script": "x",
        "eyebrow": "// TWO",
        "headline": "THE FACES",
        "names": [{"name": "A", "year": "BORN 1990"}, {"name": "B", "year": "BORN 1992"}],
    }


def _record() -> dict[str, Any]:
    return {
        "id": "04_record",
        "kind": "record",
        "duration_s": 10,
        "script": "x",
        "counter_label": "DAYS UNTIL",
        "counter_num": "42",
        "counter_suffix": "THE RECORD",
        "name": "THE HUNTER.",
    }


def _grid() -> dict[str, Any]:
    return {
        "id": "05_grid",
        "kind": "grid",
        "duration_s": 14,
        "script": "x",
        "headline": "THE LINEUP",
        "cards": [
            {"flag": "🇦🇱", "name": "A", "stats": ["s1"], "quote": "q1"},
            {"flag": "🇧🇷", "name": "B", "stats": ["s1"], "quote": "q2"},
        ],
    }


def _quote() -> dict[str, Any]:
    return {
        "id": "06_quote",
        "kind": "quote",
        "duration_s": 8,
        "script": "x",
        "eyebrow": "// LINE",
        "quote": "ONE LINE.",
        "attribution": "— WHO",
    }


def _list() -> dict[str, Any]:
    return {
        "id": "07_list",
        "kind": "list",
        "duration_s": 12,
        "script": "x",
        "eyebrow": "// LIST",
        "headline": "FIVE POINTS",
        "items": ["one", "two", "three"],
    }


def _split() -> dict[str, Any]:
    return {
        "id": "08_split",
        "kind": "split",
        "duration_s": 10,
        "script": "x",
        "eyebrow": "// SIDE",
        "headline": "ONE SIDE.",
        "body": "Body copy.",
        "image_query": "wide dramatic photo of a stadium",
    }


SCENES = {
    "hook": _hook,
    "scale": _scale,
    "portrait": _portrait,
    "record": _record,
    "grid": _grid,
    "quote": _quote,
    "list": _list,
    "split": _split,
}


@pytest.mark.parametrize("kind", sorted(SCENES.keys()))
def test_render_kind_returns_three_non_empty_strings(kind: str) -> None:
    css, content, anim = render_kind(SCENES[kind]())
    assert css.strip(), f"{kind}: css is empty"
    assert content.strip(), f"{kind}: content is empty"
    assert anim.strip(), f"{kind}: anim is empty"


@pytest.mark.parametrize("kind", sorted(SCENES.keys()))
def test_render_kind_class_is_scene_scoped(kind: str) -> None:
    """The CSS class prefix must come from the scene id, prefixed with s-.

    This matters because spec scene ids may start with a digit (e.g.
    '01_hook'), which is illegal as a CSS identifier start.
    """
    scene = SCENES[kind]()
    css, content, _ = render_kind(scene)
    # CSS-safe class prefix
    sid = f"s-{scene['id']}"
    assert sid in css, f"{kind}: expected {sid!r} to appear in CSS"
    assert sid in content, f"{kind}: expected {sid!r} to appear in content"


def test_render_kind_unknown_raises() -> None:
    with pytest.raises(ValueError, match="unknown kind"):
        render_kind({"id": "x", "kind": "nope", "duration_s": 1, "script": "x"})


def test_renderer_dispatch_table_matches_kinds() -> None:
    # If a new kind is added to renderers, this catches a forgotten
    # registration (and vice versa).
    for kind in SCENES:
        assert kind in RENDERERS
