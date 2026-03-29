"""CFO Agent: Financial model generation with pivot support.

Produces comprehensive financial models including:
- 12-month P&L projection with monthly detail
- Unit economics (CAC, LTV, LTV/CAC, payback, gross margin per customer)
- 3 scenarios (optimistic, base, pessimistic)
- Sensitivity analysis on pricing and CAC
- Runway calculation with break-even month
- Key metrics dashboard (MRR, ARR, customer count, churn, NRR)
"""

from __future__ import annotations

import json
import os
from typing import Any

from coordination.events import (
    AgentEvent,
    EventType,
    FinancialModelPayload,
    PivotPayload,
    StrategyPayload,
)
from coordination.state import StateBus
from coordination.trace import TraceLogger

from agents.base import BaseAgent

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

_FINANCIAL_MODEL_PROMPT = """\
You are an expert startup CFO preparing a financial model for a seed-stage startup.

**Startup details**
- Idea: {startup_idea}
- Target market: {target_market}
- Business model: {business_model}
- Key differentiators: {differentiators}

Produce a COMPLETE financial model as a single JSON object with **exactly** the structure below. Every numeric field must contain a plausible, non-zero number that reflects real seed-stage startup economics. Revenue should start small in month 1 and grow month-over-month. Costs should reflect a lean team that grows over 36 months.

```json
{{
  "company_name": "<name>",
  "model_date": "<YYYY-MM-DD>",

  "key_metrics": {{
    "mrr_current": <number, monthly recurring revenue end of month 12>,
    "arr_current": <number, mrr_current * 12>,
    "total_customers": <number, end of month 12>,
    "churn_rate_monthly": <number, percentage e.g. 3.5>,
    "net_revenue_retention": <number, percentage e.g. 110>,
    "avg_contract_value": <number, annual $ per customer>,
    "avg_revenue_per_user": <number, monthly $ per user>
  }},

  "unit_economics": {{
    "cac": <number, customer acquisition cost $>,
    "ltv": <number, lifetime value $>,
    "ltv_cac_ratio": <number, e.g. 4.2>,
    "payback_period_months": <number>,
    "gross_margin_per_customer": <number, $ per customer per month>,
    "gross_margin_pct": <number, percentage>
  }},

  "monthly_pnl": [
    {{
      "month": 1,
      "revenue": <number>,
      "cogs": <number>,
      "gross_profit": <number>,
      "gross_margin_pct": <number>,
      "engineering": <number>,
      "sales_marketing": <number>,
      "general_admin": <number>,
      "total_opex": <number>,
      "ebitda": <number>,
      "net_income": <number>,
      "customers": <number>,
      "new_customers": <number>,
      "churned_customers": <number>,
      "mrr": <number>
    }},
    ... (all 36 months)
  ],

  "scenarios": {{
    "bull": {{
      "label": "Bull Case (1.5x growth)",
      "growth_multiplier": 1.5,
      "monthly_revenue": [<36 numbers, monthly revenue values for bull scenario>],
      "monthly_costs": [<36 numbers, total monthly costs for bull scenario>],
      "cumulative_profit": [<36 numbers, running cumulative profit/loss for bull scenario>],
      "monthly_revenue_growth_pct": <number, e.g. 22>,
      "year1_revenue": <number>,
      "year3_revenue": <number>,
      "year1_customers": <number>,
      "year1_burn": <number>,
      "year1_net_income": <number>,
      "break_even_month": <number or null>,
      "assumptions": ["<list of 3-4 key assumptions>"]
    }},
    "base": {{
      "label": "Base Case (1x growth)",
      "growth_multiplier": 1.0,
      "monthly_revenue": [<36 numbers, monthly revenue values for base scenario>],
      "monthly_costs": [<36 numbers, total monthly costs for base scenario>],
      "cumulative_profit": [<36 numbers, running cumulative profit/loss for base scenario>],
      "monthly_revenue_growth_pct": <number, e.g. 15>,
      "year1_revenue": <number>,
      "year3_revenue": <number>,
      "year1_customers": <number>,
      "year1_burn": <number>,
      "year1_net_income": <number>,
      "break_even_month": <number or null>,
      "assumptions": ["<list of 3-4 key assumptions>"]
    }},
    "bear": {{
      "label": "Bear Case (0.6x growth)",
      "growth_multiplier": 0.6,
      "monthly_revenue": [<36 numbers, monthly revenue values for bear scenario>],
      "monthly_costs": [<36 numbers, total monthly costs for bear scenario>],
      "cumulative_profit": [<36 numbers, running cumulative profit/loss for bear scenario>],
      "monthly_revenue_growth_pct": <number, e.g. 7>,
      "year1_revenue": <number>,
      "year3_revenue": <number>,
      "year1_customers": <number>,
      "year1_burn": <number>,
      "year1_net_income": <number>,
      "break_even_month": <number or null>,
      "assumptions": ["<list of 3-4 key assumptions>"]
    }},
    "optimistic": {{
      "label": "Optimistic (2x growth)",
      "monthly_revenue_growth_pct": <number, e.g. 25>,
      "year1_revenue": <number>,
      "year1_customers": <number>,
      "year1_burn": <number>,
      "year1_net_income": <number>,
      "break_even_month": <number or null>,
      "assumptions": ["<list of 3-4 key assumptions>"]
    }},
    "pessimistic": {{
      "label": "Pessimistic (0.5x growth)",
      "monthly_revenue_growth_pct": <number, e.g. 7>,
      "year1_revenue": <number>,
      "year1_customers": <number>,
      "year1_burn": <number>,
      "year1_net_income": <number>,
      "break_even_month": <number or null>,
      "assumptions": ["<list of 3-4 key assumptions>"]
    }}
  }},

  "sensitivity": {{
    "pricing_plus_20": {{
      "new_ltv": <number>,
      "new_ltv_cac_ratio": <number>,
      "runway_change_months": <number, positive means longer>,
      "break_even_month": <number or null>
    }},
    "pricing_minus_20": {{
      "new_ltv": <number>,
      "new_ltv_cac_ratio": <number>,
      "runway_change_months": <number, negative means shorter>,
      "break_even_month": <number or null>
    }},
    "cac_plus_30": {{
      "new_cac": <number>,
      "new_ltv_cac_ratio": <number>,
      "runway_change_months": <number>,
      "break_even_month": <number or null>
    }},
    "cac_minus_30": {{
      "new_cac": <number>,
      "new_ltv_cac_ratio": <number>,
      "runway_change_months": <number>,
      "break_even_month": <number or null>
    }}
  }},

  "runway": {{
    "monthly_burn_rate": <number, average monthly net cash outflow>,
    "current_cash": <number, assumed seed funding>,
    "runway_months": <number>,
    "break_even_month": <number or null, month where net_income >= 0>,
    "funding_required_series_a": <number, estimated Series A needed>
  }},

  "key_assumptions": ["<list of 5-8 key assumptions>"],
  "risks": ["<list of 4-6 financial risks>"]
}}
```

IMPORTANT RULES:
- monthly_pnl MUST contain exactly 36 entries (months 1 through 36).
- Revenue MUST start small in month 1 (a few hundred to a few thousand dollars) and grow.
- Engineering costs should reflect 2-4 engineers at $8-15k/mo each, scaling to 6-10 by month 36.
- Sales/marketing should be modest early, growing as revenue grows.
- G&A should be minimal: $2-5k/mo for a seed company, growing to $8-15k/mo by year 3.
- COGS should be 15-40% of revenue depending on the business model.
- Gross margin should be 60-85% for a SaaS-type startup.
- CAC should be realistic: $50-500 depending on market.
- LTV/CAC ratio should be between 2x and 6x.
- Churn should be 2-8% monthly for early stage.
- Net revenue retention should be 90-130%.
- Seed funding assumed $500k-$2M.
- All numbers must be internally consistent (gross_profit = revenue - cogs, ebitda = gross_profit - total_opex, etc.).
- For bull/base/bear scenario arrays: monthly_revenue[i] is month i+1 revenue, monthly_costs[i] is total costs, cumulative_profit[i] is running sum of (revenue - costs) through that month.
- bull scenario multiplies base revenue by 1.5 each month; bear multiplies by 0.6.

Respond with ONLY the JSON object, no markdown fences, no explanation."""


# ---------------------------------------------------------------------------
# Realistic fallback data
# ---------------------------------------------------------------------------

def _build_fallback_model() -> dict[str, Any]:
    """Return a plausible fallback model when the LLM call fails."""
    months = []
    customers = 0
    mrr = 0.0
    for m in range(1, 37):
        new = max(2, int(3 * (1.15 ** m)))
        churned = max(0, int(customers * 0.05))
        customers = customers + new - churned
        mrr = customers * 99.0
        revenue = mrr
        cogs = round(revenue * 0.25, 2)
        gross_profit = round(revenue - cogs, 2)
        # Scale team costs over 36 months: starts lean, grows by year 3
        eng_scale = min(m / 12, 1.0)  # ramp over first year, plateau after
        engineering = round(30000 + (m - 1) * 1500 + eng_scale * 20000, 2)
        sales_marketing = round(5000 + m * 1800, 2)
        general_admin = round(3000 + m * 200, 2)
        total_opex = round(engineering + sales_marketing + general_admin, 2)
        ebitda = round(gross_profit - total_opex, 2)
        months.append({
            "month": m,
            "revenue": round(revenue, 2),
            "cogs": cogs,
            "gross_profit": gross_profit,
            "gross_margin_pct": round((gross_profit / revenue * 100) if revenue else 0, 1),
            "engineering": engineering,
            "sales_marketing": sales_marketing,
            "general_admin": general_admin,
            "total_opex": total_opex,
            "ebitda": ebitda,
            "net_income": ebitda,
            "customers": customers,
            "new_customers": new,
            "churned_customers": churned,
            "mrr": round(mrr, 2),
        })

    total_revenue = sum(m["revenue"] for m in months)
    year1_revenue = sum(m["revenue"] for m in months[:12])
    year3_revenue = total_revenue
    total_burn = sum(max(0, -m["net_income"]) for m in months)
    year1_burn = sum(max(0, -m["net_income"]) for m in months[:12])
    last = months[-1]

    # Build 36-month scenario arrays for bull/base/bear
    base_revenues = [m["revenue"] for m in months]
    base_costs = [round(m["cogs"] + m["total_opex"], 2) for m in months]

    def _scenario_arrays(multiplier: float) -> dict[str, Any]:
        revenues = [round(r * multiplier, 2) for r in base_revenues]
        costs = [round(c * (0.85 + 0.15 * multiplier), 2) for c in base_costs]
        cum_profit: list[float] = []
        running = 0.0
        for rev, cost in zip(revenues, costs):
            running += rev - cost
            cum_profit.append(round(running, 2))
        return {
            "monthly_revenue": revenues,
            "monthly_costs": costs,
            "cumulative_profit": cum_profit,
        }

    bull_arrays = _scenario_arrays(1.5)
    base_arrays = _scenario_arrays(1.0)
    bear_arrays = _scenario_arrays(0.6)

    return {
        "company_name": "Startup",
        "model_date": "2026-03-28",
        "key_metrics": {
            "mrr_current": last["mrr"],
            "arr_current": round(last["mrr"] * 12, 2),
            "total_customers": last["customers"],
            "churn_rate_monthly": 5.0,
            "net_revenue_retention": 105.0,
            "avg_contract_value": 1188.0,
            "avg_revenue_per_user": 99.0,
        },
        "unit_economics": {
            "cac": 250.0,
            "ltv": 1980.0,
            "ltv_cac_ratio": 7.9,
            "payback_period_months": 2.5,
            "gross_margin_per_customer": 74.25,
            "gross_margin_pct": 75.0,
        },
        "monthly_pnl": months,
        "scenarios": {
            "bull": {
                "label": "Bull Case (1.5x growth)",
                "growth_multiplier": 1.5,
                **bull_arrays,
                "monthly_revenue_growth_pct": 22,
                "year1_revenue": round(year1_revenue * 1.5, 2),
                "year3_revenue": round(year3_revenue * 1.5, 2),
                "year1_customers": last["customers"] * 2,
                "year1_burn": round(year1_burn * 0.7, 2),
                "year1_net_income": round(year1_revenue * 1.5 - year1_burn * 0.7, 2),
                "break_even_month": 9,
                "assumptions": [
                    "Strong product-market fit from launch",
                    "Viral coefficient > 1.2",
                    "Enterprise upsell adds 40% to ACV",
                ],
            },
            "base": {
                "label": "Base Case (1x growth)",
                "growth_multiplier": 1.0,
                **base_arrays,
                "monthly_revenue_growth_pct": 15,
                "year1_revenue": round(year1_revenue, 2),
                "year3_revenue": round(year3_revenue, 2),
                "year1_customers": last["customers"],
                "year1_burn": round(year1_burn, 2),
                "year1_net_income": round(year1_revenue - year1_burn, 2),
                "break_even_month": 14,
                "assumptions": [
                    "Steady 15% MoM growth",
                    "5% monthly churn",
                    "CAC remains ~$250",
                ],
            },
            "bear": {
                "label": "Bear Case (0.6x growth)",
                "growth_multiplier": 0.6,
                **bear_arrays,
                "monthly_revenue_growth_pct": 7,
                "year1_revenue": round(year1_revenue * 0.6, 2),
                "year3_revenue": round(year3_revenue * 0.6, 2),
                "year1_customers": max(1, last["customers"] // 3),
                "year1_burn": round(year1_burn * 1.3, 2),
                "year1_net_income": round(year1_revenue * 0.6 - year1_burn * 1.3, 2),
                "break_even_month": None,
                "assumptions": [
                    "Slow adoption, longer sales cycles",
                    "Churn rises to 8%",
                    "Need to cut team to extend runway",
                ],
            },
            "optimistic": {
                "label": "Optimistic (2x growth)",
                "monthly_revenue_growth_pct": 25,
                "year1_revenue": round(year1_revenue * 2, 2),
                "year1_customers": last["customers"] * 2,
                "year1_burn": round(year1_burn * 0.7, 2),
                "year1_net_income": round(year1_revenue * 2 - year1_burn * 0.7, 2),
                "break_even_month": 9,
                "assumptions": [
                    "Strong product-market fit from launch",
                    "Viral coefficient > 1.2",
                    "Enterprise upsell adds 40% to ACV",
                ],
            },
            "pessimistic": {
                "label": "Pessimistic (0.5x growth)",
                "monthly_revenue_growth_pct": 7,
                "year1_revenue": round(year1_revenue * 0.5, 2),
                "year1_customers": max(1, last["customers"] // 2),
                "year1_burn": round(year1_burn * 1.3, 2),
                "year1_net_income": round(year1_revenue * 0.5 - year1_burn * 1.3, 2),
                "break_even_month": None,
                "assumptions": [
                    "Slow adoption, longer sales cycles",
                    "Churn rises to 8%",
                    "Need to cut team to extend runway",
                ],
            },
        },
        "sensitivity": {
            "pricing_plus_20": {
                "new_ltv": 2376.0,
                "new_ltv_cac_ratio": 9.5,
                "runway_change_months": 3,
                "break_even_month": 11,
            },
            "pricing_minus_20": {
                "new_ltv": 1584.0,
                "new_ltv_cac_ratio": 6.3,
                "runway_change_months": -2,
                "break_even_month": 17,
            },
            "cac_plus_30": {
                "new_cac": 325.0,
                "new_ltv_cac_ratio": 6.1,
                "runway_change_months": -2,
                "break_even_month": 16,
            },
            "cac_minus_30": {
                "new_cac": 175.0,
                "new_ltv_cac_ratio": 11.3,
                "runway_change_months": 2,
                "break_even_month": 12,
            },
        },
        "runway": {
            "monthly_burn_rate": round(total_burn / 36, 2),
            "current_cash": 1000000,
            "runway_months": max(1, int(1000000 / max(1, total_burn / 36))),
            "break_even_month": 14,
            "funding_required_series_a": 3000000,
        },
        "key_assumptions": [
            "$99/mo average price point",
            "5% monthly churn rate",
            "$250 blended CAC across channels",
            "2-4 engineers at $10-15k/mo, scaling to 8-10 by year 3",
            "Seed round of $1M closed",
            "15% month-over-month revenue growth",
            "36-month projection horizon",
        ],
        "risks": [
            "Longer-than-expected sales cycle delays revenue",
            "Churn increases if product-market fit is weak",
            "CAC rises as easy channels saturate",
            "Regulatory costs not yet modeled",
            "Key-person risk with small engineering team",
        ],
    }


# ---------------------------------------------------------------------------
# Agent class
# ---------------------------------------------------------------------------

class CFOAgent(BaseAgent):
    name = "CFO"
    model = "gpt-4o"

    def __init__(self, bus: StateBus, logger: TraceLogger) -> None:
        super().__init__(bus, logger)
        self.current_strategy: StrategyPayload | None = None
        self.subscribe(EventType.STRATEGY_SET, EventType.PIVOT)

    # ----- event handling ---------------------------------------------------

    async def handle_event(self, event: AgentEvent) -> None:
        if event.type == EventType.STRATEGY_SET:
            payload = event.payload
            if isinstance(payload, StrategyPayload):
                self.current_strategy = payload
        elif event.type == EventType.PIVOT:
            await self.handle_pivot(event)

    # ----- core financial model generation ----------------------------------

    async def generate_financial_model(self, strategy: StrategyPayload) -> FinancialModelPayload:
        """Generate a comprehensive financial model using LLM."""
        self.current_strategy = strategy
        self.log(
            "Generating comprehensive 36-month financial model with bull/base/bear scenarios, "
            "sensitivity analysis, and unit economics; saving model_v2.json",
            action="financial_model",
            reasoning=(
                f"Building detailed projections for '{strategy.startup_idea}' targeting "
                f"'{strategy.target_market}' with a '{strategy.business_model}' model. "
                f"Will produce P&L, unit economics, scenario analysis, sensitivity tables, "
                f"and runway calculations. Need to model realistic seed-stage economics "
                f"with CAC, LTV, and churn appropriate for {strategy.target_market}."
            ),
            in_response_to="CEO strategy set",
        )

        prompt = _FINANCIAL_MODEL_PROMPT.format(
            startup_idea=strategy.startup_idea,
            target_market=strategy.target_market,
            business_model=strategy.business_model,
            differentiators=", ".join(strategy.key_differentiators) if strategy.key_differentiators else "N/A",
        )

        response = await self.call_llm(
            [
                {
                    "role": "system",
                    "content": (
                        "You are an expert startup CFO. Respond with ONLY a valid JSON object. "
                        "No markdown fences, no commentary. Every number must be realistic and non-zero. "
                        "All financial fields must be internally consistent."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=8192,
            temperature=0.4,
        )

        data = self._parse_llm_response(response)

        # Build the event payload from parsed data
        runway = data.get("runway", {})
        scenarios = data.get("scenarios", {})
        base_scenario = scenarios.get("base", {})

        payload = FinancialModelPayload(
            revenue_year1=base_scenario.get("year1_revenue", 0) or sum(
                m.get("revenue", 0) for m in data.get("monthly_pnl", [])
            ),
            revenue_year3=base_scenario.get("year1_revenue", 0) * 8,  # rough 3-year projection
            burn_rate_monthly=runway.get("monthly_burn_rate", 0),
            runway_months=runway.get("runway_months", 0),
            funding_required=runway.get("funding_required_series_a", 0),
            output_path="outputs/financial_model",
        )

        self._save_all_outputs(data)

        await self.publish(AgentEvent(
            type=EventType.FINANCIAL_MODEL_READY,
            source=self.name,
            payload=payload,
            iteration=self._current_iteration,
        ))

        return payload

    # ----- pivot handling ---------------------------------------------------

    async def handle_pivot(self, event: AgentEvent) -> None:
        """Re-generate financial model after a pivot."""
        payload = event.payload
        if not isinstance(payload, PivotPayload):
            return

        changes = payload.changes_required.get("CFO", "Update financial projections")
        self.log(
            f"Handling pivot: {changes}",
            action="pivot_response",
            reasoning=(
                f"CEO has pivoted the strategy. I need to rebuild the financial model to reflect: {changes}. "
                f"This may affect pricing, CAC, runway, and scenario assumptions."
            ),
            addressed_to="CEO",
            in_response_to=f"CEO PIVOT: {payload.reason[:100]}",
        )

        new_strategy_data = {}
        try:
            new_strategy_data = json.loads(payload.new_strategy)
        except json.JSONDecodeError:
            pass

        if new_strategy_data:
            new_strategy = StrategyPayload(**new_strategy_data)
        elif self.current_strategy:
            new_strategy = self.current_strategy
        else:
            return

        self._current_iteration += 1
        await self.generate_financial_model(new_strategy)

    # ----- LLM response parsing --------------------------------------------

    def _parse_llm_response(self, response: str) -> dict[str, Any]:
        """Parse LLM JSON response with fallback to realistic defaults."""
        cleaned = response.strip()

        # Strip markdown fences if present
        if cleaned.startswith("```"):
            first_newline = cleaned.find("\n")
            if first_newline != -1:
                cleaned = cleaned[first_newline + 1:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

        try:
            data = json.loads(cleaned)
            # Validate that we got something meaningful (accept 12+ months; backfill to 36 if needed)
            pnl = data.get("monthly_pnl", [])
            if not pnl or len(pnl) < 6:
                self.log("LLM response missing monthly P&L, using fallback", action="warning")
                return _build_fallback_model()
            # If LLM only returned 12 months, extend to 36 by extrapolating from last 3 months
            if len(pnl) < 36:
                self.log(
                    f"LLM returned {len(pnl)} months of P&L; extrapolating to 36",
                    action="warning",
                )
                last_m = pnl[-1]
                prev_rev = pnl[-2]["revenue"] if len(pnl) >= 2 else last_m["revenue"]
                growth = (last_m["revenue"] / prev_rev) if prev_rev else 1.08
                growth = max(1.01, min(growth, 1.30))  # cap at 1% to 30% monthly growth
                m_num = last_m["month"]
                customers = last_m.get("customers", 0)
                for i in range(len(pnl), 36):
                    m_num += 1
                    rev = round(last_m["revenue"] * (growth ** (i - len(pnl) + 1)), 2)
                    cogs = round(rev * 0.25, 2)
                    gp = round(rev - cogs, 2)
                    eng = round(last_m.get("engineering", 30000) * (1 + 0.02 * (i - len(pnl) + 1)), 2)
                    sm = round(last_m.get("sales_marketing", 10000) * (1 + 0.015 * (i - len(pnl) + 1)), 2)
                    ga = round(last_m.get("general_admin", 4000) * (1 + 0.005 * (i - len(pnl) + 1)), 2)
                    opex = round(eng + sm + ga, 2)
                    ebitda = round(gp - opex, 2)
                    new_c = max(1, int(customers * 0.08))
                    churned = max(0, int(customers * 0.05))
                    customers = customers + new_c - churned
                    pnl.append({
                        "month": m_num,
                        "revenue": rev,
                        "cogs": cogs,
                        "gross_profit": gp,
                        "gross_margin_pct": round((gp / rev * 100) if rev else 0, 1),
                        "engineering": eng,
                        "sales_marketing": sm,
                        "general_admin": ga,
                        "total_opex": opex,
                        "ebitda": ebitda,
                        "net_income": ebitda,
                        "customers": customers,
                        "new_customers": new_c,
                        "churned_customers": churned,
                        "mrr": rev,
                    })
                data["monthly_pnl"] = pnl
            return data
        except json.JSONDecodeError:
            self.log("Failed to parse LLM financial model response, using fallback", action="warning")
            return _build_fallback_model()

    # ----- file output ------------------------------------------------------

    def _save_all_outputs(self, data: dict[str, Any]) -> None:
        """Save all financial model outputs: JSON, markdown, scenarios."""
        out_dir = "outputs/financial_model"
        os.makedirs(out_dir, exist_ok=True)

        # 1. Main financial model JSON (canonical name + versioned)
        self._write_json(f"{out_dir}/financial_model.json", data)
        self._write_json(f"{out_dir}/model_v{self._current_iteration}.json", data)

        # 2. Scenarios JSON (backwards-compatible)
        scenarios_data = data.get("scenarios", {})
        self._write_json(f"{out_dir}/scenarios.json", scenarios_data)

        # 3. Enhanced model_v2.json with 36-month scenario arrays + unit economics
        self._write_json(f"{out_dir}/model_v2.json", self._build_model_v2(data))

        # 4. Formatted markdown report
        md = self._render_markdown(data)
        md_path = f"{out_dir}/financial_model.md"
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(md)
        # Also versioned
        with open(f"{out_dir}/model_v{self._current_iteration}.md", "w", encoding="utf-8") as f:
            f.write(md)

        self.log(
            f"Financial model saved: {out_dir}/financial_model.json, "
            f"model_v2.json, scenarios.json, financial_model.md (v{self._current_iteration})",
            action="model_save",
        )

    @staticmethod
    def _build_model_v2(data: dict[str, Any]) -> dict[str, Any]:
        """Construct the model_v2.json structure from full model data.

        Ensures the required schema:
        {
          "scenarios": {
            "bull":  {"monthly_revenue": [36], "monthly_costs": [36], "cumulative_profit": [36]},
            "base":  {...},
            "bear":  {...},
          },
          "unit_economics": {"cac", "ltv", "ltv_cac_ratio", "payback_months"},
          "summary": {"break_even_month", "year1_revenue", "year3_revenue"},
        }
        """
        pnl: list[dict[str, Any]] = data.get("monthly_pnl", [])
        scenarios_raw: dict[str, Any] = data.get("scenarios", {})
        ue_raw: dict[str, Any] = data.get("unit_economics", {})
        runway: dict[str, Any] = data.get("runway", {})

        def _extract_or_build_arrays(key: str, multiplier: float) -> dict[str, Any]:
            sc = scenarios_raw.get(key, {})
            if sc.get("monthly_revenue") and len(sc["monthly_revenue"]) == 36:
                return {
                    "monthly_revenue": sc["monthly_revenue"],
                    "monthly_costs": sc.get("monthly_costs", []),
                    "cumulative_profit": sc.get("cumulative_profit", []),
                }
            # Build from pnl data using multiplier
            revenues = [round(m.get("revenue", 0) * multiplier, 2) for m in pnl]
            costs = [
                round((m.get("cogs", 0) + m.get("total_opex", 0)) * (0.85 + 0.15 * multiplier), 2)
                for m in pnl
            ]
            cum_profit: list[float] = []
            running = 0.0
            for rev, cost in zip(revenues, costs):
                running += rev - cost
                cum_profit.append(round(running, 2))
            return {
                "monthly_revenue": revenues,
                "monthly_costs": costs,
                "cumulative_profit": cum_profit,
            }

        bull_arrays = _extract_or_build_arrays("bull", 1.5)
        base_arrays = _extract_or_build_arrays("base", 1.0)
        bear_arrays = _extract_or_build_arrays("bear", 0.6)

        # Unit economics
        cac = ue_raw.get("cac", 0)
        ltv = ue_raw.get("ltv", 0)
        ltv_cac = ue_raw.get("ltv_cac_ratio", round(ltv / cac, 2) if cac else 0)
        payback = ue_raw.get("payback_period_months", ue_raw.get("payback_months", 0))

        # Summary
        year1_revenue = (
            scenarios_raw.get("base", {}).get("year1_revenue")
            or sum(m.get("revenue", 0) for m in pnl[:12])
        )
        year3_revenue = (
            scenarios_raw.get("base", {}).get("year3_revenue")
            or sum(m.get("revenue", 0) for m in pnl)
        )
        break_even = runway.get("break_even_month") or scenarios_raw.get("base", {}).get("break_even_month")

        return {
            "scenarios": {
                "bull": bull_arrays,
                "base": base_arrays,
                "bear": bear_arrays,
            },
            "unit_economics": {
                "cac": cac,
                "ltv": ltv,
                "ltv_cac_ratio": ltv_cac,
                "payback_months": payback,
            },
            "summary": {
                "break_even_month": break_even,
                "year1_revenue": year1_revenue,
                "year3_revenue": year3_revenue,
            },
        }

    @staticmethod
    def _write_json(path: str, data: Any) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    # ----- markdown rendering -----------------------------------------------

    def _render_markdown(self, data: dict[str, Any]) -> str:
        """Render the full financial model as a formatted markdown report."""
        lines: list[str] = []
        w = lines.append  # shorthand

        company = data.get("company_name", "Startup")
        w(f"# Financial Model v{self._current_iteration} -- {company}")
        w(f"*Generated: {data.get('model_date', 'N/A')}*\n")

        # --- Key metrics dashboard ---
        km = data.get("key_metrics", {})
        if km:
            w("## Key Metrics Dashboard\n")
            w("| Metric | Value |")
            w("|--------|------:|")
            w(f"| MRR | ${km.get('mrr_current', 0):,.0f} |")
            w(f"| ARR | ${km.get('arr_current', 0):,.0f} |")
            w(f"| Total Customers | {km.get('total_customers', 0):,} |")
            w(f"| Monthly Churn | {km.get('churn_rate_monthly', 0):.1f}% |")
            w(f"| Net Revenue Retention | {km.get('net_revenue_retention', 0):.0f}% |")
            w(f"| Avg Contract Value | ${km.get('avg_contract_value', 0):,.0f}/yr |")
            w(f"| ARPU | ${km.get('avg_revenue_per_user', 0):,.0f}/mo |")
            w("")

        # --- Unit economics ---
        ue = data.get("unit_economics", {})
        if ue:
            w("## Unit Economics\n")
            w("| Metric | Value |")
            w("|--------|------:|")
            w(f"| CAC | ${ue.get('cac', 0):,.0f} |")
            w(f"| LTV | ${ue.get('ltv', 0):,.0f} |")
            ltv_cac = ue.get("ltv_cac_ratio", 0)
            health = "healthy" if ltv_cac >= 3 else "needs improvement"
            w(f"| LTV/CAC Ratio | {ltv_cac:.1f}x ({health}) |")
            w(f"| Payback Period | {ue.get('payback_period_months', 0):.1f} months |")
            w(f"| Gross Margin/Customer | ${ue.get('gross_margin_per_customer', 0):,.0f}/mo |")
            w(f"| Gross Margin % | {ue.get('gross_margin_pct', 0):.0f}% |")
            w("")

        # --- 12-Month P&L ---
        pnl = data.get("monthly_pnl", [])
        if pnl:
            w("## 12-Month P&L Projection\n")
            w("| Month | Revenue | COGS | Gross Profit | GM% | Engineering | Sales & Mktg | G&A | Total OpEx | EBITDA | Net Income | Customers | MRR |")
            w("|------:|--------:|-----:|-------------:|----:|------------:|------------:|----:|-----------:|-------:|-----------:|----------:|----:|")
            for m in pnl[:12]:
                w(
                    f"| {m.get('month', '')} "
                    f"| ${m.get('revenue', 0):,.0f} "
                    f"| ${m.get('cogs', 0):,.0f} "
                    f"| ${m.get('gross_profit', 0):,.0f} "
                    f"| {m.get('gross_margin_pct', 0):.0f}% "
                    f"| ${m.get('engineering', 0):,.0f} "
                    f"| ${m.get('sales_marketing', 0):,.0f} "
                    f"| ${m.get('general_admin', 0):,.0f} "
                    f"| ${m.get('total_opex', 0):,.0f} "
                    f"| ${m.get('ebitda', 0):,.0f} "
                    f"| ${m.get('net_income', 0):,.0f} "
                    f"| {m.get('customers', 0):,} "
                    f"| ${m.get('mrr', 0):,.0f} |"
                )
            # Totals row
            total_rev = sum(m.get("revenue", 0) for m in pnl[:12])
            total_cogs = sum(m.get("cogs", 0) for m in pnl[:12])
            total_gp = sum(m.get("gross_profit", 0) for m in pnl[:12])
            total_eng = sum(m.get("engineering", 0) for m in pnl[:12])
            total_sm = sum(m.get("sales_marketing", 0) for m in pnl[:12])
            total_ga = sum(m.get("general_admin", 0) for m in pnl[:12])
            total_opex = sum(m.get("total_opex", 0) for m in pnl[:12])
            total_ebitda = sum(m.get("ebitda", 0) for m in pnl[:12])
            total_ni = sum(m.get("net_income", 0) for m in pnl[:12])
            avg_gm = (total_gp / total_rev * 100) if total_rev else 0
            w(
                f"| **Total** "
                f"| **${total_rev:,.0f}** "
                f"| **${total_cogs:,.0f}** "
                f"| **${total_gp:,.0f}** "
                f"| **{avg_gm:.0f}%** "
                f"| **${total_eng:,.0f}** "
                f"| **${total_sm:,.0f}** "
                f"| **${total_ga:,.0f}** "
                f"| **${total_opex:,.0f}** "
                f"| **${total_ebitda:,.0f}** "
                f"| **${total_ni:,.0f}** "
                f"| | |"
            )
            w("")

        # --- Scenario comparison ---
        scenarios = data.get("scenarios", {})
        if scenarios:
            w("## Scenario Analysis\n")
            w("| Metric | Optimistic (2x) | Base Case | Pessimistic (0.5x) |")
            w("|--------|----------------:|----------:|-------------------:|")
            opt = scenarios.get("optimistic", {})
            base = scenarios.get("base", {})
            pess = scenarios.get("pessimistic", {})
            w(f"| Monthly Growth | {opt.get('monthly_revenue_growth_pct', 0)}% | {base.get('monthly_revenue_growth_pct', 0)}% | {pess.get('monthly_revenue_growth_pct', 0)}% |")
            w(f"| Year 1 Revenue | ${opt.get('year1_revenue', 0):,.0f} | ${base.get('year1_revenue', 0):,.0f} | ${pess.get('year1_revenue', 0):,.0f} |")
            w(f"| Year 1 Customers | {opt.get('year1_customers', 0):,} | {base.get('year1_customers', 0):,} | {pess.get('year1_customers', 0):,} |")
            w(f"| Year 1 Burn | ${opt.get('year1_burn', 0):,.0f} | ${base.get('year1_burn', 0):,.0f} | ${pess.get('year1_burn', 0):,.0f} |")
            w(f"| Year 1 Net Income | ${opt.get('year1_net_income', 0):,.0f} | ${base.get('year1_net_income', 0):,.0f} | ${pess.get('year1_net_income', 0):,.0f} |")
            be_opt = opt.get("break_even_month")
            be_base = base.get("break_even_month")
            be_pess = pess.get("break_even_month")
            w(f"| Break-Even Month | {be_opt if be_opt else 'N/A'} | {be_base if be_base else 'N/A'} | {be_pess if be_pess else 'N/A'} |")
            w("")

            for key, label in [("optimistic", "Optimistic"), ("base", "Base"), ("pessimistic", "Pessimistic")]:
                sc = scenarios.get(key, {})
                assumptions = sc.get("assumptions", [])
                if assumptions:
                    w(f"**{label} Assumptions:**")
                    for a in assumptions:
                        w(f"- {a}")
                    w("")

        # --- Sensitivity analysis ---
        sens = data.get("sensitivity", {})
        if sens:
            w("## Sensitivity Analysis\n")
            w("| Variable Change | LTV/CAC | Runway Impact | Break-Even Month |")
            w("|----------------|--------:|--------------:|-----------------:|")
            for key, label in [
                ("pricing_plus_20", "Pricing +20%"),
                ("pricing_minus_20", "Pricing -20%"),
                ("cac_plus_30", "CAC +30%"),
                ("cac_minus_30", "CAC -30%"),
            ]:
                s = sens.get(key, {})
                ratio = s.get("new_ltv_cac_ratio", 0)
                runway_chg = s.get("runway_change_months", 0)
                sign = "+" if runway_chg > 0 else ""
                be = s.get("break_even_month")
                w(f"| {label} | {ratio:.1f}x | {sign}{runway_chg} months | {be if be else 'N/A'} |")
            w("")

        # --- Runway ---
        runway = data.get("runway", {})
        if runway:
            w("## Runway & Funding\n")
            w("| Metric | Value |")
            w("|--------|------:|")
            w(f"| Monthly Burn Rate | ${runway.get('monthly_burn_rate', 0):,.0f} |")
            w(f"| Current Cash | ${runway.get('current_cash', 0):,.0f} |")
            w(f"| Runway | {runway.get('runway_months', 0)} months |")
            be = runway.get("break_even_month")
            w(f"| Break-Even Month | {be if be else 'Not in forecast'} |")
            w(f"| Series A Needed | ${runway.get('funding_required_series_a', 0):,.0f} |")
            w("")

        # --- Assumptions & risks ---
        assumptions = data.get("key_assumptions", [])
        if assumptions:
            w("## Key Assumptions\n")
            for a in assumptions:
                w(f"- {a}")
            w("")

        risks = data.get("risks", [])
        if risks:
            w("## Financial Risks\n")
            for r in risks:
                w(f"- {r}")
            w("")

        return "\n".join(lines)

    # ----- run entry --------------------------------------------------------

    async def run(self, context: dict[str, Any] | None = None) -> None:
        if self.current_strategy:
            await self.generate_financial_model(self.current_strategy)
        else:
            self.log("No strategy set yet", action="waiting")
