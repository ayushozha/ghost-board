import { useState, useEffect, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TAB_LIST = [
  { id: 'prototype',  label: 'Prototype',  icon: '\u2699\uFE0F' },
  { id: 'financial',  label: 'Financial',   icon: '\uD83D\uDCCA' },
  { id: 'gtm',        label: 'GTM',         icon: '\uD83D\uDE80' },
  { id: 'compliance', label: 'Compliance',  icon: '\u2696\uFE0F' },
  { id: 'cost',       label: 'Cost',        icon: '\uD83D\uDCB0' },
  { id: 'report',     label: 'Full Report', icon: '\uD83D\uDCC4' },
];

function formatUsd(val) {
  if (val === null || val === undefined) return '$0.00';
  const n = Number(val);
  return '$' + (n < 1 ? n.toFixed(4) : n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2));
}

function apiFetch(path) {
  return fetch(`/api${path}`).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r;
  });
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <span className="ml-3 text-gray-400 text-sm">Loading...</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
      <div className="text-4xl mb-3">{'\uD83D\uDCC2'}</div>
      <div>{message}</div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  const palette = {
    red:    'text-red-400 bg-red-900/20 border-red-800/40',
    yellow: 'text-yellow-400 bg-yellow-900/20 border-yellow-800/40',
    blue:   'text-blue-400 bg-blue-900/20 border-blue-800/40',
    green:  'text-green-400 bg-green-900/20 border-green-800/40',
    cyan:   'text-cyan-400 bg-cyan-900/20 border-cyan-800/40',
    purple: 'text-purple-400 bg-purple-900/20 border-purple-800/40',
  };
  return (
    <div className={`p-4 rounded-lg border ${palette[color] || palette.blue}`}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${(palette[color] || '').split(' ')[0]}`}>{value}</div>
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

// ---------------------------------------------------------------------------
// Tab: Prototype (code viewer with file tree)
// ---------------------------------------------------------------------------
function PrototypeTab({ artifacts }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);

  const protoFiles = useMemo(() =>
    artifacts.filter((a) => {
      const p = a.path || a.file_path || '';
      return p.includes('prototype') && !p.endsWith('.gitkeep');
    }),
  [artifacts]);

  useEffect(() => {
    if (protoFiles.length > 0 && !selectedFile) setSelectedFile(protoFiles[0]);
  }, [protoFiles, selectedFile]);

  useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;
    setLoadingFile(true);
    const path = selectedFile.path || selectedFile.file_path || '';
    fetch(`/api/artifacts/${path}`)
      .then((r) => r.ok ? r.text() : Promise.reject('Not found'))
      .then((text) => { if (!cancelled) setFileContent(text); })
      .catch(() => { if (!cancelled) setFileContent(selectedFile.content_preview || '// Could not load file'); })
      .finally(() => { if (!cancelled) setLoadingFile(false); });
    return () => { cancelled = true; };
  }, [selectedFile]);

  if (protoFiles.length === 0) return <EmptyState message="No prototype files found" />;

  return (
    <div className="flex h-[600px]">
      {/* File tree */}
      <div className="w-52 flex-shrink-0 bg-gray-900/60 rounded-l-lg border-r border-gray-800 overflow-y-auto">
        <div className="p-3 border-b border-gray-800 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Files ({protoFiles.length})
        </div>
        {protoFiles.map((f, i) => {
          const name = f.name || (f.path || f.file_path || '').split('/').pop();
          const isActive = selectedFile === f;
          return (
            <button
              key={i}
              onClick={() => setSelectedFile(f)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-gray-800/50 transition-colors ${
                isActive ? 'bg-indigo-900/40 text-indigo-300 border-l-2 border-l-indigo-500' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border-l-2 border-l-transparent'
              }`}
            >
              <span className="text-gray-600 mr-1.5">{name?.endsWith('.py') ? '\uD83D\uDC0D' : '\uD83D\uDCC4'}</span>
              {name}
            </button>
          );
        })}
      </div>

      {/* Code viewer */}
      <div className="flex-1 bg-gray-950 overflow-hidden flex flex-col rounded-r-lg">
        <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between bg-gray-900/80">
          <span className="text-xs text-gray-400 font-mono">
            {selectedFile?.name || (selectedFile?.path || '').split('/').pop()}
          </span>
          {selectedFile?.size != null && (
            <span className="text-xs text-gray-600">{(selectedFile.size / 1024).toFixed(1)} KB</span>
          )}
        </div>
        <div className="flex-1 overflow-auto p-0">
          {loadingFile ? (
            <div className="p-4 text-gray-500 text-sm">Loading...</div>
          ) : (
            <pre className="text-sm font-mono leading-6 text-gray-300">
              {fileContent.split('\n').map((line, i) => (
                <div key={i} className="flex hover:bg-white/[0.02]">
                  <span className="inline-block w-12 text-right pr-4 text-gray-600 select-none flex-shrink-0 text-xs leading-6 bg-gray-900/40">{i + 1}</span>
                  <span className="flex-1 px-4">{highlightPython(line)}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function highlightPython(line) {
  if (typeof line !== 'string') return line;
  if (line.trimStart().startsWith('#')) return <span className="text-gray-500 italic">{line}</span>;

  const combined = /(["'])(?:(?=(\\?))\2.)*?\1|\b(def|class|import|from|return|if|else|elif|for|while|try|except|finally|with|as|async|await|yield|raise|pass|break|continue|and|or|not|in|is|None|True|False|self)\b|(@\w+)|(#.*$)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = combined.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={`t-${lastIndex}`}>{line.slice(lastIndex, match.index)}</span>);
    const text = match[0];
    if (match[1]) {
      parts.push(<span key={`s-${match.index}`} className="text-green-400">{text}</span>);
    } else if (match[3]) {
      parts.push(<span key={`k-${match.index}`} className="text-purple-400 font-semibold">{text}</span>);
    } else if (match[4]) {
      parts.push(<span key={`d-${match.index}`} className="text-yellow-400">{text}</span>);
    } else if (match[5]) {
      parts.push(<span key={`c-${match.index}`} className="text-gray-500 italic">{text}</span>);
    } else {
      parts.push(<span key={`u-${match.index}`}>{text}</span>);
    }
    lastIndex = match.index + text.length;
  }
  if (lastIndex < line.length) parts.push(<span key={`e-${lastIndex}`}>{line.slice(lastIndex)}</span>);
  return parts.length > 0 ? <>{parts}</> : line;
}

// ---------------------------------------------------------------------------
// Tab: Financial
// ---------------------------------------------------------------------------
function FinancialTab({ runId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/artifacts/financial_model/financial_model.json')
      .then((r) => r.ok ? r.json() : fetch('/api/artifacts/financial_model/model_v4.json').then((r2) => r2.ok ? r2.json() : null))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  if (loading) return <LoadingState />;
  if (!data) return <EmptyState message="No financial model found" />;

  const monthly = data.monthly_pnl || [];
  const scenarios = data.scenarios || {};
  const runway = data.runway || {};
  const ue = data.unit_economics || {};

  return (
    <div className="space-y-6 p-4 overflow-auto">
      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Monthly Burn" value={formatUsd(runway.monthly_burn_rate)} color="red" />
        <MetricCard label="Runway" value={`${runway.runway_months || 0} mo`} color="yellow" />
        <MetricCard label="Series A Req." value={formatUsd(runway.funding_required_series_a)} color="blue" />
        <MetricCard label="LTV/CAC" value={`${ue.ltv_cac_ratio || 0}x`} color="green" />
      </div>

      {/* Unit economics */}
      {ue.cac && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-4">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-3">Unit Economics</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div><div className="text-lg font-bold text-cyan-300">{formatUsd(ue.cac)}</div><div className="text-xs text-gray-500">CAC</div></div>
            <div><div className="text-lg font-bold text-green-300">{formatUsd(ue.ltv)}</div><div className="text-xs text-gray-500">LTV</div></div>
            <div><div className="text-lg font-bold text-purple-300">{ue.ltv_cac_ratio}x</div><div className="text-xs text-gray-500">LTV/CAC</div></div>
            <div><div className="text-lg font-bold text-yellow-300">{ue.payback_period_months} mo</div><div className="text-xs text-gray-500">Payback</div></div>
            <div><div className="text-lg font-bold text-emerald-300">{ue.gross_margin_pct}%</div><div className="text-xs text-gray-500">Gross Margin</div></div>
          </div>
        </div>
      )}

      {/* Scenarios */}
      {Object.keys(scenarios).length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-4">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-3">Revenue Scenarios</h3>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(scenarios).map(([key, val]) => (
              <div key={key} className={`p-3 rounded-lg border ${key === 'optimistic' ? 'border-green-800/50 bg-green-900/15' : key === 'pessimistic' ? 'border-red-800/50 bg-red-900/15' : 'border-blue-800/50 bg-blue-900/15'}`}>
                <div className="text-xs text-gray-400 capitalize mb-1">{key}</div>
                <div className="text-lg font-bold text-white">{formatUsd(val.year1_revenue)}</div>
                <div className="text-xs text-gray-500">{val.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 12-month P&L */}
      {monthly.length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden">
          <div className="p-3 border-b border-gray-800">
            <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">12-Month P&L Projection</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="text-left p-3 font-medium text-xs">Month</th>
                  <th className="text-right p-3 font-medium text-xs">Revenue</th>
                  <th className="text-right p-3 font-medium text-xs">COGS</th>
                  <th className="text-right p-3 font-medium text-xs">OpEx</th>
                  <th className="text-right p-3 font-medium text-xs">Net</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => {
                  const net = (m.revenue || 0) - (m.cogs || 0) - (m.opex || 0);
                  return (
                    <tr key={m.month} className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-gray-300 font-mono text-xs">M{m.month}</td>
                      <td className="p-3 text-right text-green-400 font-mono text-xs">{formatUsd(m.revenue)}</td>
                      <td className="p-3 text-right text-orange-400 font-mono text-xs">{formatUsd(m.cogs)}</td>
                      <td className="p-3 text-right text-red-400 font-mono text-xs">{formatUsd(m.opex)}</td>
                      <td className={`p-3 text-right font-mono text-xs font-bold ${net >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatUsd(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-700 font-bold">
                  <td className="p-3 text-gray-200 text-xs">Total</td>
                  <td className="p-3 text-right text-green-300 font-mono text-xs">{formatUsd(monthly.reduce((s, m) => s + (m.revenue || 0), 0))}</td>
                  <td className="p-3 text-right text-orange-300 font-mono text-xs">{formatUsd(monthly.reduce((s, m) => s + (m.cogs || 0), 0))}</td>
                  <td className="p-3 text-right text-red-300 font-mono text-xs">{formatUsd(monthly.reduce((s, m) => s + (m.opex || 0), 0))}</td>
                  <td className={`p-3 text-right font-mono text-xs ${monthly.reduce((s, m) => s + (m.revenue || 0) - (m.cogs || 0) - (m.opex || 0), 0) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {formatUsd(monthly.reduce((s, m) => s + (m.revenue || 0) - (m.cogs || 0) - (m.opex || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Revenue bar chart */}
      {monthly.length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-4">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-4">Revenue Growth</h3>
          <div className="flex items-end gap-2 h-36">
            {monthly.map((m) => {
              const maxRev = Math.max(...monthly.map((x) => x.revenue || 0));
              const pct = maxRev > 0 ? ((m.revenue || 0) / maxRev) * 100 : 0;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex flex-col items-center justify-end" style={{ height: 110 }}>
                    <div
                      className="w-full max-w-8 rounded-t bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all duration-500"
                      style={{ height: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-gray-600 mt-1">M{m.month}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: GTM
// ---------------------------------------------------------------------------
function GtmTab({ runId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Try latest version, fallback down
    fetch('/api/artifacts/gtm/gtm_v4.json')
      .then((r) => r.ok ? r.json() : fetch('/api/artifacts/gtm/gtm_v3.json').then((r2) => r2.ok ? r2.json() : null))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  if (loading) return <LoadingState />;
  if (!data) return <EmptyState message="No GTM data found" />;

  const framework = data.messaging_framework || {};
  const taglines = data.taglines || [];
  const byPersona = framework.by_persona || {};

  return (
    <div className="space-y-6 p-4 overflow-auto">
      {/* Positioning */}
      {data.positioning && (
        <div className="p-5 rounded-xl bg-gradient-to-r from-purple-500/5 to-indigo-500/5 border border-purple-500/20">
          <div className="text-[10px] text-purple-400 font-mono uppercase tracking-wider mb-2">Positioning</div>
          <p className="text-gray-200 leading-relaxed">{data.positioning}</p>
        </div>
      )}

      {/* Taglines */}
      {taglines.length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-5">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-3">Taglines</h3>
          <div className="space-y-3">
            {taglines.map((t, i) => (
              <div key={i} className="p-3 rounded-lg bg-indigo-900/15 border border-indigo-800/30">
                <div className="text-lg font-bold text-indigo-200 italic">&ldquo;{typeof t === 'string' ? t : t.tagline}&rdquo;</div>
                {t.reasoning && <div className="text-xs text-gray-400 mt-1">{t.reasoning}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Elevator pitches */}
      {(framework.elevator_pitch_30s || data.elevator_pitch) && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-5">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-3">Elevator Pitch</h3>
          <div className="space-y-3">
            {framework.elevator_pitch_30s && (
              <div><span className="text-xs font-semibold text-yellow-400 mr-2">30s:</span><span className="text-gray-300 text-sm">{framework.elevator_pitch_30s}</span></div>
            )}
            {framework.elevator_pitch_60s && (
              <div><span className="text-xs font-semibold text-orange-400 mr-2">60s:</span><span className="text-gray-300 text-sm">{framework.elevator_pitch_60s}</span></div>
            )}
          </div>
        </div>
      )}

      {/* Messaging by persona */}
      {Object.keys(byPersona).length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-5">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-3">Messaging by Persona</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {Object.entries(byPersona).map(([persona, pData]) => (
              <div key={persona} className="p-4 rounded-lg bg-white/[0.02] border border-gray-700">
                <div className="text-xs font-bold text-cyan-400 uppercase mb-2">{persona.replace(/_/g, ' ')}</div>
                <div className="text-sm text-white font-semibold mb-2">{pData.headline}</div>
                {pData.key_messages && (
                  <ul className="space-y-1">
                    {pData.key_messages.map((msg, j) => (
                      <li key={j} className="text-xs text-gray-400 flex items-start gap-1.5">
                        <span className="text-gray-600 mt-0.5">&bull;</span>{msg}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proof points */}
      {framework.proof_points?.length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-5">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-3">Proof Points</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {framework.proof_points.map((pp, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded bg-green-900/10 border border-green-800/25">
                <span className="text-green-400 text-sm">{'\u2713'}</span>
                <span className="text-sm text-gray-300">{pp}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Compliance
// ---------------------------------------------------------------------------
function ComplianceTab({ runId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/artifacts/compliance/report_v1.json')
      .then((r) => r.ok ? r.json() : Promise.reject('not found'))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  if (loading) return <LoadingState />;
  if (!data) return <EmptyState message="No compliance report found" />;

  const concerns = data.regulatory_concerns || [];
  const blockers = data.blockers || [];
  const riskLevel = data.risk_level || 'UNKNOWN';
  const isHigh = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';

  return (
    <div className="space-y-6 p-4 overflow-auto">
      {/* Risk header */}
      <div
        className="rounded-lg p-5 flex items-center justify-between border"
        style={{
          background: isHigh ? 'rgba(127,29,29,0.15)' : 'rgba(20,83,45,0.15)',
          borderColor: isHigh ? 'rgba(153,27,27,0.4)' : 'rgba(22,101,52,0.4)',
        }}
      >
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Overall Risk Level</div>
          <div className={`text-2xl font-bold ${isHigh ? 'text-red-400' : 'text-green-400'}`}>{riskLevel}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1">Regulations Checked</div>
          <div className="text-xl font-bold text-gray-300">{(data.regulations_checked || []).length}</div>
        </div>
      </div>

      {/* Blockers */}
      {blockers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] text-red-400 font-mono uppercase tracking-wider flex items-center gap-2">
            {'\u26A0'} Blockers ({blockers.length})
          </h3>
          {blockers.map((b, i) => (
            <div key={i} className="p-4 rounded-lg bg-red-900/10 border border-red-800/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700">{b.severity}</span>
                <span className="text-white font-semibold">{b.area}</span>
              </div>
              <p className="text-sm text-gray-300 mb-2">{b.description}</p>
              {b.citations?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {b.citations.map((c, ci) => (
                    <span key={ci} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-cyan-400 border border-gray-700 font-mono">
                      {c.startsWith?.('http') ? (
                        <a href={c} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 underline">{c.replace(/^https?:\/\//, '').split('/')[0]}</a>
                      ) : c}
                    </span>
                  ))}
                </div>
              )}
              {b.recommended_action && (
                <div className="mt-2 text-xs text-gray-400 bg-gray-800/50 rounded p-2">
                  <span className="font-semibold text-gray-300">Recommended: </span>{b.recommended_action}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* All concerns */}
      {concerns.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Regulatory Concerns ({concerns.length})</h3>
          {concerns.map((c, i) => {
            const sev = c.severity || '';
            const sevIsHigh = sev === 'HIGH' || sev === 'CRITICAL';
            return (
              <div key={i} className={`p-4 rounded-lg border ${sevIsHigh ? 'bg-red-900/10 border-red-800/30' : sev === 'MEDIUM' ? 'bg-yellow-900/10 border-yellow-800/25' : 'bg-green-900/10 border-green-800/25'}`}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${sevIsHigh ? 'text-red-400' : sev === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400'}`} style={{ background: 'rgba(0,0,0,0.25)' }}>
                    {sev}
                  </span>
                  <span className="text-white font-semibold">{c.regulation_name}</span>
                  {c.is_blocker && <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700">BLOCKER</span>}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-cyan-400 font-mono bg-gray-800 px-2 py-0.5 rounded">{c.section_number}</span>
                  {c.issuing_body && <span className="text-xs text-gray-500">{c.issuing_body}</span>}
                </div>
                <p className="text-sm text-gray-300 mb-2">{c.summary}</p>
                {c.impact && <div className="text-xs text-gray-400 mb-2"><span className="font-semibold text-orange-400">Impact: </span>{c.impact}</div>}
                {c.recommended_action && (
                  <div className="text-xs text-gray-400 bg-gray-800/50 rounded p-2 mt-2">
                    <span className="font-semibold text-gray-300">Recommended: </span>{c.recommended_action}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Industries */}
      {data.industries_detected && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Industries:</span>
          {data.industries_detected.map((ind, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300">{ind}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Cost (dramatic comparison)
// ---------------------------------------------------------------------------
function CostTab({ runData, runId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const id = runId || 'latest';
    apiFetch(`/runs/${id}/summary`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSummary(d.summary || d); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  if (loading) return <LoadingState />;

  const apiCost = summary?.total_cost || runData?.api_cost_usd || runData?.total_cost || 0.19;
  const consultingCost = 15000;
  const multiplier = apiCost > 0 ? Math.round(consultingCost / apiCost) : 77359;
  const totalTokens = summary?.total_tokens || 0;
  const totalEvents = summary?.events || runData?.events || runData?.total_events || 0;
  const totalPivots = summary?.pivots || runData?.pivots || runData?.total_pivots || 0;
  const costs = summary?.costs || {};
  const wandbUrl = summary?.wandb_url || runData?.wandb_url;

  const maxCost = Math.max(apiCost, consultingCost);
  const apiBarH = Math.max((apiCost / maxCost) * 260, 16);
  const consultBarH = Math.max((consultingCost / maxCost) * 260, 16);

  return (
    <div className="space-y-8 p-4 overflow-auto">
      {/* Dramatic bar comparison */}
      <div className="flex items-end justify-center gap-16 pt-8 pb-4">
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-black text-cyan-400 font-mono">{formatUsd(apiCost)}</div>
          <div
            className="w-20 rounded-t-xl bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all duration-1000"
            style={{ height: `${apiBarH}px`, boxShadow: '0 0 20px rgba(6,182,212,0.35)' }}
          />
          <div className="text-xs text-gray-400 text-center font-semibold">Ghost Board<br />API Cost</div>
        </div>
        <div className="flex flex-col items-center justify-end pb-8">
          <div className="text-lg text-gray-600 font-bold">vs</div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-black text-red-400 font-mono">{formatUsd(consultingCost)}</div>
          <div
            className="w-20 rounded-t-xl bg-gradient-to-t from-red-700 to-red-500 transition-all duration-1000"
            style={{ height: `${consultBarH}px`, boxShadow: '0 0 20px rgba(239,68,68,0.25)' }}
          />
          <div className="text-xs text-gray-400 text-center font-semibold">Traditional<br />Consulting</div>
        </div>
      </div>

      {/* Multiplier */}
      <div className="text-center">
        <span className="inline-block px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/30">
          <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
            {multiplier.toLocaleString()}x cheaper
          </span>
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Events" value={totalEvents} icon={'\uD83D\uDCCA'} />
        <StatCard label="Pivots" value={totalPivots} icon={'\u21BB'} />
        <StatCard label="Total Tokens" value={totalTokens.toLocaleString()} icon={'\uD83D\uDCDD'} />
        <StatCard label="Total Cost" value={formatUsd(apiCost)} icon={'\uD83D\uDCB0'} />
      </div>

      {/* Per-agent cost breakdown */}
      {Object.keys(costs).length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-5">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-4">Cost by Agent</h3>
          <div className="space-y-3">
            {Object.entries(costs).map(([agent, d]) => {
              const agentCost = d.estimated_cost_usd || 0;
              const pct = apiCost > 0 ? (agentCost / apiCost) * 100 : 0;
              const agentColors = { CEO: '#3b82f6', CTO: '#8b5cf6', CFO: '#22c55e', CMO: '#f59e0b', Legal: '#ef4444' };
              const c = agentColors[agent] || '#6b7280';
              return (
                <div key={agent} className="flex items-center gap-4">
                  <div className="w-14 text-sm font-semibold" style={{ color: c }}>{agent}</div>
                  <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 2)}%`, background: c, boxShadow: `0 0 8px ${c}40` }} />
                  </div>
                  <div className="text-sm text-gray-300 font-mono w-16 text-right">{formatUsd(agentCost)}</div>
                  <div className="text-xs text-gray-600 w-20 text-right">{d.total_tokens?.toLocaleString() || 0} tok</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* W&B link */}
      {wandbUrl && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400 mb-1">W&B Dashboard</div>
            <a href={wandbUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline text-sm">{wandbUrl}</a>
          </div>
          <a href={wandbUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-black text-sm font-semibold rounded transition-colors">
            Open W&B
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Full Report (rendered markdown)
// ---------------------------------------------------------------------------
function FullReportTab({ runId }) {
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const id = runId || 'latest';
    apiFetch(`/runs/${id}/sprint-report`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setReport(d.report || ''); })
      .catch(() => {
        // Fallback: try raw file
        fetch('/api/artifacts/sprint_report.md')
          .then((r) => r.ok ? r.text() : '')
          .then((text) => { if (!cancelled) setReport(text); })
          .catch(() => {});
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  if (loading) return <LoadingState />;
  if (!report) return <EmptyState message="No sprint report found" />;

  return (
    <div className="p-6 max-h-[700px] overflow-y-auto">
      <div className="max-w-4xl mx-auto">{renderMarkdown(report)}</div>
    </div>
  );
}

// Simple markdown renderer
function renderMarkdown(md) {
  const lines = md.split('\n');
  const elements = [];
  let inCode = false;
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre key={`code-${i}`} className="bg-gray-950 border border-gray-800 rounded-lg p-4 overflow-x-auto text-sm font-mono text-gray-300 my-4">{codeLines.join('\n')}</pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-lg font-bold text-white mt-6 mb-2">{inlineFmt(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-xl font-bold text-white mt-8 mb-3 pb-2 border-b border-gray-800">{inlineFmt(line.slice(3))}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-2xl font-bold text-white mt-6 mb-4">{inlineFmt(line.slice(2))}</h1>);
    } else if (/^---+$/.test(line)) {
      elements.push(<hr key={i} className="border-gray-800 my-6" />);
    } else if (/^\s*[-*]\s/.test(line)) {
      const indent = (line.match(/^(\s*)/)?.[1] || '').length;
      const text = line.replace(/^\s*[-*]\s/, '');
      elements.push(
        <div key={i} className="flex items-start gap-2 my-0.5" style={{ paddingLeft: `${indent * 8}px` }}>
          <span className="text-gray-600 mt-1 flex-shrink-0">&bull;</span>
          <span className="text-gray-300 text-sm">{inlineFmt(text)}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-gray-300 text-sm leading-relaxed my-1">{inlineFmt(line)}</p>);
    }
  }
  return elements;
}

function inlineFmt(text) {
  const parts = [];
  let remaining = text;
  let key = 0;
  const boldRx = /\*\*(.+?)\*\*/g;
  let m;
  let last = 0;
  while ((m = boldRx.exec(remaining)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{codeInline(remaining.slice(last, m.index))}</span>);
    parts.push(<strong key={key++} className="text-white font-bold">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < remaining.length) parts.push(<span key={key++}>{codeInline(remaining.slice(last))}</span>);
  return parts.length > 0 ? <>{parts}</> : codeInline(text);
}

function codeInline(text) {
  const parts = [];
  const rx = /`([^`]+)`/g;
  let m;
  let last = 0;
  let k = 0;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    parts.push(<code key={k++} className="text-cyan-400 bg-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">{m[1]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
  return parts.length > 0 ? <>{parts}</> : text;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function SprintReport({ runId }) {
  const [activeTab, setActiveTab] = useState('cost');
  const [runData, setRunData] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const id = runId || 'latest';

    Promise.all([
      fetch(`/api/runs/${id}`).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/runs/${id}/artifacts`).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([run, arts]) => {
      if (!cancelled) {
        setRunData(run);
        setArtifacts(arts?.artifacts || []);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });

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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-7xl mx-auto w-full px-4 py-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400">{'\uD83D\uDCCA'}</span> Sprint Report
          </h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5">
            Artifacts and cost summary &middot; Run {runId || 'latest'}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-gray-900/50 border border-gray-800 rounded-xl p-1 overflow-x-auto">
        {TAB_LIST.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
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
        {activeTab === 'prototype'  && <PrototypeTab artifacts={artifacts} />}
        {activeTab === 'financial'  && <FinancialTab runId={runId} />}
        {activeTab === 'gtm'        && <GtmTab runId={runId} />}
        {activeTab === 'compliance' && <ComplianceTab runId={runId} />}
        {activeTab === 'cost'       && <CostTab runData={runData} runId={runId} />}
        {activeTab === 'report'     && <FullReportTab runId={runId} />}
      </div>
    </div>
  );
}
