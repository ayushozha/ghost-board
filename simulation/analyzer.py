"""Simulation result analyzer - produces structured MarketSignal.

Includes BettaFish-inspired sentiment categorization:
  - categorize_sentiment() scores each post as positive/negative/neutral
  - Extracts key phrases (concerns, praise) via keyword matching
  - Returns structured dict with sentiment float, category, and key phrases
"""

from __future__ import annotations

import json
import os
import re

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from simulation.engine import SimulationResult


# --- BettaFish-inspired keyword sentiment scoring ---

_POSITIVE_KEYWORDS = [
    "great", "excellent", "promising", "innovative", "smart", "strong",
    "impressive", "brilliant", "excited", "opportunity", "growth",
    "potential", "well-positioned", "compelling", "agree", "love",
    "bullish", "optimistic", "solid", "fantastic", "game-changer",
    "disruptive", "scalable", "efficient", "trust", "confident",
    "valuable", "transformative", "advantage", "progress",
]

_NEGATIVE_KEYWORDS = [
    "concern", "risk", "problem", "issue", "worry", "doubt", "fail",
    "expensive", "costly", "regulatory", "compliance", "liability",
    "threat", "unclear", "unproven", "fragile", "dangerous", "crowded",
    "disagree", "skeptic", "bearish", "pessimistic", "vulnerable",
    "weak", "overvalued", "naive", "questionable", "challenge",
    "barrier", "obstacle",
]

_PRAISE_MARKERS = [
    "well done", "smart move", "strong point", "great approach",
    "impressive", "compelling", "innovative", "well-positioned",
    "good strategy", "agree with", "solid foundation",
]

_CONCERN_MARKERS = [
    "concerned about", "worry about", "risk of", "problem with",
    "issue with", "question about", "challenge of", "threat of",
    "unclear how", "doubt that", "skeptical about", "barrier to",
]


def categorize_sentiment(post_text: str) -> dict:
    """Categorize a simulation post's sentiment using keyword analysis.

    Inspired by BettaFish's WeiboMultilingualSentimentAnalyzer but uses
    fast keyword matching instead of a transformer model, so it works
    without torch/transformers dependencies.

    Args:
        post_text: The text content of a simulation post.

    Returns:
        dict with keys:
          - sentiment (float): Score from -1.0 to 1.0
          - category (str): "positive", "negative", or "neutral"
          - key_phrases (list[str]): Extracted concerns and praise phrases
    """
    text_lower = post_text.lower()

    # Count keyword hits
    pos_count = sum(1 for kw in _POSITIVE_KEYWORDS if kw in text_lower)
    neg_count = sum(1 for kw in _NEGATIVE_KEYWORDS if kw in text_lower)

    # Compute raw score: normalized difference
    total = pos_count + neg_count
    if total > 0:
        raw_score = (pos_count - neg_count) / total
    else:
        raw_score = 0.0

    # Clamp to [-1, 1]
    sentiment = max(-1.0, min(1.0, raw_score))

    # Determine category with thresholds
    if sentiment > 0.15:
        category = "positive"
    elif sentiment < -0.15:
        category = "negative"
    else:
        category = "neutral"

    # Extract key phrases
    key_phrases: list[str] = []
    for marker in _PRAISE_MARKERS:
        if marker in text_lower:
            # Try to extract a larger phrase around the marker
            idx = text_lower.index(marker)
            # Grab up to 80 chars from the start of the marker
            end = min(idx + 80, len(post_text))
            # Find sentence boundary
            snippet = post_text[idx:end]
            period = snippet.find(".")
            if period > 0:
                snippet = snippet[:period]
            key_phrases.append(snippet.strip())

    for marker in _CONCERN_MARKERS:
        if marker in text_lower:
            idx = text_lower.index(marker)
            end = min(idx + 80, len(post_text))
            snippet = post_text[idx:end]
            period = snippet.find(".")
            if period > 0:
                snippet = snippet[:period]
            key_phrases.append(snippet.strip())

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_phrases: list[str] = []
    for p in key_phrases:
        if p.lower() not in seen:
            seen.add(p.lower())
            unique_phrases.append(p)

    return {
        "sentiment": round(sentiment, 3),
        "category": category,
        "key_phrases": unique_phrases,
    }


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
