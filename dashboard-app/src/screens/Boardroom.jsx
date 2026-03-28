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

// Circular layout positions (% of container)
const POSITIONS = {
  CEO:   { x: 50,  y: 10 },
  CTO:   { x: 12,  y: 42 },
  Legal: { x: 88,  y: 42 },
  CMO:   { x: 22,  y: 80 },
  CFO:   { x: 78,  y: 80 },
};

// Connection pairs for event bus lines
const CONNECTIONS = [
  ['CEO', 'CTO'], ['CEO', 'Legal'], ['CEO', 'CFO'], ['CEO', 'CMO'],
  ['CTO', 'CMO'], ['CFO', 'Legal'], ['CTO', 'CFO'], ['CMO', 'Legal'],
];

// SVG node centers in 100x100 viewBox (for connection lines)
const NODE_CENTERS = {
  CEO:   [50, 16],
  CTO:   [14, 46],
  Legal: [86, 46],
  CMO:   [24, 82],
  CFO:   [76, 82],
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
  // Try title case
  const title = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  if (AGENTS[title]) return title;
  return name;
}

// ── Determine agent visual state ──
function getAgentState(agentName, currentEntry) {
  if (!currentEntry || normalizeAgent(currentEntry.agent) !== agentName) return 'idle';
  const et = (currentEntry.event_type || '').toLowerCase();
  if (et.includes('blocker')) return 'blocker';
  if (et.includes('pivot')) return 'pivoting';
  return 'speaking';
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

      {/* Active connections (bright, animated) */}
      {activeLines.map(({ from, to, color }, i) => {
        const [x1, y1] = NODE_CENTERS[from] || [50, 50];
        const [x2, y2] = NODE_CENTERS[to] || [50, 50];
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        return (
          <g key={`active-${from}-${to}-${i}`}>
            {/* Glow */}
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color} strokeWidth="1.2" opacity="0.3"
              className="boardroom-line-pulse" />
            {/* Main line */}
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color} strokeWidth="0.5"
              className="boardroom-line-draw" />
            {/* Direction dot */}
            <circle cx={mx} cy={my} r="0.8" fill={color}
              className="boardroom-line-pulse" />
          </g>
        );
      })}
    </svg>
  );
}

// ── Agent Card ──
function AgentCard({ name, config, state, currentEntry }) {
  const pos = POSITIONS[name];
  const isSpeaking = state === 'speaking';
  const isBlocker = state === 'blocker';
  const isPivoting = state === 'pivoting';
  const isActive = isSpeaking || isBlocker || isPivoting;

  const borderClass = isBlocker ? 'border-red-500' : isPivoting ? 'border-yellow-500' : config.border;
  const dotColor = isSpeaking ? 'bg-green-400' : isBlocker ? 'bg-red-400 animate-pulse' : isPivoting ? 'bg-yellow-400 animate-pulse' : 'bg-slate-600';
  const statusText = isSpeaking ? 'Speaking' : isBlocker ? 'BLOCKER' : isPivoting ? 'PIVOTING' : 'Idle';

  let animClass = '';
  if (isBlocker) animClass = 'boardroom-blocker-flash';
  else if (isPivoting) animClass = 'boardroom-pivot-flash';
  else if (isSpeaking) animClass = 'boardroom-speaking-pulse';

  // Speech bubble
  const bubbleText = isActive && currentEntry
    ? (currentEntry.message?.length > 120 ? currentEntry.message.substring(0, 120) + '...' : currentEntry.message)
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
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-[9px] ${state === 'idle' ? 'text-slate-600' : config.text}`}>{statusText}</span>
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
function DiscussionEntry({ entry, isCurrent, onClick }) {
  const agentName = normalizeAgent(entry.agent);
  const config = AGENTS[agentName] || AGENTS.CEO;
  const badge = getEventBadge(entry.event_type);
  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <div
      onClick={onClick}
      className={`rounded-lg p-3 border transition-colors cursor-pointer boardroom-fade-in ${
        isCurrent
          ? 'ring-1 ring-indigo-500/30 bg-indigo-500/5 border-indigo-500/20'
          : 'border-white/5 hover:border-white/10'
      }`}
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

// ── Normalize discussion data from various source formats ──
function normalizeDiscussion(data) {
  // Could be an array directly, or nested under various keys
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

// ── Main Boardroom component ──
export default function Boardroom({ runId, onDone }) {
  const [discussion, setDiscussion] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeedState] = useState(1500);
  const [loading, setLoading] = useState(true);

  const playbackTimerRef = useRef(null);
  const feedRef = useRef(null);
  const discussionLenRef = useRef(0);

  // Keep ref in sync for interval callbacks
  useEffect(() => { discussionLenRef.current = discussion.length; }, [discussion.length]);

  // ── Fetch board discussion ──
  useEffect(() => {
    if (!runId) { setLoading(false); return; }

    let cancelled = false;
    let ws = null;

    async function fetchData() {
      // Try board-discussion endpoint first
      try {
        const data = await getRunDiscussion(runId);
        const entries = normalizeDiscussion(data);
        if (!cancelled && entries.length > 0) {
          setDiscussion(entries);
          setPlaybackIndex(0);
          setLoading(false);
          checkDone(entries);
          return;
        }
      } catch { /* fall through */ }

      // Try trace endpoint
      try {
        const traceData = await getRunTrace(runId);
        const entries = traceToDiscussion(traceData);
        if (!cancelled && entries.length > 0) {
          setDiscussion(entries);
          setPlaybackIndex(0);
          setLoading(false);
          checkDone(entries);
          return;
        }
      } catch { /* fall through */ }

      // Try static files
      try {
        const data = await loadStaticDiscussion();
        const entries = normalizeDiscussion(data);
        if (!cancelled && entries.length > 0) {
          setDiscussion(entries);
          setPlaybackIndex(0);
          setLoading(false);
          return;
        }
      } catch { /* nothing worked */ }

      if (!cancelled) setLoading(false);
    }

    function checkDone(entries) {
      const hasSimResult = entries.some(e =>
        (e.event_type || '').toLowerCase().includes('simulation')
      );
      if (hasSimResult && onDone) onDone();
    }

    fetchData();

    // Poll for updates every 4 seconds (in case WebSocket isn't available)
    const pollInterval = setInterval(fetchData, 4000);

    // WebSocket for live updates
    try {
      ws = connectLive(runId, {
        onEvent: (event) => {
          if (cancelled) return;
          if (event.type === 'event' && event.event) {
            const evt = event.event;
            const payload = evt.payload || {};
            const entry = {
              agent: evt.source_agent || evt.source || 'CEO',
              timestamp: new Date().toISOString(),
              event_type: payload.action || (evt.event_type || '').toLowerCase(),
              message: payload.details || payload.startup_idea || JSON.stringify(payload).substring(0, 200),
              reasoning: payload.details || '',
              iteration: evt.iteration || 1,
            };
            setDiscussion(prev => [...prev, entry]);
          }
          if (event.type === 'status' && event.status === 'completed' && onDone) {
            onDone();
          }
        },
      });
    } catch { /* WebSocket optional */ }

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, [runId, onDone]);

  // ── Playback controls ──
  const stopPlayback = useCallback(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    stopPlayback();
    setIsPlaying(true);
    playbackTimerRef.current = setInterval(() => {
      setPlaybackIndex(prev => {
        if (prev >= discussionLenRef.current - 1) {
          stopPlayback();
          return prev;
        }
        return prev + 1;
      });
    }, playbackSpeed);
  }, [playbackSpeed, stopPlayback]);

  function togglePlay() {
    if (isPlaying) stopPlayback();
    else startPlayback();
  }

  function stepForward() {
    if (playbackIndex < discussion.length - 1) setPlaybackIndex(i => i + 1);
  }

  function stepBack() {
    if (playbackIndex > 0) setPlaybackIndex(i => i - 1);
  }

  function jumpTo(index) {
    setPlaybackIndex(index);
  }

  function handleSpeedChange(val) {
    const speed = parseInt(val);
    setPlaybackSpeedState(speed);
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(true);
      playbackTimerRef.current = setInterval(() => {
        setPlaybackIndex(prev => {
          if (prev >= discussionLenRef.current - 1) {
            stopPlayback();
            return prev;
          }
          return prev + 1;
        });
      }, speed);
    }
  }

  // Cleanup timer on unmount
  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [playbackIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'l') stepForward();
      if (e.key === 'ArrowLeft' || e.key === 'h') stepBack();
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Derived state ──
  const currentEntry = discussion[playbackIndex] || null;
  const visibleEntries = discussion.slice(0, playbackIndex + 1);
  const activeLines = useMemo(() => getActiveLines(currentEntry), [currentEntry]);
  const currentPhase = currentEntry?.iteration || 1;

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
      <div className="flex items-center justify-between px-2 py-3 border-b border-white/10 bg-black/20 backdrop-blur-sm shrink-0 rounded-t-xl">
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
          <span className="relative flex h-2.5 w-2.5 ml-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs text-emerald-400 font-mono">LIVE</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-mono">
            Message {playbackIndex + 1} / {discussion.length}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
            Phase {currentPhase}
          </span>
        </div>
      </div>

      {/* Body: side-by-side layout */}
      <div className="flex flex-1 overflow-hidden border border-white/5 rounded-b-xl">
        {/* Left: Agent constellation */}
        <div className="flex-1 relative bg-gray-900/30 overflow-hidden" style={{ minWidth: '50%' }}>
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
              state={getAgentState(name, currentEntry)}
              currentEntry={currentEntry}
            />
          ))}
        </div>

        {/* Right: Discussion feed */}
        <div className="w-[45%] max-w-xl border-l border-white/10 bg-black/20 backdrop-blur-sm flex flex-col">
          {/* Playback controls */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="text-sm font-semibold text-slate-300">Discussion Feed</div>
            <div className="flex items-center gap-2">
              <button
                onClick={stepBack}
                disabled={playbackIndex <= 0}
                className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Prev
              </button>
              <button
                onClick={togglePlay}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  isPlaying
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                }`}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={stepForward}
                disabled={playbackIndex >= discussion.length - 1}
                className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>

          {/* Scrollable feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 boardroom-scrollbar">
            {visibleEntries.map((entry, i) => (
              <DiscussionEntry
                key={i}
                entry={entry}
                isCurrent={i === playbackIndex}
                onClick={() => jumpTo(i)}
              />
            ))}
          </div>

          {/* Speed control */}
          <div className="px-4 py-2 border-t border-white/10 flex items-center gap-3 shrink-0">
            <span className="text-[10px] text-slate-500">Speed:</span>
            <input
              type="range"
              min="300"
              max="4000"
              step="100"
              value={playbackSpeed}
              onChange={(e) => handleSpeedChange(e.target.value)}
              className="flex-1 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
            />
            <span className="text-[10px] text-slate-500 font-mono w-12 text-right">
              {(playbackSpeed / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      </div>

      {/* Inline keyframe styles (scoped names to avoid conflicts) */}
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
          animation: boardroom-blocker-anim 1s ease-in-out infinite;
        }
        .boardroom-pivot-flash {
          animation: boardroom-pivot-anim 1s ease-in-out infinite;
        }
        .boardroom-speaking-pulse {
          animation: boardroom-speaking-anim 1.5s ease-in-out infinite;
        }
        @keyframes boardroom-blocker-anim {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(239,68,68,0.3)); }
          50% { filter: drop-shadow(0 0 24px rgba(239,68,68,0.7)); }
        }
        @keyframes boardroom-pivot-anim {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(234,179,8,0.3)); }
          50% { filter: drop-shadow(0 0 24px rgba(234,179,8,0.7)); }
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
