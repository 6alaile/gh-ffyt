"""
captions.py — auto-generate a YouTube captions.srt via Whisper.

Why this exists: edge-tts already returns per-word timings that drive
the on-screen kinetic subtitles (see voiceover.py / renderers.py), but
those are per-scene and never assembled into a standalone .srt for
YouTube's official caption track — YT_CAPTIONS_PATH previously
required a hand-made file. This module transcribes the final,
already-concatenated video (the actual audio a viewer hears, post
xfade) with faster-whisper (free, local, no API key) so a real .srt
exists without manual work.

Uses faster-whisper (CPU-friendly CTranslate2 build of Whisper).
Requires: pip install faster-whisper
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def _srt_timestamp(seconds: float) -> str:
    """Format seconds as an SRT timestamp: HH:MM:SS,mmm."""
    ms = max(0, round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1_000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _extract_audio_wav(video_path: Path, dest: Path) -> bool:
    """Extract mono 16kHz audio from `video_path` to `dest` via ffmpeg.

    Returns True on success. 16kHz mono is what Whisper expects.
    """
    try:
        r = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-vn", "-ac", "1", "-ar", "16000",
                str(dest),
            ],
            capture_output=True, text=True, timeout=300,
        )
        if r.returncode != 0:
            print(f"  ! ffmpeg audio extraction failed: {r.stderr[-500:]}")
            return False
        return dest.exists()
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"  ! ffmpeg audio extraction failed: {e}")
        return False


def generate_captions_srt(video_path: Path, dest_srt: Path, model_size: str = "base") -> bool:
    """Transcribe `video_path`'s audio and write an .srt to `dest_srt`.

    Returns True on success, False on any failure (missing dependency,
    ffmpeg failure, empty transcript) — callers should treat this as
    non-fatal and continue without captions.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("  ! faster-whisper not installed. pip install faster-whisper to enable captions.")
        return False

    wav_path = dest_srt.with_suffix(".wav")
    if not _extract_audio_wav(video_path, wav_path):
        return False

    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(str(wav_path), word_timestamps=False)

        lines: list[str] = []
        count = 0
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            count += 1
            lines.append(str(count))
            lines.append(f"{_srt_timestamp(segment.start)} --> {_srt_timestamp(segment.end)}")
            lines.append(text)
            lines.append("")

        if count == 0:
            print("  ! whisper produced no segments — not writing an empty .srt")
            return False

        dest_srt.write_text("\n".join(lines), encoding="utf-8")
        print(f"  ok captions    {dest_srt.name} ({count} lines)")
        return True
    except Exception as e:
        print(f"  ! whisper transcription failed: {e}")
        return False
    finally:
        wav_path.unlink(missing_ok=True)
