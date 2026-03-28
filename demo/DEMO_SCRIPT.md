# Ghost Board - 1-Minute Demo Script

## Beat 1: One-Liner Intro (10s)

> "Ghost Board is an autonomous AI executive team. You give it a startup idea, and five AI agents - CEO, CTO, CFO, CMO, and Legal - coordinate to build a full startup package in under 2 minutes. They argue, pivot, and iterate - just like a real founding team."

**Run:**
```bash
python main.py --demo
```

## Beat 2: Legal Blocker with Real Citations (15s)

> "Watch what happens: Legal scans real CFPB and FinCEN regulations using web search. It finds that Anchrix may need money transmitter licenses across all 50 states. It publishes a BLOCKER event with actual regulation citations."

**Show:** `outputs/compliance/report_v1.md` - real citations to 31 CFR 1010, FinCEN MSB registry

## Beat 3: CEO Pivot Event (10s)

> "CEO receives the BLOCKER through the async event bus. It reasons about the blocker and pivots the strategy - shifting from direct fund handling to a pure SaaS monitoring tool. This PIVOT event cascades to CTO, CFO, and CMO simultaneously."

**Show:** The terminal output showing `CEO: Pivoted strategy (3 pivot(s))`

## Beat 4: Prototype Diff (10s)

> "CTO uses the OpenAI Codex API to generate a working prototype. After the pivot, it regenerates the code to match the new strategy. Each version is saved."

**Show:** `outputs/prototype/app.py` and `outputs/prototype/routes.py`

## Beat 5: Market Signal and Second Pivot (10s)

> "Now the outer loop kicks in. Five synthetic stakeholders - VCs, skeptics, journalists, competitors, regulators - react to the startup. The market simulation produces a sentiment score and may recommend another pivot."

**Show:** Terminal output:
```
Sentiment: 0.10
Confidence: 0.75
Pivot recommended: True
```

## Beat 6: Final Bundle + Cost Summary (5s)

> "In under 2 minutes, for 15 cents in API costs, Ghost Board produced everything a consulting engagement would charge $15,000 for: strategy, prototype, financial model, GTM copy, compliance analysis, and a complete decision trace."

**Show:** Terminal output:
```
Events: 35
Pivots: 3
API cost: $0.1527
Human equivalent: ~$15,000
Savings: 98232x cheaper
```

---

## Quick Demo Commands

```bash
# Full demo with Anchrix concept
python main.py --demo

# Custom startup idea
python main.py "AI tutor for K-12 math education"

# Non-fintech scenario
python main.py "$(cat demo/saas_concept.txt)"

# Quick build-only (skip simulation)
python main.py --demo --skip-simulation
```
