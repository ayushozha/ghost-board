/**
 * Ghost Board API client
 * Fetch helpers for all /api/ endpoints and WebSocket connections.
 */

const API_BASE = '/api';

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${res.statusText} - ${body}`);
  }

  return res.json();
}

// ── Sprint endpoints ──────────────────────────────────────────────

/**
 * Start a new sprint with the given concept.
 * POST /api/sprint
 */
export async function startSprint(concept, options = {}) {
  return apiFetch('/sprint', {
    method: 'POST',
    body: JSON.stringify({ concept, ...options }),
  });
}

/**
 * Get all sprint runs.
 * GET /api/runs
 */
export async function getRuns() {
  return apiFetch('/runs');
}

/**
 * Get a specific sprint run by ID.
 * GET /api/runs/:id
 */
export async function getRun(runId) {
  return apiFetch(`/runs/${runId}`);
}

/**
 * Get the event trace for a specific run.
 * GET /api/runs/:id/trace
 */
export async function getRunTrace(runId) {
  return apiFetch(`/runs/${runId}/trace`);
}

/**
 * Get board discussion for a specific run.
 * GET /api/runs/:id/board-discussion
 */
export async function getRunDiscussion(runId) {
  return apiFetch(`/runs/${runId}/board-discussion`);
}

/**
 * Get simulation results for a specific run.
 * GET /api/runs/:id/simulation
 */
export async function getRunSimulation(runId) {
  return apiFetch(`/runs/${runId}/simulation`);
}

/**
 * Get simulation geo data for a specific run (globe visualization).
 * GET /api/runs/:id/simulation/geo
 */
export async function getRunSimulationGeo(runId) {
  return apiFetch(`/runs/${runId}/simulation/geo`);
}

/**
 * Get sprint artifacts (prototype, financial model, GTM, compliance).
 * GET /api/runs/:id/artifacts
 */
export async function getRunArtifacts(runId) {
  return apiFetch(`/runs/${runId}/artifacts`);
}

/**
 * Get sprint report.
 * GET /api/runs/:id/report
 */
export async function getRunReport(runId) {
  return apiFetch(`/runs/${runId}/report`);
}

// ── Static file fallback (when no API server is running) ──────────

/**
 * Load trace data from static outputs (fallback when API is unavailable).
 */
export async function loadStaticTrace() {
  const res = await fetch('/outputs/trace.json');
  if (!res.ok) throw new Error('No static trace available');
  return res.json();
}

/**
 * Load board discussion from static outputs.
 */
export async function loadStaticDiscussion() {
  const res = await fetch('/outputs/board_discussion.json');
  if (!res.ok) throw new Error('No static discussion available');
  return res.json();
}

/**
 * Load simulation results from static outputs.
 */
export async function loadStaticSimulation() {
  const res = await fetch('/outputs/simulation_results.json');
  if (!res.ok) throw new Error('No static simulation available');
  return res.json();
}

/**
 * Load simulation geo data from static outputs.
 */
export async function loadStaticSimulationGeo() {
  const res = await fetch('/outputs/simulation_geo.json');
  if (!res.ok) throw new Error('No static simulation geo available');
  return res.json();
}

// ── WebSocket connection ──────────────────────────────────────────

/**
 * Create a live WebSocket connection for a sprint run.
 * Returns the WebSocket instance.
 *
 * Usage:
 *   const ws = connectLive('run-123', {
 *     onEvent: (event) => console.log(event),
 *     onClose: () => console.log('closed'),
 *     onError: (err) => console.error(err),
 *   });
 *   // later: ws.close();
 */
export function connectLive(runId, { onEvent, onClose, onError } = {}) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/live/${runId}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data);
      onEvent?.(event);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  ws.onclose = () => onClose?.();
  ws.onerror = (err) => onError?.(err);

  return ws;
}

// ── Health check ──────────────────────────────────────────────────

/**
 * Check if the API server is reachable.
 * Returns true if available, false otherwise.
 */
export async function isApiAvailable() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
