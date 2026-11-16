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
  constructor(status, code, message) {
    super(message || code || `Permintaan gagal (${status}).`);
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
  if (!response.ok)
    throw new ApiError(response.status, payload.error, payload.message);
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

export async function warmBackendRequest() {
  return apiRequest("/api/health/db");
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

export async function catalogRequest() {
  return apiRequest("/api/catalog");
}

export async function createProductRequest(product) {
  return apiRequest("/api/products", {
    method: "POST",
    body: JSON.stringify(product),
  });
}

export async function updateProductRequest(productId, changes) {
  return apiRequest(`/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function createCategoryRequest(category) {
  return apiRequest("/api/categories", {
    method: "POST",
    body: JSON.stringify(category),
  });
}

export async function updateCategoryRequest(categoryId, changes) {
  return apiRequest(`/api/categories/${encodeURIComponent(categoryId)}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function adjustStockRequest(productId, stock, reason) {
  return apiRequest(
    `/api/products/${encodeURIComponent(productId)}/stock-adjustments`,
    { method: "POST", body: JSON.stringify({ stock, reason }) },
  );
}

export async function stockOpnamesRequest() {
  return apiRequest("/api/stock-opnames");
}

export async function submitStockOpnameRequest(data) {
  return apiRequest("/api/stock-opnames", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function paymentConfigRequest() {
  return apiRequest("/api/payments/config");
}

export async function salesRequest() {
  return apiRequest("/api/sales");
}

export async function createSaleRequest(data) {
  return apiRequest("/api/sales", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function continuePaymentRequest(saleId) {
  return apiRequest(`/api/sales/${encodeURIComponent(saleId)}/payment-session`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelSaleRequest(saleId) {
  return apiRequest(`/api/sales/${encodeURIComponent(saleId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function refreshPaymentStatusRequest(saleId, verifyProvider = false) {
  const path = `/api/sales/${encodeURIComponent(saleId)}/payment-status`;
  return apiRequest(verifyProvider ? `${path}?verify_provider=1` : path);
}

export function hasAccessToken() {
  return Boolean(accessToken);
}

export function logoutRequest() {
  const request = accessToken
    ? apiRequest("/api/auth/logout", { method: "POST", keepalive: true })
    : Promise.resolve();
  clearAccessToken();
  return request;
}

export function clearAccessToken() {
  accessToken = null;
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // The in-memory token is cleared even when browser storage is unavailable.
  }
}
