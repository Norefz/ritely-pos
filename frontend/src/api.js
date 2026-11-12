const defaultApiBaseUrl = window.location.port === "8080"
  ? "http://127.0.0.1:5000"
  : "";
const API_BASE_URL = (
  window.RITELY_API_BASE_URL || defaultApiBaseUrl
).replace(/\/$/, "");

let accessToken = null;

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
  accessToken = result.access_token;
  return result.user;
}

export async function logoutRequest() {
  try {
    if (accessToken) {
      await apiRequest("/api/auth/logout", { method: "POST" });
    }
  } finally {
    accessToken = null;
  }
}

export function clearAccessToken() {
  accessToken = null;
}
