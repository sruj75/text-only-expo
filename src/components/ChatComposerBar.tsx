import { ComposerInput, ComposerRoot, ComposerSend } from "@assistant-ui/react-native";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TaskPanelVisibility } from "../types/chat";

type ChatComposerBarProps = {
  panelVisibility: TaskPanelVisibility;
  onTogglePanel: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

export const ChatComposerBar = ({
  panelVisibility,
  onTogglePanel,
  onLayout,
  style
}: ChatComposerBarProps) => {
  const panelOpen = panelVisibility !== "closed";

  return (
    <View style={style} onLayout={onLayout}>
      <ComposerRoot style={styles.composer}>
        <Pressable onPress={onTogglePanel} style={styles.panelToggleButton}>
          <Text style={styles.panelToggleButtonText}>{panelOpen ? "-" : "+"}</Text>
        </Pressable>

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
    </View>
  );
};

const styles = StyleSheet.create({
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
  panelToggleButtonText: {
    color: "#ffffff",
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "700"
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
