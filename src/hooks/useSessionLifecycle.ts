import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  openSession,
  registerPushToken,
  startOnboarding,
} from "../lib/api";
import { getOrCreateDeviceContext } from "../lib/device";
import {
  CONTRACT_VERSION,
  RELEASE_ID,
  generateOpenId,
} from "../lib/runtimeContract";
import {
  normalizeRealtimeIntent,
  sliceVisibleConversation,
  shouldResetVisibleConversation,
} from "../lib/sessionWindow";
import type {
  EntryContext,
  EntryIntent,
  ProfileContext,
  SessionOpenResponse,
  StoredMessage,
  TaskPanelSnapshot,
} from "../types/chat";

const MANUAL_CONTEXT: EntryContext = {
  source: "manual",
  event_id: null,
  trigger_type: null,
  scheduled_time: null,
  calendar_event_id: null,
  entry_mode: "reactive",
};

const DEFAULT_PROFILE_CONTEXT: ProfileContext = {
  wake_time: null,
  bedtime: null,
  onboarding_status: "pending",
};

const asString = (value: unknown) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

const parseEntryIntentFromData = (data: Record<string, unknown>): EntryIntent | null => {
  const eventId = asString(data.event_id);
  const triggerType = asString(data.trigger_type) || asString(data.type);
  const sessionId = asString(data.session_id) || undefined;
  const scheduledTime = asString(data.scheduled_time);
  const calendarEventId = asString(data.calendar_event_id);
  const entryModeRaw = asString(data.entry_mode);
  const entryMode = entryModeRaw === "reactive" ? "reactive" : "proactive";

  if (!eventId && !triggerType && !sessionId) {
    return null;
  }

  return {
    session_id: sessionId,
    entry_context: {
      source: "push",
      event_id: eventId,
      trigger_type: triggerType,
      scheduled_time: scheduledTime,
      calendar_event_id: calendarEventId,
      entry_mode: entryMode,
    },
  };
};

const parseEntryIntentFromUrl = (url: string): EntryIntent | null => {
  const parsed = Linking.parse(url);
  const queryParams = parsed.queryParams || {};
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(queryParams)) {
    normalized[key] = Array.isArray(value) ? value[0] : value;
  }
  return parseEntryIntentFromData(normalized);
};

const buildEntryIntentKey = (intent: EntryIntent | null): string | null => {
  if (!intent) {
    return null;
  }
  const context = intent.entry_context;
  return [
    intent.session_id || "",
    context.source,
    context.event_id || "",
    context.trigger_type || "",
    context.scheduled_time || "",
    context.calendar_event_id || "",
    context.entry_mode,
  ].join("|");
};

type UseSessionLifecycleArgs = {
  backendUrl: string;
};

export const useSessionLifecycle = ({ backendUrl }: UseSessionLifecycleArgs) => {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string>("UTC");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [visibleConversationKey, setVisibleConversationKey] = useState<string | null>(null);
  const [visibleMessages, setVisibleMessages] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [pendingEntryIntent, setPendingEntryIntent] = useState<EntryIntent | null>(null);
  const [, setEntryContext] = useState<EntryContext>(MANUAL_CONTEXT);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);
  const [profileContext, setProfileContext] = useState<ProfileContext>(DEFAULT_PROFILE_CONTEXT);
  const [initialTaskPanelState, setInitialTaskPanelState] =
    useState<TaskPanelSnapshot | null>(null);
  const [onboardingStarting, setOnboardingStarting] = useState<boolean>(false);

  const appStateRef = useRef(AppState.currentState);
  const lastBackgroundAtRef = useRef<number | null>(null);
  const sessionRequestTokenRef = useRef<number>(0);
  const pendingSessionOpensRef = useRef<number>(0);
  const lastHandledIntentKeyRef = useRef<string | null>(null);
  const staleSessionFallbackRef = useRef<{
    token: number;
    opened: SessionOpenResponse;
    resolvedEntryContext: EntryContext;
  } | null>(null);
  const [isSessionOpening, setIsSessionOpening] = useState<boolean>(false);

  const markSessionOpenStarted = useCallback(() => {
    pendingSessionOpensRef.current += 1;
    if (pendingSessionOpensRef.current === 1) {
      setIsSessionOpening(true);
    }
  }, []);

  const markSessionOpenFinished = useCallback(() => {
    pendingSessionOpensRef.current = Math.max(0, pendingSessionOpensRef.current - 1);
    if (pendingSessionOpensRef.current === 0) {
      setIsSessionOpening(false);
    }
  }, []);

  const applyOpenedSession = useCallback(
    (opened: SessionOpenResponse, resolvedEntryContext: EntryContext) => {
      const nextNeedsOnboarding = Boolean(opened.needs_onboarding);
      const nextEntryContext = nextNeedsOnboarding ? MANUAL_CONTEXT : resolvedEntryContext;
      const nextMessages = nextNeedsOnboarding
        ? []
        : sliceVisibleConversation(opened.messages || []);
      const nextConversationKey = nextNeedsOnboarding ? null : `${opened.session_id}:${Date.now()}`;

      setActiveThreadId(opened.session_id);
      setVisibleMessages(nextMessages);
      setEntryContext(nextEntryContext);
      setNeedsOnboarding(nextNeedsOnboarding);
      setProfileContext(opened.profile_context || DEFAULT_PROFILE_CONTEXT);
      setVisibleConversationKey(nextConversationKey);
      setInitialTaskPanelState(nextNeedsOnboarding ? null : opened.task_panel_state || null);
    },
    [],
  );

  const openAndApplySession = useCallback(
    async (currentDeviceId: string, currentTimezone: string, intent: EntryIntent | null) => {
      markSessionOpenStarted();
      const requestToken = sessionRequestTokenRef.current + 1;
      sessionRequestTokenRef.current = requestToken;
      const resolvedEntryContext = intent?.entry_context || MANUAL_CONTEXT;
      const openId = generateOpenId();

      try {
        const opened = await openSession(backendUrl, {
          device_id: currentDeviceId,
          timezone: currentTimezone,
          session_id: intent?.session_id,
          entry_context: resolvedEntryContext,
          source: resolvedEntryContext.source,
          open_id: openId,
          client_version: RELEASE_ID,
          contract_version: CONTRACT_VERSION,
        });

        if (requestToken !== sessionRequestTokenRef.current) {
          const previousFallback = staleSessionFallbackRef.current;
          if (!previousFallback || previousFallback.token < requestToken) {
            staleSessionFallbackRef.current = {
              token: requestToken,
              opened,
              resolvedEntryContext,
            };
          }
          return;
        }

        staleSessionFallbackRef.current = null;
        applyOpenedSession(opened, resolvedEntryContext);
      } catch (error) {
        if (requestToken === sessionRequestTokenRef.current && staleSessionFallbackRef.current) {
          const fallback = staleSessionFallbackRef.current;
          staleSessionFallbackRef.current = null;
          applyOpenedSession(fallback.opened, fallback.resolvedEntryContext);
          return;
        }
        throw error;
      } finally {
        markSessionOpenFinished();
      }
    },
    [applyOpenedSession, backendUrl, markSessionOpenFinished, markSessionOpenStarted],
  );

  const resolveInitialEntryIntent = useCallback(async (): Promise<EntryIntent | null> => {
    const notificationResponse = await Notifications.getLastNotificationResponseAsync();
    if (notificationResponse) {
      const payload = notificationResponse.notification.request.content.data as Record<string, unknown>;
      const intent = parseEntryIntentFromData(payload);
      if (intent) {
        return normalizeRealtimeIntent(intent);
      }
    }

    const initialUrl = await Linking.getInitialURL();
    if (initialUrl) {
      const intent = parseEntryIntentFromUrl(initialUrl);
      if (intent) {
        return normalizeRealtimeIntent(intent);
      }
    }

    return null;
  }, []);

  const syncPushToken = useCallback(
    async (currentDeviceId: string, currentTimezone: string) => {
      const permissions = await Notifications.getPermissionsAsync();
      let finalStatus = permissions.status;
      if (finalStatus !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        finalStatus = requested.status;
      }

      if (finalStatus !== "granted") {
        return;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;

      const tokenResponse = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();

      const expoPushToken = tokenResponse.data;
      if (!expoPushToken) {
        return;
      }

      await registerPushToken(backendUrl, {
        device_id: currentDeviceId,
        expo_push_token: expoPushToken,
        timezone: currentTimezone,
      });
    },
    [backendUrl],
  );

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        const nextTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const context = await getOrCreateDeviceContext(nextTimezone);
        const nextDeviceId = context.device_id;
        const initialIntent = await resolveInitialEntryIntent();
        if (cancelled) return;

        setTimezone(nextTimezone);
        setDeviceId(nextDeviceId);
        setLoading(false);
        lastHandledIntentKeyRef.current = buildEntryIntentKey(initialIntent);
        void openAndApplySession(nextDeviceId, nextTimezone, initialIntent).catch((setupSessionError) => {
          console.warn("Failed to open startup session", setupSessionError);
        });
        void syncPushToken(nextDeviceId, nextTimezone).catch((tokenError) => {
          console.warn("Push token sync failed", tokenError);
        });
      } catch (setupError) {
        console.warn("Failed to start app", setupError);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void setup();
    return () => {
      cancelled = true;
    };
  }, [openAndApplySession, resolveInitialEntryIntent, syncPushToken]);

  useEffect(() => {
    const notificationSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = response.notification.request.content.data as Record<string, unknown>;
      const intent = parseEntryIntentFromData(payload);
      if (intent) {
        const normalizedIntent = normalizeRealtimeIntent(intent);
        const intentKey = buildEntryIntentKey(normalizedIntent);
        if (intentKey && intentKey === lastHandledIntentKeyRef.current) {
          return;
        }
        setPendingEntryIntent(normalizedIntent);
      }
    });

    const urlSub = Linking.addEventListener("url", ({ url }) => {
      const intent = parseEntryIntentFromUrl(url);
      if (intent) {
        const normalizedIntent = normalizeRealtimeIntent(intent);
        const intentKey = buildEntryIntentKey(normalizedIntent);
        if (intentKey && intentKey === lastHandledIntentKeyRef.current) {
          return;
        }
        setPendingEntryIntent(normalizedIntent);
      }
    });

    return () => {
      notificationSub.remove();
      urlSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingEntryIntent || !deviceId) return;
    lastHandledIntentKeyRef.current = buildEntryIntentKey(pendingEntryIntent);
    void openAndApplySession(deviceId, timezone, pendingEntryIntent)
      .catch((sessionError) => {
        console.warn("Failed to process entry intent", sessionError);
      })
      .finally(() => {
        setPendingEntryIntent(null);
      });
  }, [deviceId, openAndApplySession, pendingEntryIntent, timezone]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (previousState === "active" && (nextState === "inactive" || nextState === "background")) {
        lastBackgroundAtRef.current = Date.now();
        return;
      }

      if (
        (previousState === "inactive" || previousState === "background") &&
        nextState === "active" &&
        deviceId
      ) {
        const backgroundAt = lastBackgroundAtRef.current;
        if (!backgroundAt) {
          return;
        }
        const awayForMs = Date.now() - backgroundAt;
        if (!shouldResetVisibleConversation(awayForMs)) {
          return;
        }
        if (pendingEntryIntent) {
          return;
        }
        void openAndApplySession(deviceId, timezone, null).catch((error) => {
          console.warn("Failed to refresh conversation on foreground", error);
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [deviceId, openAndApplySession, pendingEntryIntent, timezone]);

  const onStartOnboarding = useCallback(async () => {
    if (!deviceId || onboardingStarting) return;

    setOnboardingStarting(true);
    try {
      await startOnboarding(backendUrl, {
        device_id: deviceId,
        timezone,
      });
      await openAndApplySession(deviceId, timezone, null);
    } catch (onboardingError) {
      console.warn("Failed to start onboarding", onboardingError);
    } finally {
      setOnboardingStarting(false);
    }
  }, [backendUrl, deviceId, onboardingStarting, openAndApplySession, timezone]);

  return {
    activeThreadId,
    deviceId,
    initialTaskPanelState,
    isSessionOpening,
    loading,
    needsOnboarding,
    onStartOnboarding,
    onboardingStarting,
    profileContext,
    timezone,
    visibleConversationKey,
    visibleMessages,
  };
};
