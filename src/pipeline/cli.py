"""
cli.py — argparse subcommand dispatcher for the `md2yt` console script.

Subcommands:
  compose     run the full compose pipeline (fetch → TTS → HTML → render → xfade)
  validate    validate a spec file against schema.py
  upload      upload the rendered MP4 to YouTube
  brief       convert a .md content brief into a draft spec
  from-brief  parse .md → fill TODOs → validate → render → (optional) upload
  --version   print the package version and exit
  --help      this help text

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

    # from-brief — end-to-end .md → MP4 → (optional) YouTube.
    # parse_brief_file → fill_todos → validate → write spec_out →
    # compose.main → upload.main (if --upload).
    fb = sub.add_parser(
        "from-brief",
        help="parse a .md brief, fill TODOs, validate, render, and (optionally) upload to YouTube",
    )
    fb.add_argument("--input", dest="brief_in", required=True, help="path to the .md brief")
    fb.add_argument("--output-dir", default="build", help="output base directory (default: build)")
    fb.add_argument(
        "--spec-out",
        default=None,
        help="where to write the filled spec (default: build/<spec.id>/spec.json)",
    )
    fb.add_argument(
        "--no-render",
        action="store_true",
        help="parse + fill + validate + write spec, but do not run compose (useful for inspecting the auto-filled spec)",
    )
    fb.add_argument(
        "--upload",
        action="store_true",
        help="after compose, run `md2yt upload` against the rendered MP4 and the filled spec",
    )
    fb.add_argument("--hyperframes-version", default="0.6.103", help="hyperframes npm version (default: 0.6.103)")
    fb.add_argument("--quality", default="high", choices=["low", "medium", "high"], help="hyperframes render quality")
    fb.add_argument("--xfade", type=float, default=0.3, help="crossfade seconds between scenes (default: 0.3)")

    return p


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.cmd == "compose":
        from pipeline.compose import main as compose_main
        # Pass an argv-shaped list (strings) so compose.parse_args sees
        # the same shape it would from `python -m pipeline.cli compose …`.
        # Earlier this passed positional objects (incl. a float xfade)
        # which tripped argparse's _parse_optional subscript.
        return compose_main([
            "--spec", str(args.spec),
            "--output-dir", str(args.output_dir),
            "--hyperframes-version", str(args.hyperframes_version),
            "--quality", str(args.quality),
            "--xfade", str(args.xfade),
        ])

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

    if args.cmd == "from-brief":
        import json as _json
        import os as _os
        from pathlib import Path as _Path
        from pipeline.brief import parse_brief_file, BriefParseError
        from pipeline.brief_fill import fill_todos, BriefFillError
        from pipeline.schema import SpecError, validate

        # 1. Parse the .md.
        try:
            spec = parse_brief_file(args.brief_in)
        except (BriefParseError, FileNotFoundError) as e:
            print(f"FAIL: {e}", file=sys.stderr)
            return 1

        # 2. Auto-fill TODOs.
        try:
            report = fill_todos(spec)
        except BriefFillError as e:
            print(f"FAIL: {e}", file=sys.stderr)
            return 1

        print(f"Brief:    {args.brief_in}")
        print(f"Scenes:   {len(spec['scenes'])}")
        print(report)

        # 3. Validate. Any structural problem is fatal — the user can
        #    hand-edit the filled spec and re-run.
        try:
            validate(spec)
        except SpecError as e:
            print(f"FAIL: filled spec does not validate: {e}", file=sys.stderr)
            return 1
        print(f"Validate: OK")

        # 4. Write the filled spec to disk.
        out_dir = _Path(args.output_dir) / spec["id"]
        out_dir.mkdir(parents=True, exist_ok=True)
        spec_out = _Path(args.spec_out) if args.spec_out else (out_dir / "spec.json")
        spec_out.parent.mkdir(parents=True, exist_ok=True)
        spec_out.write_text(_json.dumps(spec, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Spec:     {spec_out}")

        if args.no_render:
            print("\n--no-render: skipping compose.")
            return 0

        # 5. Compose.
        from pipeline.compose import main as compose_main
        rc = compose_main([
            str(spec_out),
            str(args.output_dir),
            args.hyperframes_version,
            args.quality,
            str(args.xfade),
        ])
        if rc != 0:
            return rc
        final_mp4 = out_dir / f"{spec['id']}.mp4"
        print(f"\nMP4:      {final_mp4}")

        # 6. Optional upload.
        if args.upload:
            _os.environ["VIDEO_FILE"] = str(final_mp4)
            _os.environ["YT_SPEC_PATH"] = str(spec_out)
            from pipeline.upload import main as upload_main
            return upload_main()

        return 0

    parser.error(f"unknown subcommand: {args.cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(main())