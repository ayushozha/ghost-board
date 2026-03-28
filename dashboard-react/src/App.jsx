import { useState, useCallback, useRef, useEffect } from 'react'
import './App.css'
import { api } from './api'
import MissionControl from './screens/MissionControl'
import Boardroom from './screens/Boardroom'
import MarketArena from './screens/MarketArena'
import PivotTimeline from './screens/PivotTimeline'
import SprintReport from './screens/SprintReport'

/* ─── Screen Definitions ─── */

const SCREENS = [
  {
    id: 'mission',
    label: 'Mission Control',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.841m2.699-2.702L12 21.75M4.265 18.735 12 12" />
      </svg>
    ),
  },
  {
    id: 'boardroom',
    label: 'Boardroom',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
  },
  {
    id: 'arena',
    label: 'Market Arena',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.466.732-3.558" />
      </svg>
    ),
  },
  {
    id: 'timeline',
    label: 'Pivot Timeline',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    id: 'report',
    label: 'Sprint Report',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
      </svg>
    ),
  },
]

/* ─── Phase mapping for auto-transition ─── */

const PHASE_SCREEN_MAP = {
  strategy: 'boardroom',
  building: 'boardroom',
  simulation: 'arena',
  analysis: 'timeline',
  rebuilding: 'timeline',
  completed: 'report',
}

/* ─── Navigation Bar ─── */

function NavBar({ currentScreen, onNavigate, sprintActive, sprintStatus }) {
  return (
    <nav className="relative z-50 flex items-center justify-between px-5 h-14 border-b border-gray-700/60 bg-gray-900/95 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--gb-accent), var(--gb-cyan))',
            boxShadow: '0 0 12px var(--gb-accent-glow)',
          }}
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </div>
        <span
          className="text-sm font-bold tracking-widest"
          style={{
            background: 'linear-gradient(135deg, var(--gb-accent), var(--gb-cyan))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontFamily: 'var(--font-mono)',
          }}
        >
          GHOST BOARD
        </span>
      </div>

      {/* Screen Tabs */}
      <div className="flex items-center gap-0.5">
        {SCREENS.map((screen) => {
          const isActive = currentScreen === screen.id
          const isDisabled = !sprintActive && screen.id !== 'mission'

          return (
            <button
              key={screen.id}
              onClick={() => !isDisabled && onNavigate(screen.id)}
              disabled={isDisabled}
              className="group relative flex items-center gap-1.5 px-3 py-2 text-xs rounded-md transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-25"
              style={{
                color: isActive ? 'var(--gb-text-bright)' : 'var(--gb-text)',
                fontFamily: 'var(--font-mono)',
                background: isActive ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
              }}
              title={screen.label}
            >
              <span
                className="transition-colors duration-200"
                style={{
                  color: isActive ? 'var(--gb-accent)' : undefined,
                }}
              >
                {screen.icon}
              </span>
              <span className="hidden lg:inline">{screen.label}</span>

              {/* Active indicator - gradient underline */}
              {isActive && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, var(--gb-accent), var(--gb-cyan))',
                    boxShadow: '0 0 8px var(--gb-accent-glow)',
                  }}
                />
              )}

              {/* Hover underline (non-active, non-disabled) */}
              {!isActive && !isDisabled && (
                <span
                  className="absolute bottom-0 left-3 right-3 h-px rounded-full bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Sprint Status Indicator */}
      <div className="flex items-center gap-2 shrink-0 min-w-[80px] justify-end">
        {sprintActive ? (
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${sprintStatus === 'running' || sprintStatus === 'pending' ? 'animate-pulse' : ''}`}
              style={{
                background:
                  sprintStatus === 'completed'
                    ? 'var(--gb-green)'
                    : sprintStatus === 'failed'
                      ? 'var(--gb-red)'
                      : 'var(--gb-green)',
                boxShadow:
                  sprintStatus === 'running' || sprintStatus === 'pending'
                    ? '0 0 8px rgba(16, 185, 129, 0.5)'
                    : 'none',
              }}
            />
            <span
              className="text-xs font-medium tracking-wider"
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
                  : sprintStatus === 'pending'
                    ? 'INIT'
                    : 'LIVE'}
            </span>
          </div>
        ) : (
          <span
            className="text-xs opacity-40 tracking-wider"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--gb-text)' }}
          >
            IDLE
          </span>
        )}
      </div>
    </nav>
  )
}

/* ─── Screen Wrapper with Fade Transition ─── */

function ScreenFade({ isActive, children }) {
  const [shouldRender, setShouldRender] = useState(isActive)
  const [opacity, setOpacity] = useState(isActive ? 1 : 0)

  useEffect(() => {
    if (isActive) {
      setShouldRender(true)
      // Small delay to allow mount before fade in
      const raf = requestAnimationFrame(() => setOpacity(1))
      return () => cancelAnimationFrame(raf)
    } else {
      setOpacity(0)
      const timer = setTimeout(() => setShouldRender(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  if (!shouldRender) return null

  return (
    <div
      className="w-full h-full"
      style={{
        opacity,
        transition: 'opacity 200ms ease-in-out',
      }}
    >
      {children}
    </div>
  )
}

/* ─── Main App ─── */

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('mission')
  const [sprintActive, setSprintActive] = useState(false)
  const [sprintStatus, setSprintStatus] = useState(null)
  const [runId, setRunId] = useState(null)
  const [launchError, setLaunchError] = useState(null)
  const [autoTransition, setAutoTransition] = useState(true)
  const wsRef = useRef(null)
  const [wsEvents, setWsEvents] = useState([])

  // Track current phase for auto-transition
  const currentPhase = useRef(null)

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  // Auto-transition: move screens as sprint phases change
  useEffect(() => {
    if (!autoTransition || !sprintActive || wsEvents.length === 0) return

    const lastEvent = wsEvents[wsEvents.length - 1]
    const phase = lastEvent?.phase || lastEvent?.event_type?.toLowerCase()

    if (phase && PHASE_SCREEN_MAP[phase] && phase !== currentPhase.current) {
      currentPhase.current = phase
      setCurrentScreen(PHASE_SCREEN_MAP[phase])
    }
  }, [wsEvents, autoTransition, sprintActive])

  // Auto-navigate to report on completion
  useEffect(() => {
    if (autoTransition && sprintStatus === 'completed') {
      setCurrentScreen('report')
    }
  }, [sprintStatus, autoTransition])

  const connectToRun = useCallback((id) => {
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
      // Non-fatal; REST API still available
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
        setAutoTransition(true)
        currentPhase.current = null
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
      setAutoTransition(false) // Don't auto-transition on resume
      currentPhase.current = null
      setCurrentScreen('boardroom')
      if (status === 'running' || status === 'pending') {
        connectToRun(id)
      }
    },
    [connectToRun]
  )

  const handleNavigate = useCallback((screenId) => {
    // Manual navigation disables auto-transition
    setAutoTransition(false)
    setCurrentScreen(screenId)
  }, [])

  // Show full-screen mission control (no nav) or standard layout
  const showNav = currentScreen !== 'mission'

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--gb-bg)' }}>
      {/* Navigation Bar - hidden on Mission Control for immersion */}
      {showNav && (
        <NavBar
          currentScreen={currentScreen}
          onNavigate={handleNavigate}
          sprintActive={sprintActive}
          sprintStatus={sprintStatus}
        />
      )}

      {/* Screen Content with Fade Transitions */}
      <main className="flex-1 relative">
        <ScreenFade isActive={currentScreen === 'mission'}>
          <MissionControl
            onLaunch={handleLaunch}
            onResumeRun={handleResumeRun}
            launchError={launchError}
          />
        </ScreenFade>

        <ScreenFade isActive={currentScreen === 'boardroom'}>
          <Boardroom runId={runId} wsEvents={wsEvents} sprintStatus={sprintStatus} />
        </ScreenFade>

        <ScreenFade isActive={currentScreen === 'arena'}>
          <MarketArena runId={runId} sprintStatus={sprintStatus} />
        </ScreenFade>

        <ScreenFade isActive={currentScreen === 'timeline'}>
          <PivotTimeline runId={runId} />
        </ScreenFade>

        <ScreenFade isActive={currentScreen === 'report'}>
          <SprintReport runId={runId} />
        </ScreenFade>
      </main>

      {/* Footer */}
      {showNav && (
        <footer
          className="flex items-center justify-center py-2 border-t text-xs tracking-wide"
          style={{
            borderColor: 'var(--gb-border)',
            color: 'rgba(156, 163, 175, 0.4)',
            fontFamily: 'var(--font-mono)',
            background: 'var(--gb-surface)',
          }}
        >
          <span>Ghost Board</span>
          <span className="mx-2 opacity-30">|</span>
          <span>Built at Ralphthon SF 2026</span>
        </footer>
      )}
    </div>
  )
}
