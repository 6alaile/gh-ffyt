"""
fetchers.py — stock-footage search + download.

Strategy: try Pixabay first (per scene["source"] if set, else default
"pixabay"), fall back to Pexels if Pixabay has no usable hit.

Returns the URL of the best landscape clip at <=1920px width that meets
the scene's duration. The actual download + trim is in compose.py.

API keys are read via `FootageKeys.from_env()` (see pipeline.config);
this module does not call os.environ directly.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

import requests
from requests.exceptions import HTTPError, RequestException

from pipeline.config import FootageKeys


def _keys() -> FootageKeys:
    """Read API keys from the env at call time. Cheap to repeat."""
    return FootageKeys.from_env()


def fetch_pixabay_clip(scene: dict[str, Any]) -> Optional[str]:
    """Search Pixabay videos API. Returns URL or None.

    Required: PIXABAY_API_KEY env var.
    """
    keys = _keys()
    if not keys.pixabay_api_key:
        return None
    query = scene.get("query") or scene["id"]
    min_w = scene.get("min_width", 1280)
    try:
        r = requests.get(
            "https://pixabay.com/api/videos/",
            params={
                "key": keys.pixabay_api_key,
                "q": query,
                "per_page": "10",
                "min_width": str(min_w),
            },
            timeout=15,
        )
        r.raise_for_status()
    except HTTPError as e:
        print(f"  ! pixabay HTTP {e.response.status_code} for {scene['id']}: {e}")
        return None
    except RequestException as e:
        print(f"  ! pixabay request failed for {scene['id']}: {e}")
        return None

    hits = r.json().get("hits", [])
    if not hits:
        print(f"  ! pixabay returned 0 hits for {scene['id']} (query={query!r}, min_width={min_w})")
        return None

    for hit in hits:
        for v in hit.get("videos", {}).values():
            if not isinstance(v, dict):
                continue
            w = v.get("width", 0)
            url = v.get("url")
            if not url:
                continue
            if min_w <= w <= 1920:
                return url
    print(f"  ! pixabay returned {len(hits)} hit(s) for {scene['id']} but none matched min_width={min_w}..1920")
    return None


def fetch_pexels_clip(scene: dict[str, Any]) -> Optional[str]:
    """Search Pexels videos API. Returns URL or None.

    Required: PEXELS_API_KEY env var.
    """
    keys = _keys()
    if not keys.pexels_api_key:
        return None
    query = scene.get("query") or scene["id"]
    duration_s = scene.get("duration_s", 10)
    try:
        r = requests.get(
            "https://api.pexels.com/videos/search",
            headers={"Authorization": keys.pexels_api_key},
            params={"query": query, "per_page": 10, "orientation": "landscape"},
            timeout=15,
        )
        r.raise_for_status()
    except Exception as e:
        print(f"  ! pexels search failed for {scene['id']}: {e}")
        return None

    files_pool: list[dict] = []
    for video in r.json().get("videos", []):
        if video.get("duration", 0) < duration_s:
            continue
        for f in video.get("video_files", []):
            w = f.get("width", 0)
            if 0 < w <= 1920:
                files_pool.append(f)
    if not files_pool:
        return None
    # Highest resolution under 1920 wins.
    files_pool.sort(key=lambda f: f.get("width", 0), reverse=True)
    return files_pool[0].get("link")


def fetch_clip(scene: dict[str, Any]) -> Optional[str]:
    """Try the configured source, fall back across providers."""
    primary = scene.get("source", "pixabay")
    if primary == "pexels":
        url = fetch_pexels_clip(scene) or fetch_pixabay_clip(scene)
    else:
        url = fetch_pixabay_clip(scene) or fetch_pexels_clip(scene)
    return url


def download_file(url: str, dest: Path, label: str = "") -> bool:
    """Streaming download with a tiny progress log. Returns True on success."""
    try:
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0))
            with open(dest, "wb") as f:
                downloaded = 0
                for chunk in r.iter_content(chunk_size=1024 * 256):
                    f.write(chunk)
                    downloaded += len(chunk)
        size_mb = dest.stat().st_size / 1_000_000
        print(f"  ok {label or dest.name} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"  ! download failed for {label or dest.name}: {e}")
        return False