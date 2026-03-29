import { useState, useEffect } from 'react';
import { getRuns } from '../api';

// ── Demo fallback data ────────────────────────────────────────────────────────
const DEMO_RUNS = [
  {
    id: 'run-001',
    concept: 'Anchrix — stablecoin payout API for gig workers',
    status: 'completed',
    created_at: '2026-03-28T10:14:02Z',
    event_count: 38,
    pivot_count: 3,
    duration_s: 263,
    api_cost_usd: 0.19,
    agent_count: 1000050,
  },
  {
    id: 'run-002',
    concept: 'NovaMed — AI diagnostic triage for rural clinics',
    status: 'completed',
    created_at: '2026-03-27T22:55:11Z',
    event_count: 31,
    pivot_count: 2,
    duration_s: 198,
    api_cost_usd: 0.14,
    agent_count: 1000050,
  },
  {
    id: 'run-003',
    concept: 'GridPulse — peer-to-peer energy trading platform',
    status: 'running',
    created_at: '2026-03-28T12:01:44Z',
    event_count: 12,
    pivot_count: 1,
    duration_s: null,
    api_cost_usd: null,
    agent_count: 50,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtCost(usd) {
  if (usd == null) return '—';
  return `$${Number(usd).toFixed(2)}`;
}

function fmtAgents(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

function StatusBadge({ status }) {
  const map = {
    completed: { label: 'Completed', cls: 'bg-green-900/50 text-green-400 border-green-700/50' },
    running:   { label: 'Running',   cls: 'bg-yellow-900/50 text-yellow-400 border-yellow-700/50' },
    failed:    { label: 'Failed',    cls: 'bg-red-900/50 text-red-400 border-red-700/50' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'bg-gray-800 text-gray-400 border-gray-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status === 'running' && (
        <span className="relative flex h-1.5 w-1.5 mr-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-400" />
        </span>
      )}
      {label}
    </span>
  );
}

// ── Comparison Panel ──────────────────────────────────────────────────────────
function ComparePanel({ runA, runB, onClose }) {
  const metrics = [
    { key: 'concept',       label: 'Concept',          fmt: (v) => v || '—' },
    { key: 'status',        label: 'Status',            fmt: (v) => v || '—' },
    { key: 'created_at',    label: 'Started',           fmt: fmtDate },
    { key: 'event_count',   label: 'Events',            fmt: (v) => v ?? '—' },
    { key: 'pivot_count',   label: 'Pivots',            fmt: (v) => v ?? '—' },
    { key: 'duration_s',    label: 'Duration',          fmt: fmtDuration },
    { key: 'api_cost_usd',  label: 'API Cost',          fmt: fmtCost },
    { key: 'agent_count',   label: 'Agents Simulated',  fmt: fmtAgents },
  ];

  return (
    <div className="mt-6 rounded-xl border border-cyan-700/40 bg-gray-900/80 backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-cyan-950/60 border-b border-cyan-700/30">
        <span className="text-sm font-semibold text-cyan-400 tracking-wide uppercase">
          Side-by-Side Comparison
        </span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-200 transition-colors cursor-pointer text-lg leading-none"
          aria-label="Close comparison"
        >
          &times;
        </button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 divide-x divide-gray-800 border-b border-gray-800 text-xs font-medium uppercase tracking-wider text-gray-500">
        <div className="px-5 py-2">Metric</div>
        <div className="px-5 py-2 text-cyan-300 truncate" title={runA.id}>{runA.id}</div>
        <div className="px-5 py-2 text-purple-300 truncate" title={runB.id}>{runB.id}</div>
      </div>

      {/* Rows */}
      {metrics.map(({ key, label, fmt }) => {
        const valA = fmt(runA[key]);
        const valB = fmt(runB[key]);
        const differ = valA !== valB;
        return (
          <div
            key={key}
            className={`grid grid-cols-3 divide-x divide-gray-800 border-b border-gray-800/50 text-sm ${differ ? 'bg-gray-800/30' : ''}`}
          >
            <div className="px-5 py-2.5 text-gray-400">{label}</div>
            <div className={`px-5 py-2.5 text-gray-200 truncate ${differ ? 'font-medium text-cyan-300' : ''}`}>{valA}</div>
            <div className={`px-5 py-2.5 text-gray-200 truncate ${differ ? 'font-medium text-purple-300' : ''}`}>{valB}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main SprintHistory screen ─────────────────────────────────────────────────
export default function SprintHistory({ onLoadRun }) {
  const [runs, setRuns]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [selected, setSelected]   = useState(new Set());  // at most 2 IDs
  const [sortKey, setSortKey]     = useState('created_at');
  const [sortDir, setSortDir]     = useState('desc');
  const [filter, setFilter]       = useState('');         // free text search

  // Load runs
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getRuns()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data?.runs ?? []);
        setRuns(list.length > 0 ? list : DEMO_RUNS);
      })
      .catch(() => {
        if (!cancelled) {
          setRuns(DEMO_RUNS);
          setError('API unavailable — showing demo data');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Sort + filter
  const visible = [...runs]
    .filter((r) => {
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return (
        (r.concept || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q) ||
        (r.status || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleCheckbox = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 2) {
          // Replace the oldest selection
          const first = [...next][0];
          next.delete(first);
        }
        next.add(id);
      }
      return next;
    });
  };

  const handleRowClick = (run) => {
    if (typeof onLoadRun === 'function') {
      onLoadRun(run.id, run.concept);
    }
  };

  const selectedArr = [...selected];
  const compareRunA = runs.find((r) => r.id === selectedArr[0]);
  const compareRunB = runs.find((r) => r.id === selectedArr[1]);
  const canCompare  = selectedArr.length === 2 && compareRunA && compareRunB;

  const ColHeader = ({ colKey, label, align = 'left' }) => {
    const active = sortKey === colKey;
    const arrow  = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return (
      <th
        onClick={() => handleSort(colKey)}
        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap
          ${align === 'right' ? 'text-right' : 'text-left'}
          ${active ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-300'}
          transition-colors`}
      >
        {label}{arrow}
      </th>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          Sprint History
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          All past runs. Click a row to load it in the dashboard, or check two rows to compare.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-lg border border-yellow-700/50 bg-yellow-900/20 text-yellow-400 text-xs flex items-center gap-2">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
            ⌕
          </span>
          <input
            type="text"
            placeholder="Filter by concept, ID, or status…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-600 transition-colors"
          />
        </div>

        {/* Compare hint */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {selected.size === 0 && <span>Select 2 runs to compare</span>}
          {selected.size === 1 && <span className="text-yellow-400">Select 1 more to compare</span>}
          {selected.size === 2 && (
            <span className="text-cyan-400 font-medium">2 runs selected — comparison shown below</span>
          )}
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="px-2 py-1 rounded border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 backdrop-blur overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-gray-400 text-sm">Loading runs…</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-600">
            <span className="text-4xl mb-3">📋</span>
            <p className="text-sm">No runs found{filter ? ' matching your filter' : ''}.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                {/* Checkbox col */}
                <th className="pl-4 pr-2 py-3 text-left">
                  <span className="sr-only">Compare</span>
                </th>
                <ColHeader colKey="id"           label="Run ID" />
                <ColHeader colKey="concept"      label="Concept" />
                <ColHeader colKey="status"       label="Status" />
                <ColHeader colKey="created_at"   label="Started" />
                <ColHeader colKey="event_count"  label="Events"   align="right" />
                <ColHeader colKey="pivot_count"  label="Pivots"   align="right" />
                <ColHeader colKey="duration_s"   label="Duration" align="right" />
                <ColHeader colKey="api_cost_usd" label="Cost"     align="right" />
                <ColHeader colKey="agent_count"  label="Agents"   align="right" />
                {/* Action col */}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((run, idx) => {
                const isChecked  = selected.has(run.id);
                const isDisabled = selected.size >= 2 && !isChecked;
                const isA = selectedArr[0] === run.id;
                const isB = selectedArr[1] === run.id;

                return (
                  <tr
                    key={run.id}
                    className={`border-b border-gray-800/60 transition-colors
                      ${idx % 2 === 0 ? 'bg-gray-900/20' : 'bg-gray-900/40'}
                      ${isChecked ? 'bg-cyan-950/30 border-cyan-800/40' : 'hover:bg-gray-800/40'}
                      cursor-pointer group`}
                  >
                    {/* Checkbox */}
                    <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => handleCheckbox(run.id)}
                          className="w-3.5 h-3.5 accent-cyan-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={isDisabled ? 'Clear a selection first' : 'Select for comparison'}
                        />
                        {isA && <span className="text-cyan-400 text-xs font-bold">A</span>}
                        {isB && <span className="text-purple-400 text-xs font-bold">B</span>}
                      </div>
                    </td>

                    {/* Run ID */}
                    <td
                      className="px-4 py-3 font-mono text-xs text-gray-400 group-hover:text-gray-200 transition-colors whitespace-nowrap"
                      onClick={() => handleRowClick(run)}
                    >
                      {run.id}
                    </td>

                    {/* Concept */}
                    <td
                      className="px-4 py-3 text-gray-200 max-w-xs truncate"
                      title={run.concept}
                      onClick={() => handleRowClick(run)}
                    >
                      {run.concept || <span className="text-gray-600 italic">—</span>}
                    </td>

                    {/* Status */}
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      onClick={() => handleRowClick(run)}
                    >
                      <StatusBadge status={run.status} />
                    </td>

                    {/* Started */}
                    <td
                      className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs"
                      onClick={() => handleRowClick(run)}
                    >
                      {fmtDate(run.created_at)}
                    </td>

                    {/* Events */}
                    <td
                      className="px-4 py-3 text-right tabular-nums text-gray-300"
                      onClick={() => handleRowClick(run)}
                    >
                      {run.event_count ?? '—'}
                    </td>

                    {/* Pivots */}
                    <td
                      className="px-4 py-3 text-right tabular-nums text-yellow-400 font-medium"
                      onClick={() => handleRowClick(run)}
                    >
                      {run.pivot_count ?? '—'}
                    </td>

                    {/* Duration */}
                    <td
                      className="px-4 py-3 text-right tabular-nums text-gray-400 whitespace-nowrap"
                      onClick={() => handleRowClick(run)}
                    >
                      {fmtDuration(run.duration_s)}
                    </td>

                    {/* Cost */}
                    <td
                      className="px-4 py-3 text-right tabular-nums text-green-400 font-medium"
                      onClick={() => handleRowClick(run)}
                    >
                      {fmtCost(run.api_cost_usd)}
                    </td>

                    {/* Agents */}
                    <td
                      className="px-4 py-3 text-right tabular-nums text-gray-400"
                      onClick={() => handleRowClick(run)}
                    >
                      {fmtAgents(run.agent_count)}
                    </td>

                    {/* Action */}
                    <td
                      className="px-4 py-3 text-right"
                      onClick={() => handleRowClick(run)}
                    >
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400 text-xs font-medium whitespace-nowrap">
                        Load →
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Row count */}
      {!loading && visible.length > 0 && (
        <p className="mt-2 text-xs text-gray-600">
          {visible.length} run{visible.length !== 1 ? 's' : ''}
          {filter ? ` matching "${filter}"` : ''}
        </p>
      )}

      {/* Comparison panel */}
      {canCompare && (
        <ComparePanel
          runA={compareRunA}
          runB={compareRunB}
          onClose={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
