import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

/* ── inline keyframe styles (injected once) ── */
const STYLE_ID = 'mc-keyframes'
const KEYFRAMES = `
@keyframes mc-gradient-shift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes mc-border-glow {
  0%, 100% { border-color: var(--gb-cyan); box-shadow: 0 0 8px rgba(6,182,212,0.25); }
  50%      { border-color: var(--gb-purple); box-shadow: 0 0 16px rgba(168,85,247,0.35); }
}
@keyframes mc-cursor-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}
@keyframes mc-warp-lines {
  0%   { transform: scaleY(0); opacity: 0; }
  30%  { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(30); opacity: 0; }
}
@keyframes mc-warp-flash {
  0%   { opacity: 0; }
  60%  { opacity: 1; }
  100% { opacity: 1; }
}
@keyframes mc-grid-drift {
  0%   { transform: translate(0, 0); }
  100% { transform: translate(40px, 40px); }
}
@keyframes mc-logo-glow {
  0%, 100% { filter: drop-shadow(0 0 12px rgba(6,182,212,0.3)) drop-shadow(0 0 40px rgba(139,92,246,0.15)); }
  50%      { filter: drop-shadow(0 0 20px rgba(6,182,212,0.5)) drop-shadow(0 0 60px rgba(139,92,246,0.3)); }
}
@keyframes mc-float {
  0%, 100% { transform: translateY(0px); }
  50%      { transform: translateY(-6px); }
}
@keyframes mc-scanline {
  0%   { top: -4px; }
  100% { top: 100%; }
}
`

function injectKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = KEYFRAMES
  document.head.appendChild(el)
}

export default function MissionControl({ onLaunch, onResumeRun, launchError }) {
  const [concept, setConcept] = useState('')
  const [launching, setLaunching] = useState(false)
  const [pastRuns, setPastRuns] = useState([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [stats, setStats] = useState(null)
  const [inputFocused, setInputFocused] = useState(false)
  const inputRef = useRef(null)

  // Inject keyframes once
  useEffect(() => { injectKeyframes() }, [])

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
        // API may not be running
      } finally {
        if (!cancelled) setLoadingRuns(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [])

  const handleLaunch = async () => {
    if (!concept.trim() || launching) return
    setLaunching(true)
    try {
      await new Promise((r) => setTimeout(r, 1400))
      await onLaunch(concept.trim())
    } catch {
      // Error surfaced via launchError prop
    } finally {
      setLaunching(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLaunch()
  }

  const canLaunch = concept.trim().length > 0

  /* ── render ── */
  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--gb-bg)',
        transition: 'transform 1s cubic-bezier(0.4,0,0.2,1), opacity 1s cubic-bezier(0.4,0,0.2,1)',
        transform: launching ? 'scale(1.15)' : 'scale(1)',
        opacity: launching ? 0 : 1,
      }}
    >
      {/* ── BG Layer 1: Animated dot grid ── */}
      <div
        style={{
          position: 'absolute',
          inset: '-40px',
          opacity: 0.07,
          pointerEvents: 'none',
          backgroundImage:
            'radial-gradient(circle at 1px 1px, var(--gb-cyan) 1px, transparent 0)',
          backgroundSize: '40px 40px',
          animation: 'mc-grid-drift 8s linear infinite',
        }}
      />

      {/* ── BG Layer 2: Radial gradient glow ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(6,182,212,0.06) 0%, transparent 50%), ' +
            'radial-gradient(ellipse 60% 40% at 55% 55%, rgba(139,92,246,0.05) 0%, transparent 50%)',
        }}
      />

      {/* ── BG Layer 3: Slow scanline ── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '4px',
          pointerEvents: 'none',
          background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.08), transparent)',
          animation: 'mc-scanline 6s linear infinite',
          top: 0,
        }}
      />

      {/* ──────────── CONTENT ──────────── */}

      {/* Ghost Board Logo */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          textAlign: 'center',
          marginBottom: '12px',
          animation: 'mc-float 6s ease-in-out infinite, mc-logo-glow 4s ease-in-out infinite',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(3rem, 7vw, 5rem)',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            margin: 0,
            background: 'linear-gradient(135deg, var(--gb-cyan), #818cf8, var(--gb-purple), #e879f9, var(--gb-cyan))',
            backgroundSize: '300% 300%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'mc-gradient-shift 6s ease infinite',
            fontFamily: 'var(--font-mono)',
            userSelect: 'none',
          }}
        >
          GHOST BOARD
        </h1>
      </div>

      {/* Subtitle */}
      <p
        style={{
          position: 'relative',
          zIndex: 10,
          margin: '0 0 40px 0',
          fontSize: 'clamp(0.9rem, 2vw, 1.15rem)',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--gb-text)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        Autonomous AI Executive Team
      </p>

      {/* ── Input Field ── */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: '580px',
          padding: '0 24px',
          marginBottom: '8px',
        }}
      >
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Enter your startup concept..."
            spellCheck={false}
            autoComplete="off"
            style={{
              width: '100%',
              padding: '16px 48px 16px 20px',
              borderRadius: '12px',
              fontSize: '1.05rem',
              outline: 'none',
              background: 'rgba(10,10,18,0.85)',
              backdropFilter: 'blur(12px)',
              border: '1.5px solid transparent',
              borderImage: inputFocused
                ? undefined
                : undefined,
              borderColor: inputFocused ? 'var(--gb-cyan)' : 'var(--gb-border)',
              color: 'var(--gb-text-bright)',
              fontFamily: 'var(--font-mono)',
              caretColor: 'var(--gb-cyan)',
              transition: 'border-color 0.3s, box-shadow 0.3s',
              boxShadow: inputFocused
                ? '0 0 0 3px rgba(6,182,212,0.15), 0 0 30px rgba(6,182,212,0.1)'
                : 'none',
              ...(inputFocused
                ? {
                    animation: 'mc-border-glow 3s ease-in-out infinite',
                  }
                : {}),
            }}
          />
          {/* Pulsing cursor indicator */}
          <div
            style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '2px',
              height: '22px',
              borderRadius: '1px',
              background: 'var(--gb-cyan)',
              animation: 'mc-cursor-pulse 1s step-end infinite',
              opacity: concept ? 0 : 0.8,
              transition: 'opacity 0.2s',
            }}
          />
        </div>
      </div>

      {/* ── Error Message ── */}
      {launchError && (
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            marginBottom: '16px',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            background: 'rgba(239,68,68,0.12)',
            color: 'var(--gb-red)',
            border: '1px solid rgba(239,68,68,0.2)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {launchError}
        </div>
      )}

      {/* ── Launch Button ── */}
      <div style={{ position: 'relative', zIndex: 10, marginTop: '24px' }}>
        <button
          onClick={handleLaunch}
          disabled={!canLaunch || launching}
          style={{
            position: 'relative',
            padding: '16px 48px',
            borderRadius: '14px',
            border: 'none',
            fontSize: '1.1rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            cursor: canLaunch && !launching ? 'pointer' : 'not-allowed',
            color: canLaunch ? '#fff' : 'var(--gb-text)',
            background: canLaunch
              ? 'linear-gradient(135deg, var(--gb-cyan), var(--gb-accent), var(--gb-purple))'
              : 'var(--gb-surface-2)',
            backgroundSize: '200% 200%',
            animation: canLaunch ? 'mc-gradient-shift 4s ease infinite' : 'none',
            boxShadow: canLaunch
              ? '0 0 40px rgba(6,182,212,0.25), 0 0 80px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
              : 'none',
            opacity: canLaunch ? 1 : 0.4,
            transition: 'transform 0.2s, box-shadow 0.3s, opacity 0.3s',
            transform: 'scale(1)',
          }}
          onMouseEnter={(e) => {
            if (canLaunch && !launching) {
              e.currentTarget.style.transform = 'scale(1.06)'
              e.currentTarget.style.boxShadow =
                '0 0 60px rgba(6,182,212,0.35), 0 0 120px rgba(139,92,246,0.2), inset 0 1px 0 rgba(255,255,255,0.15)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            if (canLaunch) {
              e.currentTarget.style.boxShadow =
                '0 0 40px rgba(6,182,212,0.25), 0 0 80px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
            }
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>&#9673;</span>
            {launching ? 'LAUNCHING...' : 'LAUNCH SPRINT'}
          </span>
        </button>
      </div>

      {/* ── Tagline ── */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          marginTop: '40px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.82rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--gb-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <span>Powered by</span>
          <span style={{ color: 'var(--gb-cyan)', fontWeight: 600 }}>5 AI Executives</span>
          <span style={{ color: 'var(--gb-border)', margin: '0 2px' }}>|</span>
          <span style={{ color: 'var(--gb-accent)', fontWeight: 600 }}>MiroFish Market Simulation</span>
          <span style={{ color: 'var(--gb-border)', margin: '0 2px' }}>|</span>
          <span style={{ color: 'var(--gb-purple)', fontWeight: 600 }}>
            {stats
              ? (stats.total_agents_simulated || 0).toLocaleString() + '+'
              : '1,000,000+'}{' '}
            Agent Simulations
          </span>
        </p>
      </div>

      {/* ── Past Runs ── */}
      {!loadingRuns && pastRuns.length > 0 && (
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            width: '100%',
            maxWidth: '580px',
            padding: '0 24px',
            marginTop: '48px',
          }}
        >
          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              marginBottom: '12px',
              color: 'var(--gb-text)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Previous Runs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pastRuns.slice(0, 5).map((run) => (
              <button
                key={run.run_id || run.id}
                onClick={() => onResumeRun(run.run_id || run.id, run.status)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid var(--gb-border)',
                  background: 'var(--gb-surface)',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, background 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gb-accent)'
                  e.currentTarget.style.background = 'var(--gb-surface-2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gb-border)'
                  e.currentTarget.style.background = 'var(--gb-surface)'
                }}
              >
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--gb-text-bright)',
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    marginRight: '16px',
                  }}
                >
                  {run.concept || 'Unknown concept'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontFamily: 'var(--font-mono)',
                      background:
                        run.status === 'completed'
                          ? 'rgba(16,185,129,0.12)'
                          : run.status === 'running'
                            ? 'rgba(139,92,246,0.12)'
                            : run.status === 'failed'
                              ? 'rgba(239,68,68,0.12)'
                              : 'rgba(107,114,128,0.12)',
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
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--gb-text)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {run.total_events} events
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Warp Transition Overlay ── */}
      {launching && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.95)',
          }}
        >
          {/* Warp speed lines */}
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${5 + Math.random() * 90}%`,
                top: '50%',
                width: '1px',
                height: `${20 + Math.random() * 60}%`,
                background: `linear-gradient(180deg, transparent, ${
                  Math.random() > 0.5 ? 'var(--gb-cyan)' : 'var(--gb-purple)'
                }, transparent)`,
                opacity: 0.4 + Math.random() * 0.4,
                transformOrigin: 'center center',
                animation: `mc-warp-lines ${0.6 + Math.random() * 0.8}s ${
                  Math.random() * 0.4
                }s ease-out forwards`,
              }}
            />
          ))}

          {/* White flash */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'white',
              animation: 'mc-warp-flash 1.4s 0.6s ease-in forwards',
              opacity: 0,
            }}
          />

          {/* Terminal text */}
          <div style={{ textAlign: 'center', zIndex: 2 }}>
            <div
              style={{
                fontSize: '0.85rem',
                color: 'var(--gb-cyan)',
                fontFamily: 'var(--font-mono)',
                marginBottom: '8px',
                letterSpacing: '0.05em',
              }}
            >
              $ ghost-board sprint --launch
            </div>
            <div
              style={{
                fontSize: '0.75rem',
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
