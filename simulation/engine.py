"""Turn-based market simulation engine with agent-to-agent interactions."""

from __future__ import annotations

import json
import os
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from simulation.personas import MarketPersona


class SimulationMessage(BaseModel):
    """A single message in the simulation feed."""
    round_num: int
    persona_name: str
    archetype: str
    content: str
    sentiment: float = Field(ge=-1.0, le=1.0, default=0.0)
    references: list[str] = Field(default_factory=list, description="Names of personas referenced")
    stance_change: str = Field(default="none", description="more_positive, more_negative, none")


class SimulationRound(BaseModel):
    """One round of the simulation."""
    round_num: int
    messages: list[SimulationMessage] = Field(default_factory=list)
    avg_sentiment: float = 0.0


class SimulationResult(BaseModel):
    """Full simulation output."""
    rounds: list[SimulationRound] = Field(default_factory=list)
    final_stances: dict[str, str] = Field(default_factory=dict)
    total_messages: int = 0


async def run_simulation(
    startup_idea: str,
    strategy_summary: str,
    personas: list[MarketPersona],
    num_rounds: int = 3,
    client: AsyncOpenAI | None = None,
) -> SimulationResult:
    """Run a turn-based social simulation.

    Each round:
    1. Each persona reacts to the startup pitch + previous messages
    2. Personas can reference and respond to each other
    3. Stances evolve based on the conversation

    Uses gpt-4o-mini for cost control.
    """
    if client is None:
        client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

    all_rounds: list[SimulationRound] = []
    message_history: list[SimulationMessage] = []
    current_stances: dict[str, str] = {p.name: p.initial_stance for p in personas}

    for round_num in range(1, num_rounds + 1):
        round_messages: list[SimulationMessage] = []

        # Build shared context from previous messages
        history_text = ""
        if message_history:
            recent = message_history[-10:]  # last 10 messages for context
            history_text = "\n".join(
                f"[{m.persona_name} ({m.archetype})]: {m.content}"
                for m in recent
            )

        # Each persona takes a turn
        for persona in personas:
            msg = await _persona_turn(
                client=client,
                persona=persona,
                startup_idea=startup_idea,
                strategy_summary=strategy_summary,
                round_num=round_num,
                history=history_text,
                current_stance=current_stances.get(persona.name, "neutral"),
                other_personas=[p.name for p in personas if p.name != persona.name],
            )
            round_messages.append(msg)
            message_history.append(msg)

            # Update stance
            if msg.stance_change == "more_positive":
                current_stances[persona.name] = _shift_stance(current_stances[persona.name], positive=True)
            elif msg.stance_change == "more_negative":
                current_stances[persona.name] = _shift_stance(current_stances[persona.name], positive=False)

        avg_sentiment = sum(m.sentiment for m in round_messages) / max(len(round_messages), 1)
        all_rounds.append(SimulationRound(
            round_num=round_num,
            messages=round_messages,
            avg_sentiment=avg_sentiment,
        ))

    return SimulationResult(
        rounds=all_rounds,
        final_stances=current_stances,
        total_messages=len(message_history),
    )


async def _persona_turn(
    client: AsyncOpenAI,
    persona: MarketPersona,
    startup_idea: str,
    strategy_summary: str,
    round_num: int,
    history: str,
    current_stance: str,
    other_personas: list[str],
) -> SimulationMessage:
    """Generate one persona's response in a simulation round."""

    prompt = f"""You are simulating a market stakeholder reacting to a startup pitch.

YOUR PERSONA:
- Name: {persona.name}
- Role: {persona.archetype}
- Background: {persona.background}
- Priorities: {', '.join(persona.priorities)}
- Risk tolerance: {persona.risk_tolerance}
- Current stance: {current_stance}

THE STARTUP:
{startup_idea}

STRATEGY:
{strategy_summary}

CONVERSATION SO FAR:
{history or "(This is the first round)"}

OTHER PARTICIPANTS: {', '.join(other_personas[:5])}

Instructions:
- Stay in character based on your archetype and background
- React naturally to what others have said (reference them by name if relevant)
- Your response should reflect your priorities and risk tolerance
- If someone made a compelling point, you may shift your stance

Respond in JSON:
{{
  "content": "Your 2-3 sentence response in character",
  "sentiment": float from -1.0 (very negative) to 1.0 (very positive),
  "references": ["names of people you're responding to"],
  "stance_change": "more_positive" or "more_negative" or "none"
}}"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a realistic market simulation agent. Respond only with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.9,
            max_tokens=300,
        )

        content = response.choices[0].message.content or "{}"
        data = json.loads(content.strip().removeprefix("```json").removesuffix("```").strip())

        return SimulationMessage(
            round_num=round_num,
            persona_name=persona.name,
            archetype=persona.archetype,
            content=data.get("content", "No comment."),
            sentiment=max(-1.0, min(1.0, float(data.get("sentiment", 0.0)))),
            references=data.get("references", []),
            stance_change=data.get("stance_change", "none"),
        )
    except Exception:
        # Deterministic fallback
        fallback_sentiments = {"positive": 0.5, "neutral": 0.0, "negative": -0.5, "hostile": -0.8}
        return SimulationMessage(
            round_num=round_num,
            persona_name=persona.name,
            archetype=persona.archetype,
            content=f"As a {persona.archetype}, I have reservations about {startup_idea}.",
            sentiment=fallback_sentiments.get(current_stance, 0.0),
            references=[],
            stance_change="none",
        )


def _shift_stance(current: str, positive: bool) -> str:
    """Shift stance one step in a direction."""
    scale = ["hostile", "negative", "neutral", "positive"]
    idx = scale.index(current) if current in scale else 2
    if positive:
        idx = min(idx + 1, len(scale) - 1)
    else:
        idx = max(idx - 1, 0)
    return scale[idx]
