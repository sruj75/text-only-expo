import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bootstrapDevice,
  completeOnboarding,
  createThread,
  fetchThreadMessages,
  fetchThreads,
  openSession,
  registerPushToken,
  taskManagementAction
} from "../src/lib/api";

const mockFetch = vi.fn();

vi.stubGlobal("fetch", mockFetch);

describe("api client", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it("bootstraps device with expected payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ session_id: "s1" })
    });

    await bootstrapDevice("http://localhost:8000/", {
      device_id: "device-1",
      timezone: "Asia/Kolkata"
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/agent/bootstrap-device");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      device_id: "device-1",
      timezone: "Asia/Kolkata"
    });
  });

  it("fetches thread list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ threads: [{ session_id: "s-1" }] })
    });

    const result = await fetchThreads("http://localhost:8000", "device-2");

    expect(result).toEqual([{ session_id: "s-1" }]);
    expect(mockFetch.mock.calls[0][0]).toBe(
      "http://localhost:8000/agent/threads?device_id=device-2"
    );
  });

  it("encodes session id when fetching messages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] })
    });

    await fetchThreadMessages("http://localhost:8000", "session/with/slash", "d3");

    expect(mockFetch.mock.calls[0][0]).toBe(
      "http://localhost:8000/agent/threads/session%2Fwith%2Fslash/messages?device_id=d3"
    );
  });

  it("creates a new thread", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ thread: { session_id: "manual-1" } })
    });

    const result = await createThread("http://localhost:8000", {
      device_id: "d4",
      timezone: "UTC",
      title: "My thread"
    });

    expect(result).toEqual({ session_id: "manual-1" });
  });

  it("throws clear error when backend returns non-2xx", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "service down"
    });

    await expect(fetchThreads("http://localhost:8000", "d5")).rejects.toThrow(
      "Request failed (503): service down"
    );
  });

  it("registers push token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" })
    });

    await registerPushToken("http://localhost:8000", {
      device_id: "device-9",
      expo_push_token: "ExponentPushToken[abc]",
      timezone: "Asia/Kolkata"
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/agent/push-token");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      device_id: "device-9",
      expo_push_token: "ExponentPushToken[abc]",
      timezone: "Asia/Kolkata"
    });
  });

  it("submits onboarding form", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", needs_onboarding: false, profile_context: {} })
    });

    await completeOnboarding("http://localhost:8000", {
      device_id: "device-10",
      timezone: "Asia/Kolkata",
      wake_time: "07:30",
      bedtime: "23:30",
      playbook: "Help me start tiny when I am stuck",
      health_anchors: ["Breakfast", "Walk"]
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/agent/onboarding/complete");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      device_id: "device-10",
      timezone: "Asia/Kolkata",
      wake_time: "07:30",
      bedtime: "23:30",
      playbook: "Help me start tiny when I am stuck",
      health_anchors: ["Breakfast", "Walk"]
    });
  });

  it("opens session with durable startup contract", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ session_id: "s-open", messages_delta: [], message_cursor: null })
    });

    await openSession("http://localhost:8000", {
      device_id: "device-12",
      timezone: "UTC",
      session_id: "session-12",
      entry_context: {
        source: "manual",
        event_id: null,
        trigger_type: null,
        scheduled_time: null,
        calendar_event_id: null,
        entry_mode: "reactive"
      },
      source: "manual",
      cursor: null
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/agent/session/open");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      device_id: "device-12",
      timezone: "UTC",
      session_id: "session-12",
      entry_context: {
        source: "manual",
        event_id: null,
        trigger_type: null,
        scheduled_time: null,
        calendar_event_id: null,
        entry_mode: "reactive"
      },
      source: "manual",
      cursor: null
    });
  });

  it("calls task-management endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { action: "get_tasks" } })
    });

    await taskManagementAction("http://localhost:8000", {
      device_id: "device-11",
      timezone: "UTC",
      action: "get_tasks"
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/agent/task-management");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      device_id: "device-11",
      timezone: "UTC",
      action: "get_tasks",
      payload: {}
    });
  });
});
