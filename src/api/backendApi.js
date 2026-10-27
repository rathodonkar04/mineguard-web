/**
 * MineGuard Backend API Helper
 * Smart India Hackathon 2026 (Problem Statement 26025)
 *
 * Fast non-blocking HTTP client for Node.js Express backend.
 * Uses bounded AbortSignal timeouts (1500ms default) to prevent UI stall during network drops.
 */

export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin)).replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 1500;

const TOKEN_STORAGE_KEY = 'mineguard_jwt_token';
const USER_STORAGE_KEY = 'mineguard_user_session';

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (_e) {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (_e) {}
}

export function getSavedUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
}

export function setSavedUser(user) {
  try {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch (_e) {}
}

export function clearAuthSession() {
  setAuthToken(null);
  setSavedUser(null);
}

export function getAuthHeaders(extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Sign in with username/email & password
 */
export async function loginApi({ username, password }) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: getTimeoutSignal(3000)
    });
    const json = await res.json();
    if (res.ok && json.success && json.token) {
      setAuthToken(json.token);
      setSavedUser(json.user);
    }
    return json;
  } catch (err) {
    return { success: false, error: err.message || 'Network error during sign in.' };
  }
}

/**
 * Register a new administrator, safety officer, or engineer
 */
export async function registerApi({ username, email, password, full_name, role }) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, full_name, role }),
      signal: getTimeoutSignal(4000)
    });
    const json = await res.json();
    if (res.ok && json.success && json.token) {
      setAuthToken(json.token);
      setSavedUser(json.user);
    }
    return json;
  } catch (err) {
    return { success: false, error: err.message || 'Network error during registration.' };
  }
}

/**
 * Get profile of currently authenticated user via JWT
 */
export async function getMeApi() {
  const token = getAuthToken();
  if (!token) return { success: false, user: null };

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(2500)
    });
    if (res.status === 401) {
      clearAuthSession();
      return { success: false, user: null };
    }
    const json = await res.json();
    if (json.success && json.user) {
      setSavedUser(json.user);
    }
    return json;
  } catch (_err) {
    return { success: false, user: getSavedUser() };
  }
}

/**
 * Sign out operator/administrator
 */
export async function logoutApi() {
  try {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(1500)
    });
  } catch (_err) {
    // Ignore network drop on logout
  } finally {
    clearAuthSession();
  }
  return { success: true };
}

function getTimeoutSignal(ms = DEFAULT_TIMEOUT_MS) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Fetch all registered sensor nodes from the backend.
 */
export async function fetchAllSensors() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sensors`, {
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(1500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.success ? json.sensors : null;
  } catch (_err) {
    return null;
  }
}

/**
 * Fetch a single sensor node by ID.
 */
export async function fetchSensor(nodeId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sensors/${nodeId}`, {
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(1500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.success ? json.sensor : null;
  } catch (_err) {
    return null;
  }
}

/**
 * Fetch all alerts from the backend.
 */
export async function fetchAlerts() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/alerts`, {
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(1500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.success ? json.alerts : [];
  } catch (_err) {
    return [];
  }
}

/**
 * Acknowledge a specific alert by ID with operator identification.
 */
export async function acknowledgeAlertApi(alertId, acknowledgedBy = '') {
  try {
    const res = await fetch(`${BACKEND_URL}/api/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ acknowledgedBy }),
      signal: getTimeoutSignal(2500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.success ? json.alert : null;
  } catch (_err) {
    return null;
  }
}

/**
 * Resolve a hazard alert/query with resolution notes, operator name, and timestamp.
 */
export async function resolveAlertApi(alertId, resolutionNotes = '', resolvedBy = '') {
  try {
    const res = await fetch(`${BACKEND_URL}/api/alerts/${alertId}/resolve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ resolutionNotes, resolvedBy }),
      signal: getTimeoutSignal(2500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.success ? json.alert : null;
  } catch (_err) {
    return null;
  }
}

/**
 * Query persistent historical telemetry time-series from PostgreSQL (multi-tier 1H/6H/24H/7D routing)
 */
export async function fetchTelemetryHistory(params = {}) {
  const { range = '24h', nodeId = 'all', limit = 1000, downsample = true } = params;
  try {
    const url = new URL(`${BACKEND_URL}/api/history`);
    url.searchParams.set('range', range);
    url.searchParams.set('nodeId', nodeId);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('downsample', String(downsample));

    const res = await fetch(url.toString(), {
      signal: getTimeoutSignal(2500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return { success: false, data: [], source: 'fallback' };
  }
}

/**
 * Query historical telemetry statistics
 */
export async function fetchHistoryStats(params = {}) {
  const { range = '24h', nodeId = 'all' } = params;
  try {
    const url = new URL(`${BACKEND_URL}/api/history/stats`);
    url.searchParams.set('range', range);
    url.searchParams.set('nodeId', nodeId);

    const res = await fetch(url.toString(), {
      signal: getTimeoutSignal(2000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return { success: false, stats: null, source: 'fallback' };
  }
}

/**
 * Query historical AI anomaly & risk progression from PostgreSQL/Supabase
 */
export async function fetchRiskHistory(params = {}) {
  const { range = '24h', nodeId = 'all', riskLevel = 'all', limit = 500, downsample = true } = params;
  try {
    const url = new URL(`${BACKEND_URL}/api/history/risk`);
    url.searchParams.set('range', range);
    url.searchParams.set('nodeId', nodeId);
    url.searchParams.set('riskLevel', riskLevel);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('downsample', String(downsample));

    const res = await fetch(url.toString(), {
      signal: getTimeoutSignal(2500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return { success: false, data: [], source: 'fallback' };
  }
}

/**
 * Query latest persistent risk analysis for all registered nodes
 */
export async function fetchLatestRisk() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/history/risk/latest`, {
      signal: getTimeoutSignal(2000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return { success: false, nodes: [] };
  }
}

/**
 * Query aggregate risk statistics from PostgreSQL/Supabase
 */
export async function fetchRiskStats(params = {}) {
  const { range = '24h', nodeId = 'all' } = params;
  try {
    const url = new URL(`${BACKEND_URL}/api/history/risk/stats`);
    url.searchParams.set('range', range);
    url.searchParams.set('nodeId', nodeId);

    const res = await fetch(url.toString(), {
      signal: getTimeoutSignal(2000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return { success: false, stats: null, source: 'fallback' };
  }
}

/**
 * Query full diagnostic details & 16-feature snapshot for a specific risk event
 */
export async function fetchRiskDetail(riskId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/history/risk/${riskId}`, {
      signal: getTimeoutSignal(2000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return { success: false, risk: null };
  }
}

/**
 * Query database storage diagnostics & multi-node scaling estimates
 */
export async function fetchStorageEstimates() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/history/storage`, {
      signal: getTimeoutSignal(2000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Query historical alerts log
 */
export async function fetchAlertsHistory(params = {}) {
  const { range = '7d', severity = 'all', limit = 100 } = params;
  try {
    const url = new URL(`${BACKEND_URL}/api/history/alerts`);
    url.searchParams.set('range', range);
    url.searchParams.set('severity', severity);
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), {
      signal: getTimeoutSignal(2000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return { success: false, alerts: [] };
  }
}

/**
 * Trigger simulation step on backend
 */
export async function triggerSimulateStep(step) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/demo/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
      signal: getTimeoutSignal(2000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return null;
  }
}

/**
 * Reset all nodes to baseline on backend
 */
export async function triggerResetDemo() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/demo/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: getTimeoutSignal(2000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return null;
  }
}

/**
 * Fetch baseline geotechnical parameters & constraints
 */
export async function fetchGeotechnicalParameters() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/forecast/parameters`, {
      signal: getTimeoutSignal(2500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return { success: false, error: _err.message };
  }
}

/**
 * Fetch live forward geotechnical subsidence forecast
 */
export async function fetchSubsidenceForecast(nodeId = 'N3') {
  try {
    const url = new URL(`${BACKEND_URL}/api/forecast/subsidence`);
    url.searchParams.set('nodeId', nodeId);
    const res = await fetch(url.toString(), {
      signal: getTimeoutSignal(2500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return { success: false, error: _err.message };
  }
}

/**
 * Post interactive geotechnical calculation simulation
 */
export async function simulateGeotechnicalForecast(payload) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/forecast/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: getTimeoutSignal(3000)
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (_err) {
    return { ok: false, status: 500, data: { success: false, errors: [_err.message] } };
  }
}

/**
 * Fetch recorded alert dispatch log history
 */
export async function fetchAlertDispatches({ channel, limit = 50 } = {}) {
  try {
    const url = new URL(`${BACKEND_URL}/api/alerts/dispatches`);
    if (channel) url.searchParams.set('channel', channel);
    if (limit) url.searchParams.set('limit', limit.toString());
    const res = await fetch(url.toString(), {
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(2500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message, logs: [] };
  }
}

/**
 * Fetch current alert dispatch configuration & provider status
 */
export async function fetchDispatchConfig() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/alerts/dispatch-config`, {
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(2500)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update dispatch configuration (simulation mode, enabled flag, cooldown)
 */
export async function updateDispatchConfigApi(patch) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/alerts/dispatch-config`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
      signal: getTimeoutSignal(3000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Trigger manual test notification dispatch (Email or SMS)
 */
export async function triggerTestDispatch({ channel = 'EMAIL', recipient } = {}) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/alerts/test-dispatch`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ channel, recipient }),
      signal: getTimeoutSignal(4000)
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 500, data: { success: false, error: err.message } };
  }
}

/**
 * Fetch all registered users (Administrator only)
 */
export async function fetchUsersList() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/users`, {
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(3000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message, users: [] };
  }
}

/**
 * Update user role (Administrator only)
 */
export async function updateUserRoleApi(userId, role) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/users/${userId}/role`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ role }),
      signal: getTimeoutSignal(3000)
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 500, data: { success: false, error: err.message } };
  }
}

/**
 * Update user active status (Administrator only)
 */
export async function updateUserStatusApi(userId, isActive) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/users/${userId}/status`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ is_active: isActive }),
      signal: getTimeoutSignal(3000)
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 500, data: { success: false, error: err.message } };
  }
}

/**
 * Fetch immutable audit logs (Auditors, Regulators, Administrators)
 */
export async function fetchAuditLogsApi({ action, role, username, limit = 50, offset = 0 } = {}) {
  try {
    const url = new URL(`${BACKEND_URL}/api/reports/audit/logs`);
    if (action) url.searchParams.set('action', action);
    if (role) url.searchParams.set('role', role);
    if (username) url.searchParams.set('username', username);
    if (limit) url.searchParams.set('limit', limit.toString());
    if (offset) url.searchParams.set('offset', offset.toString());

    const res = await fetch(url.toString(), {
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(3000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message, logs: [] };
  }
}

/**
 * Build download URL for compliance report export
 */
export function getExportReportUrl({ type = 'alerts', format = 'csv' } = {}) {
  const url = new URL(`${BACKEND_URL}/api/reports/export`);
  url.searchParams.set('type', type);
  url.searchParams.set('format', format);
  const token = getAuthToken();
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Trigger client-side download of statutory compliance report (CSV or JSON)
 */
export async function downloadComplianceReport({ type = 'alerts', format = 'csv' } = {}) {
  try {
    const url = new URL(`${BACKEND_URL}/api/reports/export`);
    url.searchParams.set('type', type);
    url.searchParams.set('format', format);

    const res = await fetch(url.toString(), {
      headers: getAuthHeaders(),
      signal: getTimeoutSignal(8000)
    });

    if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `mineguard_${type}_report_${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}



