"""
YouTube Uploader - Video 01
"The 2026 World Cup Is About to Break Everything"
--------------------------------------------------
Requirements:
  pip install google-auth google-auth-oauthlib google-api-python-client

Designed to run in two contexts:

  Local (one-time auth):
      python upload_to_youtube.py
    Opens a browser, you sign in once, and the resulting youtube_token.pickle
    + client_secrets.json are written to disk. Both are gitignored.

  CI / GitHub Actions:
      All credentials are loaded from environment variables. The script
      decodes the base64-encoded secrets into a temp dir, refreshes the
      token if needed, and uploads the video.

Required environment variables (CI):
  YT_CLIENT_SECRETS_BASE64    base64 of client_secrets.json
  YT_TOKEN_PICKLE_BASE64      base64 of youtube_token.pickle
  VIDEO_FILE                  path to the rendered mp4 (default:
                              world_cup_video_01_FINAL_v2.mp4)

Optional environment variables (CI / local):
  YT_THUMBNAIL_PATH           path to a thumbnail image
  YT_CAPTIONS_PATH            path to a captions.srt
  YT_TITLE                    override video title
  YT_DESCRIPTION              override description
  YT_TAGS                     comma-separated tag list
  YT_PRIVACY_STATUS           public | unlisted | private  (default: private)
  YT_PUBLISH_AT               ISO 8601 timestamp (scheduled publish)
  YT_CATEGORY_ID              YouTube category id (default: 17 = Sports)
"""

import base64
import json
import os
import pickle
import sys
import tempfile
from pathlib import Path

from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError


# ─────────────────────────────────────────────
# CONFIG — paths and overrides from environment
# ─────────────────────────────────────────────
VIDEO_FILE = Path(os.environ.get("VIDEO_FILE", "world_cup_video_01_FINAL_v2.mp4"))
THUMBNAIL_FILE = (
    Path(os.environ["YT_THUMBNAIL_PATH"]) if os.environ.get("YT_THUMBNAIL_PATH") else None
)
CAPTIONS_FILE = (
    Path(os.environ["YT_CAPTIONS_PATH"]) if os.environ.get("YT_CAPTIONS_PATH") else None
)
YOUTUBE_API_SERVICE_NAME = "youtube"
YOUTUBE_API_VERSION = "v3"
YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

DEFAULT_VIDEO_METADATA = {
    "title": "Why the 2026 World Cup Is Different From Every Other One",
    "description": (
        "The 2026 FIFA World Cup kicks off June 11 - the biggest, most "
        "consequential tournament ever staged. 48 teams, 104 games, three "
        "host nations.\n\n"
        "Messi and Ronaldo's last dance. Mbappe four goals from the all-time "
        "record. The USA hosting on home soil for the first time. First-time "
        "nations stepping onto the world stage.\n\n"
        "Subscribe - we're covering every subplot, every upset, every "
        "controversy through the final on July 19th.\n\n"
        "0:00 Intro\n"
        "0:08 The Scale of 2026\n"
        "0:45 Messi & Ronaldo's Last Dance\n"
        "1:45 The Mbappe Record\n"
        "2:30 USA, Canada & Mexico as Hosts\n"
        "3:15 First-Time Nations\n"
        "3:50 The Verdict\n"
        "4:20 Subscribe"
    ),
    "tags": [
        "2026 World Cup",
        "FIFA World Cup 2026",
        "World Cup preview",
        "Messi last World Cup",
        "Ronaldo 2026",
        "Mbappe record",
        "USMNT World Cup",
        "football 2026",
        "soccer analysis",
        "World Cup history",
    ],
    "categoryId": os.environ.get("YT_CATEGORY_ID", "17"),  # 17 = Sports
    "privacyStatus": os.environ.get("YT_PRIVACY_STATUS", "private"),
}


# ─────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────
def get_authenticated_service():
    """Return an authenticated YouTube Data API v3 client.

    Resolution order:
      1. CI: base64-decode YT_CLIENT_SECRETS_BASE64 and YT_TOKEN_PICKLE_BASE64
         into a temp directory, refresh the token if expired, return client.
      2. Local: read client_secrets.json + youtube_token.pickle from the cwd.
         If the token is missing/expired with a refresh_token, refresh it.
         Otherwise open a browser for the one-time consent flow.
    """
    use_env = "YT_CLIENT_SECRETS_BASE64" in os.environ and "YT_TOKEN_PICKLE_BASE64" in os.environ

    if use_env:
        tmpdir = Path(tempfile.mkdtemp(prefix="yt-auth-"))
        client_secrets_path = tmpdir / "client_secrets.json"
        token_path = tmpdir / "youtube_token.pickle"
        try:
            client_secrets_path.write_bytes(base64.b64decode(os.environ["YT_CLIENT_SECRETS_BASE64"]))
            token_path.write_bytes(base64.b64decode(os.environ["YT_TOKEN_PICKLE_BASE64"]))
            return _load_or_refresh_token(client_secrets_path, token_path)
        finally:
            # Belt-and-braces cleanup. Runner filesystems are wiped on shutdown
            # anyway, but we don't want to leave credentials on disk a moment longer.
            for p in (client_secrets_path, token_path):
                try:
                    p.unlink()
                except OSError:
                    pass
    else:
        # Local one-time auth flow
        client_secrets_path = Path("client_secrets.json")
        token_path = Path("youtube_token.pickle")
        if not client_secrets_path.exists():
            print("ERROR: client_secrets.json not found in the working directory.")
            print("  Download it from Google Cloud Console -> Credentials and place it here.")
            sys.exit(1)
        return _load_or_refresh_token(client_secrets_path, token_path, allow_browser_flow=True)


def _load_or_refresh_token(client_secrets_path, token_path, allow_browser_flow=False):
    """Common path: load token, refresh if expired, return build('youtube', 'v3', ...)."""
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
                print("  Your refresh token may have been revoked. Re-run the one-time local")
                print("  auth flow (python upload_to_youtube.py) and update the GitHub secret")
                print("  YT_TOKEN_PICKLE_BASE64 with the new pickle (base64 -w0 ...).")
                sys.exit(1)
        elif allow_browser_flow:
            from google_auth_oauthlib.flow import InstalledAppFlow
            flow = InstalledAppFlow.from_client_secrets_file(str(client_secrets_path), YOUTUBE_SCOPES)
            credentials = flow.run_local_server(port=0)
        else:
            print("ERROR: Token is invalid and has no refresh_token.")
            print("  Re-run the local one-time auth (python upload_to_youtube.py) and update")
            print("  the YT_TOKEN_PICKLE_BASE64 GitHub secret.")
            sys.exit(1)

        # Persist refreshed token to disk for next run.
        with open(token_path, "wb") as f:
            pickle.dump(credentials, f)

    return build(YOUTUBE_API_SERVICE_NAME, YOUTUBE_API_VERSION, credentials=credentials)


# ─────────────────────────────────────────────
# UPLOAD
# ─────────────────────────────────────────────
def _build_metadata():
    metadata = dict(DEFAULT_VIDEO_METADATA)
    if os.environ.get("YT_TITLE"):
        metadata["title"] = os.environ["YT_TITLE"]
    if os.environ.get("YT_DESCRIPTION"):
        metadata["description"] = os.environ["YT_DESCRIPTION"]
    if os.environ.get("YT_TAGS"):
        metadata["tags"] = [t.strip() for t in os.environ["YT_TAGS"].split(",") if t.strip()]
    if os.environ.get("YT_PRIVACY_STATUS"):
        metadata["privacyStatus"] = os.environ["YT_PRIVACY_STATUS"]
    if os.environ.get("YT_PUBLISH_AT"):
        metadata["publishAt"] = os.environ["YT_PUBLISH_AT"]
    return metadata


def upload(youtube):
    if not VIDEO_FILE.exists():
        print(f"ERROR: Video file not found: {VIDEO_FILE}")
        sys.exit(1)

    body = _build_metadata()
    if sys.stdout.isatty():
        print("Uploading:")
        for k in ("title", "privacyStatus", "categoryId"):
            print(f"  {k}: {body.get(k)}")

    media = MediaFileUpload(
        str(VIDEO_FILE),
        mimetype="video/mp4",
        resumable=True,
        chunksize=1024 * 1024 * 16,  # 16 MB chunks
    )

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

        if THUMBNAIL_FILE and THUMBNAIL_FILE.exists():
            youtube.thumbnails().set(videoId=video_id, media_body=MediaFileUpload(str(THUMBNAIL_FILE))).execute()
            print(f"  Thumbnail set: {THUMBNAIL_FILE}")

        if CAPTIONS_FILE and CAPTIONS_FILE.exists():
            youtube.captions().insert(
                part="snippet",
                body={
                    "snippet": {
                        "videoId": video_id,
                        "language": "en",
                        "name": "English",
                        "isDraft": False,
                    }
                },
                media_body=MediaFileUpload(str(CAPTIONS_FILE), mimetype="application/x-subrip"),
            ).execute()
            print(f"  Captions uploaded: {CAPTIONS_FILE}")
    else:
        print(f"ERROR: Upload failed, response: {response}")
        sys.exit(1)


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def main():
    try:
        youtube = get_authenticated_service()
        upload(youtube)
    except HttpError as e:
        print(f"YouTube API error {e.resp.status}: {e._get_reason()}")
        sys.exit(1)


if __name__ == "__main__":
    main()
