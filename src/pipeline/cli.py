"""
cli.py — argparse subcommand dispatcher for the `md2yt` console script.

Subcommands:
  compose    run the full compose pipeline (fetch → TTS → HTML → render → xfade)
  validate   validate a spec file against schema.py
  upload     upload the rendered MP4 to YouTube
  brief      convert a .md content brief into a draft spec
  --version  print the package version and exit
  --help     this help text

Each subcommand delegates to the module's existing `main()` (or
`main(argv)` for those that take argv). No behaviour change beyond
the rename + entry-point shift.
"""

from __future__ import annotations

import argparse
import sys

from pipeline import __version__


def _add_common(p: argparse.ArgumentParser) -> None:
    """No common flags today; placeholder for future shared options."""


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="md2yt",
        description="MD2YT — Markdown-to-YouTube faceless video factory.",
    )
    p.add_argument("--version", action="version", version=f"md2yt {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    # compose
    c = sub.add_parser("compose", help="render a spec into a 1920x1080 MP4")
    c.add_argument("--spec", required=True, help="path to a JSON spec file")
    c.add_argument("--output-dir", default="build", help="output base directory (default: build)")
    c.add_argument("--hyperframes-version", default="0.6.103", help="hyperframes npm version (default: 0.6.103)")
    c.add_argument("--quality", default="high", choices=["low", "medium", "high"], help="hyperframes render quality")
    c.add_argument("--xfade", type=float, default=0.3, help="crossfade seconds between scenes (default: 0.3)")

    # validate
    v = sub.add_parser("validate", help="validate a JSON spec against the schema")
    v.add_argument("--spec", required=True, help="path to a JSON spec file")

    # upload
    u = sub.add_parser("upload", help="upload a rendered MP4 to YouTube using the spec's youtube block")
    u.add_argument("--video", dest="video_file", default=None, help="path to the rendered MP4 (default: $VIDEO_FILE or spec-derived)")
    u.add_argument("--spec", default=None, help="override the spec path (default: $YT_SPEC_PATH or spec-derived)")

    # brief
    b = sub.add_parser("brief", help="convert a .md content brief into a draft spec")
    b.add_argument("--input", dest="brief_in", required=True, help="path to the .md brief")
    b.add_argument("--output", dest="brief_out", default="specs/_draft.json", help="output spec path (default: specs/_draft.json)")

    return p


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.cmd == "compose":
        from pipeline.compose import main as compose_main
        return compose_main([args.spec, args.output_dir, args.hyperframes_version, args.quality, args.xfade])

    if args.cmd == "validate":
        from pipeline.schema import load_and_validate, SpecError
        try:
            load_and_validate(args.spec)
        except (SpecError, FileNotFoundError) as e:
            print(f"FAIL: {e}", file=sys.stderr)
            return 1
        print(f"OK: {args.spec} validates")
        return 0

    if args.cmd == "upload":
        # `--video` / `--spec` flags on the CLI override the env-var
        # path that YouTubeDefaults would normally consume.
        import os
        if args.video_file:
            os.environ["VIDEO_FILE"] = args.video_file
        if args.spec:
            os.environ["YT_SPEC_PATH"] = args.spec
        from pipeline.upload import main as upload_main
        return upload_main()

    if args.cmd == "brief":
        from pipeline.brief import parse_brief_file, BriefParseError
        import json as _json
        from pathlib import Path as _Path
        try:
            spec = parse_brief_file(args.brief_in)
        except (BriefParseError, FileNotFoundError) as e:
            print(f"FAIL: {e}", file=sys.stderr)
            return 1
        out = _Path(args.brief_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(_json.dumps(spec, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"OK: wrote {out}")
        print(f"  scenes: {len(spec['scenes'])}")
        print(f"  id:     {spec['id']}")
        return 0

    parser.error(f"unknown subcommand: {args.cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(main())