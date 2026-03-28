import { useState, useEffect } from 'react'
import { api } from '../api'

const TABS = [
  { id: 'prototype', label: 'Prototype', icon: '</>' },
  { id: 'financial', label: 'Financial', icon: '$' },
  { id: 'gtm', label: 'GTM', icon: 'M' },
  { id: 'legal', label: 'Legal', icon: 'L' },
  { id: 'cost', label: 'Cost', icon: 'C' },
]

function ArtifactFileContent({ filePath }) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetchContent() {
      setLoading(true)
      setError(null)
      try {
        const text = await api.getArtifactFile(filePath)
        if (!cancelled) {
          setContent(text)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    fetchContent()
    return () => { cancelled = true }
  }, [filePath])

  if (loading) {
    return (
      <div className="text-xs py-2" style={{ color: 'var(--gb-text)' }}>
        Loading...
      </div>
    )
  }
  if (error) {
    return (
      <div className="text-xs py-2" style={{ color: 'var(--gb-red)' }}>
        Failed to load: {error}
      </div>
    )
  }

  return (
    <pre
      className="text-xs p-4 rounded overflow-auto whitespace-pre-wrap"
      style={{
        background: 'var(--gb-surface-2)',
        color: 'var(--gb-text-bright)',
        fontFamily: 'var(--font-mono)',
        maxHeight: '60vh',
      }}
    >
      {content}
    </pre>
  )
}

function ArtifactGroup({ artifacts, type }) {
  const filtered = artifacts.filter(
    (a) => a.artifact_type === type || (a.path && a.path.startsWith(type))
  )

  if (filtered.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--gb-text)' }}>
        No {type} artifacts found
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* File list */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filtered.map((a, i) => (
          <span
            key={i}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: 'var(--gb-surface-2)',
              color: 'var(--gb-accent)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {a.name || a.file_path?.split('/').pop() || `file-${i}`}
          </span>
        ))}
      </div>

      {/* Content preview or full load */}
      {filtered.map((a, i) => (
        <div key={i} className="mb-4">
          <div
            className="text-xs font-bold mb-1"
            style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
          >
            {a.name || a.file_path?.split('/').pop() || `file-${i}`}
          </div>
          {a.content_preview ? (
            <div>
              <pre
                className="text-xs p-3 rounded overflow-auto whitespace-pre-wrap"
                style={{
                  background: 'var(--gb-surface-2)',
                  color: 'var(--gb-text-bright)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {a.content_preview}
              </pre>
              {a.file_path && (
                <ArtifactFileContent filePath={a.path || a.file_path} />
              )}
            </div>
          ) : a.path || a.file_path ? (
            <ArtifactFileContent filePath={a.path || a.file_path} />
          ) : (
            <p className="text-xs" style={{ color: 'var(--gb-text)' }}>
              No content available
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function SprintReport({ runId }) {
  const [activeTab, setActiveTab] = useState('prototype')
  const [artifacts, setArtifacts] = useState([])
  const [report, setReport] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch all data
  useEffect(() => {
    if (!runId) return
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const [artifactsData, reportData, summaryData] = await Promise.all([
          api.getArtifacts(runId).catch(() => ({ artifacts: [] })),
          api.getSprintReport(runId).catch(() => null),
          api.getSummary(runId).catch(() => null),
        ])

        if (!cancelled) {
          setArtifacts(artifactsData.artifacts || [])
          setReport(reportData?.report || null)
          setSummary(summaryData?.summary || null)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [runId])

  // Compute cost stats from summary
  const apiCost = summary?.total_cost || summary?.api_cost_usd || 0
  const totalEvents = summary?.events || summary?.total_events || 0
  const totalPivots = summary?.pivots || summary?.total_pivots || 0
  const totalAgents = summary?.total_agents_simulated || summary?.agents_simulated || 0
  const duration = summary?.duration || summary?.duration_seconds || 0
  const consultingCost = 15000
  const costRatio = apiCost > 0 ? Math.round(consultingCost / apiCost) : 0

  return (
    <div className="flex flex-col min-h-screen p-6">
      {/* Tab Bar */}
      <div
        className="flex rounded-lg border overflow-hidden mb-6"
        style={{
          background: 'var(--gb-surface)',
          borderColor: 'var(--gb-border)',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 px-4 py-3 text-sm font-medium transition-all cursor-pointer"
            style={{
              background: activeTab === tab.id ? 'var(--gb-accent)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--gb-text)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span className="mr-1.5 opacity-60">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: 'var(--gb-text)', fontFamily: 'var(--font-mono)' }}>
            Loading sprint report...
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

      {/* Tab Content */}
      {!loading && !error && (
        <div
          className="flex-1 rounded-xl border p-6"
          style={{
            background: 'var(--gb-surface)',
            borderColor: 'var(--gb-border)',
          }}
        >
          {activeTab === 'prototype' && (
            <div>
              <h3
                className="text-lg font-bold mb-4"
                style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
              >
                Prototype
              </h3>
              <ArtifactGroup artifacts={artifacts} type="prototype" />
            </div>
          )}

          {activeTab === 'financial' && (
            <div>
              <h3
                className="text-lg font-bold mb-4"
                style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
              >
                Financial Model
              </h3>
              <ArtifactGroup artifacts={artifacts} type="financial_model" />
            </div>
          )}

          {activeTab === 'gtm' && (
            <div>
              <h3
                className="text-lg font-bold mb-4"
                style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
              >
                Go-to-Market
              </h3>
              <ArtifactGroup artifacts={artifacts} type="gtm" />
            </div>
          )}

          {activeTab === 'legal' && (
            <div>
              <h3
                className="text-lg font-bold mb-4"
                style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
              >
                Compliance Memo
              </h3>
              <ArtifactGroup artifacts={artifacts} type="compliance" />
            </div>
          )}

          {activeTab === 'cost' && (
            <div>
              <h3
                className="text-lg font-bold mb-4"
                style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
              >
                Cost Summary
              </h3>
              <div className="flex items-end gap-12 justify-center my-8">
                {/* API Cost */}
                <div className="text-center">
                  <div
                    className="w-16 rounded-t"
                    style={{
                      height: `${Math.max(apiCost > 0 ? 40 : 20, 20)}px`,
                      background: 'var(--gb-accent)',
                      boxShadow: '0 0 20px var(--gb-accent-glow)',
                    }}
                  />
                  <div className="text-lg font-bold mt-2" style={{ color: 'var(--gb-accent)' }}>
                    ${apiCost > 0 ? apiCost.toFixed(2) : '0.00'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--gb-text)' }}>
                    API Cost
                  </div>
                </div>
                {/* Consulting Cost */}
                <div className="text-center">
                  <div
                    className="w-16 rounded-t"
                    style={{
                      height: '200px',
                      background: 'var(--gb-red)',
                      opacity: 0.7,
                    }}
                  />
                  <div className="text-lg font-bold mt-2" style={{ color: 'var(--gb-red)' }}>
                    ${consultingCost.toLocaleString()}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--gb-text)' }}>
                    Consulting
                  </div>
                </div>
              </div>
              <div className="text-center">
                <div
                  className="text-3xl font-bold"
                  style={{ color: 'var(--gb-green)', fontFamily: 'var(--font-mono)' }}
                >
                  {costRatio > 0 ? `${costRatio.toLocaleString()}x cheaper` : 'Calculating...'}
                </div>
                <div className="flex gap-6 justify-center mt-6 text-sm" style={{ color: 'var(--gb-text)' }}>
                  <span>Agents: {totalAgents > 0 ? totalAgents.toLocaleString() : '--'}</span>
                  <span>Events: {totalEvents || '--'}</span>
                  <span>Pivots: {totalPivots || '--'}</span>
                  <span>
                    Duration:{' '}
                    {duration > 0
                      ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`
                      : '--'}
                  </span>
                </div>
              </div>

              {/* Sprint Report Markdown */}
              {report && (
                <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--gb-border)' }}>
                  <h4
                    className="text-sm font-bold mb-3"
                    style={{ color: 'var(--gb-text-bright)', fontFamily: 'var(--font-mono)' }}
                  >
                    Full Sprint Report
                  </h4>
                  <pre
                    className="text-xs p-4 rounded overflow-auto whitespace-pre-wrap"
                    style={{
                      background: 'var(--gb-surface-2)',
                      color: 'var(--gb-text-bright)',
                      fontFamily: 'var(--font-mono)',
                      maxHeight: '50vh',
                    }}
                  >
                    {report}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
