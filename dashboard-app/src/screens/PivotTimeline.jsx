import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ---------------------------------------------------------------------------
// Color palette per event type
// ---------------------------------------------------------------------------
const EVENT_COLORS = {
  STRATEGY_SET: { bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd", glow: "rgba(59,130,246,0.5)" },
  BLOCKER: { bg: "#5f1e1e", border: "#ef4444", text: "#fca5a5", glow: "rgba(239,68,68,0.5)" },
  PIVOT: { bg: "#5f4b1e", border: "#eab308", text: "#fde68a", glow: "rgba(234,179,8,0.6)" },
  UPDATE: { bg: "#1e3f2e", border: "#22c55e", text: "#86efac", glow: "rgba(34,197,94,0.4)" },
  SIMULATION_RESULT: { bg: "#3b1e5f", border: "#a855f7", text: "#d8b4fe", glow: "rgba(168,85,247,0.5)" },
  FINANCIAL_MODEL_READY: { bg: "#1e3f2e", border: "#22c55e", text: "#86efac", glow: "rgba(34,197,94,0.4)" },
  GTM_READY: { bg: "#1e3f2e", border: "#22c55e", text: "#86efac", glow: "rgba(34,197,94,0.4)" },
  PROTOTYPE_READY: { bg: "#1e3f2e", border: "#22c55e", text: "#86efac", glow: "rgba(34,197,94,0.4)" },
  COMPLIANCE_REPORT_READY: { bg: "#1e3f2e", border: "#22c55e", text: "#86efac", glow: "rgba(34,197,94,0.4)" },
};

const DEFAULT_COLOR = { bg: "#1f2937", border: "#6b7280", text: "#d1d5db", glow: "rgba(107,114,128,0.3)" };

function getColor(eventType) {
  return EVENT_COLORS[eventType] || DEFAULT_COLOR;
}

function eventLabel(eventType) {
  const map = {
    STRATEGY_SET: "STRATEGY",
    BLOCKER: "BLOCKER",
    PIVOT: "PIVOT",
    UPDATE: "UPDATE",
    SIMULATION_RESULT: "SIM RESULT",
    FINANCIAL_MODEL_READY: "FINANCIAL",
    GTM_READY: "GTM",
    PROTOTYPE_READY: "PROTOTYPE",
    COMPLIANCE_REPORT_READY: "COMPLIANCE",
  };
  return map[eventType] || eventType;
}

function eventIcon(eventType) {
  const icons = {
    STRATEGY_SET: "\u25C6",
    BLOCKER: "\u26A0",
    PIVOT: "\u21BB",
    UPDATE: "\u2022",
    SIMULATION_RESULT: "\u2605",
    FINANCIAL_MODEL_READY: "$",
    GTM_READY: "\u{1F4E3}",
    PROTOTYPE_READY: "\u2699",
    COMPLIANCE_REPORT_READY: "\u{1F6E1}",
  };
  return icons[eventType] || "\u2022";
}

// ---------------------------------------------------------------------------
// Render payload values recursively
// ---------------------------------------------------------------------------
function renderValue(value, color) {
  if (value === null || value === undefined) {
    return <span className="text-gray-500 italic">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className={value ? "text-green-400" : "text-red-400"}>{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-cyan-300 font-mono">{value}</span>;
  }
  if (typeof value === "string") {
    if (value.startsWith("{") || value.startsWith("[")) {
      try {
        const parsed = JSON.parse(value);
        return (
          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap bg-gray-900/50 rounded p-2 mt-1 max-h-48 overflow-y-auto">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        /* not JSON */
      }
    }
    if (value.startsWith("http")) {
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline break-all">
          {value}
        </a>
      );
    }
    return <span className="leading-relaxed">{value}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-none space-y-1 mt-1">
        {value.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-gray-600 mt-0.5 flex-shrink-0">&bull;</span>
            <span className="text-sm">{renderValue(item, color)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap bg-gray-900/50 rounded p-2 mt-1 max-h-48 overflow-y-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <span>{String(value)}</span>;
}

function renderPayload(payload, color) {
  if (!payload || typeof payload !== "object") {
    return <div className="text-gray-400 text-sm italic">No payload</div>;
  }
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return <div className="text-gray-400 text-sm italic">Empty payload</div>;
  }
  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3">
          <div className="text-xs text-gray-500 font-mono mb-1">{key}</div>
          <div className="text-sm text-gray-200">{renderValue(value, color)}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel (slide-in from right)
// ---------------------------------------------------------------------------
function DetailPanel({ event, allEvents, onClose }) {
  if (!event) return null;
  const color = getColor(event.event_type);
  const trigger = event.triggered_by
    ? allEvents.find((e) => e.event_id === event.triggered_by)
    : null;
  const downstream = allEvents.filter((e) => e.triggered_by === event.event_id);
  const payload = event.payload || {};

  return (
    <div className="fixed inset-0 z-50 flex" style={{ animation: "pivot-slideIn 0.25s ease-out" }}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="w-[480px] max-w-[90vw] h-full overflow-y-auto border-l-2 p-6"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", borderColor: color.border }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span
              className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg"
              style={{ background: color.bg, border: `1px solid ${color.border}` }}
            >
              {eventIcon(event.event_type)}
            </span>
            <div>
              <span
                className="text-xs font-bold tracking-wider px-2 py-0.5 rounded"
                style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
              >
                {eventLabel(event.event_type)}
              </span>
              <div className="text-gray-400 text-xs mt-1">
                {event.source} {event.iteration ? `| Iteration ${event.iteration}` : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none transition-colors w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700"
          >
            &times;
          </button>
        </div>

        {/* Timestamp */}
        {event.timestamp && (
          <div className="text-gray-500 text-xs font-mono mb-4">
            {new Date(event.timestamp).toLocaleString()}
          </div>
        )}

        {/* Triggered by */}
        {trigger && (
          <div className="mb-4 p-3 rounded-lg bg-gray-800/60 border border-gray-700">
            <div className="text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wider">Triggered By</div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  background: getColor(trigger.event_type).bg,
                  color: getColor(trigger.event_type).text,
                  border: `1px solid ${getColor(trigger.event_type).border}`,
                }}
              >
                {eventLabel(trigger.event_type)}
              </span>
              <span className="text-gray-300 text-sm">{trigger.source}</span>
            </div>
            {(trigger.payload?.description || trigger.payload?.details) && (
              <p className="text-gray-400 text-xs mt-1 line-clamp-2">
                {trigger.payload.description || trigger.payload.details}
              </p>
            )}
          </div>
        )}

        {/* Payload */}
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Payload</h3>
          {renderPayload(payload, color)}
        </div>

        {/* Downstream events */}
        {downstream.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Triggered ({downstream.length})
            </h3>
            <div className="space-y-2">
              {downstream.map((d) => {
                const dc = getColor(d.event_type);
                return (
                  <div key={d.event_id} className="p-2 rounded-lg bg-gray-800/40 border border-gray-700 flex items-center gap-2">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: dc.bg, color: dc.text, border: `1px solid ${dc.border}` }}
                    >
                      {eventLabel(d.event_type)}
                    </span>
                    <span className="text-gray-400 text-xs truncate">
                      {d.source} &mdash; {(d.payload?.details || d.payload?.description || d.payload?.startup_idea || "").slice(0, 60)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Raw event ID */}
        <div className="mt-6 pt-4 border-t border-gray-700/50">
          <div className="text-[10px] text-gray-600 font-mono break-all">ID: {event.event_id}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline node
// ---------------------------------------------------------------------------
function TimelineNode({ event, isSelected, isPivot, onClick }) {
  const color = getColor(event.event_type);
  const size = isPivot ? 56 : 40;

  return (
    <div
      className="flex flex-col items-center cursor-pointer group flex-shrink-0"
      style={{ width: isPivot ? 120 : 100 }}
      onClick={onClick}
    >
      {/* Agent label */}
      <div
        className="text-xs font-semibold mb-2 truncate max-w-full text-center transition-colors"
        style={{ color: isSelected ? color.text : "#9ca3af" }}
      >
        {event.source}
      </div>

      {/* Node circle */}
      <div
        className="relative rounded-full flex items-center justify-center transition-all duration-200 group-hover:scale-110"
        style={{
          width: size,
          height: size,
          background: color.bg,
          border: `2px solid ${color.border}`,
          boxShadow: isSelected
            ? `0 0 20px ${color.glow}, 0 0 40px ${color.glow}`
            : isPivot
            ? `0 0 12px ${color.glow}`
            : "none",
        }}
      >
        <span className="text-lg" style={{ color: color.text }}>{eventIcon(event.event_type)}</span>
        {isPivot && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `2px solid ${color.border}`,
              animation: "pivot-pulse 2s ease-in-out infinite",
              opacity: 0.5,
            }}
          />
        )}
      </div>

      {/* Type label */}
      <div className="text-[10px] font-bold mt-2 tracking-wider uppercase text-center" style={{ color: color.text }}>
        {eventLabel(event.event_type)}
      </div>

      {/* Iteration badge */}
      {event.iteration && (
        <div className="text-[9px] text-gray-500 mt-0.5">iter {event.iteration}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Causality SVG arcs
// ---------------------------------------------------------------------------
function CausalityLines({ events, nodePositions }) {
  const lines = useMemo(() => {
    const result = [];
    events.forEach((evt, idx) => {
      if (evt.triggered_by) {
        const triggerIdx = events.findIndex((e) => e.event_id === evt.triggered_by);
        if (triggerIdx >= 0 && nodePositions[triggerIdx] && nodePositions[idx]) {
          result.push({
            from: nodePositions[triggerIdx],
            to: nodePositions[idx],
            color: getColor(evt.event_type),
            key: `${triggerIdx}-${idx}`,
          });
        }
      }
    });
    return result;
  }, [events, nodePositions]);

  if (lines.length === 0) return null;

  const maxX = Math.max(...Object.values(nodePositions).map((p) => p.x), 0) + 200;

  return (
    <svg className="absolute top-0 left-0 pointer-events-none" width={maxX} height={160} style={{ overflow: "visible" }}>
      <defs>
        {lines.map((l) => (
          <linearGradient key={`g-${l.key}`} id={`g-${l.key}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={l.color.border} stopOpacity="0.3" />
            <stop offset="50%" stopColor={l.color.border} stopOpacity="0.8" />
            <stop offset="100%" stopColor={l.color.border} stopOpacity="0.3" />
          </linearGradient>
        ))}
        <marker id="pivot-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#9ca3af" opacity="0.6" />
        </marker>
      </defs>
      {lines.map((l) => {
        const midX = (l.from.x + l.to.x) / 2;
        const arcY = l.to.x > l.from.x ? l.from.y - 40 : l.from.y + 40;
        return (
          <path
            key={l.key}
            d={`M ${l.from.x} ${l.from.y} Q ${midX} ${arcY} ${l.to.x} ${l.to.y}`}
            fill="none"
            stroke={`url(#g-${l.key})`}
            strokeWidth="2"
            strokeDasharray="6 3"
            markerEnd="url(#pivot-arrow)"
            style={{ animation: "pivot-dashFlow 3s linear infinite" }}
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Playback controls
// ---------------------------------------------------------------------------
function PlaybackControls({ isPlaying, onToggle, speed, onSpeedChange, progress, total }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-800/60 rounded-lg border border-gray-700/50">
      <button onClick={onToggle} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 transition-colors text-white">
        {isPlaying ? "\u23F8" : "\u25B6"}
      </button>
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 font-mono tabular-nums">{progress}/{total}</span>
      <select
        value={speed}
        onChange={(e) => onSpeedChange(Number(e.target.value))}
        className="text-xs bg-gray-700 text-gray-300 border border-gray-600 rounded px-1.5 py-0.5"
      >
        <option value={500}>0.5x</option>
        <option value={1000}>1x</option>
        <option value={2000}>2x</option>
        <option value={3000}>3x</option>
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------
function FilterBar({ activeFilters, onToggle, eventCounts }) {
  const types = [
    "STRATEGY_SET", "BLOCKER", "PIVOT", "UPDATE", "SIMULATION_RESULT",
    "FINANCIAL_MODEL_READY", "GTM_READY", "PROTOTYPE_READY", "COMPLIANCE_REPORT_READY",
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {types.filter((t) => (eventCounts[t] || 0) > 0).map((type) => {
        const color = getColor(type);
        const active = activeFilters.includes(type);
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className="text-xs px-2.5 py-1 rounded-full border transition-all duration-200"
            style={{
              background: active ? color.bg : "transparent",
              borderColor: active ? color.border : "#374151",
              color: active ? color.text : "#6b7280",
              opacity: active ? 1 : 0.6,
            }}
          >
            {eventLabel(type)} ({eventCounts[type] || 0})
          </button>
        );
      })}
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
  const [activeFilters, setActiveFilters] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const [nodePositions, setNodePositions] = useState({});

  const scrollRef = useRef(null);
  const nodesRef = useRef({});
  const playbackTimer = useRef(null);

  // Fetch trace events
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Try API
        const id = runId || "latest";
        const res = await fetch(`/api/runs/${id}/trace`);
        if (res.ok) {
          const data = await res.json();
          const trace = data.trace || data.events || (Array.isArray(data) ? data : []);
          if (!cancelled) {
            setEvents(trace);
            setPlaybackIdx(trace.length);
          }
        } else {
          if (!cancelled) setEvents([]);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [runId]);

  const eventCounts = useMemo(() => {
    const counts = {};
    events.forEach((e) => { counts[e.event_type] = (counts[e.event_type] || 0) + 1; });
    return counts;
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (activeFilters.length === 0) return events;
    return events.filter((e) => activeFilters.includes(e.event_type));
  }, [events, activeFilters]);

  const visibleEvents = useMemo(() => {
    if (!isPlaying && playbackIdx >= filteredEvents.length) return filteredEvents;
    return filteredEvents.slice(0, playbackIdx + 1);
  }, [filteredEvents, playbackIdx, isPlaying]);

  // Calculate node positions
  const updatePositions = useCallback(() => {
    const positions = {};
    Object.entries(nodesRef.current).forEach(([idx, el]) => {
      if (el) {
        const rect = el.getBoundingClientRect();
        const scrollRect = scrollRef.current?.getBoundingClientRect();
        if (scrollRect) {
          positions[idx] = {
            x: rect.left - scrollRect.left + rect.width / 2 + (scrollRef.current?.scrollLeft || 0),
            y: rect.top - scrollRect.top + rect.height / 2,
          };
        }
      }
    });
    setNodePositions(positions);
  }, []);

  useEffect(() => {
    const timer = setTimeout(updatePositions, 100);
    return () => clearTimeout(timer);
  }, [visibleEvents, updatePositions]);

  // Playback timer
  useEffect(() => {
    if (isPlaying) {
      playbackTimer.current = setInterval(() => {
        setPlaybackIdx((prev) => {
          if (prev >= filteredEvents.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    } else {
      clearInterval(playbackTimer.current);
    }
    return () => clearInterval(playbackTimer.current);
  }, [isPlaying, playbackSpeed, filteredEvents.length]);

  // Scroll to latest during playback
  useEffect(() => {
    if (isPlaying && nodesRef.current[playbackIdx]) {
      nodesRef.current[playbackIdx].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [playbackIdx, isPlaying]);

  const toggleFilter = useCallback((type) => {
    setActiveFilters((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);
    setPlaybackIdx(999999);
  }, []);

  const togglePlayback = useCallback(() => {
    if (!isPlaying && playbackIdx >= filteredEvents.length - 1) setPlaybackIdx(0);
    setIsPlaying((p) => !p);
  }, [isPlaying, playbackIdx, filteredEvents.length]);

  const stats = useMemo(() => {
    const pivots = events.filter((e) => e.event_type === "PIVOT").length;
    const blockers = events.filter((e) => e.event_type === "BLOCKER").length;
    const iterations = Math.max(...events.map((e) => e.iteration || 0), 0);
    return { total: events.length, pivots, blockers, iterations };
  }, [events]);

  // --- Loading / Error states ---
  if (loading) {
    return (
      <div className="min-h-[80vh] bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-gray-400">Loading timeline...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[80vh] bg-gray-950 flex items-center justify-center">
        <div className="text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-6 max-w-md">
          <div className="font-semibold mb-2">Failed to load trace</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="min-h-[80vh] bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-center">
          <div className="text-4xl mb-4">{"\u25C6"}</div>
          <div>No events found for this run.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-gray-950 text-gray-100">
      {/* Animations */}
      <style>{`
        @keyframes pivot-pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes pivot-slideIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pivot-dashFlow {
          to { stroke-dashoffset: -18; }
        }
        @keyframes pivot-fadeInUp {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-purple-400">{"\u25C6"}</span>
                Pivot Timeline
                <span className="text-sm font-normal text-gray-500">Causal Decision Trail</span>
              </h1>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-xs px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300">
                {stats.total} events
              </div>
              <div className="text-xs px-2.5 py-1 rounded bg-yellow-900/30 border border-yellow-800/50 text-yellow-300">
                {stats.pivots} pivots
              </div>
              <div className="text-xs px-2.5 py-1 rounded bg-red-900/30 border border-red-800/50 text-red-300">
                {stats.blockers} blockers
              </div>
              <div className="text-xs px-2.5 py-1 rounded bg-blue-900/30 border border-blue-800/50 text-blue-300">
                {stats.iterations} iterations
              </div>
            </div>
          </div>
          <FilterBar activeFilters={activeFilters} onToggle={toggleFilter} eventCounts={eventCounts} />
        </div>
      </div>

      {/* Playback */}
      <div className="max-w-[1800px] mx-auto px-6 py-3">
        <PlaybackControls
          isPlaying={isPlaying}
          onToggle={togglePlayback}
          speed={playbackSpeed}
          onSpeedChange={setPlaybackSpeed}
          progress={Math.min(playbackIdx + 1, filteredEvents.length)}
          total={filteredEvents.length}
        />
      </div>

      {/* Horizontal scrollable timeline */}
      <div className="max-w-[1800px] mx-auto px-6">
        <div ref={scrollRef} className="relative overflow-x-auto overflow-y-visible pb-8 pt-4" onScroll={updatePositions}>
          <CausalityLines events={filteredEvents} nodePositions={nodePositions} />
          <div style={{ minWidth: visibleEvents.length * 110 + 100 }}>
            {/* Horizontal track */}
            <div className="absolute left-0 right-0" style={{ top: "50%", height: 2, background: "linear-gradient(90deg, transparent, #374151 5%, #374151 95%, transparent)" }} />
            {/* Nodes */}
            <div className="relative flex items-center gap-2 py-8 px-4">
              {visibleEvents.map((evt, idx) => {
                const isPivot = evt.event_type === "PIVOT";
                const isSelected = selected?.event_id === evt.event_id;
                return (
                  <div
                    key={evt.event_id || idx}
                    ref={(el) => (nodesRef.current[idx] = el)}
                    style={{ animation: `pivot-fadeInUp 0.3s ease-out ${idx * 0.03}s both` }}
                  >
                    <TimelineNode
                      event={evt}
                      isSelected={isSelected}
                      isPivot={isPivot}
                      onClick={() => setSelected(isSelected ? null : evt)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Iteration legend */}
      {stats.iterations > 1 && (
        <div className="max-w-[1800px] mx-auto px-6 pb-4">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Iterations:</span>
            {Array.from({ length: stats.iterations }, (_, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700">{i + 1}</span>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible event table */}
      <div className="max-w-[1800px] mx-auto px-6 pb-8">
        <details className="group">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-300 transition-colors py-2">
            Show event table ({filteredEvents.length} events)
          </summary>
          <div className="mt-2 bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-left p-3 font-medium">Iter</th>
                  <th className="text-left p-3 font-medium">Details</th>
                  <th className="text-left p-3 font-medium">Triggered By</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((evt, idx) => {
                  const color = getColor(evt.event_type);
                  const p = evt.payload || {};
                  const detail = p.details || p.description || p.startup_idea || p.reason || p.positioning || "";
                  return (
                    <tr
                      key={evt.event_id || idx}
                      className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors"
                      onClick={() => setSelected(selected?.event_id === evt.event_id ? null : evt)}
                    >
                      <td className="p-3 text-gray-500 font-mono text-xs">{idx + 1}</td>
                      <td className="p-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded whitespace-nowrap"
                          style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
                        >
                          {eventLabel(evt.event_type)}
                        </span>
                      </td>
                      <td className="p-3 text-gray-300 whitespace-nowrap">{evt.source}</td>
                      <td className="p-3 text-gray-500 font-mono">{evt.iteration || "-"}</td>
                      <td className="p-3 text-gray-400 max-w-xs truncate">{detail.slice(0, 80)}</td>
                      <td className="p-3 text-gray-600 font-mono text-xs whitespace-nowrap">
                        {evt.triggered_by ? evt.triggered_by.slice(0, 8) + "..." : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* Detail panel overlay */}
      {selected && <DetailPanel event={selected} allEvents={events} onClose={() => setSelected(null)} />}
    </div>
  );
}
