import { useState } from 'react';

/**
 * AgentHealthBar — compact single-row status bar for 5 AI executives.
 *
 * Props:
 *   agents — array of { name, status, currentTask }
 *     status values: 'active' | 'waiting' | 'error' | 'idle' | 'done'
 *     (also accepts boardroom status strings: thinking/working/blocked/pivoting/speaking → mapped below)
 */

const STATUS_DOT = {
  active:   { dot: 'bg-green-400',  ring: 'ring-green-400/30',  pulse: true,  label: 'Active'   },
  waiting:  { dot: 'bg-yellow-400', ring: 'ring-yellow-400/30', pulse: false, label: 'Waiting'  },
  error:    { dot: 'bg-red-400',    ring: 'ring-red-400/30',    pulse: true,  label: 'Error'    },
  idle:     { dot: 'bg-slate-600',  ring: '',                   pulse: false, label: 'Idle'     },
  done:     { dot: 'bg-blue-400',   ring: 'ring-blue-400/30',   pulse: false, label: 'Done'     },
  // Boardroom status aliases → health bar status
  thinking: { dot: 'bg-yellow-400', ring: 'ring-yellow-400/30', pulse: false, label: 'Thinking' },
  working:  { dot: 'bg-green-400',  ring: 'ring-green-400/30',  pulse: true,  label: 'Working'  },
  speaking: { dot: 'bg-green-400',  ring: 'ring-green-400/30',  pulse: true,  label: 'Speaking' },
  blocked:  { dot: 'bg-red-400',    ring: 'ring-red-400/30',    pulse: true,  label: 'BLOCKED'  },
  pivoting: { dot: 'bg-yellow-400', ring: 'ring-yellow-400/30', pulse: true,  label: 'PIVOTING' },
};

const AGENT_ICONS = {
  CEO:   '\uD83D\uDC51',
  CTO:   '\uD83D\uDCBB',
  CFO:   '\uD83D\uDCCA',
  CMO:   '\uD83D\uDE80',
  Legal: '\u2696\uFE0F',
};

const AGENT_TEXT = {
  CEO:   'text-yellow-400',
  CTO:   'text-blue-400',
  CFO:   'text-green-400',
  CMO:   'text-purple-400',
  Legal: 'text-red-400',
};

function AgentDot({ agent }) {
  const [hovered, setHovered] = useState(false);
  const cfg = STATUS_DOT[agent.status] || STATUS_DOT.idle;
  const icon = AGENT_ICONS[agent.name] || '';
  const textCls = AGENT_TEXT[agent.name] || 'text-slate-400';
  const taskText = agent.currentTask || cfg.label;

  return (
    <div
      className="relative flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/5 transition-colors cursor-default select-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Status dot */}
      <span className={`relative flex h-2.5 w-2.5 shrink-0 ${cfg.ring ? `ring-2 ${cfg.ring} rounded-full` : ''}`}>
        {cfg.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`} />
      </span>

      {/* Agent icon + name */}
      <span className="text-xs">{icon}</span>
      <span className={`text-[11px] font-semibold ${textCls} hidden sm:inline`}>{agent.name}</span>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
          style={{ minWidth: '140px' }}
        >
          <div className="bg-gray-900 border border-white/15 rounded-lg px-3 py-2 shadow-xl text-center">
            <div className={`text-xs font-bold ${textCls} mb-0.5`}>
              {icon} {agent.name}
            </div>
            <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded inline-block mb-1 ${
              cfg.dot.includes('red')    ? 'bg-red-500/20 text-red-300' :
              cfg.dot.includes('yellow') ? 'bg-yellow-500/20 text-yellow-300' :
              cfg.dot.includes('green')  ? 'bg-green-500/20 text-green-300' :
              cfg.dot.includes('blue')   ? 'bg-blue-500/20 text-blue-300' :
                                           'bg-slate-500/20 text-slate-400'
            }`}>
              {cfg.label}
            </div>
            <div className="text-[10px] text-slate-400 leading-snug max-w-[160px] break-words">
              {taskText.length > 80 ? taskText.substring(0, 80) + '...' : taskText}
            </div>
          </div>
          {/* Caret */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(255,255,255,0.15)' }}
          />
        </div>
      )}
    </div>
  );
}

export default function AgentHealthBar({ agents = [] }) {
  // Fallback demo state if no agents passed
  const displayAgents = agents.length > 0 ? agents : [
    { name: 'CEO',   status: 'active',  currentTask: 'Setting strategy' },
    { name: 'CTO',   status: 'waiting', currentTask: 'Waiting for strategy brief' },
    { name: 'CFO',   status: 'idle',    currentTask: 'Idle' },
    { name: 'CMO',   status: 'idle',    currentTask: 'Idle' },
    { name: 'Legal', status: 'waiting', currentTask: 'Reviewing compliance requirements' },
  ];

  const activeCount = displayAgents.filter(a =>
    ['active', 'working', 'thinking', 'speaking', 'pivoting', 'blocked'].includes(a.status)
  ).length;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/10 bg-black/30 backdrop-blur-sm"
      style={{ minHeight: '40px' }}
    >
      {/* Left: label */}
      <div className="flex items-center gap-1.5 shrink-0 mr-2">
        <span className="text-[9px] text-slate-600 font-mono uppercase tracking-widest hidden sm:inline">Agent Health</span>
        {activeCount > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-mono border border-green-500/20">
            {activeCount} active
          </span>
        )}
      </div>

      {/* Center: dots */}
      <div className="flex items-center gap-0 flex-1 justify-center flex-wrap">
        {displayAgents.map(agent => (
          <AgentDot key={agent.name} agent={agent} />
        ))}
      </div>

      {/* Right: overall bar */}
      <div className="shrink-0 ml-2 hidden sm:flex items-center gap-1">
        <div className="flex gap-0.5">
          {displayAgents.map(agent => {
            const cfg = STATUS_DOT[agent.status] || STATUS_DOT.idle;
            return (
              <div
                key={agent.name}
                className={`h-1 w-6 rounded-full ${cfg.dot} opacity-70`}
                title={`${agent.name}: ${cfg.label}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
