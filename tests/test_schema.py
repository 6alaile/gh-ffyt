"""Schema tests — roundtrip the real specs, reject malformed ones."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.schema import (
    COMMON_SCENE_FIELDS,
    KIND_SCHEMAS,
    SCENE_KINDS,
    SpecError,
    load_and_validate,
    validate,
)


def test_example_spec_validates(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    assert spec["id"] == "example"
    assert isinstance(spec["scenes"], list) and spec["scenes"]
    # Every scene in the reference spec should use a known kind.
    seen_kinds = {s["kind"] for s in spec["scenes"]}
    assert seen_kinds.issubset(SCENE_KINDS)


def test_world_cup_spec_validates(world_cup_spec_path: Path) -> None:
    spec = load_and_validate(world_cup_spec_path)
    assert spec["id"] == "world_cup_2026"
    assert len(spec["scenes"]) >= 1
    # Spot-check scene ids are unique.
    ids = [s["id"] for s in spec["scenes"]]
    assert len(ids) == len(set(ids))


def test_missing_spec_raises() -> None:
    with pytest.raises(FileNotFoundError):
        load_and_validate("/no/such/spec.json")


def test_malformed_json_raises(tmp_path: Path) -> None:
    p = tmp_path / "bad.json"
    p.write_text("{not json", encoding="utf-8")
    with pytest.raises(SpecError, match="invalid JSON"):
        load_and_validate(p)


def test_top_level_required_fields() -> None:
    # Missing id / youtube / scenes — error should mention each.
    with pytest.raises(SpecError) as excinfo:
        validate({})
    msg = str(excinfo.value)
    assert "id" in msg
    assert "youtube" in msg
    assert "scenes" in msg


def test_duplicate_scene_id_rejected(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    spec["scenes"].append(dict(spec["scenes"][0]))  # exact duplicate id
    with pytest.raises(SpecError, match="duplicate scene id"):
        validate(spec)


def test_unknown_kind_rejected(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    spec["scenes"][0]["kind"] = "this_does_not_exist"
    with pytest.raises(SpecError, match="unknown kind"):
        validate(spec)


def test_missing_required_field_rejected(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    # The first scene is a 'hook' — drop its required 'headline'.
    spec["scenes"][0].pop("headline", None)
    with pytest.raises(SpecError, match="missing required field 'headline'"):
        validate(spec)


def test_unknown_field_rejected(example_spec_path: Path) -> None:
    spec = load_and_validate(example_spec_path)
    spec["scenes"][0]["mystery_field"] = "?"
    with pytest.raises(SpecError, match="unknown field"):
        validate(spec)


def test_every_kind_in_schema_has_required_and_types() -> None:
    # Sanity-check the schema tables are complete: every scene kind has
    # at least one required field and at least one typed field.
    for kind in SCENE_KINDS:
        assert KIND_SCHEMAS[kind]["required"], f"{kind} has no required fields"
        assert KIND_SCHEMAS[kind]["types"], f"{kind} has no typed fields"


def test_common_scene_fields_cover_the_basics() -> None:
    for field in ("id", "kind", "duration_s", "script"):
        assert field in COMMON_SCENE_FIELDS, f"COMMON_SCENE_FIELDS missing {field!r}"


def test_fixture_files_exist(fixtures_dir: Path) -> None:
    """Sanity: the bundled fixtures actually load."""

    good = json.loads((fixtures_dir / "good_spec.json").read_text(encoding="utf-8"))
    validate(good)  # raises on failure

    bad = json.loads((fixtures_dir / "bad_spec.json").read_text(encoding="utf-8"))
    with pytest.raises(SpecError):
        validate(bad)
