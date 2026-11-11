const BASE_URL = "http://localhost:5000/api";

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.headers || {}),
    },
  });

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
    throw new Error(
      result?.error ||
        result?.message ||
        `Request failed (${response.status}).`
    );
  }

  return result;
}

// POST: Run Knowledge Reconstruction
export async function reconstructProject(projectId) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }

  return apiRequest(
    `/projects/${encodeURIComponent(projectId)}/reconstruct`,
    {
      method: "POST",
    }
  );
}

// GET: Fetch Project Risk Map
export async function getProjectRiskMap(projectId) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }

  const result = await apiRequest(
    `/projects/${encodeURIComponent(projectId)}/risk-map`
  );

  return result.data ?? result;
}