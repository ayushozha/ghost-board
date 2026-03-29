/**
 * Demo data fallback for Ghost Board dashboard.
 *
 * Condensed but representative data extracted from real pipeline outputs.
 * Used when the API server is unreachable so the dashboard still renders
 * all five screens with meaningful content.
 */

// ── Trace events (20 representative events) ─────────────────────────────────

export const DEMO_TRACE = [
  {
    event_id: 'demo-001',
    event_type: 'STRATEGY_SET',
    source: 'CEO',
    triggered_by: '',
    timestamp: '2026-03-28T22:57:32.796858+00:00',
    iteration: 1,
    payload: {
      startup_idea: 'Anchrix - AI-powered stablecoin compliance and payout infrastructure',
      target_market: 'Fintech companies and SMEs needing cross-border stablecoin payouts',
      business_model: 'SaaS - API-first B2B compliance platform',
      key_differentiators: [
        'Real-time regulatory monitoring',
        'AI-driven compliance automation',
        'Multi-jurisdiction stablecoin support',
      ],
      constraints: [
        'CFPB regulations',
        'FinCEN MSB registration',
        'State money transmitter licensing',
      ],
      iteration: 1,
    },
  },
  {
    event_id: 'demo-002',
    event_type: 'UPDATE',
    source: 'CTO',
    triggered_by: 'demo-001',
    timestamp: '2026-03-28T22:57:32.798631+00:00',
    iteration: 1,
    payload: {
      agent: 'CTO',
      action: 'codex_generate',
      details:
        'Generating multi-file prototype for Anchrix: FastAPI backend with compliance API, transaction routes, and health checks.',
      artifacts: ['app.py', 'models.py', 'config.py'],
    },
  },
  {
    event_id: 'demo-003',
    event_type: 'UPDATE',
    source: 'CFO',
    triggered_by: 'demo-001',
    timestamp: '2026-03-28T22:57:32.799144+00:00',
    iteration: 1,
    payload: {
      agent: 'CFO',
      action: 'financial_model',
      details:
        'Generating comprehensive 12-month financial model with 3 scenarios, sensitivity analysis, and unit economics for SaaS compliance platform.',
      artifacts: [],
    },
  },
  {
    event_id: 'demo-004',
    event_type: 'UPDATE',
    source: 'CMO',
    triggered_by: 'demo-001',
    timestamp: '2026-03-28T22:57:32.800744+00:00',
    iteration: 1,
    payload: {
      agent: 'CMO',
      action: 'gtm_generate',
      details:
        'Generating GTM strategy: positioning, competitive matrix, customer journey, messaging framework, and landing page.',
      artifacts: [],
    },
  },
  {
    event_id: 'demo-005',
    event_type: 'UPDATE',
    source: 'Legal',
    triggered_by: 'demo-001',
    timestamp: '2026-03-28T22:57:33.100000+00:00',
    iteration: 1,
    payload: {
      agent: 'Legal',
      action: 'compliance_scan',
      details: 'Analyzing regulatory compliance for fintech/stablecoin domain.',
      artifacts: [],
    },
  },
  {
    event_id: 'demo-006',
    event_type: 'UPDATE',
    source: 'Legal',
    triggered_by: 'demo-005',
    timestamp: '2026-03-28T22:57:33.200000+00:00',
    iteration: 1,
    payload: {
      agent: 'Legal',
      action: 'industry_detection',
      details: "Detected industries: ['fintech', 'payments', 'crypto']",
      artifacts: [],
    },
  },
  {
    event_id: 'demo-007',
    event_type: 'BLOCKER',
    source: 'Legal',
    triggered_by: 'demo-005',
    timestamp: '2026-03-28T22:57:34.000000+00:00',
    iteration: 1,
    payload: {
      severity: 'CRITICAL',
      area: 'Money Services Business Registration',
      description:
        'Requires state MSB registration per 31 CFR 1022. Operating as a money transmitter without registration is a federal crime.',
      citations: [
        '31 CFR 1022.380',
        'https://www.fincen.gov/msb-registrant-search',
      ],
      recommended_action:
        'Register with FinCEN as MSB and obtain state-level MTLs, or restructure to avoid money transmission.',
    },
  },
  {
    event_id: 'demo-008',
    event_type: 'BLOCKER',
    source: 'Legal',
    triggered_by: 'demo-005',
    timestamp: '2026-03-28T22:57:34.500000+00:00',
    iteration: 1,
    payload: {
      severity: 'CRITICAL',
      area: 'State Money Transmitter Licensing',
      description:
        'Must obtain money transmitter licenses in each state of operation. NY BitLicense alone costs $5,000+ and takes 2+ years.',
      citations: [
        '23 NYCRR 200 (BitLicense)',
        'https://www.dfs.ny.gov/virtual_currency_businesses',
      ],
      recommended_action:
        'Limit initial launch to 5 states with streamlined MTL processes, or pivot to B2B-only SaaS avoiding direct money handling.',
    },
  },
  {
    event_id: 'demo-009',
    event_type: 'BLOCKER',
    source: 'Legal',
    triggered_by: 'demo-005',
    timestamp: '2026-03-28T22:57:35.000000+00:00',
    iteration: 1,
    payload: {
      severity: 'HIGH',
      area: 'Bank Secrecy Act - AML/KYC Requirements',
      description:
        'BSA requires robust AML program including KYC, suspicious activity reporting, and record-keeping for all transactions over $10,000.',
      citations: [
        '31 USC 5311-5330',
        '31 CFR 1010.410',
        'https://www.fincen.gov/resources/statutes-and-regulations',
      ],
      recommended_action:
        'Implement KYC/AML pipeline with identity verification provider (Plaid, Jumio) before launch.',
    },
  },
  {
    event_id: 'demo-010',
    event_type: 'COMPLIANCE_REPORT_READY',
    source: 'Legal',
    triggered_by: 'demo-009',
    timestamp: '2026-03-28T22:57:35.200000+00:00',
    iteration: 1,
    payload: {
      risk_level: 'HIGH',
      regulations_checked: [
        '31 CFR 1022 (MSB Registration)',
        '23 NYCRR 200 (NY BitLicense)',
        '31 USC 5311-5330 (BSA/AML)',
        '12 CFR 1005 (EFTA/Reg E)',
        'Cal. Civ. Code 1798.100 (CCPA)',
      ],
      blockers_found: 3,
      output_path: 'outputs/compliance',
    },
  },
  {
    event_id: 'demo-011',
    event_type: 'PIVOT',
    source: 'CEO',
    triggered_by: 'demo-007',
    timestamp: '2026-03-28T22:57:36.000000+00:00',
    iteration: 2,
    payload: {
      pivot_number: 1,
      trigger:
        '[Legal BLOCKER - CRITICAL] MSB registration required per 31 CFR 1022',
      new_direction:
        'Pivot to B2B compliance SaaS only. Remove direct money transmission. Provide API layer that helps fintechs manage their own compliance.',
      affected_agents: {
        CTO: 'Remove payment flow endpoints, add compliance API gateway',
        CFO: 'Switch from transaction fees to enterprise SaaS pricing tiers',
        CMO: 'Reposition as enterprise compliance tool, target compliance officers at banks',
        Legal: 'Review updated architecture for reduced regulatory exposure',
      },
      reasoning:
        'MSB licensing in 50 states costs $2M+ and takes 2+ years. Pivoting to B2B SaaS avoids direct money transmission, reducing compliance cost from $2M to ~$50K.',
    },
  },
  {
    event_id: 'demo-012',
    event_type: 'PIVOT',
    source: 'CEO',
    triggered_by: 'demo-008',
    timestamp: '2026-03-28T22:57:37.000000+00:00',
    iteration: 3,
    payload: {
      pivot_number: 2,
      trigger:
        '[Legal BLOCKER - CRITICAL] State MTL licensing prohibitive',
      new_direction:
        'Further narrow to 5-state initial launch (DE, WY, CO, TX, FL) with streamlined licensing. Pursue federal charter path long-term.',
      affected_agents: {
        CTO: 'Add geo-fencing for supported states, compliance rule engine per jurisdiction',
        CFO: 'Reduce initial compliance budget 40x, model state-by-state expansion',
        CMO: 'Target enterprise API positioning for fintech infrastructure',
        Legal: 'Prepare applications for 5 initial states',
      },
      reasoning:
        'Full 50-state coverage is a 2-year, $2M+ endeavor. Starting with 5 business-friendly states lets us launch in 3 months with $50K compliance budget.',
    },
  },
  {
    event_id: 'demo-013',
    event_type: 'UPDATE',
    source: 'CTO',
    triggered_by: 'demo-011',
    timestamp: '2026-03-28T22:57:38.000000+00:00',
    iteration: 2,
    payload: {
      agent: 'CTO',
      action: 'pivot_rebuild',
      details:
        'Rebuilding prototype: removed /consumer/* endpoints, added /api/v1/compliance/* routes, geo-fence middleware for 5-state support.',
      artifacts: ['app.py', 'routes/compliance.py', 'middleware/geo_fence.py'],
    },
  },
  {
    event_id: 'demo-014',
    event_type: 'FINANCIAL_MODEL_READY',
    source: 'CFO',
    triggered_by: 'demo-011',
    timestamp: '2026-03-28T22:57:39.000000+00:00',
    iteration: 2,
    payload: {
      revenue_year1: 540000,
      revenue_year3: 4320000,
      burn_rate_monthly: 45000,
      runway_months: 22,
      funding_required: 2000000,
      output_path: 'outputs/financial_model',
    },
  },
  {
    event_id: 'demo-015',
    event_type: 'UPDATE',
    source: 'CMO',
    triggered_by: 'demo-012',
    timestamp: '2026-03-28T22:57:40.000000+00:00',
    iteration: 2,
    payload: {
      agent: 'CMO',
      action: 'gtm_save',
      details:
        'GTM package updated: repositioned as "Enterprise Compliance API". New ICP: VP of Compliance at mid-size fintechs. Updated competitive matrix vs Chainalysis, Elliptic, ComplyAdvantage.',
      artifacts: [
        'gtm_strategy.md',
        'positioning.md',
        'competitive_matrix.json',
        'landing_page.html',
      ],
    },
  },
  {
    event_id: 'demo-016',
    event_type: 'PROTOTYPE_READY',
    source: 'CTO',
    triggered_by: 'demo-013',
    timestamp: '2026-03-28T22:57:42.000000+00:00',
    iteration: 2,
    payload: {
      files_generated: 10,
      total_lines: 1847,
      framework: 'FastAPI',
      output_path: 'outputs/prototype',
    },
  },
  {
    event_id: 'demo-017',
    event_type: 'SIMULATION_RESULT',
    source: 'Simulation',
    triggered_by: 'demo-016',
    timestamp: '2026-03-28T22:58:10.000000+00:00',
    iteration: 2,
    payload: {
      overall_sentiment: 0.22,
      confidence: 0.72,
      total_agents: 1000015,
      rounds: 5,
      pivot_recommended: false,
      key_concerns: [
        'Vendor risk assessment timelines',
        'Competition from established players',
        'Bank-grade security requirements',
      ],
      key_strengths: [
        'Strong regulatory moat',
        'API-first approach resonates with devs',
        'Cross-border compliance underserved',
      ],
    },
  },
  {
    event_id: 'demo-018',
    event_type: 'STRATEGY_SET',
    source: 'CEO',
    triggered_by: 'demo-017',
    timestamp: '2026-03-28T22:58:15.000000+00:00',
    iteration: 3,
    payload: {
      startup_idea: 'Anchrix - B2B Compliance API for Stablecoin Infrastructure',
      target_market: 'Mid-size fintechs and neobanks with stablecoin products',
      business_model: 'Enterprise SaaS with usage-based pricing',
      key_differentiators: [
        'Real-time multi-jurisdiction compliance',
        'Pre-built regulatory rule engine',
        'API-first developer experience',
      ],
      constraints: [
        '5-state initial geo-fence',
        'SOC 2 Type II certification needed',
        'Enterprise sales cycle 3-6 months',
      ],
      iteration: 3,
    },
  },
  {
    event_id: 'demo-019',
    event_type: 'UPDATE',
    source: 'CTO',
    triggered_by: 'demo-018',
    timestamp: '2026-03-28T22:58:20.000000+00:00',
    iteration: 3,
    payload: {
      agent: 'CTO',
      action: 'codex_generate',
      details:
        'Final rebuild: added SOC 2 audit logging, rate limiting, API key management, and comprehensive test suite.',
      artifacts: [
        'app.py',
        'middleware/audit_log.py',
        'middleware/rate_limit.py',
        'routes/api_keys.py',
        'test_app.py',
      ],
    },
  },
  {
    event_id: 'demo-020',
    event_type: 'UPDATE',
    source: 'CFO',
    triggered_by: 'demo-018',
    timestamp: '2026-03-28T22:58:25.000000+00:00',
    iteration: 3,
    payload: {
      agent: 'CFO',
      action: 'model_save',
      details:
        'Final financial model: $540K Y1 revenue, 22-month runway, $2M seed round at $8M pre-money. Unit economics: LTV/CAC 4.2x, payback 8 months.',
      artifacts: [
        'financial_model.json',
        'scenarios.json',
        'financial_model.md',
      ],
    },
  },
];

// ── Board discussion (12 entries showing Legal->CEO->CTO cascade) ────────────

export const DEMO_DISCUSSION = [
  {
    agent: 'CEO',
    timestamp: '2026-03-28T22:57:32.000000+00:00',
    event_type: 'strategy',
    message: 'Setting initial strategy for Anchrix',
    reasoning:
      'Analyzing the stablecoin payout space. Target market: fintechs needing cross-border compliance. SaaS model aligns with recurring revenue.',
    iteration: 1,
  },
  {
    agent: 'CEO',
    timestamp: '2026-03-28T22:57:32.500000+00:00',
    event_type: 'strategy',
    message:
      'Strategy: Anchrix - AI compliance SaaS for stablecoin infrastructure',
    reasoning:
      'Chose SaaS model for recurring revenue. Key differentiators: real-time multi-jurisdiction monitoring, AI-driven compliance automation. Constraints: CFPB regulations, FinCEN MSB requirements.',
    iteration: 1,
  },
  {
    agent: 'Legal',
    timestamp: '2026-03-28T22:57:34.000000+00:00',
    event_type: 'blocker_found',
    message: 'BLOCKER: CRITICAL - MSB Registration Required (31 CFR 1022)',
    reasoning:
      'Operating as a money transmitter without FinCEN registration is a federal crime under 18 USC 1960. Must register as MSB and implement full AML program. This blocks launch because: Cannot process stablecoin transactions without federal MSB registration.',
    iteration: 1,
  },
  {
    agent: 'Legal',
    timestamp: '2026-03-28T22:57:34.500000+00:00',
    event_type: 'blocker_found',
    message:
      'BLOCKER: CRITICAL - State Money Transmitter Licenses (23 NYCRR 200)',
    reasoning:
      'Each state requires separate MTL. NY BitLicense alone takes 2+ years and costs $5,000+. Full 50-state coverage estimated at $2M+ and 2-3 years. This blocks consumer-facing launch in most states.',
    iteration: 1,
  },
  {
    agent: 'CEO',
    timestamp: '2026-03-28T22:57:36.000000+00:00',
    event_type: 'pivot',
    message: 'Pivot #1: MSB licensing prohibitive for direct money transmission',
    reasoning:
      'Triggering pivot because: Legal blocker (CRITICAL): MSB registration per 31 CFR 1022. MSB licensing in 50 states costs $2M+ and takes 2+ years. Pivoting to B2B SaaS avoids direct money transmission entirely.',
    iteration: 1,
  },
  {
    agent: 'CEO',
    timestamp: '2026-03-28T22:57:36.500000+00:00',
    event_type: 'pivot_decision',
    message: 'PIVOT #1: B2B compliance SaaS - remove direct money transmission',
    reasoning:
      'Exact trigger: "[Legal BLOCKER - CRITICAL] MSB registration per 31 CFR 1022"\n\nOptions considered:\n  - Stay the course: Continue with consumer product (Pros: Larger TAM, Cons: $2M+ compliance, 2yr delay)\n  - Minor adjustment: Limit to 5 states (Pros: Faster, Cons: Still need MTLs)\n  - Major pivot: B2B SaaS only (Pros: No money transmission, $50K compliance, Cons: Smaller initial market)\n\nChosen direction: B2B compliance SaaS\nRationale: 40x reduction in compliance cost. Launch in months, not years.',
    iteration: 2,
    pivot_reasoning: {
      exact_trigger:
        '[Legal BLOCKER - CRITICAL] MSB registration per 31 CFR 1022',
      options_considered: [
        {
          option: 'Stay the course',
          description: 'Continue with consumer-facing product',
          pros: 'Larger total addressable market',
          cons: '$2M+ compliance cost, 2-year delay',
        },
        {
          option: 'Minor adjustment',
          description: 'Limit to 5 states initially',
          pros: 'Faster to market',
          cons: 'Still requires state MTLs',
        },
        {
          option: 'Major pivot',
          description: 'B2B compliance SaaS only',
          pros: 'No money transmission, $50K compliance cost',
          cons: 'Smaller initial addressable market',
        },
      ],
      chosen_direction: {
        option: 'B2B compliance SaaS',
        rationale:
          '40x reduction in compliance cost. Launch in months instead of years.',
      },
      expected_impact: {
        CTO: 'Remove payment flow, add compliance API gateway',
        CFO: 'Switch to enterprise SaaS pricing tiers',
        CMO: 'Target compliance officers at banks and fintechs',
        Legal: 'Review updated architecture for reduced regulatory exposure',
      },
      risk_assessment:
        'Risk of smaller initial market; mitigated by faster time-to-revenue and lower burn rate.',
    },
  },
  {
    agent: 'CTO',
    timestamp: '2026-03-28T22:57:38.000000+00:00',
    event_type: 'pivot_rebuild',
    message:
      'Rebuilding prototype: removed /consumer/* endpoints, added /api/v1/compliance/* routes',
    reasoning:
      'Pivot requires removing consumer onboarding flow and payment processing. Adding: compliance rule engine API, jurisdiction geo-fence middleware, audit logging for SOC 2 readiness. Generating 10 files targeting enterprise API pattern.',
    iteration: 2,
  },
  {
    agent: 'CFO',
    timestamp: '2026-03-28T22:57:39.000000+00:00',
    event_type: 'financial_model',
    message:
      'Updated financial model: $540K Y1 revenue, 22-month runway on $2M seed',
    reasoning:
      'Pivot to B2B SaaS changes unit economics significantly. Transaction fee model replaced with tiered enterprise pricing ($499-$4,999/mo). Compliance cost reduced from $2M to $50K. New projections: 90 enterprise customers Y1 at $500/mo average, growing to 720 customers Y3.',
    iteration: 2,
  },
  {
    agent: 'CMO',
    timestamp: '2026-03-28T22:57:40.000000+00:00',
    event_type: 'gtm_save',
    message:
      'GTM repositioned: "Enterprise Compliance API" targeting VP Compliance at fintechs',
    reasoning:
      'Complete repositioning from consumer fintech to enterprise B2B. New ICP: VP of Compliance at mid-size fintechs (50-500 employees). Updated competitive matrix: Chainalysis (blockchain analytics), Elliptic (crypto compliance), ComplyAdvantage (AML). Our differentiation: API-first, real-time multi-jurisdiction.',
    iteration: 2,
  },
  {
    agent: 'CEO',
    timestamp: '2026-03-28T22:58:15.000000+00:00',
    event_type: 'strategy',
    message: 'Post-simulation strategy: validated B2B pivot, refining positioning',
    reasoning:
      'Market simulation shows +0.22 overall sentiment. VCs positive (+0.60), early adopters supportive (+0.50), regulators warming (-0.10 from -0.50). Key insight: "regulatory moat" resonates strongly. Competitors dismissive but that confirms market opportunity.',
    iteration: 3,
  },
  {
    agent: 'CTO',
    timestamp: '2026-03-28T22:58:20.000000+00:00',
    event_type: 'codex_generate',
    message:
      'Final rebuild: SOC 2 audit logging, rate limiting, API key management',
    reasoning:
      'Simulation feedback highlighted need for enterprise-grade security. Adding: audit log middleware, rate limiting per API key, API key management CRUD, comprehensive test suite with 95%+ coverage target.',
    iteration: 3,
  },
  {
    agent: 'CFO',
    timestamp: '2026-03-28T22:58:25.000000+00:00',
    event_type: 'model_save',
    message:
      'Final model: LTV/CAC 4.2x, 8-month payback, $2M seed at $8M pre-money',
    reasoning:
      'Refined projections based on simulation data. Enterprise sales cycle: 3-6 months. Adjusted CAC from $1,200 to $1,800 (longer sales cycle). LTV increased to $7,560 (lower churn in enterprise). Payback period: 8 months. Recommend $2M seed round at $8M pre-money valuation.',
    iteration: 3,
  },
];

// ── Simulation results (multi-round with archetype breakdown) ────────────────

export const DEMO_SIMULATION = {
  total_llm_agents: 15,
  total_lightweight_agents: 1000000,
  total_agents: 1000015,
  rounds: 5,
  rounds_data: [
    {
      round_number: 1,
      avg_sentiment: 0.1,
      sentiment_by_archetype: {
        vc: 0.43,
        early_adopter: 0.5,
        skeptic: -0.6,
        journalist: 0.0,
        competitor: -0.7,
        regulator: -0.5,
      },
      posts: [
        {
          persona: 'Marcus Chen',
          archetype: 'vc',
          content:
            'Strong thesis on compliance infrastructure. Unit economics need work but the regulatory moat is real.',
          sentiment: 0.4,
          sentiment_category: 'positive',
          sentiment_score: 0.4,
          key_phrases: ['regulatory moat', 'unit economics'],
          references: [],
          stance_change: 'none',
        },
        {
          persona: 'James Hartley',
          archetype: 'vc',
          content:
            'Stablecoins are the killer app for cross-border payments. B2B compliance could be huge.',
          sentiment: 0.6,
          sentiment_category: 'positive',
          sentiment_score: 0.6,
          key_phrases: ['killer app', 'cross-border'],
          references: [],
          stance_change: 'none',
        },
        {
          persona: 'Oliver Brooks',
          archetype: 'skeptic',
          content:
            'AI cannot replace human judgment in compliance. Regulators will never trust automated systems for MSB oversight.',
          sentiment: -0.6,
          sentiment_category: 'negative',
          sentiment_score: -0.6,
          key_phrases: ['human judgment', 'automated systems'],
          references: [],
          stance_change: 'none',
        },
        {
          persona: 'Director Collins',
          archetype: 'regulator',
          content:
            'MSB registration is mandatory per 31 CFR 1022. No exceptions for AI-powered platforms.',
          sentiment: -0.5,
          sentiment_category: 'negative',
          sentiment_score: -0.5,
          key_phrases: ['MSB registration', '31 CFR 1022'],
          references: [],
          stance_change: 'none',
        },
      ],
    },
    {
      round_number: 2,
      avg_sentiment: 0.05,
      sentiment_by_archetype: {
        vc: 0.43,
        early_adopter: 0.33,
        skeptic: -0.5,
        journalist: 0.2,
        competitor: -0.75,
        regulator: -0.5,
      },
      posts: [
        {
          persona: 'Nina Sharma',
          archetype: 'early_adopter',
          content:
            'Cross-border compliance is the hardest unsolved problem in fintech. If they crack multi-jurisdiction, this is a winner.',
          sentiment: 0.3,
          sentiment_category: 'positive',
          sentiment_score: 0.3,
          key_phrases: ['cross-border compliance', 'multi-jurisdiction'],
          references: ['Marcus Chen'],
          stance_change: 'none',
        },
        {
          persona: 'Fatima Al-Hassan',
          archetype: 'competitor',
          content:
            'We own the compliance data layer at Chainalysis. Years of training data and regulatory relationships.',
          sentiment: -0.8,
          sentiment_category: 'negative',
          sentiment_score: -0.8,
          key_phrases: ['compliance data layer', 'training data'],
          references: [],
          stance_change: 'none',
        },
      ],
    },
    {
      round_number: 3,
      avg_sentiment: 0.12,
      sentiment_by_archetype: {
        vc: 0.5,
        early_adopter: 0.4,
        skeptic: -0.4,
        journalist: 0.25,
        competitor: -0.6,
        regulator: -0.3,
      },
      posts: [
        {
          persona: 'Kenji Taniguchi',
          archetype: 'skeptic',
          content:
            'Vendor risk assessment at major banks takes 18 months. Enterprise sales cycle is brutal.',
          sentiment: -0.4,
          sentiment_category: 'negative',
          sentiment_score: -0.4,
          key_phrases: ['vendor risk assessment', '18 months'],
          references: ['Nina Sharma'],
          stance_change: 'softening',
        },
      ],
    },
    {
      round_number: 4,
      avg_sentiment: 0.18,
      sentiment_by_archetype: {
        vc: 0.55,
        early_adopter: 0.45,
        skeptic: -0.3,
        journalist: 0.3,
        competitor: -0.5,
        regulator: -0.2,
      },
      posts: [
        {
          persona: 'Rachel Goldstein',
          archetype: 'vc',
          content:
            'The B2B pivot makes sense. API-first compliance as a service could be a $10B+ market.',
          sentiment: 0.55,
          sentiment_category: 'positive',
          sentiment_score: 0.55,
          key_phrases: ['B2B pivot', '$10B+ market'],
          references: ['James Hartley', 'Oliver Brooks'],
          stance_change: 'strengthening',
        },
      ],
    },
    {
      round_number: 5,
      avg_sentiment: 0.22,
      sentiment_by_archetype: {
        vc: 0.6,
        early_adopter: 0.5,
        skeptic: -0.2,
        journalist: 0.35,
        competitor: -0.4,
        regulator: -0.1,
      },
      posts: [
        {
          persona: 'Director Collins',
          archetype: 'regulator',
          content:
            'B2B SaaS model avoids most money transmission concerns. Would still need to ensure data handling compliance.',
          sentiment: -0.1,
          sentiment_category: 'neutral',
          sentiment_score: -0.1,
          key_phrases: ['B2B SaaS', 'data handling compliance'],
          references: ['Oliver Brooks'],
          stance_change: 'warming',
        },
      ],
    },
  ],
  final_signal: {
    overall_sentiment: 0.22,
    confidence: 0.72,
    key_concerns: [
      'Vendor risk assessment timelines at enterprise accounts',
      'Competition from established players (Chainalysis, Elliptic)',
      'Bank-grade security requirements (SOC 2 Type II)',
    ],
    key_strengths: [
      'Strong regulatory moat from compliance expertise',
      'API-first approach resonates with developer audience',
      'Cross-border compliance is underserved market',
    ],
    objections: [
      'AI cannot replace human compliance judgment',
      'Enterprise sales cycle is 12-18 months',
      'Need years of regulatory relationship building',
    ],
    pricing_signal:
      '$499-$4,999/mo enterprise tiers received positively by VCs',
    pivot_recommended: false,
    pivot_suggestion: '',
    archetype_breakdown: {
      vc: 0.6,
      early_adopter: 0.5,
      skeptic: -0.2,
      journalist: 0.35,
      competitor: -0.4,
      regulator: -0.1,
    },
    stance_shifts: {
      'Director Collins': { from: -0.5, to: -0.1, reason: 'B2B pivot addressed money transmission concerns' },
      'Kenji Taniguchi': { from: -0.6, to: -0.2, reason: 'API-first approach lowers integration barrier' },
      'Rachel Goldstein': { from: 0.3, to: 0.55, reason: 'B2B pivot improved unit economics' },
    },
    summary:
      'Market reception is cautiously positive (+0.22). VCs are strongest supporters, seeing regulatory moat as a key asset. Skeptics are softening as B2B pivot addresses their main concerns. Regulators warming to SaaS model that avoids direct money transmission. Competitors are dismissive, which paradoxically validates the opportunity.',
  },
  final_stances: {
    'Marcus Chen': 'positive',
    'Rachel Goldstein': 'positive',
    'James Hartley': 'positive',
    'Sarah Mitchell': 'positive',
    'Oliver Brooks': 'neutral',
    'Alex Rivera': 'neutral',
    'Thomas Weber': 'negative',
    'Director Collins': 'neutral',
    'Nina Sharma': 'positive',
    'Wei Zhang': 'neutral',
    'Fatima Al-Hassan': 'negative',
    'Carlos Mendoza': 'positive',
    'Amara Okafor': 'positive',
    'Helen Frost': 'neutral',
    'Kenji Taniguchi': 'neutral',
  },
  total_messages: 42,
};

// ── Persona geographic data (globe visualization) ────────────────────────────

export const DEMO_GEO = [
  {
    name: 'Marcus Chen',
    archetype: 'vc',
    lat: 37.7749,
    lng: -122.4194,
    city: 'San Francisco',
    country: 'US',
    initial_stance: 'neutral',
    influence: 0.9,
    company: 'Andreessen Horowitz (a16z)',
    final_stance: 'positive',
    messages: [
      { round: 1, content: 'Strong thesis on compliance infrastructure. Unit economics need work but the regulatory moat is real.', sentiment: 0.4 },
      { round: 3, content: 'B2B pivot was the right call. API-first compliance could be the next Stripe for regulation.', sentiment: 0.55 },
    ],
  },
  {
    name: 'Rachel Goldstein',
    archetype: 'vc',
    lat: 37.4419,
    lng: -122.143,
    city: 'Palo Alto',
    country: 'US',
    initial_stance: 'neutral',
    influence: 0.85,
    company: 'Ribbit Capital',
    final_stance: 'positive',
    messages: [
      { round: 1, content: 'Unit economics need work. Regulatory moat is interesting.', sentiment: 0.3 },
      { round: 4, content: 'The B2B pivot makes sense. API-first compliance as a service could be a $10B+ market.', sentiment: 0.55 },
    ],
  },
  {
    name: 'James Hartley',
    archetype: 'vc',
    lat: 40.7128,
    lng: -74.006,
    city: 'New York',
    country: 'US',
    initial_stance: 'positive',
    influence: 0.88,
    company: 'Paradigm',
    final_stance: 'positive',
    messages: [
      { round: 1, content: 'Stablecoins are the killer app for cross-border payments. This could work.', sentiment: 0.6 },
    ],
  },
  {
    name: 'Sarah Mitchell',
    archetype: 'early_adopter',
    lat: 37.7749,
    lng: -122.4194,
    city: 'San Francisco',
    country: 'US',
    initial_stance: 'positive',
    influence: 0.7,
    company: 'Stripe Treasury',
    final_stance: 'positive',
    messages: [
      { round: 1, content: 'API-first approach is right. Need latency benchmarks for real-time compliance checks.', sentiment: 0.5 },
    ],
  },
  {
    name: 'Oliver Brooks',
    archetype: 'skeptic',
    lat: 38.9072,
    lng: -77.0369,
    city: 'Washington DC',
    country: 'US',
    initial_stance: 'negative',
    influence: 0.75,
    company: 'Former CFPB Director',
    final_stance: 'neutral',
    messages: [
      { round: 1, content: 'AI cannot replace human judgment in compliance decisions.', sentiment: -0.6 },
      { round: 4, content: 'B2B SaaS model is more palatable. Still need human oversight layer.', sentiment: -0.2 },
    ],
  },
  {
    name: 'Alex Rivera',
    archetype: 'journalist',
    lat: 40.7128,
    lng: -74.006,
    city: 'New York',
    country: 'US',
    initial_stance: 'neutral',
    influence: 0.65,
    company: 'TechCrunch',
    final_stance: 'neutral',
    messages: [
      { round: 1, content: 'Show me the moat. How is this different from Chainalysis?', sentiment: 0.0 },
      { round: 3, content: 'Real-time multi-jurisdiction compliance is genuinely novel. Worth watching.', sentiment: 0.35 },
    ],
  },
  {
    name: 'Thomas Weber',
    archetype: 'competitor',
    lat: 42.3601,
    lng: -71.0589,
    city: 'Boston',
    country: 'US',
    initial_stance: 'negative',
    influence: 0.8,
    company: 'Circle (USDC)',
    final_stance: 'negative',
    messages: [
      { round: 1, content: 'We already have regulatory approval in 48 states. Good luck catching up.', sentiment: -0.7 },
    ],
  },
  {
    name: 'Director Collins',
    archetype: 'regulator',
    lat: 38.8951,
    lng: -77.2697,
    city: 'Vienna, VA',
    country: 'US',
    initial_stance: 'negative',
    influence: 0.95,
    company: 'FinCEN',
    final_stance: 'neutral',
    messages: [
      { round: 1, content: 'MSB registration is mandatory per 31 CFR 1022. No exceptions.', sentiment: -0.5 },
      { round: 5, content: 'B2B SaaS model avoids most money transmission concerns. Still need data handling compliance.', sentiment: -0.1 },
    ],
  },
  {
    name: 'Nina Sharma',
    archetype: 'early_adopter',
    lat: 19.076,
    lng: 72.8777,
    city: 'Mumbai',
    country: 'IN',
    initial_stance: 'neutral',
    influence: 0.7,
    company: 'Razorpay',
    final_stance: 'positive',
    messages: [
      { round: 2, content: 'Cross-border compliance is the hardest problem in fintech. If they crack multi-jurisdiction, this is a winner.', sentiment: 0.3 },
      { round: 4, content: 'Would integrate this into our stack for India-US corridor compliance.', sentiment: 0.5 },
    ],
  },
  {
    name: 'Wei Zhang',
    archetype: 'journalist',
    lat: 1.3521,
    lng: 103.8198,
    city: 'Singapore',
    country: 'SG',
    initial_stance: 'neutral',
    influence: 0.6,
    company: 'The Block',
    final_stance: 'neutral',
    messages: [
      { round: 2, content: 'Stablecoin regulation is imminent globally. MiCA in EU, MAS in Singapore. Timing is good.', sentiment: 0.2 },
    ],
  },
  {
    name: 'Fatima Al-Hassan',
    archetype: 'competitor',
    lat: 25.2048,
    lng: 55.2708,
    city: 'Dubai',
    country: 'AE',
    initial_stance: 'negative',
    influence: 0.75,
    company: 'Chainalysis',
    final_stance: 'negative',
    messages: [
      { round: 2, content: 'We own the compliance data layer. Years of training data and regulatory relationships.', sentiment: -0.8 },
    ],
  },
  {
    name: 'Carlos Mendoza',
    archetype: 'early_adopter',
    lat: -23.5505,
    lng: -46.6333,
    city: 'Sao Paulo',
    country: 'BR',
    initial_stance: 'neutral',
    influence: 0.65,
    company: 'Nubank',
    final_stance: 'positive',
    messages: [
      { round: 2, content: 'LATAM compliance is fragmented. Need Portuguese language support and Central Bank of Brazil integration.', sentiment: 0.2 },
    ],
  },
  {
    name: 'Amara Okafor',
    archetype: 'early_adopter',
    lat: 6.5244,
    lng: 3.3792,
    city: 'Lagos',
    country: 'NG',
    initial_stance: 'positive',
    influence: 0.6,
    company: 'Flutterwave',
    final_stance: 'positive',
    messages: [
      { round: 2, content: 'African compliance is massively underserved. Mobile money integration would be huge.', sentiment: 0.5 },
    ],
  },
  {
    name: 'Helen Frost',
    archetype: 'skeptic',
    lat: 51.5074,
    lng: -0.1278,
    city: 'London',
    country: 'GB',
    initial_stance: 'negative',
    influence: 0.7,
    company: 'Deloitte Risk Advisory',
    final_stance: 'neutral',
    messages: [
      { round: 2, content: 'Startups lack enterprise resilience. Need bank-grade uptime and security certifications.', sentiment: -0.5 },
      { round: 5, content: 'SOC 2 Type II plans are promising. Would need to see audit results before recommending.', sentiment: -0.1 },
    ],
  },
  {
    name: 'Kenji Taniguchi',
    archetype: 'skeptic',
    lat: 35.6762,
    lng: 139.6503,
    city: 'Tokyo',
    country: 'JP',
    initial_stance: 'negative',
    influence: 0.72,
    company: 'MUFG',
    final_stance: 'neutral',
    messages: [
      { round: 3, content: 'Vendor risk assessment at major banks takes 18 months minimum. Enterprise sales cycle is brutal.', sentiment: -0.4 },
      { round: 5, content: 'API-first approach could shorten integration timeline. Still skeptical about AI accuracy.', sentiment: -0.2 },
    ],
  },
];

// ── Aggregate stats ──────────────────────────────────────────────────────────

export const DEMO_STATS = {
  total_runs: 1,
  total_agents_simulated: 1000015,
  total_pivots: 3,
  avg_cost_usd: 0.19,
};

// ── Artifacts (file listing with content previews) ───────────────────────────

export const DEMO_ARTIFACTS = {
  artifacts: [
    {
      name: 'app.py',
      path: 'prototype/app.py',
      file_path: 'prototype/app.py',
      size: 2625,
      content_preview: `"""
Anchrix - B2B Compliance API for Stablecoin Infrastructure
FastAPI application with compliance rule engine, geo-fencing, and audit logging.
"""
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from config import Settings
from routes import compliance, transactions, users, health
from middleware.audit_log import AuditLogMiddleware
from middleware.rate_limit import RateLimitMiddleware

app = FastAPI(
    title="Anchrix Compliance API",
    description="B2B compliance infrastructure for stablecoin operations",
    version="0.2.0",
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"])
app.add_middleware(AuditLogMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=100)

app.include_router(compliance.router, prefix="/api/v1/compliance", tags=["compliance"])
app.include_router(transactions.router, prefix="/api/v1/transactions", tags=["transactions"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(health.router, prefix="/health", tags=["health"])

@app.get("/")
async def root():
    return {"service": "Anchrix Compliance API", "version": "0.2.0", "status": "operational"}`,
    },
    {
      name: 'models.py',
      path: 'prototype/models.py',
      file_path: 'prototype/models.py',
      size: 4194,
      content_preview: `"""Pydantic models for Anchrix Compliance API."""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime

class Jurisdiction(str, Enum):
    DE = "DE"  # Delaware
    WY = "WY"  # Wyoming
    CO = "CO"  # Colorado
    TX = "TX"  # Texas
    FL = "FL"  # Florida

class ComplianceCheck(BaseModel):
    transaction_id: str
    jurisdiction: Jurisdiction
    amount_usd: float
    sender_kyc_verified: bool
    recipient_kyc_verified: bool

class ComplianceResult(BaseModel):
    approved: bool
    risk_score: float = Field(ge=0.0, le=1.0)
    flags: List[str] = []
    regulations_checked: List[str] = []
    timestamp: datetime`,
    },
    {
      name: 'config.py',
      path: 'prototype/config.py',
      file_path: 'prototype/config.py',
      size: 533,
      content_preview: `"""Configuration for Anchrix Compliance API."""
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Anchrix Compliance API"
    debug: bool = False
    database_url: str = "postgresql://localhost:5432/anchrix"
    redis_url: str = "redis://localhost:6379"
    supported_jurisdictions: list = ["DE", "WY", "CO", "TX", "FL"]
    rate_limit_rpm: int = 100
    audit_log_enabled: bool = True

    class Config:
        env_file = ".env"`,
    },
    {
      name: 'routes/compliance.py',
      path: 'prototype/routes/compliance.py',
      file_path: 'prototype/routes/compliance.py',
      size: 1800,
      content_preview: `"""Compliance checking routes."""
from fastapi import APIRouter, HTTPException
from models import ComplianceCheck, ComplianceResult, Jurisdiction
from datetime import datetime

router = APIRouter()

JURISDICTION_RULES = {
    "DE": ["BSA/AML", "EFTA/Reg E"],
    "WY": ["BSA/AML", "Wyoming DAA"],
    "CO": ["BSA/AML", "Colorado MSB"],
    "TX": ["BSA/AML", "Texas Finance Code"],
    "FL": ["BSA/AML", "Florida MSB"],
}

@router.post("/check", response_model=ComplianceResult)
async def check_compliance(check: ComplianceCheck):
    if check.jurisdiction.value not in JURISDICTION_RULES:
        raise HTTPException(status_code=400, detail="Unsupported jurisdiction")
    # ... compliance logic`,
    },
    {
      name: 'routes/transactions.py',
      path: 'prototype/routes/transactions.py',
      file_path: 'prototype/routes/transactions.py',
      size: 3230,
      content_preview: `"""Transaction monitoring routes."""
from fastapi import APIRouter, HTTPException
router = APIRouter()

@router.post("/submit")
async def submit_transaction(tx: dict):
    # Validate, check compliance, log to audit trail
    return {"status": "accepted", "tx_id": "..."}`,
    },
    {
      name: 'test_app.py',
      path: 'prototype/test_app.py',
      file_path: 'prototype/test_app.py',
      size: 2175,
      content_preview: `"""Tests for Anchrix Compliance API."""
import pytest
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["service"] == "Anchrix Compliance API"

def test_health():
    response = client.get("/health")
    assert response.status_code == 200

def test_compliance_check():
    response = client.post("/api/v1/compliance/check", json={...})
    assert response.status_code in [200, 422]`,
    },
    {
      name: 'requirements.txt',
      path: 'prototype/requirements.txt',
      file_path: 'prototype/requirements.txt',
      size: 155,
      content_preview: `fastapi>=0.104.0
uvicorn>=0.24.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
sqlalchemy>=2.0.0
asyncpg>=0.29.0
redis>=5.0.0
python-jose>=3.3.0
passlib>=1.7.4`,
    },
    {
      name: 'financial_model.json',
      path: 'financial_model/financial_model.json',
      file_path: 'financial_model/financial_model.json',
      size: 8406,
      content_preview: '(JSON financial model - view in Financial tab)',
    },
    {
      name: 'report_v1.md',
      path: 'compliance/report_v1.md',
      file_path: 'compliance/report_v1.md',
      size: 3862,
      content_preview: '(Markdown compliance report - view in Compliance tab)',
    },
    {
      name: 'gtm_strategy.md',
      path: 'gtm/gtm_strategy.md',
      file_path: 'gtm/gtm_strategy.md',
      size: 3861,
      content_preview: '(Markdown GTM strategy - view in GTM tab)',
    },
  ],
};

// ── Demo run metadata ────────────────────────────────────────────────────────

export const DEMO_RUN = {
  run_id: 'demo',
  concept: 'Anchrix - AI-powered stablecoin compliance and payout infrastructure',
  status: 'completed',
  created_at: '2026-03-28T22:57:30.000000+00:00',
  completed_at: '2026-03-28T22:58:30.000000+00:00',
  duration_seconds: 60,
  iterations: 3,
  pivots: 3,
  total_events: 35,
  total_agents_simulated: 1000015,
  api_cost_usd: 0.19,
  model_usage: {
    'gpt-4o': { calls: 18, tokens: 42000 },
    'gpt-4o-mini': { calls: 75, tokens: 31000 },
  },
};
