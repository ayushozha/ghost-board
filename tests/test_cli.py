"""Tests for CLI interface."""

from click.testing import CliRunner
from main import main


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
