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
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";

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
            renderMessage={({ message }) => (
              <MessageRoot
                style={[
                  styles.messageBubble,
                  message.role === "user" ? styles.userBubble : styles.assistantBubble,
                ]}
              >
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
    loading,
    needsOnboarding,
    onCompleteOnboarding,
    onboardingBedtime,
    onboardingFormValid,
    onboardingGoals,
    onboardingMotivationStyle,
    onboardingSaving,
    onboardingStruggles,
    onboardingWakeTime,
    profileContext,
    setOnboardingBedtime,
    setOnboardingGoals,
    setOnboardingMotivationStyle,
    setOnboardingStruggles,
    setOnboardingWakeTime,
    timezone,
    visibleConversationKey,
    visibleMessages,
  } = useSessionLifecycle({ backendUrl: BACKEND_URL });

  if (loading) {
    return (
      <SafeAreaView style={styles.standaloneScreen}>
        <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />
        <View style={styles.standaloneState}>
          <Text style={styles.centeredTitle}>Getting Intentive ready...</Text>
          <Text style={styles.centeredSubtitle}>Loading your device and chat context.</Text>
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
              <Text style={styles.centeredSubtitle}>Getting the conversation ready for you.</Text>
            </View>
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
  },
  standaloneState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
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
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  centeredTitle: {
    color: "#0f1720",
    fontSize: 18,
    fontWeight: "700",
  },
  centeredSubtitle: {
    marginTop: 8,
    color: "#6d7784",
    textAlign: "center",
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
