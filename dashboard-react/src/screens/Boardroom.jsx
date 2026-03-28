import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

const AGENTS = [
  { id: 'ceo', name: 'CEO', role: 'Strategy', icon: '\u{1F451}', color: '#eab308', x: 50, y: 8 },
  { id: 'cto', name: 'CTO', role: 'Build', icon: '\u{1F4BB}', color: '#3b82f6', x: 12, y: 45 },
  { id: 'legal', name: 'Legal', role: 'Compliance', icon: '\u{1F6E1}\uFE0F', color: '#ef4444', x: 88, y: 45 },
  { id: 'cmo', name: 'CMO', role: 'Marketing', icon: '\u{1F680}', color: '#a855f7', x: 22, y: 82 },
  { id: 'cfo', name: 'CFO', role: 'Finance', icon: '\u{1F4CA}', color: '#22c55e', x: 78, y: 82 },
]

const AGENT_NAME_MAP = {
  ceo: 'CEO',
  cto: 'CTO',
  legal: 'Legal',
  cfo: 'CFO',
  cmo: 'CMO',
}

const AGENT_CONFIG = {}
AGENTS.forEach((a) => {
  AGENT_CONFIG[a.name] = a
  AGENT_CONFIG[a.id] = a
})

function agentDisplayName(source) {
  if (!source) return 'System'
  const lower = source.toLowerCase()
  return AGENT_NAME_MAP[lower] || source
}

function eventToDiscussionItem(evt) {
  const agent = agentDisplayName(evt.source_agent || evt.source)
  const type = evt.event_type || evt.type || 'UPDATE'
  const payload = evt.payload || {}

  let text = ''
  if (typeof payload === 'string') {
    text = payload
  } else if (payload.summary) {
    text = payload.summary
  } else if (payload.message) {
    text = payload.message
  } else if (payload.strategy) {
    text = payload.strategy
  } else if (payload.reasoning) {
    text = payload.reasoning
  } else if (payload.description) {
    text = payload.description
  } else if (payload.content) {
    text = typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content)
  } else if (payload.details) {
    text = payload.details
  } else {
    text = `[${type}] ${JSON.stringify(payload).slice(0, 200)}`
  }

  return { agent, text, type }
}

function AgentCard({ agent, state, speechBubble }) {
  const borderColor =
    state === 'blocker'
      ? '#ef4444'
      : state === 'pivot'
        ? '#eab308'
        : state === 'speaking'
          ? agent.color
          : 'var(--gb-border)'

  const glowStyle =
    state !== 'idle'
      ? { boxShadow: `0 0 20px ${borderColor}40` }
      : {}

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `${agent.x}%`,
        top: `${agent.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: state !== 'idle' ? 10 : 1,
      }}
    >
      <div
        className={`rounded-xl border-2 p-3 text-center transition-all duration-500 ${state !== 'idle' ? 'scale-105' : ''}`}
        style={{
          borderColor,
          backgroundColor: agent.color + '10',
          width: '90px',
          ...glowStyle,
          animation: state === 'blocker' ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}
      >
        <div className="text-2xl mb-0.5">{agent.icon}</div>
        <div className="text-xs font-bold" style={{ color: agent.color }}>
          {agent.name}
        </div>
        {/* Status dot */}
        <div
          className="w-2 h-2 rounded-full mx-auto mt-1"
          style={{
            backgroundColor:
              state === 'idle'
                ? '#475569'
                : state === 'blocker'
                  ? '#ef4444'
                  : state === 'pivot'
                    ? '#eab308'
                    : '#22c55e',
          }}
        />
      </div>
      {/* Speech bubble tooltip */}
      {speechBubble && (
        <div
          className="absolute top-full mt-2 w-44 p-2 rounded-lg text-center z-20"
          style={{
            background: 'rgba(0,0,0,0.85)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: '10px',
            color: 'var(--gb-text)',
            lineHeight: 1.4,
            animation: 'fadeInUp 0.3s ease',
            backdropFilter: 'blur(4px)',
          }}
        >
          {speechBubble.substring(0, 100)}
          {speechBubble.length > 100 ? '...' : ''}
        </div>
      )}
    </div>
  )
}

/* SVG connection lines between agents */
function ConnectionLines({ activeAgent, blockerAgent }) {
  const connections = [
    { from: AGENTS[0], to: AGENTS[1] }, // CEO -> CTO
    { from: AGENTS[0], to: AGENTS[2] }, // CEO -> Legal
    { from: AGENTS[0], to: AGENTS[3] }, // CEO -> CMO
    { from: AGENTS[0], to: AGENTS[4] }, // CEO -> CFO
    { from: AGENTS[1], to: AGENTS[3] }, // CTO -> CMO
    { from: AGENTS[2], to: AGENTS[4] }, // Legal -> CFO
  ]

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
      {connections.map(({ from, to }, i) => {
        const isActive =
          activeAgent === from.id || activeAgent === to.id
        const isBlocker =
          blockerAgent === from.id || blockerAgent === to.id

        return (
          <line
            key={i}
            x1={`${from.x}%`}
            y1={`${from.y}%`}
            x2={`${to.x}%`}
            y2={`${to.y}%`}
            stroke={
              isBlocker
                ? '#ef4444'
                : isActive
                  ? 'rgba(139,92,246,0.4)'
                  : 'rgba(100,116,139,0.15)'
            }
            strokeWidth={isBlocker ? 2 : isActive ? 1.5 : 1}
            strokeDasharray={isActive || isBlocker ? 'none' : '4 4'}
            style={{
              transition: 'all 0.5s ease',
              filter: isBlocker ? 'drop-shadow(0 0 6px rgba(239,68,68,0.5))' : 'none',
            }}
          />
        )
      })}
    </svg>
  )
}

export default function Boardroom({ runId, wsEvents, sprintStatus }) {
  const [discussion, setDiscussion] = useState([])
  const [playIndex, setPlayIndex] = useState(-1)
  const [activeAgent, setActiveAgent] = useState(null)
  const [blockerAgent, setBlockerAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const feedRef = useRef(null)

  // Fetch historical data on mount / runId change
  useEffect(() => {
    if (!runId) return
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        let items = []

        try {
          const boardData = await api.getBoardDiscussion(runId)
          const disc = boardData.discussion || []
          if (Array.isArray(disc) && disc.length > 0) {
            items = disc.map((d) => ({
              agent: d.agent || d.source || 'System',
              text: d.text || d.message || d.content || '',
              type: d.type || d.event_type || 'info',
            }))
          }
        } catch {
          // Board discussion not available, try trace
        }

        if (items.length === 0) {
          try {
            const traceData = await api.getTrace(runId)
            const trace = traceData.trace || []
            items = trace.map(eventToDiscussionItem)
          } catch {
            // Trace also not available
          }
        }

        if (!cancelled) {
          setDiscussion(items)
          setPlayIndex(items.length > 0 ? items.length - 1 : -1)
          if (items.length > 0) {
            const lastItem = items[items.length - 1]
            const agentKey = lastItem.agent?.toLowerCase()
            setActiveAgent(agentKey)
          }
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [runId])

  // Process incoming WebSocket events
  useEffect(() => {
    if (!wsEvents || wsEvents.length === 0) return

    const latestEvent = wsEvents[wsEvents.length - 1]
    const item = eventToDiscussionItem(latestEvent)
    setDiscussion((prev) => {
      const next = [...prev, item]
      setPlayIndex(next.length - 1)
      return next
    })

    const agentKey = (latestEvent.source_agent || latestEvent.source || '').toLowerCase()
    setActiveAgent(agentKey)

    const eventType = latestEvent.event_type || ''
    if (eventType === 'BLOCKER') {
      setBlockerAgent(agentKey)
      setTimeout(() => setBlockerAgent(null), 3000)
    }
  }, [wsEvents])

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [discussion, playIndex])

  // Get agent state based on current playback position
  const getAgentState = (agentId) => {
    if (playIndex < 0 || playIndex >= discussion.length) return 'idle'
    const current = discussion[playIndex]
    if (!current) return 'idle'
    const currentAgentKey = current.agent?.toLowerCase()
    if (currentAgentKey !== agentId) return 'idle'

    const et = (current.type || '').toLowerCase()
    if (et.includes('blocker')) return 'blocker'
    if (et.includes('pivot')) return 'pivot'
    return 'speaking'
  }

  // Get speech bubble for current agent
  const getSpeechBubble = (agentId) => {
    if (playIndex < 0 || playIndex >= discussion.length) return null
    const current = discussion[playIndex]
    if (!current) return null
    const currentAgentKey = current.agent?.toLowerCase()
    if (currentAgentKey !== agentId) return null
    return current.text || null
  }

  const handlePrev = () => setPlayIndex((i) => Math.max(0, i - 1))
  const handleNext = () => setPlayIndex((i) => Math.min(discussion.length - 1, i + 1))

  return (
    <div className="flex flex-col min-h-screen p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-xl font-bold"
          style={{ color: 'var(--gb-text-bright)' }}
        >
          The Boardroom
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={playIndex <= 0}
            className="px-2 py-1 rounded text-xs transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--gb-text)',
            }}
          >
            &#9664;
          </button>
          <span
            className="text-xs"
            style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}
          >
            {discussion.length > 0 ? `${playIndex + 1}/${discussion.length}` : '0/0'}
          </span>
          <button
            onClick={handleNext}
            disabled={playIndex >= discussion.length - 1}
            className="px-2 py-1 rounded text-xs transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--gb-text)',
            }}
          >
            &#9654;
          </button>
          {sprintStatus && (
            <span
              className="ml-3 text-xs px-2 py-0.5 rounded"
              style={{
                background:
                  sprintStatus === 'running'
                    ? 'rgba(16,185,129,0.15)'
                    : sprintStatus === 'completed'
                      ? 'rgba(139,92,246,0.15)'
                      : 'rgba(239,68,68,0.15)',
                color:
                  sprintStatus === 'running'
                    ? 'var(--gb-green)'
                    : sprintStatus === 'completed'
                      ? 'var(--gb-accent)'
                      : 'var(--gb-red)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {sprintStatus}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
        {/* Agent Circle */}
        <div
          className="relative rounded-xl border p-4"
          style={{
            background: 'rgba(15,23,42,0.5)',
            borderColor: 'rgba(51,65,85,0.2)',
            minHeight: '360px',
          }}
        >
          {/* Connection lines */}
          <ConnectionLines
            activeAgent={activeAgent}
            blockerAgent={blockerAgent}
          />

          {/* Agent cards */}
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              state={getAgentState(agent.id)}
              speechBubble={getSpeechBubble(agent.id)}
            />
          ))}

          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
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
          className="rounded-xl border overflow-hidden flex flex-col"
          style={{
            background: 'rgba(15,23,42,0.5)',
            borderColor: 'rgba(51,65,85,0.2)',
            maxHeight: '80vh',
          }}
        >
          <div
            className="px-4 py-3 text-sm font-semibold border-b flex items-center justify-between"
            style={{
              borderColor: 'var(--gb-border)',
              color: 'var(--gb-text-bright)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>Discussion</span>
            <span className="text-xs font-normal" style={{ color: 'var(--gb-text)' }}>
              {discussion.length} messages
            </span>
          </div>
          <div ref={feedRef} className="flex-1 overflow-y-auto p-3 space-y-1">
            {loading && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--gb-text)' }}>
                Loading discussion...
              </p>
            )}
            {error && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--gb-red)' }}>
                Error: {error}
              </p>
            )}
            {!loading && !error && discussion.length === 0 && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--gb-text)' }}>
                Waiting for sprint events...
              </p>
            )}
            {discussion.slice(0, playIndex + 1).map((msg, i) => {
              const isBlocker = (msg.type || '').toLowerCase().includes('blocker')
              const isPivot = (msg.type || '').toLowerCase().includes('pivot')
              const isCurrent = i === playIndex
              const cfg = AGENT_CONFIG[msg.agent] || AGENT_CONFIG['ceo']

              return (
                <div
                  key={i}
                  onClick={() => setPlayIndex(i)}
                  className={`p-2 rounded-lg border cursor-pointer transition-all duration-200 ${
                    isCurrent
                      ? 'border-opacity-100'
                      : 'border-transparent hover:border-opacity-50'
                  }`}
                  style={{
                    borderColor: isCurrent
                      ? 'rgba(99,102,241,0.3)'
                      : 'transparent',
                    background: isCurrent
                      ? 'rgba(99,102,241,0.05)'
                      : isBlocker
                        ? 'rgba(239,68,68,0.05)'
                        : isPivot
                          ? 'rgba(234,179,8,0.05)'
                          : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{cfg?.icon || ''}</span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: cfg?.color || 'var(--gb-text)' }}
                    >
                      {msg.agent}
                    </span>
                    <span
                      className="text-xs px-1 py-0.5 rounded"
                      style={{
                        fontSize: '9px',
                        background: 'rgba(255,255,255,0.05)',
                        color: isBlocker
                          ? 'var(--gb-red)'
                          : isPivot
                            ? 'var(--gb-yellow)'
                            : 'var(--gb-text)',
                      }}
                    >
                      {(msg.type || 'UPDATE').toUpperCase()}
                    </span>
                  </div>
                  <p
                    className="leading-relaxed"
                    style={{
                      fontSize: '11px',
                      color: 'var(--gb-text)',
                    }}
                  >
                    {(msg.text || '').substring(0, 200)}
                    {(msg.text || '').length > 200 ? '...' : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
