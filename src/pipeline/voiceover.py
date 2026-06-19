"""
voiceover.py — voiceover generators.

Uses Microsoft Edge TTS (free, no API key) as the default. ElevenLabs
is implemented below but DORMANT — flip the `TTS_ALLOW_ELEVENLABS=1`
env var to enable it as a fallback.

Why dormant:
  - ElevenLabs free tier now blocks library voices via the API
    (402 paid_plan_required).
  - Edge TTS has no voice-settings tuning (no stability/similarity/
    style knobs), so the output sounds different from ElevenLabs.

ElevenLabs (dormant) requires:
  - ELEVENLABS_API_KEY
  - ELEVENLABS_VOICE_ID
  - The TTS_ALLOW_ELEVENLABS=1 env var

TTS knobs come from `TTSConfig.from_env()` (see pipeline.config).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import requests

from pipeline.config import TTSConfig
from pipeline.defaults import ELEVENLABS_VOICE_SETTINGS


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
def generate_with_edge_tts(text: str, dest: Path) -> bool:
    """Microsoft Edge free TTS. No API key, but requires `edge-tts` package."""
    try:
        import edge_tts  # noqa: F401 — imported here so the module is optional
    except ImportError:
        print("  ! edge-tts not installed. pip install edge-tts to enable fallback.")
        return False

    import asyncio

    cfg = TTSConfig.from_env()

    async def _run() -> bytes | None:
        communicate = edge_tts.Communicate(
            text=text,
            voice=cfg.edge_voice,
            rate=cfg.edge_rate,
            volume=cfg.edge_volume,
        )
        buf = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.extend(chunk["data"])
        return bytes(buf) if buf else None

    try:
        audio_bytes = asyncio.run(_run())
    except Exception as e:
        print(f"  ! edge-tts failed: {e}")
        return False
    if not audio_bytes:
        print("  ! edge-tts returned no audio")
        return False
    dest.write_bytes(audio_bytes)
    print(f"  ok edge-tts    {dest.name} ({dest.stat().st_size // 1024} KB)")
    return True


# ─────────────────────────────────────────────────────────────────────
# Dispatcher
# ─────────────────────────────────────────────────────────────────────
def generate_voiceover(
    text: str,
    dest: Path,
    voice_id: str | None,
    tts: dict,
    allow_elevenlabs: bool = False,
) -> bool:
    """Generate `text` to `dest`. Returns True on success.

    Strategy:
      1. Use Edge TTS (free, no key, requires `edge-tts` package).
      2. If `allow_elevenlabs` is True AND edge-tts fails, try ElevenLabs
         as a fallback. Disabled by default — see module docstring.

    Both generators print their own progress and errors.
    """
    if generate_with_edge_tts(text, dest):
        return True

    cfg = TTSConfig.from_env()
    if not allow_elevenlabs:
        print(f"  ! edge-tts failed and ElevenLabs is dormant — skipping {dest.name}")
        return False

    print(f"  ! edge-tts failed — falling back to ElevenLabs for {dest.name}")
    if not (voice_id and cfg.elevenlabs_api_key):
        print("  ! ElevenLabs unavailable (no ELEVENLABS_API_KEY or voice_id) — using edge-tts as primary; this shouldn't normally trigger")
        return False
    return generate_with_elevenlabs(text, dest, voice_id, tts)