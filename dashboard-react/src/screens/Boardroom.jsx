import { useState, useEffect } from 'react'

const AGENTS = [
  { id: 'ceo', name: 'CEO', role: 'Strategy', color: '#8b5cf6', angle: 270 },
  { id: 'cto', name: 'CTO', role: 'Build', color: '#3b82f6', angle: 342 },
  { id: 'legal', name: 'Legal', role: 'Compliance', color: '#ef4444', angle: 54 },
  { id: 'cfo', name: 'CFO', role: 'Finance', color: '#10b981', angle: 126 },
  { id: 'cmo', name: 'CMO', role: 'Marketing', color: '#f59e0b', angle: 198 },
]

function AgentCard({ agent, active, status }) {
  const radius = 160
  const x = Math.cos((agent.angle * Math.PI) / 180) * radius
  const y = Math.sin((agent.angle * Math.PI) / 180) * radius

  return (
    <div
      className="absolute w-24 h-24 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-500"
      style={{
        transform: `translate(${x}px, ${y}px)`,
        background: 'var(--gb-surface)',
        borderColor: active ? agent.color : 'var(--gb-border)',
        boxShadow: active ? `0 0 20px ${agent.color}40` : 'none',
      }}
    >
      <div className="text-sm font-bold" style={{ color: agent.color }}>
        {agent.name}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--gb-text)' }}>
        {status || agent.role}
      </div>
    </div>
  )
}

export default function Boardroom({ runId }) {
  const [discussion, setDiscussion] = useState([])
  const [activeAgent, setActiveAgent] = useState(null)

  // TODO: Connect to WebSocket /ws/live/{runId} for live discussion feed
  // TODO: Load from /api/runs/{runId}/trace for historical data

  useEffect(() => {
    // Placeholder: will be replaced with real WebSocket connection
    setDiscussion([
      { agent: 'CEO', text: 'Waiting for sprint data...', type: 'info' },
    ])
  }, [runId])

  return (
    <div className="flex flex-col lg:flex-row min-h-screen p-6 gap-6">
      {/* Agent Circle */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative" style={{ width: '400px', height: '400px' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            {AGENTS.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                active={activeAgent === agent.id}
                status={null}
              />
            ))}
          </div>
          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="text-xs uppercase tracking-widest"
              style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}
            >
              Boardroom
            </div>
          </div>
        </div>
      </div>

      {/* Discussion Feed */}
      <div
        className="w-full lg:w-96 rounded-xl border overflow-hidden flex flex-col"
        style={{
          background: 'var(--gb-surface)',
          borderColor: 'var(--gb-border)',
          maxHeight: '80vh',
        }}
      >
        <div
          className="px-4 py-3 text-sm font-semibold border-b"
          style={{
            borderColor: 'var(--gb-border)',
            color: 'var(--gb-text-bright)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Discussion Feed
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {discussion.map((msg, i) => (
            <div key={i} className="text-sm">
              <span
                className="font-bold mr-2"
                style={{
                  color: AGENTS.find((a) => a.name === msg.agent)?.color || 'var(--gb-text)',
                }}
              >
                [{msg.agent}]
              </span>
              <span style={{ color: 'var(--gb-text-bright)' }}>{msg.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
