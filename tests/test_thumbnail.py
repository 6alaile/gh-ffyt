"""Tests for src/pipeline/thumbnail.py — prompt integrity rules + Flux URL construction."""

from __future__ import annotations

from urllib.parse import parse_qs, unquote, urlsplit

from pipeline.thumbnail import build_thumbnail_prompt, thumbnail_image_url


def _sample_spec(kind: str = "hook") -> dict:
    return {"id": "liverpool_vs_man_city_tactical_breakdown", "scenes": [{"kind": kind}]}


def test_prompt_includes_integrity_constraints():
    prompt = build_thumbnail_prompt(_sample_spec(), {})
    assert "unsupported claims" in prompt
    assert "fabricated statistics" in prompt
    assert "guarantee views" in prompt
    assert "imitate a named creator" in prompt


def test_prompt_with_main_text_renders_only_supplied_text():
    prompt = build_thumbnail_prompt(_sample_spec(), {}, main_text="LIVERPOOL COLLAPSE")
    assert 'Main text: "LIVERPOOL COLLAPSE"' in prompt
    assert "Do not invent extra words" in prompt


def test_prompt_without_main_text_forbids_rendered_words():
    prompt = build_thumbnail_prompt(_sample_spec(), {})
    assert "Do not render any words, letters, logos" in prompt


def test_prompt_includes_brand_palette_when_provided():
    prompt = build_thumbnail_prompt(_sample_spec(), {"accent": "#FFD700", "background": "#0a0a0a"})
    assert "#FFD700" in prompt
    assert "#0a0a0a" in prompt


def test_prompt_uses_scene_kind_and_title():
    prompt = build_thumbnail_prompt(_sample_spec(kind="record"), {})
    assert "record" in prompt
    assert "liverpool vs man city tactical breakdown" in prompt


def test_thumbnail_image_url_uses_flux_explicitly():
    url = thumbnail_image_url("a football stadium")
    parsed = urlsplit(url)
    params = parse_qs(parsed.query)
    assert params["model"] == ["flux"], "must pin flux explicitly since Pollinations' default model has changed before"
    assert params["width"] == ["1280"]
    assert params["height"] == ["720"]
    assert params["nologo"] == ["true"]


def test_thumbnail_image_url_encodes_prompt_correctly():
    url = thumbnail_image_url("a stadium & crowd, at night")
    decoded_path = unquote(urlsplit(url).path)
    assert "a stadium & crowd, at night" in decoded_path


def test_thumbnail_image_url_is_deterministic_with_fixed_seed():
    url_a = thumbnail_image_url("prompt", seed=42)
    url_b = thumbnail_image_url("prompt", seed=42)
    assert url_a == url_b
    url_c = thumbnail_image_url("prompt", seed=43)
    assert url_c != url_a


def test_thumbnail_image_url_omits_seed_param_when_not_given():
    url = thumbnail_image_url("prompt")
    params = parse_qs(urlsplit(url).query)
    assert "seed" not in params
