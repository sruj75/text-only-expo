import { useCallback, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useAui } from "@assistant-ui/store";
import { useThreadIsRunning } from "@assistant-ui/react-native";

import { TaskPanelSheet } from "./TaskPanelSheet";
import type {
  TaskPanelSnapshot,
  TaskPanelTask,
  TaskPanelVisibility
} from "../types/chat";

type ChatFooterRailProps = {
  actionError: string | null;
  keyboardOffset: number;
  panelMaxHeight: number;
  pendingActionKey: string | null;
  refreshing: boolean;
  snapshot: TaskPanelSnapshot;
  visibility: TaskPanelVisibility;
  onComposerLayout?: (event: LayoutChangeEvent) => void;
  onClosePanel: () => void;
  onRefreshPanel: () => void;
  onTogglePanel: () => void;
  onToggleTaskStatus: (task: TaskPanelTask) => void;
  onToggleTopEssential: (task: TaskPanelTask) => void;
};

export const ChatFooterRail = ({
  actionError,
  keyboardOffset,
  panelMaxHeight,
  pendingActionKey,
  refreshing,
  snapshot,
  visibility,
  onComposerLayout,
  onClosePanel,
  onRefreshPanel,
  onTogglePanel,
  onToggleTaskStatus,
  onToggleTopEssential
}: ChatFooterRailProps) => {
  const aui = useAui();
  const threadIsRunning = useThreadIsRunning();
  const [draft, setDraft] = useState<string>("");
  const taskWorking = snapshot.run_status === "running";

  const handleSend = useCallback(() => {
    const nextDraft = draft.trim();
    if (!nextDraft || threadIsRunning) {
      return;
    }

    aui.composer().setText(nextDraft);
    aui.composer().send();
    setDraft("");
    Keyboard.dismiss();
  }, [aui, draft, threadIsRunning]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.footerRail, { bottom: keyboardOffset + 12 }]}
    >
      <TaskPanelSheet
        snapshot={snapshot}
        visibility={visibility}
        maxHeight={panelMaxHeight}
        pendingActionKey={pendingActionKey}
        refreshing={refreshing}
        actionError={actionError}
        onClose={onClosePanel}
        onRefresh={onRefreshPanel}
        onToggleTaskStatus={onToggleTaskStatus}
        onToggleTopEssential={onToggleTopEssential}
      />

      <View style={styles.composer} onLayout={onComposerLayout}>
        <Pressable
          onPress={onTogglePanel}
          accessibilityLabel="Toggle task workspace"
          style={[
            styles.panelToggleButton,
            taskWorking && styles.panelToggleButtonWorking
          ]}
        >
          <View style={styles.panelToggleIcon}>
            <View style={styles.panelToggleIconLine} />
            <View style={styles.panelToggleIconLine} />
            <View style={styles.panelToggleIconLine} />
          </View>
        </Pressable>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          style={styles.composerInput}
          placeholder="Type what is on your mind..."
          placeholderTextColor="#7f8a97"
          multiline
        />

        <Pressable
          onPress={handleSend}
          disabled={threadIsRunning || draft.trim().length === 0}
          accessibilityLabel="Send message"
          style={styles.sendButton}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  footerRail: {
    position: "absolute",
    left: 12,
    right: 12
  },
  composer: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end"
  },
  panelToggleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#0f1720",
    alignItems: "center",
    justifyContent: "center"
  },
  panelToggleButtonWorking: {
    backgroundColor: "#17803d"
  },
  panelToggleIcon: {
    gap: 4
  },
  panelToggleIconLine: {
    width: 16,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#ffffff"
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
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f1720"
  },
  sendButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 14
  }
});
