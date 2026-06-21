"""Config dataclass tests — env-var reads go through the from_env() classmethods."""

from __future__ import annotations

import pytest

from pipeline.config import (
    FootageKeys,
    RenderConfig,
    TTSConfig,
    YouTubeDefaults,
    YouTubeSecrets,
)


def test_tts_config_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    # Strip any environment that might be set in CI.
    for var in (
        "EDGE_TTS_VOICE", "EDGE_TTS_RATE", "EDGE_TTS_VOLUME",
        "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "TTS_ALLOW_ELEVENLABS",
    ):
        monkeypatch.delenv(var, raising=False)

    cfg = TTSConfig.from_env()
    assert cfg.edge_voice == "en-US-GuyNeural"
    assert cfg.edge_rate == "+0%"
    assert cfg.edge_volume == "+0%"
    assert cfg.elevenlabs_api_key is None
    assert cfg.elevenlabs_voice_id is None
    assert cfg.allow_elevenlabs is False


def test_tts_config_env_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDGE_TTS_VOICE", "en-GB-RyanNeural")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "v")
    monkeypatch.setenv("TTS_ALLOW_ELEVENLABS", "1")
    cfg = TTSConfig.from_env()
    assert cfg.edge_voice == "en-GB-RyanNeural"
    assert cfg.elevenlabs_api_key == "k"
    assert cfg.elevenlabs_voice_id == "v"
    assert cfg.allow_elevenlabs is True


def test_tts_config_allow_elevenlabs_only_on_exact_one(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TTS_ALLOW_ELEVENLABS", "true")  # not "1"
    cfg = TTSConfig.from_env()
    assert cfg.allow_elevenlabs is False


def test_render_config_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RENDER_PARALLEL", raising=False)
    cfg = RenderConfig.from_env()
    assert cfg.parallel == 3


def test_render_config_explicit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RENDER_PARALLEL", "4")
    assert RenderConfig.from_env().parallel == 4


def test_render_config_clamps_to_minimum_one(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RENDER_PARALLEL", "0")
    assert RenderConfig.from_env().parallel == 1


def test_render_config_falls_back_on_junk(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RENDER_PARALLEL", "not-a-number")
    assert RenderConfig.from_env().parallel == 3


def test_footage_keys_default_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PIXABAY_API_KEY", raising=False)
    monkeypatch.delenv("PEXELS_API_KEY", raising=False)
    keys = FootageKeys.from_env()
    assert keys.pixabay_api_key is None
    assert keys.pexels_api_key is None


def test_footage_keys_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PIXABAY_API_KEY", "p")
    monkeypatch.setenv("PEXELS_API_KEY", "x")
    keys = FootageKeys.from_env()
    assert keys.pixabay_api_key == "p"
    assert keys.pexels_api_key == "x"


def test_youtube_secrets_both_set_property(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("YT_CLIENT_SECRETS_BASE64", raising=False)
    monkeypatch.delenv("YT_TOKEN_PICKLE_BASE64", raising=False)
    s = YouTubeSecrets.from_env()
    assert s.both_set is False

    monkeypatch.setenv("YT_CLIENT_SECRETS_BASE64", "abc")
    assert s.both_set is False  # only one set

    monkeypatch.setenv("YT_TOKEN_PICKLE_BASE64", "def")
    assert YouTubeSecrets.from_env().both_set is True


def test_youtube_defaults_default_video(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VIDEO_FILE", raising=False)
    d = YouTubeDefaults.from_env()
    # The historical default video filename; documented in upload.py.
    assert d.video_file == "world_cup_video_01_FINAL_v2.mp4"
    assert d.spec_path is None
    assert d.thumbnail_path is None
    assert d.captions_path is None
