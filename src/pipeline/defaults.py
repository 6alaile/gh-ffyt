"""
defaults.py — palette, TTS defaults, and the ffmpeg re-encode command.

These live in their own module so multiple consumers (the composer
needs the palette + re-encode; the brief parser + upload.py need to
inspect defaults) can share them without a circular import.
"""

from __future__ import annotations


# ─────────────────────────────────────────────────────────────────────
# Palette
# ─────────────────────────────────────────────────────────────────────
DEFAULT_PALETTE = {
    "bg":         "#0a0a0a",
    "fg":         "#f5f5f0",
    "accent":     "#ffd700",
    "accent_dim": "#b8980a",
    "rule":       "#2a2a2a",
    "muted":      "#888888",
    "danger":     "#e63946",
}


# ─────────────────────────────────────────────────────────────────────
# TTS
# ─────────────────────────────────────────────────────────────────────
DEFAULT_TTS = {
    "voice_id":  None,                  # set via ELEVENLABS_VOICE_ID env var
    "stability": 0.45,
    "model_id":  "eleven_multilingual_v2",
}


# ─────────────────────────────────────────────────────────────────────
# ElevenLabs voice settings
#
# The free tier now blocks library voices via the API (402). The
# dispatcher defaults to edge-tts and only consults ElevenLabs when
# TTS_ALLOW_ELEVENLABS=1 and edge-tts has failed.
# ─────────────────────────────────────────────────────────────────────
ELEVENLABS_VOICE_SETTINGS = {
    "stability":         0.45,
    "similarity_boost":  0.80,
    "style":             0.35,
    "use_speaker_boost": True,
}


# ─────────────────────────────────────────────────────────────────────
# ffmpeg re-encode for stock footage (1-second GOP, yuv420p, faststart)
#
# Inputs are filled in by REENCODE_FFMPEG.format(input=…, output=…,
# duration=…). Duration is the scene's `duration_s`; the ffmpeg `-t`
# flag trims the clip to that length during re-encode.
# ─────────────────────────────────────────────────────────────────────
REENCODE_FFMPEG = [
    "ffmpeg", "-y",
    "-ss", "0",
    "-i", "{input}",
    "-t", "{duration}",
    "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-g", "30",
    "-keyint_min", "30",
    "-r", "30",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-ar", "44100",
    "-movflags", "+faststart",
    "{output}",
]