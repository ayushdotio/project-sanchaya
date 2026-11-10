
const STORAGE_KEY = "sanchaya_project_sources";

/**
 * Read the saved source value from localStorage. Missing data, storage read
 * errors, and invalid JSON return an empty array; valid JSON is returned as parsed.
 */
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

/**
 * Save demo repository metadata in localStorage and return the updated list.
 * An existing entry with the same URL-derived ID is replaced. The URL is not
 * validated here and no repository is contacted.
 *
 * Storage write errors and errors caused by incompatible saved data propagate.
 */
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

/**
 * Save demo file metadata and supplied preview text in localStorage, then return
 * the updated list. File contents are not uploaded. Each file's size is in bytes;
 * IDs already in storage are skipped, while duplicates in the input are retained.
 *
 * Storage write errors and errors caused by incompatible saved data propagate.
 */
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

/**
 * Remove entries with the given ID from localStorage and return the updated list.
 * Storage write errors and errors caused by incompatible saved data propagate.
 */
export function removeSavedSource(id) {
  const updated = getSavedSources().filter((item) => item.id !== id);
  saveSources(updated);
  return updated;
}
