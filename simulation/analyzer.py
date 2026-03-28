"""Simulation result analyzer - produces structured MarketSignal."""

from __future__ import annotations

import json
import os
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from simulation.engine import SimulationResult


class MarketSignal(BaseModel):
    """Structured analysis of simulation results for CEO decision-making."""
    overall_sentiment: float = Field(ge=-1.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    key_concerns: list[str] = Field(default_factory=list)
    key_strengths: list[str] = Field(default_factory=list)
    pivot_recommended: bool = False
    pivot_suggestion: str = ""
    archetype_breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="Average sentiment by archetype"
    )
    stance_shifts: dict[str, str] = Field(
        default_factory=dict,
        description="Personas whose stance changed"
    )
    summary: str = ""


async def analyze_simulation(
    result: SimulationResult,
    startup_idea: str,
    client: AsyncOpenAI | None = None,
) -> MarketSignal:
    """Analyze simulation results and produce a MarketSignal.

    Combines quantitative analysis (sentiment scores, stance shifts)
    with LLM-based qualitative analysis.
    """
    if client is None:
        client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

    # Quantitative analysis
    all_messages = [m for r in result.rounds for m in r.messages]
    overall_sentiment = sum(m.sentiment for m in all_messages) / max(len(all_messages), 1)

    # Sentiment by archetype
    archetype_sentiments: dict[str, list[float]] = {}
    for m in all_messages:
        archetype_sentiments.setdefault(m.archetype, []).append(m.sentiment)
    archetype_breakdown = {
        arch: sum(scores) / len(scores)
        for arch, scores in archetype_sentiments.items()
    }

    # Track stance shifts
    stance_shifts = {}
    if result.rounds:
        first_round = {m.persona_name: m.sentiment for m in result.rounds[0].messages}
        last_round = {m.persona_name: m.sentiment for m in result.rounds[-1].messages}
        for name in first_round:
            if name in last_round:
                diff = last_round[name] - first_round[name]
                if abs(diff) > 0.2:
                    stance_shifts[name] = "more_positive" if diff > 0 else "more_negative"

    # LLM-based qualitative analysis
    conversation_summary = "\n".join(
        f"[Round {m.round_num}] {m.persona_name} ({m.archetype}, sentiment={m.sentiment:.1f}): {m.content}"
        for m in all_messages[-20:]  # Last 20 messages
    )

    prompt = f"""Analyze this market simulation for "{startup_idea}":

QUANTITATIVE:
- Overall sentiment: {overall_sentiment:.2f} (-1 to 1)
- Archetype sentiments: {json.dumps(archetype_breakdown)}
- Final stances: {json.dumps(result.final_stances)}
- Stance shifts: {json.dumps(stance_shifts)}

CONVERSATION (last 20 messages):
{conversation_summary}

Respond in JSON:
{{
  "key_concerns": ["top 3-5 concerns raised"],
  "key_strengths": ["top 3-5 strengths identified"],
  "pivot_recommended": true/false,
  "pivot_suggestion": "if pivot recommended, what should change",
  "confidence": 0.0-1.0 (how confident in this analysis),
  "summary": "2-3 sentence executive summary"
}}

Recommend pivot only if sentiment is strongly negative (<-0.3) OR if regulators/VCs raised critical issues."""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a market analysis AI. Respond only with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=1000,
        )

        content = response.choices[0].message.content or "{}"
        data = json.loads(content.strip().removeprefix("```json").removesuffix("```").strip())
    except Exception:
        data = {
            "key_concerns": ["Unable to analyze - using quantitative data only"],
            "key_strengths": [],
            "pivot_recommended": overall_sentiment < -0.3,
            "pivot_suggestion": "Consider adjusting based on negative market feedback" if overall_sentiment < -0.3 else "",
            "confidence": 0.5,
            "summary": f"Simulation showed {'negative' if overall_sentiment < 0 else 'positive'} reception with overall sentiment of {overall_sentiment:.2f}",
        }

    return MarketSignal(
        overall_sentiment=overall_sentiment,
        confidence=data.get("confidence", 0.5),
        key_concerns=data.get("key_concerns", []),
        key_strengths=data.get("key_strengths", []),
        pivot_recommended=data.get("pivot_recommended", False),
        pivot_suggestion=data.get("pivot_suggestion", ""),
        archetype_breakdown=archetype_breakdown,
        stance_shifts=stance_shifts,
        summary=data.get("summary", ""),
    )
