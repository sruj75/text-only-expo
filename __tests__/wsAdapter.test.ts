import { describe, expect, it, vi } from "vitest";

import { createWebSocketChatAdapter, initializeWebSocketSession } from "../src/lib/wsAdapter";
import type { EntryContext, TaskPanelSnapshot } from "../src/types/chat";

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  public readonly url: string;
  public readonly sent: string[] = [];
  public closed = false;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.onopen?.();
    });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  serverSend(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const waitFor = async (predicate: () => boolean, timeoutMs = 600) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const entryContext: EntryContext = {
  source: "manual",
  event_id: null,
  trigger_type: null,
  scheduled_time: null,
  calendar_event_id: null,
  entry_mode: "reactive"
};

const runWith = async (
  userText: string,
  onTaskPanelState?: (snapshot: TaskPanelSnapshot) => void
) => {
  const adapter = createWebSocketChatAdapter({
    backendUrl: "http://localhost:8000",
    deviceId: "device-1",
    sessionId: "session-1",
    timezone: "Asia/Kolkata",
    getEntryContext: () => entryContext,
    onTaskPanelState
  });

  const abortController = new AbortController();
  const runOptions = {
    messages: [
      {
        id: "msg-user-1",
        role: "user",
        createdAt: new Date(),
        content: [{ type: "text", text: userText }]
      }
    ],
    runConfig: {},
    abortSignal: abortController.signal,
    context: {},
    config: {},
    unstable_getMessage: () => ({})
  } as any;

  const stream = adapter.run(runOptions) as AsyncGenerator<any, void, unknown>;
  const updatesPromise = (async () => {
    const updates: any[] = [];
    for await (const update of stream) {
      updates.push(update);
    }
    return updates;
  })();

  await waitFor(() => MockWebSocket.instances.length > 0);
  const ws = MockWebSocket.instances[0];
  await waitFor(() => ws.sent.length >= 1);

  return { ws, updatesPromise };
};

describe("ws adapter", () => {
  it("sends init first and user_message only after session_ready", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    MockWebSocket.instances = [];

    const { ws, updatesPromise } = await runWith("hello there");

    const initFrame = JSON.parse(ws.sent[0]);
    expect(initFrame).toMatchObject({
      type: "init",
      device_id: "device-1",
      session_id: "session-1",
      suppress_startup_on_init: true
    });
    expect(ws.sent).toHaveLength(1);

    ws.serverSend({ type: "session_ready", session_id: "session-1" });
    await waitFor(() => ws.sent.length >= 2);
    const userFrame = JSON.parse(ws.sent[1]);
    expect(userFrame).toMatchObject({ type: "user_message", text: "hello there" });

    ws.serverSend({ type: "assistant_delta", message_id: "a1", delta: "Hi ", text: "Hi " });
    ws.serverSend({ type: "assistant_delta", message_id: "a1", delta: "there", text: "Hi there" });
    ws.serverSend({ type: "assistant_done", message_id: "a1", text: "Hi there" });

    const updates = await updatesPromise;
    expect(updates).toHaveLength(2);
    expect(updates[0].content[0].text).toBe("Hi ");
    expect(updates[1].content[0].text).toBe("Hi there");
  });

  it("throws when server sends error frame", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    MockWebSocket.instances = [];

    const { ws, updatesPromise } = await runWith("hello");
    ws.serverSend({ type: "session_ready", session_id: "session-1" });
    ws.serverSend({ type: "error", code: "adk_error", detail: "boom" });

    await expect(updatesPromise).rejects.toThrow("boom");
  });

  it("forwards task panel snapshots without interrupting text streaming", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    MockWebSocket.instances = [];

    const taskPanelStates: TaskPanelSnapshot[] = [];
    const { ws, updatesPromise } = await runWith("plan my day", (snapshot) => {
      taskPanelStates.push(snapshot);
    });

    ws.serverSend({ type: "session_ready", session_id: "session-1" });
    await waitFor(() => ws.sent.length >= 2);
    ws.serverSend({
      type: "task_panel_state",
      state: {
        run_status: "running",
        active_action: "Capturing tasks",
        headline: "Pulling your next tasks into view",
        tasks: [{ id: "task-1", title: "Write landing page", status: "pending" }],
        top_essentials: ["Write landing page"],
        schedule: [],
        updated_at: "2026-03-06T12:00:00Z",
        error_message: null
      }
    });
    ws.serverSend({ type: "assistant_done", message_id: "a1", text: "Planned." });

    await updatesPromise;

    expect(taskPanelStates).toHaveLength(1);
    expect(taskPanelStates[0]).toMatchObject({
      run_status: "running",
      active_action: "Capturing tasks"
    });
  });

  it("initializes app-open session and waits for startup turn", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    MockWebSocket.instances = [];

    const initPromise = initializeWebSocketSession({
      backendUrl: "http://localhost:8000",
      deviceId: "device-1",
      sessionId: "session-1",
      timezone: "UTC",
      entryContext
    });

    await waitFor(() => MockWebSocket.instances.length > 0);
    const ws = MockWebSocket.instances[0];
    await waitFor(() => ws.sent.length >= 1);
    const initFrame = JSON.parse(ws.sent[0]);
    expect(initFrame.suppress_startup_on_init).toBe(false);

    ws.serverSend({ type: "session_ready", session_id: "session-1" });
    ws.serverSend({ type: "assistant_done", message_id: "startup-1", text: "Let's start." });

    await expect(initPromise).resolves.toEqual({ startupText: "Let's start." });
  });
});
