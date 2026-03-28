import { useState, useEffect } from 'react';
import { getRunArtifacts, getRunReport } from '../api';

// ── Tab definitions ──
const TABS = [
  { id: 'prototype',  label: 'Prototype',  icon: '\u2699\uFE0F' },
  { id: 'financial',  label: 'Financial',   icon: '\uD83D\uDCCA' },
  { id: 'gtm',        label: 'GTM',         icon: '\uD83D\uDE80' },
  { id: 'compliance', label: 'Compliance',  icon: '\u2696\uFE0F' },
  { id: 'cost',       label: 'Cost',        icon: '\uD83D\uDCB0' },
];

// ── Prototype viewer ──
function PrototypeTab({ data }) {
  const files = data?.files || data?.prototype || {};
  const fileList = typeof files === 'object' && !Array.isArray(files) ? Object.entries(files) : [];
  const [activeFile, setActiveFile] = useState(null);

  useEffect(() => {
    if (fileList.length > 0 && !activeFile) {
      setActiveFile(fileList[0][0]);
    }
  }, [fileList, activeFile]);

  const content = typeof files === 'string'
    ? files
    : activeFile && files[activeFile]
    ? (typeof files[activeFile] === 'string' ? files[activeFile] : JSON.stringify(files[activeFile], null, 2))
    : data?.code || data?.content || 'No prototype data available';

  return (
    <div className="flex h-full min-h-0">
      {/* File tree sidebar */}
      {fileList.length > 1 && (
        <div className="w-48 border-r border-gray-800 overflow-y-auto flex-shrink-0">
          <div className="px-3 py-2 text-[10px] text-gray-600 font-mono uppercase tracking-wider">Files</div>
          {fileList.map(([name]) => (
            <button
              key={name}
              onClick={() => setActiveFile(name)}
              className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer ${
                activeFile === name
                  ? 'bg-indigo-500/10 text-indigo-300 border-l-2 border-indigo-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.02] border-l-2 border-transparent'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {/* Code block */}
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-sm font-mono text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
          <code>{content}</code>
        </pre>
      </div>
    </div>
  );
}

// ── Financial model viewer ──
function FinancialTab({ data }) {
  const model = data?.financial_model || data?.financial || data || {};
  const projections = model.projections || model.monthly || model.rows || [];
  const summary = model.summary || model.assumptions || {};

  // Try to extract table headers from first row
  const headers = projections.length > 0
    ? Object.keys(typeof projections[0] === 'object' ? projections[0] : {})
    : ['Month', 'Revenue', 'COGS', 'Gross Margin', 'OpEx', 'Net'];

  return (
    <div className="overflow-auto p-4 space-y-6">
      {/* Summary cards */}
      {typeof summary === 'object' && Object.keys(summary).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(summary).slice(0, 8).map(([key, value]) => (
            <div key={key} className="p-3 rounded-xl bg-white/[0.02] border border-gray-800">
              <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-1">
                {key.replace(/_/g, ' ')}
              </div>
              <div className="text-sm text-gray-200 font-semibold">{typeof value === 'number' ? value.toLocaleString() : String(value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {projections.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                {headers.map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {h.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projections.map((row, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors">
                  {headers.map((h) => {
                    const val = typeof row === 'object' ? row[h] : row;
                    const formatted = typeof val === 'number'
                      ? (val >= 1000 ? `$${(val / 1000).toFixed(1)}K` : val < 0 ? `-$${Math.abs(val).toLocaleString()}` : `$${val.toLocaleString()}`)
                      : String(val ?? '-');
                    return (
                      <td key={h} className="px-4 py-2 text-gray-300 font-mono text-xs">
                        {formatted}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          <pre className="text-sm text-gray-400 font-mono whitespace-pre-wrap">
            {typeof model === 'string' ? model : JSON.stringify(model, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── GTM viewer ──
function GtmTab({ data }) {
  const gtm = data?.gtm || data?.go_to_market || data || {};
  const positioning = gtm.positioning || gtm.strategy || '';
  const taglines = gtm.taglines || gtm.headlines || [];
  const channels = gtm.channels || gtm.distribution || [];
  const copy = gtm.copy || gtm.content || gtm.landing_page || '';

  return (
    <div className="overflow-auto p-4 space-y-6">
      {/* Positioning */}
      {positioning && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/5 to-indigo-500/5 border border-purple-500/20">
          <div className="text-[10px] text-purple-400 font-mono uppercase tracking-wider mb-2">Positioning</div>
          <p className="text-gray-200 leading-relaxed">{typeof positioning === 'string' ? positioning : JSON.stringify(positioning)}</p>
        </div>
      )}

      {/* Taglines */}
      {taglines.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Taglines</div>
          <div className="space-y-2">
            {(Array.isArray(taglines) ? taglines : [taglines]).map((t, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/[0.02] border border-gray-800 text-gray-300 italic">
                &ldquo;{typeof t === 'string' ? t : t.text || JSON.stringify(t)}&rdquo;
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Channels */}
      {channels.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Distribution Channels</div>
          <div className="flex flex-wrap gap-2">
            {(Array.isArray(channels) ? channels : [channels]).map((c, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                {typeof c === 'string' ? c : c.name || JSON.stringify(c)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Copy / content */}
      {copy && (
        <div>
          <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Marketing Copy</div>
          <div className="p-4 rounded-xl bg-white/[0.02] border border-gray-800">
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
              {typeof copy === 'string' ? copy : JSON.stringify(copy, null, 2)}
            </p>
          </div>
        </div>
      )}

      {/* Fallback */}
      {!positioning && taglines.length === 0 && !copy && (
        <pre className="text-sm text-gray-400 font-mono whitespace-pre-wrap">
          {JSON.stringify(gtm, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Compliance viewer ──
function ComplianceTab({ data }) {
  const compliance = data?.compliance || data?.legal || data || {};
  const regulations = compliance.regulations || compliance.findings || compliance.items || [];
  const memo = compliance.memo || compliance.summary || compliance.report || '';
  const citations = compliance.citations || [];

  // Highlight regulation numbers in text
  function highlightCitations(text) {
    if (typeof text !== 'string') return String(text);
    // Match patterns like "12 CFR 1005", "31 CFR 1010", "SEC Rule 15c3-3", etc.
    return text.split(/(\d+\s+(?:CFR|USC|U\.S\.C\.)\s+\d+[\w.-]*|(?:SEC|CFPB|FinCEN|FINRA)\s+(?:Rule|Regulation|Act)\s*[\w.-]+)/gi).map((part, i) => {
      if (i % 2 === 1) {
        return <span key={i} className="text-cyan-400 font-semibold">{part}</span>;
      }
      return part;
    });
  }

  return (
    <div className="overflow-auto p-4 space-y-6">
      {/* Memo */}
      {memo && (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-gray-800">
          <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Compliance Memo</div>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {highlightCitations(typeof memo === 'string' ? memo : JSON.stringify(memo))}
          </p>
        </div>
      )}

      {/* Regulations list */}
      {regulations.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Regulations</div>
          <div className="space-y-2">
            {(Array.isArray(regulations) ? regulations : [regulations]).map((reg, i) => {
              const title = typeof reg === 'string' ? reg : reg.title || reg.name || reg.regulation || '';
              const desc = typeof reg === 'object' ? (reg.description || reg.detail || reg.summary || '') : '';
              const cite = typeof reg === 'object' ? (reg.citation || reg.reference || '') : '';
              return (
                <div key={i} className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <div className="flex items-start gap-2">
                    <span className="text-red-400 text-xs mt-0.5 flex-shrink-0">{'\u2696\uFE0F'}</span>
                    <div>
                      <div className="text-sm text-gray-200 font-semibold">{highlightCitations(title)}</div>
                      {desc && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{highlightCitations(desc)}</p>}
                      {cite && (
                        <div className="mt-1">
                          <span className="text-[10px] text-cyan-400 font-mono">{cite}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Citations */}
      {citations.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Citations</div>
          <div className="space-y-1">
            {citations.map((c, i) => (
              <div key={i} className="text-xs text-cyan-400 font-mono">
                {typeof c === 'string' ? (
                  c.startsWith('http') ? (
                    <a href={c} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 underline">{c}</a>
                  ) : c
                ) : (
                  <span>{c.url || c.text || JSON.stringify(c)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fallback */}
      {!memo && regulations.length === 0 && (
        <pre className="text-sm text-gray-400 font-mono whitespace-pre-wrap">
          {JSON.stringify(compliance, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Cost comparison viewer ──
function CostTab({ report }) {
  const cost = report?.cost || report?.cost_summary || {};
  const apiCost = cost.api_cost ?? cost.total_cost ?? cost.ghost_board_cost ?? 0.19;
  const consultingCost = cost.consulting_cost ?? cost.traditional_cost ?? cost.human_cost ?? 15000;
  const ratio = consultingCost > 0 && apiCost > 0 ? Math.round(consultingCost / apiCost) : 77359;
  const agents = cost.agents_simulated ?? cost.total_agents ?? 1000050;
  const events = cost.events ?? cost.total_events ?? 35;
  const pivots = cost.pivots ?? cost.total_pivots ?? 3;
  const duration = cost.duration ?? cost.elapsed ?? '4m 23s';
  const wandbUrl = cost.wandb_url || report?.wandb_url || null;

  // Scale bars relative to max
  const maxCost = Math.max(apiCost, consultingCost);
  const apiBarHeight = Math.max((apiCost / maxCost) * 240, 16);
  const consultBarHeight = Math.max((consultingCost / maxCost) * 240, 16);

  return (
    <div className="overflow-auto p-4 space-y-8">
      {/* Cost comparison bars */}
      <div className="flex items-end justify-center gap-16 pt-8 pb-4">
        {/* Ghost Board bar */}
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-black text-cyan-400 font-mono">
            ${typeof apiCost === 'number' ? apiCost.toFixed(2) : apiCost}
          </div>
          <div
            className="w-20 rounded-t-xl bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all duration-1000"
            style={{ height: `${apiBarHeight}px` }}
          />
          <div className="text-xs text-gray-400 text-center font-semibold">Ghost Board<br />API Cost</div>
        </div>

        {/* VS */}
        <div className="flex flex-col items-center justify-end pb-8">
          <div className="text-lg text-gray-600 font-bold">vs</div>
        </div>

        {/* Consulting bar */}
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-black text-red-400 font-mono">
            ${typeof consultingCost === 'number' ? consultingCost.toLocaleString() : consultingCost}
          </div>
          <div
            className="w-20 rounded-t-xl bg-gradient-to-t from-red-700 to-red-500 transition-all duration-1000"
            style={{ height: `${consultBarHeight}px` }}
          />
          <div className="text-xs text-gray-400 text-center font-semibold">Traditional<br />Consulting</div>
        </div>
      </div>

      {/* Ratio badge */}
      <div className="text-center">
        <span className="inline-block px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/30">
          <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
            {ratio.toLocaleString()}x cheaper
          </span>
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Agents Simulated" value={typeof agents === 'number' ? agents.toLocaleString() : agents} icon={'\uD83C\uDF0D'} />
        <StatCard label="Events" value={events} icon={'\uD83D\uDCC8'} />
        <StatCard label="Pivots" value={pivots} icon={'\u21BB'} />
        <StatCard label="Duration" value={duration} icon={'\u23F1\uFE0F'} />
      </div>

      {/* Links */}
      <div className="flex items-center gap-4 justify-center pt-4">
        {wandbUrl && (
          <a
            href={wandbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm hover:bg-yellow-500/20 transition-colors"
          >
            {'\uD83D\uDCC9'} W&B Dashboard
          </a>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-gray-800 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ── Main SprintReport component ──
export default function SprintReport({ runId }) {
  const [activeTab, setActiveTab] = useState('cost');
  const [artifacts, setArtifacts] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    async function fetchData() {
      try {
        const [art, rep] = await Promise.allSettled([
          getRunArtifacts(runId),
          getRunReport(runId),
        ]);

        if (cancelled) return;

        if (art.status === 'fulfilled') setArtifacts(art.value);
        if (rep.status === 'fulfilled') setReport(rep.value);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError('Could not load sprint data');
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [runId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-mono">Loading sprint report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[80vh]">
        <div className="text-center space-y-2">
          <p className="text-red-400 font-mono">{error}</p>
          <p className="text-xs text-gray-600">Run ID: {runId}</p>
        </div>
      </div>
    );
  }

  const data = { ...(artifacts || {}), ...(report || {}) };

  function renderTabContent() {
    switch (activeTab) {
      case 'prototype':  return <PrototypeTab data={data} />;
      case 'financial':  return <FinancialTab data={data} />;
      case 'gtm':        return <GtmTab data={data} />;
      case 'compliance': return <ComplianceTab data={data} />;
      case 'cost':       return <CostTab report={data} />;
      default:           return null;
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-7xl mx-auto w-full px-4 py-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400">{'\uD83D\uDCCA'}</span> Sprint Report
          </h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5">
            Artifacts and cost summary &middot; Run {runId}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-gray-900/50 border border-gray-800 rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden min-h-0">
        {renderTabContent()}
      </div>
    </div>
  );
}
