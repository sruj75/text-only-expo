import {
  AssistantProvider,
  ComposerInput,
  ComposerRoot,
  ComposerSend,
  MessageContent,
  MessageRoot,
  ThreadEmpty,
  ThreadMessages,
  ThreadRoot,
  useLocalRuntime
} from "@assistant-ui/react-native";
import type { ThreadMessageLike } from "@assistant-ui/react-native";
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  bootstrapDevice,
  completeOnboarding,
  createThread,
  fetchThreadMessages,
  registerPushToken
} from "./src/lib/api";
import { getOrCreateDeviceContext } from "./src/lib/device";
import { createWebSocketChatAdapter } from "./src/lib/wsAdapter";
import type {
  BootstrapResponse,
  EntryContext,
  EntryIntent,
  ProfileContext,
  StoredMessage,
  ThreadSummary
} from "./src/types/chat";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

const MANUAL_CONTEXT: EntryContext = {
  source: "manual",
  event_id: null,
  trigger_type: null,
  scheduled_time: null,
  calendar_event_id: null,
  entry_mode: "reactive"
};

const DEFAULT_PROFILE_CONTEXT: ProfileContext = {
  wake_time: null,
  bedtime: null,
  playbook: {},
  health_anchors: [],
  onboarding_status: "pending"
};

const HHMM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const asString = (value: unknown) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

const toThreadMessages = (messages: StoredMessage[]): ThreadMessageLike[] => {
  return messages.map((message) => ({
    id: message.id,
    role: message.role === "assistant" || message.role === "user" ? message.role : "system",
    content: message.content,
    createdAt: new Date(message.created_at)
  }));
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
      entry_mode: entryMode
    }
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

const parsePlaybookNotes = (profileContext: ProfileContext | undefined): string => {
  if (!profileContext || !profileContext.playbook) {
    return "";
  }
  const notes = profileContext.playbook.notes;
  return typeof notes === "string" ? notes : "";
};

const parseAnchorsText = (profileContext: ProfileContext | undefined): string => {
  if (!profileContext) {
    return "";
  }
  return profileContext.health_anchors.join("\n");
};

const normalizeAnchorsText = (text: string): string[] => {
  return text
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

type ChatPaneProps = {
  backendUrl: string;
  deviceId: string;
  timezone: string;
  sessionId: string;
  messages: StoredMessage[];
  entryContext: EntryContext;
};

const ChatPane = ({
  backendUrl,
  deviceId,
  timezone,
  sessionId,
  messages,
  entryContext
}: ChatPaneProps) => {
  const entryContextRef = useRef<EntryContext>(entryContext);
  useEffect(() => {
    entryContextRef.current = entryContext;
  }, [entryContext]);

  const chatModel = useMemo(
    () =>
      createWebSocketChatAdapter({
        backendUrl,
        deviceId,
        sessionId,
        timezone,
        getEntryContext: () => entryContextRef.current
      }),
    [backendUrl, deviceId, sessionId, timezone]
  );

  const runtime = useLocalRuntime(chatModel, {
    initialMessages: toThreadMessages(messages),
    storage: AsyncStorage,
    storagePrefix: `intentive:${sessionId}`
  });

  return (
    <AssistantProvider runtime={runtime}>
      <ThreadRoot style={styles.chatRoot}>
        <ThreadMessages
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          renderMessage={({ message }) => (
            <MessageRoot
              style={[
                styles.messageBubble,
                message.role === "user" ? styles.userBubble : styles.assistantBubble
              ]}
            >
              <MessageContent
                renderText={({ part }) => (
                  <Text
                    style={[
                      styles.messageText,
                      message.role === "user" ? styles.userText : styles.assistantText
                    ]}
                  >
                    {part.text}
                  </Text>
                )}
              />
            </MessageRoot>
          )}
        />

        <ThreadEmpty>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptySubtitle}>
              This thread is ready. Send a message to begin.
            </Text>
          </View>
        </ThreadEmpty>

        <ComposerRoot style={styles.composer}>
          <ComposerInput
            style={styles.composerInput}
            placeholder="Type what is on your mind..."
            placeholderTextColor="#7f8a97"
            multiline
          />
          <ComposerSend style={styles.sendButton}>
            <Text style={styles.sendButtonText}>Send</Text>
          </ComposerSend>
        </ComposerRoot>
      </ThreadRoot>
    </AssistantProvider>
  );
};

export default function App() {
  const { width } = useWindowDimensions();
  const compact = width < 880;

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string>("UTC");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Record<string, StoredMessage[]>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingEntryIntent, setPendingEntryIntent] = useState<EntryIntent | null>(null);
  const [entryContext, setEntryContext] = useState<EntryContext>(MANUAL_CONTEXT);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);
  const [profileContext, setProfileContext] = useState<ProfileContext>(DEFAULT_PROFILE_CONTEXT);
  const [onboardingWakeTime, setOnboardingWakeTime] = useState<string>("");
  const [onboardingBedtime, setOnboardingBedtime] = useState<string>("");
  const [onboardingPlaybook, setOnboardingPlaybook] = useState<string>("");
  const [onboardingAnchorsText, setOnboardingAnchorsText] = useState<string>("");
  const [onboardingSaving, setOnboardingSaving] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<"threads" | "chat">("chat");

  const loadBootstrap = useCallback(
    async (currentDeviceId: string, currentTimezone: string, intent: EntryIntent | null) => {
      const payload = {
        device_id: currentDeviceId,
        timezone: currentTimezone,
        session_id: intent?.session_id,
        entry_context: intent?.entry_context
      };

      const response: BootstrapResponse = await bootstrapDevice(BACKEND_URL, payload);
      setThreads(response.threads);
      setActiveThreadId(response.session_id);
      setThreadMessages((prev) => ({
        ...prev,
        [response.session_id]: response.messages
      }));
      setNeedsOnboarding(Boolean(response.needs_onboarding));
      setProfileContext(response.profile_context || DEFAULT_PROFILE_CONTEXT);
      if (response.needs_onboarding) {
        const wake = response.profile_context?.wake_time || "";
        const bed = response.profile_context?.bedtime || "";
        const notes = parsePlaybookNotes(response.profile_context);
        const anchors = parseAnchorsText(response.profile_context);
        setOnboardingWakeTime((prev) => prev || wake);
        setOnboardingBedtime((prev) => prev || bed);
        setOnboardingPlaybook((prev) => prev || notes);
        setOnboardingAnchorsText((prev) => prev || anchors);
      }
      setEntryContext(intent?.entry_context || MANUAL_CONTEXT);
      if (compact) {
        setMobileTab("chat");
      }
    },
    [compact]
  );

  const syncPushToken = useCallback(async (currentDeviceId: string, currentTimezone: string) => {
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
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const expoPushToken = tokenResponse.data;
    if (!expoPushToken) {
      return;
    }

    await registerPushToken(BACKEND_URL, {
      device_id: currentDeviceId,
      expo_push_token: expoPushToken,
      timezone: currentTimezone
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        const nextTimezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const context = await getOrCreateDeviceContext(nextTimezone);
        const nextDeviceId = context.device_id;
        if (cancelled) return;

        setTimezone(nextTimezone);
        setDeviceId(nextDeviceId);
        await loadBootstrap(nextDeviceId, nextTimezone, null);
        void syncPushToken(nextDeviceId, nextTimezone).catch((tokenError) => {
          console.warn("Push token sync failed", tokenError);
        });
      } catch (setupError) {
        if (!cancelled) {
          setError(setupError instanceof Error ? setupError.message : "Failed to start app");
        }
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
  }, [loadBootstrap, syncPushToken]);

  useEffect(() => {
    const notificationSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = response.notification.request.content.data as Record<string, unknown>;
      const intent = parseEntryIntentFromData(payload);
      if (intent) {
        setPendingEntryIntent(intent);
      }
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const payload = response.notification.request.content.data as Record<string, unknown>;
      const intent = parseEntryIntentFromData(payload);
      if (intent) {
        setPendingEntryIntent(intent);
      }
    });

    const urlSub = Linking.addEventListener("url", ({ url }) => {
      const intent = parseEntryIntentFromUrl(url);
      if (intent) {
        setPendingEntryIntent(intent);
      }
    });

    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      const intent = parseEntryIntentFromUrl(url);
      if (intent) {
        setPendingEntryIntent(intent);
      }
    });

    return () => {
      notificationSub.remove();
      urlSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingEntryIntent || !deviceId) return;
    void loadBootstrap(deviceId, timezone, pendingEntryIntent)
      .catch((bootstrapError) => {
        setError(
          bootstrapError instanceof Error
            ? bootstrapError.message
            : "Failed to process entry intent"
        );
      })
      .finally(() => {
        setPendingEntryIntent(null);
      });
  }, [deviceId, loadBootstrap, pendingEntryIntent, timezone]);

  const onboardingAnchors = useMemo(
    () => normalizeAnchorsText(onboardingAnchorsText),
    [onboardingAnchorsText]
  );
  const onboardingFormValid = useMemo(
    () =>
      HHMM_REGEX.test(onboardingWakeTime.trim()) &&
      HHMM_REGEX.test(onboardingBedtime.trim()) &&
      onboardingPlaybook.trim().length >= 3 &&
      onboardingAnchors.length > 0,
    [onboardingAnchors, onboardingBedtime, onboardingPlaybook, onboardingWakeTime]
  );

  const onCompleteOnboarding = useCallback(async () => {
    if (!deviceId || !onboardingFormValid || onboardingSaving) return;
    setError(null);
    setOnboardingSaving(true);
    try {
      const response = await completeOnboarding(BACKEND_URL, {
        device_id: deviceId,
        timezone,
        wake_time: onboardingWakeTime.trim(),
        bedtime: onboardingBedtime.trim(),
        playbook: onboardingPlaybook.trim(),
        health_anchors: onboardingAnchors
      });
      setNeedsOnboarding(Boolean(response.needs_onboarding));
      setProfileContext(response.profile_context || DEFAULT_PROFILE_CONTEXT);
      await loadBootstrap(deviceId, timezone, null);
    } catch (onboardingError) {
      setError(
        onboardingError instanceof Error
          ? onboardingError.message
          : "Failed to complete onboarding"
      );
    } finally {
      setOnboardingSaving(false);
    }
  }, [
    deviceId,
    loadBootstrap,
    onboardingAnchors,
    onboardingBedtime,
    onboardingFormValid,
    onboardingPlaybook,
    onboardingSaving,
    onboardingWakeTime,
    timezone
  ]);

  const onSelectThread = useCallback(
    async (sessionId: string) => {
      if (!deviceId) return;
      setError(null);
      try {
        if (!threadMessages[sessionId]) {
          const messages = await fetchThreadMessages(BACKEND_URL, sessionId, deviceId);
          setThreadMessages((prev) => ({
            ...prev,
            [sessionId]: messages
          }));
        }

        setActiveThreadId(sessionId);
        setEntryContext(MANUAL_CONTEXT);

        if (compact) {
          setMobileTab("chat");
        }
      } catch (threadError) {
        setError(
          threadError instanceof Error ? threadError.message : "Failed to load thread"
        );
      }
    },
    [compact, deviceId, threadMessages]
  );

  const onCreateThread = useCallback(async () => {
    if (!deviceId) return;
    setError(null);
    try {
      const created = await createThread(BACKEND_URL, {
        device_id: deviceId,
        timezone
      });
      setThreads((prev) => [created, ...prev]);
      setThreadMessages((prev) => ({ ...prev, [created.session_id]: [] }));
      setActiveThreadId(created.session_id);
      setEntryContext(MANUAL_CONTEXT);
      if (compact) {
        setMobileTab("chat");
      }
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create thread"
      );
    }
  }, [compact, deviceId, timezone]);

  const activeMessages =
    (activeThreadId && threadMessages[activeThreadId]) || [];

  const showThreads = !needsOnboarding && (!compact || mobileTab === "threads");
  const showChat = needsOnboarding || !compact || mobileTab === "chat";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Intentive</Text>
          <Text style={styles.subtitle}>Thread list + real-time chat</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerMeta}>Device: {deviceId ? "ready" : "loading"}</Text>
          <Text style={styles.headerMeta}>{timezone}</Text>
        </View>
      </View>

      {compact ? (
        <View style={styles.mobileTabs}>
          <Pressable
            onPress={() => setMobileTab("threads")}
            style={[
              styles.mobileTab,
              mobileTab === "threads" && styles.mobileTabActive,
              needsOnboarding && styles.mobileTabDisabled
            ]}
            disabled={needsOnboarding}
          >
            <Text
              style={[
                styles.mobileTabText,
                mobileTab === "threads" && styles.mobileTabTextActive,
                needsOnboarding && styles.mobileTabTextDisabled
              ]}
            >
              Threads
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMobileTab("chat")}
            style={[styles.mobileTab, mobileTab === "chat" && styles.mobileTabActive]}
          >
            <Text
              style={[
                styles.mobileTabText,
                mobileTab === "chat" && styles.mobileTabTextActive
              ]}
            >
              Chat
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.content}>
        {showThreads ? (
          <View style={styles.threadPane}>
            <View style={styles.threadPaneHeader}>
              <Text style={styles.threadPaneTitle}>Threads</Text>
              <Pressable onPress={() => void onCreateThread()} style={styles.newThreadButton}>
                <Text style={styles.newThreadButtonText}>+ New</Text>
              </Pressable>
            </View>

            <FlatList
              data={threads}
              keyExtractor={(item) => item.session_id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => void onSelectThread(item.session_id)}
                  style={[
                    styles.threadItem,
                    activeThreadId === item.session_id && styles.threadItemActive
                  ]}
                >
                  <Text style={styles.threadTitle}>{item.title}</Text>
                  <Text style={styles.threadDate}>{item.date}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.emptyThreads}>
                  <Text style={styles.emptyThreadsText}>No threads yet</Text>
                </View>
              }
            />
          </View>
        ) : null}

        {showChat ? (
          <View style={styles.chatPane}>
            {loading ? (
              <View style={styles.centeredState}>
                <Text style={styles.centeredTitle}>Preparing your workspace...</Text>
              </View>
            ) : needsOnboarding ? (
              <View style={styles.onboardingPane}>
                <Text style={styles.onboardingTitle}>Quick setup before chat</Text>
                <Text style={styles.onboardingSubtitle}>
                  Fill this once so the morning assistant has your real context.
                </Text>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>Wake time (HH:MM)</Text>
                  <TextInput
                    value={onboardingWakeTime}
                    onChangeText={setOnboardingWakeTime}
                    placeholder="07:30"
                    placeholderTextColor="#7f8a97"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.onboardingInput}
                  />
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>Bedtime (HH:MM)</Text>
                  <TextInput
                    value={onboardingBedtime}
                    onChangeText={setOnboardingBedtime}
                    placeholder="23:30"
                    placeholderTextColor="#7f8a97"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.onboardingInput}
                  />
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>Playbook (what helps when stuck)</Text>
                  <TextInput
                    value={onboardingPlaybook}
                    onChangeText={setOnboardingPlaybook}
                    placeholder="Example: ask me for one tiny next step and a 10-minute sprint."
                    placeholderTextColor="#7f8a97"
                    multiline
                    style={[styles.onboardingInput, styles.onboardingMultiline]}
                  />
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>Health anchors (one per line)</Text>
                  <TextInput
                    value={onboardingAnchorsText}
                    onChangeText={setOnboardingAnchorsText}
                    placeholder={"Breakfast\nWalk\nMedication"}
                    placeholderTextColor="#7f8a97"
                    multiline
                    style={[styles.onboardingInput, styles.onboardingMultiline]}
                  />
                </View>

                <Pressable
                  onPress={() => void onCompleteOnboarding()}
                  disabled={!onboardingFormValid || onboardingSaving}
                  style={[
                    styles.onboardingButton,
                    (!onboardingFormValid || onboardingSaving) && styles.onboardingButtonDisabled
                  ]}
                >
                  <Text style={styles.onboardingButtonText}>
                    {onboardingSaving ? "Saving..." : "Save and continue"}
                  </Text>
                </Pressable>

                <Text style={styles.onboardingHint}>
                  {profileContext.onboarding_status === "completed"
                    ? "Profile is already completed."
                    : "All fields are required to continue."}
                </Text>
              </View>
            ) : !deviceId || !activeThreadId ? (
              <View style={styles.centeredState}>
                <Text style={styles.centeredTitle}>No active thread</Text>
                <Text style={styles.centeredSubtitle}>
                  Create a thread or pick one from the list.
                </Text>
              </View>
            ) : (
              <ChatPane
                key={activeThreadId}
                backendUrl={BACKEND_URL}
                deviceId={deviceId}
                timezone={timezone}
                sessionId={activeThreadId}
                messages={activeMessages}
                entryContext={entryContext}
              />
            )}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f5f7"
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#dde3ea",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f1720"
  },
  subtitle: {
    marginTop: 2,
    color: "#59636f",
    fontSize: 13
  },
  headerRight: {
    alignItems: "flex-end"
  },
  headerMeta: {
    color: "#59636f",
    fontSize: 12
  },
  mobileTabs: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  mobileTab: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccd4de",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#ffffff"
  },
  mobileTabActive: {
    borderColor: "#0f1720",
    backgroundColor: "#0f1720"
  },
  mobileTabDisabled: {
    opacity: 0.45
  },
  mobileTabText: {
    color: "#0f1720",
    fontWeight: "600"
  },
  mobileTabTextActive: {
    color: "#ffffff"
  },
  mobileTabTextDisabled: {
    color: "#6d7784"
  },
  errorText: {
    color: "#b42318",
    backgroundColor: "#fee4e2",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  content: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12
  },
  threadPane: {
    width: 280,
    maxWidth: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d8e0ea",
    padding: 12
  },
  threadPaneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  threadPaneTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f1720"
  },
  newThreadButton: {
    backgroundColor: "#0f1720",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8
  },
  newThreadButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12
  },
  threadItem: {
    borderWidth: 1,
    borderColor: "#d8e0ea",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginVertical: 4,
    backgroundColor: "#ffffff"
  },
  threadItemActive: {
    borderColor: "#0f1720",
    backgroundColor: "#eef2f6"
  },
  threadTitle: {
    color: "#0f1720",
    fontSize: 14,
    fontWeight: "600"
  },
  threadDate: {
    marginTop: 3,
    color: "#6d7784",
    fontSize: 12
  },
  emptyThreads: {
    paddingTop: 20,
    alignItems: "center"
  },
  emptyThreadsText: {
    color: "#6d7784"
  },
  chatPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d8e0ea",
    overflow: "hidden"
  },
  onboardingPane: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 18
  },
  onboardingTitle: {
    color: "#0f1720",
    fontSize: 20,
    fontWeight: "800"
  },
  onboardingSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    color: "#59636f",
    fontSize: 13
  },
  onboardingField: {
    marginBottom: 10
  },
  onboardingLabel: {
    color: "#0f1720",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6
  },
  onboardingInput: {
    borderWidth: 1,
    borderColor: "#c9d2dd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f1720",
    backgroundColor: "#ffffff"
  },
  onboardingMultiline: {
    minHeight: 74,
    textAlignVertical: "top"
  },
  onboardingButton: {
    marginTop: 10,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#0f1720",
    alignItems: "center",
    justifyContent: "center"
  },
  onboardingButtonDisabled: {
    backgroundColor: "#7f8a97"
  },
  onboardingButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  onboardingHint: {
    marginTop: 8,
    color: "#6d7784",
    fontSize: 12
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  centeredTitle: {
    color: "#0f1720",
    fontSize: 18,
    fontWeight: "700"
  },
  centeredSubtitle: {
    marginTop: 8,
    color: "#6d7784",
    textAlign: "center"
  },
  chatRoot: {
    flex: 1,
    padding: 12
  },
  messagesList: {
    flex: 1
  },
  messagesContent: {
    paddingBottom: 20,
    gap: 8
  },
  messageBubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: "86%"
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#0f1720"
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#eef2f6"
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22
  },
  userText: {
    color: "#ffffff"
  },
  assistantText: {
    color: "#0f1720"
  },
  emptyState: {
    alignItems: "center",
    marginBottom: 12
  },
  emptyTitle: {
    color: "#0f1720",
    fontWeight: "700"
  },
  emptySubtitle: {
    marginTop: 4,
    color: "#6d7784"
  },
  composer: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end"
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#c9d2dd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
    color: "#0f1720",
    backgroundColor: "#ffffff"
  },
  sendButton: {
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: "#0f1720"
  },
  sendButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  }
});
