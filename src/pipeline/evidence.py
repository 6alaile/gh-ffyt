"""
evidence.py — evidence-grounding contract for research-backed briefs.

Two source bundle kinds feed different brief use cases:
- "reddit" bundle (Reddit r/soccer threads + RSS + Google Trends) -> matchweek recaps
- "fbref" bundle (FBref/Transfermarkt/Wikipedia) -> player bios, team deep
  dives, AND fact-checking/context for matchweek recaps (a reddit-sourced
  claim about a scoreline or stat can cite an fbref source as verification)

Every factual claim used in a script must declare which bundle items
support it, or be explicitly labeled as inferred/unverified. This exists
because the brief fallback path has previously emitted specific invented
stats (e.g. a fabricated "15 minutes to concede") with no source at all —
this module makes doing that impossible for any claim that runs through it.

Validation is intentionally strict, matching schema.py: fail loudly on the
first problem with a message precise enough to fix without re-reading this
file.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Iterable

# ─────────────────────────────────────────────────────────────────────
# Bundle and source vocabulary
# ─────────────────────────────────────────────────────────────────────
BUNDLE_KINDS = {"reddit", "fbref"}

SOURCE_KINDS = {
    "reddit_thread",
    "rss_article",
    "google_trends",
    "fbref_stat",
    "transfermarkt_profile",
    "wikipedia_extract",
}

# "observed": directly stated by a cited source.
# "inferred": a reasonable read of observed claims, not stated outright.
# "requires_verification": a claim the creator wants to make but no
#   fetched source confirms yet — allowed to exist, but callers should
#   block it from reaching a final script.
EVIDENCE_CLASSES = {"observed", "inferred", "requires_verification"}


class EvidenceError(ValueError):
    """Raised on any evidence-contract validation failure."""


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────
def bundle_snapshot_id(bundle_kind: str, source_ids: Iterable[str], retrieved_at: str) -> str:
    """Deterministic ID binding a set of sources to the moment they were fetched.

    Claims must cite this ID. If the underlying source list is re-fetched
    (new Reddit threads, refreshed FBref page), the ID changes and any
    claim still carrying the old ID is rejected by validate_claims() as
    stale evidence.
    """
    if bundle_kind not in BUNDLE_KINDS:
        raise EvidenceError(f"unknown bundle_kind {bundle_kind!r}, expected one of {sorted(BUNDLE_KINDS)}")
    identity = json.dumps(
        {
            "bundle_kind": bundle_kind,
            "source_ids": sorted(source_ids),
            "retrieved_at": retrieved_at,
        },
        sort_keys=True,
    )
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
    return f"ev_{bundle_kind}_{digest}"


def validate_claim(claim: dict[str, Any]) -> None:
    """Validate a single evidence claim in isolation. Raises EvidenceError on the first problem."""
    _check_type(claim, "claim", dict)
    _check_required(claim, "claim", {"id", "text", "evidence_class", "source_ids", "snapshot_id"})
    _check_type(claim["id"], "claim.id", str)
    _check_type(claim["text"], "claim.text", str)
    _check_type(claim["source_ids"], "claim.source_ids", list)
    _check_type(claim["snapshot_id"], "claim.snapshot_id", str)

    evidence_class = claim["evidence_class"]
    if evidence_class not in EVIDENCE_CLASSES:
        raise EvidenceError(
            f"claim {claim['id']!r}: unknown evidence_class {evidence_class!r}, "
            f"expected one of {sorted(EVIDENCE_CLASSES)}"
        )

    if evidence_class == "observed" and not claim["source_ids"]:
        raise EvidenceError(
            f"claim {claim['id']!r}: evidence_class 'observed' requires at least one source_id "
            "(use 'inferred' or 'requires_verification' if no fetched source backs this claim)"
        )


def validate_claims(
    claims: Iterable[dict[str, Any]],
    allowed_source_ids: Iterable[str],
    allowed_snapshot_id: str,
) -> None:
    """Validate a full set of claims against the sources actually retrieved for this brief.

    Rejects:
    - any claim citing a source_id outside allowed_source_ids — this is what
      stops a script citing a stat that was never fetched (the fabrication case)
    - any claim whose snapshot_id doesn't match the active snapshot — this is
      what stops a stale or rebuilt bundle's claims leaking into a new brief
    """
    allowed_sources = set(allowed_source_ids)
    for claim in claims:
        validate_claim(claim)
        if claim["snapshot_id"] != allowed_snapshot_id:
            raise EvidenceError(
                f"claim {claim['id']!r}: snapshot_id {claim['snapshot_id']!r} does not match "
                f"active snapshot {allowed_snapshot_id!r} (stale evidence)"
            )
        unsupported = [sid for sid in claim["source_ids"] if sid not in allowed_sources]
        if unsupported:
            raise EvidenceError(
                f"claim {claim['id']!r}: cites source_ids not in the active bundle: {unsupported}"
            )


# ─────────────────────────────────────────────────────────────────────
# Internal helpers (mirrors schema.py's _check_type / _check_required)
# ─────────────────────────────────────────────────────────────────────
def _check_type(value: Any, path: str, expected: type | tuple[type, ...]) -> None:
    if not isinstance(value, expected):
        raise EvidenceError(f"{path}: expected {expected}, got {type(value).__name__}")


def _check_required(obj: dict[str, Any], path: str, required: Iterable[str]) -> None:
    missing = [f for f in required if f not in obj]
    if missing:
        raise EvidenceError(f"{path}: missing required field(s) {sorted(missing)}")
