"""Tests for pipeline.voiceover — accent-tag stripping before TTS synthesis.

This closes a real bug: <accent> is a display-only convention for
on-screen headline emphasis (see llm/__init__.py's emphasis-note
extraction, which expects <accent> inside scene["script"]), but neither
TTS generator stripped it before sending text to synthesis — meaning
Edge TTS/ElevenLabs have likely been speaking the literal tags aloud.
"""

from __future__ import annotations

from pathlib import Path

from pipeline.voiceover import strip_accent_tags


def test_strip_accent_tags_removes_open_and_close_tags():
    assert strip_accent_tags("The <accent>high line</accent> was exposed.") == "The high line was exposed."


def test_strip_accent_tags_handles_multiple_occurrences():
    text = "<accent>Liverpool</accent> collapsed after <accent>the substitution</accent>."
    assert strip_accent_tags(text) == "Liverpool collapsed after the substitution."


def test_strip_accent_tags_no_op_on_plain_text():
    assert strip_accent_tags("Nothing to strip here.") == "Nothing to strip here."


def test_strip_accent_tags_empty_string():
    assert strip_accent_tags("") == ""


def test_edge_tts_strips_accent_tags_before_synthesis(monkeypatch, tmp_path: Path):
    """The actual bug fix: confirm the text handed to edge_tts.Communicate
    has no <accent> markup left in it."""
    import sys
    import types

    captured = {}

    class FakeCommunicate:
        def __init__(self, text, voice, rate, volume):
            captured["text"] = text

        async def stream(self):
            if False:
                yield {}  # pragma: no cover - makes this an async generator

    fake_edge_tts = types.ModuleType("edge_tts")
    fake_edge_tts.Communicate = FakeCommunicate
    monkeypatch.setitem(sys.modules, "edge_tts", fake_edge_tts)

    from pipeline.voiceover import generate_with_edge_tts

    generate_with_edge_tts("The <accent>high line</accent> was exposed.", tmp_path / "out.mp3")
    assert captured["text"] == "The high line was exposed."
    assert "<accent>" not in captured["text"]


def test_elevenlabs_strips_accent_tags_before_synthesis(monkeypatch, tmp_path: Path):
    captured = {}

    class FakeResponse:
        status_code = 200
        content = b"fake audio bytes"

    def fake_post(url, headers, json, timeout):
        captured["json"] = json
        return FakeResponse()

    monkeypatch.setattr("pipeline.voiceover.requests.post", fake_post)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "fake-key")

    from pipeline.voiceover import generate_with_elevenlabs

    generate_with_elevenlabs(
        "The <accent>high line</accent> was exposed.", tmp_path / "out.mp3", "voice123", {}
    )
    assert captured["json"]["text"] == "The high line was exposed."
    assert "<accent>" not in captured["json"]["text"]
