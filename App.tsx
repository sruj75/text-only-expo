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
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
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
import {
  buildHealthAnchors,
  buildPlaybookSummary,
  formatTimeForDisplay,
  parsePlaybookSummary,
  parseTimeInput,
  type MotivationStyle
} from "./src/lib/onboarding";
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

type ChatPaneProps = {
  backendUrl: string;
  deviceId: string;
  timezone: string;
  sessionId: string;
  messages: StoredMessage[];
  entryContext: EntryContext;
};

type OnboardingScreenProps = {
  error: string | null;
  onboardingWakeTime: string;
  onboardingBedtime: string;
  onboardingStruggles: string;
  onboardingGoals: string;
  onboardingMotivationStyle: MotivationStyle;
  onboardingFormValid: boolean;
  onboardingSaving: boolean;
  onboardingStatus: string;
  setOnboardingWakeTime: (value: string) => void;
  setOnboardingBedtime: (value: string) => void;
  setOnboardingStruggles: (value: string) => void;
  setOnboardingGoals: (value: string) => void;
  setOnboardingMotivationStyle: (value: MotivationStyle) => void;
  onCompleteOnboarding: () => void;
};

const OnboardingScreen = ({
  error,
  onboardingWakeTime,
  onboardingBedtime,
  onboardingStruggles,
  onboardingGoals,
  onboardingMotivationStyle,
  onboardingFormValid,
  onboardingSaving,
  onboardingStatus,
  setOnboardingWakeTime,
  setOnboardingBedtime,
  setOnboardingStruggles,
  setOnboardingGoals,
  setOnboardingMotivationStyle,
  onCompleteOnboarding
}: OnboardingScreenProps) => {
  return (
    <SafeAreaView style={styles.standaloneScreen}>
      <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />

      <View style={styles.authShell}>
        <View style={styles.authHeader}>
          <Text style={styles.authEyebrow}>Intentive setup</Text>
          <Text style={styles.authTitle}>Quick setup before chat</Text>
          <Text style={styles.authSubtitle}>
            Finish this once, then you land in the main chat and thread screen.
          </Text>
        </View>

        {error ? <Text style={styles.authError}>{error}</Text> : null}

        <View style={styles.authCard}>
          <KeyboardAvoidingView
            style={styles.onboardingKeyboardArea}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              contentContainerStyle={styles.onboardingPane}
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={Keyboard.dismiss} style={styles.onboardingDismissArea}>
                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>When do you usually wake up?</Text>
                  <TextInput
                    value={onboardingWakeTime}
                    onChangeText={setOnboardingWakeTime}
                    placeholder="7:30 AM"
                    placeholderTextColor="#7f8a97"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={styles.onboardingInput}
                  />
                  <Text style={styles.onboardingHelperText}>
                    Use a time with AM or PM, like 7:30 AM.
                  </Text>
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>When do you usually go to bed?</Text>
                  <TextInput
                    value={onboardingBedtime}
                    onChangeText={setOnboardingBedtime}
                    placeholder="11:30 PM"
                    placeholderTextColor="#7f8a97"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={styles.onboardingInput}
                  />
                  <Text style={styles.onboardingHelperText}>Example: 11:30 PM.</Text>
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>
                    What struggles do you face most as a person with ADHD?
                  </Text>
                  <TextInput
                    value={onboardingStruggles}
                    onChangeText={setOnboardingStruggles}
                    placeholder="Example: I freeze when I have too many tasks and avoid starting."
                    placeholderTextColor="#7f8a97"
                    multiline
                    style={[styles.onboardingInput, styles.onboardingMultiline]}
                  />
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>What goals are you working toward right now?</Text>
                  <TextInput
                    value={onboardingGoals}
                    onChangeText={setOnboardingGoals}
                    placeholder="Example: finish my most important work earlier and stay consistent."
                    placeholderTextColor="#7f8a97"
                    multiline
                    style={[styles.onboardingInput, styles.onboardingMultiline]}
                  />
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>
                    What personality works best for you?
                  </Text>
                  <View style={styles.motivationOptions}>
                    {[
                      {
                        value: "straightforward" as MotivationStyle,
                        label: "Straightforward"
                      },
                      {
                        value: "supportive" as MotivationStyle,
                        label: "Supportive"
                      },
                      {
                        value: "balanced" as MotivationStyle,
                        label: "Balanced"
                      },
                      {
                        value: "motivation" as MotivationStyle,
                        label: "Motivation"
                      },
                      {
                        value: "zen" as MotivationStyle,
                        label: "Zen"
                      }
                    ].map((option) => (
                      <Pressable
                        key={option.value}
                        onPress={() => {
                          Keyboard.dismiss();
                          setOnboardingMotivationStyle(option.value);
                        }}
                        style={[
                          styles.motivationOption,
                          onboardingMotivationStyle === option.value &&
                            styles.motivationOptionActive
                        ]}
                      >
                        <Text
                          style={[
                            styles.motivationOptionText,
                            onboardingMotivationStyle === option.value &&
                              styles.motivationOptionTextActive
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    onCompleteOnboarding();
                  }}
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
                  {onboardingStatus === "completed"
                    ? "Profile is already completed."
                    : "Add your sleep times, struggles, goals, and preferred motivation style to continue."}
                </Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </SafeAreaView>
  );
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
  const [onboardingStruggles, setOnboardingStruggles] = useState<string>("");
  const [onboardingGoals, setOnboardingGoals] = useState<string>("");
  const [onboardingMotivationStyle, setOnboardingMotivationStyle] =
    useState<MotivationStyle>("supportive");
  const [onboardingSaving, setOnboardingSaving] = useState<boolean>(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState<boolean>(false);
  const swipeStartX = useRef<number | null>(null);

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
        const wake = formatTimeForDisplay(response.profile_context?.wake_time);
        const bed = formatTimeForDisplay(response.profile_context?.bedtime);
        const notes = parsePlaybookNotes(response.profile_context);
        const playbookSummary = parsePlaybookSummary(notes);
        setOnboardingWakeTime((prev) => prev || wake);
        setOnboardingBedtime((prev) => prev || bed);
      setOnboardingStruggles((prev) => prev || playbookSummary.struggles || "");
      setOnboardingGoals((prev) => prev || playbookSummary.goals || "");
      setOnboardingMotivationStyle((prev) => playbookSummary.motivationStyle || prev);
      }
      setEntryContext(intent?.entry_context || MANUAL_CONTEXT);
    },
    []
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

  const normalizedWakeTime = useMemo(
    () => parseTimeInput(onboardingWakeTime),
    [onboardingWakeTime]
  );
  const normalizedBedtime = useMemo(
    () => parseTimeInput(onboardingBedtime),
    [onboardingBedtime]
  );
  const onboardingFormValid = useMemo(
    () =>
      Boolean(normalizedWakeTime) &&
      Boolean(normalizedBedtime) &&
      onboardingStruggles.trim().length >= 3 &&
      onboardingGoals.trim().length >= 3,
    [normalizedBedtime, normalizedWakeTime, onboardingGoals, onboardingStruggles]
  );

  const onCompleteOnboarding = useCallback(async () => {
    if (!deviceId || !onboardingFormValid || onboardingSaving) return;
    const wakeTime = parseTimeInput(onboardingWakeTime);
    const bedtime = parseTimeInput(onboardingBedtime);
    if (!wakeTime || !bedtime) return;

    setError(null);
    setOnboardingSaving(true);
    try {
      const response = await completeOnboarding(BACKEND_URL, {
        device_id: deviceId,
        timezone,
        wake_time: wakeTime,
        bedtime,
        playbook: buildPlaybookSummary({
          struggles: onboardingStruggles,
          goals: onboardingGoals,
          motivationStyle: onboardingMotivationStyle
        }),
        health_anchors: buildHealthAnchors({
          wakeTime,
          bedtime,
          goals: onboardingGoals
        })
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
    onboardingBedtime,
    onboardingFormValid,
    onboardingGoals,
    onboardingMotivationStyle,
    onboardingSaving,
    onboardingStruggles,
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
          setMobileThreadOpen(false);
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
        setMobileThreadOpen(false);
      }
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create thread"
      );
    }
  }, [compact, deviceId, timezone]);

  const onSwipeStart = useCallback((x: number) => {
    swipeStartX.current = x;
  }, []);

  const onSwipeEnd = useCallback(
    (x: number) => {
      if (!compact) return;
      const startX = swipeStartX.current;
      swipeStartX.current = null;
      if (startX === null) return;

      const delta = x - startX;
      if (delta > 56) {
        setMobileThreadOpen(true);
      } else if (delta < -56) {
        setMobileThreadOpen(false);
      }
    },
    [compact]
  );

  const activeMessages =
    (activeThreadId && threadMessages[activeThreadId]) || [];

  if (loading) {
    return (
      <SafeAreaView style={styles.standaloneScreen}>
        <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />
        <View style={styles.standaloneState}>
          <Text style={styles.centeredTitle}>Getting Intentive ready...</Text>
          <Text style={styles.centeredSubtitle}>
            Loading your device and chat context.
          </Text>
          {error ? <Text style={styles.authError}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  if (needsOnboarding) {
    return (
      <OnboardingScreen
        error={error}
        onboardingWakeTime={onboardingWakeTime}
        onboardingBedtime={onboardingBedtime}
        onboardingStruggles={onboardingStruggles}
        onboardingGoals={onboardingGoals}
        onboardingMotivationStyle={onboardingMotivationStyle}
        onboardingFormValid={onboardingFormValid}
        onboardingSaving={onboardingSaving}
        onboardingStatus={profileContext.onboarding_status}
        setOnboardingWakeTime={setOnboardingWakeTime}
        setOnboardingBedtime={setOnboardingBedtime}
        setOnboardingStruggles={setOnboardingStruggles}
        setOnboardingGoals={setOnboardingGoals}
        setOnboardingMotivationStyle={setOnboardingMotivationStyle}
        onCompleteOnboarding={() => {
          void onCompleteOnboarding();
        }}
      />
    );
  }

  const showThreads = !compact;
  const showChat = true;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View
        style={styles.content}
        onTouchStart={(event) => onSwipeStart(event.nativeEvent.pageX)}
        onTouchEnd={(event) => onSwipeEnd(event.nativeEvent.pageX)}
      >
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
            {!deviceId || !activeThreadId ? (
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

            {compact ? (
              <Pressable
                style={styles.mobileMenuButton}
                onPress={() => setMobileThreadOpen(true)}
              >
                <Text style={styles.mobileMenuButtonText}>☰</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {compact && mobileThreadOpen ? (
          <View
            style={styles.mobileDrawerOverlay}
            onTouchStart={(event) => onSwipeStart(event.nativeEvent.pageX)}
            onTouchEnd={(event) => onSwipeEnd(event.nativeEvent.pageX)}
          >
            <View style={styles.mobileDrawerPanel}>
              <View style={[styles.threadPane, styles.mobileThreadPane]}>
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
            </View>

            <Pressable
              style={styles.mobileDrawerBackdrop}
              onPress={() => setMobileThreadOpen(false)}
            />
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
  standaloneScreen: {
    flex: 1,
    backgroundColor: "#f3f5f7"
  },
  standaloneState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24
  },
  authShell: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 20,
    justifyContent: "flex-start",
    alignItems: "center"
  },
  authHeader: {
    width: "100%",
    maxWidth: 720,
    marginBottom: 16
  },
  authEyebrow: {
    color: "#59636f",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  authTitle: {
    marginTop: 8,
    color: "#0f1720",
    fontSize: 28,
    fontWeight: "800"
  },
  authSubtitle: {
    marginTop: 8,
    color: "#59636f",
    fontSize: 15,
    lineHeight: 22
  },
  authError: {
    width: "100%",
    maxWidth: 720,
    color: "#b42318",
    backgroundColor: "#fee4e2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12
  },
  authCard: {
    width: "100%",
    maxWidth: 720,
    flex: 1,
    minHeight: 320,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d8e0ea",
    overflow: "hidden"
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
    padding: 12,
    position: "relative"
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
  mobileMenuButton: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0f1720",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3
  },
  mobileMenuButtonText: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "700"
  },
  mobileDrawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    zIndex: 20
  },
  mobileDrawerPanel: {
    width: "82%",
    maxWidth: 320,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#d8e0ea"
  },
  mobileThreadPane: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    borderWidth: 0,
    borderRadius: 0
  },
  mobileDrawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 32, 0.36)"
  },
  onboardingPane: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 18
  },
  onboardingKeyboardArea: {
    flex: 1
  },
  onboardingDismissArea: {
    flex: 1
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
  onboardingHelperText: {
    marginTop: 5,
    color: "#6d7784",
    fontSize: 12
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
  motivationOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  motivationOption: {
    borderWidth: 1,
    borderColor: "#c9d2dd",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#ffffff"
  },
  motivationOptionActive: {
    borderColor: "#0f1720",
    backgroundColor: "#0f1720"
  },
  motivationOptionText: {
    color: "#0f1720",
    fontWeight: "600"
  },
  motivationOptionTextActive: {
    color: "#ffffff"
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
