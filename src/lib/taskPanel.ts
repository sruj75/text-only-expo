import type {
  TaskPanelRunStatus,
  TaskPanelScheduleBlock,
  TaskPanelSnapshot,
  TaskPanelTask,
  TaskPanelVisibility
} from "../types/chat";

const asString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const asBoolean = (value: unknown): boolean => value === true;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
};

const asTaskStatus = (value: unknown): string => {
  return asString(value) || "todo";
};

const asRunStatus = (value: unknown): TaskPanelRunStatus => {
  if (
    value === "idle" ||
    value === "running" ||
    value === "complete" ||
    value === "error"
  ) {
    return value;
  }
  return "idle";
};

const normalizeTask = (value: unknown, index: number): TaskPanelTask | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const title = asString(record.title) || asString(record.name);
  if (!title) {
    return null;
  }

  return {
    id: asString(record.id) || `task-${index}`,
    title,
    status: asTaskStatus(record.status),
    time_label: asString(record.time_label) || asString(record.timebox_label),
    is_active: asBoolean(record.is_active),
    is_top_essential: asBoolean(record.is_top_essential)
  };
};

const normalizeScheduleBlock = (
  value: unknown,
  index: number
): TaskPanelScheduleBlock | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const title = asString(record.title) || asString(record.task_title);
  const startLabel = asString(record.start_label) || asString(record.start_time);
  const endLabel = asString(record.end_label) || asString(record.end_time);

  if (!title || !startLabel || !endLabel) {
    return null;
  }

  return {
    id: asString(record.id) || `block-${index}`,
    title,
    start_label: startLabel,
    end_label: endLabel,
    task_id: asString(record.task_id),
    status: asString(record.status)
  };
};

export const EMPTY_TASK_PANEL_SNAPSHOT: TaskPanelSnapshot = {
  run_status: "idle",
  active_action: null,
  headline: null,
  tasks: [],
  top_essentials: [],
  schedule: [],
  updated_at: null,
  error_message: null
};

export const normalizeTaskPanelSnapshot = (value: unknown): TaskPanelSnapshot => {
  const record = asRecord(value);
  if (!record) {
    return EMPTY_TASK_PANEL_SNAPSHOT;
  }

  const tasks = Array.isArray(record.tasks)
    ? record.tasks
        .map((task, index) => normalizeTask(task, index))
        .filter((task): task is TaskPanelTask => Boolean(task))
    : [];

  const schedule = Array.isArray(record.schedule)
    ? record.schedule
        .map((block, index) => normalizeScheduleBlock(block, index))
        .filter((block): block is TaskPanelScheduleBlock => Boolean(block))
    : [];

  return {
    run_status: asRunStatus(record.run_status),
    active_action: asString(record.active_action),
    headline: asString(record.headline),
    tasks,
    top_essentials: asStringArray(record.top_essentials),
    schedule,
    updated_at: asString(record.updated_at),
    error_message: asString(record.error_message)
  };
};

const findSnapshotCandidate = (value: unknown): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const looksLikeSnapshot =
    "run_status" in record ||
    "tasks" in record ||
    "schedule" in record ||
    "top_essentials" in record ||
    "active_action" in record ||
    "headline" in record;

  if (looksLikeSnapshot) {
    return record;
  }

  const nestedCandidates = [
    record.task_panel_state,
    record.task_panel,
    record.result,
    record.data
  ];

  for (const candidate of nestedCandidates) {
    const resolved = findSnapshotCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
};

export const extractTaskPanelSnapshot = (value: unknown): TaskPanelSnapshot | null => {
  const candidate = findSnapshotCandidate(value);
  if (!candidate) {
    return null;
  }

  return normalizeTaskPanelSnapshot(candidate);
};

export const getCurrentFocusTitle = (snapshot: TaskPanelSnapshot): string | null => {
  const currentFocusTask =
    snapshot.tasks.find((task) => task.is_active) ||
    snapshot.tasks.find((task) => task.status !== "done") ||
    null;

  return currentFocusTask?.title || null;
};

export const getTaskPanelHeightRatio = (visibility: TaskPanelVisibility): number => {
  return visibility === "expanded" ? 1 : 0;
};
