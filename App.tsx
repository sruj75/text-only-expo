import {
  AssistantProvider,
  MessageContent,
  MessageRoot,
  ThreadMessages,
  ThreadRoot,
  useLocalRuntime,
} from "@assistant-ui/react-native";
import type { ThreadMessageLike } from "@assistant-ui/react-native";
import * as Notifications from "expo-notifications";
import {
  Animated,
  Easing,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChatFooterRail } from "./src/components/ChatFooterRail";
import { OnboardingScreen } from "./src/components/OnboardingScreen";
import { useKeyboardOverlap } from "./src/hooks/useKeyboardOverlap";
import { useSessionLifecycle } from "./src/hooks/useSessionLifecycle";
import { useTaskPanelController } from "./src/hooks/useTaskPanelController";
import { createWebSocketChatAdapter } from "./src/lib/wsAdapter";
import type { StoredMessage, TaskPanelSnapshot } from "./src/types/chat";

const rawBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
if (!rawBackendUrl) {
  throw new Error("EXPO_PUBLIC_BACKEND_URL is required.");
}
const BACKEND_URL: string = rawBackendUrl;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const toThreadMessages = (messages: StoredMessage[]): ThreadMessageLike[] => {
  return messages.map((message) => ({
    id: message.id,
    role: message.role === "assistant" || message.role === "user" ? message.role : "system",
    content: message.content,
    createdAt: new Date(message.created_at),
  }));
};

const messageHasVisibleText = (message: { content?: unknown }): boolean => {
  if (!Array.isArray(message.content)) {
    return false;
  }

  return message.content.some((part) => {
    if (!part || typeof part !== "object") {
      return false;
    }
    const record = part as { type?: unknown; text?: unknown };
    return (
      record.type === "text" && typeof record.text === "string" && record.text.trim().length > 0
    );
  });
};

const isAssistantTypingMessage = (message: {
  role?: unknown;
  status?: { type?: unknown } | null;
  content?: unknown;
}): boolean => {
  if (message.role !== "assistant") {
    return false;
  }

  const statusType = message.status?.type;
  const hasVisibleText = messageHasVisibleText(message);
  return statusType === "running" && !hasVisibleText;
};

const TypingDots = () => {
  const dotValues = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const loops = dotValues.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 120),
          Animated.timing(dot, {
            toValue: 1,
            duration: 320,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 320,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    loops.forEach((loop) => loop.start());
    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [dotValues]);

  return (
    <View style={styles.typingDotsRow}>
      {dotValues.map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.typingDot,
            {
              opacity: dot,
              transform: [{ scale: dot }],
            },
          ]}
        />
      ))}
    </View>
  );
};

const PendingTypingBubble = () => {
  return (
    <View style={styles.pendingState}>
      <View style={[styles.messageBubble, styles.assistantBubble, styles.typingBubble]}>
        <TypingDots />
      </View>
    </View>
  );
};

type ChatPaneProps = {
  backendUrl: string;
  deviceId: string;
  timezone: string;
  sessionId: string;
  messages: StoredMessage[];
  initialTaskPanelState: TaskPanelSnapshot | null;
};

const ChatPane = ({
  backendUrl,
  deviceId,
  timezone,
  sessionId,
  messages,
  initialTaskPanelState,
}: ChatPaneProps) => {
  const taskPanelTopGap = 16;
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
    handleTopEssentialToggle,
  } = useTaskPanelController({
    backendUrl,
    deviceId,
    timezone,
    sessionId,
    initialSnapshot: initialTaskPanelState,
  });

  const chatModel = useMemo(
    () =>
      createWebSocketChatAdapter({
        backendUrl,
        deviceId,
        sessionId,
        timezone,
        onTaskPanelState: handleTaskPanelState,
      }),
    [backendUrl, deviceId, handleTaskPanelState, sessionId, timezone],
  );

  const runtime = useLocalRuntime(chatModel, {
    initialMessages: toThreadMessages(messages),
  });
  const taskPanelMaxHeight = Math.max(
    0,
    chatShellHeight - keyboardOffset - composerHeight - 12 - taskPanelTopGap,
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
            currentHeight === nextHeight ? currentHeight : nextHeight,
          );
        }}
      >
        <ThreadRoot style={styles.chatRoot}>
          <ThreadMessages
            style={styles.messagesList}
            contentContainerStyle={[styles.messagesContent, { paddingBottom: composerHeight + 12 }]}
            renderMessage={({ message }) => {
              const typingMessage = isAssistantTypingMessage(message);

              return (
                <MessageRoot
                  style={[
                    styles.messageBubble,
                    message.role === "user" ? styles.userBubble : styles.assistantBubble,
                    typingMessage && styles.typingBubble,
                  ]}
                >
                  {typingMessage ? (
                    <TypingDots />
                  ) : (
                    <MessageContent
                      renderText={({ part }) => (
                        <Text
                          style={[
                            styles.messageText,
                            message.role === "user" ? styles.userText : styles.assistantText,
                          ]}
                        >
                          {part.text}
                        </Text>
                      )}
                    />
                  )}
                </MessageRoot>
              );
            }}
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
                currentHeight === nextHeight ? currentHeight : nextHeight,
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
  const {
    activeThreadId,
    deviceId,
    initialTaskPanelState,
    isSessionOpening,
    loading,
    needsOnboarding,
    onCompleteOnboarding,
    onboardingBedtime,
    onboardingFormValid,
    onboardingGoals,
    onboardingSaving,
    onboardingStruggles,
    onboardingWakeTime,
    profileContext,
    setOnboardingBedtime,
    setOnboardingGoals,
    setOnboardingStruggles,
    setOnboardingWakeTime,
    timezone,
    visibleConversationKey,
    visibleMessages,
  } = useSessionLifecycle({ backendUrl: BACKEND_URL });

  const isChatInitializing =
    !deviceId ||
    !activeThreadId ||
    !visibleConversationKey ||
    (isSessionOpening && visibleMessages.length === 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.standaloneScreen}>
        <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />
        <View style={styles.chatPane}>
          <PendingTypingBubble />
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
        onboardingFormValid={onboardingFormValid}
        onboardingSaving={onboardingSaving}
        onboardingStatus={profileContext.onboarding_status}
        setOnboardingWakeTime={setOnboardingWakeTime}
        setOnboardingBedtime={setOnboardingBedtime}
        setOnboardingStruggles={setOnboardingStruggles}
        setOnboardingGoals={setOnboardingGoals}
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
          {isChatInitializing ? (
            <PendingTypingBubble />
          ) : (
            <ChatPane
              key={visibleConversationKey}
              backendUrl={BACKEND_URL}
              deviceId={deviceId}
              timezone={timezone}
              sessionId={activeThreadId}
              messages={visibleMessages}
              initialTaskPanelState={initialTaskPanelState}
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
    backgroundColor: "#f3f5f7",
  },
  standaloneScreen: {
    flex: 1,
    backgroundColor: "#f3f5f7",
    padding: 12,
  },
  pendingState: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 84,
  },
  content: {
    flex: 1,
    padding: 12,
  },
  chatPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d8e0ea",
    overflow: "hidden",
  },
  chatRootContainer: {
    flex: 1,
  },
  chatRoot: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 96,
    gap: 8,
  },
  messageBubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: "86%",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#0f1720",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#eef2f6",
  },
  typingBubble: {
    minHeight: 38,
    justifyContent: "center",
  },
  typingDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#6d7784",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: "#ffffff",
  },
  assistantText: {
    color: "#0f1720",
  },
});
