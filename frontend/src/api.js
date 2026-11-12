const defaultApiBaseUrl = window.location.port === "8080"
  ? "http://127.0.0.1:5000"
  : "";
const API_BASE_URL = (
  window.RITELY_API_BASE_URL || defaultApiBaseUrl
).replace(/\/$/, "");

const TOKEN_STORAGE_KEY = "ritely_access_token";

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token) {
  accessToken = token;
  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Keep the in-memory session when browser storage is unavailable.
  }
}

let accessToken = readStoredToken();

export class ApiError extends Error {
  constructor(status, code) {
    super(code || `Permintaan gagal (${status}).`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(0, "server_unreachable");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload.error);
  return payload;
}

export async function loginRequest(username, password) {
  const result = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  storeToken(result.access_token);
  return result.user;
}

export async function currentUserRequest() {
  const result = await apiRequest("/api/auth/me");
  return result.user;
}

export async function shiftsRequest() {
  return apiRequest("/api/shifts");
}

export async function openShiftRequest() {
  return apiRequest("/api/shifts/open", { method: "POST" });
}

export async function closeShiftRequest(shiftId, reason = "") {
  return apiRequest(`/api/shifts/${encodeURIComponent(shiftId)}/close`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function hasAccessToken() {
  return Boolean(accessToken);
}

export async function logoutRequest() {
  try {
    if (accessToken) {
      await apiRequest("/api/auth/logout", { method: "POST" });
    }
  } finally {
    clearAccessToken();
  }
}

export function clearAccessToken() {
  accessToken = null;
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // The in-memory token is cleared even when browser storage is unavailable.
  }
}
