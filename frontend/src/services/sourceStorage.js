
const STORAGE_KEY = "sanchaya_project_sources";

export function getSavedSources() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSources(sources) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

export function saveRepository(url) {
  const sources = getSavedSources();

  const repository = {
    id: `repo-${url}`,
    name: url.split("/").filter(Boolean).slice(-2).join("/"),
    url,
    type: "GitHub Repository",
    status: "Connected (Demo)",
    createdAt: new Date().toISOString(),
  };

  const updated = [
    repository,
    ...sources.filter((item) => item.id !== repository.id),
  ];

  saveSources(updated);
  return updated;
}

export function saveUploadedFiles(files) {
  const sources = getSavedSources();

  const newFiles = files.map((file) => ({
    id: `file-${file.id}`,
    name: file.name,
    size: file.size,
    type: file.name.split(".").pop().toUpperCase(),
    category: "Meeting Notes",
    status: "Uploaded (Demo)",
    previewContent: file.previewContent || "",
    previewTruncated: Boolean(file.previewTruncated),
    createdAt: new Date().toISOString(),
  }));

  const updated = [
    ...newFiles.filter(
      (file) => !sources.some((item) => item.id === file.id)
    ),
    ...sources,
  ];

  saveSources(updated);
  return updated;
}

export function removeSavedSource(id) {
  const updated = getSavedSources().filter((item) => item.id !== id);
  saveSources(updated);
  return updated;
}
