import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import Globe from '../components/Globe'

const ARCHETYPE_COLORS = {
  vc: 'var(--gb-green)',
  venture_capitalist: 'var(--gb-green)',
  investor: 'var(--gb-green)',
  user: 'var(--gb-blue)',
  early_adopter: 'var(--gb-blue)',
  consumer: 'var(--gb-blue)',
  press: 'var(--gb-yellow)',
  journalist: 'var(--gb-yellow)',
  media: 'var(--gb-yellow)',
  competitor: 'var(--gb-red)',
  rival: 'var(--gb-red)',
  regulator: '#a855f7',
  default: 'var(--gb-text)',
}

function archetypeColor(archetype) {
  if (!archetype) return ARCHETYPE_COLORS.default
  const lower = archetype.toLowerCase().replace(/[^a-z_]/g, '')
  return ARCHETYPE_COLORS[lower] || ARCHETYPE_COLORS.default
}

function archetypeCategory(archetype) {
  if (!archetype) return 'Other'
  const lower = archetype.toLowerCase()
  if (lower.includes('vc') || lower.includes('investor') || lower.includes('venture')) return 'VC'
  if (lower.includes('user') || lower.includes('adopter') || lower.includes('consumer')) return 'User'
  if (lower.includes('press') || lower.includes('journalist') || lower.includes('media')) return 'Press'
  if (lower.includes('competitor') || lower.includes('rival')) return 'Competitor'
  if (lower.includes('regulator')) return 'Regulator'
  return 'Other'
}

export default function MarketArena({ runId, sprintStatus }) {
  const [round, setRound] = useState(0)
  const [totalRounds, setTotalRounds] = useState(0)
  const [sentiment, setSentiment] = useState(0)
  const [posts, setPosts] = useState([])
  const [sentimentByType, setSentimentByType] = useState({})
  const [roundHistory, setRoundHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [simMeta, setSimMeta] = useState(null)
  const feedRef = useRef(null)

  // Fetch simulation data
  useEffect(() => {
    if (!runId) return
    let cancelled = false

    async function fetchSimulation() {
      setLoading(true)
      setError(null)

      try {
        const data = await api.getSimulation(runId)
        if (cancelled) return

        const results = data.results || {}
        const geo = data.geo || []

        setSimMeta(results)
        setTotalRounds(results.rounds || 0)
        setSentiment(results.overall_sentiment || 0)

        // Build posts from geo data (persona reactions)
        const personas = Array.isArray(geo) ? geo : []
        const postItems = personas
          .filter((p) => p.content)
          .map((p) => ({
            persona: p.name || 'Unknown',
            archetype: p.archetype || 'unknown',
            text: p.content,
            stance: p.stance || 0,
            round: p.round || 1,
            lat: p.lat,
            lng: p.lng,
          }))

        setPosts(postItems)

        // Find max round
        const maxRound = postItems.reduce((max, p) => Math.max(max, p.round || 0), 0)
        setRound(maxRound)

        // Compute sentiment by archetype category
        const byType = {}
        for (const p of personas) {
          const cat = archetypeCategory(p.archetype)
          if (!byType[cat]) byType[cat] = { total: 0, count: 0 }
          byType[cat].total += p.stance || 0
          byType[cat].count += 1
        }
        const avgByType = {}
        for (const [cat, data] of Object.entries(byType)) {
          avgByType[cat] = data.count > 0 ? data.total / data.count : 0
        }
        setSentimentByType(avgByType)

        // Build round-by-round sentiment history
        const roundMap = {}
        for (const p of personas) {
          const r = p.round || 1
          if (!roundMap[r]) roundMap[r] = { total: 0, count: 0 }
          roundMap[r].total += p.stance || 0
          roundMap[r].count += 1
        }
        const history = Object.entries(roundMap)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([r, d]) => ({
            round: Number(r),
            sentiment: d.count > 0 ? d.total / d.count : 0,
          }))
        setRoundHistory(history)

        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    fetchSimulation()
    return () => { cancelled = true }
  }, [runId, sprintStatus])

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [posts])

  const sentimentCategories = [
    { label: 'VC', key: 'VC', color: 'var(--gb-green)' },
    { label: 'User', key: 'User', color: 'var(--gb-blue)' },
    { label: 'Press', key: 'Press', color: 'var(--gb-yellow)' },
    { label: 'Competitor', key: 'Competitor', color: 'var(--gb-red)' },
    { label: 'Regulator', key: 'Regulator', color: '#a855f7' },
  ]

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
        {simMeta && (
          <span className="text-xs" style={{ color: 'var(--gb-text)' }}>
            {(simMeta.llm_agents || 0)} LLM + {(simMeta.lightweight_agents || 0).toLocaleString()} lightweight
          </span>
        )}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}>
            Loading simulation data...
          </p>
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: 'var(--gb-red)', fontFamily: 'var(--font-mono)' }}>
            {error}
          </p>
        </div>
      )}

      {/* Main Content: Feed | Globe | Charts */}
      {!loading && !error && (
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
              className="px-4 py-3 text-sm font-semibold border-b flex justify-between"
              style={{ borderColor: 'var(--gb-border)', color: 'var(--gb-text-bright)' }}
            >
              <span>Feed</span>
              <span className="font-normal text-xs" style={{ color: 'var(--gb-text)' }}>
                {posts.length} posts
              </span>
            </div>
            <div ref={feedRef} className="flex-1 overflow-y-auto p-3 space-y-3">
              {posts.length === 0 ? (
                <p className="text-xs text-center" style={{ color: 'var(--gb-text)' }}>
                  No simulation posts yet
                </p>
              ) : (
                posts.map((post, i) => (
                  <div
                    key={i}
                    className="text-xs p-2 rounded"
                    style={{ background: 'var(--gb-surface-2)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold" style={{ color: archetypeColor(post.archetype) }}>
                        [{post.persona}]
                      </span>
                      <span
                        className="text-xs"
                        style={{
                          color: post.stance >= 0 ? 'var(--gb-green)' : 'var(--gb-red)',
                        }}
                      >
                        {post.stance >= 0 ? '+' : ''}{post.stance.toFixed(1)}
                      </span>
                    </div>
                    <div style={{ color: 'var(--gb-text-bright)' }}>{post.text}</div>
                    <div className="mt-1 flex justify-between">
                      <span style={{ color: 'var(--gb-text)', opacity: 0.6 }}>
                        {post.archetype}
                      </span>
                      <span style={{ color: 'var(--gb-text)', opacity: 0.6 }}>R{post.round}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Center: 3D Globe */}
          <div
            className="flex-1 rounded-xl border relative overflow-hidden"
            style={{
              background: 'var(--gb-surface)',
              borderColor: 'var(--gb-border)',
              minHeight: 400,
            }}
          >
            <Globe
              personas={posts.map((p) => ({
                name: p.persona,
                archetype: p.archetype,
                lat: p.lat,
                lng: p.lng,
                stance: p.stance,
                content: p.text,
              }))}
            />
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
              {sentimentCategories.map((item) => {
                const val = sentimentByType[item.key] || 0
                return (
                  <div key={item.key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--gb-text)' }}>{item.label}</span>
                      <span style={{ color: item.color }}>
                        {val >= 0 ? '+' : ''}{val.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: 'var(--gb-surface-2)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(Math.abs(val) * 50 + 50, 100)}%`,
                          background: item.color,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                )
              })}

              {/* Round-by-round sentiment chart */}
              <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--gb-border)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--gb-text)' }}>
                  Sentiment Over Rounds
                </div>
                {roundHistory.length > 0 ? (
                  <div className="h-32 rounded flex items-end gap-1 px-2" style={{ background: 'var(--gb-surface-2)' }}>
                    {roundHistory.map((r) => {
                      const normalized = (r.sentiment + 1) / 2 // -1..1 -> 0..1
                      const height = Math.max(normalized * 100, 5)
                      return (
                        <div key={r.round} className="flex-1 flex flex-col items-center justify-end h-full">
                          <div
                            className="w-full rounded-t transition-all"
                            style={{
                              height: `${height}%`,
                              background: r.sentiment >= 0 ? 'var(--gb-green)' : 'var(--gb-red)',
                              opacity: 0.7,
                              minHeight: '4px',
                            }}
                          />
                          <span className="text-xs mt-1" style={{ color: 'var(--gb-text)', fontSize: '9px' }}>
                            R{r.round}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div
                    className="h-32 rounded flex items-center justify-center text-xs"
                    style={{ background: 'var(--gb-surface-2)', color: 'var(--gb-text)' }}
                  >
                    No round data
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
