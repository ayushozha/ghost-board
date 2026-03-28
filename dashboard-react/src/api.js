/**
 * Ghost Board API client.
 *
 * Centralises all HTTP and WebSocket calls to the FastAPI backend.
 * The base URL defaults to http://localhost:8000 but can be overridden
 * via the VITE_API_URL environment variable.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function wsBase() {
  // Derive WebSocket URL from API_BASE (http -> ws, https -> wss)
  const url = new URL(API_BASE);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.origin;
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  /** Start a new sprint. Returns { run_id, status }. */
  launchSprint: (concept, simScale = 'demo') =>
    jsonFetch(`${API_BASE}/api/sprint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concept, sim_scale: simScale }),
    }),

  /** List all sprint runs (most recent first). Returns { runs: [...] }. */
  getRuns: () => jsonFetch(`${API_BASE}/api/runs`),

  /** Get details for a single run. */
  getRun: (runId) => jsonFetch(`${API_BASE}/api/runs/${runId}`),

  /** Get trace events for a run. Returns { trace: [...] }. */
  getTrace: (runId) => jsonFetch(`${API_BASE}/api/runs/${runId}/trace`),

  /** Get artifacts for a run. Returns { artifacts: [...] }. */
  getArtifacts: (runId) => jsonFetch(`${API_BASE}/api/runs/${runId}/artifacts`),

  /** Get board discussion. Returns { discussion: [...] }. */
  getBoardDiscussion: (runId) =>
    jsonFetch(`${API_BASE}/api/runs/${runId}/board-discussion`),

  /** Get simulation data. Returns { results, geo }. */
  getSimulation: (runId) =>
    jsonFetch(`${API_BASE}/api/runs/${runId}/simulation`),

  /** Get aggregate stats. Returns { total_runs, total_agents, ... }. */
  getStats: () => jsonFetch(`${API_BASE}/api/stats`),

  /** Get sprint report markdown. Returns { report: "..." }. */
  getSprintReport: (runId) =>
    jsonFetch(`${API_BASE}/api/runs/${runId}/sprint-report`),

  /** Get sprint summary JSON. Returns { summary: {...} }. */
  getSummary: (runId) =>
    jsonFetch(`${API_BASE}/api/runs/${runId}/summary`),

  /** Serve a specific artifact file. Returns raw text content. */
  getArtifactFile: async (filePath) => {
    const res = await fetch(`${API_BASE}/api/artifacts/${filePath}`);
    if (!res.ok) throw new Error(`Artifact fetch failed: ${res.status}`);
    return res.text();
  },

  /**
   * Open a WebSocket connection for live sprint events.
   * Returns the WebSocket instance. Caller is responsible for
   * setting onmessage, onerror, onclose handlers and closing.
   */
  connectWebSocket: (runId) => {
    const url = `${wsBase()}/ws/live/${runId}`;
    return new WebSocket(url);
  },
};
