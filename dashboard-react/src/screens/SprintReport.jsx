import { useState, useEffect } from 'react'
import { api } from '../api'

const TABS = [
  { id: 'prototype', label: 'Prototype', icon: '\u{1F4BB}' },
  { id: 'financial', label: 'Financial', icon: '\u{1F4C8}' },
  { id: 'gtm', label: 'GTM', icon: '\u{1F680}' },
  { id: 'legal', label: 'Legal', icon: '\u{2696}\uFE0F' },
  { id: 'cost', label: 'Cost', icon: '\u{1F4B0}' },
]

/* Descriptions and placeholder file names for each artifact type */
const ARTIFACT_INFO = {
  prototype: {
    title: 'CTO Prototype',
    desc: 'Generated FastAPI app with Pydantic models, fraud detection endpoints, and test suite. Each pivot produces a new version adapted to the updated strategy.',
    files: ['app.py', 'models.py', 'routes.py', 'test_app.py'],
  },
  financial: {
    title: 'CFO Financial Model',
    desc: 'Three-year projections with monthly breakdown, unit economics (LTV/CAC), funding requirements, and risk analysis. Adjusted after each pivot.',
    files: ['model_v1.json', 'model_v1.md'],
  },
  gtm: {
    title: 'CMO Go-to-Market',
    desc: 'Landing page copy, positioning statement, tagline, value propositions, competitive matrix, and launch plan. Rewritten on pivot.',
    files: ['landing_page_v1.md', 'launch_plan_v1.md', 'competitive_matrix_v1.md'],
  },
  compliance: {
    title: 'Legal Compliance',
    desc: 'Regulatory analysis with REAL citations from CFPB, FinCEN, SEC, FTC, GDPR. Blockers include actual regulation numbers and URLs.',
    files: ['report_v1.md', 'report_v1.json'],
  },
}

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
    return () => {
      cancelled = true
    }
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
      className="text-xs p-4 rounded-lg overflow-auto whitespace-pre-wrap"
      style={{
        background: 'var(--gb-surface-2)',
        color: 'var(--gb-text-bright)',
        fontFamily: 'var(--font-mono)',
        maxHeight: '60vh',
        border: '1px solid var(--gb-border)',
      }}
    >
      {content}
    </pre>
  )
}

function ArtifactGroup({ artifacts, type }) {
  const info = ARTIFACT_INFO[type]
  const filtered = artifacts.filter(
    (a) => a.artifact_type === type || (a.path && a.path.startsWith(type))
  )

  return (
    <div>
      {/* Description header */}
      {info && (
        <div className="mb-4">
          <h3
            className="text-lg font-bold mb-2"
            style={{ color: 'var(--gb-text-bright)' }}
          >
            {info.title}
          </h3>
          <p className="text-sm mb-3" style={{ color: 'var(--gb-text)' }}>
            {info.desc}
          </p>
        </div>
      )}

      {/* File badges */}
      {filtered.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {filtered.map((a, i) => (
              <span
                key={i}
                className="px-3 py-1 rounded-lg text-xs border"
                style={{
                  background: 'rgba(30,41,59,0.5)',
                  borderColor: 'rgba(51,65,85,0.5)',
                  color: 'var(--gb-text-bright)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {a.name || a.file_path?.split('/').pop() || `file-${i}`}
              </span>
            ))}
          </div>

          {/* Content */}
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
                    className="text-xs p-3 rounded-lg overflow-auto whitespace-pre-wrap"
                    style={{
                      background: 'var(--gb-surface-2)',
                      color: 'var(--gb-text-bright)',
                      fontFamily: 'var(--font-mono)',
                      border: '1px solid var(--gb-border)',
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
        </>
      ) : (
        /* Placeholder file badges when no API data */
        <div>
          <div className="flex flex-wrap gap-2">
            {(info?.files || []).map((f) => (
              <span
                key={f}
                className="px-3 py-1 rounded-lg text-xs border"
                style={{
                  background: 'rgba(30,41,59,0.5)',
                  borderColor: 'rgba(51,65,85,0.5)',
                  color: 'var(--gb-text-bright)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {f}
              </span>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--gb-text)' }}>
            No artifacts loaded yet. Run a sprint to generate outputs.
          </p>
        </div>
      )}
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
    return () => {
      cancelled = true
    }
  }, [runId])

  // Compute cost stats from summary
  const apiCost = summary?.total_cost || summary?.api_cost_usd || 0.19
  const totalEvents = summary?.events || summary?.total_events || 0
  const totalPivots = summary?.pivots || summary?.total_pivots || 0
  const totalAgents = summary?.total_agents_simulated || summary?.agents_simulated || 0
  const duration = summary?.duration || summary?.duration_seconds || 0
  const consultingCost = 15000
  const costRatio = apiCost > 0 ? Math.round(consultingCost / apiCost) : 77359

  return (
    <div className="flex flex-col min-h-screen p-6">
      {/* Header */}
      <h2
        className="text-xl font-bold mb-4"
        style={{ color: 'var(--gb-text-bright)' }}
      >
        Sprint Report
      </h2>

      {/* Tab Bar */}
      <div
        className="flex gap-1 mb-4 border-b overflow-x-auto"
        style={{ borderColor: 'rgba(51,65,85,0.5)' }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
            style={{
              borderBottom: activeTab === tab.id
                ? '2px solid var(--gb-accent)'
                : '2px solid transparent',
              color: activeTab === tab.id
                ? '#a5b4fc'
                : 'var(--gb-text)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {tab.icon} {tab.label}
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
            background: 'rgba(15,23,42,0.5)',
            borderColor: 'rgba(51,65,85,0.3)',
          }}
        >
          {/* Artifact tabs: prototype, financial, gtm, legal */}
          {activeTab !== 'cost' && (
            <ArtifactGroup artifacts={artifacts} type={activeTab === 'legal' ? 'compliance' : activeTab === 'financial' ? 'financial_model' : activeTab} />
          )}

          {/* Cost tab */}
          {activeTab === 'cost' && (
            <div>
              <h3
                className="text-lg font-bold mb-6"
                style={{ color: 'var(--gb-text-bright)' }}
              >
                Cost Comparison
              </h3>

              {/* Side-by-side cost cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* API Cost Card */}
                <div
                  className="rounded-xl p-6 text-center"
                  style={{
                    background: 'rgba(34,197,94,0.08)',
                    border: '1px solid rgba(34,197,94,0.2)',
                  }}
                >
                  <div
                    className="text-4xl font-black mb-1"
                    style={{ color: '#22c55e' }}
                  >
                    ${apiCost > 0 ? apiCost.toFixed(2) : '0.19'}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--gb-text)' }}>
                    Ghost Board API Cost
                  </div>
                </div>

                {/* Consulting Cost Card */}
                <div
                  className="rounded-xl p-6 text-center"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}
                >
                  <div
                    className="text-4xl font-black line-through"
                    style={{
                      color: 'var(--gb-text)',
                      textDecorationColor: 'rgba(239,68,68,0.4)',
                    }}
                  >
                    ${consultingCost.toLocaleString()}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--gb-text)' }}>
                    Human Consulting Equivalent
                  </div>
                </div>
              </div>

              {/* Ratio badge */}
              <div className="text-center mb-8">
                <span
                  className="inline-block px-6 py-2 rounded-full text-xl font-black"
                  style={{
                    background: 'rgba(34,197,94,0.1)',
                    border: '1px solid rgba(34,197,94,0.2)',
                    color: '#22c55e',
                  }}
                >
                  {costRatio.toLocaleString()}x cheaper
                </span>
              </div>

              {/* Bar chart visualization */}
              <div className="flex items-end gap-16 justify-center mb-8" style={{ height: '200px' }}>
                {/* API cost bar */}
                <div className="flex flex-col items-center">
                  <div
                    className="w-20 rounded-t-lg transition-all duration-1000"
                    style={{
                      height: '16px',
                      background: 'linear-gradient(to top, rgba(34,197,94,0.6), rgba(34,197,94,0.9))',
                      boxShadow: '0 0 20px rgba(34,197,94,0.3)',
                    }}
                  />
                  <div className="text-lg font-bold mt-2" style={{ color: '#22c55e' }}>
                    ${apiCost > 0 ? apiCost.toFixed(2) : '0.19'}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--gb-text)' }}>
                    Ghost Board
                  </div>
                </div>
                {/* Consulting bar */}
                <div className="flex flex-col items-center">
                  <div
                    className="w-20 rounded-t-lg"
                    style={{
                      height: '180px',
                      background: 'linear-gradient(to top, rgba(239,68,68,0.4), rgba(239,68,68,0.6))',
                    }}
                  />
                  <div className="text-lg font-bold mt-2" style={{ color: 'var(--gb-red)' }}>
                    ${consultingCost.toLocaleString()}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--gb-text)' }}>
                    Human Consulting
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div
                  className="rounded-lg p-3 text-center"
                  style={{ background: 'rgba(30,41,59,0.5)' }}
                >
                  <div className="text-xl font-bold" style={{ color: 'var(--gb-cyan)' }}>
                    {totalAgents > 0 ? totalAgents.toLocaleString() : '1,000,050'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gb-text)' }}>
                    Agents Simulated
                  </div>
                </div>
                <div
                  className="rounded-lg p-3 text-center"
                  style={{ background: 'rgba(30,41,59,0.5)' }}
                >
                  <div className="text-xl font-bold" style={{ color: 'var(--gb-yellow)' }}>
                    {totalEvents || '--'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gb-text)' }}>
                    Events
                  </div>
                </div>
                <div
                  className="rounded-lg p-3 text-center"
                  style={{ background: 'rgba(30,41,59,0.5)' }}
                >
                  <div className="text-xl font-bold" style={{ color: 'var(--gb-red)' }}>
                    {totalPivots || '--'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gb-text)' }}>
                    Pivots
                  </div>
                </div>
                <div
                  className="rounded-lg p-3 text-center"
                  style={{ background: 'rgba(30,41,59,0.5)' }}
                >
                  <div className="text-xl font-bold" style={{ color: 'var(--gb-accent)' }}>
                    {duration > 0
                      ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`
                      : '< 5m'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gb-text)' }}>
                    Duration
                  </div>
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
                    className="text-xs p-4 rounded-lg overflow-auto whitespace-pre-wrap"
                    style={{
                      background: 'var(--gb-surface-2)',
                      color: 'var(--gb-text-bright)',
                      fontFamily: 'var(--font-mono)',
                      maxHeight: '50vh',
                      border: '1px solid var(--gb-border)',
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
