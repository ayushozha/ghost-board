import { useState, useEffect } from 'react'

const TABS = [
  { id: 'prototype', label: 'Prototype', icon: '</>' },
  { id: 'financial', label: 'Financial', icon: '$' },
  { id: 'gtm', label: 'GTM', icon: 'M' },
  { id: 'legal', label: 'Legal', icon: 'L' },
  { id: 'cost', label: 'Cost', icon: 'C' },
]

export default function SprintReport({ runId }) {
  const [activeTab, setActiveTab] = useState('prototype')
  const [data, setData] = useState({})

  // TODO: Load from /api/runs/{runId}/artifacts

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

      {/* Tab Content */}
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
            <div
              className="rounded-lg p-4 text-sm"
              style={{
                background: 'var(--gb-surface-2)',
                color: 'var(--gb-text)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {/* TODO: File tree + syntax highlighted code from outputs/prototype/ */}
              Waiting for prototype data...
            </div>
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
            <div
              className="rounded-lg p-4 text-sm"
              style={{ background: 'var(--gb-surface-2)', color: 'var(--gb-text)' }}
            >
              {/* TODO: Interactive table + Recharts from outputs/financial_model/ */}
              Waiting for financial data...
            </div>
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
            <div
              className="rounded-lg p-4 text-sm"
              style={{ background: 'var(--gb-surface-2)', color: 'var(--gb-text)' }}
            >
              {/* TODO: Rendered landing page in iframe + taglines from outputs/gtm/ */}
              Waiting for GTM data...
            </div>
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
            <div
              className="rounded-lg p-4 text-sm"
              style={{ background: 'var(--gb-surface-2)', color: 'var(--gb-text)' }}
            >
              {/* TODO: Citations highlighted and linkable from outputs/compliance/ */}
              Waiting for compliance data...
            </div>
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
                    height: '40px',
                    background: 'var(--gb-accent)',
                    boxShadow: '0 0 20px var(--gb-accent-glow)',
                  }}
                />
                <div className="text-lg font-bold mt-2" style={{ color: 'var(--gb-accent)' }}>
                  $0.19
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
                  $15,000
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
                77,359x cheaper
              </div>
              <div className="flex gap-6 justify-center mt-6 text-sm" style={{ color: 'var(--gb-text)' }}>
                <span>Agents: 1,000,050</span>
                <span>Events: --</span>
                <span>Pivots: --</span>
                <span>Duration: --</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
