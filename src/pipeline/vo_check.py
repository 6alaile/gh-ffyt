"""
vo_check.py — VO quality check: transcribe the generated audio back to
text via Whisper and diff it against the script that was sent to TTS.

This is a diagnostic layer, not a replacement for TTS and not a gate —
per the project's stated direction, it's meant to catch drift (dropped
words, mispronunciations, or bugs like the accent-tag one this same
change fixed) so a human can review, not to block the pipeline. Every
function here degrades to "no result, print a warning" on failure;
nothing it does can fail a render.

Uses the existing transcribe_audio() (faster-whisper, same dependency
already used for captions) rather than adding a second Whisper
integration.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

from pipeline.transcribe import transcribe_audio
from pipeline.voiceover import strip_accent_tags

# Below this similarity ratio, the mismatch is flagged as worth a human
# look — TTS mispronunciation and Whisper's own transcription noise both
# produce some drift even on a clean read, so this isn't 1.0.
MISMATCH_THRESHOLD = 0.75


@dataclass
class VOCheckResult:
    scene_id: str
    similarity: float
    expected: str
    transcribed: Optional[str]
    flagged: bool
    reason: str


def _normalize(text: str) -> str:
    """Lowercase, strip punctuation/whitespace noise, so the comparison
    is about words spoken, not formatting."""
    text = strip_accent_tags(text)
    text = re.sub(r"[^\w\s]", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def check_voiceover_match(scene_id: str, audio_path: Path, expected_script: str, model_size: str = "base") -> VOCheckResult:
    """Transcribe `audio_path` and compare against `expected_script`.

    Never raises — a transcription failure produces a result with
    transcribed=None and flagged=False (nothing to compare, so nothing
    to flag; a missing check is not the same claim as a passing one,
    but this is a diagnostic aid, not evidence-grade output).
    """
    expected_norm = _normalize(expected_script)

    try:
        transcript = transcribe_audio(audio_path, model_size=model_size)
    except Exception as e:  # noqa: BLE001 - this check must never break the build
        return VOCheckResult(scene_id, 0.0, expected_norm, None, False, f"transcription error: {e}")

    if transcript is None:
        return VOCheckResult(scene_id, 0.0, expected_norm, None, False, "transcription unavailable (faster-whisper not installed or failed)")

    transcript_norm = _normalize(transcript)
    similarity = SequenceMatcher(None, expected_norm, transcript_norm).ratio()
    flagged = similarity < MISMATCH_THRESHOLD
    reason = (
        f"similarity {similarity:.2f} below threshold {MISMATCH_THRESHOLD}"
        if flagged
        else f"similarity {similarity:.2f} — OK"
    )
    return VOCheckResult(scene_id, similarity, expected_norm, transcript_norm, flagged, reason)
