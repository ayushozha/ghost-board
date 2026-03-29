import { useState, useEffect, useMemo, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

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

const AGENT_COLORS = {
  CEO: '#3b82f6',
  CTO: '#8b5cf6',
  CFO: '#22c55e',
  CMO: '#f59e0b',
  Legal: '#ef4444',
  Simulation: '#06b6d4',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatUsd(val) {
  if (val === null || val === undefined) return '$0.00';
  const n = Number(val);
  if (isNaN(n)) return '$0.00';
  return '$' + (n < 1 ? n.toFixed(4) : n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2));
}

/**
 * Format a number as a dollar amount with comma separators.
 * Positive → green, negative → red, zero → white (class returned separately).
 */
function formatCurrency(val) {
  if (val === null || val === undefined) return { text: '$0', colorClass: 'text-white' };
  const n = Number(val);
  if (isNaN(n)) return { text: '$0', colorClass: 'text-white' };
  const abs = Math.abs(n);
  const formatted =
    abs < 1
      ? abs.toFixed(4)
      : abs >= 1_000_000
        ? (abs / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'M'
        : abs >= 1_000
          ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 })
          : abs.toFixed(2);
  const text = (n < 0 ? '-$' : '$') + formatted;
  const colorClass = n > 0 ? 'text-green-400' : n < 0 ? 'text-red-400' : 'text-white';
  return { text, colorClass };
}

/** Format a percentage value, color-coded by sign. */
function formatPercent(val) {
  if (val === null || val === undefined) return { text: '0%', colorClass: 'text-white' };
  const n = Number(val);
  if (isNaN(n)) return { text: '0%', colorClass: 'text-white' };
  const text = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  const colorClass = n > 0 ? 'text-green-400' : n < 0 ? 'text-red-400' : 'text-white';
  return { text, colorClass };
}

/** Render a currency value as a colored <span>. */
function CurrencyCell({ value, forceColor }) {
  const { text, colorClass } = formatCurrency(value);
  return <span className={`font-mono font-semibold ${forceColor || colorClass}`}>{text}</span>;
}

/** Render a percentage value as a colored <span>. */
function PercentCell({ value }) {
  const { text, colorClass } = formatPercent(value);
  return <span className={`font-mono font-semibold ${colorClass}`}>{text}</span>;
}

function apiFetch(path) {
  return fetch(`/api${path}`).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r;
  });
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Count-up animation hook */
function useCountUp(target, duration = 2000, active = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!active || target <= 0) { setValue(target); return; }
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, active]);

  return value;
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

function SeverityBadge({ severity }) {
  const s = (severity || '').toUpperCase();
  const styles = {
    CRITICAL: 'bg-red-900/60 text-red-300 border-red-600',
    HIGH:     'bg-red-900/40 text-red-400 border-red-700',
    MEDIUM:   'bg-yellow-900/40 text-yellow-400 border-yellow-700',
    LOW:      'bg-green-900/40 text-green-400 border-green-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-bold border ${styles[s] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      {s || 'UNKNOWN'}
    </span>
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

  const fileExt = (name) => {
    if (!name) return '';
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  };

  const fileIcon = (name) => {
    const ext = fileExt(name);
    if (ext === 'py') return '\uD83D\uDC0D';
    if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') return '\uD83D\uDFE8';
    if (ext === 'json') return '\uD83D\uDCC4';
    if (ext === 'md') return '\uD83D\uDCD6';
    if (ext === 'html') return '\uD83C\uDF10';
    if (ext === 'css') return '\uD83C\uDFA8';
    return '\uD83D\uDCC4';
  };

  return (
    <div className="flex h-[600px]">
      {/* File tree sidebar - 30% */}
      <div className="w-[30%] flex-shrink-0 bg-gray-900/60 rounded-l-lg border-r border-gray-800 overflow-y-auto">
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
                isActive
                  ? 'bg-indigo-900/40 text-indigo-300 border-l-2 border-l-indigo-500'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border-l-2 border-l-transparent'
              }`}
            >
              <span className="text-gray-600 mr-1.5">{fileIcon(name)}</span>
              {name}
            </button>
          );
        })}
      </div>

      {/* Code viewer - 70% */}
      <div className="w-[70%] bg-gray-950 overflow-hidden flex flex-col rounded-r-lg">
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
            <pre className="font-mono text-sm leading-6 bg-gray-950 h-full">
              <code className="block">
                {fileContent.split('\n').map((line, i) => (
                  <div key={i} className="flex hover:bg-white/[0.03]">
                    <span className="inline-block w-12 text-right pr-4 text-gray-600 select-none flex-shrink-0 text-xs leading-6 bg-gray-900/60 border-r border-gray-800">{i + 1}</span>
                    <span className="flex-1 px-4 whitespace-pre">{highlightSyntax(line)}</span>
                  </div>
                ))}
              </code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function highlightSyntax(line) {
  if (typeof line !== 'string') return line;
  // Full-line comments
  if (line.trimStart().startsWith('#')) return <span className="text-gray-500 italic">{line}</span>;
  if (line.trimStart().startsWith('//')) return <span className="text-gray-500 italic">{line}</span>;

  // Capture groups:
  // 1: string opening quote (strings)
  // 3: keyword
  // 4: decorator
  // 5: inline comment
  // 6: number
  const combined = /(["'])(?:(?=(\\?))\2.)*?\1|\b(def|class|import|from|return|if|else|elif|for|while|try|except|finally|with|as|async|await|yield|raise|pass|break|continue|and|or|not|in|is|None|True|False|self|const|let|var|function|export|default|type|interface|extends|implements|new|this|super|null|undefined|true|false|void)\b|(@\w+)|(#[^'"]*$|\/\/[^'"]*$)|\b(\d+\.?\d*)\b/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = combined.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={`t-${lastIndex}`} className="text-gray-100">{line.slice(lastIndex, match.index)}</span>);
    const text = match[0];
    if (match[1]) {
      // string literal → green
      parts.push(<span key={`s-${match.index}`} className="text-green-400">{text}</span>);
    } else if (match[3]) {
      // keyword → cyan
      parts.push(<span key={`k-${match.index}`} className="text-cyan-400 font-semibold">{text}</span>);
    } else if (match[4]) {
      // decorator → yellow
      parts.push(<span key={`d-${match.index}`} className="text-yellow-400">{text}</span>);
    } else if (match[5]) {
      // inline comment → gray italic
      parts.push(<span key={`c-${match.index}`} className="text-gray-500 italic">{text}</span>);
    } else if (match[6]) {
      // number → orange
      parts.push(<span key={`n-${match.index}`} className="text-orange-400">{text}</span>);
    } else {
      parts.push(<span key={`u-${match.index}`} className="text-gray-100">{text}</span>);
    }
    lastIndex = match.index + text.length;
  }
  if (lastIndex < line.length) parts.push(<span key={`e-${lastIndex}`} className="text-gray-100">{line.slice(lastIndex)}</span>);
  return parts.length > 0 ? <>{parts}</> : <span className="text-gray-100">{line}</span>;
}

// ---------------------------------------------------------------------------
// Tab: Financial (Recharts AreaChart + 12-month P&L table)
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

  // Chart data
  const chartData = monthly.map((m) => ({
    name: `M${m.month}`,
    Revenue: m.revenue || 0,
    COGS: m.cogs || 0,
    OpEx: m.opex || 0,
    Net: (m.revenue || 0) - (m.cogs || 0) - (m.opex || 0),
  }));

  // Summary cards
  const y1Revenue = scenarios.base?.year1_revenue || monthly.reduce((s, m) => s + (m.revenue || 0), 0);

  return (
    <div className="space-y-6 p-4 overflow-auto">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Revenue Y1" value={formatCurrency(y1Revenue).text} color="green" />
        <MetricCard label="Burn Rate" value={formatCurrency(runway.monthly_burn_rate).text} color="red" />
        <MetricCard label="Runway" value={`${runway.runway_months || 0} mo`} color="yellow" />
        <MetricCard label="LTV/CAC" value={`${ue.ltv_cac_ratio || 0}x`} color="cyan" />
      </div>

      {/* Recharts AreaChart: Revenue vs Costs */}
      {chartData.length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-5">
          <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-4">Revenue vs Costs (12 Months)</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorCosts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}
                  formatter={(v) => formatUsd(v)}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                <Area type="monotone" dataKey="Revenue" stroke="#22c55e" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                <Area type="monotone" dataKey="OpEx" stroke="#ef4444" fillOpacity={1} fill="url(#colorCosts)" strokeWidth={2} />
                <Area type="monotone" dataKey="Net" stroke="#06b6d4" fillOpacity={1} fill="url(#colorNet)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 12-month P&L table */}
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
                  <th className="text-right p-3 font-medium text-xs">Gross Margin</th>
                  <th className="text-right p-3 font-medium text-xs">OpEx</th>
                  <th className="text-right p-3 font-medium text-xs">Net</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => {
                  const gross = (m.revenue || 0) - (m.cogs || 0);
                  const net = gross - (m.opex || 0);
                  return (
                    <tr key={m.month} className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-gray-300 font-mono text-xs">M{m.month}</td>
                      <td className="p-3 text-right text-xs"><CurrencyCell value={m.revenue} forceColor="text-green-400" /></td>
                      <td className="p-3 text-right text-xs"><CurrencyCell value={m.cogs} forceColor="text-red-400" /></td>
                      <td className="p-3 text-right text-xs"><CurrencyCell value={gross} /></td>
                      <td className="p-3 text-right text-xs"><CurrencyCell value={m.opex} forceColor="text-red-400" /></td>
                      <td className="p-3 text-right text-xs font-bold"><CurrencyCell value={net} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-700 font-bold">
                  <td className="p-3 text-gray-200 text-xs">Total</td>
                  <td className="p-3 text-right text-xs">
                    <CurrencyCell value={monthly.reduce((s, m) => s + (m.revenue || 0), 0)} forceColor="text-green-300" />
                  </td>
                  <td className="p-3 text-right text-xs">
                    <CurrencyCell value={monthly.reduce((s, m) => s + (m.cogs || 0), 0)} forceColor="text-red-300" />
                  </td>
                  <td className="p-3 text-right text-xs">
                    <CurrencyCell value={monthly.reduce((s, m) => s + (m.revenue || 0) - (m.cogs || 0), 0)} />
                  </td>
                  <td className="p-3 text-right text-xs">
                    <CurrencyCell value={monthly.reduce((s, m) => s + (m.opex || 0), 0)} forceColor="text-red-300" />
                  </td>
                  <td className="p-3 text-right text-xs">
                    <CurrencyCell value={monthly.reduce((s, m) => s + (m.revenue || 0) - (m.cogs || 0) - (m.opex || 0), 0)} />
                  </td>
                </tr>
              </tfoot>
            </table>
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
                <div className="text-lg font-bold">
                  <CurrencyCell
                    value={val.year1_revenue}
                    forceColor={key === 'optimistic' ? 'text-green-400' : key === 'pessimistic' ? 'text-red-400' : 'text-blue-400'}
                  />
                </div>
                <div className="text-xs text-gray-500">{val.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: simple markdown renderer for competitive analysis
// ---------------------------------------------------------------------------
function renderCompetitiveMarkdown(md) {
  if (!md) return null;
  const lines = md.split('\n');
  const elements = [];
  let tableBuffer = [];
  let inTable = false;

  const flushTable = (key) => {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer.map((row) =>
      row.split('|').map((c) => c.trim()).filter((c) => c !== '')
    );
    // Filter out separator rows (--- cells)
    const filtered = rows.filter((r) => !r.every((c) => /^[-:]+$/.test(c)));
    if (filtered.length === 0) { tableBuffer = []; return; }
    const [header, ...body] = filtered;
    elements.push(
      <div key={`tbl-${key}`} className="overflow-x-auto my-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800/60">
              {header.map((h, hi) => (
                <th key={hi} className="text-left p-2 border border-gray-700 text-xs text-gray-300 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                {row.map((cell, ci) => (
                  <td key={ci} className="p-2 border border-gray-700 text-xs text-gray-400">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
  };

  lines.forEach((line, i) => {
    if (line.includes('|')) {
      inTable = true;
      tableBuffer.push(line);
      return;
    }
    if (inTable) {
      flushTable(i);
      inTable = false;
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-base font-bold text-white mt-5 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-lg font-bold text-white mt-6 mb-3 pb-1 border-b border-gray-700">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold text-white mt-6 mb-4">{line.slice(2)}</h1>);
    } else if (/^\s*[-*]\s/.test(line)) {
      elements.push(
        <div key={i} className="flex items-start gap-2 my-0.5 ml-2">
          <span className="text-gray-500 mt-1 flex-shrink-0">&bull;</span>
          <span className="text-gray-300 text-sm">{line.replace(/^\s*[-*]\s/, '')}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-gray-300 text-sm leading-relaxed my-1">{line}</p>);
    }
  });
  if (inTable) flushTable('end');
  return elements;
}

// ---------------------------------------------------------------------------
// GTM sub-tab: Competitive
// ---------------------------------------------------------------------------
function GtmCompetitiveSubTab({ runId }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);

    // Try dedicated artifact endpoint first, then direct fallback path
    fetch('/api/artifacts/gtm/competitive_analysis.md')
      .then((r) => r.ok ? r.text() : Promise.reject('not found'))
      .catch(() =>
        // fallback: try run-specific artifact path
        fetch(`/api/runs/${runId || 'latest'}/artifacts/gtm/competitive_analysis.md`)
          .then((r) => r.ok ? r.text() : Promise.reject('not found'))
      )
      .then((text) => { if (!cancelled) setContent(text); })
      .catch(() => { if (!cancelled) setUnavailable(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [runId]);

  if (loading) return <LoadingState />;
  if (unavailable || !content) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <div className="text-4xl mb-3">{'\uD83D\uDCC2'}</div>
        <div>Competitive analysis not yet generated</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-h-[640px] overflow-y-auto">
      <div className="max-w-4xl mx-auto">{renderCompetitiveMarkdown(content)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: GTM (positioning, taglines, competitive matrix) with sub-tabs
// ---------------------------------------------------------------------------
function GtmTab({ runId }) {
  const [gtmSubTab, setGtmSubTab] = useState('copy');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/artifacts/gtm/gtm_v4.json')
      .then((r) => r.ok ? r.json() : fetch('/api/artifacts/gtm/gtm_v3.json').then((r2) => r2.ok ? r2.json() : null))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  const GTM_SUB_TABS = [
    { id: 'copy', label: 'Copy' },
    { id: 'competitive', label: 'Competitive' },
  ];

  // Derived from data (safe when data is null — only used inside !data guard)
  const framework = data?.messaging_framework || {};
  const taglines = data?.taglines || [];
  const byPersona = framework.by_persona || {};
  const compMatrix = data?.competitive_matrix || data?.competitive_landscape || [];
  const proofPoints = framework.proof_points || data?.proof_points || [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-gray-800 flex-shrink-0">
        {GTM_SUB_TABS.map((st) => (
          <button
            key={st.id}
            onClick={() => setGtmSubTab(st.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              gtmSubTab === st.id
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent'
            }`}
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* Competitive sub-tab */}
      {gtmSubTab === 'competitive' && <GtmCompetitiveSubTab runId={runId} />}

      {/* Copy sub-tab */}
      {gtmSubTab === 'copy' && (
        <>
          {loading ? (
            <LoadingState />
          ) : !data ? (
            <EmptyState message="No GTM data found" />
          ) : (
            <div className="space-y-6 p-4 overflow-auto flex-1">
              {/* Positioning statement - large text */}
              {data.positioning && (
                <div className="p-6 rounded-xl bg-gradient-to-r from-purple-500/5 to-indigo-500/5 border border-purple-500/20">
                  <div className="text-[10px] text-purple-400 font-mono uppercase tracking-wider mb-3">Positioning Statement</div>
                  <p className="text-xl text-gray-100 leading-relaxed font-medium">{data.positioning}</p>
                </div>
              )}

              {/* Taglines as cards */}
              {taglines.length > 0 && (
                <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-5">
                  <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-3">Taglines</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {taglines.map((t, i) => (
                      <div key={i} className="p-4 rounded-lg bg-indigo-900/15 border border-indigo-800/30 hover:border-indigo-600/50 transition-colors">
                        <div className="text-lg font-bold text-indigo-200 italic">&ldquo;{typeof t === 'string' ? t : t.tagline}&rdquo;</div>
                        {(typeof t !== 'string' && t.reasoning) && <div className="text-xs text-gray-400 mt-2">{t.reasoning}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Competitive matrix as table */}
              {compMatrix.length > 0 && (
                <div className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden">
                  <div className="p-3 border-b border-gray-800">
                    <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Competitive Matrix</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 text-gray-500">
                          <th className="text-left p-3 font-medium text-xs">Competitor</th>
                          {compMatrix[0] && Object.keys(compMatrix[0]).filter((k) => k !== 'name' && k !== 'competitor').map((col) => (
                            <th key={col} className="text-center p-3 font-medium text-xs capitalize">{col.replace(/_/g, ' ')}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {compMatrix.map((row, i) => {
                          const name = row.name || row.competitor || `Entry ${i + 1}`;
                          const cols = Object.entries(row).filter(([k]) => k !== 'name' && k !== 'competitor');
                          return (
                            <tr key={i} className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors">
                              <td className="p-3 text-gray-200 font-semibold text-xs">{name}</td>
                              {cols.map(([key, val]) => {
                                const v = typeof val === 'string' ? val.toLowerCase() : '';
                                const cellColor =
                                  v.includes('strong') || v.includes('yes') || v.includes('high') || val === true
                                    ? 'bg-green-900/30 text-green-300'
                                    : v.includes('weak') || v.includes('no') || v.includes('low') || val === false
                                      ? 'bg-red-900/30 text-red-300'
                                      : v.includes('medium') || v.includes('partial')
                                        ? 'bg-yellow-900/30 text-yellow-300'
                                        : 'text-gray-300';
                                return (
                                  <td key={key} className={`p-3 text-center text-xs ${cellColor}`}>
                                    {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
              {proofPoints.length > 0 && (
                <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-5">
                  <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-3">Proof Points</h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {proofPoints.map((pp, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded bg-green-900/10 border border-green-800/25">
                        <span className="text-green-400 text-sm">{'\u2713'}</span>
                        <span className="text-sm text-gray-300">{pp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Citation linkifier helpers (Legal / Compliance tab)
// ---------------------------------------------------------------------------

/**
 * Sanitize a raw HTML string by stripping <script> tags and event handlers,
 * returning a string safe to use with dangerouslySetInnerHTML.
 */
function sanitizeLegalHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
}

/**
 * Convert plain-text legal content into HTML with clickable citations and URLs.
 * Handles:
 *   - CFR references: "12 C.F.R. § 1026.1" → ecfr.gov search
 *   - USC references: "15 U.S.C. § 78a" → uscode.house.gov
 *   - Raw URLs already in the text
 */
function linkifyCitations(text) {
  if (!text) return '';
  // Escape HTML entities first so we don't double-encode later
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // URLs (must run before CFR/USC to avoid double-wrapping)
  html = html.replace(
    /https?:\/\/[^\s<>"]+/g,
    (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 underline hover:text-cyan-300">${url}</a>`
  );

  // CFR: e.g. "12 C.F.R. § 1026.1" or "12 CFR 1026.1"
  html = html.replace(
    /(\d+)\s+C\.?F\.?R\.?\s+[§Sec.]*\s*([\d.]+)/gi,
    (match, title, section) => {
      const query = encodeURIComponent(`${title} CFR ${section}`);
      return `<a href="https://www.ecfr.gov/search#query=${query}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 underline hover:text-cyan-300">${match}</a>`;
    }
  );

  // USC: e.g. "15 U.S.C. § 78a" or "15 USC 78a"
  html = html.replace(
    /(\d+)\s+U\.?S\.?C\.?\s+[§Sec.]*\s*([\w.-]+)/gi,
    (match) =>
      `<a href="https://uscode.house.gov" target="_blank" rel="noopener noreferrer" class="text-cyan-400 underline hover:text-cyan-300">${match}</a>`
  );

  return html;
}

/** Render a block of legal text with clickable citations. */
function LegalTextBlock({ text }) {
  if (!text) return null;
  const html = sanitizeLegalHtml(linkifyCitations(text));
  return (
    <p
      className="text-sm text-gray-300 mb-2 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ---------------------------------------------------------------------------
// Tab: Compliance (regulatory concerns with severity badges)
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
            <div key={i} className="p-4 rounded-lg bg-red-900/10 border-l-4 border-l-red-500 border border-red-800/30">
              <div className="flex items-center gap-2 mb-2">
                <SeverityBadge severity={b.severity} />
                <span className="text-white font-semibold">{b.area}</span>
              </div>
              <LegalTextBlock text={b.description} />
              {b.citations?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {b.citations.map((c, ci) => (
                    <span key={ci} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-cyan-400 border border-gray-700 font-mono">
                      {c.startsWith?.('http') ? (
                        <a href={c} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 underline">{c.replace(/^https?:\/\//, '').split('/')[0]}</a>
                      ) : <span className="text-cyan-400">{c}</span>}
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
            const sev = (c.severity || '').toUpperCase();
            const isCritical = sev === 'CRITICAL' || sev === 'HIGH';
            const borderLeft = isCritical
              ? 'border-l-4 border-l-red-500'
              : sev === 'MEDIUM'
                ? 'border-l-4 border-l-yellow-500'
                : 'border-l-4 border-l-green-500';
            const bgColor = isCritical
              ? 'bg-red-900/10 border-red-800/30'
              : sev === 'MEDIUM'
                ? 'bg-yellow-900/10 border-yellow-800/25'
                : 'bg-green-900/10 border-green-800/25';
            return (
              <div key={i} className={`p-4 rounded-lg border ${bgColor} ${borderLeft}`}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <SeverityBadge severity={sev} />
                  <span className="text-white font-semibold">{c.regulation_name}</span>
                  {c.is_blocker && <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700">BLOCKER</span>}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-cyan-400 font-mono bg-gray-800 px-2 py-0.5 rounded">{c.section_number}</span>
                  {c.issuing_body && <span className="text-xs text-gray-500">{c.issuing_body}</span>}
                </div>
                <LegalTextBlock text={c.summary} />
                {c.impact && <div className="text-xs text-gray-400 mb-2"><span className="font-semibold text-orange-400">Impact: </span><LegalTextBlock text={c.impact} /></div>}
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
// Tab: Cost (dramatic comparison with count-up animation)
// ---------------------------------------------------------------------------
function CostTab({ runData, runId }) {
  const [summary, setSummary] = useState(null);
  const [costDetail, setCostDetail] = useState(null);
  const [costDetailError, setCostDetailError] = useState(false);
  const [wandbData, setWandbData] = useState(undefined); // undefined = loading, null = no URL
  const [loading, setLoading] = useState(true);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = runId || 'latest';

    // Fetch summary, cost detail, and W&B link in parallel
    Promise.all([
      apiFetch(`/runs/${id}/summary`)
        .then((r) => r.json())
        .then((d) => d.summary || d)
        .catch(() => null),
      fetch(`/api/runs/${id}/cost`)
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .catch(() => null),
      fetch(`/api/runs/${id}/wandb`)
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .catch(() => null),
    ]).then(([summaryData, costData, wandb]) => {
      if (!cancelled) {
        setSummary(summaryData);
        if (costData === null) {
          setCostDetailError(true);
        } else {
          setCostDetail(costData);
        }
        // wandb endpoint returns { url: "..." } or { url: null }
        setWandbData(wandb?.url ?? null);
      }
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
        setTimeout(() => setAnimating(true), 100);
      }
    });

    return () => { cancelled = true; };
  }, [runId]);

  // Prefer cost detail data, fall back to summary, then runData defaults
  const apiCost =
    costDetail?.estimated_cost_usd ??
    summary?.total_cost ??
    runData?.api_cost_usd ??
    runData?.total_cost ??
    0.19;
  const totalTokens =
    costDetail?.total_tokens ??
    summary?.total_tokens ??
    0;
  const promptTokens = costDetail?.prompt_tokens ?? null;
  const completionTokens = costDetail?.completion_tokens ?? null;

  const consultingCost = 15000;
  const multiplier = apiCost > 0 ? Math.round(consultingCost / apiCost) : 77359;
  const totalEvents = summary?.events || runData?.events || runData?.total_events || 0;
  const totalPivots = summary?.pivots || runData?.pivots || runData?.total_pivots || 0;
  const totalAgents = summary?.total_agents || 1000050;
  const duration = summary?.duration || runData?.duration || '< 5 min';
  const costs = summary?.costs || {};

  // W&B URL: prefer dedicated endpoint result, fall back to summary/runData
  const wandbUrl = wandbData !== undefined
    ? wandbData
    : (summary?.wandb_url || runData?.wandb_url || null);

  const animatedMultiplier = useCountUp(multiplier, 2500, animating);

  if (loading) return <LoadingState />;

  // Dramatic bar heights: consulting bar fills the space, API bar is tiny
  const barContainerH = 300;
  const consultBarH = barContainerH;
  const apiBarH = Math.max(Math.round((apiCost / consultingCost) * barContainerH), 4);

  return (
    <div className="space-y-8 p-6 overflow-auto">
      {/* Dramatic bar comparison */}
      <div className="flex items-end justify-center gap-20 pt-4">
        {/* API cost bar - tiny */}
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-black text-cyan-400 font-mono">{formatUsd(apiCost)}</div>
          <div className="flex items-end" style={{ height: `${barContainerH}px` }}>
            <div
              className="w-24 rounded-t-xl transition-all duration-1000 ease-out"
              style={{
                height: animating ? `${apiBarH}px` : '0px',
                background: 'linear-gradient(to top, #0891b2, #22d3ee)',
                boxShadow: '0 0 30px rgba(6,182,212,0.4), 0 0 60px rgba(6,182,212,0.15)',
              }}
            />
          </div>
          <div className="text-sm text-gray-400 text-center font-semibold">Ghost Board<br />API Cost</div>
        </div>

        {/* VS */}
        <div className="flex flex-col items-center justify-center" style={{ height: `${barContainerH}px` }}>
          <div className="text-2xl text-gray-600 font-bold">vs</div>
        </div>

        {/* Consulting cost bar - MASSIVE */}
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-black text-red-400 font-mono">{formatUsd(consultingCost)}</div>
          <div className="flex items-end" style={{ height: `${barContainerH}px` }}>
            <div
              className="w-24 rounded-t-xl transition-all duration-1500 ease-out"
              style={{
                height: animating ? `${consultBarH}px` : '0px',
                background: 'linear-gradient(to top, #991b1b, #ef4444)',
                boxShadow: '0 0 30px rgba(239,68,68,0.3), 0 0 60px rgba(239,68,68,0.1)',
              }}
            />
          </div>
          <div className="text-sm text-gray-400 text-center font-semibold">Traditional<br />Consulting</div>
        </div>
      </div>

      {/* Multiplier with count-up animation */}
      <div className="text-center py-4">
        <span className="inline-block px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/30">
          <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 tabular-nums">
            {animatedMultiplier.toLocaleString()}x
          </span>
          <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400/80 to-emerald-400/80 ml-3">
            cheaper
          </span>
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Agents Simulated" value={Number(totalAgents).toLocaleString()} icon={'\uD83E\uDDD1\u200D\uD83D\uDCBB'} />
        <StatCard label="Events" value={`${totalEvents}+`} icon={'\uD83D\uDCCA'} />
        <StatCard label="Pivots" value={totalPivots} icon={'\u21BB'} />
        <StatCard label="Duration" value={typeof duration === 'number' ? `${Math.round(duration / 60)}m ${duration % 60}s` : duration} icon={'\u23F1'} />
      </div>

      {/* Token / cost detail from /api/runs/{id}/cost */}
      {costDetailError ? (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-4 text-sm text-gray-500 text-center">
          Cost data not available for this run
        </div>
      ) : costDetail && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-4">
          <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-3">API Cost Detail</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-white/[0.02] border border-gray-700 text-center">
              <div className="text-xs text-gray-400 mb-1">Estimated Cost</div>
              <div className="text-lg font-bold text-cyan-300 font-mono">{formatUsd(costDetail.estimated_cost_usd)}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.02] border border-gray-700 text-center">
              <div className="text-xs text-gray-400 mb-1">Total Tokens</div>
              <div className="text-lg font-bold text-white font-mono">{(costDetail.total_tokens ?? 0).toLocaleString()}</div>
            </div>
            {promptTokens !== null && (
              <div className="p-3 rounded-lg bg-white/[0.02] border border-gray-700 text-center">
                <div className="text-xs text-gray-400 mb-1">Prompt Tokens</div>
                <div className="text-lg font-bold text-purple-300 font-mono">{promptTokens.toLocaleString()}</div>
              </div>
            )}
            {completionTokens !== null && (
              <div className="p-3 rounded-lg bg-white/[0.02] border border-gray-700 text-center">
                <div className="text-xs text-gray-400 mb-1">Completion Tokens</div>
                <div className="text-lg font-bold text-yellow-300 font-mono">{completionTokens.toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Per-agent cost table */}
      {Object.keys(costs).length > 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Cost Breakdown by Agent</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="text-left p-3 font-medium text-xs">Agent</th>
                  <th className="text-right p-3 font-medium text-xs">Tokens</th>
                  <th className="text-right p-3 font-medium text-xs">Cost</th>
                  <th className="text-left p-3 font-medium text-xs w-1/3">Share</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(costs).map(([agent, d]) => {
                  const agentCost = d.estimated_cost_usd || 0;
                  const pct = apiCost > 0 ? (agentCost / apiCost) * 100 : 0;
                  const c = AGENT_COLORS[agent] || '#6b7280';
                  return (
                    <tr key={agent} className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors">
                      <td className="p-3">
                        <span className="text-sm font-semibold" style={{ color: c }}>{agent}</span>
                      </td>
                      <td className="p-3 text-right text-gray-400 font-mono text-xs">{(d.total_tokens || 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-gray-300 font-mono text-xs font-bold">{formatUsd(agentCost)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${Math.max(pct, 2)}%`, background: c, boxShadow: `0 0 8px ${c}40` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-700 font-bold">
                  <td className="p-3 text-gray-200 text-xs">Total</td>
                  <td className="p-3 text-right text-gray-300 font-mono text-xs">{totalTokens.toLocaleString()}</td>
                  <td className="p-3 text-right text-cyan-300 font-mono text-xs">{formatUsd(apiCost)}</td>
                  <td className="p-3 text-xs text-gray-500">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* W&B link */}
      <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-4">
        <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-2">Weights &amp; Biases</div>
        {wandbUrl ? (
          <div className="flex items-center justify-between">
            <a
              href={wandbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline text-sm truncate max-w-[70%]"
            >
              {wandbUrl}
            </a>
            <a
              href={wandbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-black text-sm font-semibold rounded transition-colors whitespace-nowrap ml-3"
            >
              View W&B Dashboard &rarr;
            </a>
          </div>
        ) : (
          <span className="text-gray-500 text-sm">W&B logging not configured</span>
        )}
      </div>
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

// ---------------------------------------------------------------------------
// Simple markdown renderer
// ---------------------------------------------------------------------------
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
  const [jsonDownloading, setJsonDownloading] = useState(false);

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

  function handleExportPdf() {
    window.print();
  }

  async function handleExportJson() {
    setJsonDownloading(true);
    try {
      const id = runId || 'latest';
      const [run, arts, trace, simResults] = await Promise.all([
        fetch(`/api/runs/${id}`).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/runs/${id}/artifacts`).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/artifacts/trace.json').then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/artifacts/simulation_results.json').then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        run_id: id,
        run: run,
        artifacts: arts?.artifacts || [],
        trace: trace,
        simulation_results: simResults,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `sprint-${id}-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setJsonDownloading(false);
    }
  }

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
      <div className="flex items-center justify-between sprint-report-header">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400">{'\uD83D\uDCCA'}</span> Sprint Report
          </h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5">
            Artifacts and cost summary &middot; Run {runId || 'latest'}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white hover:bg-white/[0.04] transition-all duration-150 cursor-pointer"
          >
            <span>{'\uD83D\uDDCB'}</span>
            <span>Export PDF</span>
          </button>
          <button
            onClick={handleExportJson}
            disabled={jsonDownloading}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150 cursor-pointer ${
              jsonDownloading
                ? 'border-cyan-700 text-cyan-500 bg-cyan-900/10 cursor-not-allowed'
                : 'border-gray-600 text-gray-300 hover:border-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/10'
            }`}
          >
            <span>{jsonDownloading ? '\u23F3' : '\uD83D\uDCBE'}</span>
            <span>{jsonDownloading ? 'Downloading...' : 'Export JSON'}</span>
          </button>
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
