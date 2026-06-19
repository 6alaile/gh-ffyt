"""Shared pytest fixtures for the md2yt test suite."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """Repo root — the directory containing pyproject.toml.

    Tests reference real specs/fixtures relative to this so the suite
    mirrors how the CLI is invoked from the repo root.
    """
    # tests/conftest.py → tests/ → repo root
    return Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def example_spec_path(repo_root: Path) -> Path:
    return repo_root / "specs" / "_example.json"


@pytest.fixture(scope="session")
def world_cup_spec_path(repo_root: Path) -> Path:
    return repo_root / "specs" / "world_cup_2026.json"


@pytest.fixture(scope="session")
def example_brief_path(repo_root: Path) -> Path:
    return repo_root / "example_brief.md"


@pytest.fixture(scope="session")
def fixtures_dir(repo_root: Path) -> Path:
    return repo_root / "tests" / "fixtures"
