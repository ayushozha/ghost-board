import { useState, useEffect, useRef } from 'react';
import { startSprint } from '../api';

// -- Animated grid background --
function AnimatedGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Gradient orbs */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
        style={{
          background: 'radial-gradient(circle, #22d3ee 0%, transparent 70%)',
          top: '-10%',
          left: '50%',
          transform: 'translateX(-50%)',
          animation: 'float-orb 8s ease-in-out infinite',
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[100px]"
        style={{
          background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)',
          bottom: '10%',
          right: '10%',
          animation: 'float-orb 12s ease-in-out infinite reverse',
        }}
      />
      <div
        className="absolute w-[350px] h-[350px] rounded-full opacity-10 blur-[90px]"
        style={{
          background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)',
          top: '40%',
          left: '10%',
          animation: 'float-orb 10s ease-in-out infinite 2s',
        }}
      />
      {/* Scrolling grid lines */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ animation: 'scroll-grid 30s linear infinite' }}
      >
        <svg className="w-full h-[200%]">
          <defs>
            <pattern id="mc-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#22d3ee" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mc-grid)" />
        </svg>
      </div>
      {/* Scan line */}
      <div
        className="absolute w-full h-px opacity-10"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #22d3ee 50%, transparent 100%)',
          animation: 'scan-line 6s linear infinite',
        }}
      />
    </div>
  );
}

// -- Typing cursor --
function TypingCursor() {
  return (
    <span
      className="inline-block w-[2px] h-5 bg-cyan-400 ml-0.5 align-middle"
      style={{ animation: 'blink-cursor 1s step-end infinite' }}
    />
  );
}

// -- Stat pill --
function StatPill({ icon, value, label }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="text-sm font-bold text-white">{value}</div>
        <div className="text-[10px] text-slate-500 leading-tight">{label}</div>
      </div>
    </div>
  );
}

// -- Agent avatar row --
const AGENTS = [
  { name: 'CEO', icon: '\uD83D\uDC51', color: 'text-yellow-400', ring: 'ring-yellow-500/30' },
  { name: 'CTO', icon: '\uD83D\uDCBB', color: 'text-blue-400', ring: 'ring-blue-500/30' },
  { name: 'CFO', icon: '\uD83D\uDCCA', color: 'text-green-400', ring: 'ring-green-500/30' },
  { name: 'CMO', icon: '\uD83D\uDE80', color: 'text-purple-400', ring: 'ring-purple-500/30' },
  { name: 'Legal', icon: '\uD83D\uDEE1\uFE0F', color: 'text-red-400', ring: 'ring-red-500/30' },
];

function AgentAvatars() {
  return (
    <div className="flex items-center justify-center gap-3">
      {AGENTS.map((agent, i) => (
        <div
          key={agent.name}
          className={`flex flex-col items-center gap-1 opacity-0`}
          style={{ animation: `fade-in-up 0.5s ease forwards ${0.6 + i * 0.1}s` }}
        >
          <div
            className={`w-12 h-12 rounded-full bg-white/[0.05] border border-white/10 ring-2 ${agent.ring} flex items-center justify-center text-xl`}
            title={agent.name}
          >
            {agent.icon}
          </div>
          <span className={`text-[10px] font-medium ${agent.color}`}>{agent.name}</span>
        </div>
      ))}
    </div>
  );
}

// -- Main MissionControl component --
export default function MissionControl({ onLaunch, isLive = false }) {
  const [concept, setConcept] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState(null);
  const [demoConcepts, setDemoConcepts] = useState([]);
  const [showDemos, setShowDemos] = useState(false);
  const inputRef = useRef(null);

  // Fetch demo concepts on mount
  useEffect(() => {
    async function fetchConcepts() {
      try {
        const res = await fetch('/api/concepts');
        if (res.ok) {
          const data = await res.json();
          setDemoConcepts(data.concepts || []);
        }
      } catch {
        // Non-critical -- API may not be available
      }
    }
    fetchConcepts();
  }, []);

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 800);
    return () => clearTimeout(timer);
  }, []);

  async function handleLaunch() {
    const trimmed = concept.trim();
    if (!trimmed) {
      setError('Enter a startup concept to begin.');
      return;
    }

    setIsLaunching(true);
    setError(null);

    try {
      const data = await startSprint(trimmed, { sim_scale: 'demo' });
      if (data.run_id && onLaunch) {
        onLaunch(data.run_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to start sprint. Is the server running?');
      setIsLaunching(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !isLaunching) {
      handleLaunch();
    }
  }

  function selectDemo(text) {
    setConcept(text);
    setShowDemos(false);
    inputRef.current?.focus();
  }

  return (
    <div className="relative w-full h-full min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center overflow-hidden">
      <AnimatedGrid />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 max-w-2xl w-full">

        {/* Logo + title */}
        <div
          className="flex flex-col items-center gap-3 opacity-0"
          style={{ animation: 'fade-in-up 0.8s ease forwards 0.1s' }}
        >
          <h1
            className="text-7xl font-black tracking-tight text-center"
            style={{
              background: 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 40%, #9333ea 100%)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradient-shift 4s ease infinite',
            }}
          >
            GHOST BOARD
          </h1>
          <div className="text-lg text-slate-400 font-light tracking-wide text-center">
            Autonomous AI Executive Team
          </div>
        </div>

        {/* Live indicator */}
        {isLive && (
          <div
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 opacity-0"
            style={{ animation: 'fade-in-up 0.5s ease forwards 0.2s' }}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-xs font-mono text-green-400">LIVE</span>
          </div>
        )}

        {/* Input area */}
        <div
          className="w-full max-w-xl opacity-0"
          style={{ animation: 'fade-in-up 0.8s ease forwards 0.3s' }}
        >
          <div className="relative group">
            {/* Outer glow ring on focus */}
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-cyan-400/20 via-blue-500/20 to-purple-600/20 opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm" />

            <div className="relative flex items-center bg-gray-900 border border-gray-700 rounded-2xl px-5 py-4 group-focus-within:border-cyan-400 transition-all duration-300 group-focus-within:shadow-[0_0_20px_rgba(34,211,238,0.15)]">
              <span className="text-cyan-400 mr-3 text-lg font-mono select-none">&gt;</span>
              <input
                ref={inputRef}
                type="text"
                value={concept}
                onChange={(e) => { setConcept(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                placeholder="Describe your startup concept..."
                disabled={isLaunching}
                className="flex-1 bg-transparent text-white text-base placeholder-slate-600 outline-none font-mono disabled:opacity-50"
                maxLength={500}
              />
              {!concept && <TypingCursor />}
            </div>
          </div>

          {/* Demo concepts dropdown */}
          {demoConcepts.length > 0 && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowDemos(!showDemos)}
                className="text-[11px] text-slate-500 hover:text-cyan-400 transition-colors font-mono"
              >
                {showDemos ? 'Hide demos' : 'Try a demo concept'}
              </button>
              {showDemos && demoConcepts.map((c) => (
                <button
                  key={c.name}
                  onClick={() => selectDemo(c.full_text)}
                  className="text-[11px] px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/20 transition-colors font-mono"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="mt-3 text-sm text-red-400 text-center font-mono bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Launch button */}
        <div
          className="w-full max-w-xl opacity-0"
          style={{ animation: 'fade-in-up 0.8s ease forwards 0.45s' }}
        >
          <button
            onClick={handleLaunch}
            disabled={isLaunching}
            className="group relative w-full py-4 rounded-xl text-lg font-bold tracking-wide transition-all duration-300 hover:scale-[1.03] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: isLaunching
                ? 'linear-gradient(135deg, #164e63 0%, #312e81 50%, #4c1d95 100%)'
                : 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #9333ea 100%)',
            }}
          >
            {/* Button glow on hover */}
            <div
              className="absolute -inset-1 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-lg"
              style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #9333ea 100%)' }}
            />
            <span className="relative z-10 flex items-center justify-center gap-3 text-white">
              {isLaunching ? (
                <>
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting sprint...
                </>
              ) : (
                <>
                  <span className="text-xl">&#x25C9;</span>
                  LAUNCH SPRINT
                </>
              )}
            </span>
          </button>
        </div>

        {/* Agent avatars */}
        <div
          className="opacity-0"
          style={{ animation: 'fade-in-up 0.8s ease forwards 0.55s' }}
        >
          <AgentAvatars />
        </div>

        {/* Stats row */}
        <div
          className="flex flex-wrap items-center justify-center gap-4 opacity-0"
          style={{ animation: 'fade-in-up 0.8s ease forwards 0.7s' }}
        >
          <StatPill icon="&#x1F916;" value="5" label="AI Executives" />
          <StatPill icon="&#x1F30D;" value="1M+" label="Agent Simulations" />
          <StatPill icon="&#x1F4A1;" value="Real-time" label="Market Stress Test" />
        </div>

        {/* Tagline */}
        <div
          className="text-center opacity-0"
          style={{ animation: 'fade-in-up 0.8s ease forwards 0.85s' }}
        >
          <p className="text-xs text-slate-600 font-mono">
            Powered by GPT-4o &middot; OpenAI Codex &middot; MiroFish Simulation &middot; W&amp;B Traces
          </p>
        </div>
      </div>

      {/* Inline keyframe styles */}
      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes float-orb {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-30px); }
        }
        @keyframes scan-line {
          0% { top: -2%; }
          100% { top: 102%; }
        }
        @keyframes scroll-grid {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      `}</style>
    </div>
  );
}
