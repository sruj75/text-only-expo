import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { getCurrentFocusTitle, getTaskPanelHeightRatio } from "../lib/taskPanel";
import type { TaskPanelSnapshot, TaskPanelTask, TaskPanelVisibility } from "../types/chat";

type TaskPanelSheetProps = {
  snapshot: TaskPanelSnapshot;
  visibility: TaskPanelVisibility;
  maxHeight: number;
  pendingActionKey: string | null;
  actionError: string | null;
  onClose: () => void;
  onToggleTaskStatus: (task: TaskPanelTask) => void;
  onToggleTopEssential: (task: TaskPanelTask) => void;
};

export const TaskPanelSheet = ({
  snapshot,
  visibility,
  maxHeight,
  pendingActionKey,
  actionError,
  onClose,
  onToggleTaskStatus,
  onToggleTopEssential
}: TaskPanelSheetProps) => {
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const handlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 48) {
            onClose();
          }
        }
      }),
    [onClose]
  );

  const targetHeight = useMemo(() => {
    return Math.max(0, maxHeight * getTaskPanelHeightRatio(visibility));
  }, [maxHeight, visibility]);

  useEffect(() => {
    Animated.spring(animatedHeight, {
      toValue: targetHeight,
      damping: 18,
      stiffness: 160,
      mass: 0.9,
      useNativeDriver: false
    }).start();
  }, [animatedHeight, targetHeight]);

  const panelVisible = visibility !== "closed" || targetHeight > 0;
  const topEssentials =
    snapshot.top_essentials.length > 0
      ? snapshot.top_essentials
      : snapshot.tasks.filter((task) => task.is_top_essential).map((task) => task.title);
  const currentFocusTitle = getCurrentFocusTitle(snapshot);

  return (
    <Animated.View
      pointerEvents={panelVisible ? "auto" : "none"}
      style={[
        styles.panelShell,
        {
          height: animatedHeight,
          opacity: animatedHeight.interpolate({
            inputRange: [0, 80],
            outputRange: [0, 1],
            extrapolate: "clamp"
          })
        }
      ]}
    >
      <View style={styles.panel} {...handlePanResponder.panHandlers}>
        <View style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>Task Manager</Text>

        {snapshot.error_message || actionError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{snapshot.error_message || actionError}</Text>
          </View>
        ) : null}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Now</Text>
            {currentFocusTitle ? (
              <Text style={styles.nowText}>{currentFocusTitle}</Text>
            ) : (
              <Text style={styles.emptyText}>Nothing to do yet.</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Priorities</Text>
            {topEssentials.length > 0 ? (
              <View style={styles.priorityList}>
                {topEssentials.map((item) => (
                  <Text key={item} style={styles.priorityText}>
                    {item}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No priorities yet.</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tasks</Text>
            {snapshot.tasks.length > 0 ? (
              <View style={styles.taskList}>
                {snapshot.tasks.map((task) => {
                  const doneActionKey = `status:${task.id}`;
                  const essentialActionKey = `essential:${task.id}`;
                  const statusPending = pendingActionKey === doneActionKey;
                  const essentialPending = pendingActionKey === essentialActionKey;

                  return (
                    <View key={task.id} style={styles.taskRow}>
                      <Pressable
                        disabled={statusPending}
                        onPress={() => onToggleTaskStatus(task)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          task.status === "done" ? `Mark ${task.title} as not done` : `Mark ${task.title} done`
                        }
                        style={[styles.taskCheckButton, statusPending && styles.controlDisabled]}
                      >
                        <Text style={styles.taskCheckText}>
                          {task.status === "done" ? "[x]" : "[ ]"}
                        </Text>
                      </Pressable>

                      <Text
                        style={[
                          styles.taskText,
                          task.status === "done" && styles.taskTextDone
                        ]}
                      >
                        {task.title}
                      </Text>

                      <Pressable
                        disabled={essentialPending}
                        onPress={() => onToggleTopEssential(task)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          task.is_top_essential
                            ? `Remove ${task.title} from priorities`
                            : `Add ${task.title} to priorities`
                        }
                        style={[
                          styles.priorityToggleButton,
                          essentialPending && styles.controlDisabled
                        ]}
                      >
                        <Text
                          style={[
                            styles.priorityToggleText,
                            task.is_top_essential && styles.priorityToggleTextActive
                          ]}
                        >
                          {task.is_top_essential ? "★" : "☆"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyText}>No tasks yet.</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            {snapshot.schedule.length > 0 ? (
              <View style={styles.scheduleList}>
                {snapshot.schedule.map((block) => (
                  <View key={block.id} style={styles.scheduleRow}>
                    <Text style={styles.scheduleTime}>{block.start_label}</Text>
                    <Text style={styles.scheduleTitle}>{block.title}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No schedule yet.</Text>
            )}
          </View>
        </ScrollView>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  panelShell: {
    overflow: "hidden"
  },
  panel: {
    flex: 1,
    marginTop: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dedede",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18
  },
  handleArea: {
    alignItems: "center",
    marginBottom: 14
  },
  handle: {
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d4d4d4",
    alignSelf: "center"
  },
  title: {
    color: "#0f1720",
    fontSize: 20,
    fontWeight: "700"
  },
  errorCard: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#ffe9e6",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  errorText: {
    color: "#822727",
    fontSize: 13,
    lineHeight: 18
  },
  scrollView: {
    flex: 1,
    marginTop: 18
  },
  scrollContent: {
    paddingBottom: 12,
    gap: 24
  },
  section: {
    gap: 10
  },
  sectionTitle: {
    color: "#0f1720",
    fontSize: 14,
    fontWeight: "700"
  },
  nowText: {
    color: "#0f1720",
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "500"
  },
  priorityList: {
    gap: 8
  },
  priorityText: {
    color: "#0f1720",
    fontSize: 16,
    lineHeight: 22
  },
  taskList: {
    gap: 10
  },
  taskRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  taskCheckButton: {
    minWidth: 28,
    alignItems: "flex-start",
    justifyContent: "center"
  },
  taskCheckText: {
    color: "#0f1720",
    fontSize: 16,
    lineHeight: 20
  },
  taskText: {
    flex: 1,
    color: "#0f1720",
    fontSize: 15,
    lineHeight: 22
  },
  taskTextDone: {
    color: "#7a8593",
    textDecorationLine: "line-through"
  },
  priorityToggleButton: {
    minWidth: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  priorityToggleText: {
    color: "#c0c7d1",
    fontSize: 18,
    lineHeight: 18
  },
  priorityToggleTextActive: {
    color: "#0f1720"
  },
  controlDisabled: {
    opacity: 0.6
  },
  scheduleList: {
    gap: 8
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12
  },
  scheduleTime: {
    width: 56,
    color: "#0f1720",
    fontWeight: "500",
    fontSize: 12
  },
  scheduleTitle: {
    flex: 1,
    color: "#0f1720",
    fontSize: 14,
    lineHeight: 20
  },
  emptyText: {
    color: "#6d7784",
    fontSize: 13,
    lineHeight: 19
  }
});
