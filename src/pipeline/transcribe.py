"""
transcribe.py — convert audio blob to text via Whisper.

Used by the brief-form voice capture feature. Accepts an audio file
(webm, wav, mp3) and returns the full transcript as plain text.

Uses faster-whisper (same as captions.py).
Requires: pip install faster-whisper
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def transcribe_audio(audio_path: Path, model_size: str = "base") -> str | None:
    """Transcribe audio file to text using Whisper.

    Returns the full transcript as a single string, or None on failure.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("  ! faster-whisper not installed. pip install faster-whisper")
        return None

    # Convert to 16kHz mono WAV (Whisper expects this)
    wav_path = audio_path.with_suffix(".wav")
    try:
        r = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(audio_path),
                "-vn", "-ac", "1", "-ar", "16000",
                str(wav_path),
            ],
            capture_output=True, text=True, timeout=60,
        )
        if r.returncode != 0:
            print(f"  ! ffmpeg audio conversion failed: {r.stderr[-500:]}")
            return None
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"  ! ffmpeg audio conversion failed: {e}")
        return None

    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(str(wav_path), word_timestamps=False)

        transcript_parts = []
        for segment in segments:
            text = segment.text.strip()
            if text:
                transcript_parts.append(text)

        if not transcript_parts:
            return None

        return " ".join(transcript_parts)
    except Exception as e:
        print(f"  ! whisper transcription failed: {e}")
        return None
    finally:
        wav_path.unlink(missing_ok=True)
