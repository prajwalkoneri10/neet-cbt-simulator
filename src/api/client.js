/**
 * Centralized API Client for NEET CBT Simulator
 * Guarantees consistent URL formatting, eliminates /api/api path duplications,
 * attaches authentication headers, and standardizes error responses.
 */

// Production API base URL from Vite environment variable.
// Convention: Base URL can be configured with or without the /api prefix.
const rawBase = (import.meta.env.VITE_API_URL || "http://localhost:5000/api")
  .trim()
  .replace(/\/+$/, "");

// Normalize to ensure base ends with /api exactly once
export const API_BASE_URL = rawBase.endsWith("/api") ? rawBase : `${rawBase}/api`;

/**
 * Normalizes an endpoint path to prevent duplicate /api prefixes.
 * Examples:
 *   formatUrl('/auth/login')     => 'http://.../api/auth/login'
 *   formatUrl('/api/auth/login') => 'http://.../api/auth/login'
 *   formatUrl('health')          => 'http://.../api/health'
 */
export function formatUrl(endpoint) {
  let cleaned = String(endpoint || "").trim();
  if (!cleaned.startsWith("/")) {
    cleaned = `/${cleaned}`;
  }
  // Strip redundant leading /api if present
  if (cleaned.startsWith("/api/")) {
    cleaned = cleaned.slice(4);
  } else if (cleaned === "/api") {
    cleaned = "";
  }
  return `${API_BASE_URL}${cleaned}`;
}

/**
 * Centralized fetch wrapper with authentication token, JSON parsing,
 * and user-friendly HTTP error handling.
 */
export async function apiRequest(endpoint, options = {}) {
  const url = formatUrl(endpoint);
  const token = localStorage.getItem("neetAuthToken");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const isJson = (response.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await response.json().catch(() => ({})) : {};

    if (!response.ok) {
      // 401 Unauthorized: token expired or invalid
      if (response.status === 401 && endpoint !== "/auth/login" && endpoint !== "/auth/signup") {
        // Clear expired token if server rejected it
        if (localStorage.getItem("neetAuthToken")) {
          console.warn("Authentication token expired or rejected by server.");
        }
      }

      const errorMessage =
        data.error ||
        data.message ||
        (Array.isArray(data.errors) ? data.errors.map((e) => e.message).join("; ") : null) ||
        `Request failed with status ${response.status} (${response.statusText || "Server Error"})`;

      const err = new Error(errorMessage);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (error) {
    if (error.name === "TypeError" && error.message.includes("Failed to fetch")) {
      const friendlyError = new Error(
        `Unable to reach backend server at ${API_BASE_URL}. Please check your connection or verify the backend service is running.`
      );
      friendlyError.isNetworkError = true;
      throw friendlyError;
    }
    throw error;
  }
}

// ----------------------------------------------------
// API Methods
// ----------------------------------------------------

export const api = {
  // Health
  checkHealth: () => apiRequest("/health"),

  // Auth
  auth: {
    signup: ({ name, email, password }) =>
      apiRequest("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      }),
    login: ({ email, password }) =>
      apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    me: () => apiRequest("/auth/me"),
    requestReset: (email) =>
      apiRequest("/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    resetPassword: ({ token, newPassword }) =>
      apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      }),
  },

  // Student Profile
  profile: {
    get: () => apiRequest("/profile"),
    update: (profileData) =>
      apiRequest("/profile", {
        method: "PUT",
        body: JSON.stringify(profileData),
      }),
  },

  // Student Goals & Progress
  goals: {
    get: () => apiRequest("/goals"),
    update: (goalsData) =>
      apiRequest("/goals", {
        method: "PUT",
        body: JSON.stringify(goalsData),
      }),
  },

  // Performance Analytics
  analytics: {
    get: () => apiRequest("/analytics"),
  },

  // Admin Management
  admin: {
    publishQuestions: (data) =>
      apiRequest("/admin/questions/publish", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getStats: () => apiRequest("/admin/stats"),
  },

  // Test Engine & Attempts
  tests: {
    getAvailable: () => apiRequest("/tests/available"),
    createCustom: (customData) =>
      apiRequest("/tests/custom", {
        method: "POST",
        body: JSON.stringify(customData),
      }),
    importPersonalTest: (personalData) =>
      apiRequest("/tests/personal/import", {
        method: "POST",
        body: JSON.stringify(personalData),
      }),
    start: (testId) =>
      apiRequest(`/tests/${testId}/start`, {
        method: "POST",
      }),
    getActiveAttempt: () => apiRequest("/tests/attempts/active"),
    saveProgress: (attemptId, { answers, markedQuestions, visitedQuestions }) =>
      apiRequest(`/tests/attempts/${attemptId}/save-progress`, {
        method: "PUT",
        body: JSON.stringify({ answers, markedQuestions, visitedQuestions }),
      }),
    submit: (attemptId, { finalAnswers = null, reason = "manual" } = {}) =>
      apiRequest(`/tests/attempts/${attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({ finalAnswers, reason }),
      }),
    getResult: (attemptId) => apiRequest(`/tests/attempts/${attemptId}/result`),
    getHistory: () => apiRequest("/tests/attempts/history"),
    compare: (attemptA, attemptB) =>
      apiRequest(`/tests/compare?attemptA=${attemptA}&attemptB=${attemptB}`),
  },

  // Question Bank & CSV Import
  questions: {
    importCSVs: ({
      title,
      description,
      durationMinutes,
      marksPerCorrect,
      marksPerIncorrect,
      questionsCsv,
      answersCsv,
      dryRun = false,
    }) =>
      apiRequest("/questions/import-csv", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          durationMinutes,
          marksPerCorrect,
          marksPerIncorrect,
          questionsCsv,
          answersCsv,
          dryRun,
        }),
      }),
  },

  // Backward compatibility with previous Cloud Sync endpoints
  cloud: {
    getMockTests: () => apiRequest("/cloud/mock-tests"),
    saveMockTest: (mockTest) =>
      apiRequest("/cloud/mock-tests", {
        method: "POST",
        body: JSON.stringify(mockTest),
      }),
    deleteMockTest: (mockId) =>
      apiRequest(`/cloud/mock-tests/${encodeURIComponent(mockId)}`, {
        method: "DELETE",
      }),
    getExamSessions: () => apiRequest("/cloud/exam-sessions"),
    saveExamSession: (examId, sessionData) =>
      apiRequest("/cloud/exam-sessions", {
        method: "POST",
        body: JSON.stringify({ examId, sessionData }),
      }),
    deleteExamSession: (examId) =>
      apiRequest(`/cloud/exam-sessions/${encodeURIComponent(examId)}`, {
        method: "DELETE",
      }),
    getAttemptHistory: () => apiRequest("/cloud/attempt-history"),
    saveAttempt: (attempt) =>
      apiRequest("/cloud/attempt-history", {
        method: "POST",
        body: JSON.stringify(attempt),
      }),
    deleteAttemptHistory: () =>
      apiRequest("/cloud/attempt-history", {
        method: "DELETE",
      }),
  },
};

export default api;
