import { useState, useEffect, useRef } from 'react'

const EVENT_COLORS = {
  STRATEGY: '#3b82f6',
  BLOCKER: '#ef4444',
  PIVOT: '#f59e0b',
  UPDATE: '#10b981',
  SIMULATION: '#a855f7',
  DEFAULT: '#6b7280',
}

function TimelineNode({ event, isSelected, onClick }) {
  const color = EVENT_COLORS[event.type] || EVENT_COLORS.DEFAULT
  const isPivot = event.type === 'PIVOT'

  return (
    <button
      onClick={() => onClick(event)}
      className="flex flex-col items-center cursor-pointer group flex-shrink-0"
      style={{ width: '100px' }}
    >
      <div
        className={`rounded-full transition-all duration-300 ${isPivot ? 'w-6 h-6' : 'w-4 h-4'}`}
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
  const scrollRef = useRef(null)

  // TODO: Load from /api/runs/{runId}/trace
  useEffect(() => {
    // Placeholder events
    setEvents([
      { id: 1, agent: 'CEO', type: 'STRATEGY', summary: 'Waiting for trace data...', details: {} },
    ])
  }, [runId])

  return (
    <div className="flex flex-col min-h-screen p-6">
      {/* Header */}
      <div className="mb-6">
        <h2
          className="text-xl font-bold"
          style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
        >
          Pivot Timeline - Causal Decision Trail
        </h2>
      </div>

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
                  style={{ background: 'var(--gb-border)' }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-4 pt-4 border-t" style={{ borderColor: 'var(--gb-border)' }}>
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
                style={{
                  background: EVENT_COLORS[selectedEvent.type] || EVENT_COLORS.DEFAULT,
                }}
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
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--gb-text-bright)' }}>
              {selectedEvent.summary}
            </p>
            {selectedEvent.triggeredBy && (
              <div className="text-xs" style={{ color: 'var(--gb-text)' }}>
                <span className="font-bold">Triggered by:</span> {selectedEvent.triggeredBy}
              </div>
            )}
            {/* TODO: Show affected agents, artifact diffs */}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}>
              Click a timeline node to view details
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
