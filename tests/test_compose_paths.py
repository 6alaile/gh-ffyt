"""Compose helpers — arg parsing, template loading, HTML rendering, ffmpeg shape.

These tests are pure-Python; they don't shell out to ffmpeg / npx / networks.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from pipeline.compose import (
    _read_base_template,
    parse_args,
    render_scene_html,
)
from pipeline.defaults import DEFAULT_PALETTE, REENCODE_FFMPEG
from pipeline.schema import load_and_validate


def test_parse_args_defaults() -> None:
    args = parse_args(["--spec", "foo.json"])
    assert args.spec == "foo.json"
    assert args.output_dir == "build"
    assert args.hyperframes_version == "0.6.103"
    assert args.quality == "high"
    assert args.xfade == pytest.approx(0.3)


def test_parse_args_overrides() -> None:
    args = parse_args([
        "--spec", "foo.json",
        "--output-dir", "out",
        "--quality", "low",
        "--xfade", "0.7",
    ])
    assert args.output_dir == "out"
    assert args.quality == "low"
    assert args.xfade == pytest.approx(0.7)


def test_parse_args_rejects_bad_quality() -> None:
    with pytest.raises(SystemExit):
        parse_args(["--spec", "foo.json", "--quality", "ultra"])


def test_reencode_ffmpeg_shape() -> None:
    assert isinstance(REENCODE_FFMPEG, list)
    assert REENCODE_FFMPEG[0] == "ffmpeg"
    # The template needs the ffmpeg libx264 codec for HTML5 compatibility.
    assert "libx264" in REENCODE_FFMPEG
    # 1-second GOP for clean random access during editing.
    assert "-g" in REENCODE_FFMPEG and "30" in REENCODE_FFMPEG
    # The command must accept format kwargs.
    filled = [c.format(input="in.mp4", output="out.mp4", duration="5") for c in REENCODE_FFMPEG]
    assert "in.mp4" in filled and "out.mp4" in filled and "5" in filled


def test_read_base_template_nonempty() -> None:
    tpl = _read_base_template()
    # The base template has every slot the composer fills in.
    for token in (
        "__SCENE_ID__", "__BG__", "__FG__", "__ACCENT__",
        "__KIND_CSS__", "__KIND_CONTENT__", "__KIND_ANIM__",
        "__COMPOSITION_ID__", "__DURATION__", "__CLIP__",
    ):
        assert token in tpl, f"base.html missing token {token}"


def test_render_scene_html_replaces_all_tokens(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    palette = DEFAULT_PALETTE
    for scene in spec["scenes"]:
        html = render_scene_html(scene, spec, palette)
        assert html, f"empty HTML for scene {scene['id']!r}"
        # No unfilled tokens should remain.
        for token in (
            "__SCENE_ID__", "__BG__", "__FG__", "__ACCENT__",
            "__KIND_CSS__", "__KIND_CONTENT__", "__KIND_ANIM__",
        ):
            assert token not in html, f"unfilled {token} in {scene['id']!r}"
        # Scene id is wired into the composition id.
        assert scene["id"] in html
        # Palette colours ended up in the document.
        assert palette["bg"] in html
        assert palette["fg"] in html
        assert palette["accent"] in html


def test_render_scene_html_keeps_palette_colours(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    scene = spec["scenes"][0]
    palette = {**DEFAULT_PALETTE, "bg": "#112233"}
    html = render_scene_html(scene, spec, palette)
    assert "#112233" in html
