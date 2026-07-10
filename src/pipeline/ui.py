"""
ui.py — console-script entry point for the `md2yt-ui` command.

Run with: `md2yt-ui` (after `pip install -e .`). Defaults to
127.0.0.1:5000, debug off. Override with --host / --port / --debug.
"""

from __future__ import annotations

import argparse
import sys

from pipeline import __version__


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="md2yt-ui",
        description="MD2YT — local web UI for uploading briefs and watching renders.",
    )
    p.add_argument("--version", action="version", version=f"md2yt-ui {__version__}")
    p.add_argument("--host", default="127.0.0.1", help="bind host (default: 127.0.0.1)")
    p.add_argument("--port", type=int, default=5000, help="bind port (default: 5000)")
    p.add_argument("--debug", action="store_true", help="Flask debug mode (auto-reload)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    from pipeline.md2yt_ui.app import create_app
    app = create_app()
    # Use Flask's own dev server. For "hosted" single-user local, this
    # is fine. If you put this behind a real reverse proxy, swap in a
    # WSGI server here — the app factory doesn't change.
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
