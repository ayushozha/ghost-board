"""Bridge to MiroFish/BettaFish with automatic fallback to local implementations.

MiroFish (OASIS social simulation):
  - Requires camel-oasis which needs Python <3.12 (we have 3.14)
  - Also requires Zep Cloud (external service)
  - REPLACED with our own async simulation loop (personas.py, engine.py, analyzer.py)
  - We keep their patterns: turn-based rounds, agent profiles, stance tracking

BettaFish (Sentiment analysis):
  - Uses transformers + torch with tabularisai/multilingual-sentiment-analysis
  - We ACTUALLY TRY to use their WeiboMultilingualSentimentAnalyzer first
  - Falls back to OpenAI-based sentiment if the model fails to load
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from simulation.personas import MarketPersona, generate_personas
from simulation.engine import run_simulation, SimulationResult
from simulation.analyzer import analyze_simulation, MarketSignal


MIROFISH_DIR = Path("vendor/MiroFish")
BETTAFISH_DIR = Path("vendor/BettaFish")

# Track integration status for reporting
_integration_status: dict[str, str] = {}


def get_integration_status() -> dict[str, str]:
    """Return status of MiroFish/BettaFish integration attempts."""
    return dict(_integration_status)


class BettaFishSentiment:
    """Wrapper around BettaFish's WeiboMultilingualSentimentAnalyzer.

    Tries to load the real transformers-based model from BettaFish.
    If torch/transformers are available, uses the actual ML model.
    Otherwise falls back to OpenAI-based sentiment.
    """

    def __init__(self):
        self._analyzer = None
        self._available = False
        self._init_bettafish()

    def _init_bettafish(self) -> None:
        """Try to initialize BettaFish's sentiment analyzer."""
        sentiment_path = BETTAFISH_DIR / "InsightEngine" / "tools" / "sentiment_analyzer.py"
        if not sentiment_path.exists():
            _integration_status["bettafish"] = "NOT_FOUND: vendor/BettaFish not cloned"
            return

        try:
            # Add BettaFish to path and import their analyzer
            bettafish_tools = str(BETTAFISH_DIR / "InsightEngine" / "tools")
            if bettafish_tools not in sys.path:
                sys.path.insert(0, bettafish_tools)

            # BettaFish prints Chinese chars during init; suppress stdout on Windows
            import io
            old_stdout = sys.stdout
            sys.stdout = io.TextIOWrapper(io.BytesIO(), encoding="utf-8")
            try:
                from sentiment_analyzer import WeiboMultilingualSentimentAnalyzer
                self._analyzer = WeiboMultilingualSentimentAnalyzer()
            finally:
                sys.stdout = old_stdout
            if not self._analyzer.is_disabled:
                old_stdout2 = sys.stdout
                sys.stdout = io.TextIOWrapper(io.BytesIO(), encoding="utf-8")
                try:
                    success = self._analyzer.initialize()
                finally:
                    sys.stdout = old_stdout2
                if success:
                    self._available = True
                    _integration_status["bettafish"] = "ACTIVE: WeiboMultilingualSentimentAnalyzer (tabularisai/multilingual-sentiment-analysis)"
                else:
                    _integration_status["bettafish"] = (
                        "FALLBACK: BettaFish model failed to load "
                        "(torchvision incompatible with Python 3.14), using OpenAI gpt-4o-mini sentiment"
                    )
            else:
                _integration_status["bettafish"] = f"FALLBACK: Analyzer disabled ({self._analyzer.disable_reason}), using OpenAI gpt-4o-mini sentiment"
        except Exception as e:
            err = str(e)[:80]
            _integration_status["bettafish"] = f"FALLBACK: Import failed ({err}), using OpenAI gpt-4o-mini sentiment"

    def analyze(self, text: str) -> dict[str, Any]:
        """Analyze sentiment using BettaFish model if available.

        Returns dict with: sentiment (-1 to 1), label, confidence
        """
        if self._available and self._analyzer:
            result = self._analyzer.analyze_single_text(text)
            if result.success:
                # Map BettaFish 5-level scale to -1 to 1
                label_to_score = {
                    "非常负面": -1.0, "负面": -0.5,
                    "中性": 0.0, "正面": 0.5, "非常正面": 1.0,
                }
                score = label_to_score.get(result.sentiment_label, 0.0)
                label_map = {
                    "非常负面": "very_negative", "负面": "negative",
                    "中性": "neutral", "正面": "positive", "非常正面": "very_positive",
                }
                return {
                    "sentiment": score,
                    "label": label_map.get(result.sentiment_label, "neutral"),
                    "confidence": result.confidence,
                    "source": "bettafish",
                    "raw_label": result.sentiment_label,
                    "distribution": result.probability_distribution,
                }

        # Not available - return None to signal fallback needed
        return None

    def analyze_batch(self, texts: list[str]) -> list[dict[str, Any] | None]:
        """Batch analyze - returns None for items that need fallback."""
        return [self.analyze(t) for t in texts]


class MiroFishBridge:
    """Bridge that tries MiroFish/BettaFish first, falls back to local.

    MiroFish status: REPLACED
      - camel-oasis requires Python <3.12 (we have 3.14) - irrecoverable
      - Zep Cloud is an external service - not available
      - REPLACED with our own async simulation (personas, engine, analyzer)
      - We kept their patterns: turn-based rounds, agent profiles, config generation

    BettaFish status: INTEGRATED (with fallback)
      - WeiboMultilingualSentimentAnalyzer loaded if torch+transformers available
      - Falls back to OpenAI gpt-4o-mini sentiment if model unavailable
    """

    def __init__(self, client=None):
        self.client = client
        self._bettafish = BettaFishSentiment()

        # Record MiroFish status
        self._check_mirofish_status()

    def _check_mirofish_status(self) -> None:
        """Document why MiroFish can't be used directly."""
        sim_runner = MIROFISH_DIR / "backend" / "app" / "services" / "simulation_runner.py"
        if not sim_runner.exists():
            _integration_status["mirofish"] = "NOT_FOUND: vendor/MiroFish not cloned"
            return

        # MiroFish requires camel-oasis which needs Python <3.12
        _integration_status["mirofish"] = (
            "REPLACED: camel-oasis requires Python <3.12 (we have 3.14), "
            "Zep Cloud is external service. Using our own async simulation loop "
            "with MiroFish-inspired patterns (turn-based rounds, agent profiles, stance tracking)"
        )

    async def run_full_simulation(
        self,
        startup_idea: str,
        strategy_summary: str,
        num_personas: int = 10,
        num_rounds: int = 3,
    ) -> tuple[SimulationResult, MarketSignal]:
        """Run simulation using our local engine (MiroFish replacement).

        Our engine implements the same patterns as MiroFish:
        - Persona generation with archetype distribution
        - Turn-based simulation with agent-to-agent references
        - Stance tracking and sentiment evolution
        - Structured signal extraction
        """
        # Generate personas
        personas = await generate_personas(
            startup_idea=startup_idea,
            target_market=strategy_summary,
            num_personas=num_personas,
            client=self.client,
        )

        # Run turn-based simulation (replaces OASIS)
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

        # Enhance with BettaFish sentiment if available
        signal = await self._enhance_with_bettafish(sim_result, signal)

        return sim_result, signal

    async def _enhance_with_bettafish(
        self, sim_result: SimulationResult, signal: MarketSignal
    ) -> MarketSignal:
        """Enhance the market signal with BettaFish sentiment analysis if available."""
        if not self._bettafish._available:
            return signal

        # Re-analyze all simulation messages with the BettaFish model
        all_messages = [m for r in sim_result.rounds for m in r.messages]
        texts = [m.content for m in all_messages]
        results = self._bettafish.analyze_batch(texts)

        # Compute BettaFish-enhanced sentiment
        bf_sentiments = [r["sentiment"] for r in results if r is not None]
        if bf_sentiments:
            bf_avg = sum(bf_sentiments) / len(bf_sentiments)
            # Blend: 60% BettaFish ML model, 40% OpenAI-based
            blended = 0.6 * bf_avg + 0.4 * signal.overall_sentiment
            signal.overall_sentiment = blended

        return signal

    async def get_sentiment_analysis(self, text: str) -> dict[str, Any]:
        """Sentiment analysis - tries BettaFish ML model, falls back to OpenAI."""
        # Try BettaFish first
        result = self._bettafish.analyze(text)
        if result is not None:
            return result

        # Fallback to OpenAI
        return await self._openai_sentiment(text)

    async def _openai_sentiment(self, text: str) -> dict[str, Any]:
        """OpenAI-based sentiment analysis fallback."""
        from openai import AsyncOpenAI

        client = self.client or AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": 'Analyze sentiment. Respond with JSON: {"sentiment": float(-1 to 1), "label": "positive/neutral/negative", "confidence": float(0-1)}'},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=100,
        )

        try:
            result = json.loads(response.choices[0].message.content or "{}")
            result["source"] = "openai"
            return result
        except json.JSONDecodeError:
            return {"sentiment": 0.0, "label": "neutral", "confidence": 0.5, "source": "openai"}
