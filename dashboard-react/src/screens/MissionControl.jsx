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
      await onLaunch(concept.trim())
    } catch {
      // Error is surfaced via launchError prop
    } finally {
      setLaunching(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleLaunch()
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      {/* Ghost Board Logo */}
      <div className="mb-8 text-center">
        <div
          className="text-6xl font-bold tracking-tight mb-2"
          style={{ color: 'var(--gb-accent)', fontFamily: 'var(--font-mono)' }}
        >
          GHOST BOARD
        </div>
        <p className="text-lg" style={{ color: 'var(--gb-text)' }}>
          Autonomous AI Executive Team
        </p>
      </div>

      {/* Concept Input */}
      <div className="w-full max-w-2xl mb-6">
        <div
          className="relative rounded-lg border p-1"
          style={{
            background: 'var(--gb-surface)',
            borderColor: 'var(--gb-border)',
          }}
        >
          <div
            className="flex items-center px-3 py-1 text-xs"
            style={{ color: 'var(--gb-accent)', fontFamily: 'var(--font-mono)' }}
          >
            <span className="cursor-blink mr-1">$</span>
            <span>ghost-board launch</span>
          </div>
          <textarea
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your startup concept... (Ctrl+Enter to launch)"
            rows={3}
            className="w-full px-4 py-3 text-base rounded-md resize-none outline-none"
            style={{
              background: 'var(--gb-surface-2)',
              color: 'var(--gb-text-bright)',
              fontFamily: 'var(--font-mono)',
              border: 'none',
            }}
          />
        </div>
      </div>

      {/* Error Message */}
      {launchError && (
        <div
          className="mb-4 px-4 py-2 rounded text-sm"
          style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--gb-red)' }}
        >
          {launchError}
        </div>
      )}

      {/* Launch Button */}
      <button
        onClick={handleLaunch}
        disabled={!concept.trim() || launching}
        className={`
          px-8 py-3 rounded-lg text-lg font-semibold transition-all duration-300
          ${launching ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'}
        `}
        style={{
          background: concept.trim() ? 'var(--gb-accent)' : 'var(--gb-surface-2)',
          color: concept.trim() ? '#fff' : 'var(--gb-text)',
          fontFamily: 'var(--font-mono)',
          boxShadow: concept.trim() ? '0 0 30px var(--gb-accent-glow)' : 'none',
        }}
      >
        {launching ? 'LAUNCHING...' : 'LAUNCH SPRINT'}
      </button>

      {/* Stats */}
      <div className="flex gap-8 mt-12 text-center">
        {[
          { label: 'AI Executives', value: '5' },
          { label: 'Market Simulation', value: 'MiroFish' },
          {
            label: 'Agent Simulations',
            value: stats ? (stats.total_agents_simulated || 0).toLocaleString() + '+' : '1,000,000+',
          },
        ].map((stat) => (
          <div key={stat.label}>
            <div className="text-xl font-bold" style={{ color: 'var(--gb-accent)' }}>
              {stat.value}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--gb-text)' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Past Runs */}
      {!loadingRuns && pastRuns.length > 0 && (
        <div className="w-full max-w-2xl mt-12">
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
    </div>
  )
}
