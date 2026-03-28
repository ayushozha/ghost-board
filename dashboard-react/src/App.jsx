import { useState, useCallback, useRef, useEffect } from 'react'
import './App.css'
import { api } from './api'
import MissionControl from './screens/MissionControl'
import Boardroom from './screens/Boardroom'
import MarketArena from './screens/MarketArena'
import PivotTimeline from './screens/PivotTimeline'
import SprintReport from './screens/SprintReport'

const SCREENS = [
  { id: 'mission', label: 'Mission Control', shortLabel: 'Mission' },
  { id: 'boardroom', label: 'Boardroom', shortLabel: 'Board' },
  { id: 'arena', label: 'Market Arena', shortLabel: 'Arena' },
  { id: 'timeline', label: 'Pivot Timeline', shortLabel: 'Pivots' },
  { id: 'report', label: 'Sprint Report', shortLabel: 'Report' },
]

function NavBar({ currentScreen, onNavigate, sprintActive, sprintStatus }) {
  return (
    <nav
      className="flex items-center justify-between px-6 py-2 border-b"
      style={{
        background: 'var(--gb-surface)',
        borderColor: 'var(--gb-border)',
      }}
    >
      <div
        className="text-sm font-bold tracking-wider"
        style={{ color: 'var(--gb-accent)', fontFamily: 'var(--font-mono)' }}
      >
        GHOST BOARD
      </div>

      <div className="flex gap-1">
        {SCREENS.map((screen) => {
          const isActive = currentScreen === screen.id
          const isDisabled = !sprintActive && screen.id !== 'mission'

          return (
            <button
              key={screen.id}
              onClick={() => !isDisabled && onNavigate(screen.id)}
              disabled={isDisabled}
              className="px-3 py-1.5 text-xs rounded transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
              style={{
                background: isActive ? 'var(--gb-accent)' : 'transparent',
                color: isActive ? '#fff' : 'var(--gb-text)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {screen.shortLabel}
            </button>
          )
        })}
      </div>

      {sprintActive && (
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${sprintStatus === 'running' ? 'pulse-glow' : ''}`}
            style={{
              background:
                sprintStatus === 'completed'
                  ? 'var(--gb-green)'
                  : sprintStatus === 'failed'
                    ? 'var(--gb-red)'
                    : 'var(--gb-green)',
            }}
          />
          <span
            className="text-xs"
            style={{
              color:
                sprintStatus === 'completed'
                  ? 'var(--gb-green)'
                  : sprintStatus === 'failed'
                    ? 'var(--gb-red)'
                    : 'var(--gb-green)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {sprintStatus === 'completed'
              ? 'DONE'
              : sprintStatus === 'failed'
                ? 'FAILED'
                : 'LIVE'}
          </span>
        </div>
      )}

      {!sprintActive && <div style={{ width: '60px' }} />}
    </nav>
  )
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('mission')
  const [sprintActive, setSprintActive] = useState(false)
  const [sprintStatus, setSprintStatus] = useState(null) // 'pending' | 'running' | 'completed' | 'failed'
  const [runId, setRunId] = useState(null)
  const [launchError, setLaunchError] = useState(null)
  const wsRef = useRef(null)
  const [wsEvents, setWsEvents] = useState([])

  // Clean up WebSocket on unmount or when runId changes
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  const connectToRun = useCallback((id) => {
    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    const ws = api.connectWebSocket(id)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'status') {
          setSprintStatus(data.status)
          if (data.status === 'completed' || data.status === 'failed') {
            // Sprint finished - keep active so user can browse results
          }
        } else if (data.type === 'event') {
          setWsEvents((prev) => [...prev, data.event])
        } else if (data.type === 'initial_state') {
          setSprintStatus(data.run?.status || 'pending')
        }
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onerror = () => {
      // WebSocket errors are non-fatal; data can still be fetched via REST
    }

    ws.onclose = () => {
      wsRef.current = null
    }

    wsRef.current = ws
  }, [])

  const handleLaunch = useCallback(
    async (concept, simScale) => {
      setLaunchError(null)
      try {
        const result = await api.launchSprint(concept, simScale || 'demo')
        const id = result.run_id
        setRunId(id)
        setSprintActive(true)
        setSprintStatus('pending')
        setWsEvents([])
        setCurrentScreen('boardroom')
        connectToRun(id)
      } catch (err) {
        setLaunchError(err.message || 'Failed to launch sprint')
      }
    },
    [connectToRun]
  )

  const handleResumeRun = useCallback(
    (id, status) => {
      setRunId(id)
      setSprintActive(true)
      setSprintStatus(status || 'completed')
      setWsEvents([])
      setCurrentScreen('boardroom')
      if (status === 'running' || status === 'pending') {
        connectToRun(id)
      }
    },
    [connectToRun]
  )

  const handleNavigate = useCallback((screenId) => {
    setCurrentScreen(screenId)
  }, [])

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--gb-bg)' }}>
      {/* Hide navbar on mission control for full-screen immersion */}
      {currentScreen !== 'mission' && (
        <NavBar
          currentScreen={currentScreen}
          onNavigate={handleNavigate}
          sprintActive={sprintActive}
          sprintStatus={sprintStatus}
        />
      )}

      {/* Screen Content */}
      <main className="flex-1">
        {currentScreen === 'mission' && (
          <MissionControl
            onLaunch={handleLaunch}
            onResumeRun={handleResumeRun}
            launchError={launchError}
          />
        )}
        {currentScreen === 'boardroom' && (
          <Boardroom runId={runId} wsEvents={wsEvents} sprintStatus={sprintStatus} />
        )}
        {currentScreen === 'arena' && (
          <MarketArena runId={runId} sprintStatus={sprintStatus} />
        )}
        {currentScreen === 'timeline' && (
          <PivotTimeline runId={runId} />
        )}
        {currentScreen === 'report' && (
          <SprintReport runId={runId} />
        )}
      </main>
    </div>
  )
}
