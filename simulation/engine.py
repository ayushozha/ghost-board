"""Turn-based market simulation engine with agent-to-agent interactions."""

from __future__ import annotations

import inspect
import json
import os
from collections.abc import Awaitable, Callable
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


SimulationProgressCallback = Callable[[str, dict[str, Any]], Awaitable[None] | None]


async def _emit_progress(
    progress_callback: SimulationProgressCallback | None,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    """Emit live simulation progress if a callback is registered."""
    if progress_callback is None:
        return
    maybe_awaitable = progress_callback(event_type, payload)
    if inspect.isawaitable(maybe_awaitable):
        await maybe_awaitable


def _message_to_stream_payload(
    persona: MarketPersona,
    message: SimulationMessage,
    stance: str,
) -> dict[str, Any]:
    """Convert a simulation message into a live-stream payload for the UI."""
    geo = persona.geographic_location
    return {
        "name": persona.name,
        "archetype": persona.archetype,
        "lat": geo.lat,
        "lng": geo.lng,
        "city": geo.city,
        "country": geo.country,
        "company": persona.real_company_reference,
        "round": message.round_num,
        "content": message.content,
        "post": message.content,
        "sentiment": message.sentiment,
        "stance": stance,
        "references": list(message.references),
        "stance_change": message.stance_change,
        "messages": [
            {
                "round": message.round_num,
                "content": message.content,
                "post": message.content,
                "sentiment": message.sentiment,
                "references": list(message.references),
                "stance_change": message.stance_change,
            }
        ],
    }


def _round_sentiment_by_archetype(messages: list[SimulationMessage]) -> dict[str, float]:
    """Aggregate average sentiment by archetype for a round."""
    sentiment_by_archetype: dict[str, list[float]] = {}
    for message in messages:
        sentiment_by_archetype.setdefault(message.archetype, []).append(message.sentiment)
    return {
        archetype: sum(values) / len(values)
        for archetype, values in sentiment_by_archetype.items()
        if values
    }


def _build_reference_context(
    persona: MarketPersona,
    message_history: list[SimulationMessage],
    other_personas: list[str],
    max_quotes: int = 5,
) -> tuple[str, list[str]]:
    """Build rich reference context for a persona from prior messages.

    Returns (formatted_context, suggested_names_to_reference).
    Selects the most relevant quotes from other personas, prioritizing:
    - Different archetypes (cross-pollination)
    - Strong sentiments (controversial takes)
    - Recent messages
    """
    if not message_history:
        return "", []

    # Get messages from other personas only
    other_messages = [m for m in message_history if m.persona_name != persona.name]
    if not other_messages:
        return "", []

    # Score messages for relevance to this persona
    scored: list[tuple[float, SimulationMessage]] = []
    for msg in other_messages:
        score = 0.0
        # Cross-archetype interaction is more interesting
        if msg.archetype != persona.archetype:
            score += 2.0
        # Strong sentiments (positive or negative) are more provocative
        score += abs(msg.sentiment) * 1.5
        # Opposing sentiments create debate
        persona_positive = persona.initial_stance in ("positive",)
        msg_positive = msg.sentiment > 0
        if persona_positive != msg_positive:
            score += 1.5
        # More recent messages are more relevant
        recency_bonus = msg.round_num / max(m.round_num for m in message_history)
        score += recency_bonus
        # High influence personas are worth responding to
        score += 0.5  # base
        scored.append((score, msg))

    # Sort by score descending, take top quotes
    scored.sort(key=lambda x: x[0], reverse=True)

    # Ensure diversity: pick at most one message per persona from the top
    seen_personas: set[str] = set()
    selected: list[SimulationMessage] = []
    for _score, msg in scored:
        if msg.persona_name not in seen_personas:
            selected.append(msg)
            seen_personas.add(msg.persona_name)
        if len(selected) >= max_quotes:
            break

    # Format the context with numbered quotes
    lines: list[str] = []
    suggest_names: list[str] = []
    for i, msg in enumerate(selected, 1):
        lines.append(
            f'  Quote {i} - {msg.persona_name} ({msg.archetype}, round {msg.round_num}): '
            f'"{msg.content}"'
        )
        suggest_names.append(msg.persona_name)

    context = "\n".join(lines)
    return context, suggest_names


async def run_simulation(
    startup_idea: str,
    strategy_summary: str,
    personas: list[MarketPersona],
    num_rounds: int = 3,
    client: AsyncOpenAI | None = None,
    prior_messages: list[SimulationMessage] | None = None,
    progress_callback: SimulationProgressCallback | None = None,
) -> SimulationResult:
    """Run a turn-based social simulation.

    Each round:
    1. Each persona reacts to the startup pitch + previous messages
    2. Personas can reference and respond to each other
    3. Stances evolve based on the conversation

    Args:
        prior_messages: Messages from previous rounds (used by hybrid engine
            to maintain context across single-round calls).

    Uses gpt-4o-mini for cost control.
    """
    if client is None:
        client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

    all_rounds: list[SimulationRound] = []
    message_history: list[SimulationMessage] = list(prior_messages or [])
    current_stances: dict[str, str] = {p.name: p.initial_stance for p in personas}

    await _emit_progress(
        progress_callback,
        "simulation_start",
        {
            "startup_idea": startup_idea,
            "rounds": num_rounds,
            "total_llm_agents": len(personas),
            "total_agents": len(personas),
        },
    )

    for round_num in range(1, num_rounds + 1):
        round_messages: list[SimulationMessage] = []

        # Each persona takes a turn
        for persona in personas:
            msg = await _persona_turn(
                client=client,
                persona=persona,
                startup_idea=startup_idea,
                strategy_summary=strategy_summary,
                round_num=round_num,
                message_history=message_history,
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

            await _emit_progress(
                progress_callback,
                "persona_post",
                _message_to_stream_payload(
                    persona=persona,
                    message=msg,
                    stance=current_stances.get(persona.name, persona.initial_stance),
                ),
            )

        avg_sentiment = sum(m.sentiment for m in round_messages) / max(len(round_messages), 1)
        sentiment_by_archetype = _round_sentiment_by_archetype(round_messages)

        all_rounds.append(SimulationRound(
            round_num=round_num,
            messages=round_messages,
            avg_sentiment=avg_sentiment,
        ))

        await _emit_progress(
            progress_callback,
            "simulation_round",
            {
                "round_number": round_num,
                "avg_sentiment": avg_sentiment,
                "sentiment_by_archetype": sentiment_by_archetype,
                "posts": [
                    {
                        "persona": message.persona_name,
                        "archetype": message.archetype,
                        "content": message.content,
                        "sentiment": message.sentiment,
                        "references": list(message.references),
                        "stance_change": message.stance_change,
                    }
                    for message in round_messages
                ],
            },
        )

    result = SimulationResult(
        rounds=all_rounds,
        final_stances=current_stances,
        total_messages=len(message_history),
    )

    await _emit_progress(
        progress_callback,
        "simulation_complete",
        {
            "rounds": len(result.rounds),
            "total_messages": result.total_messages,
            "final_stances": dict(result.final_stances),
        },
    )

    return result


async def _persona_turn(
    client: AsyncOpenAI,
    persona: MarketPersona,
    startup_idea: str,
    strategy_summary: str,
    round_num: int,
    message_history: list[SimulationMessage],
    current_stance: str,
    other_personas: list[str],
) -> SimulationMessage:
    """Generate one persona's response in a simulation round."""

    # Build reference context with specific quotes to react to
    ref_context, suggested_refs = _build_reference_context(
        persona=persona,
        message_history=message_history,
        other_personas=other_personas,
    )

    # Build full conversation history (last 15 messages for broader context)
    history_text = ""
    if message_history:
        recent = message_history[-15:]
        history_text = "\n".join(
            f"[Round {m.round_num}] {m.persona_name} ({m.archetype}): {m.content}"
            for m in recent
        )

    has_prior = bool(message_history)

    # Build the reference instruction section
    if has_prior and ref_context:
        reference_section = f"""
KEY QUOTES YOU SHOULD RESPOND TO:
{ref_context}

CRITICAL INSTRUCTION: You MUST reference at least one of the people quoted above BY NAME in your response.
For example: "I agree with {suggested_refs[0]}'s point about..." or "Unlike {suggested_refs[0]}, I think..."
Pick the quote you have the strongest reaction to (agreement OR disagreement) and respond to it directly.
The "references" field in your JSON MUST contain at least one name from: {', '.join(suggested_refs)}"""
    else:
        reference_section = """
This is the opening round. Share your initial reaction to the startup pitch.
Other participants will respond to your take in later rounds."""

    prompt = f"""You are simulating a market stakeholder in a multi-round discussion about a startup.

YOUR PERSONA:
- Name: {persona.name}
- Role: {persona.archetype}
- Background: {persona.background}
- Priorities: {', '.join(persona.priorities)}
- Risk tolerance: {persona.risk_tolerance}
- Current stance on this startup: {current_stance}

THE STARTUP:
{startup_idea}

STRATEGY:
{strategy_summary}

FULL DISCUSSION SO FAR:
{history_text or "(Opening round - no prior discussion)"}
{reference_section}

OTHER PARTICIPANTS: {', '.join(other_personas[:8])}

Instructions:
- Stay in character as {persona.name}, a {persona.archetype}
- Your response MUST reflect your priorities ({', '.join(persona.priorities[:3])}) and risk tolerance ({persona.risk_tolerance})
- {"IMPORTANT: Directly respond to at least one specific quote above. Use their name." if has_prior else "Give your honest first impression."}
- If someone made a compelling point that challenges your view, consider shifting your stance
- Be specific and substantive, not generic

Respond in JSON:
{{
  "content": "Your 2-3 sentence response in character. {'Reference at least one other person by name.' if has_prior else ''}",
  "sentiment": <float from -1.0 (very negative) to 1.0 (very positive)>,
  "references": [{"list names of people you directly respond to - MUST have at least 1 name" if has_prior else "empty for round 1"}],
  "stance_change": "more_positive" or "more_negative" or "none"
}}"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a realistic market simulation agent. You always respond with valid JSON. When other participants have spoken, you ALWAYS reference at least one by name in your response and include their name in the references array."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.9,
            max_tokens=400,
        )

        content = response.choices[0].message.content or "{}"
        data = json.loads(content.strip().removeprefix("```json").removesuffix("```").strip())

        raw_references = data.get("references", [])
        # Validate references: only keep names that are actual other personas
        valid_references = [r for r in raw_references if r in other_personas]

        # If we have prior messages but no valid references, try to extract
        # names mentioned in the content text
        if has_prior and not valid_references:
            msg_content = data.get("content", "")
            for name in suggested_refs:
                if name in msg_content:
                    valid_references.append(name)
            # If still empty, pick the most relevant suggested ref
            if not valid_references and suggested_refs:
                valid_references = [suggested_refs[0]]

        return SimulationMessage(
            round_num=round_num,
            persona_name=persona.name,
            archetype=persona.archetype,
            content=data.get("content", "No comment."),
            sentiment=max(-1.0, min(1.0, float(data.get("sentiment", 0.0)))),
            references=valid_references,
            stance_change=data.get("stance_change", "none"),
        )
    except Exception:
        # Deterministic fallback -- still include references after round 1
        fallback_sentiments = {"positive": 0.5, "neutral": 0.0, "negative": -0.5, "hostile": -0.8}
        fallback_refs: list[str] = []
        if has_prior and suggested_refs:
            fallback_refs = [suggested_refs[0]]
        ref_name = fallback_refs[0] if fallback_refs else "others"
        return SimulationMessage(
            round_num=round_num,
            persona_name=persona.name,
            archetype=persona.archetype,
            content=f"Responding to {ref_name}'s point -- as a {persona.archetype}, I have concerns about {startup_idea}.",
            sentiment=fallback_sentiments.get(current_stance, 0.0),
            references=fallback_refs,
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
