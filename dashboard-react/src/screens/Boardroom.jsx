import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

const AGENTS = [
  { id: 'ceo', name: 'CEO', role: 'Strategy', color: '#8b5cf6', angle: 270 },
  { id: 'cto', name: 'CTO', role: 'Build', color: '#3b82f6', angle: 342 },
  { id: 'legal', name: 'Legal', role: 'Compliance', color: '#ef4444', angle: 54 },
  { id: 'cfo', name: 'CFO', role: 'Finance', color: '#10b981', angle: 126 },
  { id: 'cmo', name: 'CMO', role: 'Marketing', color: '#f59e0b', angle: 198 },
]

const AGENT_NAME_MAP = {
  ceo: 'CEO',
  cto: 'CTO',
  legal: 'Legal',
  cfo: 'CFO',
  cmo: 'CMO',
}

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
  } else if (payload.content) {
    text = typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content)
  } else {
    // Fallback: show event type
    text = `[${type}] ${JSON.stringify(payload).slice(0, 200)}`
  }

  return { agent, text, type }
}

function AgentCard({ agent, active, status, isBlocker }) {
  const radius = 160
  const x = Math.cos((agent.angle * Math.PI) / 180) * radius
  const y = Math.sin((agent.angle * Math.PI) / 180) * radius

  return (
    <div
      className="absolute w-24 h-24 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-500"
      style={{
        transform: `translate(${x}px, ${y}px)`,
        background: 'var(--gb-surface)',
        borderColor: isBlocker ? '#ef4444' : active ? agent.color : 'var(--gb-border)',
        boxShadow: isBlocker
          ? '0 0 25px rgba(239,68,68,0.5)'
          : active
            ? `0 0 20px ${agent.color}40`
            : 'none',
        animation: isBlocker ? 'pulse 1s ease-in-out infinite' : 'none',
      }}
    >
      <div className="text-sm font-bold" style={{ color: agent.color }}>
        {agent.name}
      </div>
      <div
        className="text-xs mt-1 text-center px-1 truncate w-full"
        style={{ color: 'var(--gb-text)' }}
      >
        {status || agent.role}
      </div>
    </div>
  )
}

export default function Boardroom({ runId, wsEvents, sprintStatus }) {
  const [discussion, setDiscussion] = useState([])
  const [activeAgent, setActiveAgent] = useState(null)
  const [agentStatuses, setAgentStatuses] = useState({})
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
        // Try board discussion first, then fall back to trace
        let items = []

        try {
          const boardData = await api.getBoardDiscussion(runId)
          const disc = boardData.discussion || []
          if (Array.isArray(disc) && disc.length > 0) {
            items = disc.map((d) => ({
              agent: d.agent || d.source || 'System',
              text: d.text || d.message || d.content || '',
              type: d.type || 'info',
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
    return () => { cancelled = true }
  }, [runId])

  // Process incoming WebSocket events
  useEffect(() => {
    if (!wsEvents || wsEvents.length === 0) return

    const latestEvent = wsEvents[wsEvents.length - 1]
    const item = eventToDiscussionItem(latestEvent)
    setDiscussion((prev) => [...prev, item])

    const agentKey = (latestEvent.source_agent || latestEvent.source || '').toLowerCase()
    setActiveAgent(agentKey)

    // Track agent status from event types
    const eventType = latestEvent.event_type || ''
    if (agentKey && AGENT_NAME_MAP[agentKey]) {
      setAgentStatuses((prev) => ({
        ...prev,
        [agentKey]: eventType === 'BLOCKER' ? 'BLOCKED' : eventType,
      }))
    }

    // Flash blocker
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
  }, [discussion])

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
                status={agentStatuses[agent.id] || null}
                isBlocker={blockerAgent === agent.id}
              />
            ))}
          </div>
          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div
                className="text-xs uppercase tracking-widest"
                style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}
              >
                Boardroom
              </div>
              {sprintStatus && (
                <div
                  className="text-xs mt-1"
                  style={{
                    color:
                      sprintStatus === 'running'
                        ? 'var(--gb-green)'
                        : sprintStatus === 'completed'
                          ? 'var(--gb-accent)'
                          : 'var(--gb-text)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {sprintStatus}
                </div>
              )}
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
          className="px-4 py-3 text-sm font-semibold border-b flex items-center justify-between"
          style={{
            borderColor: 'var(--gb-border)',
            color: 'var(--gb-text-bright)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>Discussion Feed</span>
          <span className="text-xs font-normal" style={{ color: 'var(--gb-text)' }}>
            {discussion.length} messages
          </span>
        </div>
        <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <p className="text-xs text-center" style={{ color: 'var(--gb-text)' }}>
              Loading discussion...
            </p>
          )}
          {error && (
            <p className="text-xs text-center" style={{ color: 'var(--gb-red)' }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && discussion.length === 0 && (
            <p className="text-xs text-center" style={{ color: 'var(--gb-text)' }}>
              Waiting for sprint events...
            </p>
          )}
          {discussion.map((msg, i) => {
            const isBlocker = msg.type === 'BLOCKER'
            const isPivot = msg.type === 'PIVOT'
            return (
              <div
                key={i}
                className="text-sm p-2 rounded"
                style={{
                  background: isBlocker
                    ? 'rgba(239,68,68,0.1)'
                    : isPivot
                      ? 'rgba(245,158,11,0.1)'
                      : 'transparent',
                }}
              >
                <span
                  className="font-bold mr-2"
                  style={{
                    color: AGENTS.find((a) => a.name === msg.agent)?.color || 'var(--gb-text)',
                  }}
                >
                  [{msg.agent}]
                </span>
                {isBlocker && (
                  <span className="text-xs mr-1" style={{ color: 'var(--gb-red)' }}>
                    BLOCKER
                  </span>
                )}
                {isPivot && (
                  <span className="text-xs mr-1" style={{ color: 'var(--gb-yellow)' }}>
                    PIVOT
                  </span>
                )}
                <span style={{ color: 'var(--gb-text-bright)' }}>{msg.text}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
