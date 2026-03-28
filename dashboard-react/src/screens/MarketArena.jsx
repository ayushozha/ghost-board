import { useState, useEffect, useRef } from 'react'

// TODO: Import Three.js globe when wiring up real data
// import { Canvas } from '@react-three/fiber'
// import { OrbitControls, Sphere } from '@react-three/drei'

export default function MarketArena({ runId }) {
  const [round, setRound] = useState(0)
  const [totalRounds, setTotalRounds] = useState(5)
  const [sentiment, setSentiment] = useState(0)
  const [posts, setPosts] = useState([])
  const [sentimentByType, setSentimentByType] = useState({})

  // TODO: Connect to WebSocket for live simulation updates
  // TODO: Load from /api/runs/{runId}/simulation for historical data

  return (
    <div className="flex flex-col min-h-screen p-6">
      {/* Header Bar */}
      <div
        className="flex items-center justify-between px-6 py-3 rounded-lg mb-6 border"
        style={{
          background: 'var(--gb-surface)',
          borderColor: 'var(--gb-border)',
        }}
      >
        <span style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}>
          Market Stress Test
        </span>
        <span style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}>
          Round {round}/{totalRounds}
        </span>
        <span
          style={{
            color: sentiment >= 0 ? 'var(--gb-green)' : 'var(--gb-red)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Sentiment {sentiment >= 0 ? '+' : ''}{sentiment.toFixed(2)}
        </span>
      </div>

      {/* Main Content: Feed | Globe | Charts */}
      <div className="flex-1 flex gap-6">
        {/* Left: Post Feed */}
        <div
          className="w-64 rounded-xl border overflow-hidden flex flex-col"
          style={{
            background: 'var(--gb-surface)',
            borderColor: 'var(--gb-border)',
          }}
        >
          <div
            className="px-4 py-3 text-sm font-semibold border-b"
            style={{ borderColor: 'var(--gb-border)', color: 'var(--gb-text-bright)' }}
          >
            Feed
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {posts.length === 0 ? (
              <p className="text-xs text-center" style={{ color: 'var(--gb-text)' }}>
                Waiting for simulation data...
              </p>
            ) : (
              posts.map((post, i) => (
                <div key={i} className="text-xs p-2 rounded" style={{ background: 'var(--gb-surface-2)' }}>
                  <div className="font-bold mb-1" style={{ color: 'var(--gb-accent)' }}>
                    [{post.persona}]
                  </div>
                  <div style={{ color: 'var(--gb-text-bright)' }}>{post.text}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center: 3D Globe Placeholder */}
        <div
          className="flex-1 rounded-xl border flex items-center justify-center"
          style={{
            background: 'var(--gb-surface)',
            borderColor: 'var(--gb-border)',
          }}
        >
          <div className="text-center">
            <div
              className="text-6xl mb-4"
              style={{ color: 'var(--gb-accent)', opacity: 0.3 }}
            >
              {/* Globe icon placeholder */}
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <circle cx="12" cy="12" r="10" />
                <ellipse cx="12" cy="12" rx="10" ry="4" />
                <line x1="12" y1="2" x2="12" y2="22" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}>
              3D Globe - Three.js
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--gb-text)' }}>
              50 LLM Agents + 1,000,000 Lightweight Agents
            </p>
          </div>
        </div>

        {/* Right: Sentiment Charts */}
        <div
          className="w-64 rounded-xl border overflow-hidden flex flex-col"
          style={{
            background: 'var(--gb-surface)',
            borderColor: 'var(--gb-border)',
          }}
        >
          <div
            className="px-4 py-3 text-sm font-semibold border-b"
            style={{ borderColor: 'var(--gb-border)', color: 'var(--gb-text-bright)' }}
          >
            Sentiment
          </div>
          <div className="flex-1 p-3 space-y-4">
            {/* Placeholder bars */}
            {[
              { label: 'VC', value: 0, color: 'var(--gb-green)' },
              { label: 'User', value: 0, color: 'var(--gb-blue)' },
              { label: 'Press', value: 0, color: 'var(--gb-yellow)' },
              { label: 'Competitor', value: 0, color: 'var(--gb-red)' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: 'var(--gb-text)' }}>{item.label}</span>
                  <span style={{ color: item.color }}>
                    {item.value >= 0 ? '+' : ''}{item.value.toFixed(1)}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full"
                  style={{ background: 'var(--gb-surface-2)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.abs(item.value) * 50 + 50}%`,
                      background: item.color,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Round chart placeholder */}
            <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--gb-border)' }}>
              <div className="text-xs mb-2" style={{ color: 'var(--gb-text)' }}>
                Sentiment Over Rounds
              </div>
              <div
                className="h-32 rounded flex items-center justify-center text-xs"
                style={{ background: 'var(--gb-surface-2)', color: 'var(--gb-text)' }}
              >
                {/* TODO: Recharts line chart */}
                Chart placeholder
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
