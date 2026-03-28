import { useState, useEffect } from 'react'
import { api } from '../api'

export default function MissionControl({ onLaunch, onResumeRun, launchError }) {
  const [concept, setConcept] = useState('')
  const [launching, setLaunching] = useState(false)
  const [pastRuns, setPastRuns] = useState([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [stats, setStats] = useState(null)

  // Fetch past runs and stats on mount
  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      try {
        const [runsData, statsData] = await Promise.all([
          api.getRuns().catch(() => ({ runs: [] })),
          api.getStats().catch(() => null),
        ])
        if (!cancelled) {
          setPastRuns(runsData.runs || [])
          setStats(statsData)
        }
      } catch {
        // API may not be running; that is fine
      } finally {
        if (!cancelled) setLoadingRuns(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [])

  const handleLaunch = async () => {
    if (!concept.trim()) return
    setLaunching(true)
    try {
      // Small delay for warp animation effect
      await new Promise((r) => setTimeout(r, 1200))
      await onLaunch(concept.trim())
    } catch {
      // Error is surfaced via launchError prop
    } finally {
      setLaunching(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleLaunch()
    }
  }

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center relative overflow-hidden transition-all duration-1000 ${launching ? 'scale-110 opacity-0' : ''}`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      {/* Particle grid background */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(139,92,246,0.4) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Animated gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(139,92,246,0.08) 0%, transparent 70%)',
        }}
      />

      {/* Logo */}
      <div className="relative z-10 text-center mb-10">
        <div className="inline-flex items-center gap-3 mb-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.3)',
            }}
          >
            <span className="text-3xl" style={{ lineHeight: 1 }}>&#9763;</span>
          </div>
          <h1
            className="text-5xl font-black tracking-tight"
            style={{
              background: 'linear-gradient(to right, #818cf8, #a78bfa, #e879f9)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            GHOST BOARD
          </h1>
        </div>
        <p className="text-lg" style={{ color: 'var(--gb-text)' }}>
          Autonomous AI Executive Team
        </p>
      </div>

      {/* Concept Input */}
      <div className="relative z-10 w-full max-w-xl px-6 mb-2">
        <div className="relative">
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your startup concept..."
            className="w-full px-6 py-4 rounded-xl text-lg outline-none transition-all duration-300"
            style={{
              background: 'rgba(15,15,25,0.8)',
              border: '1px solid var(--gb-border)',
              color: 'var(--gb-text-bright)',
              fontFamily: 'var(--font-mono)',
              caretColor: 'var(--gb-accent)',
              backdropFilter: 'blur(8px)',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(139,92,246,0.5)'
              e.target.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.15)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--gb-border)'
              e.target.style.boxShadow = 'none'
            }}
          />
          {/* Pulsing cursor indicator */}
          <div
            className="absolute right-4 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded"
            style={{
              background: 'var(--gb-accent)',
              animation: 'pulse-glow 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      {/* Error Message */}
      {launchError && (
        <div
          className="relative z-10 mb-4 px-4 py-2 rounded text-sm"
          style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--gb-red)' }}
        >
          {launchError}
        </div>
      )}

      {/* Launch Button */}
      <div className="relative z-10 mt-6">
        <button
          onClick={handleLaunch}
          disabled={!concept.trim() || launching}
          className="group relative px-10 py-4 rounded-xl font-bold text-lg transition-all duration-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: concept.trim() ? 'var(--gb-accent)' : 'var(--gb-surface-2)',
            color: concept.trim() ? '#fff' : 'var(--gb-text)',
            fontFamily: 'var(--font-mono)',
            boxShadow: concept.trim()
              ? '0 0 40px rgba(139,92,246,0.3)'
              : 'none',
            transform: concept.trim() && !launching ? 'scale(1)' : undefined,
          }}
          onMouseEnter={(e) => {
            if (concept.trim() && !launching) {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.boxShadow = '0 0 50px rgba(139,92,246,0.4)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            if (concept.trim()) {
              e.currentTarget.style.boxShadow = '0 0 40px rgba(139,92,246,0.3)'
            }
          }}
        >
          <span className="relative z-10 flex items-center gap-2">
            <span className="text-xl">&#9673;</span>
            {launching ? 'LAUNCHING...' : 'LAUNCH SPRINT'}
          </span>
        </button>
      </div>

      {/* Tagline */}
      <div className="relative z-10 mt-10 text-center">
        <p className="text-sm flex items-center justify-center gap-1 flex-wrap" style={{ color: 'var(--gb-text)' }}>
          Powered by{' '}
          <span style={{ color: 'var(--gb-accent)' }}>5 AI Executives</span>
          <span className="mx-1" style={{ color: 'var(--gb-border)' }}>|</span>
          <span style={{ color: 'var(--gb-cyan)' }}>MiroFish Market Simulation</span>
          <span className="mx-1" style={{ color: 'var(--gb-border)' }}>|</span>
          <span style={{ color: 'var(--gb-purple)' }}>
            {stats
              ? (stats.total_agents_simulated || 0).toLocaleString() + '+'
              : '1,000,000+'}{' '}
            Agent Simulations
          </span>
        </p>
      </div>

      {/* Past Runs */}
      {!loadingRuns && pastRuns.length > 0 && (
        <div className="relative z-10 w-full max-w-xl px-6 mt-12">
          <div
            className="text-sm font-semibold mb-3"
            style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
          >
            Previous Runs
          </div>
          <div className="space-y-2">
            {pastRuns.slice(0, 5).map((run) => (
              <button
                key={run.run_id || run.id}
                onClick={() => onResumeRun(run.run_id || run.id, run.status)}
                className="w-full text-left px-4 py-3 rounded-lg border transition-all hover:opacity-80 cursor-pointer"
                style={{
                  background: 'var(--gb-surface)',
                  borderColor: 'var(--gb-border)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm truncate flex-1 mr-4"
                    style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
                  >
                    {run.concept || 'Unknown concept'}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        background:
                          run.status === 'completed'
                            ? 'rgba(16,185,129,0.15)'
                            : run.status === 'running'
                              ? 'rgba(139,92,246,0.15)'
                              : run.status === 'failed'
                                ? 'rgba(239,68,68,0.15)'
                                : 'rgba(107,114,128,0.15)',
                        color:
                          run.status === 'completed'
                            ? 'var(--gb-green)'
                            : run.status === 'running'
                              ? 'var(--gb-accent)'
                              : run.status === 'failed'
                                ? 'var(--gb-red)'
                                : 'var(--gb-text)',
                      }}
                    >
                      {run.status}
                    </span>
                    {run.total_events != null && (
                      <span className="text-xs" style={{ color: 'var(--gb-text)' }}>
                        {run.total_events} events
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Warp effect overlay */}
      {launching && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.9)' }}
        >
          <div className="text-center">
            <div
              className="text-sm mb-2"
              style={{ color: 'var(--gb-accent)', fontFamily: 'var(--font-mono)' }}
            >
              $ ghost-board sprint --launch
            </div>
            <div
              className="text-xs"
              style={{
                color: 'var(--gb-green)',
                fontFamily: 'var(--font-mono)',
                animation: 'pulse-glow 1s ease-in-out infinite',
              }}
            >
              Initializing agents...
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
