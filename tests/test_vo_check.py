"""Tests for pipeline.vo_check — diffs Whisper's transcript of the
generated audio against the script that was sent to TTS. Diagnostic
only: every path must degrade gracefully, never raise, never block."""

from __future__ import annotations

from pathlib import Path

import pipeline.vo_check as vo_check


def test_matching_transcript_is_not_flagged(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(vo_check, "transcribe_audio", lambda audio_path, model_size="base": "the high line was exposed")

    result = vo_check.check_voiceover_match("scene_1", tmp_path / "a.mp3", "The high line was exposed.")
    assert result.flagged is False
    assert result.similarity > 0.9


def test_badly_mismatched_transcript_is_flagged(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(vo_check, "transcribe_audio", lambda audio_path, model_size="base": "completely unrelated words about weather")

    result = vo_check.check_voiceover_match("scene_1", tmp_path / "a.mp3", "The high line was exposed at the back.")
    assert result.flagged is True
    assert "below threshold" in result.reason


def test_accent_tags_in_script_are_normalized_before_comparison(monkeypatch, tmp_path: Path):
    """Regression guard for the bug this same change fixed: the expected
    text still carries <accent> in the spec, but the actual audio never
    spoke it (now that synthesis strips it) — the comparison must
    normalize both sides the same way or every scene would misfire."""
    monkeypatch.setattr(vo_check, "transcribe_audio", lambda audio_path, model_size="base": "the high line was exposed")

    result = vo_check.check_voiceover_match(
        "scene_1", tmp_path / "a.mp3", "The <accent>high line</accent> was exposed."
    )
    assert result.flagged is False
    assert "accent" not in result.expected


def test_transcription_unavailable_is_not_flagged(monkeypatch, tmp_path: Path):
    """No transcript to compare against is a missing check, not a failed
    one — must not be reported as a mismatch."""
    monkeypatch.setattr(vo_check, "transcribe_audio", lambda audio_path, model_size="base": None)

    result = vo_check.check_voiceover_match("scene_1", tmp_path / "a.mp3", "The high line was exposed.")
    assert result.flagged is False
    assert result.transcribed is None


def test_transcription_error_never_raises(monkeypatch, tmp_path: Path):
    def boom(audio_path, model_size="base"):
        raise RuntimeError("faster-whisper crashed")

    monkeypatch.setattr(vo_check, "transcribe_audio", boom)

    result = vo_check.check_voiceover_match("scene_1", tmp_path / "a.mp3", "The high line was exposed.")
    assert result.flagged is False
    assert "transcription error" in result.reason


def test_normalize_strips_punctuation_and_case():
    assert vo_check._normalize("The High-Line, Exposed!") == "the high line exposed"
