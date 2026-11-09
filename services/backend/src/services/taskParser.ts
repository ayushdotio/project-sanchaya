import { parse } from "csv-parse/sync";

export interface ParsedTaskRow {
  taskId?: string;
  title: string;
  status?: string;
  owner?: string;
  deadline?: string;
  description?: string;
  blockers?: string;
  [key: string]: string | undefined;
}

export interface TaskParseResult {
  tasks: ParsedTaskRow[];
  serializedContent: string;
  count: number;
}

/**
 * Normalizes and extracts tabular tasks from uploaded CSV task trackers.
 */
export const parseTaskCsv = (buffer: Buffer): TaskParseResult => {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const tasks: ParsedTaskRow[] = records.map((row, index) => {
    // Normalise lowercase keys
    const lowerRow: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      lowerRow[key.toLowerCase().trim()] = value;
    }

    return {
      taskId: lowerRow["task_id"] || lowerRow["id"] || `TSK-${String(index + 1).padStart(3, "0")}`,
      title: lowerRow["title"] || lowerRow["name"] || lowerRow["task"] || "Untitled Task",
      status: lowerRow["status"] || "Unknown",
      owner: lowerRow["owner"] || lowerRow["assignee"] || "Unassigned",
      deadline: lowerRow["deadline"] || lowerRow["due_date"] || lowerRow["due"] || "",
      description: lowerRow["description"] || lowerRow["details"] || "",
      blockers: lowerRow["blockers"] || lowerRow["blocker"] || "",
    };
  });

  // Serialize each task deterministically for substring evidence verification
  const serializedContent = tasks
    .map(
      (t) =>
        `[Task: ${t.taskId}] Title: ${t.title} | Status: ${t.status} | Owner: ${t.owner} | Deadline: ${t.deadline} | Blockers: ${t.blockers || "None"} | Description: ${t.description || "N/A"}`
    )
    .join("\n\n");

  return {
    tasks,
    serializedContent,
    count: tasks.length,
  };
};

