"""Market persona generator for social simulation."""

from __future__ import annotations

import json
import os

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


# Geographic locations for diverse global distribution
GEO_LOCATIONS = [
    GeoLocation(city="San Francisco", country="US", lat=37.77, lng=-122.42),
    GeoLocation(city="New York", country="US", lat=40.71, lng=-74.01),
    GeoLocation(city="Miami", country="US", lat=25.76, lng=-80.19),
    GeoLocation(city="Austin", country="US", lat=30.27, lng=-97.74),
    GeoLocation(city="Boston", country="US", lat=42.36, lng=-71.06),
    GeoLocation(city="London", country="UK", lat=51.51, lng=-0.13),
    GeoLocation(city="Berlin", country="Germany", lat=52.52, lng=13.41),
    GeoLocation(city="Zurich", country="Switzerland", lat=47.38, lng=8.54),
    GeoLocation(city="Singapore", country="Singapore", lat=1.35, lng=103.82),
    GeoLocation(city="Tokyo", country="Japan", lat=35.68, lng=139.69),
    GeoLocation(city="Mumbai", country="India", lat=19.08, lng=72.88),
    GeoLocation(city="Dubai", country="UAE", lat=25.20, lng=55.27),
]


def _assign_geo_locations(personas: list[MarketPersona]) -> list[MarketPersona]:
    """Assign real geographic locations to personas that lack them (lat=0, lng=0)."""
    for i, p in enumerate(personas):
        geo = p.geographic_location
        if geo.lat == 0.0 and geo.lng == 0.0:
            loc = GEO_LOCATIONS[i % len(GEO_LOCATIONS)]
            p.geographic_location = GeoLocation(
                city=loc.city, country=loc.country, lat=loc.lat, lng=loc.lng,
            )
    return personas


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

    geo_examples = [{"city": g.city, "country": g.country, "lat": g.lat, "lng": g.lng} for g in GEO_LOCATIONS]

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
- geographic_location: an object with city, country, lat, lng. Distribute personas globally across cities like: {json.dumps(geo_examples[:6])}

Make them realistic and diverse. VCs should evaluate ROI, skeptics should poke holes,
journalists should ask hard questions, competitors should challenge differentiation.
Distribute them geographically across US, Europe, and Asia.

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
        personas = []
        for p in data[:num_personas]:
            # Parse geographic_location if provided by LLM
            geo_raw = p.pop("geographic_location", None)
            if geo_raw and isinstance(geo_raw, dict):
                p["geographic_location"] = GeoLocation(
                    city=geo_raw.get("city", ""),
                    country=geo_raw.get("country", ""),
                    lat=float(geo_raw.get("lat", 0.0)),
                    lng=float(geo_raw.get("lng", 0.0)),
                )
            personas.append(MarketPersona(**p))
        # Ensure all personas have real geo coordinates
        return _assign_geo_locations(personas)
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
