import type { EntryIntent } from "../types/chat";

export const FOREGROUND_RESET_THRESHOLD_MS = 5 * 60 * 1000;
export const INTENT_RECENCY_THRESHOLD_MS = 5 * 60 * 1000;

export const shouldResetVisibleConversation = (
  awayForMs: number,
  thresholdMs = FOREGROUND_RESET_THRESHOLD_MS
): boolean => {
  return awayForMs >= thresholdMs;
};

export const isFreshIntentTimestamp = (
  timestampMs: number | null,
  nowMs = Date.now(),
  recencyThresholdMs = INTENT_RECENCY_THRESHOLD_MS
): boolean => {
  if (timestampMs === null) {
    return false;
  }
  return nowMs - timestampMs <= recencyThresholdMs;
};

const parseIntentTimestampMs = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
};

export const normalizeRealtimeIntent = (
  intent: EntryIntent,
  nowMs = Date.now()
): EntryIntent => {
  if (intent.entry_context.entry_mode !== "proactive") {
    return intent;
  }
  const scheduledTimestamp = parseIntentTimestampMs(intent.entry_context.scheduled_time);
  if (isFreshIntentTimestamp(scheduledTimestamp, nowMs)) {
    return intent;
  }
  return {
    ...intent,
    entry_context: {
      ...intent.entry_context,
      event_id: null,
      trigger_type: null,
      scheduled_time: null,
      calendar_event_id: null,
      entry_mode: "reactive",
    },
  };
};
