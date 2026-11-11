/**
 * Sanchaya Central API Client
 * Configurable via Vite environment variables with support for
 * cookies (credentials: "include") and Authorization Bearer headers.
 */

const rawApiUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  ""
)
  .trim()
  .replace(/\/+$/, "");

// ROOT_URL points to host root ("" for same-origin Vercel / Vite proxy, or "https://api.example.com")
const ROOT_URL = rawApiUrl.replace(/\/api\/?$/, "");
// BASE_URL points to API root ("/api" for same-origin Vercel / Vite proxy, or "https://api.example.com/api")
const BASE_URL = ROOT_URL ? `${ROOT_URL}/api` : "/api";

const TOKEN_KEY = "sanchaya_token";
const USER_KEY = "sanchaya_user";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (err) {
    console.warn("Could not save auth token to localStorage:", err);
  }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user) {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch (err) {
    console.warn("Could not save user to localStorage:", err);
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (err) {
    console.warn("Could not clear auth state:", err);
  }
}

/**
 * Core HTTP request handler
 */
export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
  };

  // Only set Content-Type: application/json if not sending FormData
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let fullUrl;
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    fullUrl = endpoint;
  } else if (endpoint === "/health" || endpoint === "health") {
    fullUrl = ROOT_URL ? `${ROOT_URL}/health` : "/health";
  } else {
    const cleanPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    // If cleanPath already begins with /api/, mount onto ROOT_URL to prevent duplicate /api/api/...
    if (cleanPath.startsWith("/api/")) {
      fullUrl = ROOT_URL ? `${ROOT_URL}${cleanPath}` : cleanPath;
    } else {
      fullUrl = `${BASE_URL}${cleanPath}`;
    }
  }

  if (options.params && typeof options.params === "object") {
    const searchParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      fullUrl += (fullUrl.includes("?") ? "&" : "?") + queryString;
    }
  }

  const response = await fetch(fullUrl, {
    ...options,
    credentials: "include",
    headers,
  });

  // Handle binary streams like PDF downloads
  if (options.asBlob) {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(errText || `Download failed with HTTP ${response.status}`);
    }
    return response.blob();
  }

  const responseText = await response.text();
  let result = {};
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }
  }

  if (!response.ok || result?.success === false) {
    const message =
      result?.error ||
      result?.message ||
      (result?.errors ? Object.values(result.errors).flat().join(", ") : "") ||
      `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = result;
    throw error;
  }

  return result;
}

export const client = {
  get: (endpoint, options) => apiRequest(endpoint, { method: "GET", ...options }),
  post: (endpoint, body, options) =>
    apiRequest(endpoint, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
      ...options,
    }),
  patch: (endpoint, body, options) =>
    apiRequest(endpoint, {
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
      ...options,
    }),
  put: (endpoint, body, options) =>
    apiRequest(endpoint, {
      method: "PUT",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
      ...options,
    }),
  del: (endpoint, options) => apiRequest(endpoint, { method: "DELETE", ...options }),
  getBlob: (endpoint, options) =>
    apiRequest(endpoint, { method: "GET", asBlob: true, ...options }),
  getBaseUrl: () => BASE_URL,
  getRootUrl: () => ROOT_URL,
};

export default client;

