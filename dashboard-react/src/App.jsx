import { useState, useCallback } from 'react'
import './App.css'
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

function NavBar({ currentScreen, onNavigate, sprintActive }) {
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
            className="w-2 h-2 rounded-full pulse-glow"
            style={{ background: 'var(--gb-green)' }}
          />
          <span
            className="text-xs"
            style={{ color: 'var(--gb-green)', fontFamily: 'var(--font-mono)' }}
          >
            LIVE
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
  const [runId, setRunId] = useState(null)

  const handleLaunch = useCallback((concept) => {
    // TODO: POST /api/sprint with concept, get runId
    // TODO: Connect WebSocket /ws/live/{runId}
    console.log('Launching sprint with concept:', concept)
    setSprintActive(true)
    setRunId('demo') // Placeholder until API is connected
    setCurrentScreen('boardroom')
  }, [])

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
        />
      )}

      {/* Screen Content */}
      <main className="flex-1">
        {currentScreen === 'mission' && (
          <MissionControl onLaunch={handleLaunch} />
        )}
        {currentScreen === 'boardroom' && (
          <Boardroom runId={runId} />
        )}
        {currentScreen === 'arena' && (
          <MarketArena runId={runId} />
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
