import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { getRunSimulation, loadStaticSimulation, loadStaticSimulationGeo, connectLive } from '../api';
import { lazy, Suspense } from 'react';

// Lazy-load Globe so Three.js only downloads when the globe panel is rendered.
const Globe = lazy(() => import('../components/Globe'));

function GlobeFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900/30 rounded-2xl">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-gray-800 animate-pulse" />
        <div className="h-3 bg-gray-800 rounded w-24 animate-pulse" />
      </div>
    </div>
  );
}

// ── Archetype configuration ────────────────────────────────────────
const ARCHETYPE_CONFIG = {
  vc:            { label: 'VC',            tw: 'text-purple-400',  twBg: 'bg-purple-500/20',  twBar: 'bg-purple-500',  hex: '#a855f7' },
  early_adopter: { label: 'Early Adopter', tw: 'text-emerald-400', twBg: 'bg-emerald-500/20', twBar: 'bg-emerald-500', hex: '#10b981' },
  skeptic:       { label: 'Skeptic',       tw: 'text-red-400',     twBg: 'bg-red-500/20',     twBar: 'bg-red-500',     hex: '#ef4444' },
  journalist:    { label: 'Journalist',    tw: 'text-blue-400',    twBg: 'bg-blue-500/20',    twBar: 'bg-blue-500',    hex: '#3b82f6' },
  competitor:    { label: 'Competitor',     tw: 'text-red-400',     twBg: 'bg-red-500/20',     twBar: 'bg-red-500',     hex: '#ef4444' },
  regulator:     { label: 'Regulator',     tw: 'text-orange-400',  twBg: 'bg-orange-500/20',  twBar: 'bg-orange-500',  hex: '#f97316' },
};

function getArchCfg(archetype) {
  return ARCHETYPE_CONFIG[archetype] || { label: archetype || 'Unknown', tw: 'text-gray-400', twBg: 'bg-gray-500/20', twBar: 'bg-gray-500', hex: '#6b7280' };
}

function stanceInfo(val) {
  if (typeof val === 'number') {
    if (val > 0.15) return { text: 'Positive', cls: 'text-emerald-400', dotCls: 'bg-emerald-400' };
    if (val < -0.15) return { text: 'Negative', cls: 'text-red-400', dotCls: 'bg-red-400' };
    return { text: 'Neutral', cls: 'text-yellow-400', dotCls: 'bg-yellow-400' };
  }
  if (val === 'positive' || val === 'supporter') return { text: 'Positive', cls: 'text-emerald-400', dotCls: 'bg-emerald-400' };
  if (val === 'negative' || val === 'opponent') return { text: 'Negative', cls: 'text-red-400', dotCls: 'bg-red-400' };
  return { text: 'Neutral', cls: 'text-yellow-400', dotCls: 'bg-yellow-400' };
}

function fmtSentiment(val) {
  if (typeof val !== 'number') return '+0.00';
  return (val >= 0 ? '+' : '') + val.toFixed(2);
}

function sentimentColor(val) {
  if (typeof val !== 'number') return '#6b7280';
  if (val > 0.3) return '#10b981';
  if (val > 0.1) return '#34d399';
  if (val > -0.1) return '#eab308';
  if (val > -0.3) return '#f87171';
  return '#ef4444';
}

// ── Demo data (rich multi-round fallback) ──────────────────────────
const DEMO_GEO = [
  { name: 'Marcus Chen',      archetype: 'vc',            lat: 37.77,  lng: -122.42, city: 'San Francisco', company: 'a16z',           stance: 'neutral', messages: [{ round: 1, content: 'Strong thesis on compliance infra. CAC concerns.', sentiment: 0.4 }] },
  { name: 'Rachel Goldstein', archetype: 'vc',            lat: 37.44,  lng: -122.14, city: 'Palo Alto',     company: 'Ribbit Capital',  stance: 'neutral', messages: [{ round: 1, content: 'Unit economics need work. Regulatory moat is interesting.', sentiment: 0.3 }] },
  { name: 'James Hartley',    archetype: 'vc',            lat: 40.71,  lng: -74.01,  city: 'New York',      company: 'Paradigm',        stance: 'positive',messages: [{ round: 1, content: 'Stablecoins are the killer app. This could work.', sentiment: 0.6 }] },
  { name: 'Sarah Mitchell',   archetype: 'early_adopter', lat: 37.77,  lng: -122.42, city: 'San Francisco', company: 'Stripe Treasury', stance: 'positive',messages: [{ round: 1, content: 'API-first approach is right. Need latency benchmarks.', sentiment: 0.5 }] },
  { name: 'Oliver Brooks',    archetype: 'skeptic',       lat: 38.91,  lng: -77.04,  city: 'Washington DC', company: 'Former CFPB',     stance: 'negative',messages: [{ round: 1, content: 'AI cannot replace human judgment in compliance.', sentiment: -0.6 }] },
  { name: 'Alex Rivera',      archetype: 'journalist',    lat: 40.71,  lng: -74.01,  city: 'New York',      company: 'TechCrunch',      stance: 'neutral', messages: [{ round: 1, content: 'Show me the moat. How is this different from Chainalysis?', sentiment: 0.0 }] },
  { name: 'Thomas Weber',     archetype: 'competitor',    lat: 42.36,  lng: -71.06,  city: 'Boston',        company: 'Circle (USDC)',   stance: 'negative',messages: [{ round: 1, content: 'We already have regulatory approval. Good luck.', sentiment: -0.7 }] },
  { name: 'Director Collins', archetype: 'regulator',     lat: 38.90,  lng: -77.27,  city: 'Vienna, VA',    company: 'FinCEN',          stance: 'negative',messages: [{ round: 1, content: 'MSB registration is mandatory per 31 CFR 1022.', sentiment: -0.5 }] },
  { name: 'Nina Sharma',      archetype: 'early_adopter', lat: 19.08,  lng: 72.88,   city: 'Mumbai',        company: 'Razorpay',        stance: 'neutral', messages: [{ round: 2, content: 'Cross-border compliance is the hardest problem.', sentiment: 0.3 }] },
  { name: 'Wei Zhang',        archetype: 'journalist',    lat: 1.35,   lng: 103.82,  city: 'Singapore',     company: 'The Block',       stance: 'neutral', messages: [{ round: 2, content: 'Stablecoin regulation is imminent globally.', sentiment: 0.2 }] },
  { name: 'Fatima Al-Hassan', archetype: 'competitor',    lat: 25.20,  lng: 55.27,   city: 'Dubai',         company: 'Chainalysis',     stance: 'negative',messages: [{ round: 2, content: 'We own the compliance data layer. Years of training data.', sentiment: -0.8 }] },
  { name: 'Carlos Mendoza',   archetype: 'early_adopter', lat: -23.55, lng: -46.63,  city: 'Sao Paulo',     company: 'Nubank',          stance: 'neutral', messages: [{ round: 2, content: 'LATAM compliance is fragmented. Need Portuguese support.', sentiment: 0.2 }] },
  { name: 'Amara Okafor',     archetype: 'early_adopter', lat: 6.52,   lng: 3.38,    city: 'Lagos',         company: 'Flutterwave',     stance: 'positive',messages: [{ round: 2, content: 'African compliance underserved. Mobile money integration.', sentiment: 0.5 }] },
  { name: 'Helen Frost',      archetype: 'skeptic',       lat: 51.51,  lng: -0.13,   city: 'London',        company: 'Deloitte Risk',   stance: 'negative',messages: [{ round: 2, content: 'Startups lack enterprise resilience. Bank-grade security.', sentiment: -0.5 }] },
  { name: 'Kenji Taniguchi',  archetype: 'skeptic',       lat: 35.68,  lng: 139.65,  city: 'Tokyo',         company: 'MUFG',            stance: 'negative',messages: [{ round: 3, content: 'Vendor risk assessment takes 18 months.', sentiment: -0.4 }] },
];

const DEMO_RESULTS = {
  total_llm_agents: 15,
  total_lightweight_agents: 1000000,
  total_agents: 1000015,
  rounds: 5,
  rounds_data: [
    { round_number: 1, avg_sentiment: 0.10, sentiment_by_archetype: { vc: 0.43, early_adopter: 0.50, skeptic: -0.60, journalist: 0.00, competitor: -0.70, regulator: -0.50 } },
    { round_number: 2, avg_sentiment: 0.05, sentiment_by_archetype: { vc: 0.43, early_adopter: 0.33, skeptic: -0.50, journalist: 0.20, competitor: -0.75, regulator: -0.50 } },
    { round_number: 3, avg_sentiment: 0.12, sentiment_by_archetype: { vc: 0.50, early_adopter: 0.40, skeptic: -0.40, journalist: 0.25, competitor: -0.60, regulator: -0.30 } },
    { round_number: 4, avg_sentiment: 0.18, sentiment_by_archetype: { vc: 0.55, early_adopter: 0.45, skeptic: -0.30, journalist: 0.30, competitor: -0.50, regulator: -0.20 } },
    { round_number: 5, avg_sentiment: 0.22, sentiment_by_archetype: { vc: 0.60, early_adopter: 0.50, skeptic: -0.20, journalist: 0.35, competitor: -0.40, regulator: -0.10 } },
  ],
  final_signal: { overall_sentiment: 0.22, confidence: 0.72, pivot_recommended: false, pivot_suggestion: '' },
};

// ── Post card with slide-in animation ─────────────────────────────
function PostCard({ persona, message, isNew, isActive, onClick }) {
  const sent = message?.sentiment ?? persona.stance ?? persona.sentiment ?? 0;
  const s = stanceInfo(sent);
  const arch = getArchCfg(persona.archetype);
  const content = message?.content || persona.post || persona.content || persona.message || '';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all duration-300 cursor-pointer ${
        isNew ? 'animate-slide-in' : ''
      } ${
        isActive
          ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/10'
          : 'bg-white/[0.02] border-gray-800/60 hover:bg-white/[0.04] hover:border-gray-700'
      }`}
      style={isNew ? { animation: 'slideIn 0.4s ease-out' } : undefined}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${s.dotCls} shrink-0`} />
        <span className="text-sm font-semibold text-gray-200 truncate">{persona.name || 'Anonymous'}</span>
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${arch.twBg} ${arch.tw} border border-current/20`}>
          {arch.label}
        </span>
        {message?.round && (
          <span className="text-[9px] text-gray-600 font-mono ml-auto shrink-0">R{message.round}</span>
        )}
      </div>
      {content && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{content}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        <span className={`text-[10px] font-mono ${s.cls}`}>{s.text}</span>
        {typeof sent === 'number' && (
          <span className="text-[10px] text-gray-600 font-mono">({fmtSentiment(sent)})</span>
        )}
        {persona.company && (
          <span className="text-[10px] text-gray-600 ml-auto truncate max-w-[100px]">{persona.company}</span>
        )}
      </div>
    </button>
  );
}

// ── Sentiment horizontal bar ──────────────────────────────────────
function SentimentBar({ label, value, maxValue = 1, barCls }) {
  const pct = Math.min(Math.abs(value) / maxValue * 100, 100);
  const isPositive = value >= 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-24 text-right truncate">{label}</span>
      <div className="flex-1 h-3 bg-gray-800/80 rounded-full overflow-hidden relative">
        {/* Center line for zero */}
        <div className="absolute left-1/2 top-0 w-px h-full bg-gray-700/60" />
        <div
          className={`absolute h-full rounded-full transition-all duration-700 ${barCls}`}
          style={{
            width: `${pct / 2}%`,
            left: isPositive ? '50%' : `${50 - pct / 2}%`,
            opacity: 0.85,
          }}
        />
      </div>
      <span className={`text-xs font-mono w-12 text-right ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {fmtSentiment(value)}
      </span>
    </div>
  );
}

// ── Sentiment gauge (circular arc visualization) ──────────────────
function SentimentGauge({ value }) {
  const clampedVal = Math.max(-1, Math.min(1, value || 0));
  const normalized = (clampedVal + 1) / 2; // 0 to 1
  const angle = -90 + normalized * 180; // -90 (far left) to +90 (far right)
  const color = sentimentColor(clampedVal);

  return (
    <div className="flex flex-col items-center py-3">
      <div className="relative w-32 h-16 overflow-hidden">
        {/* Background arc */}
        <svg viewBox="0 0 120 60" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="30%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="70%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          {/* Track */}
          <path
            d="M 10 55 A 50 50 0 0 1 110 55"
            fill="none"
            stroke="#1e293b"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Colored arc */}
          <path
            d="M 10 55 A 50 50 0 0 1 110 55"
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.4"
          />
          {/* Needle */}
          <line
            x1="60"
            y1="55"
            x2={60 + 40 * Math.cos((angle * Math.PI) / 180)}
            y2={55 - 40 * Math.sin((angle * Math.PI) / 180)}
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ transition: 'all 0.7s ease-out' }}
          />
          {/* Center dot */}
          <circle cx="60" cy="55" r="3" fill={color} />
        </svg>
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-2xl font-bold font-mono" style={{ color }}>
          {fmtSentiment(clampedVal)}
        </span>
        <span className="text-[10px] text-gray-600 uppercase tracking-wider">overall</span>
      </div>
    </div>
  );
}

// ── Recharts sentiment line chart ──────────────────────────────────
function SentimentLineChart({ roundsData, isAnimating }) {
  const chartData = useMemo(() => {
    if (!roundsData || roundsData.length === 0) return [];
    return roundsData.map((rd) => ({
      round: `R${rd.round_number}`,
      ...rd.sentiment_by_archetype,
      avg: rd.avg_sentiment,
    }));
  }, [roundsData]);

  const archetypes = useMemo(() => {
    const set = new Set();
    roundsData?.forEach((rd) => {
      Object.keys(rd.sentiment_by_archetype || {}).forEach((k) => set.add(k));
    });
    return Array.from(set);
  }, [roundsData]);

  if (chartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="round" stroke="#475569" tick={{ fontSize: 10 }} />
        <YAxis domain={[-1, 1]} stroke="#475569" tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            background: 'rgba(15,23,42,0.95)',
            border: '1px solid #334155',
            borderRadius: 8,
            fontSize: 11,
            color: '#e2e8f0',
          }}
          labelStyle={{ color: '#e2e8f0', fontWeight: 700 }}
          formatter={(val, name) => [
            typeof val === 'number' ? fmtSentiment(val) : val,
            name === 'avg' ? 'Average' : (getArchCfg(name).label || name),
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 9, paddingTop: 2 }}
          formatter={(val) => val === 'avg' ? 'Average' : (getArchCfg(val).label || val)}
        />
        {/* Average line - thicker, dashed */}
        <Line
          type="monotone"
          dataKey="avg"
          stroke="#e2e8f0"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          name="avg"
          isAnimationActive={isAnimating}
          animationDuration={800}
          animationEasing="ease-out"
        />
        {archetypes.map((arch) => (
          <Line
            key={arch}
            type="monotone"
            dataKey={arch}
            stroke={getArchCfg(arch).hex}
            strokeWidth={1.5}
            dot={{ r: 2 }}
            name={arch}
            isAnimationActive={isAnimating}
            animationDuration={800}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Persona Detail Panel ──────────────────────────────────────────
function PersonaDetailPanel({ persona, onClose }) {
  if (!persona) return null;

  const arch = getArchCfg(persona.archetype);
  const stanceVal = persona.stance ?? persona.sentiment ?? 0;
  const s = stanceInfo(stanceVal);
  const allMessages = persona.messages || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-gray-950/97 border border-indigo-500/30 rounded-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden">
          {/* Header */}
          <div
            className="px-5 py-4 border-b border-gray-800/60 flex items-start gap-3"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.05))' }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-base"
              style={{ background: `${arch.hex}20`, border: `1.5px solid ${arch.hex}50`, color: arch.hex }}
            >
              {(persona.name || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-sm truncate">{persona.name || 'Unknown'}</div>
              {persona.company && (
                <div className="text-[11px] text-gray-500 font-mono truncate">{persona.company}</div>
              )}
              {persona.city && (
                <div className="text-[10px] text-gray-600 font-mono truncate">{persona.city}</div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${arch.twBg} ${arch.tw} border border-current/20`}>
                {arch.label}
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${s.dotCls}`} />
                <span className={`text-[11px] font-mono font-semibold ${s.cls}`}>{s.text}</span>
                {typeof stanceVal === 'number' && (
                  <span className="text-[10px] text-gray-600 font-mono">({fmtSentiment(stanceVal)})</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 max-h-[55vh] overflow-y-auto space-y-4">
            {/* Location */}
            {(persona.city || (persona.lat != null && persona.lng != null)) && (
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className="text-xs text-gray-500 font-mono">
                  {persona.city ? persona.city : `${persona.lat?.toFixed(2)}°, ${persona.lng?.toFixed(2)}°`}
                </span>
              </div>
            )}

            {/* Messages / Post history */}
            {allMessages.length > 0 ? (
              <div>
                <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Post History</div>
                <div className="space-y-2">
                  {allMessages.map((msg, idx) => {
                    const msgSent = msg.sentiment ?? 0;
                    const mInfo = stanceInfo(msgSent);
                    return (
                      <div key={idx} className="p-3 rounded-xl bg-gray-900/60 border border-gray-800/50">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${mInfo.dotCls}`} />
                          <span className="text-[10px] text-gray-600 font-mono">Round {msg.round || idx + 1}</span>
                          <span className={`text-[10px] font-mono ml-auto ${mInfo.cls}`}>{fmtSentiment(msgSent)}</span>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed">{msg.content || msg.post || ''}</p>
                        {msg.references && msg.references.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {msg.references.map((ref) => (
                              <span key={ref} className="text-[9px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-full font-mono">
                                @{ref}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (persona.post || persona.message) ? (
              <div>
                <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Latest Post</div>
                <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800/50">
                  <p className="text-xs text-gray-300 leading-relaxed">{persona.post || persona.message}</p>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-600 font-mono text-center py-2">No posts yet</div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-800/40 flex justify-end">
            <button
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-300 font-mono transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-800/50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sentiment Heatmap ─────────────────────────────────────────────
const HEATMAP_ARCHETYPES = [
  'vc', 'journalist', 'early_adopter', 'competitor', 'user', 'regulator', 'influencer', 'enterprise_buyer',
];

function heatmapColor(val) {
  if (typeof val !== 'number') return '#6b7280';
  // Interpolate: -1 -> red, 0 -> gray, +1 -> green
  const clamped = Math.max(-1, Math.min(1, val));
  if (clamped >= 0) {
    // gray(107,114,128) -> green(34,197,94)
    const t = clamped;
    const r = Math.round(107 + (34 - 107) * t);
    const g = Math.round(114 + (197 - 114) * t);
    const b = Math.round(128 + (94 - 128) * t);
    return `rgb(${r},${g},${b})`;
  } else {
    // red(239,68,68) -> gray(107,114,128)
    const t = clamped + 1; // 0 at -1, 1 at 0
    const r = Math.round(239 + (107 - 239) * t);
    const g = Math.round(68 + (114 - 68) * t);
    const b = Math.round(68 + (128 - 68) * t);
    return `rgb(${r},${g},${b})`;
  }
}

function SentimentHeatmap({ roundsData, effectiveRound }) {
  const [tooltip, setTooltip] = useState(null);

  if (!roundsData || roundsData.length === 0) {
    return (
      <div className="pb-3 border-b border-gray-800/40">
        <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2 mt-2">
          Archetype Sentiment Heatmap
        </div>
        <div className="flex items-center justify-center py-4">
          <p className="text-[10px] text-gray-600 font-mono">Run a simulation to see heatmap</p>
        </div>
      </div>
    );
  }

  // Collect all archetypes present in data, supplemented by HEATMAP_ARCHETYPES
  const presentArchetypes = new Set();
  roundsData.forEach((rd) => {
    Object.keys(rd.sentiment_by_archetype || {}).forEach((k) => presentArchetypes.add(k));
  });
  // Show archetypes from HEATMAP_ARCHETYPES that are present, then any extras
  const rows = [
    ...HEATMAP_ARCHETYPES.filter((a) => presentArchetypes.has(a)),
    ...[...presentArchetypes].filter((a) => !HEATMAP_ARCHETYPES.includes(a)),
  ];

  const rounds = roundsData.map((rd) => rd.round_number);

  return (
    <div className="pb-3 border-b border-gray-800/40">
      <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2 mt-2">
        Archetype Sentiment Heatmap
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: `${rows.length * 0}px` }}>
          <thead>
            <tr>
              {/* Row-label column */}
              <th className="w-20 shrink-0" />
              {rounds.map((r) => (
                <th
                  key={r}
                  className="text-center pb-1"
                  style={{ width: 28 }}
                >
                  <span className="text-[8px] text-gray-600 font-mono">R{r}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((arch) => {
              const cfg = getArchCfg(arch);
              return (
                <tr key={arch}>
                  <td className="pr-1.5 py-0.5">
                    <span className="text-[9px] text-gray-500 font-mono truncate block text-right" style={{ maxWidth: 72 }}>
                      {cfg.label}
                    </span>
                  </td>
                  {roundsData.map((rd) => {
                    const val = rd.sentiment_by_archetype?.[arch];
                    const isFuture = rd.round_number > effectiveRound;
                    const color = heatmapColor(val);
                    const displayVal = typeof val === 'number' ? fmtSentiment(val) : 'N/A';
                    return (
                      <td
                        key={rd.round_number}
                        className="py-0.5 px-0.5 relative"
                        style={{ opacity: isFuture ? 0.4 : 1 }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({
                            arch: cfg.label,
                            round: rd.round_number,
                            val: displayVal,
                            x: rect.left + rect.width / 2,
                            y: rect.top - 6,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <div
                          className="rounded-sm cursor-default"
                          style={{
                            width: 20,
                            height: 14,
                            background: typeof val === 'number' ? color : '#374151',
                            margin: '0 auto',
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Tooltip rendered in a fixed overlay */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-2 py-1.5 rounded-lg bg-gray-950/95 border border-gray-700/60 shadow-xl"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
        >
          <span className="text-[10px] font-mono text-gray-300">
            {tooltip.arch} · R{tooltip.round} · <span className="text-white font-bold">{tooltip.val}</span>
          </span>
        </div>
      )}
      {/* Color scale legend */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[8px] text-red-400 font-mono">-1</span>
        <div
          className="flex-1 h-2 rounded-full"
          style={{ background: 'linear-gradient(to right, #ef4444, #6b7280, #22c55e)' }}
        />
        <span className="text-[8px] text-emerald-400 font-mono">+1</span>
      </div>
    </div>
  );
}

// ── Main MarketArena component ─────────────────────────────────────
export default function MarketArena({ runId }) {
  const [geoData, setGeoData] = useState([]);
  const [resultsData, setResultsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePersona, setActivePersona] = useState(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [newPostIds, setNewPostIds] = useState(new Set());
  // Track whether chart should animate (true briefly after each round update)
  const [chartAnimating, setChartAnimating] = useState(false);
  // WebSocket connection status for live indicator
  const [wsStatus, setWsStatus] = useState('disconnected'); // 'connected' | 'connecting' | 'disconnected'
  // Selected persona for detail panel (clicked on globe or feed)
  const [selectedPersonaData, setSelectedPersonaData] = useState(null);
  // Replay: null = live/latest, number = pinned to that round index (0-based)
  const [replayRound, setReplayRound] = useState(null);
  const feedRef = useRef(null);
  const feedEndRef = useRef(null);
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const prevFeedCountRef = useRef(0);
  const intentionalCloseRef = useRef(null);

  // ── WebSocket real-time connection ──
  useEffect(() => {
    if (!runId) return;

    let wsConnected = false;
    setWsStatus('connecting');

    // Attempt WebSocket connection
    try {
      const ws = connectLive(runId, {
        onOpen: () => {
          wsConnected = true;
          setWsStatus('connected');
        },
        onEvent: (event) => {
          const eventType = String(event.event_type || event.type || '').toLowerCase();
          const payload = event.payload || event.data || event;

          if (eventType === 'simulation_start') {
            setLoading(false);
          }

          if (eventType === 'simulation_round') {
            handleSimulationUpdate(payload);
            // Trigger chart animation for this round
            setChartAnimating(true);
            setTimeout(() => setChartAnimating(false), 1200);
          }

          // Also handle individual persona posts streamed via WS
          if (eventType === 'persona_post') {
            handleNewPost(payload);
          }

          if (eventType === 'simulation_complete' && payload?.final_signal) {
            setResultsData((prev) => ({
              ...(prev || {}),
              final_signal: payload.final_signal,
            }));
          }
        },
        onClose: () => {
          if (intentionalCloseRef.current === ws) {
            intentionalCloseRef.current = null;
            return;
          }
          wsConnected = false;
          setWsStatus('disconnected');
        },
        onError: () => {
          wsConnected = false;
          // status will be updated by onReconnecting or onMaxRetriesExceeded
        },
        onReconnecting: (attempt, delayMs) => {
          wsConnected = false;
          setWsStatus(`reconnecting (attempt ${attempt}/5)`);
          console.info(`[MarketArena] WS reconnecting: attempt ${attempt}/5 in ${delayMs}ms`);
        },
        onMaxRetriesExceeded: () => {
          wsConnected = false;
          setWsStatus('polling');
          console.warn('[MarketArena] WS max retries exceeded — switched to polling fallback');
        },
      });

      wsRef.current = ws;
      wsConnected = true;
    } catch {
      // WS not available; connectLive will handle polling fallback internally
      setWsStatus('disconnected');
    }

    function startPolling() {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        try {
          const data = await getRunSimulation(runId);
          if (data) {
            const results = data?.results || data || {};
            const geo = data?.geo || [];
            setResultsData(results);
            if (Array.isArray(geo) && geo.length > 0) setGeoData(geo);
          }
        } catch {
          // Polling failed silently; will retry next interval
        }
      }, 3000);
    }

    return () => {
      if (wsRef.current) {
        intentionalCloseRef.current = wsRef.current;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [runId]);

  // Handle a simulation round update from WS or polling
  const handleSimulationUpdate = useCallback((payload) => {
    setLoading(false);
    if (payload.round_number || payload.round) {
      setCurrentRound(payload.round_number || payload.round);
    }
    if (payload.personas && Array.isArray(payload.personas)) {
      setGeoData((prev) => {
        const nameMap = new Map(prev.map((p) => [p.name, p]));
        payload.personas.forEach((p) => {
          if (p.name) {
            const existing = nameMap.get(p.name);
            if (existing) {
              // Merge new messages into existing persona
              const merged = { ...existing, ...p };
              if (p.messages) {
                merged.messages = [...(existing.messages || []), ...p.messages];
              }
              nameMap.set(p.name, merged);
            } else {
              nameMap.set(p.name, p);
            }
          }
        });
        return Array.from(nameMap.values());
      });
      // Mark new posts for animation
      const ids = new Set(payload.personas.map((p) => `${p.name}-${payload.round_number || payload.round}`));
      setNewPostIds(ids);
      setTimeout(() => setNewPostIds(new Set()), 800);
    }
    if (payload.sentiment_by_archetype || payload.avg_sentiment != null) {
      setResultsData((prev) => {
        const prevResults = prev || {};
        const roundEntry = {
          round_number: payload.round_number || payload.round,
          avg_sentiment: payload.avg_sentiment,
          sentiment_by_archetype: payload.sentiment_by_archetype || {},
        };
        const existingRounds = [...(prevResults.rounds_data || [])];
        const idx = existingRounds.findIndex((r) => r.round_number === roundEntry.round_number);
        if (idx >= 0) {
          existingRounds[idx] = roundEntry;
        } else {
          existingRounds.push(roundEntry);
        }
        existingRounds.sort((a, b) => a.round_number - b.round_number);
        return {
          ...prevResults,
          rounds_data: existingRounds,
          rounds: Math.max(prevResults.rounds || 0, roundEntry.round_number),
        };
      });
    }
  }, []);

  // Handle individual new post from WS
  const handleNewPost = useCallback((payload) => {
    if (!payload.name) return;
    setLoading(false);
    setCurrentRound((prev) => Math.max(prev, payload.round || 1));
    setGeoData((prev) => {
      const updated = [...prev];
      const idx = updated.findIndex((p) => p.name === payload.name);
      const newMsg = {
        round: payload.round || 1,
        content: payload.content || payload.post,
        post: payload.content || payload.post,
        sentiment: payload.sentiment || 0,
        references: payload.references || [],
        stance_change: payload.stance_change || 'none',
      };
      if (idx >= 0) {
        const existing = updated[idx];
        const existingMessages = existing.messages || [];
        const dedupedMessages = existingMessages.some((msg) =>
          msg.round === newMsg.round && msg.content === newMsg.content,
        )
          ? existingMessages
          : [...existingMessages, newMsg];
        updated[idx] = {
          ...existing,
          ...payload,
          stance: payload.stance ?? existing.stance,
          sentiment: payload.sentiment ?? existing.sentiment,
          references: payload.references || existing.references || [],
          post: payload.content || payload.post || existing.post,
          messages: dedupedMessages,
        };
      } else {
        updated.push({
          ...payload,
          post: payload.content || payload.post,
          messages: [newMsg],
        });
      }
      return updated;
    });
    setNewPostIds((prev) => new Set([...prev, `${payload.name}-${payload.round || 1}`]));
    setTimeout(() => {
      setNewPostIds((prev) => {
        const next = new Set(prev);
        next.delete(`${payload.name}-${payload.round || 1}`);
        return next;
      });
    }, 800);
  }, []);

  // ── Initial data fetch ──
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    async function fetchData() {
      try {
        let data;
        try {
          data = await getRunSimulation(runId);
        } catch {
          const [sim, geo] = await Promise.all([
            loadStaticSimulation().catch(() => null),
            loadStaticSimulationGeo().catch(() => null),
          ]);
          data = { results: sim, geo: geo };
        }

        if (cancelled) return;

        const results = data?.results || data || {};
        const geo = data?.geo || [];

        setResultsData(results);
        setGeoData(Array.isArray(geo) ? geo : []);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.warn('MarketArena: waiting for simulation data:', err.message);
          setResultsData({});
          setGeoData([]);
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [runId]);

  const hasRealResults = Boolean(
    resultsData && (
      (Array.isArray(resultsData.rounds_data) && resultsData.rounds_data.length > 0)
      || resultsData.final_signal
      || resultsData.total_agents
      || resultsData.total_llm_agents
      || resultsData.rounds
    ),
  );
  const shouldUseDemoFallback = !runId && !hasRealResults && geoData.length === 0;

  const results = hasRealResults
    ? resultsData
    : (shouldUseDemoFallback ? DEMO_RESULTS : (resultsData || {}));
  const personas = geoData.length > 0
    ? geoData
    : (shouldUseDemoFallback ? DEMO_GEO : []);

  // ── Replay speed state (0=paused, 0.5, 1, 2, 5) ──
  const [replaySpeed, setReplaySpeed] = useState(1);

  // ── Animated round progression (only in demo/static mode) ──
  const totalRounds = results.rounds || results.rounds_data?.length || (shouldUseDemoFallback ? 5 : 0);

  useEffect(() => {
    if (loading) return;
    // Pause auto-advance while the user is replaying a specific round
    if (replayRound !== null) return;
    // Pause if speed is 0
    if (replaySpeed === 0) return;
    // Only auto-advance if no WS is providing updates
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (currentRound >= totalRounds) return;
    const intervalMs = 2000 / replaySpeed;
    const timer = setTimeout(() => setCurrentRound((r) => r + 1), intervalMs);
    return () => clearTimeout(timer);
  }, [currentRound, loading, totalRounds, replayRound, replaySpeed]);

  // ── Replay / effective round ──
  // When replayRound is null we show live data (currentRound).
  // When set, we show the chosen round (1-based to match round_number).
  const effectiveRound = replayRound !== null ? replayRound : currentRound;

  // ── Derived data ──
  const llmAgents = results.total_llm_agents || personas.length;
  const lightweightAgents = results.total_lightweight_agents || 0;
  const totalAgents = results.total_agents || llmAgents + lightweightAgents;

  const overallSentiment = useMemo(() => {
    if (results.final_signal?.overall_sentiment != null) return results.final_signal.overall_sentiment;
    const rd = results.rounds_data;
    if (rd && rd.length > 0) return rd[rd.length - 1].avg_sentiment;
    if (personas.length > 0) {
      return personas.reduce((sum, p) => {
        const val = typeof (p.stance ?? p.sentiment) === 'number' ? (p.stance ?? p.sentiment) : 0;
        return sum + val;
      }, 0) / personas.length;
    }
    return 0;
  }, [results, personas]);

  // Feed items: all messages up to effectiveRound, newest first
  const feedItems = useMemo(() => {
    const items = [];
    personas.forEach((p) => {
      const msgs = p.messages || [];
      if (msgs.length > 0) {
        msgs.forEach((m) => {
          if (m.round <= effectiveRound) {
            items.push({ persona: p, message: m, id: `${p.name}-${m.round}` });
          }
        });
      } else if (p.content && (p.round || 1) <= effectiveRound) {
        items.push({
          persona: p,
          message: { round: p.round || 1, content: p.content, sentiment: typeof p.stance === 'number' ? p.stance : 0 },
          id: `${p.name}-${p.round || 1}`,
        });
      } else if ((p.post || p.message) && effectiveRound > 0) {
        items.push({
          persona: p,
          message: { round: 1, content: p.post || p.message, sentiment: typeof (p.stance ?? p.sentiment) === 'number' ? (p.stance ?? p.sentiment) : 0 },
          id: `${p.name}-1`,
        });
      }
    });
    // Sort oldest-first so newest posts appear at the bottom (auto-scroll target)
    items.sort((a, b) => (a.message.round || 0) - (b.message.round || 0));
    return items;
  }, [personas, effectiveRound]);

  // Auto-scroll feed to bottom when new items arrive (newest posts at bottom)
  useEffect(() => {
    if (feedItems.length > prevFeedCountRef.current && feedEndRef.current) {
      feedEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    prevFeedCountRef.current = feedItems.length;
  }, [feedItems.length]);

  // Archetype breakdown for effective round
  const archetypeBreakdown = useMemo(() => {
    const rd = results.rounds_data;
    if (rd && rd.length > 0) {
      const idx = Math.min(effectiveRound, rd.length) - 1;
      if (idx >= 0) return rd[idx].sentiment_by_archetype || {};
    }
    const map = {};
    personas.forEach((p) => {
      const arch = p.archetype || 'unknown';
      if (!map[arch]) map[arch] = { total: 0, count: 0 };
      const val = typeof (p.stance ?? p.sentiment) === 'number' ? (p.stance ?? p.sentiment) : 0;
      map[arch].total += val;
      map[arch].count += 1;
    });
    const out = {};
    Object.entries(map).forEach(([arch, d]) => {
      out[arch] = d.count > 0 ? d.total / d.count : 0;
    });
    return out;
  }, [results, personas, effectiveRound]);

  const archetypeEntries = useMemo(() => {
    return Object.entries(archetypeBreakdown)
      .map(([arch, val]) => ({ archetype: arch, avg: val }))
      .sort((a, b) => b.avg - a.avg);
  }, [archetypeBreakdown]);

  // Visible rounds data (up to effectiveRound; fade future rounds in replay mode)
  const visibleRoundsData = useMemo(() => {
    if (!results.rounds_data) return [];
    return results.rounds_data.map((rd) => ({
      ...rd,
      _faded: replayRound !== null && rd.round_number > effectiveRound,
    })).filter((rd) => replayRound === null || rd.round_number <= effectiveRound);
  }, [results.rounds_data, effectiveRound, replayRound]);

  // Globe arcs for persona references
  const arcs = useMemo(() => {
    const result = [];
    const geoMap = {};
    personas.forEach((p) => {
      if (p.name && p.lat != null && p.lng != null) geoMap[p.name] = [p.lat, p.lng];
    });

    personas.forEach((p) => {
      const visibleMessages = (p.messages || []).filter((message) => (message.round || 1) <= effectiveRound);
      visibleMessages.forEach((message) => {
        (message.references || []).forEach((refName) => {
          const fromPos = geoMap[p.name];
          const toPos = geoMap[refName];
          if (fromPos && toPos) {
            result.push({
              id: `${p.name}-${refName}-${message.round}`,
              from: fromPos,
              to: toPos,
              color: getArchCfg(p.archetype).hex,
              active: activePersona ? (p.name === activePersona || refName === activePersona) : message.round === effectiveRound,
              round: message.round || 1,
            });
          }
        });
      });
    });
    return result;
  }, [personas, effectiveRound, activePersona]);

  const handleFeedClick = useCallback((name) => {
    setActivePersona((prev) => (prev === name ? null : name));
    // Also open detail panel for the clicked persona
    const p = personas.find((x) => x.name === name);
    if (p) setSelectedPersonaData(p);
  }, [personas]);

  const handleGlobePersonaClick = useCallback((persona) => {
    setSelectedPersonaData((prev) => (prev && prev.name === persona.name ? null : persona));
    setActivePersona(persona.name);
  }, []);

  const handleCloseDetailPanel = useCallback(() => {
    setSelectedPersonaData(null);
  }, []);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-900/80 to-indigo-900/80 border border-cyan-700/30 flex items-center justify-center">
              <svg className="w-10 h-10 text-cyan-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            </div>
            <div className="absolute inset-0 rounded-full bg-cyan-500/10 animate-ping" />
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-400 font-mono">Initializing Market Simulation</p>
            <p className="text-[10px] text-gray-600 font-mono mt-1">Connecting to simulation engine...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
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

  const displayRound = Math.min(effectiveRound, totalRounds);
  const progressPct = totalRounds > 0 ? (displayRound / totalRounds) * 100 : 0;

  // Replay toolbar — only shown when multiple rounds are available
  const showReplayToolbar = (results.rounds_data?.length ?? 0) > 1;
  const replaySliderMax = totalRounds > 0 ? totalRounds : (results.rounds_data?.length ?? 1);

  function ReplayToolbar() {
    if (!showReplayToolbar) return null;
    const sliderValue = replayRound !== null ? replayRound : currentRound;
    const isLive = replayRound === null;
    return (
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-gray-900/60 border border-gray-800/60 rounded-xl backdrop-blur-sm">
        {/* Reset to live */}
        <button
          onClick={() => setReplayRound(null)}
          title="Reset to live"
          className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors text-xs font-bold ${
            isLive
              ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
              : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
        >
          &#x23EE;
        </button>

        {/* Prev round */}
        <button
          onClick={() => {
            const cur = replayRound !== null ? replayRound : currentRound;
            const next = Math.max(1, cur - 1);
            setReplayRound(next);
          }}
          title="Previous round"
          disabled={displayRound <= 1}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-700 bg-gray-800/60 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold"
        >
          &#x25C4;
        </button>

        {/* Range slider */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input
            type="range"
            min={1}
            max={replaySliderMax}
            value={sliderValue > 0 ? sliderValue : 1}
            onChange={(e) => {
              const val = Number(e.target.value);
              const latest = results.rounds_data?.length ?? currentRound;
              if (val >= latest) {
                setReplayRound(null);
              } else {
                setReplayRound(val);
              }
            }}
            className="flex-1 h-1.5 rounded-full cursor-pointer accent-indigo-500"
            style={{ minWidth: 0 }}
          />
        </div>

        {/* Next round */}
        <button
          onClick={() => {
            const cur = replayRound !== null ? replayRound : currentRound;
            const latest = results.rounds_data?.length ?? currentRound;
            const next = Math.min(latest, cur + 1);
            if (next >= latest) {
              setReplayRound(null);
            } else {
              setReplayRound(next);
            }
          }}
          title="Next round"
          disabled={isLive}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-700 bg-gray-800/60 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold"
        >
          &#x25BA;
        </button>

        {/* Round label */}
        <span className="text-xs font-mono shrink-0 w-20 text-right">
          {isLive ? (
            <span className="text-emerald-400 font-bold tracking-wide">LIVE</span>
          ) : (
            <span className="text-gray-300">
              Round <span className="text-white font-bold">{displayRound}</span>
              <span className="text-gray-600"> / {replaySliderMax}</span>
            </span>
          )}
        </span>

        {/* Speed buttons */}
        <div className="flex items-center gap-1 ml-1 shrink-0">
          {replaySpeed === 0 && (
            <span className="text-[9px] font-bold font-mono text-yellow-400 uppercase tracking-wider mr-1">PAUSED</span>
          )}
          {[
            { label: '⏸', value: 0, title: 'Pause' },
            { label: '0.5×', value: 0.5, title: '0.5× speed' },
            { label: '1×', value: 1, title: '1× speed' },
            { label: '2×', value: 2, title: '2× speed' },
            { label: '5×', value: 5, title: '5× speed' },
          ].map(({ label, value, title }) => (
            <button
              key={value}
              onClick={() => setReplaySpeed(value)}
              title={title}
              className={`h-6 px-1.5 flex items-center justify-center rounded-md border transition-colors text-[10px] font-bold font-mono ${
                replaySpeed === value
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:h-[calc(100vh-4rem)] w-full px-2 py-2 gap-2">
      {/* Slide-in animation keyframes */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 8px rgba(99,102,241,0.2); }
          50%      { box-shadow: 0 0 20px rgba(99,102,241,0.5); }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-900/70 border border-gray-800/60 rounded-xl backdrop-blur-sm">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm sm:text-lg font-bold bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Market Stress Test
            </h2>
          </div>
          <span className="hidden sm:inline text-gray-700">|</span>
          <span className="text-xs sm:text-sm text-gray-300 font-mono">
            R<span className="text-white font-bold">{displayRound}</span>
            <span className="text-gray-600">/{totalRounds}</span>
          </span>
          <span className="hidden sm:inline text-gray-700">|</span>
          <span className="hidden sm:inline text-sm text-gray-300 font-mono">
            <span className="text-cyan-400 font-bold">{llmAgents}</span>
            <span className="text-gray-500"> LLM</span>
            {lightweightAgents > 0 && (
              <>
                <span className="text-gray-600"> + </span>
                <span className="text-purple-400 font-bold">{lightweightAgents.toLocaleString()}</span>
                <span className="text-gray-500"> Crowd</span>
              </>
            )}
          </span>
          <span className="hidden sm:inline text-gray-700">|</span>
          <span className="text-xs sm:text-sm font-mono">
            <span className="text-gray-500">Sent </span>
            <span className="font-bold" style={{ color: sentimentColor(overallSentiment) }}>
              {fmtSentiment(overallSentiment)}
            </span>
          </span>
        </div>
        {/* WS status + progress bar */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* WebSocket live indicator */}
          {runId && (
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-500 animate-pulse'
                    : wsStatus === 'connecting' || wsStatus.startsWith('reconnecting')
                    ? 'bg-yellow-500 animate-pulse'
                    : wsStatus === 'polling'
                    ? 'bg-yellow-400'
                    : 'bg-gray-600'
                }`}
              />
              <span className={`hidden sm:inline text-[10px] font-mono ${
                wsStatus === 'connected' ? 'text-emerald-400' :
                wsStatus === 'connecting' || wsStatus.startsWith('reconnecting') ? 'text-yellow-400' :
                wsStatus === 'polling' ? 'text-yellow-400' : 'text-gray-600'
              }`}>
                {wsStatus === 'connected'
                  ? 'LIVE'
                  : wsStatus === 'polling'
                  ? 'POLLING'
                  : wsStatus.startsWith('reconnecting')
                  ? wsStatus.toUpperCase()
                  : wsStatus === 'connecting'
                  ? 'CONNECTING'
                  : 'OFFLINE'}
              </span>
              {wsStatus === 'polling' && (
                <span className="hidden sm:inline text-[9px] font-mono text-yellow-600 ml-0.5" title="WebSocket unavailable — polling for updates every 3s">
                  ⚠
                </span>
              )}
            </div>
          )}
          <span className="text-[10px] text-gray-600 font-mono">{Math.round(progressPct)}%</span>
          <div className="w-20 sm:w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Replay toolbar ── */}
      <ReplayToolbar />

      {/* ── Layout: vertical stack on mobile, three columns on lg+ ── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 lg:min-h-0">

        {/* LEFT: Post feed — full width + fixed height on mobile, 30% flex on lg */}
        <div className="w-full lg:w-[30%] lg:min-w-[220px] bg-gray-900/50 border border-gray-800 rounded-2xl flex flex-col arena-panel-height"
          style={{ height: '280px' }}>
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-gray-800/60 flex items-center gap-2 shrink-0">
            <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-sm font-semibold text-gray-300">Post Feed</span>
            <span className="text-[10px] text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded-full font-mono ml-auto">
              {feedItems.length} posts
            </span>
          </div>
          <div ref={feedRef} className="flex-1 overflow-y-auto p-2.5 space-y-1.5 min-h-0 scroll-smooth">
            {feedItems.length === 0 && currentRound === 0 ? (
              <div className="flex items-center justify-center h-full py-8">
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-indigo-500/10 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-indigo-500/50 animate-pulse" />
                  </div>
                  <p className="text-sm text-gray-600 font-mono">Awaiting first round...</p>
                </div>
              </div>
            ) : feedItems.length === 0 ? (
              <div className="flex items-center justify-center h-full py-8">
                <p className="text-sm text-gray-600 font-mono">No posts yet...</p>
              </div>
            ) : (
              feedItems.map((item) => (
                <PostCard
                  key={item.id}
                  persona={item.persona}
                  message={item.message}
                  isNew={newPostIds.has(item.id)}
                  isActive={activePersona === item.persona.name}
                  onClick={() => handleFeedClick(item.persona.name)}
                />
              ))
            )}
            {/* Sentinel element — auto-scroll target for new posts */}
            <div ref={feedEndRef} />
          </div>
        </div>

        {/* CENTER: Globe — 250px tall on mobile, flex-1 on lg */}
        <div className="w-full lg:w-[40%] lg:min-w-[280px] bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden relative arena-globe-height"
          style={{ height: '250px' }}>
          <div className="w-full h-full">
            <Suspense fallback={<GlobeFallback />}>
              <Globe
                personas={personas}
                activePersona={activePersona}
                arcs={arcs}
                selectedPersona={selectedPersonaData?.name ?? null}
                onPersonaClick={handleGlobePersonaClick}
              />
            </Suspense>
          </div>
          {/* Globe legend overlay */}
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5 px-2 py-1 bg-gray-950/80 backdrop-blur-sm rounded-lg border border-gray-800/50">
            {Object.entries(ARCHETYPE_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: cfg.hex }} />
                <span className="text-[9px] text-gray-500 hidden sm:inline">{cfg.label}</span>
              </div>
            ))}
          </div>
          {/* Globe top-right agent counter */}
          <div className="absolute top-2 right-2 px-2 py-1 bg-gray-950/80 backdrop-blur-sm rounded-lg border border-gray-800/50">
            <span className="text-[10px] text-gray-500 font-mono">
              {totalAgents.toLocaleString()} agents
            </span>
          </div>
        </div>

        {/* RIGHT: Sentiment Dashboard — full width on mobile, 30% on lg */}
        <div className="w-full lg:w-[30%] lg:min-w-[220px] bg-gray-900/50 border border-gray-800 rounded-2xl flex flex-col lg:min-h-0">
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-gray-800/60 flex items-center gap-2 shrink-0">
            <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span className="text-sm font-semibold text-gray-300">Sentiment Dashboard</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 lg:min-h-0">

            {/* Sentiment gauge */}
            <SentimentGauge value={overallSentiment} />

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2 pb-3 border-b border-gray-800/40">
              <div className="bg-gray-800/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-white font-mono">{displayRound}<span className="text-gray-600 text-sm">/{totalRounds}</span></div>
                <div className="text-[9px] text-gray-600 uppercase tracking-wider">Round</div>
              </div>
              <div className="bg-gray-800/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-cyan-400 font-mono">
                  {totalAgents >= 1000 ? `${(totalAgents / 1000).toFixed(totalAgents >= 1000000 ? 0 : 0)}${totalAgents >= 1000000 ? 'M' : 'K'}` : totalAgents}
                </div>
                <div className="text-[9px] text-gray-600 uppercase tracking-wider">Agents</div>
              </div>
            </div>

            {/* Archetype breakdown bars */}
            <div className="pb-3 border-b border-gray-800/40">
              <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2 mt-1">Sentiment by Archetype</div>
              <div className="space-y-2">
                {archetypeEntries.map(({ archetype, avg }) => {
                  const cfg = getArchCfg(archetype);
                  return (
                    <SentimentBar
                      key={archetype}
                      label={cfg.label}
                      value={avg}
                      maxValue={1}
                      barCls={cfg.twBar}
                    />
                  );
                })}
              </div>
            </div>

            {/* Sentiment over rounds chart */}
            {visibleRoundsData.length > 0 && (
              <div className="pb-3 border-b border-gray-800/40">
                <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2 mt-2">Sentiment Over Time</div>
                <div className="h-[180px]">
                  <SentimentLineChart roundsData={visibleRoundsData} isAnimating={chartAnimating} />
                </div>
              </div>
            )}

            {/* Archetype Sentiment Heatmap */}
            <SentimentHeatmap
              roundsData={results.rounds_data || []}
              effectiveRound={effectiveRound}
            />

            {/* Signal summary */}
            {results.final_signal && displayRound >= totalRounds && (
              <div className="pt-2">
                <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Final Signal</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Overall Sentiment</span>
                    <span className="font-mono font-bold" style={{ color: sentimentColor(overallSentiment) }}>
                      {fmtSentiment(overallSentiment)}
                    </span>
                  </div>
                  {results.final_signal.confidence != null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Confidence</span>
                      <span className="text-white font-mono font-bold">
                        {(results.final_signal.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Pivot Recommended</span>
                    <span className={`font-mono font-bold ${results.final_signal.pivot_recommended ? 'text-red-400' : 'text-emerald-400'}`}>
                      {results.final_signal.pivot_recommended ? 'YES' : 'NO'}
                    </span>
                  </div>
                </div>

                {results.final_signal.pivot_suggestion && (
                  <div className="mt-3 p-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <div className="text-[10px] text-red-400 font-mono uppercase tracking-wider mb-1">Pivot Suggestion</div>
                    <p className="text-xs text-red-300 leading-relaxed">{results.final_signal.pivot_suggestion}</p>
                  </div>
                )}
              </div>
            )}

            {/* Stance legend */}
            <div className="pt-3 mt-2 border-t border-gray-800/40">
              <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Legend</div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-gray-500">Positive (&gt;0.15)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-[10px] text-gray-500">Negative (&lt;-0.15)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  <span className="text-[10px] text-gray-500">Neutral</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-[10px] text-gray-500">Reference Arc</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Persona detail modal (globe click or feed click) */}
      {selectedPersonaData && (
        <PersonaDetailPanel
          persona={selectedPersonaData}
          onClose={handleCloseDetailPanel}
        />
      )}
    </div>
  );
}
