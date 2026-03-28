import { useState } from 'react'

export default function MissionControl({ onLaunch }) {
  const [concept, setConcept] = useState('')
  const [launching, setLaunching] = useState(false)

  const handleLaunch = () => {
    if (!concept.trim()) return
    setLaunching(true)
    onLaunch(concept.trim())
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      {/* Ghost Board Logo */}
      <div className="mb-8 text-center">
        <div className="text-6xl font-bold tracking-tight mb-2"
          style={{ color: 'var(--gb-accent)', fontFamily: 'var(--font-mono)' }}>
          GHOST BOARD
        </div>
        <p className="text-lg" style={{ color: 'var(--gb-text)' }}>
          Autonomous AI Executive Team
        </p>
      </div>

      {/* Concept Input */}
      <div className="w-full max-w-2xl mb-6">
        <div className="relative rounded-lg border p-1"
          style={{
            background: 'var(--gb-surface)',
            borderColor: 'var(--gb-border)',
          }}>
          <div className="flex items-center px-3 py-1 text-xs"
            style={{ color: 'var(--gb-accent)', fontFamily: 'var(--font-mono)' }}>
            <span className="cursor-blink mr-1">$</span>
            <span>ghost-board launch</span>
          </div>
          <textarea
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Describe your startup concept..."
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
          { label: 'Agent Simulations', value: '1,000,000+' },
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
    </div>
  )
}
