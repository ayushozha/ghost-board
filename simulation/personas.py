"""Market persona generator for social simulation."""

from __future__ import annotations

import json
import os
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field


class GeoLocation(BaseModel):
    """Geographic location for persona."""
    city: str = ""
    country: str = ""
    lat: float = 0.0
    lng: float = 0.0


class MarketPersona(BaseModel):
    """A synthetic stakeholder for market simulation."""
    name: str
    archetype: str = Field(description="VC, early_adopter, skeptic, journalist, competitor, regulator")
    background: str
    priorities: list[str] = Field(default_factory=list)
    risk_tolerance: float = Field(ge=0.0, le=1.0, default=0.5)
    initial_stance: str = Field(default="neutral", description="positive, neutral, negative, hostile")
    influence_score: float = Field(ge=0.0, le=1.0, default=0.5)
    real_company_reference: str = ""
    geographic_location: GeoLocation = Field(default_factory=GeoLocation)


# Archetype distribution for realistic simulation
ARCHETYPE_DISTRIBUTION = {
    "vc": 2,
    "early_adopter": 3,
    "skeptic": 2,
    "journalist": 1,
    "competitor": 1,
    "regulator": 1,
}


PROFILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "personas", "profiles")


def load_real_personas(profile_file: str = "fintech_personas.json") -> list[MarketPersona]:
    """Load real-company-grounded personas from JSON profiles."""
    path = os.path.join(PROFILES_DIR, profile_file)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    personas = []
    for p in data:
        geo = p.get("geographic_location", {})
        personas.append(MarketPersona(
            name=p["name"],
            archetype=p["archetype"],
            background=p.get("investment_thesis_or_beat", ""),
            priorities=p.get("known_positions", []),
            risk_tolerance=p.get("risk_tolerance", 0.5),
            initial_stance=p.get("initial_stance", "neutral"),
            influence_score=p.get("influence_score", 0.5),
            real_company_reference=p.get("real_company_reference", ""),
            geographic_location=GeoLocation(
                city=geo.get("city", ""),
                country=geo.get("country", ""),
                lat=geo.get("lat", 0.0),
                lng=geo.get("lng", 0.0),
            ),
        ))
    return personas


async def generate_personas(
    startup_idea: str,
    target_market: str,
    num_personas: int = 10,
    client: AsyncOpenAI | None = None,
) -> list[MarketPersona]:
    """Generate a diverse set of market personas.

    First loads real-company-grounded personas from profiles/,
    then fills remaining slots with LLM-generated personas.
    """
    # Start with real profiles
    real_personas = load_real_personas()
    if real_personas and len(real_personas) >= num_personas:
        return real_personas[:num_personas]

    if client is None:
        client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

    # Calculate how many of each archetype
    total_weight = sum(ARCHETYPE_DISTRIBUTION.values())
    archetype_counts: dict[str, int] = {}
    allocated = 0
    for arch, weight in ARCHETYPE_DISTRIBUTION.items():
        count = max(1, round(num_personas * weight / total_weight))
        archetype_counts[arch] = count
        allocated += count

    # Adjust if we over/under-allocated
    diff = num_personas - allocated
    if diff > 0:
        archetype_counts["early_adopter"] += diff
    elif diff < 0:
        for arch in ["early_adopter", "skeptic", "vc"]:
            if archetype_counts[arch] > 1:
                reduce = min(-diff, archetype_counts[arch] - 1)
                archetype_counts[arch] -= reduce
                diff += reduce
                if diff >= 0:
                    break

    prompt = f"""Generate {num_personas} synthetic market personas for testing a startup:

Startup: {startup_idea}
Target market: {target_market}

Create a JSON array of personas with this archetype distribution:
{json.dumps(archetype_counts)}

Each persona needs:
- name: realistic full name
- archetype: one of {list(ARCHETYPE_DISTRIBUTION.keys())}
- background: 1-2 sentence professional background
- priorities: list of 2-3 things they care about
- risk_tolerance: 0.0-1.0 (VCs ~0.7, skeptics ~0.2, regulators ~0.1)
- initial_stance: positive/neutral/negative/hostile
- influence_score: 0.0-1.0 (how much they influence others)

Make them realistic and diverse. VCs should evaluate ROI, skeptics should poke holes,
journalists should ask hard questions, competitors should challenge differentiation.

Respond with ONLY a JSON array."""

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Generate realistic market personas. Respond with only a valid JSON array."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.8,
        max_tokens=4096,
    )

    content = response.choices[0].message.content or "[]"
    try:
        data = json.loads(content.strip().removeprefix("```json").removesuffix("```").strip())
        if not isinstance(data, list):
            data = [data]
        return [MarketPersona(**p) for p in data[:num_personas]]
    except (json.JSONDecodeError, Exception):
        # Fallback: generate deterministic personas
        return _fallback_personas(startup_idea, num_personas)


def _fallback_personas(startup_idea: str, num_personas: int) -> list[MarketPersona]:
    """Generate fallback personas without LLM."""
    templates = [
        MarketPersona(name="Alex Chen", archetype="vc", background="Partner at Sequoia, focus on B2B SaaS", priorities=["ROI", "market size", "team"], risk_tolerance=0.7, initial_stance="neutral", influence_score=0.9),
        MarketPersona(name="Sarah Miller", archetype="early_adopter", background="CTO at mid-size fintech", priorities=["automation", "compliance", "cost savings"], risk_tolerance=0.6, initial_stance="positive", influence_score=0.5),
        MarketPersona(name="David Park", archetype="skeptic", background="15-year compliance veteran", priorities=["accuracy", "liability", "regulation"], risk_tolerance=0.2, initial_stance="negative", influence_score=0.6),
        MarketPersona(name="Maria Garcia", archetype="journalist", background="TechCrunch reporter covering fintech", priorities=["story angle", "impact", "controversy"], risk_tolerance=0.4, initial_stance="neutral", influence_score=0.8),
        MarketPersona(name="James Wilson", archetype="competitor", background="CEO of established compliance firm", priorities=["market share", "differentiation", "pricing"], risk_tolerance=0.3, initial_stance="hostile", influence_score=0.7),
        MarketPersona(name="Linda Thompson", archetype="regulator", background="Former CFPB examiner", priorities=["consumer protection", "transparency", "auditability"], risk_tolerance=0.1, initial_stance="negative", influence_score=0.9),
        MarketPersona(name="Ryan Kim", archetype="early_adopter", background="Head of ops at neobank", priorities=["speed", "integration", "support"], risk_tolerance=0.5, initial_stance="positive", influence_score=0.4),
        MarketPersona(name="Emily Davis", archetype="vc", background="Angel investor, ex-Stripe", priorities=["unit economics", "moat", "scalability"], risk_tolerance=0.8, initial_stance="neutral", influence_score=0.7),
        MarketPersona(name="Tom Baker", archetype="skeptic", background="Risk manager at major bank", priorities=["security", "audit trail", "regulatory risk"], risk_tolerance=0.15, initial_stance="negative", influence_score=0.5),
        MarketPersona(name="Nina Patel", archetype="early_adopter", background="Compliance officer at startup bank", priorities=["ease of use", "cost", "reliability"], risk_tolerance=0.5, initial_stance="positive", influence_score=0.3),
    ]
    return templates[:num_personas]
