export type EntryMode = "reactive" | "proactive";
export type TriggerType =
  | "before_task"
  | "transition"
  | "after_task"
  | "checkin"
  | string;

export type EntryContext = {
  source: "manual" | "push";
  event_id: string | null;
  trigger_type: TriggerType | null;
  scheduled_time: string | null;
  calendar_event_id: string | null;
  entry_mode: EntryMode;
};

export type EntryIntent = {
  session_id?: string;
  entry_context: EntryContext;
};

export type ProfileContext = {
  wake_time: string | null;
  bedtime: string | null;
  onboarding_status: string;
};

export type ChatRole = "user" | "assistant" | "system" | "event";

export type TaskPanelVisibility = "closed" | "expanded";
export type TaskPanelRunStatus = "idle" | "running" | "complete" | "error";

export type TaskPanelTask = {
  id: string;
  title: string;
  status: string;
  time_label: string | null;
  is_active: boolean;
};

export type TaskPanelScheduleBlock = {
  id: string;
  title: string;
  start_label: string;
  end_label: string;
  task_id: string | null;
  status: string | null;
};

export type TaskPanelSnapshot = {
  run_status: TaskPanelRunStatus;
  active_action: string | null;
  headline: string | null;
  tasks: TaskPanelTask[];
  schedule: TaskPanelScheduleBlock[];
  updated_at: string | null;
  error_message: string | null;
  last_action_summary: string | null;
};

export type StoredMessage = {
  id: string;
  session_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SessionOpenResponse = {
  session_id: string;
  startup_status: string;
  messages: StoredMessage[];
  needs_onboarding: boolean;
  profile_context: ProfileContext;
  task_panel_state: TaskPanelSnapshot;
  release_id?: string;
  contract_version?: string;
};
