import { useState, useEffect, useRef } from 'react';

export function useWebSocket(runId) {
  const [events, setEvents] = useState([]);
  const [agentStatuses, setAgentStatuses] = useState({
    CEO: 'idle', CTO: 'idle', CFO: 'idle', CMO: 'idle', Legal: 'idle'
  });
  const [currentRound, setCurrentRound] = useState(0);
  const [sentiment, setSentiment] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [sprintStatus, setSprintStatus] = useState('pending');
  const wsRef = useRef(null);

  useEffect(() => {
    if (!runId) return;

    const wsUrl = `ws://localhost:8000/ws/live/${runId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch(data.type) {
        case 'agent_status':
          setAgentStatuses(prev => ({...prev, [data.agent]: data.status}));
          break;
        case 'event':
          setEvents(prev => [...prev, data.data]);
          // Update agent status based on event type
          if (data.data.event_type === 'BLOCKER') {
            setAgentStatuses(prev => ({...prev, [data.data.source]: 'blocked'}));
          }
          break;
        case 'simulation_round':
          setCurrentRound(data.round);
          setSentiment(data.sentiment);
          break;
        case 'sprint_complete':
          setSprintStatus('completed');
          break;
        default:
          break;
      }
    };

    return () => ws.close();
  }, [runId]);

  return { events, agentStatuses, currentRound, sentiment, isConnected, sprintStatus };
}
