
const BASE_URL = "http://localhost:5000/api";

// Common API request function
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error || result.message || "Something went wrong."
    );
  }

  return result;
}

// Get all projects of the logged-in user
export async function getProjects() {
  const result = await apiRequest("/projects");

  return result.data || [];
}

// Create a new project (Team Leader only)
export async function createProject(projectData) {
  const result = await apiRequest("/projects", {
    method: "POST",
    body: JSON.stringify({
      name: projectData.name,
      description: projectData.description || "",
      githubRepo: projectData.githubRepo || "",
    }),
  });

  return result.data;
}

// Get details of a particular project
export async function getProjectById(projectId) {
  const result = await apiRequest(`/projects/${projectId}`);

  return result.data;
}
