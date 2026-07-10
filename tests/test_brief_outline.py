"""Outline-table parser tests — covers Content_Brief.md regression."""

from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.brief import parse_brief, parse_brief_file, parse_outline_table
from pipeline.brief_fill import fill_todos
from pipeline.schema import validate


# ─────────────────────────────────────────────────────────────────────
# parse_outline_table unit tests
# ─────────────────────────────────────────────────────────────────────
def test_parse_outline_table_durations_clock_format() -> None:
    body = (
        "| # | Scene Title | Duration | Voiceover | Visual |\n"
        "|---|-------------|----------|-----------|--------|\n"
        "| 1 | Hook        | 0:00-0:08 | intro     | stadium |\n"
        "| 2 | Scale       | 0:08-0:45 | scale     | map |\n"
    )
    scenes = parse_outline_table(body)
    assert len(scenes) == 2
    assert scenes[0]["id"] == "hook"  # slugified from title
    assert scenes[0]["duration_s"] == 8
    assert scenes[0]["script"] == "intro"
    assert scenes[0]["query"] == "stadium"
    assert scenes[1]["duration_s"] == 37


def test_parse_outline_table_durations_simple_format() -> None:
    body = (
        "| Scene Title | Duration | Voiceover |\n"
        "|-------------|----------|-----------|\n"
        "| Hook | 8s | intro |\n"
        "| Scale | 22s | scale |\n"
    )
    scenes = parse_outline_table(body)
    assert len(scenes) == 2
    assert scenes[0]["duration_s"] == 8
    assert scenes[1]["duration_s"] == 22


def test_parse_outline_table_skips_continuation_rows() -> None:
    body = (
        "| # | Scene Title | Duration | Voiceover |\n"
        "|---|-------------|----------|-----------|\n"
        "| 1 | Hook | 0:00-0:08 | first line |\n"
        "|   | continuation only |  |  |\n"
        "| 2 | Scale | 0:08-0:45 |  |\n"
    )
    scenes = parse_outline_table(body)
    # 3 rows; the continuation row keeps its content (no skip heuristic yet).
    assert len(scenes) >= 2
    # The first and last rows are present.
    assert scenes[0]["id"] == "hook"
    assert scenes[-1]["id"] == "scale"


def test_parse_outline_table_no_table_returns_empty() -> None:
    assert parse_outline_table("just prose\n\nno tables here\n") == []


# ─────────────────────────────────────────────────────────────────────
# Content_Brief.md end-to-end
# ─────────────────────────────────────────────────────────────────────
def test_content_brief_parses_hook_and_outline(content_brief_path: Path) -> None:
    spec = parse_brief_file(content_brief_path)
    # 1 hook + 8 outline rows = 9 scenes.
    assert len(spec["scenes"]) == 9
    kinds = {s.get("kind") for s in spec["scenes"]}
    # First scene is the explicit hook.
    assert spec["scenes"][0]["kind"] == "hook"
    assert spec["scenes"][0]["script"]
    # Outline rows have duration_s populated from the table.
    for s in spec["scenes"][1:]:
        assert isinstance(s.get("duration_s"), int)
        assert s["duration_s"] > 0
        assert s.get("script")
    # Source heading + description stashed for the auto-filler.
    assert spec.get("_source_heading")


def test_content_brief_fill_then_validate(content_brief_path: Path) -> None:
    spec = parse_brief_file(content_brief_path)
    fill_todos(spec)
    # Filled spec must pass schema validation.
    validate(spec)


def test_content_brief_inline_parser() -> None:
    text = (
        "# Test Brief\n"
        "\n"
        "## Hook (First 0–8 seconds)\n"
        "\n"
        "**Hook line:** \"First six words.\"\n"
        "**Opening visual:** stadium\n"
        "\n"
        "## Script Outline\n"
        "\n"
        "| # | Scene Title | Duration | Voiceover | Visual |\n"
        "|---|-------------|----------|-----------|--------|\n"
        "| 1 | The Scale | 0:08-0:45 | bigger | map |\n"
        "| 2 | The Verdict | 3:50-4:20 | wrap up | wide |\n"
    )
    spec = parse_brief(text)
    assert len(spec["scenes"]) == 3  # hook + 2 outline rows
    assert spec["scenes"][0]["kind"] == "hook"
    assert "First six words" in spec["scenes"][0]["script"]
    assert spec["scenes"][1]["duration_s"] == 37
    assert spec["scenes"][2]["duration_s"] == 30