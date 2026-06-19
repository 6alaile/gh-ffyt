"""
app.py — Flask app factory + routes for the md2yt-ui web UI.

Routes:
  GET  /                       Render the index page with the brief list.
  POST /upload                 Save a .md upload to briefs/, kick the runner.
  GET  /runs/<id>              JSON: status + log tail + artifact paths.
  GET  /runs/<id>/mp4          Stream the rendered MP4 (404 if not ok).
  GET  /runs/<id>/spec.json    Stream the filled spec.

No business logic here — the runner owns state and subprocess.
"""

from __future__ import annotations

import re
import secrets
from pathlib import Path

from flask import (
    Flask,
    Response,
    abort,
    jsonify,
    render_template,
    request,
    send_file,
)

from pipeline.md2yt_ui.runner import get_runner


_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_filename(name: str) -> str:
    """Strip path separators and unsafe chars. Keep stem + .md suffix."""
    name = name.replace("\\", "/").split("/")[-1]  # drop any path component
    name = _SAFE_NAME_RE.sub("_", name)
    if not name.lower().endswith(".md"):
        name = name + ".md"
    return name or "brief.md"


def create_app() -> Flask:
    """Build the Flask app. Template + static folders live alongside this file."""
    app = Flask(
        __name__,
        template_folder=str(Path(__file__).parent / "templates"),
        static_folder=str(Path(__file__).parent / "static"),
    )
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024  # 2 MB cap on uploads

    @app.get("/")
    def index():
        runner = get_runner()
        return render_template(
            "index.html",
            runs=[r.to_json(log_tail=0) for r in runner.all_runs()],
            is_busy=runner.is_busy,
        )

    @app.post("/upload")
    def upload():
        if "brief" not in request.files:
            return jsonify(error="no file part"), 400
        f = request.files["brief"]
        if not f.filename:
            return jsonify(error="empty filename"), 400

        safe = _sanitize_filename(f.filename)
        # Add a short random suffix to avoid collisions across re-uploads
        # of the same filename (each upload is a separate run).
        suffix = secrets.token_hex(3)
        stem = safe[:-3]  # drop ".md"
        final_name = f"{stem}-{suffix}.md"

        runner = get_runner()
        runner.briefs_dir.mkdir(parents=True, exist_ok=True)
        dest = runner.briefs_dir / final_name
        f.save(dest)

        try:
            brief_id = runner.enqueue(dest)
        except RuntimeError as e:
            # Already-running render: reject the upload. Tell the client
            # which run is blocking them so the UI can show it.
            return jsonify(error=str(e)), 409

        return jsonify(brief_id=brief_id), 202

    @app.get("/runs/<brief_id>")
    def run_status(brief_id: str):
        runner = get_runner()
        state = runner.get(brief_id)
        if state is None:
            abort(404)
        # `tail=N` lets the client ask for more lines when the user
        # expands the log panel.
        try:
            tail = int(request.args.get("tail", "200"))
        except ValueError:
            tail = 200
        return jsonify(state.to_json(log_tail=tail))

    @app.get("/runs/<brief_id>/mp4")
    def run_mp4(brief_id: str):
        runner = get_runner()
        state = runner.get(brief_id)
        if state is None or state.mp4_path is None or not state.mp4_path.exists():
            abort(404)
        return send_file(state.mp4_path, mimetype="video/mp4", as_attachment=False)

    @app.get("/runs/<brief_id>/spec.json")
    def run_spec(brief_id: str):
        runner = get_runner()
        state = runner.get(brief_id)
        if state is None or state.spec_path is None or not state.spec_path.exists():
            abort(404)
        return send_file(state.spec_path, mimetype="application/json", as_attachment=True)

    return app
