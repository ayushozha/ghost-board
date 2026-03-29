import { useState, useEffect, useCallback, useRef, createContext, lazy, Suspense } from 'react';
import LandingPage from './screens/LandingPage';
import MissionControl from './screens/MissionControl';
import Boardroom from './screens/Boardroom';
// Lazy-load MarketArena so that Three.js / @react-three/fiber / drei are
// split into their own async chunk and NOT included in the initial bundle.
// They are only downloaded the first time the user opens Market Arena.
const MarketArena = lazy(() => import('./screens/MarketArena'));

function GlobeScreenFallback() {
  return (
    <div className="flex-1 flex flex-col h-full min-h-[400px] p-6 gap-4">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-emerald-500/50 animate-pulse" />
        <div className="h-4 bg-gray-800 rounded w-40 animate-pulse" />
      </div>
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-[30%] bg-gray-900/50 border border-gray-800 rounded-2xl animate-pulse" />
        <div className="w-[40%] bg-gray-900/50 border border-gray-800 rounded-2xl animate-pulse" />
        <div className="w-[30%] bg-gray-900/50 border border-gray-800 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}
import PivotTimeline from './screens/PivotTimeline';
import SprintReport from './screens/SprintReport';
import SprintHistory from './screens/SprintHistory';
import { isApiAvailable, connectLive, getRun, getRunSimulation } from './api';

// Theme context — provides { theme, toggleTheme } to all children
export const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

const SCREENS = [
  { id: 'mission',  label: 'Mission Control', icon: '\u{1F680}', color: 'from-cyan-400 to-blue-500',   alwaysEnabled: true },
  { id: 'boardroom', label: 'Boardroom',      icon: '\u{1F4CB}', color: 'from-blue-400 to-indigo-500', alwaysEnabled: false },
  { id: 'arena',    label: 'Market Arena',    icon: '\u{1F30D}', color: 'from-green-400 to-emerald-500', alwaysEnabled: false },
  { id: 'timeline', label: 'Pivot Timeline',  icon: '\u{1F4C8}', color: 'from-yellow-400 to-orange-500', alwaysEnabled: false },
  { id: 'report',   label: 'Sprint Report',   icon: '\u{1F4CA}', color: 'from-purple-400 to-pink-500',  alwaysEnabled: false },
  { id: 'history',  label: 'History',         icon: '\u{1F4DC}', color: 'from-gray-400 to-gray-500',   alwaysEnabled: true },
];

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [runId, setRunId] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [sprintStatus, setSprintStatus] = useState('idle');
  const [activeConcept, setActiveConcept] = useState('');
  const wsRef = useRef(null);

  // Theme state — read from localStorage on mount, default to 'dark'
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('ghost-board-theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  // Sync data-theme attribute on #root so CSS variable overrides apply
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) root.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('ghost-board-theme', next); } catch {}
      return next;
    });
  }, []);

  const isLanding = screen === 'landing';

  useEffect(() => {
    isApiAvailable().then(setIsLive);
  }, []);

  useEffect(() => {
    if (!runId || sprintStatus !== 'running') return;

    const ws = connectLive(runId, {
      onEvent: (event) => {
        const t = event.event_type || event.type || '';
        if (t === 'SIMULATION_START' || t === 'simulation_start') {
          setScreen('arena');
        } else if (t === 'SIMULATION_COMPLETE' || t === 'simulation_complete' || t === 'SIMULATION_RESULT') {
          setScreen('timeline');
        } else if (t === 'SPRINT_COMPLETE' || t === 'sprint_complete') {
          setScreen('report');
          setSprintStatus('completed');
        }
      },
      onClose: () => {
        // Live sockets can drop transiently during local dev or server reloads.
        // Completion should only be driven by an explicit backend event.
      },
      onError: (err) => {
        console.error('WebSocket error:', err);
      },
    });

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [runId, sprintStatus]);

  useEffect(() => {
    if (!runId || sprintStatus !== 'running') return;

    let cancelled = false;

    const pollProgress = async () => {
      try {
        const [runData, simData] = await Promise.all([
          getRun(runId).catch(() => null),
          getRunSimulation(runId).catch(() => null),
        ]);

        if (cancelled) return;

        const hasSimulation =
          (Array.isArray(simData?.geo) && simData.geo.length > 0) ||
          (Array.isArray(simData?.results?.rounds_data) && simData.results.rounds_data.length > 0) ||
          Boolean(simData?.results?.final_signal);

        if (hasSimulation && screen === 'boardroom') {
          setScreen('arena');
        }

        if (runData?.status === 'completed') {
          setSprintStatus('completed');
          setScreen('report');
        }
      } catch {
        // Best-effort fallback when live events are unavailable.
      }
    };

    pollProgress();
    const timer = setInterval(pollProgress, 3000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId, screen, sprintStatus]);

  const handleLaunch = useCallback((newRunId, concept) => {
    if (newRunId) {
      setRunId(newRunId);
      setSprintStatus('running');
      if (concept) setActiveConcept(concept);
      setScreen('boardroom');
    } else {
      setScreen('report');
    }
  }, []);

  const handleEnterDashboard = useCallback(() => {
    setScreen('mission');
  }, []);

  const handleNewSprint = useCallback(() => {
    setRunId(null);
    setSprintStatus('idle');
    setActiveConcept('');
    setScreen('mission');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const handleSprintDone = useCallback(() => {
    setSprintStatus('completed');
  }, []);

  const handleNavigate = useCallback((screenId) => {
    // history is always accessible; other sprint screens require an active run
    const alwaysAllowed = ['landing', 'mission', 'history'];
    if (alwaysAllowed.includes(screenId) || runId) {
      setScreen(screenId);
    }
  }, [runId]);

  // Called by SprintHistory when the user clicks a run row
  const handleLoadRun = useCallback((selectedRunId, concept) => {
    setRunId(selectedRunId);
    if (concept) setActiveConcept(concept);
    // Don't override sprintStatus — treat as viewing a past completed run
    setSprintStatus('completed');
    setScreen('report');
  }, []);

  const renderScreen = () => {
    switch (screen) {
      case 'landing':
        return <LandingPage isLive={isLive} onEnterDashboard={handleEnterDashboard} />;
      case 'mission':
        return (
          <MissionControl
            onLaunch={handleLaunch}
            onNewSprint={handleNewSprint}
            sprintStatus={sprintStatus}
            activeConcept={activeConcept}
            isLive={isLive}
          />
        );
      case 'boardroom':
        return <Boardroom runId={runId} onDone={handleSprintDone} />;
      case 'arena':
        return (
          <Suspense fallback={<GlobeScreenFallback />}>
            <MarketArena runId={runId} />
          </Suspense>
        );
      case 'timeline':
        return <PivotTimeline runId={runId} />;
      case 'report':
        return <SprintReport runId={runId} />;
      case 'history':
        return <SprintHistory onLoadRun={handleLoadRun} />;
      default:
        return (
          <MissionControl
            onLaunch={handleLaunch}
            onNewSprint={handleNewSprint}
            sprintStatus={sprintStatus}
            activeConcept={activeConcept}
            isLive={isLive}
          />
        );
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {!isLanding && (
        <nav className="flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3 bg-gray-900/80 backdrop-blur border-b border-gray-800 sticky top-0 z-50">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => handleNavigate(runId ? 'mission' : 'landing')}
              className="flex items-center gap-2 group cursor-pointer min-h-[44px]"
            >
              <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent group-hover:from-cyan-300 group-hover:to-purple-400 transition-all duration-300">
                Ghost Board
              </span>
            </button>
            {isLive && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
                <span className="hidden sm:inline">LIVE</span>
              </span>
            )}
          </div>

          <div className="hidden md:flex gap-1">
            {SCREENS.map((s) => {
              const isActive = screen === s.id;
              const isDisabled = !s.alwaysEnabled && !runId;
              return (
                <button
                  key={s.id}
                  onClick={() => handleNavigate(s.id)}
                  disabled={isDisabled}
                  className={`relative px-3 lg:px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-all duration-200 ${
                    isDisabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : isActive
                        ? 'bg-gray-800 text-white shadow-lg'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 cursor-pointer'
                  }`}
                >
                  <span className="mr-1">{s.icon}</span>
                  <span className="hidden lg:inline">{s.label}</span>
                  <span className="lg:hidden">{s.label.split(' ')[0]}</span>
                  {isActive && (
                    <span className={`absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r ${s.color} rounded-full`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {sprintStatus === 'running' && (
              <span className="text-xs text-yellow-400 animate-pulse font-medium hidden sm:inline">
                Sprint Running...
              </span>
            )}
            {sprintStatus === 'running' && (
              <span className="text-xs text-yellow-400 animate-pulse font-medium sm:hidden">
                Running
              </span>
            )}
            {sprintStatus === 'completed' && (
              <span className="text-xs text-green-400 font-medium hidden sm:inline">
                Sprint Complete
              </span>
            )}
            {sprintStatus === 'completed' && (
              <span className="text-xs text-green-400 font-medium sm:hidden">
                Done
              </span>
            )}

            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />

            <div className="md:hidden">
              <MobileMenu
                screens={SCREENS}
                activeScreen={screen}
                runId={runId}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        </nav>
      )}

      <main className="flex-1">
        {renderScreen()}
      </main>

      {!isLanding && (
        <footer className="text-center py-3 text-xs text-gray-600 border-t border-gray-800">
          Ghost Board &mdash; Built at Ralphthon SF 2026
        </footer>
      )}
    </div>
    </ThemeContext.Provider>
  );
}

function ThemeToggleButton({ theme, onToggle }) {
  const isDark = theme === 'dark';
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors cursor-pointer"
    >
      {isDark ? (
        /* Sun icon — shown in dark mode to indicate "switch to light" */
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="5" />
          <path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        /* Moon icon — shown in light mode to indicate "switch to dark" */
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}

function MobileMenu({ screens, activeScreen, runId, onNavigate }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-gray-800/50 transition-colors cursor-pointer"
        aria-label="Menu"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-50">
          {screens.map((s) => {
            const isActive = activeScreen === s.id;
            const isDisabled = !s.alwaysEnabled && !runId;
            return (
              <button
                key={s.id}
                onClick={() => {
                  onNavigate(s.id);
                  setOpen(false);
                }}
                disabled={isDisabled}
                className={`w-full text-left px-4 py-3 min-h-[44px] text-sm flex items-center gap-3 transition-colors cursor-pointer ${
                  isDisabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : isActive
                      ? 'text-white bg-gray-800/80'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
                }`}
              >
                <span className="text-base">{s.icon}</span>
                <span>{s.label}</span>
                {isActive && (
                  <span className={`ml-auto w-1.5 h-1.5 rounded-full bg-gradient-to-r ${s.color || 'from-purple-500 to-cyan-500'}`} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
