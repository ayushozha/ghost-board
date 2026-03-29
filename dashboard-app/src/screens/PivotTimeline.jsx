import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getRunTrace, connectLive } from "../api";

// ---------------------------------------------------------------------------
// Demo / fallback trace data (used when API + static file both unavailable)
// ---------------------------------------------------------------------------
const DEMO_TRACE = [
  {
    event_id: "demo-1", event_type: "STRATEGY_SET", source: "CEO",
    timestamp: new Date(Date.now() - 300000).toISOString(), triggered_by: null,
    payload: { strategy: "API-first B2B stablecoin payouts", target_market: "SMBs in fintech", details: "Launch with 5 enterprise clients before consumer rollout." },
  },
  {
    event_id: "demo-2", event_type: "PROTOTYPE_READY", source: "CTO",
    timestamp: new Date(Date.now() - 270000).toISOString(), triggered_by: "demo-1",
    payload: { files: ["api/payout.py", "api/auth.py"], description: "REST API prototype with stablecoin payout endpoints built using Codex." },
  },
  {
    event_id: "demo-3", event_type: "FINANCIAL_MODEL_READY", source: "CFO",
    timestamp: new Date(Date.now() - 255000).toISOString(), triggered_by: "demo-1",
    payload: { burn_rate: "$42k/mo", runway: "18 months", revenue_projection: "$1.2M ARR by month 12" },
  },
  {
    event_id: "demo-4", event_type: "BLOCKER", source: "Legal",
    timestamp: new Date(Date.now() - 240000).toISOString(), triggered_by: "demo-2",
    payload: { severity: "critical", area: "MSB Licensing", details: "Operating as a Money Services Business requires licenses in all 50 states. Estimated cost $2M+ and 12-month timeline.", citations: ["https://www.fincen.gov/money-services-business-registration", "31 CFR § 1022.380"], recommended_action: "Restrict to B2B in 5 pilot states with existing partnerships." },
  },
  {
    event_id: "demo-5", event_type: "PIVOT", source: "CEO",
    timestamp: new Date(Date.now() - 220000).toISOString(), triggered_by: "demo-4",
    payload: { pivot_reason: "MSB licensing in 50 states costs $2M+ and takes 12 months. Pivoting to B2B-only in 5 states reduces compliance cost to ~$50K.", new_strategy: "B2B API in TX, NY, CA, FL, IL only", changes: { CTO: "Remove /consumer/* endpoints, add enterprise SSO", CFO: "Reduce compliance budget from $2M to $50K, update burn rate", CMO: "Reposition as 'enterprise stablecoin API' not consumer app" } },
  },
  {
    event_id: "demo-6", event_type: "UPDATE", source: "CTO",
    timestamp: new Date(Date.now() - 200000).toISOString(), triggered_by: "demo-5",
    payload: { description: "Removed consumer onboarding flow. Added enterprise SSO (SAML 2.0). API now scoped to B2B only.", files_changed: ["api/payout.py", "api/auth.py", "api/enterprise_sso.py"] },
  },
  {
    event_id: "demo-7", event_type: "UPDATE", source: "CFO",
    timestamp: new Date(Date.now() - 195000).toISOString(), triggered_by: "demo-5",
    payload: { description: "Updated financial model: compliance cost reduced 40x from $2M to $50K. New burn rate $38k/mo.", burn_rate: "$38k/mo", compliance_cost: "$50K" },
  },
  {
    event_id: "demo-8", event_type: "GTM_READY", source: "CMO",
    timestamp: new Date(Date.now() - 180000).toISOString(), triggered_by: "demo-5",
    payload: { tagline: "The Enterprise Stablecoin API", positioning: "B2B-first, compliance-native stablecoin payouts for fintech platforms.", channels: ["Developer conferences", "FinTech newsletters", "LinkedIn B2B outreach"] },
  },
  {
    event_id: "demo-9", event_type: "SIMULATION_RESULT", source: "Market Sim",
    timestamp: new Date(Date.now() - 150000).toISOString(), triggered_by: "demo-7",
    payload: { rounds: 5, personas: 1000050, sentiment_score: 0.34, positive: 62, neutral: 21, negative: 17, top_concern: "Regulatory clarity in remaining states", vc_sentiment: 0.61, user_sentiment: 0.28, press_sentiment: 0.19 },
  },
  {
    event_id: "demo-10", event_type: "PIVOT", source: "CEO",
    timestamp: new Date(Date.now() - 120000).toISOString(), triggered_by: "demo-9",
    payload: { pivot_reason: "Simulation shows VCs love the B2B pivot (+0.61) but press is skeptical (+0.19). Adding a compliance transparency page and public audit trail to improve press sentiment.", new_strategy: "B2B API + public compliance dashboard", changes: { CTO: "Build public compliance status page at /compliance", CMO: "Add press kit with regulatory certifications" } },
  },
  {
    event_id: "demo-11", event_type: "COMPLIANCE_REPORT_READY", source: "Legal",
    timestamp: new Date(Date.now() - 90000).toISOString(), triggered_by: "demo-10",
    payload: { states: ["TX", "NY", "CA", "FL", "IL"], status: "In progress", citations: ["https://www.dfs.ny.gov/apps_and_licensing/virtual_currency_businesses", "https://www.tfc.texas.gov/divisions/consumer/money-services/"], estimated_completion: "Q2 2025" },
  },
  {
    event_id: "demo-12", event_type: "UPDATE", source: "CTO",
    timestamp: new Date(Date.now() - 60000).toISOString(), triggered_by: "demo-10",
    payload: { description: "Built public compliance dashboard. Real-time license status per state. Embeddable widget for enterprise clients.", files_changed: ["api/compliance_status.py", "frontend/ComplianceDashboard.jsx"] },
  },
];

// ---------------------------------------------------------------------------
// Color / sizing config per event type
// ---------------------------------------------------------------------------
const EVENT_STYLES = {
  STRATEGY_SET: {
    bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd",
    glow: "rgba(59,130,246,0.5)", size: 44, label: "STRATEGY",
    icon: "\u25C6",
  },
  BLOCKER: {
    bg: "#5f1e1e", border: "#ef4444", text: "#fca5a5",
    glow: "rgba(239,68,68,0.6)", size: 44, label: "BLOCKER",
    icon: "\u26A0", pulse: true,
  },
  PIVOT: {
    bg: "#5f4b1e", border: "#eab308", text: "#fde68a",
    glow: "rgba(234,179,8,0.7)", size: 60, label: "PIVOT",
    icon: "\u21BB", glowRing: true,
  },
  UPDATE: {
    bg: "#1e3f2e", border: "#22c55e", text: "#86efac",
    glow: "rgba(34,197,94,0.4)", size: 34, label: "UPDATE",
    icon: "\u2714",
  },
  SIMULATION_RESULT: {
    bg: "#3b1e5f", border: "#a855f7", text: "#d8b4fe",
    glow: "rgba(168,85,247,0.5)", size: 44, label: "SIM RESULT",
    icon: "\u2605",
  },
  FINANCIAL_MODEL_READY: {
    bg: "#1e3f2e", border: "#22c55e", text: "#86efac",
    glow: "rgba(34,197,94,0.4)", size: 34, label: "FINANCIAL",
    icon: "$",
  },
  GTM_READY: {
    bg: "#1e3f2e", border: "#22c55e", text: "#86efac",
    glow: "rgba(34,197,94,0.4)", size: 34, label: "GTM",
    icon: "\u{1F4E3}",
  },
  PROTOTYPE_READY: {
    bg: "#1e3f2e", border: "#22c55e", text: "#86efac",
    glow: "rgba(34,197,94,0.4)", size: 34, label: "PROTOTYPE",
    icon: "\u2699",
  },
  COMPLIANCE_REPORT_READY: {
    bg: "#1e3f2e", border: "#22c55e", text: "#86efac",
    glow: "rgba(34,197,94,0.4)", size: 34, label: "COMPLIANCE",
    icon: "\u{1F6E1}",
  },
};

const DEFAULT_STYLE = {
  bg: "#1f2937", border: "#6b7280", text: "#d1d5db",
  glow: "rgba(107,114,128,0.3)", size: 30, label: "EVENT",
  icon: "\u2022",
};

function getStyle(eventType) {
  return EVENT_STYLES[eventType] || DEFAULT_STYLE;
}

// ---------------------------------------------------------------------------
// Format payload fields as readable text
// ---------------------------------------------------------------------------
function formatPayloadField(key, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((v, i) =>
      typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)
    );
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

// Human-friendly key names
function humanKey(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// CSS keyframes injected once
// ---------------------------------------------------------------------------
const TIMELINE_STYLES = `
  @keyframes ptl-pulse {
    0%, 100% { transform: scale(1); opacity: 0.7; }
    50% { transform: scale(1.5); opacity: 0; }
  }
  @keyframes ptl-glowRing {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.6); opacity: 0; }
  }
  @keyframes ptl-slideInRight {
    from { transform: translateX(40px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes ptl-fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes ptl-dashFlow {
    to { stroke-dashoffset: -18; }
  }
  @keyframes ptl-panelSlideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes ptl-pivotPulseNode {
    0%, 100% { box-shadow: 0 0 16px rgba(234,179,8,0.7), 0 0 32px rgba(234,179,8,0.3); }
    50% { box-shadow: 0 0 28px rgba(234,179,8,0.9), 0 0 56px rgba(234,179,8,0.5); }
  }
  .ptl-scroll::-webkit-scrollbar {
    height: 8px;
  }
  .ptl-scroll::-webkit-scrollbar-track {
    background: #111827;
    border-radius: 4px;
  }
  .ptl-scroll::-webkit-scrollbar-thumb {
    background: #374151;
    border-radius: 4px;
  }
  .ptl-scroll::-webkit-scrollbar-thumb:hover {
    background: #4b5563;
  }
  .ptl-filter-btn {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 9999px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .ptl-filter-btn:hover {
    filter: brightness(1.2);
  }
  .ptl-zoom-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid #374151;
    background: #1f2937;
    color: #9ca3af;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    font-weight: 700;
    transition: all 0.15s ease;
    flex-shrink: 0;
    user-select: none;
  }
  .ptl-zoom-btn:hover {
    background: #374151;
    color: #e5e7eb;
  }
  .ptl-zoom-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  /* Mobile: ensure root div is at least full screen height for scrollability */
  .ptl-root-mobile {
    min-height: 100vh;
  }
  /* Desktop: root must not exceed viewport (flex layout drives it) */
  @media (min-width: 768px) {
    .ptl-root-mobile {
      min-height: 0;
    }
  }
  /* Touch-friendly timeline scrolling */
  .ptl-scroll {
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x proximity;
  }
  /* Filter bar: allow horizontal scroll on very small screens */
  .ptl-filter-bar {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .ptl-filter-bar::-webkit-scrollbar {
    display: none;
  }
  /* Minimum touch target for filter buttons */
  .ptl-filter-btn {
    min-height: 36px;
  }
  /* Minimum touch target for zoom buttons */
  .ptl-zoom-btn {
    min-height: 36px;
    min-width: 36px;
  }
`;

// ---------------------------------------------------------------------------
// Timeline Node
// ---------------------------------------------------------------------------
function TimelineNode({ event, isSelected, onClick, nodeRef, isNew, zoom }) {
  const s = getStyle(event.event_type);
  const isPivot = event.event_type === "PIVOT";
  const isBlocker = event.event_type === "BLOCKER";
  // Scale node width by zoom (zoom is 0.5-2.0, default 1.0)
  const baseWidth = isPivot ? 110 : s.size <= 34 ? 80 : 90;
  const nodeWidth = Math.round(baseWidth * zoom);

  return (
    <div
      ref={nodeRef}
      className="flex flex-col items-center cursor-pointer group flex-shrink-0"
      style={{
        width: nodeWidth,
        animation: isNew ? "ptl-slideInRight 0.4s ease-out both" : undefined,
      }}
      onClick={onClick}
    >
      {/* Agent label */}
      <div
        className="text-[11px] font-semibold mb-1.5 truncate max-w-full text-center transition-colors duration-200"
        style={{ color: isSelected ? s.text : "#9ca3af" }}
      >
        {event.source}
      </div>

      {/* Circle node */}
      <div
        className="relative rounded-full flex items-center justify-center transition-all duration-200 group-hover:scale-110"
        style={{
          width: s.size,
          height: s.size,
          background: s.bg,
          border: `${isSelected ? 3 : 2}px solid ${s.border}`,
          boxShadow: isSelected
            ? `0 0 24px ${s.glow}, 0 0 48px ${s.glow}`
            : undefined,
          animation: isPivot && !isSelected
            ? "ptl-pivotPulseNode 2.5s ease-in-out infinite"
            : isBlocker && !isSelected
            ? undefined
            : undefined,
        }}
      >
        <span
          className="select-none"
          style={{
            color: s.text,
            fontSize: isPivot ? "20px" : s.size <= 34 ? "12px" : "16px",
          }}
        >
          {s.icon}
        </span>

        {/* Pulse ring for BLOCKER */}
        {isBlocker && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `2px solid ${s.border}`,
              animation: "ptl-pulse 2s ease-in-out infinite",
            }}
          />
        )}

        {/* Glow ring for PIVOT */}
        {isPivot && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `2px solid ${s.border}`,
              animation: "ptl-glowRing 2.5s ease-in-out infinite",
            }}
          />
        )}
      </div>

      {/* Type label */}
      <div
        className="text-[10px] font-bold mt-1.5 tracking-wider uppercase text-center whitespace-nowrap"
        style={{ color: s.text }}
      >
        {s.label}
      </div>

      {/* Timestamp */}
      {event.timestamp && (
        <div className="text-[9px] text-gray-600 mt-0.5">
          {new Date(event.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Causality SVG (dashed arcs connecting triggered_by relationships)
// ---------------------------------------------------------------------------
function CausalityArcs({ events, nodePositions, selectedEventId }) {
  const arcs = useMemo(() => {
    const result = [];
    events.forEach((evt, idx) => {
      if (!evt.triggered_by) return;
      const fromIdx = events.findIndex((e) => e.event_id === evt.triggered_by);
      if (fromIdx < 0) return;
      const from = nodePositions[fromIdx];
      const to = nodePositions[idx];
      if (!from || !to) return;
      const isRelatedToSelected = selectedEventId &&
        (evt.event_id === selectedEventId ||
         evt.triggered_by === selectedEventId ||
         events.find(e => e.event_id === selectedEventId)?.triggered_by === evt.event_id);
      result.push({ from, to, idx, fromIdx, eventType: evt.event_type, isRelatedToSelected });
    });
    return result;
  }, [events, nodePositions, selectedEventId]);

  if (arcs.length === 0) return null;

  const allPositions = Object.values(nodePositions);
  if (allPositions.length === 0) return null;
  const maxX = Math.max(...allPositions.map((p) => p.x), 0) + 200;
  const maxArc = 90;

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      width={maxX}
      height={200}
      style={{ overflow: "visible" }}
    >
      <defs>
        {arcs.map((a, i) => {
          const s = getStyle(a.eventType);
          const highlighted = a.isRelatedToSelected;
          return (
            <linearGradient
              key={`cg-${i}`}
              id={`cg-${i}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={s.border} stopOpacity={highlighted ? 0.5 : 0.15} />
              <stop offset="50%" stopColor={s.border} stopOpacity={highlighted ? 1.0 : 0.55} />
              <stop offset="100%" stopColor={s.border} stopOpacity={highlighted ? 0.5 : 0.15} />
            </linearGradient>
          );
        })}
        {/* Per-type arrow markers */}
        {["STRATEGY_SET","BLOCKER","PIVOT","UPDATE","SIMULATION_RESULT"].map((et) => {
          const s = getStyle(et);
          return (
            <marker
              key={`arrow-${et}`}
              id={`ptl-arrow-${et}`}
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={s.border} opacity="0.8" />
            </marker>
          );
        })}
        <marker
          id="ptl-arrow-default"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#9ca3af" opacity="0.6" />
        </marker>
      </defs>
      {arcs.map((a, i) => {
        const midX = (a.from.x + a.to.x) / 2;
        const dist = Math.abs(a.to.x - a.from.x);
        const arcHeight = Math.min(maxArc, dist * 0.35 + 20);
        const arcY = a.from.y - arcHeight;
        const highlighted = a.isRelatedToSelected;
        const strokeW = highlighted ? 2.5 : 1.5;
        const dashArray = highlighted ? "8 4" : "5 5";
        const animDuration = highlighted ? "1.8s" : "3s";
        const markerType = ["STRATEGY_SET","BLOCKER","PIVOT","UPDATE","SIMULATION_RESULT"].includes(a.eventType)
          ? a.eventType : "default";
        return (
          <path
            key={i}
            d={`M ${a.from.x} ${a.from.y} Q ${midX} ${arcY} ${a.to.x} ${a.to.y}`}
            fill="none"
            stroke={`url(#cg-${i})`}
            strokeWidth={strokeW}
            strokeDasharray={dashArray}
            markerEnd={`url(#ptl-arrow-${markerType})`}
            style={{
              animation: `ptl-dashFlow ${animDuration} linear infinite`,
              opacity: selectedEventId && !highlighted ? 0.3 : 1,
              transition: "opacity 0.25s ease",
            }}
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Horizontal connector lines between consecutive nodes
// ---------------------------------------------------------------------------
function HorizontalConnectors({ nodePositions, eventCount }) {
  const segments = useMemo(() => {
    const result = [];
    for (let i = 0; i < eventCount - 1; i++) {
      const a = nodePositions[i];
      const b = nodePositions[i + 1];
      if (a && b) {
        result.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, key: i });
      }
    }
    return result;
  }, [nodePositions, eventCount]);

  if (segments.length === 0) return null;
  const maxX = Math.max(...Object.values(nodePositions).map((p) => p.x), 0) + 200;

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      width={maxX}
      height={200}
      style={{ overflow: "visible" }}
    >
      {segments.map((seg) => (
        <line
          key={seg.key}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke="#374151"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// BLOCKER detail renderer
// ---------------------------------------------------------------------------
function BlockerDetail({ payload }) {
  return (
    <div className="space-y-3">
      {payload.severity && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wider w-24 flex-shrink-0">
            Severity
          </span>
          <span
            className={`text-sm font-semibold px-2 py-0.5 rounded ${
              payload.severity === "critical" || payload.severity === "high"
                ? "bg-red-900/40 text-red-300 border border-red-800/50"
                : "bg-yellow-900/40 text-yellow-300 border border-yellow-800/50"
            }`}
          >
            {payload.severity}
          </span>
        </div>
      )}
      {payload.area && (
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wider w-24 flex-shrink-0 mt-0.5">
            Area
          </span>
          <span className="text-sm text-gray-200">{payload.area}</span>
        </div>
      )}
      {(payload.details || payload.description) && (
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wider w-24 flex-shrink-0 mt-0.5">
            Details
          </span>
          <span className="text-sm text-gray-300 leading-relaxed">
            {payload.details || payload.description}
          </span>
        </div>
      )}
      {payload.citations && payload.citations.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wider w-24 flex-shrink-0 mt-0.5">
            Citations
          </span>
          <ul className="space-y-1">
            {payload.citations.map((cite, i) => (
              <li key={i}>
                {typeof cite === "string" && cite.startsWith("http") ? (
                  <a
                    href={cite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline text-sm break-all"
                  >
                    {cite}
                  </a>
                ) : (
                  <span className="text-sm text-gray-300">
                    {typeof cite === "string" ? cite : JSON.stringify(cite)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {payload.recommended_action && (
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wider w-24 flex-shrink-0 mt-0.5">
            Action
          </span>
          <span className="text-sm text-yellow-200 leading-relaxed">
            {payload.recommended_action}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PIVOT detail renderer
// ---------------------------------------------------------------------------
function PivotDetail({ payload }) {
  return (
    <div className="space-y-3">
      {(payload.pivot_reason || payload.reason || payload.details) && (
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">
            Pivot Reason
          </span>
          <p className="text-sm text-yellow-100 leading-relaxed bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-3">
            {payload.pivot_reason || payload.reason || payload.details}
          </p>
        </div>
      )}
      {payload.changes && typeof payload.changes === "object" && (
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider block mb-2">
            Agent Changes
          </span>
          <div className="space-y-2">
            {Object.entries(payload.changes).map(([agent, change]) => (
              <div
                key={agent}
                className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3"
              >
                <span className="text-xs font-bold text-blue-300 uppercase">
                  {agent}
                </span>
                <p className="text-sm text-gray-300 mt-1">
                  {typeof change === "string"
                    ? change
                    : JSON.stringify(change, null, 2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {payload.new_strategy && (
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">
            New Strategy
          </span>
          <p className="text-sm text-gray-200 leading-relaxed">
            {payload.new_strategy}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic payload renderer (readable text, not raw JSON)
// ---------------------------------------------------------------------------
function GenericPayload({ payload }) {
  if (!payload || typeof payload !== "object") {
    return <p className="text-gray-500 text-sm italic">No payload data</p>;
  }
  const entries = Object.entries(payload).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );
  if (entries.length === 0) {
    return <p className="text-gray-500 text-sm italic">Empty payload</p>;
  }

  return (
    <div className="space-y-2.5">
      {entries.map(([key, value]) => {
        const formatted = formatPayloadField(key, value);
        if (formatted === null) return null;
        return (
          <div key={key} className="flex items-start gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider w-28 flex-shrink-0 mt-0.5">
              {humanKey(key)}
            </span>
            <div className="text-sm text-gray-200 min-w-0 flex-1">
              {Array.isArray(formatted) ? (
                <ul className="space-y-1">
                  {formatted.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-gray-600 mt-0.5">&bull;</span>
                      {item.includes("\n") ? (
                        <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap">
                          {item}
                        </pre>
                      ) : (
                        <span>{item}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : typeof value === "string" && value.startsWith("http") ? (
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline break-all"
                >
                  {value}
                </a>
              ) : typeof formatted === "string" && formatted.includes("\n") ? (
                <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap bg-gray-900/50 rounded p-2 max-h-48 overflow-y-auto">
                  {formatted}
                </pre>
              ) : (
                <span className="leading-relaxed">{formatted}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel (bottom 40%)
// ---------------------------------------------------------------------------
function DetailPanel({ event, allEvents, onSelectEvent }) {
  if (!event) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600">
        <div className="text-center">
          <div className="text-3xl mb-2">{"\u25C6"}</div>
          <div className="text-sm">Click any event node to view details</div>
        </div>
      </div>
    );
  }

  const s = getStyle(event.event_type);
  const trigger = event.triggered_by
    ? allEvents.find((e) => e.event_id === event.triggered_by)
    : null;
  const downstream = allEvents.filter(
    (e) => e.triggered_by === event.event_id
  );
  const payload = event.payload || {};

  const isBlocker = event.event_type === "BLOCKER";
  const isPivot = event.event_type === "PIVOT";

  return (
    <div
      className="h-full overflow-y-auto px-6 py-4"
      style={{ animation: "ptl-fadeIn 0.25s ease-out" }}
    >
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: main detail */}
        <div>
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <span
              className="text-xl w-9 h-9 flex items-center justify-center rounded-lg"
              style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                color: s.text,
              }}
            >
              {s.icon}
            </span>
            <div>
              <span
                className="text-xs font-bold tracking-wider px-2 py-0.5 rounded"
                style={{
                  background: s.bg,
                  color: s.text,
                  border: `1px solid ${s.border}`,
                }}
              >
                {s.label}
              </span>
              <div className="text-gray-400 text-xs mt-1">
                {event.source}
                {event.iteration ? ` | Iteration ${event.iteration}` : ""}
                {event.timestamp && (
                  <>
                    {" | "}
                    {new Date(event.timestamp).toLocaleString()}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Triggered By link */}
          {trigger && (
            <button
              onClick={() => onSelectEvent(trigger)}
              className="mb-4 w-full text-left p-3 rounded-lg bg-gray-800/60 border border-gray-700 hover:border-gray-500 hover:bg-gray-800 transition-all group"
            >
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                Triggered By (click to jump)
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: getStyle(trigger.event_type).bg,
                    color: getStyle(trigger.event_type).text,
                    border: `1px solid ${getStyle(trigger.event_type).border}`,
                  }}
                >
                  {getStyle(trigger.event_type).label}
                </span>
                <span className="text-gray-300 text-sm">{trigger.source}</span>
                <span className="text-gray-600 text-xs ml-auto group-hover:text-gray-400 transition-colors">
                  {"\u2192"}
                </span>
              </div>
              {(trigger.payload?.details || trigger.payload?.description) && (
                <p className="text-gray-500 text-xs mt-1 truncate">
                  {(
                    trigger.payload.details || trigger.payload.description
                  ).slice(0, 100)}
                </p>
              )}
            </button>
          )}

          {/* Payload content - type-specific rendering */}
          <div className="mb-4">
            {isBlocker ? (
              <BlockerDetail payload={payload} />
            ) : isPivot ? (
              <PivotDetail payload={payload} />
            ) : (
              <GenericPayload payload={payload} />
            )}
          </div>
        </div>

        {/* Right: downstream events */}
        <div className="lg:border-l lg:border-gray-800 lg:pl-6">
          <h4 className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-3">
            Triggered Events ({downstream.length})
          </h4>
          {downstream.length === 0 ? (
            <p className="text-gray-600 text-xs italic">
              No downstream events
            </p>
          ) : (
            <div className="space-y-2">
              {downstream.map((d) => {
                const ds = getStyle(d.event_type);
                return (
                  <button
                    key={d.event_id}
                    onClick={() => onSelectEvent(d)}
                    className="w-full text-left p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 hover:border-gray-500 hover:bg-gray-800/60 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          background: ds.bg,
                          color: ds.text,
                          border: `1px solid ${ds.border}`,
                        }}
                      >
                        {ds.label}
                      </span>
                      <span className="text-gray-400 text-xs truncate">
                        {d.source}
                      </span>
                    </div>
                    {(d.payload?.details ||
                      d.payload?.description ||
                      d.payload?.reason) && (
                      <p className="text-gray-600 text-[11px] mt-1 truncate">
                        {(
                          d.payload.details ||
                          d.payload.description ||
                          d.payload.reason
                        ).slice(0, 80)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Event ID */}
          <div className="mt-6 pt-4 border-t border-gray-800/50">
            <div className="text-[9px] text-gray-700 font-mono break-all">
              event_id: {event.event_id}
            </div>
            {event.triggered_by && (
              <div className="text-[9px] text-gray-700 font-mono break-all mt-1">
                triggered_by: {event.triggered_by}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter configuration
// ---------------------------------------------------------------------------
const FILTER_TYPES = [
  { key: "ALL", label: "ALL", color: "#6b7280", activeColor: "#e5e7eb", activeBg: "#374151", activeBorder: "#6b7280" },
  { key: "STRATEGY", label: "STRATEGY", color: "#93c5fd", activeColor: "#93c5fd", activeBg: "#1e3a5f", activeBorder: "#3b82f6" },
  { key: "BLOCKER", label: "BLOCKER", color: "#fca5a5", activeColor: "#fca5a5", activeBg: "#5f1e1e", activeBorder: "#ef4444" },
  { key: "PIVOT", label: "PIVOT", color: "#fde68a", activeColor: "#fde68a", activeBg: "#5f4b1e", activeBorder: "#eab308" },
  { key: "UPDATE", label: "UPDATE", color: "#86efac", activeColor: "#86efac", activeBg: "#1e3f2e", activeBorder: "#22c55e" },
  { key: "SIM", label: "SIM", color: "#d8b4fe", activeColor: "#d8b4fe", activeBg: "#3b1e5f", activeBorder: "#a855f7" },
];

// Map event_type values to filter keys
function getFilterKey(eventType) {
  if (!eventType) return "UPDATE";
  const t = eventType.toUpperCase();
  if (t === "STRATEGY_SET") return "STRATEGY";
  if (t === "BLOCKER") return "BLOCKER";
  if (t === "PIVOT") return "PIVOT";
  if (t.includes("SIMULATION")) return "SIM";
  return "UPDATE";
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------
function FilterBar({ activeFilter, onFilterChange, eventCounts }) {
  return (
    <div className="ptl-filter-bar flex items-center gap-1.5">
      {FILTER_TYPES.map((ft) => {
        const isActive = activeFilter === ft.key;
        const count = ft.key === "ALL" ? eventCounts.total : (eventCounts[ft.key] || 0);
        return (
          <button
            key={ft.key}
            className="ptl-filter-btn"
            style={{
              background: isActive ? ft.activeBg : "transparent",
              color: isActive ? ft.activeColor : "#6b7280",
              borderColor: isActive ? ft.activeBorder : "#374151",
            }}
            onClick={() => onFilterChange(ft.key)}
          >
            {ft.label}
            {count > 0 && (
              <span
                style={{
                  marginLeft: 5,
                  fontSize: 10,
                  opacity: 0.75,
                  fontWeight: 500,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zoom controls
// ---------------------------------------------------------------------------
function ZoomControls({ zoom, onZoomChange }) {
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.25;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider select-none">zoom</span>
      <button
        className="ptl-zoom-btn"
        onClick={() => onZoomChange(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
        disabled={zoom <= ZOOM_MIN}
        title="Zoom out"
      >
        −
      </button>
      <span
        className="text-xs text-gray-400 tabular-nums select-none"
        style={{ minWidth: 32, textAlign: "center" }}
      >
        {Math.round(zoom * 100)}%
      </span>
      <button
        className="ptl-zoom-btn"
        onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
        disabled={zoom >= ZOOM_MAX}
        title="Zoom in"
      >
        +
      </button>
      <button
        className="ptl-zoom-btn"
        onClick={() => onZoomChange(1.0)}
        title="Reset zoom"
        style={{ fontSize: 10, fontWeight: 600 }}
      >
        ⟳
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------
function StatsBar({ events }) {
  const stats = useMemo(() => {
    let pivots = 0,
      blockers = 0,
      strategies = 0,
      simResults = 0;
    for (const e of events) {
      if (e.event_type === "PIVOT") pivots++;
      else if (e.event_type === "BLOCKER") blockers++;
      else if (e.event_type === "STRATEGY_SET") strategies++;
      else if (e.event_type === "SIMULATION_RESULT") simResults++;
    }
    return { total: events.length, pivots, blockers, strategies, simResults };
  }, [events]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 tabular-nums">
        {stats.total} events
      </div>
      {stats.strategies > 0 && (
        <div className="text-xs px-2 py-1 rounded bg-blue-900/30 border border-blue-800/50 text-blue-300 tabular-nums">
          {stats.strategies} strategies
        </div>
      )}
      {stats.pivots > 0 && (
        <div className="text-xs px-2 py-1 rounded bg-yellow-900/30 border border-yellow-800/50 text-yellow-300 tabular-nums">
          {stats.pivots} pivots
        </div>
      )}
      {stats.blockers > 0 && (
        <div className="text-xs px-2 py-1 rounded bg-red-900/30 border border-red-800/50 text-red-300 tabular-nums">
          {stats.blockers} blockers
        </div>
      )}
      {stats.simResults > 0 && (
        <div className="text-xs px-2 py-1 rounded bg-purple-900/30 border border-purple-800/50 text-purple-300 tabular-nums">
          {stats.simResults} sim results
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function PivotTimeline({ runId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [nodePositions, setNodePositions] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [newEventIds, setNewEventIds] = useState(new Set());
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [zoom, setZoom] = useState(1.0);

  const scrollRef = useRef(null);
  const nodesRef = useRef({});
  const wsRef = useRef(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // ── Compute filtered events ────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    if (activeFilter === "ALL") return events;
    return events.filter((e) => getFilterKey(e.event_type) === activeFilter);
  }, [events, activeFilter]);

  // ── Compute event counts for filter bar ───────────────────────────
  const eventCounts = useMemo(() => {
    const counts = { total: events.length };
    for (const ft of FILTER_TYPES) {
      if (ft.key !== "ALL") {
        counts[ft.key] = events.filter((e) => getFilterKey(e.event_type) === ft.key).length;
      }
    }
    return counts;
  }, [events]);

  // ── Fetch initial trace data ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const id = runId || "latest";
        const data = await getRunTrace(id);
        const trace =
          data.trace || data.events || (Array.isArray(data) ? data : []);
        if (!cancelled) {
          setEvents(trace);
        }
      } catch (err) {
        // Fallback 1: try static trace.json
        try {
          const res = await fetch("/outputs/trace.json");
          if (res.ok) {
            const data = await res.json();
            const trace = Array.isArray(data) ? data : data.trace || data.events || [];
            if (!cancelled) setEvents(trace.length > 0 ? trace : DEMO_TRACE);
          } else {
            // Fallback 2: use built-in demo data
            if (!cancelled) setEvents(DEMO_TRACE);
          }
        } catch {
          // Fallback 2: use built-in demo data
          if (!cancelled) setEvents(DEMO_TRACE);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // ── WebSocket for real-time events ─────────────────────────────────
  useEffect(() => {
    if (!runId) return;

    const ws = connectLive(runId, {
      onEvent: (event) => {
        // Append new event if not already present
        setEvents((prev) => {
          const exists = prev.some((e) => e.event_id === event.event_id);
          if (exists) return prev;
          return [...prev, event];
        });
        // Track as "new" for animation
        if (event.event_id) {
          setNewEventIds((prev) => new Set(prev).add(event.event_id));
          // Remove "new" flag after animation completes
          setTimeout(() => {
            setNewEventIds((prev) => {
              const next = new Set(prev);
              next.delete(event.event_id);
              return next;
            });
          }, 600);
        }
      },
      onOpen: () => setWsConnected(true),
      onClose: () => setWsConnected(false),
      onError: () => setWsConnected(false),
    });

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [runId]);

  // ── Auto-scroll to latest event when new ones arrive ───────────────
  useEffect(() => {
    if (newEventIds.size > 0 && scrollRef.current) {
      const container = scrollRef.current;
      // Smooth scroll to the right end
      container.scrollTo({
        left: container.scrollWidth,
        behavior: "smooth",
      });
    }
  }, [events.length, newEventIds]);

  // ── Calculate node positions for SVG lines ─────────────────────────
  const updatePositions = useCallback(() => {
    const positions = {};
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const scrollRect = scrollEl.getBoundingClientRect();

    Object.entries(nodesRef.current).forEach(([idx, el]) => {
      if (el) {
        const rect = el.getBoundingClientRect();
        positions[idx] = {
          x:
            rect.left -
            scrollRect.left +
            rect.width / 2 +
            scrollEl.scrollLeft,
          y: rect.top - scrollRect.top + rect.height / 2,
        };
      }
    });
    setNodePositions(positions);
  }, []);

  useEffect(() => {
    const timer = setTimeout(updatePositions, 80);
    return () => clearTimeout(timer);
  }, [events, filteredEvents, zoom, updatePositions]);

  // ── Select event handler (also scrolls timeline to that node) ──────
  const handleSelectEvent = useCallback(
    (evt) => {
      setSelected((prev) =>
        prev?.event_id === evt.event_id ? null : evt
      );
      // Scroll to the node in the timeline (use filteredEvents for node index)
      const idx = filteredEvents.findIndex((e) => e.event_id === evt.event_id);
      if (idx >= 0 && nodesRef.current[idx]) {
        nodesRef.current[idx].scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    },
    [filteredEvents]
  );

  // ── When filter changes, clear selection if selected event is now hidden ──
  useEffect(() => {
    if (selected && !filteredEvents.some(e => e.event_id === selected.event_id)) {
      setSelected(null);
    }
  }, [activeFilter, filteredEvents, selected]);

  // ── Loading / Error / Empty states ─────────────────────────────────
  if (loading) {
    return (
      <div className="h-full bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-gray-400 text-sm">Loading timeline...</div>
        </div>
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="h-full bg-gray-950 flex items-center justify-center">
        <div className="text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-6 max-w-md">
          <div className="font-semibold mb-2">Failed to load trace</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="h-full bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-center">
          <div className="text-4xl mb-4">{"\u25C6"}</div>
          <div className="text-sm">No events yet.</div>
          {runId && (
            <div className="text-xs text-gray-600 mt-2">
              Waiting for events on run {runId}...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Compute base node spacing based on zoom
  const baseNodeGap = Math.round(4 * zoom);
  const minWidth = filteredEvents.length * Math.round(100 * zoom) + 200;

  // ── Main render ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:h-full bg-gray-950 text-gray-100 ptl-root-mobile">
      <style>{TIMELINE_STYLES}</style>

      {/* ── Header bar ── */}
      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/60 backdrop-blur-sm px-3 sm:px-4 py-2 sm:py-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Left: title + live indicator */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">{"\u25C6"}</span>
              <span className="hidden sm:inline">Pivot Timeline</span>
              <span className="sm:hidden">Timeline</span>
            </h2>
            {wsConnected && (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="hidden sm:inline">Live</span>
              </div>
            )}
          </div>

          {/* Center: filter buttons — scrollable on mobile */}
          <div className="flex-1 flex justify-center overflow-x-auto">
            <FilterBar
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              eventCounts={eventCounts}
            />
          </div>

          {/* Right: zoom controls + stats */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <ZoomControls zoom={zoom} onZoomChange={setZoom} />
            <div className="hidden sm:block">
              <StatsBar events={events} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Timeline area — fixed height on desktop, scrollable on mobile ── */}
      <div className="md:flex-[6] md:min-h-0 relative border-b border-gray-800" style={{ minHeight: '200px' }}>
        {filteredEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 py-12">
            <div className="text-center">
              <div className="text-2xl mb-2">⊘</div>
              <div className="text-sm">No events match the current filter.</div>
              <button
                className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline min-h-[44px]"
                onClick={() => setActiveFilter("ALL")}
              >
                Show all events
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="ptl-scroll h-full overflow-x-auto overflow-y-hidden relative"
            style={{ WebkitOverflowScrolling: 'touch' }}
            onScroll={updatePositions}
          >
            {/* Min width to ensure scrollability — key for mobile horizontal scroll */}
            <div
              className="relative h-full flex items-center"
              style={{ minWidth: Math.max(minWidth, 600), paddingLeft: 40, paddingRight: 80 }}
            >
              {/* Horizontal connectors */}
              <HorizontalConnectors
                nodePositions={nodePositions}
                eventCount={filteredEvents.length}
              />

              {/* Causality arcs */}
              <CausalityArcs
                events={filteredEvents}
                nodePositions={nodePositions}
                selectedEventId={selected?.event_id}
              />

              {/* Event nodes */}
              <div
                className="relative flex items-center"
                style={{ gap: baseNodeGap }}
              >
                {filteredEvents.map((evt, idx) => {
                  const isSelected = selected?.event_id === evt.event_id;
                  const isNew = newEventIds.has(evt.event_id);
                  return (
                    <TimelineNode
                      key={evt.event_id || idx}
                      event={evt}
                      isSelected={isSelected}
                      onClick={() => handleSelectEvent(evt)}
                      nodeRef={(el) => (nodesRef.current[idx] = el)}
                      isNew={isNew}
                      zoom={zoom}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-10 bg-gradient-to-r from-gray-950 to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-6 sm:w-10 bg-gradient-to-l from-gray-950 to-transparent pointer-events-none z-10" />
      </div>

      {/* ── Detail panel ── */}
      <div className="md:flex-[4] md:min-h-0 bg-gray-900/40 overflow-y-auto" style={{ minHeight: '200px' }}>
        <DetailPanel
          event={selected}
          allEvents={events}
          onSelectEvent={handleSelectEvent}
        />
      </div>
    </div>
  );
}
