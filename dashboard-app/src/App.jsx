import { useState, useEffect, useCallback, useRef } from 'react';
import LandingPage from './screens/LandingPage';
import MissionControl from './screens/MissionControl';
import Boardroom from './screens/Boardroom';
import MarketArena from './screens/MarketArena';
import PivotTimeline from './screens/PivotTimeline';
import SprintReport from './screens/SprintReport';
import { isApiAvailable, connectLive, getRun, getRunSimulation } from './api';

const SCREENS = [
  { id: 'mission', label: 'Mission Control', icon: '\u{1F680}', color: 'from-cyan-400 to-blue-500' },
  { id: 'boardroom', label: 'Boardroom', icon: '\u{1F4CB}', color: 'from-blue-400 to-indigo-500' },
  { id: 'arena', label: 'Market Arena', icon: '\u{1F30D}', color: 'from-green-400 to-emerald-500' },
  { id: 'timeline', label: 'Pivot Timeline', icon: '\u{1F4C8}', color: 'from-yellow-400 to-orange-500' },
  { id: 'report', label: 'Sprint Report', icon: '\u{1F4CA}', color: 'from-purple-400 to-pink-500' },
];

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [runId, setRunId] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [sprintStatus, setSprintStatus] = useState('idle');
  const [activeConcept, setActiveConcept] = useState('');
  const wsRef = useRef(null);

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
    if (screenId === 'landing' || screenId === 'mission' || runId) {
      setScreen(screenId);
    }
  }, [runId]);

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
        return <MarketArena runId={runId} />;
      case 'timeline':
        return <PivotTimeline runId={runId} />;
      case 'report':
        return <SprintReport runId={runId} />;
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
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {!isLanding && (
        <nav className="flex items-center justify-between px-6 py-3 bg-gray-900/80 backdrop-blur border-b border-gray-800 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleNavigate(runId ? 'mission' : 'landing')}
              className="flex items-center gap-2 group cursor-pointer"
            >
              <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent group-hover:from-cyan-300 group-hover:to-purple-400 transition-all duration-300">
                Ghost Board
              </span>
            </button>
            {isLive && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
                LIVE
              </span>
            )}
          </div>

          <div className="hidden md:flex gap-1">
            {SCREENS.map((s) => {
              const isActive = screen === s.id;
              const isDisabled = s.id !== 'mission' && !runId;
              return (
                <button
                  key={s.id}
                  onClick={() => handleNavigate(s.id)}
                  disabled={isDisabled}
                  className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isDisabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : isActive
                        ? 'bg-gray-800 text-white shadow-lg'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 cursor-pointer'
                  }`}
                >
                  <span className="mr-1.5">{s.icon}</span>
                  {s.label}
                  {isActive && (
                    <span className={`absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r ${s.color} rounded-full`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {sprintStatus === 'running' && (
              <span className="text-xs text-yellow-400 animate-pulse font-medium">
                Sprint Running...
              </span>
            )}
            {sprintStatus === 'completed' && (
              <span className="text-xs text-green-400 font-medium">
                Sprint Complete
              </span>
            )}

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
  );
}

function MobileMenu({ screens, activeScreen, runId, onNavigate }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800/50 transition-colors cursor-pointer"
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
        <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-50">
          {screens.map((s) => {
            const isActive = activeScreen === s.id;
            const isDisabled = s.id !== 'mission' && !runId;
            return (
              <button
                key={s.id}
                onClick={() => {
                  onNavigate(s.id);
                  setOpen(false);
                }}
                disabled={isDisabled}
                className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors cursor-pointer ${
                  isDisabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : isActive
                      ? 'text-white bg-gray-800/80'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
                }`}
              >
                <span>{s.icon}</span>
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
