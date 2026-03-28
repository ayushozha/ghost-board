import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { getRunSimulation, loadStaticSimulation, loadStaticSimulationGeo } from '../api';
import Globe from '../components/Globe';

// ── Archetype configuration ────────────────────────────────────────
const ARCHETYPE_CONFIG = {
  vc:            { label: 'VC',            tw: 'text-yellow-400', twBg: 'bg-yellow-500/20', twBar: 'bg-yellow-500', hex: '#eab308' },
  early_adopter: { label: 'Early Adopter', tw: 'text-blue-400',   twBg: 'bg-blue-500/20',   twBar: 'bg-blue-500',   hex: '#3b82f6' },
  skeptic:       { label: 'Skeptic',       tw: 'text-red-400',    twBg: 'bg-red-500/20',    twBar: 'bg-red-500',    hex: '#ef4444' },
  journalist:    { label: 'Journalist',    tw: 'text-purple-400', twBg: 'bg-purple-500/20', twBar: 'bg-purple-500', hex: '#a855f7' },
  competitor:    { label: 'Competitor',     tw: 'text-orange-400', twBg: 'bg-orange-500/20', twBar: 'bg-orange-500', hex: '#f97316' },
  regulator:     { label: 'Regulator',     tw: 'text-red-400',    twBg: 'bg-red-500/20',    twBar: 'bg-red-500',    hex: '#ef4444' },
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

// ── Post card ──────────────────────────────────────────────────────
function PostCard({ persona, message, isActive, onClick }) {
  const sent = message?.sentiment ?? persona.stance ?? persona.sentiment ?? 0;
  const s = stanceInfo(sent);
  const arch = getArchCfg(persona.archetype);
  const content = message?.content || persona.post || persona.content || persona.message || '';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
        isActive
          ? 'bg-indigo-500/10 border-indigo-500/40'
          : 'bg-white/[0.02] border-gray-800/60 hover:bg-white/[0.04] hover:border-gray-700'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${s.dotCls}`} />
        <span className="text-sm font-semibold text-gray-200 truncate">{persona.name || 'Anonymous'}</span>
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${arch.twBg} ${arch.tw} border border-current/20`}>
          {arch.label}
        </span>
        {message?.round && (
          <span className="text-[9px] text-gray-600 font-mono ml-auto">R{message.round}</span>
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

// ── Sentiment bar ──────────────────────────────────────────────────
function SentimentBar({ label, value, maxValue = 1, barCls }) {
  const width = Math.min(Math.abs(value) / maxValue * 100, 100);
  const isPositive = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-24 text-right truncate">{label}</span>
      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barCls}`}
          style={{ width: `${width}%`, opacity: 0.8 }}
        />
      </div>
      <span className={`text-xs font-mono w-12 text-right ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {fmtSentiment(value)}
      </span>
    </div>
  );
}

// ── Recharts sentiment line chart ──────────────────────────────────
function SentimentLineChart({ roundsData }) {
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
            getArchCfg(name).label || name,
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 9, paddingTop: 2 }}
          formatter={(val) => getArchCfg(val).label || val}
        />
        {/* Average line - thicker, dashed */}
        <Line
          type="monotone"
          dataKey="avg"
          stroke="#e2e8f0"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          name="Average"
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
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
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
  const feedRef = useRef(null);

  // ── Fetch simulation data ──
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    async function fetchData() {
      try {
        let data;
        try {
          data = await getRunSimulation(runId);
        } catch {
          // API unavailable -- try static files
          const [sim, geo] = await Promise.all([
            loadStaticSimulation().catch(() => null),
            loadStaticSimulationGeo().catch(() => null),
          ]);
          data = { results: sim, geo: geo };
        }

        if (cancelled) return;

        // Normalize: API returns { results, geo }
        const results = data?.results || data || {};
        const geo = data?.geo || [];

        setResultsData(results);
        setGeoData(Array.isArray(geo) ? geo : []);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.warn('MarketArena: using demo data:', err.message);
          setResultsData(DEMO_RESULTS);
          setGeoData(DEMO_GEO);
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [runId]);

  // If still no data after load, use demo
  const results = resultsData || DEMO_RESULTS;
  const personas = geoData.length > 0 ? geoData : DEMO_GEO;

  // ── Animated round progression ──
  const totalRounds = results.rounds || results.rounds_data?.length || 5;

  useEffect(() => {
    if (loading) return;
    if (currentRound >= totalRounds) return;
    const timer = setTimeout(() => setCurrentRound((r) => r + 1), 1800);
    return () => clearTimeout(timer);
  }, [currentRound, loading, totalRounds]);

  // ── Derived data ──
  const llmAgents = results.total_llm_agents || personas.length;
  const lightweightAgents = results.total_lightweight_agents || 0;
  const totalAgents = results.total_agents || llmAgents + lightweightAgents;

  const overallSentiment = useMemo(() => {
    if (results.final_signal?.overall_sentiment != null) return results.final_signal.overall_sentiment;
    const rd = results.rounds_data;
    if (rd && rd.length > 0) return rd[rd.length - 1].avg_sentiment;
    // Compute from personas
    if (personas.length > 0) {
      return personas.reduce((sum, p) => {
        const val = typeof (p.stance ?? p.sentiment) === 'number' ? (p.stance ?? p.sentiment) : 0;
        return sum + val;
      }, 0) / personas.length;
    }
    return 0;
  }, [results, personas]);

  // Feed items: all messages up to currentRound, newest first
  const feedItems = useMemo(() => {
    const items = [];
    personas.forEach((p) => {
      const msgs = p.messages || [];
      if (msgs.length > 0) {
        msgs.forEach((m) => {
          if (m.round <= currentRound) {
            items.push({ persona: p, message: m });
          }
        });
      } else if (p.content && (p.round || 1) <= currentRound) {
        // Flat geo format from DB
        items.push({
          persona: p,
          message: { round: p.round || 1, content: p.content, sentiment: typeof p.stance === 'number' ? p.stance : 0 },
        });
      } else if ((p.post || p.message) && currentRound > 0) {
        items.push({
          persona: p,
          message: { round: 1, content: p.post || p.message, sentiment: typeof (p.stance ?? p.sentiment) === 'number' ? (p.stance ?? p.sentiment) : 0 },
        });
      }
    });
    items.sort((a, b) => (b.message.round || 0) - (a.message.round || 0));
    return items;
  }, [personas, currentRound]);

  // Archetype breakdown for current round from rounds_data
  const archetypeBreakdown = useMemo(() => {
    const rd = results.rounds_data;
    if (rd && rd.length > 0) {
      const idx = Math.min(currentRound, rd.length) - 1;
      if (idx >= 0) return rd[idx].sentiment_by_archetype || {};
    }
    // Compute from personas
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
  }, [results, personas, currentRound]);

  const archetypeEntries = useMemo(() => {
    return Object.entries(archetypeBreakdown)
      .map(([arch, val]) => ({ archetype: arch, avg: val }))
      .sort((a, b) => b.avg - a.avg);
  }, [archetypeBreakdown]);

  // Arcs for the globe
  const arcs = useMemo(() => {
    const result = [];
    const geoMap = {};
    personas.forEach((p) => {
      if (p.name && p.lat != null && p.lng != null) geoMap[p.name] = [p.lat, p.lng];
    });
    personas.forEach((p) => {
      (p.references || []).forEach((refName) => {
        const fromPos = geoMap[p.name];
        const toPos = geoMap[refName];
        if (fromPos && toPos) {
          result.push({ from: fromPos, to: toPos, color: getArchCfg(p.archetype).hex });
        }
      });
    });
    return result;
  }, [personas]);

  const handleFeedClick = useCallback((name) => {
    setActivePersona((prev) => (prev === name ? null : name));
  }, []);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-900 to-indigo-900 border border-cyan-700/50 flex items-center justify-center text-3xl animate-pulse">
            {'\uD83C\uDF0D'}
          </div>
          <p className="text-sm text-gray-500 font-mono">Loading market simulation...</p>
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

  const displayRound = Math.min(currentRound, totalRounds);
  const progressPct = totalRounds > 0 ? (displayRound / totalRounds) * 100 : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full px-2 py-2 gap-2">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2 bg-gray-900/60 border border-gray-800/60 rounded-xl backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Market Stress Test
          </h2>
          <span className="text-gray-700">|</span>
          <span className="text-sm text-gray-400 font-mono">Round {displayRound}/{totalRounds}</span>
          <span className="text-gray-700">|</span>
          <span className="text-sm text-gray-400 font-mono">{totalAgents.toLocaleString()} agents</span>
          {lightweightAgents > 0 && (
            <span className="text-[10px] text-gray-600 font-mono">
              ({llmAgents} LLM + {lightweightAgents.toLocaleString()} lightweight)
            </span>
          )}
          <span className="text-gray-700">|</span>
          <span className="text-sm font-mono">
            <span className="text-gray-500">Sentiment </span>
            <span className={overallSentiment >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
              {fmtSentiment(overallSentiment)}
            </span>
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── Three-column layout ── */}
      <div className="flex-1 flex gap-2 min-h-0">

        {/* LEFT: Post feed (30%) */}
        <div className="w-[30%] min-w-[240px] bg-gray-900/50 border border-gray-800 rounded-2xl flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-gray-800/60 flex items-center gap-2 shrink-0">
            <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-sm font-semibold text-gray-300">Live Feed</span>
            <span className="text-[10px] text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded-full font-mono ml-auto">{feedItems.length}</span>
          </div>
          <div ref={feedRef} className="flex-1 overflow-y-auto p-2.5 space-y-1.5 min-h-0">
            {feedItems.length === 0 && currentRound === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-gray-600 font-mono italic">Simulation starting...</p>
              </div>
            ) : feedItems.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-gray-600 font-mono">No posts yet...</p>
              </div>
            ) : (
              feedItems.map((item, i) => (
                <PostCard
                  key={`${item.persona.name}-${item.message.round}-${i}`}
                  persona={item.persona}
                  message={item.message}
                  isActive={activePersona === item.persona.name}
                  onClick={() => handleFeedClick(item.persona.name)}
                />
              ))
            )}
          </div>
        </div>

        {/* CENTER: Globe (40%) */}
        <div className="w-[40%] min-w-[280px] bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden relative min-h-0">
          <Globe
            personas={personas}
            activePersona={activePersona}
            arcs={arcs}
          />
          {/* Globe legend overlay */}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 px-2.5 py-1.5 bg-gray-950/80 backdrop-blur-sm rounded-lg border border-gray-800/50">
            {Object.entries(ARCHETYPE_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: cfg.hex }} />
                <span className="text-[9px] text-gray-500">{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Sentiment analysis (30%) */}
        <div className="w-[30%] min-w-[240px] bg-gray-900/50 border border-gray-800 rounded-2xl flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-gray-800/60 flex items-center gap-2 shrink-0">
            <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span className="text-sm font-semibold text-gray-300">Sentiment Analysis</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">

            {/* Archetype breakdown bars */}
            <div className="pb-3 border-b border-gray-800/40">
              <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">By Archetype</div>
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
            {results.rounds_data && results.rounds_data.length > 0 && (
              <div className="pb-3 border-b border-gray-800/40">
                <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2 mt-2">Sentiment Over Rounds</div>
                <div className="h-[200px]">
                  <SentimentLineChart roundsData={results.rounds_data} />
                </div>
              </div>
            )}

            {/* Signal summary */}
            {results.final_signal && (
              <div className="pt-2">
                <div className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-2">Signal Summary</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Overall Sentiment</span>
                    <span className={`font-mono font-bold ${overallSentiment >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">LLM Agents</span>
                    <span className="text-white font-mono">{llmAgents}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Total Agents</span>
                    <span className="text-white font-mono">{totalAgents.toLocaleString()}</span>
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
                  <span className="text-[10px] text-gray-500">Positive</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-[10px] text-gray-500">Negative</span>
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
    </div>
  );
}
