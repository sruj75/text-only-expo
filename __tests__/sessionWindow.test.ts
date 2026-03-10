import { describe, expect, it } from "vitest";

import {
  FOREGROUND_RESET_THRESHOLD_MS,
  INTENT_RECENCY_THRESHOLD_MS,
  isFreshIntentTimestamp,
  normalizeRealtimeIntent,
  sliceVisibleConversation,
  shouldResetVisibleConversation
} from "../src/lib/sessionWindow";
import type { EntryIntent, StoredMessage } from "../src/types/chat";

describe("session window rules", () => {
  it("starts a new visible chat at or above the 5-minute threshold", () => {
    expect(shouldResetVisibleConversation(FOREGROUND_RESET_THRESHOLD_MS)).toBe(true);
    expect(shouldResetVisibleConversation(FOREGROUND_RESET_THRESHOLD_MS + 1)).toBe(true);
  });

  it("keeps the current visible chat under the 5-minute threshold", () => {
    expect(shouldResetVisibleConversation(FOREGROUND_RESET_THRESHOLD_MS - 1)).toBe(false);
  });

  it("treats recent intents as fresh and old intents as stale", () => {
    const now = Date.now();
    expect(isFreshIntentTimestamp(now - (INTENT_RECENCY_THRESHOLD_MS - 1), now)).toBe(true);
    expect(isFreshIntentTimestamp(now - (INTENT_RECENCY_THRESHOLD_MS + 1), now)).toBe(false);
    expect(isFreshIntentTimestamp(null, now)).toBe(false);
  });

  it("keeps fresh proactive intents proactive", () => {
    const now = Date.now();
    const freshIntent: EntryIntent = {
      entry_context: {
        source: "push",
        event_id: "event-1",
        trigger_type: "before_task",
        scheduled_time: new Date(now - 60_000).toISOString(),
        calendar_event_id: null,
        entry_mode: "proactive",
      },
    };
    expect(normalizeRealtimeIntent(freshIntent, now).entry_context.entry_mode).toBe("proactive");
  });

  it("converts stale proactive intents to reactive", () => {
    const now = Date.now();
    const staleIntent: EntryIntent = {
      entry_context: {
        source: "push",
        event_id: "event-2",
        trigger_type: "before_task",
        scheduled_time: new Date(now - (INTENT_RECENCY_THRESHOLD_MS + 1)).toISOString(),
        calendar_event_id: "calendar-1",
        entry_mode: "proactive",
      },
    };
    const normalized = normalizeRealtimeIntent(staleIntent, now);
    expect(normalized.entry_context.entry_mode).toBe("reactive");
    expect(normalized.entry_context.event_id).toBeNull();
    expect(normalized.entry_context.scheduled_time).toBeNull();
  });

  it("converts proactive intents without scheduled_time to reactive", () => {
    const proactiveWithoutTime: EntryIntent = {
      entry_context: {
        source: "push",
        event_id: "event-3",
        trigger_type: "checkin",
        scheduled_time: null,
        calendar_event_id: null,
        entry_mode: "proactive",
      },
    };
    expect(normalizeRealtimeIntent(proactiveWithoutTime).entry_context.entry_mode).toBe("reactive");
  });

  it("shows only the newest conversation window after the latest startup turn", () => {
    const messages: StoredMessage[] = [
      {
        id: "m1",
        session_id: "s1",
        user_id: "u1",
        role: "assistant",
        content: "older startup",
        metadata: { startup_turn: true },
        created_at: "2026-03-10T09:00:00Z",
      },
      {
        id: "m2",
        session_id: "s1",
        user_id: "u1",
        role: "user",
        content: "old reply",
        metadata: {},
        created_at: "2026-03-10T09:01:00Z",
      },
      {
        id: "m3",
        session_id: "s1",
        user_id: "u1",
        role: "assistant",
        content: "new startup",
        metadata: { startup_turn: true },
        created_at: "2026-03-10T09:10:00Z",
      },
      {
        id: "m4",
        session_id: "s1",
        user_id: "u1",
        role: "user",
        content: "new reply",
        metadata: {},
        created_at: "2026-03-10T09:11:00Z",
      },
    ];

    expect(sliceVisibleConversation(messages).map((message) => message.id)).toEqual(["m3", "m4"]);
  });

  it("keeps all messages when there is no startup turn marker", () => {
    const messages: StoredMessage[] = [
      {
        id: "m1",
        session_id: "s1",
        user_id: "u1",
        role: "assistant",
        content: "hello",
        metadata: {},
        created_at: "2026-03-10T09:00:00Z",
      },
      {
        id: "m2",
        session_id: "s1",
        user_id: "u1",
        role: "user",
        content: "hi",
        metadata: {},
        created_at: "2026-03-10T09:01:00Z",
      },
    ];

    expect(sliceVisibleConversation(messages).map((message) => message.id)).toEqual(["m1", "m2"]);
  });
});
