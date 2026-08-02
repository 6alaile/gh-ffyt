"""
voiceover.py — voiceover generators.

Uses Microsoft Edge TTS (free, no API key) as the default. ElevenLabs
is implemented below but DORMANT — flip the `TTS_ALLOW_ELEVENLABS=1`
env var to enable it as a fallback.

Edge TTS word timings:
  When using Edge TTS, `generate_with_edge_tts` listens for
  `WordBoundary` stream events and returns a list of
  `{"word": str, "start": int, "end": int}` dicts with millisecond
  offsets. These feed kinetic subtitle animation in renderers.py.

Why dormant ElevenLabs:
  - ElevenLabs free tier now blocks library voices via the API
    (402 paid_plan_required).
  - Edge TTS has no voice-settings tuning (no stability/similarity/
    style knobs), so the output sounds different from ElevenLabs.
  - ElevenLabs fallback does not produce word-level timings.

TTS knobs come from `TTSConfig.from_env()` (see pipeline.config).
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, TypedDict

import requests

from pipeline.config import TTSConfig
from pipeline.defaults import ELEVENLABS_VOICE_SETTINGS


class WordTiming(TypedDict):
    word: str
    start: int
    end: int


# ─────────────────────────────────────────────────────────────────────
# Audio-duration anchoring
#
# Scene durations in the spec are editorial estimates. The real timing
# constraint is however long the generated voiceover actually runs, so
# compose.py measures the rendered audio file and overwrites
# scene["duration_s"] with it (see `probe_audio_duration_seconds`).
# This padding is added on top so speech has a moment of silence
# before the scene cuts/crossfades into the next one.
# ─────────────────────────────────────────────────────────────────────
AUDIO_PADDING_SEC = 0.2


def probe_audio_duration_seconds(path: Path) -> float | None:
    """Measure the exact duration (seconds) of an audio file via ffprobe.

    Returns None if ffprobe is missing, times out, or the file can't be
    probed (e.g. zero-byte / corrupt download) — callers should fall
    back to the spec's authored `duration_s` in that case rather than
    fail the scene outright.
    """
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode != 0:
            return None
        duration = float(r.stdout.strip())
        return duration if duration > 0 else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


# Edge TTS reports offset/duration in 100-nanosecond units (same as SSML).
_HUNDRED_NS_PER_MS = 10_000


def _ticks_to_ms(ticks: int | float) -> int:
    """Convert Edge TTS 100-ns ticks to integer milliseconds."""
    try:
        return max(0, int(round(float(ticks) / _HUNDRED_NS_PER_MS)))
    except (TypeError, ValueError):
        return 0


def _word_boundary_to_timing(chunk: dict[str, Any]) -> WordTiming | None:
    """Parse a single WordBoundary chunk into a timing dict."""
    text = chunk.get("text")
    if not text or not str(text).strip():
        return None
    start = _ticks_to_ms(chunk.get("offset", 0))
    end = start + _ticks_to_ms(chunk.get("duration", 0))
    if end <= start:
        end = start + 1
    return {"word": str(text).strip(), "start": start, "end": end}


# ─────────────────────────────────────────────────────────────────────
# ElevenLabs — DORMANT, see module docstring.
# ─────────────────────────────────────────────────────────────────────
def generate_with_elevenlabs(text: str, dest: Path, voice_id: str, tts: dict) -> bool:
    """ElevenLabs cloud TTS. Returns True on success."""
    cfg = TTSConfig.from_env()
    api_key = cfg.elevenlabs_api_key
    if not api_key:
        return False
    model_id = tts.get("model_id") or "eleven_multilingual_v2"
    settings = {**ELEVENLABS_VOICE_SETTINGS, "stability": tts.get("stability", 0.45)}
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        json={"text": text, "model_id": model_id, "voice_settings": settings},
        timeout=60,
    )
    if r.status_code != 200:
        print(f"  ! ElevenLabs failed ({r.status_code}): {r.text[:200]}")
        return False
    dest.write_bytes(r.content)
    print(f"  ok ElevenLabs  {dest.name} ({dest.stat().st_size // 1024} KB)")
    return True


# ─────────────────────────────────────────────────────────────────────
# Edge TTS — DEFAULT
# Requires: pip install edge-tts
# ─────────────────────────────────────────────────────────────────────
def generate_with_edge_tts(text: str, dest: Path) -> tuple[bool, list[WordTiming]]:
    """Microsoft Edge free TTS with word-boundary timestamps.

    Returns `(success, word_timings)`. On failure the timings list is empty.
    """
    try:
        import edge_tts  # noqa: F401 — imported here so the module is optional
    except ImportError:
        print("  ! edge-tts not installed. pip install edge-tts to enable fallback.")
        return False, []

    import asyncio

    cfg = TTSConfig.from_env()

    async def _run() -> tuple[bytes | None, list[WordTiming]]:
        communicate = edge_tts.Communicate(
            text=text,
            voice=cfg.edge_voice,
            rate=cfg.edge_rate,
            volume=cfg.edge_volume,
        )
        buf = bytearray()
        words: list[WordTiming] = []
        async for chunk in communicate.stream():
            chunk_type = chunk.get("type")
            if chunk_type == "audio":
                data = chunk.get("data")
                if data:
                    buf.extend(data)
            elif chunk_type == "WordBoundary":
                timing = _word_boundary_to_timing(chunk)
                if timing is not None:
                    words.append(timing)
        return (bytes(buf) if buf else None), words

    try:
        audio_bytes, word_timings = asyncio.run(_run())
    except Exception as e:
        print(f"  ! edge-tts failed: {e}")
        return False, []

    if not audio_bytes:
        print("  ! edge-tts returned no audio")
        return False, []

    dest.write_bytes(audio_bytes)
    print(
        f"  ok edge-tts    {dest.name} ({dest.stat().st_size // 1024} KB, "
        f"{len(word_timings)} word boundaries)"
    )
    return True, word_timings


# ─────────────────────────────────────────────────────────────────────
# Dispatcher
# ─────────────────────────────────────────────────────────────────────
def generate_voiceover(
    text: str,
    dest: Path,
    voice_id: str | None,
    tts: dict,
    allow_elevenlabs: bool = False,
) -> tuple[bool, list[WordTiming]]:
    """Generate `text` to `dest`. Returns `(success, word_timings)`.

    Strategy:
      1. Use Edge TTS (free, no key). Word timings come from WordBoundary
         events when available.
      2. If `allow_elevenlabs` is True AND edge-tts fails, try ElevenLabs
         as a fallback (no word timings).

    Both generators print their own progress and errors.
    """
    ok, word_timings = generate_with_edge_tts(text, dest)
    if ok:
        return True, word_timings

    cfg = TTSConfig.from_env()
    if not allow_elevenlabs:
        print(f"  ! edge-tts failed and ElevenLabs is dormant — skipping {dest.name}")
        return False, []

    print(f"  ! edge-tts failed — falling back to ElevenLabs for {dest.name}")
    if not (voice_id and cfg.elevenlabs_api_key):
        print(
            "  ! ElevenLabs unavailable (no ELEVENLABS_API_KEY or voice_id) — "
            "using edge-tts as primary; this shouldn't normally trigger"
        )
        return False, []

    if generate_with_elevenlabs(text, dest, voice_id, tts):
        return True, []
    return False, []
