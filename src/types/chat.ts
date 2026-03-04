export type EntryMode = "reactive" | "proactive";
export type TriggerType =
  | "before_task"
  | "transition"
  | "after_task"
  | "post_onboarding"
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
  playbook: Record<string, unknown>;
  health_anchors: string[];
  onboarding_status: string;
};

export type ChatRole = "user" | "assistant" | "system" | "event";

export type StoredMessage = {
  id: string;
  session_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ThreadSummary = {
  session_id: string;
  date: string;
  title: string;
  updated_at: string;
  state: Record<string, unknown>;
};

export type BootstrapResponse = {
  device_id: string;
  user_id: string;
  timezone: string;
  session_id: string;
  threads: ThreadSummary[];
  messages: StoredMessage[];
  needs_onboarding: boolean;
  profile_context: ProfileContext;
};
