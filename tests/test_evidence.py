"""Evidence contract tests — grounded claims validate, fabricated ones don't."""

from __future__ import annotations

import pytest

from pipeline.evidence import (
    EvidenceError,
    bundle_snapshot_id,
    validate_claim,
    validate_claims,
)


def _make_bundle():
    source_ids = ["fbref_match_881234", "wikipedia_liverpool_fc"]
    retrieved_at = "2026-09-01T12:00:00Z"
    snapshot_id = bundle_snapshot_id("fbref", source_ids, retrieved_at)
    return source_ids, snapshot_id


def test_grounded_claim_validates():
    source_ids, snapshot_id = _make_bundle()
    claim = {
        "id": "claim_1",
        "text": "Liverpool conceded from a set piece in the 78th minute.",
        "evidence_class": "observed",
        "source_ids": ["fbref_match_881234"],
        "snapshot_id": snapshot_id,
    }
    validate_claim(claim)  # should not raise
    validate_claims([claim], source_ids, snapshot_id)  # should not raise


def test_fabricated_stat_with_no_source_is_rejected():
    """Mirrors the real bug: buildMarkdownBrief() emitting 'Counter num: 15'
    with nothing backing it. An 'observed' claim with zero source_ids must fail."""
    _, snapshot_id = _make_bundle()
    fabricated = {
        "id": "claim_fabricated",
        "text": "15 minutes to concede — critical possession losses.",
        "evidence_class": "observed",
        "source_ids": [],
        "snapshot_id": snapshot_id,
    }
    with pytest.raises(EvidenceError, match="requires at least one source_id"):
        validate_claim(fabricated)


def test_claim_citing_unfetched_source_is_rejected():
    source_ids, snapshot_id = _make_bundle()
    claim = {
        "id": "claim_2",
        "text": "The manager confirmed the tactical change post-match.",
        "evidence_class": "observed",
        "source_ids": ["reddit_thread_never_fetched"],
        "snapshot_id": snapshot_id,
    }
    with pytest.raises(EvidenceError, match="not in the active bundle"):
        validate_claims([claim], source_ids, snapshot_id)


def test_stale_snapshot_is_rejected():
    source_ids, snapshot_id = _make_bundle()
    claim = {
        "id": "claim_3",
        "text": "Player X started the match.",
        "evidence_class": "observed",
        "source_ids": ["fbref_match_881234"],
        "snapshot_id": "ev_fbref_stale0000000000000000000000",
    }
    with pytest.raises(EvidenceError, match="stale evidence"):
        validate_claims([claim], source_ids, snapshot_id)


def test_inferred_claim_needs_no_source():
    _, snapshot_id = _make_bundle()
    claim = {
        "id": "claim_4",
        "text": "This suggests a broader pattern of late defensive lapses.",
        "evidence_class": "inferred",
        "source_ids": [],
        "snapshot_id": snapshot_id,
    }
    validate_claim(claim)  # should not raise


def test_unknown_evidence_class_rejected():
    _, snapshot_id = _make_bundle()
    claim = {
        "id": "claim_5",
        "text": "Some claim.",
        "evidence_class": "definitely_true",
        "source_ids": [],
        "snapshot_id": snapshot_id,
    }
    with pytest.raises(EvidenceError, match="unknown evidence_class"):
        validate_claim(claim)


def test_snapshot_id_changes_when_sources_change():
    retrieved_at = "2026-09-01T12:00:00Z"
    a = bundle_snapshot_id("reddit", ["reddit_thread_1"], retrieved_at)
    b = bundle_snapshot_id("reddit", ["reddit_thread_1", "reddit_thread_2"], retrieved_at)
    assert a != b


def test_unknown_bundle_kind_rejected():
    with pytest.raises(EvidenceError, match="unknown bundle_kind"):
        bundle_snapshot_id("twitter", ["x"], "2026-09-01T12:00:00Z")
