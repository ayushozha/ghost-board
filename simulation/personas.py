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
    archetype: str = Field(description="VC, early_adopter, skeptic, journalist, competitor, regulator, influencer, enterprise_buyer")
    background: str
    priorities: list[str] = Field(default_factory=list)
    risk_tolerance: float = Field(ge=0.0, le=1.0, default=0.5)
    initial_stance: str = Field(default="neutral", description="positive, neutral, negative, hostile")
    influence_score: float = Field(ge=0.0, le=1.0, default=0.5)
    real_company_reference: str = ""
    geographic_location: GeoLocation = Field(default_factory=GeoLocation)


# Archetype distribution for realistic simulation.
# Total weight = 13 (original) + 3 new at ~1 each = 16.
# New archetypes each get ~6-8% of total personas.
ARCHETYPE_DISTRIBUTION = {
    "vc": 2,
    "early_adopter": 3,
    "skeptic": 2,
    "journalist": 1,
    "competitor": 1,
    "regulator": 1,
    "influencer": 1,
    "enterprise_buyer": 1,
}

# LLM system-prompt tone for each archetype (used when generating persona posts).
ARCHETYPE_LLM_TONES: dict[str, str] = {
    "vc": (
        "You are a venture capitalist evaluating a startup. You ask sharp questions about "
        "market size, unit economics, defensibility, and team. You use measured language and "
        "think in terms of portfolio risk and return multiples."
    ),
    "early_adopter": (
        "You are an early adopter and tech enthusiast. You get excited about new products, "
        "try things before others, and share your hands-on impressions. You focus on whether "
        "it solves a real pain point and how quickly you can get started."
    ),
    "skeptic": (
        "You are a seasoned industry skeptic. You have seen many hype cycles and are quick to "
        "poke holes in bold claims. You ask hard questions about execution, moat, and whether "
        "the problem is real. You are not hostile—just rigorous."
    ),
    "journalist": (
        "You are a technology journalist. You look for the story angle: who wins, who loses, "
        "what is the broader implication. You ask provocative questions and frame things in "
        "terms of industry impact and public interest."
    ),
    "competitor": (
        "You are an executive at a competing company. You assess threats to your market share, "
        "challenge differentiation claims, and look for weaknesses to exploit. You may "
        "downplay the startup's advantages while quietly taking notes."
    ),
    "regulator": (
        "You are a financial regulator. You cite specific regulations, ask about compliance "
        "certifications, and flag legal risks. You do NOT get excited about innovation—you "
        "assess risk. You reference real regulatory frameworks (CFPB, FinCEN, SEC, MiCA, FCA) "
        "and ask whether proper licensing and disclosures are in place."
    ),
    "influencer": (
        "You are a tech influencer with 500K followers. You react emotionally, use exclamation "
        "marks and emojis, and focus on whether something is 'hot' or 'dead'. Your opinions "
        "spread fast. You are trend-driven and impulsive—you form a take quickly and share it "
        "loudly, and your followers amplify it."
    ),
    "enterprise_buyer": (
        "You are a VP of Engineering at a Fortune 500 company. You ask about API docs, SLAs, "
        "security certifications (SOC 2, ISO 27001), and TCO. You are skeptical but open if "
        "the ROI is clear and the integration story is solid. You never commit quickly and "
        "always require a formal evaluation process."
    ),
}

# Opinion weight multiplier for lightweight agent stance aggregation.
# influencer opinions are amplified 3x because of their large follower reach.
ARCHETYPE_INFLUENCE_MULTIPLIERS: dict[str, float] = {
    "vc": 1.0,
    "early_adopter": 1.0,
    "skeptic": 1.0,
    "journalist": 1.5,
    "competitor": 1.0,
    "regulator": 1.0,
    "influencer": 3.0,
    "enterprise_buyer": 1.0,
}

# Lightweight agent stance bias: (initial_bias, variance).
# Used by the hybrid engine when spawning non-LLM agents.
# Stance is a float in [-1.0, 1.0]; bias is the starting offset, variance controls spread.
ARCHETYPE_STANCE_BIAS: dict[str, tuple[float, float]] = {
    "vc": (0.1, 0.3),
    "early_adopter": (0.3, 0.25),
    "skeptic": (-0.2, 0.2),
    "journalist": (0.0, 0.35),
    "competitor": (-0.3, 0.2),
    "regulator": (-0.3, 0.4),    # starts skeptical, high variance (can be convinced by compliance)
    "influencer": (0.0, 0.5),    # neutral start, very high variance (mood-driven)
    "enterprise_buyer": (-0.2, 0.1),  # starts skeptical, low variance (methodical)
}


# Comprehensive geographic distribution across 25+ cities and 20+ countries
GEOGRAPHIC_DISTRIBUTION = [
    GeoLocation(city="San Francisco", country="US", lat=37.77, lng=-122.42),
    GeoLocation(city="New York", country="US", lat=40.71, lng=-74.01),
    GeoLocation(city="Austin", country="US", lat=30.27, lng=-97.74),
    GeoLocation(city="Chicago", country="US", lat=41.88, lng=-87.63),
    GeoLocation(city="Miami", country="US", lat=25.76, lng=-80.19),
    GeoLocation(city="Boston", country="US", lat=42.36, lng=-71.06),
    GeoLocation(city="London", country="UK", lat=51.51, lng=-0.13),
    GeoLocation(city="Paris", country="France", lat=48.86, lng=2.35),
    GeoLocation(city="Berlin", country="Germany", lat=52.52, lng=13.41),
    GeoLocation(city="Amsterdam", country="Netherlands", lat=52.37, lng=4.90),
    GeoLocation(city="Stockholm", country="Sweden", lat=59.33, lng=18.07),
    GeoLocation(city="Tel Aviv", country="Israel", lat=32.08, lng=34.78),
    GeoLocation(city="Dubai", country="UAE", lat=25.20, lng=55.27),
    GeoLocation(city="Riyadh", country="Saudi Arabia", lat=24.69, lng=46.72),
    GeoLocation(city="Istanbul", country="Turkey", lat=41.01, lng=28.95),
    GeoLocation(city="Cairo", country="Egypt", lat=30.04, lng=31.24),
    GeoLocation(city="Nairobi", country="Kenya", lat=-1.29, lng=36.82),
    GeoLocation(city="Lagos", country="Nigeria", lat=6.52, lng=3.38),
    GeoLocation(city="Cape Town", country="South Africa", lat=-33.93, lng=18.42),
    GeoLocation(city="Mumbai", country="India", lat=19.08, lng=72.88),
    GeoLocation(city="Bangalore", country="India", lat=12.97, lng=77.59),
    GeoLocation(city="Singapore", country="Singapore", lat=1.35, lng=103.82),
    GeoLocation(city="Tokyo", country="Japan", lat=35.68, lng=139.69),
    GeoLocation(city="Seoul", country="South Korea", lat=37.57, lng=126.98),
    GeoLocation(city="Jakarta", country="Indonesia", lat=-6.21, lng=106.85),
    GeoLocation(city="Manila", country="Philippines", lat=14.60, lng=120.98),
    GeoLocation(city="Sydney", country="Australia", lat=-33.87, lng=151.21),
    GeoLocation(city="São Paulo", country="Brazil", lat=-23.55, lng=-46.63),
    GeoLocation(city="Buenos Aires", country="Argentina", lat=-34.60, lng=-58.38),
    GeoLocation(city="Mexico City", country="Mexico", lat=19.43, lng=-99.13),
    GeoLocation(city="Toronto", country="Canada", lat=43.65, lng=-79.38),
    # Additional cities for new archetypes
    GeoLocation(city="Washington DC", country="US", lat=38.91, lng=-77.04),
    GeoLocation(city="Brussels", country="Belgium", lat=50.85, lng=4.35),
    GeoLocation(city="Geneva", country="Switzerland", lat=46.20, lng=6.15),
    GeoLocation(city="Frankfurt", country="Germany", lat=50.11, lng=8.68),
    GeoLocation(city="Los Angeles", country="US", lat=34.05, lng=-118.24),
]

# Backward-compatible alias
GEO_LOCATIONS = GEOGRAPHIC_DISTRIBUTION

# Archetype -> preferred city pool for weighted geo assignment
ARCHETYPE_GEO_WEIGHTS: dict[str, list[str]] = {
    "vc": ["San Francisco", "New York", "London", "Boston", "Tel Aviv", "Singapore", "Berlin"],
    "early_adopter": ["San Francisco", "Berlin", "Seoul", "Austin", "Singapore", "Tel Aviv", "Amsterdam"],
    "skeptic": ["New York", "London", "Chicago", "Toronto", "Sydney", "Frankfurt"],
    "journalist": ["New York", "London", "Tokyo", "Paris", "Berlin", "São Paulo"],
    "competitor": ["San Francisco", "New York", "London", "Singapore", "Tokyo", "Berlin"],
    "regulator": ["Washington DC", "Brussels", "Geneva", "Singapore", "Frankfurt", "New York"],
    "influencer": ["Los Angeles", "New York", "London", "Tokyo", "Seoul"],
    "enterprise_buyer": ["New York", "Chicago", "London", "Frankfurt", "Tokyo"],
}

# Map city name -> GeoLocation for fast lookup
_CITY_MAP: dict[str, GeoLocation] = {g.city: g for g in GEOGRAPHIC_DISTRIBUTION}


def _geo_for_archetype(archetype: str, index: int) -> GeoLocation:
    """Return a GeoLocation for an archetype, cycling through its preferred cities."""
    preferred = ARCHETYPE_GEO_WEIGHTS.get(archetype.lower(), [])
    # Filter to cities that exist in our distribution
    available = [c for c in preferred if c in _CITY_MAP]
    if available:
        city_name = available[index % len(available)]
        return _CITY_MAP[city_name]
    # Fall back to round-robin across all cities
    return GEOGRAPHIC_DISTRIBUTION[index % len(GEOGRAPHIC_DISTRIBUTION)]


def _assign_geo_locations(personas: list[MarketPersona]) -> list[MarketPersona]:
    """Assign real geographic locations to personas that lack them (lat=0, lng=0).

    Uses archetype-weighted assignment so VCs cluster in SF/NY/London,
    journalists in NY/London/Tokyo, etc., reflecting real-world distributions.
    """
    archetype_counters: dict[str, int] = {}
    for p in personas:
        geo = p.geographic_location
        if geo.lat == 0.0 and geo.lng == 0.0:
            arch = p.archetype.lower()
            idx = archetype_counters.get(arch, 0)
            archetype_counters[arch] = idx + 1
            loc = _geo_for_archetype(arch, idx)
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

    geo_examples = [
        {"city": g.city, "country": g.country, "lat": g.lat, "lng": g.lng}
        for g in GEOGRAPHIC_DISTRIBUTION
    ]

    prompt = f"""Generate {num_personas} synthetic market personas for testing a startup:

Startup: {startup_idea}
Target market: {target_market}

Create a JSON array of personas with this archetype distribution:
{json.dumps(archetype_counts)}

Each persona needs:
- name: realistic full name matching their country of origin
- archetype: one of {list(ARCHETYPE_DISTRIBUTION.keys())}
- background: 1-2 sentence professional background
- priorities: list of 2-3 things they care about
- risk_tolerance: 0.0-1.0 (VCs ~0.7, skeptics ~0.2, regulators ~0.1, enterprise_buyer ~0.3, influencer ~0.6)
- initial_stance: positive/neutral/negative/hostile
- influence_score: 0.0-1.0 (how much they influence others; influencers should be 0.9-1.0)
- geographic_location: an object with city, country, lat, lng chosen from this global list: {json.dumps(geo_examples)}

Archetype descriptions and behaviors:
- vc: evaluates ROI, market size, team quality. Measured language. Prefers SF, NY, London, Tel Aviv, Singapore, Berlin.
- early_adopter: excited about new tech, hands-on, focused on pain-point fit. Prefers SF, Berlin, Seoul, Austin, Singapore.
- journalist: looks for story angles, provocative questions, industry impact. Prefers NY, London, Tokyo, Paris, São Paulo.
- skeptic: pokes holes in bold claims, questions execution and moat. Prefers NY, London, Chicago, Sydney.
- competitor: challenges differentiation, assesses market share threat. Prefers SF, NY, London, Tokyo, Singapore.
- regulator: cites specific regulations (CFPB, FinCEN, SEC, MiCA, FCA), flags legal risks, does NOT celebrate innovation. Prefers Washington DC, Brussels, Geneva, Singapore, Frankfurt.
- influencer: reacts emotionally with exclamation marks and emojis, trend-driven, 500K+ followers, opinions spread fast, very high influence_score. Prefers Los Angeles, New York, London, Tokyo, Seoul.
- enterprise_buyer: VP of Engineering at Fortune 500, asks about API docs, SLAs, SOC 2, TCO, never commits quickly. Prefers NY, Chicago, London, Frankfurt, Tokyo.

Make them realistic, diverse, and globally distributed across 5+ continents.

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
        MarketPersona(name="Alex Chen", archetype="vc", background="Partner at Sequoia, focus on B2B SaaS", priorities=["ROI", "market size", "team"], risk_tolerance=0.7, initial_stance="neutral", influence_score=0.9, geographic_location=GeoLocation(city="San Francisco", country="US", lat=37.77, lng=-122.42)),
        MarketPersona(name="Sarah Miller", archetype="early_adopter", background="CTO at mid-size fintech", priorities=["automation", "compliance", "cost savings"], risk_tolerance=0.6, initial_stance="positive", influence_score=0.5, geographic_location=GeoLocation(city="Austin", country="US", lat=30.27, lng=-97.74)),
        MarketPersona(name="David Park", archetype="skeptic", background="15-year compliance veteran", priorities=["accuracy", "liability", "regulation"], risk_tolerance=0.2, initial_stance="negative", influence_score=0.6, geographic_location=GeoLocation(city="New York", country="US", lat=40.71, lng=-74.01)),
        MarketPersona(name="Maria Garcia", archetype="journalist", background="TechCrunch reporter covering fintech", priorities=["story angle", "impact", "controversy"], risk_tolerance=0.4, initial_stance="neutral", influence_score=0.8, geographic_location=GeoLocation(city="London", country="UK", lat=51.51, lng=-0.13)),
        MarketPersona(name="James Wilson", archetype="competitor", background="CEO of established compliance firm", priorities=["market share", "differentiation", "pricing"], risk_tolerance=0.3, initial_stance="hostile", influence_score=0.7, geographic_location=GeoLocation(city="Boston", country="US", lat=42.36, lng=-71.06)),
        MarketPersona(name="Linda Thompson", archetype="regulator", background="Former CFPB examiner", priorities=["consumer protection", "transparency", "auditability"], risk_tolerance=0.1, initial_stance="negative", influence_score=0.9, geographic_location=GeoLocation(city="Miami", country="US", lat=25.76, lng=-80.19)),
        MarketPersona(name="Ryan Kim", archetype="early_adopter", background="Head of ops at neobank", priorities=["speed", "integration", "support"], risk_tolerance=0.5, initial_stance="positive", influence_score=0.4, geographic_location=GeoLocation(city="Singapore", country="Singapore", lat=1.35, lng=103.82)),
        MarketPersona(name="Emily Davis", archetype="vc", background="Angel investor, ex-Stripe", priorities=["unit economics", "moat", "scalability"], risk_tolerance=0.8, initial_stance="neutral", influence_score=0.7, geographic_location=GeoLocation(city="Berlin", country="Germany", lat=52.52, lng=13.41)),
        MarketPersona(name="Tom Baker", archetype="skeptic", background="Risk manager at major bank", priorities=["security", "audit trail", "regulatory risk"], risk_tolerance=0.15, initial_stance="negative", influence_score=0.5, geographic_location=GeoLocation(city="Tokyo", country="Japan", lat=35.68, lng=139.69)),
        MarketPersona(name="Nina Patel", archetype="early_adopter", background="Compliance officer at startup bank", priorities=["ease of use", "cost", "reliability"], risk_tolerance=0.5, initial_stance="positive", influence_score=0.3, geographic_location=GeoLocation(city="Mumbai", country="India", lat=19.08, lng=72.88)),
        MarketPersona(name="Commissioner Henri Dubois", archetype="regulator", background="EU financial regulator at ESMA, specialist in MiCA and stablecoin frameworks", priorities=["consumer protection", "AML compliance", "MiCA certification"], risk_tolerance=0.1, initial_stance="negative", influence_score=0.9, geographic_location=GeoLocation(city="Brussels", country="Belgium", lat=50.85, lng=4.35)),
        MarketPersona(name="Zoe Tanaka", archetype="influencer", background="Tech influencer with 800K Twitter/X followers, known for fintech and crypto takes", priorities=["virality", "audience growth", "trend relevance"], risk_tolerance=0.6, initial_stance="neutral", influence_score=1.0, geographic_location=GeoLocation(city="Los Angeles", country="US", lat=34.05, lng=-118.24)),
        MarketPersona(name="Robert Harrington", archetype="enterprise_buyer", background="VP of Engineering at a Fortune 100 financial services firm", priorities=["API reliability", "SOC 2 compliance", "total cost of ownership"], risk_tolerance=0.3, initial_stance="neutral", influence_score=0.6, geographic_location=GeoLocation(city="New York", country="US", lat=40.71, lng=-74.01)),
    ]
    return templates[:num_personas]
