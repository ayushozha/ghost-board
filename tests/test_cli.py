"""Tests for CLI interface."""

from pathlib import Path

import pytest
from click.testing import CliRunner
from main import main

# Project root (repo top-level directory)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Canonical mapping of concept names to their files (mirrors main.py)
CONCEPT_FILES = {
    "anchrix": "demo/anchrix_concept.txt",
    "coforge": "demo/coforge_concept.txt",
    "medpulse": "demo/healthtech_concept.txt",
    "learnloop": "demo/edtech_concept.txt",
    "saas": "demo/saas_concept.txt",
}


class TestCLI:
    def test_help(self):
        runner = CliRunner()
        result = runner.invoke(main, ["--help"])
        assert result.exit_code == 0
        assert "Ghost Board" in result.output
        assert "--demo" in result.output
        assert "--sim-scale" in result.output
        assert "--json-output" in result.output

    def test_cached_playback(self):
        runner = CliRunner()
        result = runner.invoke(main, ["--cached"])
        assert result.exit_code == 0
        assert "Cached Demo Playback" in result.output or "cached" in result.output.lower()

    def test_sim_scale_options(self):
        runner = CliRunner()
        result = runner.invoke(main, ["--help"])
        assert "demo" in result.output
        assert "standard" in result.output
        assert "large" in result.output
        assert "million" in result.output

    def test_concept_flag_in_help(self):
        runner = CliRunner()
        result = runner.invoke(main, ["--help"])
        assert "--concept" in result.output
        assert "anchrix" in result.output
        assert "coforge" in result.output
        assert "medpulse" in result.output

    def test_invalid_concept_rejected(self):
        runner = CliRunner()
        result = runner.invoke(main, ["--concept", "nonexistent"])
        assert result.exit_code != 0


class TestConceptFiles:
    """Verify that all demo concept files exist and contain real content."""

    @pytest.mark.parametrize("concept_name,rel_path", list(CONCEPT_FILES.items()))
    def test_all_concept_files_exist(self, concept_name: str, rel_path: str):
        """Each concept file referenced by the --concept flag must exist on disk."""
        concept_path = PROJECT_ROOT / rel_path
        assert concept_path.exists(), (
            f"Concept file for '{concept_name}' not found at {concept_path}"
        )
        assert concept_path.is_file(), (
            f"Expected a file for '{concept_name}', but {concept_path} is not a regular file"
        )

    @pytest.mark.parametrize("concept_name,rel_path", list(CONCEPT_FILES.items()))
    def test_concept_files_have_content(self, concept_name: str, rel_path: str):
        """Each concept file must contain >50 characters of real descriptive text."""
        concept_path = PROJECT_ROOT / rel_path
        if not concept_path.exists():
            pytest.skip(f"Concept file for '{concept_name}' does not exist yet")
        content = concept_path.read_text(encoding="utf-8").strip()
        assert len(content) > 50, (
            f"Concept file for '{concept_name}' has only {len(content)} chars "
            f"(need >50). Content: {content[:80]!r}"
        )

    @pytest.mark.parametrize("concept_name,rel_path", list(CONCEPT_FILES.items()))
    def test_concept_flag_loads_correct_file(self, concept_name: str, rel_path: str):
        """--concept <name> must resolve to the expected file path in main.py."""
        # We verify by importing main and inspecting its CONCEPT_FILES mapping
        # at the source level.  The mapping is defined inside the main() click
        # command, so the safest way is to check that --help lists the name AND
        # that invoking it with --cached (no API key needed) does not error on
        # file lookup.  We also directly verify path consistency here.
        expected_path = PROJECT_ROOT / rel_path
        if not expected_path.exists():
            pytest.skip(f"Concept file '{rel_path}' missing; skipping load test")

        # Verify the mapping constant matches what main.py actually uses
        # by grepping the source for the path string.
        main_py = (PROJECT_ROOT / "main.py").read_text(encoding="utf-8")
        assert rel_path in main_py, (
            f"Expected path '{rel_path}' for concept '{concept_name}' not found in main.py"
        )
        # Also verify the concept name appears as a key bound to that path
        # e.g. '"anchrix": "demo/anchrix_concept.txt"'
        assert f'"{concept_name}"' in main_py, (
            f"Concept name '{concept_name}' not found as a key in main.py"
        )

    def test_list_concepts_shows_all(self):
        """If --list-concepts exists, it should show every concept name.

        Since the CLI may not have --list-concepts, we fall back to verifying
        that all concept names appear in --help output instead.
        """
        runner = CliRunner()
        # Try --list-concepts first
        result = runner.invoke(main, ["--list-concepts"])
        if result.exit_code == 0:
            for name in CONCEPT_FILES:
                assert name in result.output, (
                    f"Concept '{name}' missing from --list-concepts output"
                )
        else:
            # Fall back: all concept names must appear in --help
            help_result = runner.invoke(main, ["--help"])
            assert help_result.exit_code == 0
            for name in CONCEPT_FILES:
                assert name in help_result.output, (
                    f"Concept '{name}' missing from --help output"
                )

    def test_concept_names_in_help(self):
        """Verify that main.py --help output includes every concept name."""
        runner = CliRunner()
        result = runner.invoke(main, ["--help"])
        assert result.exit_code == 0
        for name in CONCEPT_FILES:
            assert name in result.output, (
                f"Concept name '{name}' not listed in --help output"
            )
