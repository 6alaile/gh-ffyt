"""LLM provider + generate-validate-repair loop tests, mirroring web/lib/llm/__tests__/run.ts."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from pipeline.llm.generate import GenerationValidationError, generate_validated
from pipeline.llm.providers import ProviderError, call_gemini, call_openrouter


def _fake_response(status_code: int, json_data: Any = None, text: str = "") -> SimpleNamespace:
    return SimpleNamespace(status_code=status_code, json=lambda: json_data, text=text)


def test_call_gemini_parses_real_generatecontent_shape():
    captured = {}

    def fake_post(url, json, timeout):
        captured["url"] = url
        captured["json"] = json
        return _fake_response(200, {"candidates": [{"content": {"parts": [{"text": "## Hook\nhi"}]}}]})

    text = call_gemini("write a brief", api_key="fake-key", http=fake_post)
    assert text == "## Hook\nhi"
    assert "gemini-flash-latest" in captured["url"]
    assert captured["json"]["contents"][0]["parts"][0]["text"] == "write a brief"


def test_call_gemini_raises_provider_error_on_non_200():
    def fake_post(url, json, timeout):
        return _fake_response(429, text="rate limited")

    with pytest.raises(ProviderError, match="429"):
        call_gemini("x", api_key="fake-key", http=fake_post)


def test_call_gemini_raises_on_missing_candidates():
    def fake_post(url, json, timeout):
        return _fake_response(200, {"candidates": []})

    with pytest.raises(ProviderError, match="no usable text"):
        call_gemini("x", api_key="fake-key", http=fake_post)


def test_call_openrouter_parses_real_chat_completions_shape():
    def fake_post(url, headers, json, timeout):
        assert url == "https://openrouter.ai/api/v1/chat/completions"
        return _fake_response(200, {"choices": [{"message": {"content": "## Hook\nhi"}}]})

    text = call_openrouter("write a brief", api_key="fake-key", use_openrouter=True, http=fake_post)
    assert text == "## Hook\nhi"


def test_call_openrouter_uses_openai_url_when_not_openrouter():
    def fake_post(url, headers, json, timeout):
        assert url == "https://api.openai.com/v1/chat/completions"
        assert json["model"] == "gpt-4o-mini"
        return _fake_response(200, {"choices": [{"message": {"content": "hi"}}]})

    call_openrouter("x", api_key="fake-key", use_openrouter=False, http=fake_post)


def test_generate_validated_succeeds_first_attempt_without_repair_call():
    calls = {"n": 0}

    def call_fn(prompt: str) -> str:
        calls["n"] += 1
        return "## Hook\n## Scene"

    def validate(raw: str) -> str:
        if "## Hook" not in raw:
            raise ValueError("missing hook")
        return raw

    result = generate_validated(call_fn, "prompt", validate)
    assert result == "## Hook\n## Scene"
    assert calls["n"] == 1


def test_generate_validated_retries_once_with_error_then_succeeds():
    calls = {"n": 0}

    def call_fn(prompt: str) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            return "not markdown"
        assert "failed validation" in prompt
        return "## Hook\n## Scene"

    def validate(raw: str) -> str:
        if "## Hook" not in raw:
            raise ValueError("missing ## Hook marker")
        return raw

    result = generate_validated(call_fn, "prompt", validate)
    assert result == "## Hook\n## Scene"
    assert calls["n"] == 2


def test_generate_validated_raises_after_two_failures_no_third_attempt():
    calls = {"n": 0}

    def call_fn(prompt: str) -> str:
        calls["n"] += 1
        return "still not markdown"

    def validate(raw: str) -> str:
        if "## Hook" not in raw:
            raise ValueError("missing ## Hook marker")
        return raw

    with pytest.raises(GenerationValidationError):
        generate_validated(call_fn, "prompt", validate)
    assert calls["n"] == 2


# ─────────────────────────────────────────────────────────────────────
# script_writer: LLM-enriched path + graceful fallback
# ─────────────────────────────────────────────────────────────────────

def _sample_spec() -> dict:
    return {
        "scenes": [
            {"kind": "hook", "script": "Liverpool collapse late.", "duration_s": 8, "cta": "Subscribe!"},
        ]
    }


def test_script_writer_llm_produces_grounded_commentary_and_timings():
    import pipeline.llm as llm_module

    def fake_call_fn(prompt: str) -> str:
        return (
            '{"commentary": "The high line was exposed on the counter.", '
            '"replay_cue": "Watch the fullback\'s positioning at 0:42.", '
            '"emphasis_notes": ["high line", "counter-attack"]}'
        )

    result = llm_module._script_writer_llm(_sample_spec(), {}, {}, fake_call_fn)
    scene = result["scenes"][0]
    assert "high line was exposed" in scene["script"]
    assert scene["emphasis_notes"] == ["high line", "counter-attack"]
    assert len(scene["word_timings"]) > 0
    assert scene["word_timings"][0]["word"] == "Liverpool"


def test_script_writer_falls_back_to_rule_based_when_llm_fails_twice(monkeypatch):
    import pipeline.llm as llm_module

    def always_fails(prompt: str) -> str:
        return "not valid json at all"

    monkeypatch.setattr(llm_module, "_call_fn_for_provider", lambda: always_fails)

    result = llm_module.script_writer(_sample_spec(), {}, None, {})
    scene = result["scenes"][0]
    # Rule-based fallback's known, always-present line — proves it degraded
    # gracefully rather than raising or returning a half-built scene.
    assert "Here's the rule this teaches" in scene["script"]
    assert len(scene["word_timings"]) > 0


def test_script_writer_uses_rule_based_when_no_provider_configured(monkeypatch):
    import pipeline.llm as llm_module

    monkeypatch.setattr(llm_module, "_call_fn_for_provider", lambda: None)

    result = llm_module.script_writer(_sample_spec(), {}, None, {})
    assert "Here's the rule this teaches" in result["scenes"][0]["script"]
