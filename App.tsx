import {
  AssistantProvider,
  MessageContent,
  MessageRoot,
  ThreadMessages,
  ThreadRoot,
  useLocalRuntime
} from "@assistant-ui/react-native";
import type { ThreadMessageLike } from "@assistant-ui/react-native";
import {
  AppState,
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
  View
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ChatFooterRail } from "./src/components/ChatFooterRail";
import {
  completeOnboarding,
  openSession,
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
import {
  normalizeRealtimeIntent,
  shouldResetVisibleConversation
} from "./src/lib/sessionWindow";
import { createWebSocketChatAdapter } from "./src/lib/wsAdapter";
import { useKeyboardOverlap } from "./src/hooks/useKeyboardOverlap";
import { useTaskPanelController } from "./src/hooks/useTaskPanelController";
import type {
  EntryContext,
  EntryIntent,
  ProfileContext,
  StoredMessage
} from "./src/types/chat";

const rawBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
if (!rawBackendUrl) {
  throw new Error("EXPO_PUBLIC_BACKEND_URL is required.");
}
const BACKEND_URL: string = rawBackendUrl;

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
  visibleConversationKey: string;
  messages: StoredMessage[];
  messageCursor: string | null;
  entryContext: EntryContext;
};

type OnboardingScreenProps = {
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
  visibleConversationKey,
  messages,
  messageCursor,
  entryContext
}: ChatPaneProps) => {
  const taskPanelTopGap = 16;
  const entryContextRef = useRef<EntryContext>(entryContext);
  const [chatShellHeight, setChatShellHeight] = useState<number>(0);
  const [composerHeight, setComposerHeight] = useState<number>(54);
  const { containerRef, handleContainerLayout, keyboardOffset } = useKeyboardOverlap();
  const {
    taskPanelSnapshot,
    taskPanelVisibility,
    pendingTaskActionKey,
    handleClosePanel,
    handleTaskPanelState,
    handleTaskStatusToggle,
    handleTogglePanel,
    handleTopEssentialToggle
  } = useTaskPanelController({
    backendUrl,
    deviceId,
    timezone,
    sessionId
  });

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
        getEntryContext: () => entryContextRef.current,
        getCursor: () => messageCursor,
        onTaskPanelState: handleTaskPanelState
      }),
    [backendUrl, deviceId, handleTaskPanelState, messageCursor, sessionId, timezone]
  );

  const runtime = useLocalRuntime(chatModel, {
    initialMessages: toThreadMessages(messages),
    storage: AsyncStorage,
    storagePrefix: `intentive:${sessionId}:${visibleConversationKey}`
  });
  const taskPanelMaxHeight = Math.max(
    0,
    chatShellHeight - keyboardOffset - composerHeight - 12 - taskPanelTopGap
  );

  return (
    <AssistantProvider runtime={runtime}>
      <View
        ref={containerRef}
        style={styles.chatRootContainer}
        onLayout={(event) => {
          handleContainerLayout(event);
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setChatShellHeight((currentHeight) =>
            currentHeight === nextHeight ? currentHeight : nextHeight
          );
        }}
      >
        <ThreadRoot style={styles.chatRoot}>
          <ThreadMessages
            style={styles.messagesList}
            contentContainerStyle={[
              styles.messagesContent,
              { paddingBottom: composerHeight + 12 }
            ]}
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

          <ChatFooterRail
            keyboardOffset={keyboardOffset}
            panelMaxHeight={taskPanelMaxHeight}
            pendingActionKey={pendingTaskActionKey}
            snapshot={taskPanelSnapshot}
            visibility={taskPanelVisibility}
            onComposerLayout={(event) => {
              const nextHeight = Math.round(event.nativeEvent.layout.height);
              setComposerHeight((currentHeight) =>
                currentHeight === nextHeight ? currentHeight : nextHeight
              );
            }}
            onClosePanel={handleClosePanel}
            onTogglePanel={handleTogglePanel}
            onToggleTaskStatus={handleTaskStatusToggle}
            onToggleTopEssential={handleTopEssentialToggle}
          />
        </ThreadRoot>
      </View>
    </AssistantProvider>
  );
};

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string>("UTC");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [visibleConversationKey, setVisibleConversationKey] = useState<string | null>(null);
  const [visibleMessages, setVisibleMessages] = useState<StoredMessage[]>([]);
  const [sessionCursor, setSessionCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
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
  const appStateRef = useRef(AppState.currentState);
  const lastBackgroundAtRef = useRef<number | null>(null);

  const loadSession = useCallback(
    async (currentDeviceId: string, currentTimezone: string, intent: EntryIntent | null) => {
      const resolvedEntryContext = intent?.entry_context || MANUAL_CONTEXT;
      const opened = await openSession(BACKEND_URL, {
        device_id: currentDeviceId,
        timezone: currentTimezone,
        session_id: intent?.session_id,
        entry_context: resolvedEntryContext,
        source: resolvedEntryContext.source,
        cursor: null
      });

      setActiveThreadId(opened.session_id);
      setNeedsOnboarding(Boolean(opened.needs_onboarding));
      setProfileContext(opened.profile_context || DEFAULT_PROFILE_CONTEXT);
      if (opened.needs_onboarding) {
        const wake = formatTimeForDisplay(opened.profile_context?.wake_time);
        const bed = formatTimeForDisplay(opened.profile_context?.bedtime);
        const notes = parsePlaybookNotes(opened.profile_context);
        const playbookSummary = parsePlaybookSummary(notes);
        setOnboardingWakeTime((prev) => prev || wake);
        setOnboardingBedtime((prev) => prev || bed);
        setOnboardingStruggles((prev) => prev || playbookSummary.struggles || "");
        setOnboardingGoals((prev) => prev || playbookSummary.goals || "");
        setOnboardingMotivationStyle((prev) => playbookSummary.motivationStyle || prev);
        setVisibleConversationKey(null);
        setVisibleMessages([]);
        setSessionCursor(null);
        setEntryContext(MANUAL_CONTEXT);
        return;
      }
      setVisibleConversationKey(`${opened.session_id}:${Date.now()}`);
      setVisibleMessages(opened.messages_delta || []);
      setSessionCursor(opened.message_cursor || null);
      setEntryContext(resolvedEntryContext);
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
        await loadSession(nextDeviceId, nextTimezone, null);
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
  }, [loadSession, syncPushToken]);

  useEffect(() => {
    const notificationSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = response.notification.request.content.data as Record<string, unknown>;
      const intent = parseEntryIntentFromData(payload);
      if (intent) {
        setPendingEntryIntent(normalizeRealtimeIntent(intent));
      }
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const payload = response.notification.request.content.data as Record<string, unknown>;
      const intent = parseEntryIntentFromData(payload);
      if (intent) {
        setPendingEntryIntent(normalizeRealtimeIntent(intent));
      }
    });

    const urlSub = Linking.addEventListener("url", ({ url }) => {
      const intent = parseEntryIntentFromUrl(url);
      if (intent) {
        setPendingEntryIntent(normalizeRealtimeIntent(intent));
      }
    });

    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      const intent = parseEntryIntentFromUrl(url);
      if (intent) {
        setPendingEntryIntent(normalizeRealtimeIntent(intent));
      }
    });

    return () => {
      notificationSub.remove();
      urlSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingEntryIntent || !deviceId) return;
    void loadSession(deviceId, timezone, pendingEntryIntent)
      .catch((bootstrapError) => {
        console.warn("Failed to process entry intent", bootstrapError);
      })
      .finally(() => {
        setPendingEntryIntent(null);
      });
  }, [deviceId, loadSession, pendingEntryIntent, timezone]);

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
        void loadSession(deviceId, timezone, null).catch((error) => {
          console.warn("Failed to refresh conversation on foreground", error);
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [deviceId, loadSession, timezone]);

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
      await loadSession(deviceId, timezone, {
        entry_context: {
          source: "manual",
          event_id: null,
          trigger_type: "post_onboarding",
          scheduled_time: null,
          calendar_event_id: null,
          entry_mode: "proactive"
        }
      });
    } catch (onboardingError) {
      console.warn("Failed to complete onboarding", onboardingError);
    } finally {
      setOnboardingSaving(false);
    }
  }, [
    deviceId,
    loadSession,
    onboardingBedtime,
    onboardingFormValid,
    onboardingGoals,
    onboardingMotivationStyle,
    onboardingSaving,
    onboardingStruggles,
    onboardingWakeTime,
    timezone
  ]);

  const activeMessages = visibleMessages;

  if (loading) {
    return (
      <SafeAreaView style={styles.standaloneScreen}>
        <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />
        <View style={styles.standaloneState}>
          <Text style={styles.centeredTitle}>Getting Intentive ready...</Text>
          <Text style={styles.centeredSubtitle}>
            Loading your device and chat context.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (needsOnboarding) {
    return (
      <OnboardingScreen
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />

      <View style={styles.content}>
        <View style={styles.chatPane}>
          {!deviceId || !activeThreadId || !visibleConversationKey ? (
            <View style={styles.centeredState}>
              <Text style={styles.centeredTitle}>Preparing your chat</Text>
              <Text style={styles.centeredSubtitle}>
                Getting the conversation ready for you.
              </Text>
            </View>
          ) : (
            <ChatPane
              key={visibleConversationKey}
              backendUrl={BACKEND_URL}
              deviceId={deviceId}
              timezone={timezone}
              sessionId={activeThreadId}
              visibleConversationKey={visibleConversationKey}
              messages={activeMessages}
              messageCursor={sessionCursor}
              entryContext={entryContext}
            />
          )}
        </View>
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
  content: {
    flex: 1,
    padding: 12
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
  chatRootContainer: {
    flex: 1
  },
  chatRoot: {
    flex: 1
  },
  messagesList: {
    flex: 1
  },
  messagesContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 96,
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
  }
});
