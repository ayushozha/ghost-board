import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

const EVENT_COLORS = {
  STRATEGY: '#3b82f6',
  BLOCKER: '#ef4444',
  PIVOT: '#f59e0b',
  UPDATE: '#10b981',
  SIMULATION: '#a855f7',
  SIMULATION_RESULT: '#a855f7',
  MARKET_SIGNAL: '#a855f7',
  DELEGATION: '#6366f1',
  COMPLIANCE: '#ef4444',
  FINANCIAL: '#10b981',
  GTM: '#f59e0b',
  DEFAULT: '#6b7280',
}

function eventColor(type) {
  if (!type) return EVENT_COLORS.DEFAULT
  const upper = type.toUpperCase()
  return EVENT_COLORS[upper] || EVENT_COLORS.DEFAULT
}

function extractSummary(evt) {
  const payload = evt.payload || {}
  if (typeof payload === 'string') return payload.slice(0, 200)
  return (
    payload.summary ||
    payload.message ||
    payload.reasoning ||
    payload.strategy ||
    (payload.content && typeof payload.content === 'string' ? payload.content.slice(0, 200) : null) ||
    `${evt.event_type || 'EVENT'} from ${evt.source_agent || evt.source || 'unknown'}`
  )
}

function extractDetails(evt) {
  const payload = evt.payload || {}
  const details = {}

  if (payload.reasoning) details.reasoning = payload.reasoning
  if (payload.strategy) details.strategy = payload.strategy
  if (payload.citations) details.citations = payload.citations
  if (payload.affected_agents) details.affected_agents = payload.affected_agents
  if (payload.changes) details.changes = payload.changes
  if (payload.blocker_type) details.blocker_type = payload.blocker_type
  if (payload.regulation) details.regulation = payload.regulation
  if (payload.market_signal) details.market_signal = payload.market_signal
  if (payload.sentiment) details.sentiment = payload.sentiment
  if (payload.files) details.files = payload.files

  // If nothing specific was found, show raw payload (truncated)
  if (Object.keys(details).length === 0 && typeof payload === 'object') {
    const raw = JSON.stringify(payload, null, 2)
    if (raw.length > 2) details.raw_payload = raw.slice(0, 500)
  }

  return details
}

function TimelineNode({ event, isSelected, onClick }) {
  const color = eventColor(event.type)
  const isPivot = event.type === 'PIVOT'
  const isBlocker = event.type === 'BLOCKER'

  return (
    <button
      onClick={() => onClick(event)}
      className="flex flex-col items-center cursor-pointer group flex-shrink-0"
      style={{ width: '100px' }}
    >
      <div
        className={`rounded-full transition-all duration-300 ${isPivot || isBlocker ? 'w-6 h-6' : 'w-4 h-4'}`}
        style={{
          background: color,
          boxShadow: isSelected
            ? `0 0 20px ${color}80`
            : isPivot
              ? `0 0 10px ${color}40`
              : 'none',
          border: isSelected ? '2px solid white' : 'none',
        }}
      />
      <div className="mt-2 text-xs font-bold" style={{ color }}>
        {event.agent}
      </div>
      <div className="text-xs" style={{ color: 'var(--gb-text)' }}>
        {event.type}
      </div>
    </button>
  )
}

export default function PivotTimeline({ runId }) {
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  // Fetch trace from API
  useEffect(() => {
    if (!runId) return
    let cancelled = false

    async function fetchTrace() {
      setLoading(true)
      setError(null)

      try {
        const data = await api.getTrace(runId)
        if (cancelled) return

        const trace = data.trace || []
        const mapped = trace.map((evt, i) => ({
          id: evt.event_id || evt.id || i + 1,
          agent: evt.source_agent || evt.source || 'System',
          type: (evt.event_type || 'UPDATE').toUpperCase(),
          summary: extractSummary(evt),
          details: extractDetails(evt),
          triggeredBy: evt.triggered_by || null,
          timestamp: evt.timestamp || null,
          iteration: evt.iteration || 1,
          payload: evt.payload || {},
        }))

        setEvents(mapped)
        setLoading(false)

        // Auto-select the first pivot if there is one
        const firstPivot = mapped.find((e) => e.type === 'PIVOT')
        if (firstPivot) setSelectedEvent(firstPivot)
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    fetchTrace()
    return () => { cancelled = true }
  }, [runId])

  return (
    <div className="flex flex-col min-h-screen p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2
          className="text-xl font-bold"
          style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
        >
          Pivot Timeline - Causal Decision Trail
        </h2>
        <span className="text-sm" style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}>
          {events.length} events | {events.filter((e) => e.type === 'PIVOT').length} pivots
        </span>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}>
            Loading trace data...
          </p>
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: 'var(--gb-red)', fontFamily: 'var(--font-mono)' }}>
            {error}
          </p>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Timeline strip */}
          <div
            className="rounded-xl border p-6 mb-6"
            style={{
              background: 'var(--gb-surface)',
              borderColor: 'var(--gb-border)',
            }}
          >
            <div
              ref={scrollRef}
              className="flex items-center gap-2 overflow-x-auto pb-4"
              style={{ scrollBehavior: 'smooth' }}
            >
              {events.map((event, i) => (
                <div key={event.id} className="flex items-center">
                  <TimelineNode
                    event={event}
                    isSelected={selectedEvent?.id === event.id}
                    onClick={setSelectedEvent}
                  />
                  {i < events.length - 1 && (
                    <div
                      className="h-0.5 w-8 flex-shrink-0"
                      style={{
                        background:
                          events[i + 1].triggeredBy === event.id
                            ? eventColor(event.type)
                            : 'var(--gb-border)',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-4 pt-4 border-t flex-wrap" style={{ borderColor: 'var(--gb-border)' }}>
              {Object.entries(EVENT_COLORS)
                .filter(([k]) => k !== 'DEFAULT')
                .map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                    <span className="text-xs" style={{ color: 'var(--gb-text)' }}>
                      {type}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Detail Panel */}
          <div
            className="flex-1 rounded-xl border p-6"
            style={{
              background: 'var(--gb-surface)',
              borderColor: 'var(--gb-border)',
            }}
          >
            {selectedEvent ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ background: eventColor(selectedEvent.type) }}
                  />
                  <h3
                    className="text-lg font-bold"
                    style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
                  >
                    {selectedEvent.type} EVENT
                  </h3>
                  <span className="text-sm" style={{ color: 'var(--gb-text)' }}>
                    by {selectedEvent.agent}
                  </span>
                  {selectedEvent.timestamp && (
                    <span className="text-xs" style={{ color: 'var(--gb-text)', opacity: 0.6 }}>
                      {new Date(selectedEvent.timestamp).toLocaleString()}
                    </span>
                  )}
                </div>

                <p className="text-sm mb-4" style={{ color: 'var(--gb-text-bright)' }}>
                  {selectedEvent.summary}
                </p>

                {selectedEvent.triggeredBy && (
                  <div className="text-xs mb-3 p-2 rounded" style={{ background: 'var(--gb-surface-2)' }}>
                    <span className="font-bold" style={{ color: 'var(--gb-text)' }}>
                      Triggered by:
                    </span>{' '}
                    <span style={{ color: 'var(--gb-accent)' }}>{selectedEvent.triggeredBy}</span>
                  </div>
                )}

                {/* Detail fields */}
                {Object.entries(selectedEvent.details).map(([key, value]) => (
                  <div key={key} className="mb-3">
                    <div
                      className="text-xs font-bold uppercase mb-1"
                      style={{ color: 'var(--gb-text)', opacity: 0.7 }}
                    >
                      {key.replace(/_/g, ' ')}
                    </div>
                    {typeof value === 'string' ? (
                      <pre
                        className="text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap"
                        style={{
                          background: 'var(--gb-surface-2)',
                          color: 'var(--gb-text-bright)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {value}
                      </pre>
                    ) : Array.isArray(value) ? (
                      <ul className="text-xs space-y-1 pl-4" style={{ color: 'var(--gb-text-bright)' }}>
                        {value.map((item, i) => (
                          <li key={i} className="list-disc">
                            {typeof item === 'string' ? item : JSON.stringify(item)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <pre
                        className="text-xs p-3 rounded overflow-x-auto whitespace-pre-wrap"
                        style={{
                          background: 'var(--gb-surface-2)',
                          color: 'var(--gb-text-bright)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}>
                  Click a timeline node to view details
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
