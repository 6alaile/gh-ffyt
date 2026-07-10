"""
upload.py — YouTube Uploader (spec-driven).

Reads title/description/tags/privacy/category from a JSON spec's
`youtube` block instead of env vars. Env vars are retained as
one-shot overrides for manual runs.

Required env (CI):
  YT_CLIENT_SECRETS_BASE64    base64 of client_secrets.json
  YT_TOKEN_PICKLE_BASE64      base64 of youtube_token.pickle
  VIDEO_FILE                  path to the rendered mp4

Optional env:
  YT_SPEC_PATH                path to the JSON spec (default: specs/<id>.json,
                              where <id> matches VIDEO_FILE stem if not given)
  YT_THUMBNAIL_PATH           path to a thumbnail image
  YT_CAPTIONS_PATH            path to a captions.srt
  YT_TITLE / YT_DESCRIPTION / YT_TAGS / YT_PRIVACY_STATUS / YT_PUBLISH_AT
                             overrides for the matching spec field
  YT_CATEGORY_ID              override category id

Env-var reads happen in pipeline.config.YouTubeSecrets /
YouTubeDefaults; this module only knows the dataclass names, not the
env-var keys themselves.

Refresh-token expiry (rotate when YouTube returns 401 / "invalid_grant"):
  1. Locally (one time): place client_secrets.json in the repo root.
  2. Run `md2yt upload` with VIDEO_FILE pointing at any small
     mp4. The InstalledAppFlow opens a browser, you sign in, a fresh
     youtube_token.pickle lands in the repo root.
  3. Re-encode both files and update the GitHub secrets:
       base64 -w0 client_secrets.json | xclip -selection clipboard
       base64 -w0 youtube_token.pickle | xclip -selection clipboard
     (PowerShell:
        [Convert]::ToBase64String([IO.File]::ReadAllBytes('client_secrets.json')) | Set-Clipboard
        [Convert]::ToBase64String([IO.File]::ReadAllBytes('youtube_token.pickle')) | Set-Clipboard)
  4. Delete the local copies (NEVER commit them — see .gitignore).
  5. Re-run CI. The token path (_load_or_refresh_token) also tries
     credentials.refresh() before the browser flow, so a non-expired
     token is reused without a re-prompt.
"""

from __future__ import annotations

import base64
import os
import pickle
import sys
import tempfile
from pathlib import Path

from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

from pipeline.config import YouTubeDefaults, YouTubeSecrets
from pipeline.schema import load_and_validate


# ─────────────────────────────────────────────────────────────────────
# Spec resolution
# ─────────────────────────────────────────────────────────────────────
def load_spec(defaults: YouTubeDefaults) -> dict:
    """Find the spec file and return its parsed + validated contents.

    Resolution order:
      1. YT_SPEC_PATH env var (explicit override).
      2. specs/<video_stem>.json (matched by VIDEO_FILE name).
      3. specs/world_cup_2026.json (legacy default).

    Validation runs through schema.load_and_validate so a malformed
    spec fails loud before the upload starts.
    """
    candidates = []
    if defaults.spec_path:
        candidates.append(defaults.spec_path)
    video = Path(defaults.video_file)
    candidates.append(f"specs/{video.stem}.json")
    candidates.append("specs/world_cup_2026.json")

    for path in candidates:
        p = Path(path)
        if p.exists():
            print(f"  spec: {p}")
            return load_and_validate(p)
    print("ERROR: no spec file found. Tried:")
    for c in candidates:
        print(f"  - {c}")
    sys.exit(1)


def build_metadata(spec: dict, defaults: YouTubeDefaults) -> dict:
    yt = spec.get("youtube", {})
    metadata = {
        "title":       yt.get("title", "Untitled"),
        "description": yt.get("description", ""),
        "tags":        list(yt.get("tags", [])),
        "categoryId":  yt.get("category_id", "17"),
        "privacyStatus": yt.get("privacy", "private"),
    }
    if yt.get("publish_at"):
        metadata["publishAt"] = yt["publish_at"]

    # Env-var overrides (one-shot manual mode). Defaults carry the env
    # values in already — but a few fields (YT_TITLE, YT_DESCRIPTION,
    # YT_TAGS, YT_PUBLISH_AT, YT_CATEGORY_ID) are read inline here
    # because they're per-upload overrides not consumed elsewhere.
    if os.environ.get("YT_TITLE"):
        metadata["title"] = os.environ["YT_TITLE"]
    if os.environ.get("YT_DESCRIPTION"):
        metadata["description"] = os.environ["YT_DESCRIPTION"]
    if os.environ.get("YT_TAGS"):
        metadata["tags"] = [t.strip() for t in os.environ["YT_TAGS"].split(",") if t.strip()]
    if defaults.privacy_status:
        metadata["privacyStatus"] = defaults.privacy_status
    if os.environ.get("YT_CATEGORY_ID"):
        metadata["categoryId"] = os.environ["YT_CATEGORY_ID"]
    if os.environ.get("YT_PUBLISH_AT"):
        metadata["publishAt"] = os.environ["YT_PUBLISH_AT"]
    return metadata


# ─────────────────────────────────────────────────────────────────────
# Auth (unchanged from legacy)
# ─────────────────────────────────────────────────────────────────────
YOUTUBE_API_SERVICE_NAME = "youtube"
YOUTUBE_API_VERSION = "v3"
YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def get_authenticated_service(secrets: YouTubeSecrets):
    """Build an authenticated YouTube Data API v3 client.

    In CI: secrets are base64-encoded env vars (YT_CLIENT_SECRETS_BASE64
    + YT_TOKEN_PICKLE_BASE64); we decode to a tempdir and use them.
    Locally: secrets live as `client_secrets.json` and
    `youtube_token.pickle` in the repo root (gitignored).
    """
    if secrets.both_set:
        tmpdir = Path(tempfile.mkdtemp(prefix="yt-auth-"))
        client_secrets_path = tmpdir / "client_secrets.json"
        token_path = tmpdir / "youtube_token.pickle"
        try:
            client_secrets_path.write_bytes(base64.b64decode(secrets.client_secrets_base64))  # type: ignore[arg-type]
            token_path.write_bytes(base64.b64decode(secrets.token_pickle_base64))  # type: ignore[arg-type]
            return _load_or_refresh_token(client_secrets_path, token_path)
        finally:
            for p in (client_secrets_path, token_path):
                try:
                    p.unlink()
                except OSError:
                    pass
    else:
        client_secrets_path = Path("client_secrets.json")
        token_path = Path("youtube_token.pickle")
        if not client_secrets_path.exists():
            print("ERROR: client_secrets.json not found in the working directory.")
            sys.exit(1)
        return _load_or_refresh_token(client_secrets_path, token_path, allow_browser_flow=True)


def _load_or_refresh_token(client_secrets_path, token_path, allow_browser_flow=False):
    credentials = None
    if token_path.exists():
        with open(token_path, "rb") as f:
            credentials = pickle.load(f)

    if not credentials or not credentials.valid:
        if credentials and credentials.expired and credentials.refresh_token:
            try:
                credentials.refresh(Request())
            except Exception as e:
                print(f"ERROR: Failed to refresh access token: {e}")
                sys.exit(1)
        elif allow_browser_flow:
            from google_auth_oauthlib.flow import InstalledAppFlow
            flow = InstalledAppFlow.from_client_secrets_file(str(client_secrets_path), YOUTUBE_SCOPES)
            credentials = flow.run_local_server(port=0)
        else:
            print("ERROR: Token is invalid and has no refresh_token.")
            sys.exit(1)

        with open(token_path, "wb") as f:
            pickle.dump(credentials, f)

    return build(YOUTUBE_API_SERVICE_NAME, YOUTUBE_API_VERSION, credentials=credentials)


# ─────────────────────────────────────────────────────────────────────
# Upload
# ─────────────────────────────────────────────────────────────────────
def upload(youtube, video_file: Path, metadata: dict, thumbnail=None, captions=None):
    if not video_file.exists():
        print(f"ERROR: Video file not found: {video_file}")
        sys.exit(1)

    if sys.stdout.isatty():
        print("Uploading:")
        for k in ("title", "privacyStatus", "categoryId"):
            print(f"  {k}: {metadata.get(k)}")
        print(f"  tags: {len(metadata.get('tags', []))} item(s)")

    media = MediaFileUpload(
        str(video_file),
        mimetype="video/mp4",
        resumable=True,
        chunksize=1024 * 1024 * 16,
    )

    body = {k: v for k, v in metadata.items() if v is not None}
    insert_request = youtube.videos().insert(
        part=",".join(body.keys()),
        body=body,
        media_body=media,
    )

    response = None
    while response is None:
        status, response = insert_request.next_chunk()
        if status and sys.stdout.isatty():
            print(f"  Uploaded {int(status.progress() * 100)}%")

    if "id" in response:
        video_id = response["id"]
        print(f"OK: video uploaded. id={video_id}")
        print(f"  https://youtu.be/{video_id}")

        if thumbnail and Path(thumbnail).exists():
            youtube.thumbnails().set(
                videoId=video_id,
                media_body=MediaFileUpload(str(thumbnail)),
            ).execute()
            print(f"  Thumbnail set: {thumbnail}")

        if captions and Path(captions).exists():
            youtube.captions().insert(
                part="snippet",
                body={"snippet": {
                    "videoId": video_id,
                    "language": "en",
                    "name": "English",
                    "isDraft": False,
                }},
                media_body=MediaFileUpload(str(captions), mimetype="application/x-subrip"),
            ).execute()
            print(f"  Captions uploaded: {captions}")
    else:
        print(f"ERROR: Upload failed, response: {response}")
        sys.exit(1)


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────
def main() -> int:
    """Entry point. Reads secrets/defaults via config, dispatches upload."""
    secrets = YouTubeSecrets.from_env()
    defaults = YouTubeDefaults.from_env()

    video_file = Path(defaults.video_file)
    thumbnail = defaults.thumbnail_path
    captions = defaults.captions_path

    spec = load_spec(defaults)
    metadata = build_metadata(spec, defaults)

    try:
        youtube = get_authenticated_service(secrets)
        upload(youtube, video_file, metadata, thumbnail=thumbnail, captions=captions)
    except HttpError as e:
        print(f"YouTube API error {e.resp.status}: {e._get_reason()}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())