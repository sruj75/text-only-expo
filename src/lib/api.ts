import type {
  BootstrapResponse,
  EntryContext,
  ProfileContext,
  SessionOpenResponse,
  StoredMessage,
  ThreadSummary,
} from "../types/chat";

type BootstrapPayload = {
  device_id: string;
  timezone: string;
  session_id?: string;
  entry_context?: EntryContext;
};

type CreateThreadPayload = {
  device_id: string;
  timezone: string;
  title?: string;
};

type PushTokenPayload = {
  device_id: string;
  expo_push_token: string;
  timezone: string;
};

type CompleteOnboardingPayload = {
  device_id: string;
  timezone: string;
  wake_time: string;
  bedtime: string;
  playbook: string;
  health_anchors: string[];
};

type SessionOpenPayload = {
  device_id: string;
  timezone: string;
  session_id?: string;
  entry_context?: EntryContext;
  source: "manual" | "push";
  cursor?: string | null;
};

export type TaskManagementAction =
  | "capture_tasks"
  | "get_tasks"
  | "set_top_essentials"
  | "timebox_task"
  | "get_schedule"
  | "update_task_status";

type TaskManagementPayload = {
  device_id: string;
  timezone: string;
  session_id?: string;
  action: TaskManagementAction;
  payload?: Record<string, unknown>;
};

const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, "");

const request = async <T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${trimTrailingSlashes(baseUrl)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
};

export const bootstrapDevice = async (
  baseUrl: string,
  payload: BootstrapPayload,
): Promise<BootstrapResponse> => {
  return request<BootstrapResponse>(baseUrl, "/agent/bootstrap-device", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const fetchThreads = async (
  baseUrl: string,
  deviceId: string,
): Promise<ThreadSummary[]> => {
  const result = await request<{ threads: ThreadSummary[] }>(
    baseUrl,
    `/agent/threads?device_id=${encodeURIComponent(deviceId)}`,
  );
  return result.threads;
};

export const fetchThreadMessages = async (
  baseUrl: string,
  sessionId: string,
  deviceId: string,
): Promise<StoredMessage[]> => {
  const result = await request<{ cursor?: string | null; messages: StoredMessage[] }>(
    baseUrl,
    `/agent/threads/${encodeURIComponent(sessionId)}/messages?device_id=${encodeURIComponent(deviceId)}`,
  );
  return result.messages;
};

export const openSession = async (
  baseUrl: string,
  payload: SessionOpenPayload,
): Promise<SessionOpenResponse> => {
  return request<SessionOpenResponse>(baseUrl, "/agent/session/open", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const createThread = async (
  baseUrl: string,
  payload: CreateThreadPayload,
): Promise<ThreadSummary> => {
  const result = await request<{ thread: ThreadSummary }>(baseUrl, "/agent/threads", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return result.thread;
};

export const registerPushToken = async (
  baseUrl: string,
  payload: PushTokenPayload,
): Promise<{ status: string }> => {
  return request<{ status: string }>(baseUrl, "/agent/push-token", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const completeOnboarding = async (
  baseUrl: string,
  payload: CompleteOnboardingPayload,
): Promise<{ status: string; needs_onboarding: boolean; profile_context: ProfileContext }> => {
  return request<{ status: string; needs_onboarding: boolean; profile_context: ProfileContext }>(
    baseUrl,
    "/agent/onboarding/complete",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
};

export const taskManagementAction = async (
  baseUrl: string,
  payload: TaskManagementPayload,
): Promise<Record<string, unknown>> => {
  return request<Record<string, unknown>>(baseUrl, "/agent/task-management", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      payload: payload.payload || {},
    }),
  });
};
