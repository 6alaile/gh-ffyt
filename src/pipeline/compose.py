"""
compose.py — single entry point for the spec-driven video factory.

Pipeline (per scene):
  1. Fetch stock footage (Pixabay first, fall back to Pexels).
  2. Trim + re-encode with a 1-second GOP for clean random access.
  3. Generate voiceover via Edge TTS (ElevenLabs is dormant).
  4. Render the per-scene HTML from pipeline.resources/base.html.
  5. npx hyperframes render the HTML to MP4.

After all scenes:
  6. ffmpeg xfade concat into <spec.id>.mp4.

The final MP4 is at <output-dir>/<spec.id>/<spec.id>.mp4. It is the
upload artifact.

Reads env vars only via pipeline.config — no `os.environ.get` here.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from importlib.resources import files as resource_files
from pathlib import Path
from typing import Any

from pipeline.config import RenderConfig, TTSConfig
from pipeline.defaults import DEFAULT_PALETTE, DEFAULT_TTS, REENCODE_FFMPEG
from pipeline.fetchers import download_file, fetch_clip
from pipeline.renderers import render_kind
from pipeline.schema import SpecError, load_and_validate
from pipeline.voiceover import generate_voiceover


# ─────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────
def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Spec-driven video composer")
    p.add_argument("--spec", required=True, help="path to a JSON spec file")
    p.add_argument("--output-dir", default="build", help="output base directory (default: build)")
    p.add_argument("--hyperframes-version", default="0.6.103", help="hyperframes npm version (default: 0.6.103)")
    p.add_argument("--quality", default="high", choices=["low", "medium", "high"], help="hyperframes render quality")
    p.add_argument("--xfade", type=float, default=0.3, help="crossfade seconds between scenes (default: 0.3)")
    return p.parse_args(argv)


# ─────────────────────────────────────────────────────────────────────
# HTML rendering
# ─────────────────────────────────────────────────────────────────────
def _read_base_template() -> str:
    """Read the per-scene HTML shell from package data.

    Reads `pipeline.resources.base.html` via importlib.resources so the
    template ships with the installed package, not the cwd.
    """
    return resource_files("pipeline.resources").joinpath("base.html").read_text(encoding="utf-8")


def render_scene_html(scene: dict[str, Any], spec: dict[str, Any], palette: dict[str, str]) -> str:
    """Fill the base template with per-scene slots.

    Uses simple string replacement rather than str.format so that
    JavaScript blocks (which contain literal `{}`) and CSS (which
    contains `{` and `}` in selectors and at-rules) survive intact.
    """
    css, content, anim = render_kind(scene)
    base = _read_base_template()
    pill_html = f'<span class="pill">{scene["pill"]}</span>' if scene.get("pill") else ""
    top_label = scene.get("top_label", "LIVE")
    bottom_label = scene.get("bottom_label", "")
    composition_id = f'{spec["id"]}-{scene["id"]}'

    replacements = [
        ("__SCENE_ID__", scene["id"]),
        ("__BG__", palette["bg"]),
        ("__FG__", palette["fg"]),
        ("__ACCENT__", palette["accent"]),
        ("__ACCENT_DIM__", palette["accent_dim"]),
        ("__RULE__", palette["rule"]),
        ("__MUTED__", palette["muted"]),
        ("__DANGER__", palette["danger"]),
        ("__KIND_CSS__", css),
        ("__COMPOSITION_ID__", composition_id),
        ("__DURATION__", str(scene["duration_s"])),
        ("__CLIP__", scene["id"]),
        ("__TOP_LABEL__", top_label),
        ("__TOP_RIGHT__", scene.get("top_right", "")),
        ("__BOTTOM_LABEL__", bottom_label),
        ("__PILL_HTML__", pill_html),
        ("__KIND_CONTENT__", content),
        ("__KIND_ANIM__", anim),
    ]
    for needle, value in replacements:
        base = base.replace(needle, value)
    return base


# ─────────────────────────────────────────────────────────────────────
# Stock-footage + voiceover orchestration
# ─────────────────────────────────────────────────────────────────────
def reencode_clip(src: Path, dst: Path, duration_s: int | float) -> bool:
    cmd = [c.format(input=str(src), output=str(dst), duration=str(duration_s)) for c in REENCODE_FFMPEG]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        print(f"  ! reencode failed for {src.name}")
        print(r.stderr.decode(errors="replace")[-1000:])
        return False
    print(f"  ok reencoded {src.name} -> {dst.name} ({dst.stat().st_size // 1024} KB)")
    return True


def xfade_concat(clips: list[Path], dst: Path, xfade_s: float = 0.3) -> bool:
    """Concatenate N clips with N-1 xfade transitions. Audio crossfades too.

    Returns True on success, False otherwise. The caller should check
    dst.exists() to confirm; this function also does that internally.
    """
    n = len(clips)
    if n == 1:
        shutil.copyfile(clips[0], dst)
        print(f"  ok single-clip copy -> {dst.name}")
        return dst.exists()
    if xfade_s <= 0:
        with open(dst.with_suffix(".list.txt"), "w") as f:
            for c in clips:
                f.write(f"file '{c.resolve()}'\n")
        r = subprocess.run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(dst.with_suffix(".list.txt")),
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-c:a", "aac", "-movflags", "+faststart",
            str(dst),
        ], capture_output=True)
        dst.with_suffix(".list.txt").unlink(missing_ok=True)
        if r.returncode != 0:
            print("  ! concat failed")
            print(r.stderr.decode(errors="replace")[-1000:])
            return False
        return dst.exists()
    return _pairwise_xfade(clips, dst, xfade_s)


def _scene_dur(clip: Path) -> float:
    """Best-effort duration probe via ffprobe; default 10s on error."""
    try:
        r = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(clip),
        ], capture_output=True, text=True, timeout=10)
        return float(r.stdout.strip())
    except Exception:
        return 10.0


def _pairwise_xfade(clips: list[Path], dst: Path, xfade_s: float) -> bool:
    """Recursive xfade for N>2. Builds up a list of intermediate files.

    Returns True on success, False on any ffmpeg failure.
    """
    work = []
    queue = list(clips)
    while len(queue) > 1:
        a = queue.pop(0)
        b = queue.pop(0)
        out = dst.with_suffix(f".xfade{len(work)}.mp4")
        offset = _scene_dur(a) - xfade_s
        cmd = [
            "ffmpeg", "-y",
            "-i", str(a), "-i", str(b),
            "-filter_complex",
            f"[0:v]format=yuv420p[v0];[1:v]format=yuv420p[v1];"
            f"[0:a]aresample=44100[a0];[1:a]aresample=44100[a1];"
            f"[v0][v1]xfade=transition=fade:duration={xfade_s}:offset={offset:.3f}[vx];"
            f"[a0][a1]acrossfade=d={xfade_s}:c1=tri:c2=tri[ax]",
            "-map", "[vx]", "-map", "[ax]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-movflags", "+faststart",
            str(out),
        ]
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode != 0:
            print("  ! xfade failed")
            print(r.stderr.decode(errors="replace")[-1500:])
            for w in work:
                if w.exists():
                    w.unlink()
            return False
        work.append(out)
        queue.append(out)
    if work:
        shutil.move(str(work[-1]), str(dst))
    for w in work:
        if w.exists():
            w.unlink()
    return dst.exists()


# ─────────────────────────────────────────────────────────────────────
# HyperFrames render
# ─────────────────────────────────────────────────────────────────────
def run_hyperframes(project: Path, mp4: Path, version: str, quality: str) -> None:
    """Render one scene's HTML to MP4 via HyperFrames.

    Resolves `npx` via shutil.which() so the absolute `.CMD` path is
    used under Windows-threaded subprocesses (where PATH inheritance
    is unreliable).
    """
    npx = shutil.which("npx") or "npx"
    cmd = [
        npx, "--yes", f"hyperframes@{version}", "render", str(project),
        "--output", str(mp4),
        "--quality", quality,
    ]
    print(f"  $ {subprocess.list2cmdline(cmd)}")
    r = subprocess.run(cmd)
    if r.returncode != 0:
        print(f"  ! hyperframes render failed for {project.name}")


def _link_or_copy(src: Path, dst: Path) -> None:
    """Symlink src to dst; fall back to copy on Windows without symlink perms."""
    if dst.exists():
        return
    try:
        os.symlink(src.resolve(), dst)
    except (OSError, NotImplementedError):
        shutil.copyfile(src, dst)


def _mirror_assets_to_scene(out: Path, scene_proj: Path, scene_id: str) -> None:
    """Stage clips/audio/fonts next to each per-scene index.html.

    HyperFrames expects <project>/index.html, so we mount each scene in
    its own subdirectory and symlink (or copy) the shared clips, audio,
    and fonts into it. Asset paths in base.html are root-relative
    (`src="clips/..."`), so they resolve correctly from each scene.
    """
    for asset_dir, suffix in [("clips", "mp4"), ("audio", "mp3")]:
        target = scene_proj / asset_dir
        target.mkdir(exist_ok=True)
        src = out / asset_dir / f"{scene_id}.{suffix}"
        if src.exists():
            _link_or_copy(src, target / f"{scene_id}.{suffix}")

    # Mirror the local fonts directory from the package's resources.
    try:
        fonts_root = resource_files("pipeline.resources").joinpath("fonts")
        fonts_target = scene_proj / "fonts"
        fonts_target.mkdir(exist_ok=True)
        for f in fonts_root.iterdir():
            if not f.is_file():
                continue
            # importlib.resources Traversable → str path for shutil/os.
            src_str = str(f)  # type: ignore[arg-type]
            _link_or_copy(Path(src_str), fonts_target / Path(src_str).name)
    except (ModuleNotFoundError, FileNotFoundError):
        # Package data not installed yet (very early in compose). Skip.
        pass


# ─────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────
def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        spec = load_and_validate(args.spec)
    except (SpecError, FileNotFoundError) as e:
        print(f"FAIL: {e}", file=sys.stderr)
        return 1

    out = Path(args.output_dir) / spec["id"]
    clips_dir = out / "clips"
    audio_dir = out / "audio"
    html_dir = out / "html"
    render_dir = out / "render"
    for d in (clips_dir, audio_dir, html_dir, render_dir):
        d.mkdir(parents=True, exist_ok=True)

    palette = {**DEFAULT_PALETTE, **(spec.get("palette") or {})}
    tts = {**DEFAULT_TTS, **(spec.get("tts") or {})}
    tts_cfg = TTSConfig.from_env()
    voice_id = tts.get("voice_id") or tts_cfg.elevenlabs_voice_id

    print(f"Spec:    {args.spec}")
    print(f"Output:  {out}")
    print(f"Scenes:  {len(spec['scenes'])}\n")

    # 1+2. Fetch + re-encode stock footage.
    for scene in spec["scenes"]:
        clip_path = clips_dir / f"{scene['id']}.mp4"
        if not clip_path.exists():
            url = fetch_clip(scene)
            if not url:
                print(f"  ! no clip for {scene['id']} — skipping (will produce no-video scene)")
                continue
            raw = clips_dir / f"{scene['id']}_raw.mp4"
            if not download_file(url, raw, label=scene["id"]):
                continue
            reencode_clip(raw, clip_path, scene["duration_s"])
            raw.unlink(missing_ok=True)
        else:
            print(f"  [skip] clip {scene['id']}.mp4 exists")

    # 3. Voiceover.
    # Edge TTS is the default (free, no key). If TTS_ALLOW_ELEVENLABS=1
    # and edge-tts fails for a scene, falls back to ElevenLabs. Dormant
    # by default because the ElevenLabs free tier blocks library voices.
    for scene in spec["scenes"]:
        audio_path = audio_dir / f"{scene['id']}.mp3"
        if audio_path.exists():
            print(f"  [skip] audio {audio_path.name}")
            continue
        generate_voiceover(
            scene["script"],
            audio_path,
            voice_id,
            tts,
            allow_elevenlabs=tts_cfg.allow_elevenlabs,
        )

    # 4. Per-scene HTML.
    for i, scene in enumerate(spec["scenes"], 1):
        scene_proj = html_dir / f"scene_{i:02d}_{scene['kind']}"
        scene_proj.mkdir(parents=True, exist_ok=True)
        html_path = scene_proj / "index.html"
        html_path.write_text(render_scene_html(scene, spec, palette), encoding="utf-8")
        _mirror_assets_to_scene(out, scene_proj, scene["id"])

    # 5. Per-scene render.
    # Run renders in parallel. Each npx hyperframes render is a single
    # Chrome-driven capture process, so concurrent renders scale near-
    # linearly up to the CI runner's headroom. Default `RenderConfig`
    # is 2 — low-memory CI runners thrash at higher concurrency.
    rendered_any = False
    render_jobs: list[tuple[Path, Path]] = []
    for i, scene in enumerate(spec["scenes"], 1):
        scene_proj = html_dir / f"scene_{i:02d}_{scene['kind']}"
        mp4_path = render_dir / f"scene_{i:02d}_{scene['kind']}.mp4"
        if mp4_path.exists():
            print(f"  [skip] render {mp4_path.name}")
            rendered_any = True
            continue
        render_jobs.append((scene_proj, mp4_path))

    if render_jobs:
        cfg = RenderConfig.from_env()
        max_parallel = max(1, min(cfg.parallel, len(render_jobs)))
        print(f"  rendering {len(render_jobs)} scenes with {max_parallel} parallel workers")
        with ThreadPoolExecutor(max_workers=max_parallel) as pool:
            futures = {
                pool.submit(run_hyperframes, proj, mp4, args.hyperframes_version, args.quality): mp4
                for proj, mp4 in render_jobs
            }
            for fut in as_completed(futures):
                mp4 = futures[fut]
                if not fut.exception():
                    print(f"  ok render {mp4.name}")
                else:
                    print(f"  ! render {mp4.name} raised: {fut.exception()}")
                if mp4.exists():
                    rendered_any = True

    if not rendered_any:
        print("FAIL: no rendered scenes (HyperFrames likely failed for every scene)", file=sys.stderr)
        print("  Check the hyperframes stderr above. Common causes:", file=sys.stderr)
        print("  - index.html missing a <video> or <audio> tag", file=sys.stderr)
        print("  - the relative path under 'src=' doesn't resolve", file=sys.stderr)
        print("  - the .mp4/.mp3 file is empty or undecodable", file=sys.stderr)
        return 1

    # 6. Final xfade concat.
    final = out / f"{spec['id']}.mp4"
    scene_mp4s = sorted(render_dir.glob("scene_*.mp4"))
    if not scene_mp4s:
        print("FAIL: no rendered scenes to concatenate", file=sys.stderr)
        return 1
    if final.exists():
        print(f"  [skip] final {final.name}")
    else:
        ok = xfade_concat(scene_mp4s, final, xfade_s=args.xfade)
        if not ok or not final.exists():
            print(f"FAIL: xfade concat did not produce {final}", file=sys.stderr)
            return 1

    print(f"\nDONE: {final}")
    return 0


if __name__ == "__main__":
    sys.exit(main())