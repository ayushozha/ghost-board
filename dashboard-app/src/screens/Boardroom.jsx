import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getRunDiscussion, getRunTrace, loadStaticDiscussion, connectLive } from '../api';

// ── Agent configuration ──
const AGENTS = {
  CEO:   { icon: '\uD83D\uDC51', title: 'Chief Executive Officer',  color: '#eab308', border: 'border-yellow-500/40',  text: 'text-yellow-400',  bg: 'from-yellow-500/10 to-yellow-900/5' },
  CTO:   { icon: '\uD83D\uDCBB', title: 'Chief Technology Officer', color: '#3b82f6', border: 'border-blue-500/40',    text: 'text-blue-400',    bg: 'from-blue-500/10 to-blue-900/5' },
  CFO:   { icon: '\uD83D\uDCCA', title: 'Chief Financial Officer',  color: '#22c55e', border: 'border-green-500/40',   text: 'text-green-400',   bg: 'from-green-500/10 to-green-900/5' },
  CMO:   { icon: '\uD83D\uDE80', title: 'Chief Marketing Officer',  color: '#a855f7', border: 'border-purple-500/40',  text: 'text-purple-400',  bg: 'from-purple-500/10 to-purple-900/5' },
  Legal: { icon: '\u2696\uFE0F', title: 'General Counsel',          color: '#ef4444', border: 'border-red-500/40',     text: 'text-red-400',     bg: 'from-red-500/10 to-red-900/5' },
};

// Pentagon layout positions (% of container): CEO top-center, CTO upper-left, CFO upper-right, CMO lower-left, Legal lower-right
const POSITIONS = {
  CEO:   { x: 50,  y: 10 },
  CTO:   { x: 12,  y: 42 },
  CFO:   { x: 88,  y: 42 },
  CMO:   { x: 22,  y: 80 },
  Legal: { x: 78,  y: 80 },
};

// Connection pairs for event bus lines
const CONNECTIONS = [
  ['CEO', 'CTO'], ['CEO', 'Legal'], ['CEO', 'CFO'], ['CEO', 'CMO'],
  ['CTO', 'CMO'], ['CFO', 'Legal'], ['CTO', 'CFO'], ['CMO', 'Legal'],
];

// SVG node centers in 100x100 viewBox
const NODE_CENTERS = {
  CEO:   [50, 16],
  CTO:   [14, 46],
  Legal: [78, 82],
  CMO:   [24, 82],
  CFO:   [86, 46],
};

// Status configuration: visual properties per status
const STATUS_CONFIG = {
  idle:     { label: 'Idle',     dot: 'bg-slate-600',                    borderCls: null,           animCls: '' },
  thinking: { label: 'Thinking', dot: 'bg-blue-400 animate-pulse',      borderCls: 'border-blue-500/60', animCls: 'boardroom-thinking-pulse' },
  working:  { label: 'Working',  dot: 'bg-green-400 animate-pulse',     borderCls: 'border-green-500/60', animCls: 'boardroom-speaking-pulse' },
  done:     { label: 'Done',     dot: 'bg-green-500',                   borderCls: 'border-green-500',    animCls: '' },
  blocked:  { label: 'BLOCKED',  dot: 'bg-red-400 animate-pulse',       borderCls: 'border-red-500',      animCls: 'boardroom-blocker-flash' },
  speaking: { label: 'Speaking', dot: 'bg-green-400 animate-pulse',     borderCls: null,                  animCls: 'boardroom-speaking-pulse' },
  pivoting: { label: 'PIVOTING', dot: 'bg-yellow-400 animate-pulse',    borderCls: 'border-yellow-500',   animCls: 'boardroom-pivot-flash' },
};

// ── Event type badge mapping ──
function getEventBadge(eventType) {
  if (!eventType) return { label: 'UPDATE', cls: 'bg-green-500/15 text-green-300 border-green-500/25' };
  const et = eventType.toLowerCase();
  if (et.includes('strategy'))   return { label: 'STRATEGY',   cls: 'bg-blue-500/15 text-blue-300 border-blue-500/25' };
  if (et.includes('blocker'))    return { label: 'BLOCKER',    cls: 'bg-red-500/15 text-red-300 border-red-500/25' };
  if (et.includes('compliance')) return { label: 'COMPLIANCE', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/25' };
  if (et.includes('pivot'))      return { label: 'PIVOT',      cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' };
  if (et.includes('simulation')) return { label: 'SIMULATION', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/25' };
  if (et.includes('codex') || et.includes('code')) return { label: 'BUILD', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/25' };
  if (et.includes('financial'))  return { label: 'FINANCIAL',  cls: 'bg-green-500/15 text-green-300 border-green-500/25' };
  if (et.includes('gtm') || et.includes('market')) return { label: 'GTM', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/25' };
  return { label: eventType.toUpperCase().replace(/_/g, ' '), cls: 'bg-slate-500/15 text-slate-300 border-slate-500/25' };
}

// ── Normalize agent name to match AGENTS keys ──
function normalizeAgent(name) {
  if (!name) return 'CEO';
  const upper = name.toUpperCase();
  if (upper === 'LEGAL' || upper === 'LEGALCOUNSEL') return 'Legal';
  if (AGENTS[upper]) return upper;
  const title = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  if (AGENTS[title]) return title;
  return name;
}

// ── Derive agent status from event type for a specific agent ──
function deriveStatusFromEvent(eventType) {
  if (!eventType) return 'working';
  const et = eventType.toLowerCase();
  if (et.includes('blocker')) return 'blocked';
  if (et.includes('pivot')) return 'pivoting';
  if (et.includes('strategy') || et.includes('thinking') || et.includes('planning')) return 'thinking';
  if (et.includes('done') || et.includes('complete') || et.includes('finished')) return 'done';
  return 'working';
}

// ── Determine which connection lines are active ──
function getActiveLines(entry) {
  if (!entry) return [];
  const et = (entry.event_type || '').toLowerCase();
  const src = normalizeAgent(entry.agent);

  if (et.includes('blocker') && src === 'Legal') {
    return [{ from: 'Legal', to: 'CEO', color: '#ef4444' }];
  }
  if (et.includes('pivot') && src === 'CEO') {
    return ['CTO', 'CFO', 'CMO', 'Legal'].map(to => ({ from: 'CEO', to, color: '#eab308' }));
  }
  if (src && src !== 'CEO' && (et.includes('pivot_response') || et.includes('codex') || et.includes('financial') || et.includes('gtm'))) {
    return [{ from: src, to: 'CEO', color: AGENTS[src]?.color || '#6366f1' }];
  }
  return [];
}

// ── Normalize discussion data from various source formats ──
function normalizeDiscussion(data) {
  const entries = Array.isArray(data) ? data : (data?.discussion || data?.messages || []);
  if (!Array.isArray(entries)) return [];
  return entries.map(e => ({
    agent: e.agent || e.source || e.source_agent || 'CEO',
    timestamp: e.timestamp,
    event_type: e.event_type || e.type || (e.payload?.action) || 'update',
    message: e.message || e.content || e.summary || e.payload?.details || JSON.stringify(e.payload || {}).substring(0, 200),
    reasoning: e.reasoning || e.payload?.details || '',
    iteration: e.iteration || 1,
  }));
}

// ── Convert trace events into discussion format ──
function traceToDiscussion(traceData) {
  const events = traceData?.trace || traceData || [];
  if (!Array.isArray(events)) return [];
  return events
    .filter(e => e.payload && (e.source || e.source_agent))
    .filter(e => {
      const action = e.payload?.action || '';
      const et = e.event_type || '';
      return ['strategy', 'pivot', 'blocker_found', 'blocker_review', 'compliance_scan',
              'financial_model', 'gtm_generate', 'codex_generate', 'pivot_response',
              'simulation_review'].includes(action)
        || ['STRATEGY_SET', 'BLOCKER', 'PIVOT', 'SIMULATION_RESULT'].includes(et);
    })
    .map(e => ({
      agent: e.source || e.source_agent,
      timestamp: e.timestamp,
      event_type: e.payload?.action || (e.event_type || '').toLowerCase(),
      message: e.payload?.details || e.payload?.startup_idea || JSON.stringify(e.payload).substring(0, 200),
      reasoning: e.payload?.details || '',
      iteration: e.iteration || 1,
    }));
}

// ── SVG Connection Lines (viewBox-based, no DOM measurement needed) ──
function ConnectionSVG({ activeLines }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ zIndex: 1 }}
    >
      <defs>
        <linearGradient id="br-line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.3" />
        </linearGradient>
        {/* Glow filter for active lines */}
        <filter id="br-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Base connections (faint) */}
      {CONNECTIONS.map(([a, b]) => {
        const [x1, y1] = NODE_CENTERS[a];
        const [x2, y2] = NODE_CENTERS[b];
        return (
          <line
            key={`base-${a}-${b}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="url(#br-line-grad)"
            strokeWidth="0.3"
            strokeDasharray="1.5 1.5"
          />
        );
      })}

      {/* Active connections (bright, animated, with glow) */}
      {activeLines.map(({ from, to, color }, i) => {
        const [x1, y1] = NODE_CENTERS[from] || [50, 50];
        const [x2, y2] = NODE_CENTERS[to] || [50, 50];
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const lineId = `active-line-${from}-${to}-${i}`;
        return (
          <g key={lineId}>
            {/* Wide glow */}
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color} strokeWidth="1.8" opacity="0.2"
              filter="url(#br-glow)"
              className="boardroom-line-pulse" />
            {/* Main line */}
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color} strokeWidth="0.5"
              className="boardroom-line-draw" />
            {/* Traveling dot along the line */}
            <circle r="1" fill={color} className="boardroom-line-pulse">
              <animateMotion dur="1.5s" repeatCount="indefinite">
                <mpath xlinkHref={`#path-${lineId}`} />
              </animateMotion>
            </circle>
            <path id={`path-${lineId}`} d={`M${x1},${y1} L${x2},${y2}`} fill="none" />
            {/* Center dot */}
            <circle cx={mx} cy={my} r="0.8" fill={color}
              className="boardroom-line-pulse" />
          </g>
        );
      })}
    </svg>
  );
}

// ── Agent Card ──
function AgentCard({ name, config, status, lastMessage }) {
  const pos = POSITIONS[name];
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const isActive = status !== 'idle' && status !== 'done';

  const borderClass = statusCfg.borderCls || config.border;
  const animClass = statusCfg.animCls;

  // Speech bubble: show last message when actively working/speaking
  const bubbleText = isActive && lastMessage
    ? (lastMessage.length > 120 ? lastMessage.substring(0, 120) + '...' : lastMessage)
    : null;

  return (
    <div
      className={`absolute flex flex-col items-center ${animClass}`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: isActive ? 20 : 10,
        width: '140px',
      }}
    >
      <div className={`relative w-full rounded-xl border ${borderClass} bg-gradient-to-b ${config.bg} backdrop-blur-sm p-3 text-center transition-all duration-500`}>
        {/* Status indicator */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
          <span className={`text-[9px] ${status === 'idle' ? 'text-slate-600' : config.text}`}>{statusCfg.label}</span>
        </div>
        {/* Avatar */}
        <div className="text-3xl mb-1">{config.icon}</div>
        {/* Name */}
        <div className={`text-sm font-bold ${config.text}`}>{name}</div>
        <div className="text-[10px] text-slate-500 leading-tight">{config.title}</div>
      </div>

      {/* Speech bubble */}
      {bubbleText && (
        <div
          className="absolute left-1/2 -translate-x-1/2 w-56 p-2.5 rounded-lg bg-black/80 backdrop-blur border border-white/10 text-xs text-slate-300 leading-relaxed boardroom-bubble-in"
          style={{ top: 'calc(100% + 12px)', zIndex: 30 }}
        >
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-black/80 border-l border-t border-white/10 rotate-45" />
          {bubbleText}
        </div>
      )}
    </div>
  );
}

// ── Discussion entry ──
function DiscussionEntry({ entry, isNew }) {
  const agentName = normalizeAgent(entry.agent);
  const config = AGENTS[agentName] || AGENTS.CEO;
  const badge = getEventBadge(entry.event_type);
  const et = (entry.event_type || '').toLowerCase();
  const isBlocker = et.includes('blocker');
  const isPivot = et.includes('pivot');
  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  let highlightCls = 'border-white/5 hover:border-white/10';
  if (isBlocker) highlightCls = 'border-red-500/30 bg-red-500/5 hover:border-red-500/40';
  else if (isPivot) highlightCls = 'border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/40';

  return (
    <div
      className={`rounded-lg p-3 border transition-colors ${highlightCls} ${isNew ? 'boardroom-fade-in' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">{config.icon}</span>
        <span className={`text-sm font-semibold ${config.text}`}>{agentName}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-[10px] text-slate-600 ml-auto font-mono">{time}</span>
      </div>
      <div className="text-xs text-slate-300 leading-relaxed mb-1.5">{entry.message}</div>
      {entry.reasoning && entry.reasoning !== entry.message && (
        <div className="text-[11px] text-slate-500 leading-relaxed border-l-2 border-slate-700 pl-2 mt-1.5 italic">
          {entry.reasoning.length > 250 ? entry.reasoning.substring(0, 250) + '...' : entry.reasoning}
        </div>
      )}
    </div>
  );
}

// ── WebSocket connection indicator ──
function ConnectionIndicator({ status }) {
  const config = {
    connected:    { dot: 'bg-emerald-500', ping: 'bg-emerald-400', label: 'LIVE', labelCls: 'text-emerald-400' },
    connecting:   { dot: 'bg-yellow-500',  ping: 'bg-yellow-400',  label: 'CONNECTING', labelCls: 'text-yellow-400' },
    disconnected: { dot: 'bg-red-500',     ping: null,             label: 'POLLING', labelCls: 'text-red-400' },
    polling:      { dot: 'bg-orange-500',  ping: 'bg-orange-400',  label: 'POLLING', labelCls: 'text-orange-400' },
  };
  const c = config[status] || config.disconnected;

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {c.ping && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.ping} opacity-75`} />}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${c.dot}`} />
      </span>
      <span className={`text-xs font-mono ${c.labelCls}`}>{c.label}</span>
    </div>
  );
}

// ── Main Boardroom component ──
export default function Boardroom({ runId, onEvent }) {
  // --- State ---
  const [discussion, setDiscussion] = useState([]);
  const [agentStatuses, setAgentStatuses] = useState({
    CEO: 'idle', CTO: 'idle', CFO: 'idle', CMO: 'idle', Legal: 'idle',
  });
  const [agentMessages, setAgentMessages] = useState({
    CEO: null, CTO: null, CFO: null, CMO: null, Legal: null,
  });
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState('connecting'); // connected | connecting | disconnected | polling
  const [newEntryIds, setNewEntryIds] = useState(new Set());

  // --- Refs ---
  const feedRef = useRef(null);
  const wsRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const discussionRef = useRef([]);
  const mountedRef = useRef(true);

  // Keep discussion ref in sync
  useEffect(() => { discussionRef.current = discussion; }, [discussion]);

  // Mark mounted/unmounted
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Process incoming event (from WebSocket or polling) ──
  const processEvent = useCallback((entry) => {
    if (!mountedRef.current) return;

    const agentName = normalizeAgent(entry.agent);
    const eventType = entry.event_type || '';
    const status = deriveStatusFromEvent(eventType);

    // Update agent status
    setAgentStatuses(prev => ({ ...prev, [agentName]: status }));

    // Update agent last message
    setAgentMessages(prev => ({ ...prev, [agentName]: entry.message }));

    // Add to discussion (dedup by timestamp + agent)
    setDiscussion(prev => {
      const isDup = prev.some(
        e => e.timestamp === entry.timestamp && e.agent === entry.agent && e.event_type === entry.event_type
      );
      if (isDup) return prev;
      return [...prev, entry];
    });

    // Mark as new for animation
    const entryId = `${entry.timestamp}-${entry.agent}-${entry.event_type}`;
    setNewEntryIds(prev => new Set(prev).add(entryId));
    setTimeout(() => {
      if (mountedRef.current) {
        setNewEntryIds(prev => {
          const next = new Set(prev);
          next.delete(entryId);
          return next;
        });
      }
    }, 2000);

    // Clear agent status after a delay (return to idle unless new event comes)
    setTimeout(() => {
      if (mountedRef.current) {
        setAgentStatuses(prev => {
          // Only reset if still on the same status we set
          if (prev[agentName] === status && status !== 'done') {
            return { ...prev, [agentName]: 'idle' };
          }
          return prev;
        });
        setAgentMessages(prev => {
          if (prev[agentName] === entry.message) {
            return { ...prev, [agentName]: null };
          }
          return prev;
        });
      }
    }, 6000);

    // Forward event to parent
    if (onEvent) onEvent(entry);
  }, [onEvent]);

  // ── Process raw WebSocket event ──
  const processWsEvent = useCallback((wsEvent) => {
    if (!mountedRef.current) return;

    // Handle status messages
    if (wsEvent.type === 'status') {
      if (wsEvent.status === 'agent_thinking') {
        const agentName = normalizeAgent(wsEvent.agent);
        setAgentStatuses(prev => ({ ...prev, [agentName]: 'thinking' }));
      } else if (wsEvent.status === 'agent_done') {
        const agentName = normalizeAgent(wsEvent.agent);
        setAgentStatuses(prev => ({ ...prev, [agentName]: 'done' }));
      } else if (wsEvent.status === 'completed') {
        // Sprint completed: set all agents to done
        setAgentStatuses({ CEO: 'done', CTO: 'done', CFO: 'done', CMO: 'done', Legal: 'done' });
      }
      return;
    }

    // Handle event messages
    if (wsEvent.type === 'event' && wsEvent.event) {
      const evt = wsEvent.event;
      const payload = evt.payload || {};
      const entry = {
        agent: evt.source_agent || evt.source || 'CEO',
        timestamp: evt.timestamp || new Date().toISOString(),
        event_type: payload.action || (evt.event_type || '').toLowerCase(),
        message: payload.details || payload.startup_idea || JSON.stringify(payload).substring(0, 200),
        reasoning: payload.details || '',
        iteration: evt.iteration || 1,
      };
      processEvent(entry);
    }
  }, [processEvent]);

  // ── WebSocket connection with reconnect logic ──
  const connectWebSocket = useCallback(() => {
    if (!runId || !mountedRef.current) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setWsStatus('connecting');

    try {
      const ws = connectLive(runId, {
        onEvent: (event) => {
          if (!mountedRef.current) return;
          setWsStatus('connected');
          reconnectAttemptsRef.current = 0;
          processWsEvent(event);
        },
        onClose: () => {
          if (!mountedRef.current) return;
          setWsStatus('disconnected');
          wsRef.current = null;

          // Start polling fallback
          startPolling();

          // Attempt reconnect with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) connectWebSocket();
          }, delay);
        },
        onError: () => {
          if (!mountedRef.current) return;
          setWsStatus('disconnected');
        },
      });

      wsRef.current = ws;

      // Check if connection succeeded after 3s
      setTimeout(() => {
        if (mountedRef.current && ws.readyState !== WebSocket.OPEN) {
          setWsStatus('disconnected');
          startPolling();
        }
      }, 3000);
    } catch {
      setWsStatus('disconnected');
      startPolling();
    }
  }, [runId, processWsEvent]);

  // ── Polling fallback ──
  const fetchDiscussion = useCallback(async () => {
    if (!runId || !mountedRef.current) return;

    try {
      // Try board-discussion endpoint
      const data = await getRunDiscussion(runId);
      const entries = normalizeDiscussion(data);
      if (mountedRef.current && entries.length > 0) {
        // Process any new entries
        const currentLen = discussionRef.current.length;
        if (entries.length > currentLen) {
          const newEntries = entries.slice(currentLen);
          newEntries.forEach(e => processEvent(e));
        } else if (currentLen === 0) {
          setDiscussion(entries);
        }
        setLoading(false);
        return;
      }
    } catch { /* fall through */ }

    try {
      // Try trace endpoint
      const traceData = await getRunTrace(runId);
      const entries = traceToDiscussion(traceData);
      if (mountedRef.current && entries.length > 0) {
        const currentLen = discussionRef.current.length;
        if (entries.length > currentLen) {
          const newEntries = entries.slice(currentLen);
          newEntries.forEach(e => processEvent(e));
        } else if (currentLen === 0) {
          setDiscussion(entries);
        }
        setLoading(false);
        return;
      }
    } catch { /* fall through */ }

    try {
      // Try static files
      const data = await loadStaticDiscussion();
      const entries = normalizeDiscussion(data);
      if (mountedRef.current && entries.length > 0) {
        const currentLen = discussionRef.current.length;
        if (entries.length > currentLen) {
          const newEntries = entries.slice(currentLen);
          newEntries.forEach(e => processEvent(e));
        } else if (currentLen === 0) {
          setDiscussion(entries);
        }
        setLoading(false);
        return;
      }
    } catch { /* nothing worked */ }

    if (mountedRef.current) setLoading(false);
  }, [runId, processEvent]);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return; // Already polling
    setWsStatus('polling');
    pollIntervalRef.current = setInterval(() => {
      if (mountedRef.current) fetchDiscussion();
    }, 3000);
  }, [fetchDiscussion]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // ── Initialize: load data + connect WebSocket ──
  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }

    // Initial data fetch
    fetchDiscussion();

    // Connect WebSocket
    connectWebSocket();

    return () => {
      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      stopPolling();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [runId, fetchDiscussion, connectWebSocket, stopPolling]);

  // Stop polling when WebSocket is connected
  useEffect(() => {
    if (wsStatus === 'connected') {
      stopPolling();
    }
  }, [wsStatus, stopPolling]);

  // ── Auto-scroll feed on new messages ──
  useEffect(() => {
    if (feedRef.current) {
      const el = feedRef.current;
      // Only auto-scroll if user is near the bottom (within 150px)
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
  }, [discussion.length]);

  // ── Derived state ──
  const latestEntry = discussion.length > 0 ? discussion[discussion.length - 1] : null;
  const activeLines = useMemo(() => getActiveLines(latestEntry), [latestEntry]);
  const currentPhase = latestEntry?.iteration || 1;
  const totalEvents = discussion.length;

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-indigo-400 rounded-full animate-spin" />
          <span className="text-sm text-slate-500 font-mono">Connecting to boardroom...</span>
        </div>
      </div>
    );
  }

  // ── Empty state ──
  if (discussion.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <div className="text-5xl opacity-60">{'\uD83C\uDFDB'}</div>
          <div className="text-lg text-slate-300 font-semibold">The Boardroom is Empty</div>
          <div className="text-sm text-slate-500 max-w-md">
            No board discussion data available yet. Launch a sprint from Mission Control to see the AI executives deliberate in real time.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-[1600px] mx-auto w-full px-4 py-4 gap-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20 backdrop-blur-sm shrink-0 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div
            className="text-xl font-bold"
            style={{
              background: 'linear-gradient(135deg, #818cf8, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            THE BOARDROOM
          </div>
          <span className="text-xs text-slate-500 font-mono">Executive Session</span>
          <ConnectionIndicator status={wsStatus} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-mono">
            {totalEvents} events
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
            Phase {currentPhase}
          </span>
          {/* Agent status summary */}
          <div className="flex items-center gap-1">
            {Object.entries(AGENTS).map(([name, cfg]) => {
              const st = agentStatuses[name];
              const stCfg = STATUS_CONFIG[st] || STATUS_CONFIG.idle;
              return (
                <div
                  key={name}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/5"
                  title={`${name}: ${stCfg.label}`}
                >
                  <span className="text-xs">{cfg.icon}</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${stCfg.dot}`} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body: 60% agent constellation (top), 40% discussion feed (bottom) */}
      <div className="flex flex-col flex-1 overflow-hidden border border-white/5 rounded-b-xl">
        {/* Top: Agent constellation (60% height) */}
        <div className="relative bg-gray-900/30 overflow-hidden" style={{ height: '60%' }}>
          {/* Background gradient */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: 'linear-gradient(-45deg, #0f172a, #1e1b4b, #0c1445, #172554)',
              backgroundSize: '400% 400%',
              animation: 'boardroom-gradient 15s ease infinite',
            }}
          />

          {/* Connection lines */}
          <ConnectionSVG activeLines={activeLines} />

          {/* Center label */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none" style={{ zIndex: 0 }}>
            <div className="text-gray-700 text-xs font-mono uppercase tracking-widest">Event Bus</div>
          </div>

          {/* Agent cards */}
          {Object.entries(AGENTS).map(([name, config]) => (
            <AgentCard
              key={name}
              name={name}
              config={config}
              status={agentStatuses[name]}
              lastMessage={agentMessages[name]}
            />
          ))}
        </div>

        {/* Bottom: Discussion feed (40% height) */}
        <div className="border-t border-white/10 bg-black/20 backdrop-blur-sm flex flex-col" style={{ height: '40%' }}>
          {/* Feed header */}
          <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-300">Discussion Feed</div>
              <span className="text-[10px] text-slate-600 font-mono">{discussion.length} messages</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Legend */}
              <span className="text-[9px] text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">BLOCKER = red</span>
              <span className="text-[9px] text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded">PIVOT = yellow</span>
            </div>
          </div>

          {/* Scrollable feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 boardroom-scrollbar">
            {discussion.map((entry, i) => {
              const entryId = `${entry.timestamp}-${entry.agent}-${entry.event_type}`;
              return (
                <DiscussionEntry
                  key={`${entryId}-${i}`}
                  entry={entry}
                  isNew={newEntryIds.has(entryId)}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Inline keyframe styles */}
      <style>{`
        @keyframes boardroom-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .boardroom-fade-in {
          animation: boardroom-fade-in-up 0.4s ease forwards;
        }
        @keyframes boardroom-fade-in-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .boardroom-bubble-in {
          animation: boardroom-bubble-anim 0.4s ease forwards;
        }
        @keyframes boardroom-bubble-anim {
          from { opacity: 0; transform: translateX(-50%) scale(0.8) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
        }
        .boardroom-line-draw {
          stroke-dasharray: 100;
          animation: boardroom-line-draw-anim 0.8s ease forwards;
        }
        @keyframes boardroom-line-draw-anim {
          from { stroke-dashoffset: 100; }
          to { stroke-dashoffset: 0; }
        }
        .boardroom-line-pulse {
          animation: boardroom-line-pulse-anim 2s ease-in-out infinite;
        }
        @keyframes boardroom-line-pulse-anim {
          0% { opacity: 0.2; }
          50% { opacity: 0.8; }
          100% { opacity: 0.2; }
        }
        .boardroom-blocker-flash {
          animation: boardroom-blocker-anim 0.8s ease-in-out infinite;
        }
        @keyframes boardroom-blocker-anim {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(239,68,68,0.3)); }
          50% { filter: drop-shadow(0 0 28px rgba(239,68,68,0.8)); }
        }
        .boardroom-pivot-flash {
          animation: boardroom-pivot-anim 0.8s ease-in-out infinite;
        }
        @keyframes boardroom-pivot-anim {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(234,179,8,0.3)); }
          50% { filter: drop-shadow(0 0 28px rgba(234,179,8,0.8)); }
        }
        .boardroom-thinking-pulse {
          animation: boardroom-thinking-anim 1.2s ease-in-out infinite;
        }
        @keyframes boardroom-thinking-anim {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(59,130,246,0.2)); transform: translate(-50%, -50%) scale(1); }
          50% { filter: drop-shadow(0 0 16px rgba(59,130,246,0.6)); transform: translate(-50%, -50%) scale(1.02); }
        }
        .boardroom-speaking-pulse {
          animation: boardroom-speaking-anim 1.5s ease-in-out infinite;
        }
        @keyframes boardroom-speaking-anim {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.03); }
        }
        /* Scrollbar */
        .boardroom-scrollbar::-webkit-scrollbar { width: 5px; }
        .boardroom-scrollbar::-webkit-scrollbar-track { background: rgba(30,27,75,0.5); border-radius: 3px; }
        .boardroom-scrollbar::-webkit-scrollbar-thumb { background: #4f46e5; border-radius: 3px; }
      `}</style>
    </div>
  );
}
