"""
brief.py — turn a .md content brief into a draft JSON spec.

Rule-based parser with a documented schema. Only fills fields it can
recognise unambiguously; everything else is left as `TODO` for the
author to complete.

Documented input schema (anything not in this list is ignored):

  # <Title>                              ──► spec.youtube.title (fallback) +
                                            spec._source_heading + spec._source_description
  ## Hook                                ──► scene 1 of kind "hook"
  ## Hook (First 0–8 seconds)            ──► scene 1 of kind "hook" (prose form)
  ## Scene <N> — <Title>                 ──► scene N (per-scene bullets)
  ## Script Outline                      ──► one scene per markdown-table row
  ## YouTube Metadata
    **Title options:**
    1. <title 1>
    2. <title 2>                          ──► spec.youtube.title (first option)
    **Description:** <text>              ──► spec.youtube.description
    **Tags:** <a, b, c>                   ──► spec.youtube.tags
    **Category:** <Sports>                ──► spec.youtube.category_id
  ## Thumbnail Concept
    <ignored — thumbnail_path is set later>
  ## Audio Direction
    <ignored — voice/tone metadata only>
  ## Format & Length
    **Target length:** <text>             ──► spec.total_length_hint (informational)
  ## Production Notes
    <ignored>

Per-scene block, inside ## Scene / ## Hook:

  **Kind:** <hook|scale|portrait|record|grid|quote|list|split>
  **Duration:** <NN>s                    ──► scene.duration_s
  **Query:** <text>                      ──► scene.query
  **Top label:** <text>                  ──► scene.top_label
  **Bottom label:** <text>               ──► scene.bottom_label
  **Eyebrow:** <text>                    ──► scene.eyebrow
  **Headline:** <text>                   ──► scene.headline
  **Subhead / Sub:** <text>              ──► scene.subhead / sub
  **Pill:** <text>                       ──► scene.pill
  **Stats:**
    - <num> <label>                      ──► scene.stats[]
  **Names:**
    - <name> | <year>                    ──► scene.names[]
  **Cards:** (for kind=grid)
    - 🇺🇸 | USA | "..." | "<quote>"       ──► scene.cards[] (one per card)
  **Items:** (for kind=list)
    - <item>                             ──► scene.items[]
  **Image query:** <text>                ──► scene.image_query (for kind=split)
  **Voiceover / Script:** <text>         ──► scene.script
  (or a block quote under Voiceover:)

SCENE_KINDS is imported from pipeline.schema — single source of truth.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from pipeline.schema import SCENE_KINDS


# Fields that are always top-level on a scene.
# Per-kind extra fields are checked at write-time.
COMMON_SCENE_FIELDS = {
    "kind", "duration", "query", "top label", "bottom label",
    "eyebrow", "headline", "subhead", "sub", "pill",
    "voiceover", "script",
}


# ─────────────────────────────────────────────────────────────────────
# Errors
# ─────────────────────────────────────────────────────────────────────
class BriefParseError(ValueError):
    pass


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────
def parse_brief(text: str) -> dict[str, Any]:
    """Parse a .md brief string and return a spec dict (possibly incomplete)."""
    text = _normalize_brief(text)
    sections = _split_sections(text)
    spec: dict[str, Any] = {"scenes": []}
    top_title = _h1_title(text)

    # Stash the H1 + early-body prose so brief_fill.py can use it for the
    # YouTube description fallback when the brief has no ## YouTube
    # Metadata block (e.g. Content_Brief.md after a partial conversion).
    if top_title:
        spec["_source_heading"] = top_title
    spec["_source_description"] = _first_paragraphs(text, max_paragraphs=3)

    if "YouTube Metadata" in sections:
        _fill_youtube(spec, sections["YouTube Metadata"], top_title)

    # First scene may be under ## Hook (with or without a parenthetical
    # timing hint like "(First 0–8 seconds)"). The same parser handles
    # both the bullet form (`**Kind:**` etc.) and the prose form
    # (`**Hook line:** "..."`).
    if "Hook" in sections or _first_matching_section(sections, r"^hook\b") is not None:
        hook_name, hook_body = _first_hook_section(sections)
        # Always run the bullet-schema parser first so duration / kind /
        # headline are captured. Then layer the prose parser on top — if
        # it finds a **Hook line:** or blockquote script, that wins.
        scene = _parse_bullet_scene_block(hook_name, 1, hook_body)
        prose_scene = _parse_hook_section_body(hook_name, 1, hook_body)
        if prose_scene.get("script"):
            scene["script"] = prose_scene["script"]
        if scene.get("kind") is None:
            scene["kind"] = "hook"
        spec["scenes"].append(scene)
        spec.setdefault("_source_hook_heading", hook_name)

    # Optional ## Script Outline: a markdown table whose rows become scenes.
    if "Script Outline" in sections:
        scenes = parse_outline_table(sections["Script Outline"])
        for i, s in enumerate(scenes, start=len(spec["scenes"]) + 1):
            s.setdefault("id", f"{i:02d}_outline_{i:02d}")
            spec["scenes"].append(s)

    # Remaining scenes under ## Scene N — Title (or ## Scene N: Title, or
    # the em/en-dash variant).
    scene_n = len(spec["scenes"]) + 1
    for name, body in sections.items():
        if not re.match(r"^Scene\b", name):
            continue
        scene = _parse_scene_block(name, scene_n, body)
        if scene.get("kind") is None:
            # Default the kind by shape, but the user should set it explicitly.
            scene["kind"] = "TODO"
        spec["scenes"].append(scene)
        scene_n += 1

    if not spec["scenes"]:
        raise BriefParseError("no scenes found in brief (no ## Hook or ## Scene section)")

    spec.setdefault("id", _slugify(spec.get("youtube", {}).get("title", "draft")))
    return spec


def parse_brief_file(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(p)
    return parse_brief(p.read_text(encoding="utf-8"))


# ─────────────────────────────────────────────────────────────────────
# Brief normalizer
#
# Briefs may contain a "Full Scene Schema (Repo Format)" section written
# without ## headings or **Bold:** field markers — a common format when
# the brief is drafted outside the repo template. This function rewrites
# that section into the canonical form the parser expects, leaving
# everything else (prose outline, results, YouTube metadata) untouched.
# ─────────────────────────────────────────────────────────────────────

# Known multi-word field names that appear bare (e.g. "Top label: LIVE")
_FIELD_RE = re.compile(
    r"^("
    r"Kind|Duration|Query|Top label|Bottom label|Pill|Eyebrow|"
    r"Headline|Subhead|Sub|Name|Voiceover|Script|"
    r"Counter label|Counter num|Counter suffix|Image query|"
    r"Stats|Names|Items|Cards"
    r"):\s*(.*)$",
    re.IGNORECASE,
)

# Scene heading: "Hook" alone, or "Scene N — Title" / "Scene N: Title"
_SCENE_HEADING_RE = re.compile(
    r"^(Hook(?:\s*\([^)]*\))?|Scene\s+\d+\s*[—\-–:]\s*.+)$"
)


def _normalize_brief(text: str) -> str:
    """Rewrite the 'Full Scene Schema' section of a brief into parser-
    canonical form (## headings, **Field:** markers). No-ops if the
    section is already well-formed or absent."""
    # Normalize Windows line endings first.
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    marker = "Full Scene Schema"
    start = text.find(marker)
    if start == -1:
        return text  # no schema section — nothing to normalize

    # Find the line start of the marker.
    line_start = text.rfind("\n", 0, start) + 1

    # Schema section ends at next ─── divider or YouTube Metadata heading.
    rest = text[line_start:]
    end_m = re.search(r"\n(?:───+|#{1,2}\s*YouTube)", rest)
    schema_end = line_start + (end_m.start() if end_m else len(rest))

    before = text[:line_start]
    schema = text[line_start:schema_end]
    after = text[schema_end:]

    normalized_lines: list[str] = []
    for line in schema.splitlines():
        stripped = line.strip()

        # Skip the section header line itself.
        if stripped.startswith("Full Scene Schema"):
            normalized_lines.append(line)
            continue

        # Divider lines — leave as-is.
        if re.match(r"^─{3,}$", stripped):
            normalized_lines.append(line)
            continue

        # Blank lines — pass through.
        if not stripped:
            normalized_lines.append("")
            continue

        # Bullet lines (•, -, *) — pass through unchanged.
        if re.match(r"^[•\-\*]\s", stripped):
            normalized_lines.append(line)
            continue

        # Quoted VO lines — pass through unchanged.
        if stripped.startswith('"') or stripped.startswith(">"):
            normalized_lines.append(line)
            continue

        # Scene heading (bare) → ## heading.
        if _SCENE_HEADING_RE.match(stripped):
            normalized_lines.append(f"## {stripped}")
            continue

        # Field line (bare) → **Field:** value.
        fm = _FIELD_RE.match(stripped)
        if fm:
            field, value = fm.group(1), fm.group(2)
            normalized_lines.append(f"**{field}:** {value}".rstrip())
            continue

        # Anything else — pass through.
        normalized_lines.append(line)

    # Also promote a bare "YouTube Metadata" heading to ## if not already,
    # and bold-ify bare field lines within that section.
    yt_marker = "## YouTube Metadata"
    yt_start = after.find("YouTube Metadata")
    if yt_start >= 0:
        # Re-find after potential promotion.
        after = re.sub(r"(?m)^(YouTube Metadata)\s*$", r"## \1", after)
        # Now bold-ify bare fields within the YouTube block.
        yt_field_re = re.compile(
            r"(?m)^(Title options|Description|Tags|Category|Best publish time):(.*)",
            re.IGNORECASE,
        )
        after = yt_field_re.sub(lambda m: f"**{m.group(1)}:**{m.group(2)}", after)
    else:
        after = re.sub(r"(?m)^(YouTube Metadata)\s*$", r"## \1", after)

    return before + "\n".join(normalized_lines) + after


# ─────────────────────────────────────────────────────────────────────
# Section parser
# ─────────────────────────────────────────────────────────────────────
def _split_sections(text: str) -> dict[str, str]:
    """Split on `## ` headings. Returns {section_name: body}."""
    sections: dict[str, str] = {}
    current = None
    for line in text.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            current = m.group(1).strip()
            sections[current] = ""
        elif current is not None:
            sections[current] += line + "\n"
    return sections


def _h1_title(text: str) -> str | None:
    m = re.match(r"^#\s+(.+?)\s*$", text.splitlines()[0] if text else "")
    return m.group(1).strip() if m else None


def _fill_youtube(spec: dict, body: str, top_title: str | None) -> None:
    yt: dict[str, Any] = {}
    # First numbered title wins.
    m = re.search(r"^\s*\d+\.\s+(.+?)\s*$", body, re.MULTILINE)
    if m:
        yt["title"] = m.group(1).strip()
    elif top_title:
        yt["title"] = top_title
    else:
        yt["title"] = "TODO"

    desc_m = re.search(r"\*\*Description:\*\*\s*(.+?)(?=\n\n|\Z)", body, re.DOTALL)
    if desc_m:
        yt["description"] = desc_m.group(1).strip()
    else:
        yt["description"] = "TODO"

    tags_m = re.search(r"\*\*Tags:\*\*\s*(.+?)(?=\n\n|\Z)", body, re.DOTALL)
    if tags_m:
        raw = tags_m.group(1).strip()
        if raw.startswith("[") and raw.endswith("]"):
            yt["tags"] = [t.strip().strip("'\"") for t in raw[1:-1].split(",") if t.strip()]
        else:
            yt["tags"] = [t.strip() for t in re.split(r",\s*", raw) if t.strip()]
    else:
        yt["tags"] = []

    cat_m = re.search(r"\*\*Category:\*\*\s*(\w+)", body)
    if cat_m:
        cat = cat_m.group(1).strip()
        yt["category_id"] = "17" if cat.lower() == "sports" else "22"

    yt.setdefault("privacy", "private")
    spec["youtube"] = yt


# ─────────────────────────────────────────────────────────────────────
# Prose-style hook section parser
#
# A "## Hook" section in Content_Brief.md-style briefs uses prose,
# not the **Kind:** / **Duration:** bullets the structured parser
# expects. Extract the hook line and use it as the script.
# ─────────────────────────────────────────────────────────────────────
def _parse_hook_section_body(name: str, idx: int, body: str) -> dict[str, Any]:
    """Parse a prose-style hook section (e.g. ## Hook (First 0–8 seconds)).

    Recognises **Hook line:** "<text>" or **Opening line:** "<text>".
    Falls back to the first quoted block in the body.
    """
    scene_id = _scene_id(name, idx)
    scene: dict[str, Any] = {"id": scene_id, "kind": "hook"}

    # **Hook line:** "<text>" — may span multiple lines.
    m = re.search(r"\*\*(?:Hook line|Opening line|Opening visual):\*\*\s*(.+?)(?=\n\n|\n\*\*|\Z)", body, re.DOTALL)
    if m:
        raw = m.group(1).strip()
        # Strip surrounding quotes if present.
        if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
            raw = raw[1:-1]
        scene["script"] = raw
        return scene

    # Fallback: first blockquote in the body.
    qb = re.search(r"^>\s*\"?(.+?)\"?\s*$", body, re.MULTILINE)
    if qb:
        scene["script"] = qb.group(1).strip()
        return scene

    return scene


# ─────────────────────────────────────────────────────────────────────
# Per-scene parser (bullet-list form)
# ─────────────────────────────────────────────────────────────────────
# Per-scene parser (bullet-list form)
# ─────────────────────────────────────────────────────────────────────
def _parse_scene_block(name: str, idx: int, body: str) -> dict[str, Any]:
    """Extract a scene dict from a ## section body.

    Hook-named sections route through _parse_hook_section_body, which
    handles prose-style briefs. Other sections keep their bullet-list
    schema.
    """
    if re.match(r"^hook\b", name, flags=re.IGNORECASE):
        return _parse_hook_section_body(name, idx, body)
    return _parse_bullet_scene_block(name, idx, body)


def _first_hook_section(sections: dict[str, str]) -> tuple[str, str]:
    """Return (name, body) of the first hook-like section.

    Accepts `Hook`, `Hook (First 0–8 seconds)`, `Hook — The Premise`, etc.
    Falls back to ("Hook", "") when nothing matches.
    """
    for name in sections:
        if re.match(r"^hook\b", name, flags=re.IGNORECASE):
            return name, sections[name]
    return "Hook", sections.get("Hook", "")


def _first_matching_section(sections: dict[str, str], pattern: str):
    """Return the section name matching `pattern`, or None. Pattern is
    matched against section names with re.match."""
    for name in sections:
        if re.match(pattern, name, flags=re.IGNORECASE):
            return name
    return None


def _first_paragraphs(text: str, max_paragraphs: int = 3) -> str:
    """Return the first N non-empty paragraphs after the H1, joined."""
    lines = text.splitlines()
    # Skip H1 line(s).
    body_lines: list[str] = []
    for line in lines:
        if line.startswith("# "):
            continue
        body_lines.append(line)
    # Split into paragraphs on blank lines.
    paragraphs: list[str] = []
    buf: list[str] = []
    for line in body_lines:
        if line.strip() == "":
            if buf:
                joined = " ".join(buf).strip()
                if joined and not joined.startswith("#"):
                    paragraphs.append(joined)
                buf = []
            if len(paragraphs) >= max_paragraphs:
                break
        else:
            buf.append(line)
    if buf and len(paragraphs) < max_paragraphs:
        joined = " ".join(buf).strip()
        if joined and not joined.startswith("#"):
            paragraphs.append(joined)
    return "\n\n".join(paragraphs[:max_paragraphs])


# ─────────────────────────────────────────────────────────────────────
# Outline-table parser
#
# A "## Script Outline" section with a markdown table whose columns
# cover Duration / Voiceover / Visual / Scene Title. Each row becomes
# a scene; per-row fields are merged into the auto-fill heading for
# downstream inference.
# ─────────────────────────────────────────────────────────────────────
_OUTLINE_DURATION_RE = re.compile(r"(\d+):(\d+)\s*[–\-—]\s*(\d+):(\d+)")
_OUTLINE_DURATION_SIMPLE_RE = re.compile(r"(\d+)\s*[–\-—]\s*(\d+)\s*s?", re.IGNORECASE)


def parse_outline_table(body: str) -> list[dict[str, Any]]:
    """Parse a markdown table in `body` into a list of scene dicts.

    Expected columns (header row is matched case-insensitively):
      # / Scene / Scene Title    -> scene id + heading source
      Duration / Time            -> duration_s (computed from end - start)
      Voiceover / Script         -> scene.script
      Visual / Visual Direction  -> scene.query

    All other columns are ignored. Returns one scene per body row.
    Skips the header row, the separator row (`|---|---|`), and any row
    whose first cell is empty (continuation rows).
    """
    # Find a block of consecutive lines that contain a `|` character —
    # that's the table. The first such line is the header.
    lines = [l for l in body.splitlines() if l.strip()]
    table_lines = [l for l in lines if "|" in l]
    if len(table_lines) < 3:
        return []

    header = _split_md_row(table_lines[0])
    if not header:
        return []
    cols = [_norm(c) for c in header]

    def col(*names: str) -> int | None:
        for n in names:
            for i, c in enumerate(cols):
                if c == _norm(n):
                    return i
        return None

    idx_title  = col("scene title", "scene", "#")
    idx_dur    = col("duration", "time")
    idx_script = col("voiceover", "voiceover / on-screen text", "script", "on-screen text")
    idx_visual = col("visual", "visual direction", "notes")
    if idx_title is None:
        # Last-ditch: first column.
        idx_title = 0

    scenes: list[dict[str, Any]] = []
    # Skip header (0) and separator (1).
    for line in table_lines[2:]:
        cells = _split_md_row(line)
        if not cells or all(not c.strip() for c in cells):
            continue
        if len(cells) <= idx_title:
            continue

        raw_title = cells[idx_title].strip()
        if not raw_title:
            continue

        sid = _slugify(raw_title)
        scene: dict[str, Any] = {"id": sid}

        # Duration: support "0:08-0:45", "8-45s", "8–22s".
        if idx_dur is not None and idx_dur < len(cells):
            dur_text = cells[idx_dur].strip()
            scene["duration_s"] = _parse_duration_seconds(dur_text) or 10
        else:
            scene["duration_s"] = 10

        if idx_script is not None and idx_script < len(cells):
            scene["script"] = cells[idx_script].strip()
        if idx_visual is not None and idx_visual < len(cells):
            scene["query"] = cells[idx_visual].strip()

        scenes.append(scene)

    return scenes


def _split_md_row(line: str) -> list[str]:
    """Split a markdown table row on `|` and trim each cell.

    A leading/trailing `|` are stripped (GFM style). Empty cells are kept
    as empty strings.
    """
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def _parse_duration_seconds(text: str) -> int | None:
    """Parse '0:08-0:45', '8-22s', '45s', '8s' → integer seconds."""
    text = text.strip()
    m = _OUTLINE_DURATION_RE.search(text)
    if m:
        m1, s1, m2, s2 = (int(x) for x in m.groups())
        end = m2 * 60 + s2
        start = m1 * 60 + s1
        return max(1, end - start)
    m = _OUTLINE_DURATION_SIMPLE_RE.search(text)
    if m:
        start, end = (int(x) for x in m.groups())
        return max(1, end - start)
    m = re.match(r"^(\d+)\s*s?$", text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


def _parse_bullet_scene_block(name: str, idx: int, body: str) -> dict[str, Any]:
    """Extract a scene dict from a ## section body using the bullet
    schema (**Kind:**, **Duration:**, **Headline:**, **Stats:**, etc.).
    """
    scene_id = _scene_id(name, idx)
    scene: dict[str, Any] = {"id": scene_id}

    # Kind
    m = re.search(r"\*\*Kind:\*\*\s*(\w+)", body)
    if m:
        k = m.group(1).strip().lower()
        if k in SCENE_KINDS:
            scene["kind"] = k
        else:
            scene["kind"] = f"TODO_unknown({k})"

    # Duration
    m = re.search(r"\*\*Duration:\*\*\s*(\d+)\s*s", body)
    if m:
        scene["duration_s"] = int(m.group(1))

    # Top/bottom labels
    m = re.search(r"\*\*Top label:\*\*\s*(.+?)\s*$", body, re.MULTILINE)
    if m:
        scene["top_label"] = m.group(1).strip()
    m = re.search(r"\*\*Bottom label:\*\*\s*(.+?)\s*$", body, re.MULTILINE)
    if m:
        scene["bottom_label"] = m.group(1).strip()

    # Query
    m = re.search(r"\*\*Query:\*\*\s*(.+?)\s*$", body, re.MULTILINE)
    if m:
        scene["query"] = m.group(1).strip()

    # Pill
    m = re.search(r"\*\*Pill:\*\*\s*(.+?)\s*$", body, re.MULTILINE)
    if m:
        scene["pill"] = m.group(1).strip()

    # Headline / sub / subhead / eyebrow / name.
    # "Name" is the headline for kind=record (the big right-side word).
    for k in ("eyebrow", "headline", "subhead", "sub", "name"):
        m = re.search(rf"\*\*{k.capitalize()}:\*\*\s*(.+?)\s*$", body, re.MULTILINE)
        if not m:
            m = re.search(rf"\*\*{k.capitalize()}:?\*\*\s*(.+?)\s*$", body, re.MULTILINE)
        if m:
            scene[k] = m.group(1).strip()

    # Counter fields (for kind=record). The "Counter" prefix splits as
    # two words in the markdown heading, so we use a phrase match.
    for ck, target in [
        ("counter label",   "counter_label"),
        ("counter num",     "counter_num"),
        ("counter suffix",  "counter_suffix"),
    ]:
        m = re.search(rf"\*\*{ck.capitalize()}:?\*\*\s*(.+?)\s*$", body, re.MULTILINE)
        if m:
            scene[target] = m.group(1).strip()

    # Image query (for split kind)
    m = re.search(r"\*\*Image query:\*\*\s*(.+?)\s*$", body, re.MULTILINE)
    if m:
        scene["image_query"] = m.group(1).strip()

    # Stats
    stats_block = _list_block(body, "Stats")
    if stats_block:
        scene["stats"] = []
        for line in stats_block:
            parts = re.split(r"\s*\|\s*|\s{2,}", line.strip(), maxsplit=1)
            if len(parts) == 2:
                scene["stats"].append({"num": parts[0].strip(), "label": parts[1].strip()})
            else:
                m2 = re.match(r"^(\S+)\s+(.+)$", line.strip())
                if m2:
                    scene["stats"].append({"num": m2.group(1), "label": m2.group(2)})

    # Names
    names_block = _list_block(body, "Names")
    if names_block:
        scene["names"] = []
        for line in names_block:
            parts = re.split(r"\s*\|\s*", line.strip(), maxsplit=1)
            if len(parts) == 2:
                scene["names"].append({"name": parts[0].strip(), "year": parts[1].strip()})

    # Items
    items_block = _list_block(body, "Items")
    if items_block:
        scene["items"] = [line.strip() for line in items_block]

    # Cards (one bullet per card, fields separated by |)
    cards_block = _list_block(body, "Cards")
    if cards_block:
        scene["cards"] = []
        for line in cards_block:
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 2:
                card = {
                    "flag": parts[0],
                    "name": parts[1],
                    "stats": [s.strip() for s in parts[2:-1] if s.strip()] if len(parts) > 3 else [],
                    "quote": parts[-1] if len(parts) >= 2 and parts[-1].startswith(("'", '"')) else "",
                }
                # Drop empty quote
                if not card["quote"] and len(parts) == 4:
                    card["quote"] = parts[3]
                scene["cards"].append(card)

    # Voiceover / script: prefer a "Voiceover:" line, fall back to a
    # quoted block, fall back to a bare double-quoted line. The bare-
    # quoted fallback covers briefs where the user typed the VO as a
    # plain line of dialogue inside the scene block (the "Full Scene
    # Schema" format in briefs/Video2_brief.md uses this).
    m = re.search(r"\*\*(?:Voiceover|Script):\*\*\s*(.+?)(?=\n\n|\Z)", body, re.DOTALL)
    if m:
        scene["script"] = m.group(1).strip()
    else:
        # Quote-style block
        qb = re.search(r"^>\s*(.+?)(?=\n[^>]|\Z)", body, re.MULTILINE | re.DOTALL)
        if qb:
            scene["script"] = qb.group(1).strip()
        else:
            # Bare double-quoted line: e.g. `"Some line of VO."`
            bq = re.search(r'^\s*"(.+?)"\s*$', body, re.MULTILINE | re.DOTALL)
            if bq:
                scene["script"] = bq.group(1).strip()

    return scene


def _list_block(body: str, name: str) -> list[str]:
    """Return the bullet list under '**Name:**' (or 'Name:') as a list of strings.

    Tolerates both the bolded form (`**Cards:**`) and the bare form
    (`Cards:`), and the standard `-` / `*` bullets plus the `•` U+2022
    glyph the user used in Video2_brief.md. The list ends at the next
    `**Field:**` / `Field:` line or the end of the body.
    """
    # Match the heading (bolded or bare), then capture all subsequent
    # lines that start with a recognised bullet character.
    heading_re = rf"\**\s*{re.escape(name)}\s*:\**\s*\n"
    m = re.search(heading_re, body)
    if not m:
        return []
    after = body[m.end():]
    # The list ends at the next heading line (bolded or bare) or EOF.
    end_re = re.compile(r"\n\s*\**\s*[A-Z][A-Za-z ]{0,30}\s*:\**\s*(?=\n|$)")
    end_match = end_re.search(after)
    block = after if end_match is None else after[:end_match.start()]
    # Each line: strip leading whitespace + bullet (•, -, *), keep the rest.
    out: list[str] = []
    for line in block.splitlines():
        if not line.strip():
            continue
        m2 = re.match(r"^\s*[•\-\*]\s+(.+)$", line)
        if m2:
            out.append(m2.group(1).rstrip())
    return out


def _scene_id(name: str, idx: int) -> str:
    """Build a scene id from a heading name like 'Scene 4 — The Hosts'."""
    m = re.match(r"Scene\s+(\d+)\s*[—-]\s*(.+)", name)
    if m:
        n, title = m.group(1), m.group(2)
    else:
        n, title = str(idx), name
    slug = _slugify(title)
    return f"{int(n):02d}_{slug}"


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", text.lower()).strip("_")
    return s or "scene"


# ─────────────────────────────────────────────────────────────────────
# CLI — invoked by `md2yt brief`
# ─────────────────────────────────────────────────────────────────────
def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Convert a .md content brief into a draft spec")
    p.add_argument("--in", dest="brief_in", required=True, help="path to the .md brief")
    p.add_argument("--out", default="specs/_draft.json", help="output spec path (default: specs/_draft.json)")
    args = p.parse_args(argv[1:])

    try:
        spec = parse_brief_file(args.brief_in)
    except (BriefParseError, FileNotFoundError) as e:
        print(f"FAIL: {e}", file=sys.stderr)
        return 1

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(spec, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"OK: wrote {out}")
    print(f"  scenes: {len(spec['scenes'])}")
    print(f"  id:     {spec['id']}")
    todo = _count_todos(spec)
    if todo:
        print(f"  TODO fields: {todo} (open {out} and fill them in)")
    return 0


def _count_todos(spec: dict) -> int:
    n = 0
    s = json.dumps(spec)
    n += s.count('"TODO')
    return n


if __name__ == "__main__":
    sys.exit(main(sys.argv))