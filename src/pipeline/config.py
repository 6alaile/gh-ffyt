"""
config.py — single source of truth for every env-var read.

Every other module reads env vars through one of these dataclasses via
`from_env()`. New knobs go here, not into consumer modules.

Grouped by concern:
  - FootageKeys    — stock-footage API keys (Pixabay, Pexels).
  - TTSConfig      — voiceover knobs (Edge TTS defaults, ElevenLabs toggle).
  - RenderConfig   — composer knobs (parallelism, aspect ratio).
  - YouTubeSecrets — base64-encoded OAuth credentials for upload.
  - YouTubeDefaults — one-shot env-var overrides + paths for upload.

The dataclasses are constructed with `from_env()` in their consumer
modules; there is no global config object.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

AspectRatio = Literal["16:9", "9:16"]

# Stage pixel dimensions keyed by aspect ratio. Used by compose + base.html.
STAGE_DIMENSIONS: dict[AspectRatio, tuple[int, int]] = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
}


def _env(name: str) -> str | None:
    """Read an env var. Centralised so a single grep finds every read."""
    return os.environ.get(name)


# ─────────────────────────────────────────────────────────────────────
# Stock footage
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class FootageKeys:
    """API keys for the stock-footage providers.

    Both are optional in isolation — if Pixabay is missing, fetchers fall
    back to Pexels, and vice versa. Neither is set, every scene falls
    back to a no-clip placeholder.
    """
    pixabay_api_key: str | None
    pexels_api_key: str | None

    @classmethod
    def from_env(cls) -> "FootageKeys":
        return cls(
            pixabay_api_key=_env("PIXABAY_API_KEY"),
            pexels_api_key=_env("PEXELS_API_KEY"),
        )


# ─────────────────────────────────────────────────────────────────────
# Voiceover
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class TTSConfig:
    """Edge TTS knobs + ElevenLabs toggle.

    Edge TTS is the default (free, no API key). To switch to ElevenLabs
    as a fallback when edge-tts fails, set `allow_elevenlabs=True` and
    supply both ElevenLabs env vars.
    """
    edge_voice: str
    edge_rate: str
    edge_volume: str
    elevenlabs_api_key: str | None
    elevenlabs_voice_id: str | None
    allow_elevenlabs: bool

    @classmethod
    def from_env(cls) -> "TTSConfig":
        return cls(
            edge_voice=_env("EDGE_TTS_VOICE") or "en-US-GuyNeural",
            edge_rate=_env("EDGE_TTS_RATE") or "+0%",
            edge_volume=_env("EDGE_TTS_VOLUME") or "+0%",
            elevenlabs_api_key=_env("ELEVENLABS_API_KEY"),
            elevenlabs_voice_id=_env("ELEVENLABS_VOICE_ID"),
            allow_elevenlabs=_env("TTS_ALLOW_ELEVENLABS") == "1",
        )


# ─────────────────────────────────────────────────────────────────────
# Render
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class RenderConfig:
    """Composer knobs: scene-render parallelism and output aspect ratio."""
    parallel: int
    aspect_ratio: AspectRatio

    @classmethod
    def from_env(cls) -> "RenderConfig":
        try:
            parallel = int(_env("RENDER_PARALLEL") or "3")
        except ValueError:
            parallel = 3

        raw_ratio = (_env("RENDER_ASPECT_RATIO") or "16:9").strip()
        aspect_ratio: AspectRatio = raw_ratio if raw_ratio in STAGE_DIMENSIONS else "16:9"
        if raw_ratio not in STAGE_DIMENSIONS:
            print(
                f"  ! RENDER_ASPECT_RATIO={raw_ratio!r} is invalid; "
                f"using 16:9 (allowed: {', '.join(STAGE_DIMENSIONS)})"
            )

        return cls(parallel=max(1, parallel), aspect_ratio=aspect_ratio)

    @property
    def stage_width(self) -> int:
        return STAGE_DIMENSIONS[self.aspect_ratio][0]

    @property
    def stage_height(self) -> int:
        return STAGE_DIMENSIONS[self.aspect_ratio][1]


# ─────────────────────────────────────────────────────────────────────
# YouTube — secrets
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class YouTubeSecrets:
    """Base64-encoded OAuth credentials for the YouTube Data API v3.

    The composer decodes these at upload time and writes them to a temp
    dir; never commit the decoded files.
    """
    client_secrets_base64: str | None
    token_pickle_base64: str | None

    @classmethod
    def from_env(cls) -> "YouTubeSecrets":
        return cls(
            client_secrets_base64=_env("YT_CLIENT_SECRETS_BASE64"),
            token_pickle_base64=_env("YT_TOKEN_PICKLE_BASE64"),
        )

    @property
    def both_set(self) -> bool:
        return bool(self.client_secrets_base64) and bool(self.token_pickle_base64)


# ─────────────────────────────────────────────────────────────────────
# YouTube — defaults & overrides
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class YouTubeDefaults:
    """Upload-side knobs: paths, env-var overrides.

    Every field can be overridden by an env var (one-shot manual mode).
    Resolution: env var → default.
    """
    spec_path: str | None
    video_file: str
    privacy_status: str | None
    thumbnail_path: str | None
    captions_path: str | None

    @classmethod
    def from_env(cls) -> "YouTubeDefaults":
        return cls(
            spec_path=_env("YT_SPEC_PATH"),
            video_file=_env("VIDEO_FILE") or "world_cup_video_01_FINAL_v2.mp4",
            privacy_status=_env("YT_PRIVACY_STATUS"),
            thumbnail_path=_env("YT_THUMBNAIL_PATH"),
            captions_path=_env("YT_CAPTIONS_PATH"),
        )