"""
brief_fill.py — auto-fill TODO fields in a draft spec produced by brief.py.

The brief parser (brief.py) is rule-based: when it can't recognise a field
unambiguously, it leaves it as "TODO" (or "TODO_unknown(...)" for kinds).
That draft is intentionally incomplete so the human author can hand-fill it.

This module is the next step in the .md → video pipeline: a best-effort
heuristic filler that lets the user ship a video without hand-editing JSON
when most of the brief is just prose.

Public API:
    fill_todos(spec, *, heading_for=None) -> FillReport
        Mutates spec in place; returns a report the CLI prints so the
        user can audit what was inferred.

Inference rules — every rule is the SINGLE source of truth (no other
module re-implements them). See README "From markdown to video in one
command" for the table.

Hard refusal:
    After filling, if there are zero scenes, or no scene has both a
    concrete kind and a script, raises BriefFillError. The CLI catches
    that and exits 1 with a clear message.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from pipeline.schema import KIND_SCHEMAS, SCENE_KINDS


# ─────────────────────────────────────────────────────────────────────
# Errors
# ─────────────────────────────────────────────────────────────────────
class BriefFillError(ValueError):
    """Raised when the spec can't be safely auto-filled (no scenes, no
    resolvable kind, etc.)."""


# ─────────────────────────────────────────────────────────────────────
# Report
# ─────────────────────────────────────────────────────────────────────
@dataclass
class FillReport:
    """Audit log of what fill_todos did. The CLI prints this so the
    user can review every inferred value before render."""

    filled: list[str] = field(default_factory=list)
    inferred_kind: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    youtube_filled: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        lines = ["Fill report:"]
        if self.filled:
            lines.append(f"  filled {len(self.filled)} field(s):")
            for entry in self.filled:
                lines.append(f"    - {entry}")
        if self.inferred_kind:
            lines.append(f"  inferred kind for {len(self.inferred_kind)} scene(s):")
            for entry in self.inferred_kind:
                lines.append(f"    - {entry}")
        if self.youtube_filled:
            lines.append(f"  youtube: filled {len(self.youtube_filled)} field(s):")
            for entry in self.youtube_filled:
                lines.append(f"    - {entry}")
        if self.skipped:
            lines.append(f"  left as TODO: {len(self.skipped)}")
            for entry in self.skipped:
                lines.append(f"    - {entry}")
        return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────
# Heading → kind inference
# ─────────────────────────────────────────────────────────────────────
_KIND_KEYWORDS: list[tuple[str, str]] = [
    (r"\bhook\b",                    "hook"),
    (r"\bscale\b|\bnumbers?\b|\bbig number",        "scale"),
    (r"\brecord\b|\bcountdown\b|\bcount\b|\bmbapp", "record"),
    (r"\bverdict\b|\bthe line\b|\bquote\b|\bsays\b", "quote"),
    (r"\blist\b|\bpoints?\b|\b\d+\s*points?\b",      "list"),
    (r"\blineup\b|\bhosts?\b|\bgrid\b|\bteams?\b",   "grid"),
    (r"\btwo\b|\bpair\b|\bduo\b|\blast dance\b|\bfaces?\b", "portrait"),
    (r"\bsplit\b|\bsidebar\b",                       "split"),
]


def _infer_kind(heading: str) -> str:
    """Return a sensible kind for a scene based on its heading text.

    Falls back to 'list' (a simple, required-fields-lite kind) if nothing
    matches — list needs only headline + eyebrow + items, all of which
    the rest of fill_todos will provide.
    """
    text = heading.lower()
    for pattern, kind in _KIND_KEYWORDS:
        if re.search(pattern, text):
            return kind
    return "list"


# ─────────────────────────────────────────────────────────────────────
# Default values per kind
# ─────────────────────────────────────────────────────────────────────
_DEFAULT_STATS = [
    {"num": "1", "label": "FIRST"},
    {"num": "2", "label": "SECOND"},
    {"num": "3", "label": "THIRD"},
    {"num": "4", "label": "FOURTH"},
]

_DEFAULT_ITEMS = [
    "First point",
    "Second point",
    "Third point",
    "Fourth point",
]

_DEFAULT_NAMES = [
    {"name": "ALICE", "year": "BORN 1990"},
    {"name": "BOB",   "year": "BORN 1992"},
]

_DEFAULT_CARDS = [
    {"flag": "🇦🇱", "name": "ALPHA",
     "stats": ["Stat line 1", "Stat line 2"], "quote": "First time competing."},
    {"flag": "🇧🇷", "name": "BRAVO",
     "stats": ["Stat line 1", "Stat line 2"], "quote": "Returning after a decade."},
    {"flag": "🇨🇦", "name": "CHARLIE",
     "stats": ["Stat line 1", "Stat line 2"], "quote": "The host with the most."},
]


# ─────────────────────────────────────────────────────────────────────
# Heading helpers
# ─────────────────────────────────────────────────────────────────────
_HEADING_SLUG_RE = re.compile(r"[^a-zA-Z0-9]+")


def _heading_to_slug(heading: str) -> str:
    s = _HEADING_SLUG_RE.sub("_", heading.lower()).strip("_")
    return s or "scene"


def _heading_to_title(heading: str) -> str:
    """Heading → uppercase title for headline. Strips parenthesised
    timing hints like '(First 0–8 seconds)'."""
    cleaned = re.sub(r"\([^)]*\)", "", heading).strip()
    cleaned = re.sub(r"^scene\s+\d+\s*[—\-:]\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned.upper()


def _first_n_words(text: str, n: int) -> str:
    parts = text.split()
    return " ".join(parts[:n])


def _script_quote(text: str, max_len: int = 180) -> str:
    """Trim a script for label use."""
    s = " ".join(text.split())
    return s if len(s) <= max_len else s[: max_len - 1].rstrip() + "…"


# ─────────────────────────────────────────────────────────────────────
# Top-level entry point
# ─────────────────────────────────────────────────────────────────────
def fill_todos(
    spec: dict[str, Any],
    *,
    heading_for: dict[int, str] | None = None,
) -> FillReport:
    """Walk spec, replace TODO fields with best-effort defaults.

    Args:
        spec: the spec dict produced by brief.parse_brief.
        heading_for: optional {scene_index: heading_text} so kind
            inference can use the original section heading rather than
            the slugified scene id. If absent, falls back to scene id.

    Returns:
        FillReport describing every change.
    """
    report = FillReport()

    scenes = spec.get("scenes") or []
    if not scenes:
        raise BriefFillError("spec has no scenes; nothing to fill")

    heading_for = heading_for or {}

    for idx, scene in enumerate(scenes):
        heading = heading_for.get(idx) or scene.get("id") or f"scene {idx + 1}"
        _fill_scene(scene, heading, idx, report)

    _fill_youtube(spec, report)

    # Hard refusal: must end up with at least one scene that has both a
    # concrete kind and a non-empty script.
    concrete = [s for s in spec["scenes"]
                if s.get("kind") in SCENE_KINDS and s.get("script")]
    if not concrete:
        raise BriefFillError(
            "after auto-fill, no scene has both a concrete kind and a script; "
            "edit the spec by hand before rendering"
        )

    return report


# ─────────────────────────────────────────────────────────────────────
# Per-scene fill
# ─────────────────────────────────────────────────────────────────────
def _fill_scene(scene: dict[str, Any], heading: str, idx: int, report: FillReport) -> None:
    sid = scene.get("id") or f"{idx + 1:02d}_scene"
    title = _heading_to_title(heading)
    slug = _heading_to_slug(heading)

    # ── kind ─────────────────────────────────────────────────────────
    raw_kind = scene.get("kind")
    if not raw_kind or raw_kind.startswith("TODO"):
        inferred = _infer_kind(heading)
        scene["kind"] = inferred
        report.inferred_kind.append(f"scene[{idx}] ({sid}): kind={inferred}")

    kind = scene.get("kind")
    if kind not in SCENE_KINDS:
        # Re-derive if the previous step somehow left us with a non-SCENE_KINDS value.
        kind = _infer_kind(heading)
        scene["kind"] = kind
        report.inferred_kind.append(f"scene[{idx}] ({sid}): kind={kind} (re-derived)")

    # ── duration_s ───────────────────────────────────────────────────
    if "duration_s" not in scene or scene["duration_s"] in (None, "TODO"):
        scene["duration_s"] = 10
        report.filled.append(f"scene[{idx}] ({sid}).duration_s = 10 (default)")

    # ── script (voiceover text) ──────────────────────────────────────
    if not scene.get("script") or scene["script"].startswith("TODO"):
        inferred_script = _script_quote(title or heading)
        if not inferred_script or inferred_script == "TODO":
            inferred_script = f"{title}. [Voiceover pending — edit spec.json]"
        scene["script"] = inferred_script
        report.filled.append(f"scene[{idx}] ({sid}).script (INFERRED from heading)")

    # ── common optional fields ───────────────────────────────────────
    if not scene.get("query"):
        scene["query"] = _first_n_words(title or heading, 3).lower() or slug.replace("_", " ")
        report.filled.append(f"scene[{idx}] ({sid}).query (default)")

    if not scene.get("top_label"):
        scene["top_label"] = f"LIVE — {title[:24]}"
        report.filled.append(f"scene[{idx}] ({sid}).top_label (default)")

    if not scene.get("bottom_label"):
        scene["bottom_label"] = _script_quote(scene["script"], 32)
        report.filled.append(f"scene[{idx}] ({sid}).bottom_label (default)")

    if not scene.get("pill"):
        scene["pill"] = f"{idx + 1:02d}"
        report.filled.append(f"scene[{idx}] ({sid}).pill (default)")

    # ── per-kind required fields ─────────────────────────────────────
    schema = KIND_SCHEMAS.get(kind)
    if schema is None:
        # Already handled above; defensive.
        return

    required = schema.get("required", set())
    if "eyebrow" in required:
        if not scene.get("eyebrow") or scene["eyebrow"].startswith("TODO"):
            scene["eyebrow"] = f"// {slug.upper()}"
            report.filled.append(f"scene[{idx}] ({sid}).eyebrow (default)")
    if "headline" in required:
        if not scene.get("headline") or scene["headline"].startswith("TODO"):
            # Wrap the last word in <accent>…</accent> so the gold-word
            # convention from the renderers works.
            words = title.split()
            if len(words) >= 2:
                head = " ".join(words[:-1])
                scene["headline"] = f"{head} <accent>{words[-1]}</accent>"
            else:
                scene["headline"] = f"<accent>{title}</accent>"
            report.filled.append(f"scene[{idx}] ({sid}).headline (default)")
    if "subhead" in required:
        if not scene.get("subhead") or scene["subhead"].startswith("TODO"):
            scene["subhead"] = f"// {slug.upper()}"
            report.filled.append(f"scene[{idx}] ({sid}).subhead (default)")
    if "sub" in required or "sub" in schema.get("optional", set()):
        if not scene.get("sub") or scene["sub"].startswith("TODO"):
            scene["sub"] = ""
    if "stats" in required:
        if not scene.get("stats"):
            scene["stats"] = list(_DEFAULT_STATS)
            report.filled.append(f"scene[{idx}] ({sid}).stats (default template)")
    if "items" in required:
        if not scene.get("items"):
            scene["items"] = list(_DEFAULT_ITEMS)
            report.filled.append(f"scene[{idx}] ({sid}).items (default template)")
    if "names" in required:
        if not scene.get("names"):
            scene["names"] = list(_DEFAULT_NAMES)
            report.filled.append(f"scene[{idx}] ({sid}).names (default template)")
    if "cards" in required:
        if not scene.get("cards"):
            scene["cards"] = [dict(c) for c in _DEFAULT_CARDS]
            report.filled.append(f"scene[{idx}] ({sid}).cards (default template)")
    if "counter_label" in required:
        if not scene.get("counter_label"):
            scene["counter_label"] = "DAYS UNTIL"
            report.filled.append(f"scene[{idx}] ({sid}).counter_label (default)")
    if "counter_num" in required:
        if not scene.get("counter_num"):
            scene["counter_num"] = "0"
            report.filled.append(f"scene[{idx}] ({sid}).counter_num (default)")
    if "counter_suffix" in required:
        if not scene.get("counter_suffix"):
            scene["counter_suffix"] = "THE RECORD"
            report.filled.append(f"scene[{idx}] ({sid}).counter_suffix (default)")
    if "name" in required:
        if not scene.get("name"):
            scene["name"] = title or "THE COUNTER."
            report.filled.append(f"scene[{idx}] ({sid}).name (default)")
    if "quote" in required:
        if not scene.get("quote") or scene["quote"].startswith("TODO"):
            scene["quote"] = title or "TODO QUOTE"
            report.filled.append(f"scene[{idx}] ({sid}).quote (default)")
    if "attribution" in required:
        if not scene.get("attribution") or scene["attribution"].startswith("TODO"):
            scene["attribution"] = "— NARRATOR"
            report.filled.append(f"scene[{idx}] ({sid}).attribution (default)")
    if "body" in required:
        if not scene.get("body") or scene["body"].startswith("TODO"):
            scene["body"] = (
                "TODO body copy. Two or three short sentences works best."
            )
            report.filled.append(f"scene[{idx}] ({sid}).body (default)")
    if "image_query" in required:
        if not scene.get("image_query"):
            scene["image_query"] = scene.get("query") or _first_n_words(title, 3).lower()
            report.filled.append(f"scene[{idx}] ({sid}).image_query (default)")


# ─────────────────────────────────────────────────────────────────────
# YouTube-block fill
# ─────────────────────────────────────────────────────────────────────
_SPORT_KEYWORDS = {"sport", "sports", "football", "soccer", "fifa", "nba", "nfl", "mlb", "olympic", "olympics"}


def _fill_youtube(spec: dict[str, Any], report: FillReport) -> None:
    yt = spec.get("youtube")
    if yt is None:
        yt = {}
        spec["youtube"] = yt
        report.youtube_filled.append("created youtube block")

    if not yt.get("title") or yt["title"].startswith("TODO"):
        # Try H1 from the source file path (passed in via spec["_source_heading"])
        # or fall back to spec id.
        h1 = spec.get("_source_heading") or spec.get("id", "untitled")
        yt["title"] = h1.title() if isinstance(h1, str) else "Untitled"
        report.youtube_filled.append("title (default from id)")

    if not yt.get("description") or yt["description"].startswith("TODO"):
        body = spec.get("_source_description") or ""
        yt["description"] = body.strip() or "TODO description"
        report.youtube_filled.append("description (default from brief body)")

    if not yt.get("tags"):
        # Pull any hashtags from the description or the original brief body.
        source = " ".join([
            yt.get("description", ""),
            spec.get("_source_description", ""),
            spec.get("_source_heading", ""),
        ])
        tags: list[str] = []
        for tag in re.findall(r"#(\w+)", source):
            if tag.lower() not in {t.lower() for t in tags}:
                tags.append(tag.lower())
        if not tags:
            tags = [_heading_to_slug(spec.get("id", "video")), "faceless", "video factory"]
        yt["tags"] = tags
        report.youtube_filled.append(f"tags (default, {len(tags)} items)")

    if not yt.get("category_id"):
        haystack = " ".join([
            yt.get("title", ""),
            yt.get("description", ""),
            spec.get("_source_heading", ""),
            " ".join(yt.get("tags", [])),
        ]).lower()
        yt["category_id"] = "17" if any(k in haystack for k in _SPORT_KEYWORDS) else "22"
        report.youtube_filled.append(f"category_id = {yt['category_id']}")

    yt.setdefault("privacy", "private")