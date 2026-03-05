import { describe, expect, it, vi } from "vitest";

import { createWebSocketChatAdapter } from "../src/lib/wsAdapter";
import type { EntryContext } from "../src/types/chat";

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

  serverError() {
    this.onerror?.();
  }
}

const waitFor = async (predicate: () => boolean, timeoutMs = 500) => {
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

const runWith = async (userText: string) => {
  const adapter = createWebSocketChatAdapter({
    backendUrl: "http://localhost:8000",
    deviceId: "device-1",
    sessionId: "session-1",
    timezone: "Asia/Kolkata",
    getEntryContext: () => entryContext
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
  await waitFor(() => ws.sent.length >= 2);

  return { ws, updatesPromise };
};

describe("ws adapter", () => {
  it("sends init + user_message and streams assistant deltas", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    MockWebSocket.instances = [];

    const { ws, updatesPromise } = await runWith("hello there");

    const sentFrames = ws.sent.map((frame) => JSON.parse(frame));
    expect(sentFrames[0]).toMatchObject({
      type: "init",
      device_id: "device-1",
      session_id: "session-1"
    });
    expect(sentFrames[1]).toMatchObject({
      type: "user_message",
      text: "hello there"
    });

    ws.serverSend({ type: "session_ready", session_id: "session-1" });
    ws.serverSend({ type: "assistant_delta", message_id: "a1", delta: "Hi ", text: "Hi " });
    ws.serverSend({ type: "assistant_delta", message_id: "a1", delta: "there", text: "Hi there" });
    ws.serverSend({ type: "assistant_done", message_id: "a1", text: "Hi there" });

    const updates = await updatesPromise;
    expect(updates).toHaveLength(2);
    expect(updates[0].content[0].text).toBe("Hi ");
    expect(updates[1].content[0].text).toBe("Hi there");
  });

  it("uses the latest user message text when multiple messages exist (regression)", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    MockWebSocket.instances = [];

    const adapter = createWebSocketChatAdapter({
      backendUrl: "http://localhost:8000",
      deviceId: "device-1",
      sessionId: "session-1",
      timezone: "UTC",
      getEntryContext: () => entryContext
    });

    const abortController = new AbortController();
    const runOptions = {
      messages: [
        {
          id: "old-user",
          role: "user",
          createdAt: new Date(),
          content: [{ type: "text", text: "old" }]
        },
        {
          id: "assistant-1",
          role: "assistant",
          createdAt: new Date(),
          content: [{ type: "text", text: "ack" }]
        },
        {
          id: "new-user",
          role: "user",
          createdAt: new Date(),
          content: [{ type: "text", text: "newest" }]
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
      for await (const update of stream) {
        void update;
      }
    })();

    await waitFor(() => MockWebSocket.instances.length > 0);
    const ws = MockWebSocket.instances[0];
    await waitFor(() => ws.sent.length >= 2);

    const userMessageFrame = JSON.parse(ws.sent[1]);
    expect(userMessageFrame.text).toBe("newest");

    ws.serverSend({ type: "session_ready", session_id: "session-1" });
    ws.serverSend({ type: "assistant_done", message_id: "a1", text: "ok" });

    await updatesPromise;
  });

  it("throws when server sends error frame", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    MockWebSocket.instances = [];

    const { ws, updatesPromise } = await runWith("hello");

    ws.serverSend({ type: "session_ready", session_id: "session-1" });
    ws.serverSend({ type: "error", code: "adk_error", detail: "boom" });

    await expect(updatesPromise).rejects.toThrow("boom");
  });
});
