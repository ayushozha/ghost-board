import { useState, useCallback } from 'react'
import MissionControl from './screens/MissionControl'
import Boardroom from './screens/Boardroom'
import MarketArena from './screens/MarketArena'
import PivotTimeline from './screens/PivotTimeline'
import SprintReport from './screens/SprintReport'

const SCREENS = [
  { id: 'mission',   label: 'Mission Control', icon: '\u{1F680}' },
  { id: 'boardroom', label: 'Boardroom',       icon: '\u{1F4CB}' },
  { id: 'arena',     label: 'Market Arena',    icon: '\u{1F30D}' },
  { id: 'timeline',  label: 'Pivot Timeline',  icon: '\u{1F4C8}' },
  { id: 'report',    label: 'Sprint Report',   icon: '\u{1F4CA}' },
]

export default function App() {
  const [activeScreen, setActiveScreen] = useState('mission')
  const [runId, setRunId] = useState(null)
  const [sprintStatus, setSprintStatus] = useState('idle') // idle | running | done

  const handleLaunch = useCallback((newRunId) => {
    setRunId(newRunId)
    setSprintStatus('running')
    setActiveScreen('boardroom')
  }, [])

  const handleSprintDone = useCallback(() => {
    setSprintStatus('done')
  }, [])

  const handleNavigate = useCallback((screenId) => {
    // Allow navigating to mission control always;
    // other screens require a runId
    if (screenId === 'mission' || runId) {
      setActiveScreen(screenId)
    }
  }, [runId])

  const renderScreen = () => {
    switch (activeScreen) {
      case 'mission':
        return <MissionControl onLaunch={handleLaunch} />
      case 'boardroom':
        return <Boardroom runId={runId} onDone={handleSprintDone} />
      case 'arena':
        return <MarketArena runId={runId} />
      case 'timeline':
        return <PivotTimeline runId={runId} />
      case 'report':
        return <SprintReport runId={runId} />
      default:
        return <MissionControl onLaunch={handleLaunch} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ─── Top Navigation ─── */}
      <nav className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button
              onClick={() => handleNavigate('mission')}
              className="flex items-center gap-2 group cursor-pointer"
            >
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent group-hover:from-purple-300 group-hover:via-cyan-300 group-hover:to-emerald-300 transition-all duration-300">
                GHOST BOARD
              </span>
              {sprintStatus === 'running' && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
              )}
            </button>

            {/* Screen Tabs */}
            <div className="hidden md:flex items-center gap-1">
              {SCREENS.map((screen) => {
                const isActive = activeScreen === screen.id
                const isDisabled = screen.id !== 'mission' && !runId
                return (
                  <button
                    key={screen.id}
                    onClick={() => handleNavigate(screen.id)}
                    disabled={isDisabled}
                    className={`
                      relative px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200
                      ${isDisabled
                        ? 'text-gray-600 cursor-not-allowed'
                        : isActive
                          ? 'text-white'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 cursor-pointer'
                      }
                    `}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="text-base">{screen.icon}</span>
                      <span>{screen.label}</span>
                    </span>
                    {/* Active indicator - gradient underline */}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-purple-500 via-cyan-500 to-emerald-500 rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <MobileMenu
                screens={SCREENS}
                activeScreen={activeScreen}
                runId={runId}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Screen Content ─── */}
      <main className="flex-1">
        {renderScreen()}
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-gray-800/60 bg-gray-950/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <span>Ghost Board &mdash; Autonomous AI Executive Team</span>
          <span>Built at Ralphthon SF 2026</span>
        </div>
      </footer>
    </div>
  )
}


/* ─── Mobile Navigation ─── */
function MobileMenu({ screens, activeScreen, runId, onNavigate }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800/50 transition-colors cursor-pointer"
        aria-label="Menu"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-50">
          {screens.map((screen) => {
            const isActive = activeScreen === screen.id
            const isDisabled = screen.id !== 'mission' && !runId
            return (
              <button
                key={screen.id}
                onClick={() => {
                  onNavigate(screen.id)
                  setOpen(false)
                }}
                disabled={isDisabled}
                className={`
                  w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors cursor-pointer
                  ${isDisabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : isActive
                      ? 'text-white bg-gray-800/80'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
                  }
                `}
              >
                <span>{screen.icon}</span>
                <span>{screen.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
