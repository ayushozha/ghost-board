/**
 * Ghost Board API Client
 *
 * Full-featured client with:
 * - REST fetch helpers for all /api/ endpoints
 * - WebSocket real-time streaming with auto-reconnect and heartbeat
 * - Event emitter pattern for subscribing to live sprint events
 * - Request deduplication and short-lived cache
 * - Retry with exponential backoff
 * - Static file fallback when the API server is unavailable
 * - Demo data fallback when both API and static files are unavailable
 */

import {
  DEMO_TRACE,
  DEMO_DISCUSSION,
  DEMO_SIMULATION,
  DEMO_GEO,
  DEMO_STATS,
  DEMO_ARTIFACTS,
  DEMO_RUN,
} from './demoData';

// ── Configuration ────────────────────────────────────────────────────

const DEV_API_PORT = '8000';

function resolveApiBase() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // In local Vite dev, connect directly to the backend so live demo
  // traffic does not depend on the ws/http proxy layer.
  if (
    typeof window !== 'undefined' &&
    import.meta.env.DEV &&
    window.location.port &&
    window.location.port !== DEV_API_PORT
  ) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:${DEV_API_PORT}/api`;
  }

  return '/api';
}

function resolveWsUrl(baseUrl, runId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (baseUrl.startsWith('http')) {
    return baseUrl.replace(/^http/, 'ws').replace(/\/api\/?$/, '') + `/ws/live/${runId}`;
  }
  if (
    typeof window !== 'undefined' &&
    import.meta.env.DEV &&
    window.location.port &&
    window.location.port !== DEV_API_PORT
  ) {
    return `${protocol}//${window.location.hostname}:${DEV_API_PORT}/ws/live/${runId}`;
  }
  return `${protocol}//${window.location.host}/ws/live/${runId}`;
}

function normalizeLiveEvent(rawEvent) {
  if (rawEvent?.type === 'event' && rawEvent.event) {
    return {
      ...rawEvent,
      event_type: rawEvent.event.event_type,
      payload: rawEvent.event.payload,
      source_agent: rawEvent.event.source_agent || rawEvent.event.source,
      triggered_by: rawEvent.event.triggered_by,
      iteration: rawEvent.event.iteration,
    };
  }
  return rawEvent;
}

const sharedLiveSockets = new Map();

const API_BASE = resolveApiBase();
const WS_RECONNECT_BASE_MS = 1000;
const WS_RECONNECT_MAX_MS = 30000;
const WS_HEARTBEAT_INTERVAL_MS = 25000;
const CACHE_TTL_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

// ── Event Emitter ────────────────────────────────────────────────────

class EventEmitter {
  constructor() {
    this._handlers = new Map();
  }

  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const set = this._handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this._handlers.delete(event);
    }
  }

  emit(event, data) {
    const set = this._handlers.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[GhostBoardAPI] Error in "${event}" handler:`, err);
        }
      }
    }
    // Also emit on wildcard listeners
    const wildcard = this._handlers.get('*');
    if (wildcard) {
      for (const handler of wildcard) {
        try {
          handler({ event, data });
        } catch (err) {
          console.error('[GhostBoardAPI] Error in wildcard handler:', err);
        }
      }
    }
  }

  removeAllListeners(event) {
    if (event) {
      this._handlers.delete(event);
    } else {
      this._handlers.clear();
    }
  }
}

// ── Main API Client ──────────────────────────────────────────────────

class GhostBoardAPI extends EventEmitter {
  constructor(baseUrl = API_BASE) {
    super();
    this.baseUrl = baseUrl;

    // Request deduplication: in-flight GET requests keyed by URL
    this._inflight = new Map();

    // Short-lived response cache: { url -> { data, expiry } }
    this._cache = new Map();

    // Active WebSocket connections keyed by runId
    this._sockets = new Map();
  }

  // ── Internal: fetch with retry and deduplication ─────────────────

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const method = (options.method || 'GET').toUpperCase();

    // Only deduplicate and cache GET requests
    if (method === 'GET') {
      // Check cache
      const cached = this._cache.get(url);
      if (cached && Date.now() < cached.expiry) {
        return cached.data;
      }

      // Deduplicate: return existing in-flight promise for the same URL
      if (this._inflight.has(url)) {
        return this._inflight.get(url);
      }
    }

    const promise = this._fetchWithRetry(url, options);

    if (method === 'GET') {
      this._inflight.set(url, promise);
      try {
        const data = await promise;
        // Cache the response
        this._cache.set(url, { data, expiry: Date.now() + CACHE_TTL_MS });
        return data;
      } finally {
        this._inflight.delete(url);
      }
    }

    return promise;
  }

  async _fetchWithRetry(url, options, attempt = 0) {
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(`API ${res.status}: ${res.statusText} - ${body}`);
        err.status = res.status;
        throw err;
      }

      return res.json();
    } catch (err) {
      const method = (options.method || 'GET').toUpperCase();
      // Only retry idempotent GET requests on network/5xx errors
      const isRetryable =
        method === 'GET' &&
        attempt < MAX_RETRIES &&
        (!err.status || err.status >= 500);

      if (isRetryable) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay));
        return this._fetchWithRetry(url, options, attempt + 1);
      }

      throw err;
    }
  }

  /** Invalidate cached data for a specific path or all caches. */
  invalidateCache(path) {
    if (path) {
      this._cache.delete(`${this.baseUrl}${path}`);
    } else {
      this._cache.clear();
    }
  }

  // ── Sprint endpoints ─────────────────────────────────────────────

  /**
   * Start a new sprint.
   * POST /api/sprint
   * @param {string} concept - The startup concept to build.
   * @param {string} simScale - Simulation scale: 'demo', 'small', 'full'.
   * @param {object} extraOptions - Additional options merged into the body.
   * @returns {Promise<{run_id: string, status: string}>}
   */
  async launchSprint(concept, simScale = 'demo', extraOptions = {}) {
    const data = await this._fetch('/sprint', {
      method: 'POST',
      body: JSON.stringify({ concept, sim_scale: simScale, ...extraOptions }),
    });
    return data;
  }

  /**
   * List all sprint runs.
   * GET /api/runs
   */
  async getRuns() {
    try {
      return await this._fetch('/runs');
    } catch {
      return { runs: [DEMO_RUN] };
    }
  }

  /**
   * Get details for a specific run.
   * GET /api/runs/:id
   */
  async getRun(runId) {
    try {
      return await this._fetch(`/runs/${runId}`);
    } catch {
      return DEMO_RUN;
    }
  }

  /**
   * Get the event trace (timeline) for a run.
   * GET /api/runs/:id/trace
   */
  async getTrace(runId) {
    try {
      return await this._fetch(`/runs/${runId}/trace`);
    } catch {
      return { trace: DEMO_TRACE, events: DEMO_TRACE };
    }
  }

  /**
   * Get build artifacts (prototype, financial model, GTM, compliance).
   * GET /api/runs/:id/artifacts
   */
  async getArtifacts(runId) {
    try {
      return await this._fetch(`/runs/${runId}/artifacts`);
    } catch {
      return DEMO_ARTIFACTS;
    }
  }

  /**
   * Get board discussion with agent reasoning.
   * GET /api/runs/:id/board-discussion
   */
  async getDiscussion(runId) {
    try {
      return await this._fetch(`/runs/${runId}/board-discussion`);
    } catch {
      return DEMO_DISCUSSION;
    }
  }

  /**
   * Get simulation results and geo data.
   * GET /api/runs/:id/simulation
   */
  async getSimulation(runId) {
    try {
      return await this._fetch(`/runs/${runId}/simulation`);
    } catch {
      return { results: DEMO_SIMULATION, geo: DEMO_GEO };
    }
  }

  /**
   * Get sprint report.
   * GET /api/runs/:id/sprint-report
   */
  async getReport(runId) {
    try {
      return await this._fetch(`/runs/${runId}/sprint-report`);
    } catch {
      return { report: '# Sprint Report\n\nAnchrix B2B Compliance API sprint completed with 3 pivots, $0.19 API cost, and 1M+ agents simulated.' };
    }
  }

  /**
   * Get run summary.
   * GET /api/runs/:id/summary
   */
  async getSummary(runId) {
    try {
      return await this._fetch(`/runs/${runId}/summary`);
    } catch {
      return DEMO_RUN;
    }
  }

  /**
   * Get aggregate stats.
   * GET /api/stats
   */
  async getStats() {
    try {
      return await this._fetch('/stats');
    } catch {
      return DEMO_STATS;
    }
  }

  /**
   * Get previously used concepts.
   * GET /api/concepts
   */
  async getConcepts() {
    try {
      return await this._fetch('/concepts');
    } catch {
      return { concepts: [DEMO_RUN.concept] };
    }
  }

  /**
   * Health check.
   * GET /api/health
   */
  async getHealth() {
    try {
      return await this._fetch('/health');
    } catch {
      return { status: 'demo', message: 'Running with demo data' };
    }
  }

  // ── WebSocket real-time connection ───────────────────────────────

  /**
   * Connect a WebSocket for live sprint updates.
   *
   * Emits these events on the GhostBoardAPI instance:
   *   'ws:open'         - { runId }
   *   'ws:event'        - the parsed event object from the server
   *   'ws:agent_event'  - agent events (type === 'event')
   *   'ws:phase'        - phase change events (type === 'phase')
   *   'ws:status'       - status change events (type === 'status')
   *   'ws:complete'     - sprint completed (type === 'complete')
   *   'ws:error'        - { runId, error }
   *   'ws:close'        - { runId, code, reason, willReconnect }
   *   'ws:reconnecting' - { runId, attempt, delayMs }
   *
   * @param {string} runId
   * @param {object} opts
   * @param {boolean} opts.autoReconnect - Enable auto-reconnect (default true).
   * @param {number}  opts.maxReconnectAttempts - Max reconnect attempts (default 20).
   * @returns {{ ws: WebSocket, close: () => void }} Handle to manage the connection.
   */
  connectWebSocket(runId, opts = {}) {
    const { autoReconnect = true, maxReconnectAttempts = 20 } = opts;

    // Close existing connection to this runId if any
    if (this._sockets.has(runId)) {
      this._sockets.get(runId).close();
    }

    let reconnectAttempt = 0;
    let heartbeatTimer = null;
    let reconnectTimer = null;
    let intentionallyClosed = false;
    let ws = null;

    const clearTimers = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      ws = new WebSocket(resolveWsUrl(this.baseUrl, runId));

      ws.onopen = () => {
        reconnectAttempt = 0;
        this.emit('ws:open', { runId });

        // Start heartbeat pings to keep the connection alive
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send('ping');
            } catch {
              // Ignore send errors during heartbeat
            }
          }
        }, WS_HEARTBEAT_INTERVAL_MS);
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);

          // Handle pong (heartbeat response) silently
          if (data.type === 'pong') return;

          // Emit the raw event
          this.emit('ws:event', data);

          // Emit typed sub-events for convenience
          switch (data.type) {
            case 'event':
              this.emit('ws:agent_event', data.event || data);
              break;
            case 'phase':
              this.emit('ws:phase', data);
              break;
            case 'status':
              this.emit('ws:status', data);
              break;
            case 'complete':
            case 'sprint_complete':
              this.emit('ws:complete', data);
              // Invalidate caches so next fetch gets fresh data
              this.invalidateCache();
              break;
            case 'error':
              this.emit('ws:error', { runId, error: data.message || data });
              break;
            default:
              // Emit unknown types under their own name
              this.emit(`ws:${data.type}`, data);
              break;
          }
        } catch (err) {
          console.error('[GhostBoardAPI] Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        this.emit('ws:error', { runId, error: err });
      };

      ws.onclose = (evt) => {
        clearTimers();

        const willReconnect =
          autoReconnect &&
          !intentionallyClosed &&
          reconnectAttempt < maxReconnectAttempts &&
          evt.code !== 1000; // 1000 = normal closure

        this.emit('ws:close', {
          runId,
          code: evt.code,
          reason: evt.reason,
          willReconnect,
        });

        if (willReconnect) {
          reconnectAttempt++;
          const delay = Math.min(
            WS_RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt - 1) + Math.random() * 500,
            WS_RECONNECT_MAX_MS,
          );
          this.emit('ws:reconnecting', { runId, attempt: reconnectAttempt, delayMs: delay });
          reconnectTimer = setTimeout(connect, delay);
        } else {
          this._sockets.delete(runId);
        }
      };
    };

    connect();

    const handle = {
      get ws() {
        return ws;
      },
      close: () => {
        intentionallyClosed = true;
        clearTimers();
        if (ws && ws.readyState !== WebSocket.CLOSED) {
          ws.close(1000, 'Client closed');
        }
        this._sockets.delete(runId);
      },
    };

    this._sockets.set(runId, handle);
    return handle;
  }

  /**
   * Disconnect a specific WebSocket by runId, or all WebSockets.
   */
  disconnectWebSocket(runId) {
    if (runId) {
      const handle = this._sockets.get(runId);
      if (handle) handle.close();
    } else {
      for (const [, handle] of this._sockets) {
        handle.close();
      }
      this._sockets.clear();
    }
  }

  /**
   * Check if a WebSocket is currently connected for a given runId.
   */
  isWebSocketConnected(runId) {
    const handle = this._sockets.get(runId);
    return handle?.ws?.readyState === WebSocket.OPEN;
  }

  // ── Server availability ──────────────────────────────────────────

  /**
   * Check if the API server is reachable.
   * Uses a short timeout to avoid blocking.
   */
  async isAvailable() {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ── Singleton instance ───────────────────────────────────────────────

export const api = new GhostBoardAPI();

// ── Static file fallback loaders ─────────────────────────────────────
// Used when the API server is unavailable and the dashboard reads
// pre-generated JSON files from the outputs/ directory.
// Falls back to demo data if static files are also unavailable.

async function loadStaticFile(filePath) {
  const res = await fetch(filePath);
  if (!res.ok) throw new Error(`No static data available at ${filePath}`);
  return res.json();
}

export async function loadStaticTrace() {
  try {
    return await loadStaticFile('/outputs/trace.json');
  } catch {
    return DEMO_TRACE;
  }
}

export async function loadStaticDiscussion() {
  try {
    return await loadStaticFile('/outputs/board_discussion.json');
  } catch {
    return DEMO_DISCUSSION;
  }
}

export async function loadStaticSimulation() {
  try {
    return await loadStaticFile('/outputs/simulation_results.json');
  } catch {
    return DEMO_SIMULATION;
  }
}

export async function loadStaticSimulationGeo() {
  try {
    return await loadStaticFile('/outputs/simulation_geo.json');
  } catch {
    return DEMO_GEO;
  }
}

// ── Backward-compatible named exports ────────────────────────────────
// These wrap the singleton so existing screen components continue to work
// without any import changes.

/**
 * Start a new sprint with the given concept.
 * POST /api/sprint
 * Falls back to returning a demo run ID when API is unavailable.
 */
export async function startSprint(concept, options = {}) {
  try {
    return await api.launchSprint(concept, options.sim_scale || 'demo', options);
  } catch {
    // Return demo run so the dashboard can proceed with demo data
    return { run_id: 'demo', status: 'completed', concept: concept || DEMO_RUN.concept };
  }
}

/**
 * Get all sprint runs.
 * GET /api/runs
 */
export async function getRuns() {
  return api.getRuns();
}

/**
 * Get a specific sprint run by ID.
 * GET /api/runs/:id
 */
export async function getRun(runId) {
  return api.getRun(runId);
}

/**
 * Get the event trace for a specific run.
 * GET /api/runs/:id/trace
 */
export async function getRunTrace(runId) {
  return api.getTrace(runId);
}

/**
 * Get board discussion for a specific run.
 * GET /api/runs/:id/board-discussion
 */
export async function getRunDiscussion(runId) {
  return api.getDiscussion(runId);
}

/**
 * Get simulation results for a specific run.
 * GET /api/runs/:id/simulation
 */
export async function getRunSimulation(runId) {
  return api.getSimulation(runId);
}

/**
 * Get simulation geo data for a specific run (globe visualization).
 * Extracts the geo field from the combined simulation endpoint.
 * GET /api/runs/:id/simulation -> .geo
 */
export async function getRunSimulationGeo(runId) {
  const data = await api.getSimulation(runId);
  return data?.geo || DEMO_GEO;
}

/**
 * Get sprint artifacts (prototype, financial model, GTM, compliance).
 * GET /api/runs/:id/artifacts
 */
export async function getRunArtifacts(runId) {
  return api.getArtifacts(runId);
}

/**
 * Get sprint report.
 * GET /api/runs/:id/sprint-report
 */
export async function getRunReport(runId) {
  return api.getReport(runId);
}

/**
 * Create or subscribe to a shared live WebSocket for a sprint run.
 * Returns a small handle with `close()` and `readyState`.
 *
 * Usage:
 *   const ws = connectLive('run-123', {
 *     onEvent: (event) => console.log(event),
 *     onClose: () => console.log('closed'),
 *     onError: (err) => console.error(err),
 *   });
 *   // later: ws.close();
 */
export function connectLive(runId, { onEvent, onClose, onError, onOpen } = {}) {
  if (!runId) {
    throw new Error('connectLive requires a runId');
  }

  let entry = sharedLiveSockets.get(runId);
  if (!entry || entry.ws.readyState >= WebSocket.CLOSING) {
    const ws = new WebSocket(resolveWsUrl(api.baseUrl, runId));
    entry = { ws, subscribers: new Set(), heartbeatTimer: null };
    sharedLiveSockets.set(runId, entry);

    ws.onopen = () => {
      if (entry.heartbeatTimer) {
        clearInterval(entry.heartbeatTimer);
      }
      entry.heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send('ping');
          } catch {
            // Ignore keepalive send errors; close handlers take over.
          }
        }
      }, WS_HEARTBEAT_INTERVAL_MS);
      for (const subscriber of entry.subscribers) {
        subscriber.onOpen?.();
      }
    };

    ws.onmessage = (msg) => {
      try {
        const rawEvent = JSON.parse(msg.data);
        if (rawEvent?.type === 'pong') {
          return;
        }
        const event = normalizeLiveEvent(rawEvent);
        for (const subscriber of entry.subscribers) {
          subscriber.onEvent?.(event);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = (err) => {
      for (const subscriber of entry.subscribers) {
        subscriber.onError?.(err);
      }
    };

    ws.onclose = (evt) => {
      if (entry.heartbeatTimer) {
        clearInterval(entry.heartbeatTimer);
        entry.heartbeatTimer = null;
      }
      sharedLiveSockets.delete(runId);
      const subscribers = [...entry.subscribers];
      entry.subscribers.clear();
      for (const subscriber of subscribers) {
        subscriber.onClose?.(evt);
      }
    };
  }

  const subscriber = { onEvent, onClose, onError, onOpen };
  entry.subscribers.add(subscriber);

  if (entry.ws.readyState === WebSocket.OPEN) {
    queueMicrotask(() => {
      if (entry.subscribers.has(subscriber)) {
        subscriber.onOpen?.();
      }
    });
  }

  return {
    close() {
      if (!entry.subscribers.delete(subscriber)) {
        return;
      }
      if (!entry.subscribers.size) {
        sharedLiveSockets.delete(runId);
        if (entry.heartbeatTimer) {
          clearInterval(entry.heartbeatTimer);
          entry.heartbeatTimer = null;
        }
        if (entry.ws.readyState < WebSocket.CLOSING) {
          entry.ws.close(1000, 'No listeners remain');
        }
      }
    },
    get readyState() {
      return entry.ws.readyState;
    },
  };
}

/**
 * Check if the API server is reachable.
 * Returns true if available, false otherwise.
 */
export async function isApiAvailable() {
  return api.isAvailable();
}

export default api;
