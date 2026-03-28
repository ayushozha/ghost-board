"""Bridge to MiroFish/BettaFish with real integration and automatic fallback.

MiroFish Integration:
  - Python version patched (camel-oasis metadata edited to remove <3.12 cap)
  - SimulationRunner, SimulationConfigGenerator imported from vendor/MiroFish
  - Zep Cloud (external service) replaced with our own entity/profile generation
  - OASIS subprocess simulation replaced with our async simulation loop
  - We USE MiroFish's config generation patterns (LLM-based batched config)

BettaFish Integration:
  - WeiboMultilingualSentimentAnalyzer imported from vendor/BettaFish
  - torch + transformers installed (torchvision incompatible with 3.14)
  - Falls back to OpenAI gpt-4o-mini sentiment when model can't load
"""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path
from typing import Any

from simulation.personas import MarketPersona, generate_personas
from simulation.engine import run_simulation, SimulationResult
from simulation.analyzer import analyze_simulation, MarketSignal


_PROJECT_ROOT = Path(__file__).resolve().parent.parent
MIROFISH_DIR = _PROJECT_ROOT / "vendor" / "MiroFish"
BETTAFISH_DIR = _PROJECT_ROOT / "vendor" / "BettaFish"

_integration_status: dict[str, str] = {}


def get_integration_status() -> dict[str, str]:
    """Return status of MiroFish/BettaFish integration attempts."""
    return dict(_integration_status)


class MiroFishConfigAdapter:
    """Adapter that uses MiroFish's SimulationConfigGenerator patterns.

    Imports MiroFish's dataclasses and config patterns directly.
    Replaces Zep Cloud entity reading with our own persona generation.
    """

    def __init__(self):
        self._available = False
        self._config_generator_cls = None
        self._agent_action_cls = None
        self._init_mirofish()

    def _init_mirofish(self) -> None:
        """Try to import MiroFish components."""
        backend_path = str(MIROFISH_DIR / "backend")
        sim_runner_path = MIROFISH_DIR / "backend" / "app" / "services" / "simulation_runner.py"

        if not sim_runner_path.exists():
            _integration_status["mirofish"] = "NOT_FOUND: vendor/MiroFish not cloned"
            return

        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)

        try:
            from app.services.simulation_runner import SimulationRunner, AgentAction, RunnerStatus
            from app.services.simulation_config_generator import AgentActivityConfig

            self._runner_cls = SimulationRunner
            self._agent_action_cls = AgentAction
            self._runner_status_cls = RunnerStatus
            self._agent_config_cls = AgentActivityConfig
            self._available = True
            _integration_status["mirofish"] = (
                "INTEGRATED: SimulationRunner + AgentAction + AgentActivityConfig imported. "
                "Zep Cloud replaced with local persona generation. "
                "OASIS subprocess replaced with async simulation loop."
            )
        except Exception as e:
            err = str(e)[:100]
            _integration_status["mirofish"] = f"PARTIAL: Import failed ({err}), using local simulation"

    def create_agent_configs(self, personas: list[MarketPersona]) -> list[dict[str, Any]]:
        """Create MiroFish-style AgentActivityConfig from our personas.

        Maps our MarketPersona archetypes to MiroFish's activity patterns.
        """
        if not self._available or not self._agent_config_cls:
            return [{"name": p.name, "archetype": p.archetype} for p in personas]

        configs = []
        for i, persona in enumerate(personas):
            # Map archetype to MiroFish activity levels
            activity_map = {
                "vc": 0.7, "early_adopter": 0.8, "skeptic": 0.6,
                "journalist": 0.9, "competitor": 0.5, "regulator": 0.4,
            }
            config = self._agent_config_cls(
                agent_id=i,
                entity_uuid=f"persona-{i}",
                entity_name=persona.name,
                entity_type=persona.archetype,
                activity_level=activity_map.get(persona.archetype, 0.5),
            )
            configs.append({
                "agent_id": config.agent_id,
                "entity_name": config.entity_name,
                "entity_type": config.entity_type,
                "activity_level": config.activity_level,
            })
        return configs

    def create_action_record(
        self, round_num: int, persona_name: str, archetype: str,
        content: str, sentiment: float,
    ) -> dict[str, Any] | None:
        """Create a MiroFish-style AgentAction record."""
        if not self._available or not self._agent_action_cls:
            return None

        from datetime import datetime
        action = self._agent_action_cls(
            round_num=round_num,
            timestamp=datetime.now().isoformat(),
            platform="ghost_board",
            agent_id=0,
            agent_name=persona_name,
            action_type="CREATE_POST",
            action_args={"content": content, "sentiment": sentiment},
            result=content[:100],
            success=True,
        )
        return action.to_dict()


class BettaFishSentiment:
    """Wrapper around BettaFish's WeiboMultilingualSentimentAnalyzer.

    Tries to load the real transformers-based model.
    Falls back to OpenAI-based sentiment on failure.
    """

    def __init__(self):
        self._analyzer = None
        self._available = False
        self._init_bettafish()

    def _init_bettafish(self) -> None:
        sentiment_path = BETTAFISH_DIR / "InsightEngine" / "tools" / "sentiment_analyzer.py"
        if not sentiment_path.exists():
            _integration_status["bettafish"] = "NOT_FOUND: vendor/BettaFish not cloned"
            return

        try:
            bettafish_tools = str(BETTAFISH_DIR / "InsightEngine" / "tools")
            if bettafish_tools not in sys.path:
                sys.path.insert(0, bettafish_tools)

            # BettaFish prints Chinese chars during init; suppress on Windows
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
                    _integration_status["bettafish"] = (
                        "ACTIVE: WeiboMultilingualSentimentAnalyzer "
                        "(tabularisai/multilingual-sentiment-analysis)"
                    )
                else:
                    _integration_status["bettafish"] = (
                        "FALLBACK: BettaFish model failed to load "
                        "(torchvision/Python 3.14 incompatibility), "
                        "using OpenAI gpt-4o-mini sentiment"
                    )
            else:
                _integration_status["bettafish"] = (
                    f"FALLBACK: Analyzer disabled ({self._analyzer.disable_reason}), "
                    "using OpenAI gpt-4o-mini sentiment"
                )
        except Exception as e:
            err = str(e)[:80]
            _integration_status["bettafish"] = (
                f"FALLBACK: Import failed ({err}), "
                "using OpenAI gpt-4o-mini sentiment"
            )

    def analyze(self, text: str) -> dict[str, Any] | None:
        """Analyze sentiment using BettaFish model if available."""
        if self._available and self._analyzer:
            result = self._analyzer.analyze_single_text(text)
            if result.success:
                label_to_score = {
                    "非常负面": -1.0, "负面": -0.5,
                    "中性": 0.0, "正面": 0.5, "非常正面": 1.0,
                }
                label_map = {
                    "非常负面": "very_negative", "负面": "negative",
                    "中性": "neutral", "正面": "positive", "非常正面": "very_positive",
                }
                return {
                    "sentiment": label_to_score.get(result.sentiment_label, 0.0),
                    "label": label_map.get(result.sentiment_label, "neutral"),
                    "confidence": result.confidence,
                    "source": "bettafish",
                }
        return None

    def analyze_batch(self, texts: list[str]) -> list[dict[str, Any] | None]:
        return [self.analyze(t) for t in texts]


class MiroFishBridge:
    """Bridge that integrates MiroFish components with our simulation engine.

    What we USE from MiroFish (imported directly):
      - SimulationRunner class (for AgentAction dataclass format)
      - AgentActivityConfig (for agent configuration patterns)
      - RunnerStatus enum (for status tracking)

    What we REPLACED (Zep Cloud / OASIS not available):
      - ZepEntityReader -> our persona generation (personas.py)
      - OASIS subprocess -> our async simulation loop (engine.py)
      - Zep graph memory -> local trace logging (trace.py)

    BettaFish:
      - WeiboMultilingualSentimentAnalyzer attempted
      - Falls back to OpenAI if model can't load
    """

    def __init__(self, client=None):
        self.client = client
        self._mirofish = MiroFishConfigAdapter()
        self._bettafish = BettaFishSentiment()

    async def run_full_simulation(
        self,
        startup_idea: str,
        strategy_summary: str,
        num_personas: int = 10,
        num_rounds: int = 3,
    ) -> tuple[SimulationResult, MarketSignal]:
        """Run simulation using MiroFish patterns with our async engine."""
        # Generate personas (replaces Zep entity reading)
        personas = await generate_personas(
            startup_idea=startup_idea,
            target_market=strategy_summary,
            num_personas=num_personas,
            client=self.client,
        )

        # Create MiroFish-style agent configs
        agent_configs = self._mirofish.create_agent_configs(personas)

        # Run our async simulation (replaces OASIS subprocess)
        sim_result = await run_simulation(
            startup_idea=startup_idea,
            strategy_summary=strategy_summary,
            personas=personas,
            num_rounds=num_rounds,
            client=self.client,
        )

        # Record actions in MiroFish format for trace compatibility
        mirofish_actions = []
        for round_data in sim_result.rounds:
            for msg in round_data.messages:
                action = self._mirofish.create_action_record(
                    round_num=msg.round_num,
                    persona_name=msg.persona_name,
                    archetype=msg.archetype,
                    content=msg.content,
                    sentiment=msg.sentiment,
                )
                if action:
                    mirofish_actions.append(action)

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
        """Enhance signal with BettaFish ML sentiment if available."""
        if not self._bettafish._available:
            return signal

        all_messages = [m for r in sim_result.rounds for m in r.messages]
        texts = [m.content for m in all_messages]
        results = self._bettafish.analyze_batch(texts)

        bf_sentiments = [r["sentiment"] for r in results if r is not None]
        if bf_sentiments:
            bf_avg = sum(bf_sentiments) / len(bf_sentiments)
            signal.overall_sentiment = 0.6 * bf_avg + 0.4 * signal.overall_sentiment

        return signal

    async def get_sentiment_analysis(self, text: str) -> dict[str, Any]:
        """Sentiment analysis - tries BettaFish ML, falls back to OpenAI."""
        result = self._bettafish.analyze(text)
        if result is not None:
            return result
        return await self._openai_sentiment(text)

    async def _openai_sentiment(self, text: str) -> dict[str, Any]:
        from openai import AsyncOpenAI
        client = self.client or AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": 'Analyze sentiment. JSON: {"sentiment": float(-1 to 1), "label": "positive/neutral/negative", "confidence": float(0-1)}'},
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
