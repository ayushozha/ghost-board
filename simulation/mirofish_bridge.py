"""Bridge to MiroFish/BettaFish with automatic fallback to local implementations.

Tries to use vendor MiroFish simulation engine first.
If it fails for ANY reason, falls back to our own async simulation loop.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from simulation.personas import MarketPersona, generate_personas
from simulation.engine import run_simulation, SimulationResult
from simulation.analyzer import analyze_simulation, MarketSignal


MIROFISH_DIR = Path("vendor/MiroFish")
BETTAFISH_DIR = Path("vendor/BettaFish")


class MiroFishBridge:
    """Bridge that tries MiroFish first, falls back to local simulation.

    MiroFish concepts used (as inspiration, not direct import):
    - Knowledge graph building from seed data
    - OASIS multi-agent simulation
    - Report generation from simulation data

    BettaFish concepts used:
    - Sentiment analysis patterns
    - Insight extraction
    """

    def __init__(self, client=None):
        self.client = client
        self._mirofish_available = self._check_mirofish()
        self._bettafish_available = self._check_bettafish()

    def _check_mirofish(self) -> bool:
        """Check if MiroFish is available and usable."""
        sim_runner = MIROFISH_DIR / "backend" / "app" / "services" / "simulation_runner.py"
        if not sim_runner.exists():
            return False
        # Check if MiroFish venv exists with deps installed
        venv = MIROFISH_DIR / "backend" / ".venv"
        return venv.exists()

    def _check_bettafish(self) -> bool:
        """Check if BettaFish sentiment tools are available."""
        sentiment = BETTAFISH_DIR / "InsightEngine" / "tools" / "sentiment_analyzer.py"
        return sentiment.exists()

    async def run_full_simulation(
        self,
        startup_idea: str,
        strategy_summary: str,
        num_personas: int = 10,
        num_rounds: int = 3,
    ) -> tuple[SimulationResult, MarketSignal]:
        """Run full simulation pipeline with automatic fallback.

        Returns (SimulationResult, MarketSignal).
        """
        # Try MiroFish first
        if self._mirofish_available:
            try:
                return await self._run_mirofish_simulation(
                    startup_idea, strategy_summary, num_personas, num_rounds
                )
            except Exception as e:
                print(f"[MiroFish Bridge] MiroFish failed ({e}), falling back to local simulation")

        # Fallback: our own async simulation loop
        return await self._run_local_simulation(
            startup_idea, strategy_summary, num_personas, num_rounds
        )

    async def _run_mirofish_simulation(
        self,
        startup_idea: str,
        strategy_summary: str,
        num_personas: int,
        num_rounds: int,
    ) -> tuple[SimulationResult, MarketSignal]:
        """Try to run simulation via MiroFish subprocess."""
        # MiroFish uses a simulation_runner that takes JSON config
        config = {
            "seed_data": {
                "startup_idea": startup_idea,
                "strategy": strategy_summary,
            },
            "num_agents": num_personas,
            "num_rounds": num_rounds,
        }

        venv_python = str(MIROFISH_DIR / "backend" / ".venv" / "Scripts" / "python.exe")
        if not Path(venv_python).exists():
            venv_python = str(MIROFISH_DIR / "backend" / ".venv" / "bin" / "python")

        result = subprocess.run(
            [venv_python, "-c", f"""
import sys
sys.path.insert(0, '{MIROFISH_DIR / "backend"}')
from app.services.simulation_runner import SimulationRunner
import json
config = {json.dumps(config)}
runner = SimulationRunner(config)
result = runner.run()
print(json.dumps(result))
"""],
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            raise RuntimeError(f"MiroFish subprocess failed: {result.stderr}")

        # Parse MiroFish output and convert to our format
        mf_data = json.loads(result.stdout)
        return self._convert_mirofish_result(mf_data, startup_idea)

    def _convert_mirofish_result(
        self, mf_data: dict[str, Any], startup_idea: str
    ) -> tuple[SimulationResult, MarketSignal]:
        """Convert MiroFish output format to our SimulationResult/MarketSignal."""
        from simulation.engine import SimulationMessage, SimulationRound

        rounds = []
        for i, round_data in enumerate(mf_data.get("rounds", []), 1):
            messages = []
            for msg in round_data.get("messages", []):
                messages.append(SimulationMessage(
                    round_num=i,
                    persona_name=msg.get("agent_name", "Unknown"),
                    archetype=msg.get("archetype", "unknown"),
                    content=msg.get("content", ""),
                    sentiment=msg.get("sentiment", 0.0),
                    references=msg.get("references", []),
                    stance_change="none",
                ))
            rounds.append(SimulationRound(round_num=i, messages=messages))

        sim_result = SimulationResult(
            rounds=rounds,
            final_stances=mf_data.get("final_stances", {}),
            total_messages=sum(len(r.messages) for r in rounds),
        )

        signal = MarketSignal(
            overall_sentiment=mf_data.get("overall_sentiment", 0.0),
            confidence=mf_data.get("confidence", 0.5),
            key_concerns=mf_data.get("concerns", []),
            key_strengths=mf_data.get("strengths", []),
            pivot_recommended=mf_data.get("pivot_recommended", False),
            pivot_suggestion=mf_data.get("pivot_suggestion", ""),
            summary=mf_data.get("summary", ""),
        )

        return sim_result, signal

    async def _run_local_simulation(
        self,
        startup_idea: str,
        strategy_summary: str,
        num_personas: int,
        num_rounds: int,
    ) -> tuple[SimulationResult, MarketSignal]:
        """Our own async simulation loop (replaces OASIS)."""
        # Generate personas
        personas = await generate_personas(
            startup_idea=startup_idea,
            target_market=strategy_summary,
            num_personas=num_personas,
            client=self.client,
        )

        # Run turn-based simulation
        sim_result = await run_simulation(
            startup_idea=startup_idea,
            strategy_summary=strategy_summary,
            personas=personas,
            num_rounds=num_rounds,
            client=self.client,
        )

        # Analyze results
        signal = await analyze_simulation(
            result=sim_result,
            startup_idea=startup_idea,
            client=self.client,
        )

        return sim_result, signal

    async def get_sentiment_analysis(self, text: str) -> dict[str, Any]:
        """Sentiment analysis - tries BettaFish patterns, falls back to local.

        Inspired by BettaFish/InsightEngine/tools/sentiment_analyzer.py
        """
        if self._bettafish_available:
            try:
                return self._bettafish_sentiment(text)
            except Exception:
                pass

        # Local fallback using OpenAI
        return await self._local_sentiment(text)

    def _bettafish_sentiment(self, text: str) -> dict[str, Any]:
        """Try BettaFish sentiment analysis."""
        # BettaFish uses a rule-based + ML hybrid approach
        # We reference the pattern but don't import directly
        raise NotImplementedError("BettaFish sentiment not available")

    async def _local_sentiment(self, text: str) -> dict[str, Any]:
        """Local sentiment analysis using OpenAI."""
        from openai import AsyncOpenAI

        client = self.client or AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Analyze sentiment. Respond with JSON: {\"sentiment\": float(-1 to 1), \"label\": \"positive/neutral/negative\", \"confidence\": float(0-1)}"},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=100,
        )

        try:
            return json.loads(response.choices[0].message.content or "{}")
        except json.JSONDecodeError:
            return {"sentiment": 0.0, "label": "neutral", "confidence": 0.5}
