import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { getTaskPanelHeightRatio } from "../lib/taskPanel";
import type {
  TaskPanelRunStatus,
  TaskPanelSnapshot,
  TaskPanelTask,
  TaskPanelVisibility
} from "../types/chat";

type TaskPanelSheetProps = {
  snapshot: TaskPanelSnapshot;
  visibility: TaskPanelVisibility;
  maxHeight: number;
  pendingActionKey: string | null;
  refreshing: boolean;
  actionError: string | null;
  onRefresh: () => void;
  onToggleTaskStatus: (task: TaskPanelTask) => void;
  onToggleTopEssential: (task: TaskPanelTask) => void;
};

const statusCopy: Record<TaskPanelRunStatus, string> = {
  idle: "Idle",
  running: "Working",
  complete: "Done",
  error: "Error"
};

const taskStatusLabel = (status: string) => {
  if (status === "done") {
    return "Done";
  }

  if (status === "in_progress") {
    return "In progress";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  return "To do";
};

export const TaskPanelSheet = ({
  snapshot,
  visibility,
  maxHeight,
  pendingActionKey,
  refreshing,
  actionError,
  onRefresh,
  onToggleTaskStatus,
  onToggleTopEssential
}: TaskPanelSheetProps) => {
  const animatedHeight = useRef(new Animated.Value(0)).current;

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
      <View style={styles.panel}>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <View style={styles.headerTextGroup}>
            <Text style={styles.title}>Task Workspace</Text>
            <Text style={styles.subtitle}>
              {snapshot.headline || snapshot.active_action || "Live task changes will show here."}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={onRefresh}
              disabled={refreshing}
              style={[styles.refreshButton, refreshing && styles.taskActionDisabled]}
            >
              <Text style={styles.refreshButtonText}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </Text>
            </Pressable>

            <View style={[styles.statusChip, statusChipStyles[snapshot.run_status]]}>
              <Text style={styles.statusChipText}>{statusCopy[snapshot.run_status]}</Text>
            </View>
          </View>
        </View>

        {snapshot.active_action ? (
          <View style={styles.activeActionBadge}>
            <Text style={styles.activeActionText}>{snapshot.active_action}</Text>
          </View>
        ) : null}

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
            <Text style={styles.sectionTitle}>Top essentials</Text>
            {topEssentials.length > 0 ? (
              <View style={styles.chips}>
                {topEssentials.map((item) => (
                  <View key={item} style={styles.essentialChip}>
                    <Text style={styles.essentialChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No top essentials yet.</Text>
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
                    <View
                      key={task.id}
                      style={[styles.taskCard, task.is_active && styles.taskCardActive]}
                    >
                      <View style={styles.taskHeader}>
                        <View style={styles.taskTitleGroup}>
                          <Text style={styles.taskTitle}>{task.title}</Text>
                          <Text style={styles.taskMeta}>
                            {taskStatusLabel(task.status)}
                            {task.time_label ? ` • ${task.time_label}` : ""}
                          </Text>
                        </View>

                        {task.is_active ? (
                          <View style={styles.livePill}>
                            <Text style={styles.livePillText}>Live</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.taskActions}>
                        <Pressable
                          disabled={statusPending}
                          onPress={() => onToggleTaskStatus(task)}
                          style={[
                            styles.taskActionButton,
                            styles.taskActionPrimary,
                            statusPending && styles.taskActionDisabled
                          ]}
                        >
                          <Text style={styles.taskActionPrimaryText}>
                            {statusPending
                              ? "Saving..."
                              : task.status === "done"
                                ? "Undo done"
                                : "Mark done"}
                          </Text>
                        </Pressable>

                        <Pressable
                          disabled={essentialPending}
                          onPress={() => onToggleTopEssential(task)}
                          style={[
                            styles.taskActionButton,
                            styles.taskActionSecondary,
                            essentialPending && styles.taskActionDisabled
                          ]}
                        >
                          <Text style={styles.taskActionSecondaryText}>
                            {essentialPending
                              ? "Saving..."
                              : task.is_top_essential
                                ? "Remove essential"
                                : "Make essential"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyText}>
                Tasks, priorities, and time boxes will appear here when the agent starts working.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today&apos;s schedule</Text>
            {snapshot.schedule.length > 0 ? (
              <View style={styles.scheduleList}>
                {snapshot.schedule.map((block) => (
                  <View key={block.id} style={styles.scheduleRow}>
                    <Text style={styles.scheduleTime}>
                      {block.start_label} - {block.end_label}
                    </Text>
                    <View style={styles.scheduleTextGroup}>
                      <Text style={styles.scheduleTitle}>{block.title}</Text>
                      {block.status ? (
                        <Text style={styles.scheduleMeta}>{block.status}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No time blocks yet.</Text>
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
    borderColor: "#d8e0ea",
    backgroundColor: "#fbfcfd",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16
  },
  handle: {
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#c9d2dd",
    alignSelf: "center",
    marginBottom: 12
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  headerTextGroup: {
    flex: 1
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8
  },
  title: {
    color: "#0f1720",
    fontSize: 20,
    fontWeight: "800"
  },
  subtitle: {
    marginTop: 4,
    color: "#59636f",
    fontSize: 13,
    lineHeight: 18
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  refreshButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c9d2dd",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  refreshButtonText: {
    color: "#0f1720",
    fontSize: 12,
    fontWeight: "700"
  },
  statusIdle: {
    backgroundColor: "#eef2f6"
  },
  statusRunning: {
    backgroundColor: "#dfeeff"
  },
  statusComplete: {
    backgroundColor: "#dff5e5"
  },
  statusError: {
    backgroundColor: "#ffe3e1"
  },
  statusChipText: {
    color: "#0f1720",
    fontWeight: "700",
    fontSize: 12
  },
  activeActionBadge: {
    alignSelf: "flex-start",
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: "#0f1720",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  activeActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700"
  },
  errorCard: {
    marginTop: 12,
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
    marginTop: 14
  },
  scrollContent: {
    paddingBottom: 12,
    gap: 16
  },
  section: {
    gap: 10
  },
  sectionTitle: {
    color: "#0f1720",
    fontSize: 14,
    fontWeight: "800"
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  essentialChip: {
    borderRadius: 999,
    backgroundColor: "#0f1720",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  essentialChipText: {
    color: "#ffffff",
    fontWeight: "600"
  },
  taskList: {
    gap: 10
  },
  taskCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e0ea",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 12
  },
  taskCardActive: {
    borderColor: "#0f1720",
    shadowColor: "#0f1720",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  taskHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  taskTitleGroup: {
    flex: 1
  },
  taskTitle: {
    color: "#0f1720",
    fontSize: 15,
    fontWeight: "700"
  },
  taskMeta: {
    marginTop: 4,
    color: "#6d7784",
    fontSize: 12
  },
  livePill: {
    borderRadius: 999,
    backgroundColor: "#eef2f6",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  livePillText: {
    color: "#0f1720",
    fontSize: 11,
    fontWeight: "700"
  },
  taskActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  taskActionButton: {
    minHeight: 38,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  taskActionPrimary: {
    backgroundColor: "#0f1720"
  },
  taskActionSecondary: {
    borderWidth: 1,
    borderColor: "#c9d2dd",
    backgroundColor: "#ffffff"
  },
  taskActionDisabled: {
    opacity: 0.6
  },
  taskActionPrimaryText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  taskActionSecondaryText: {
    color: "#0f1720",
    fontWeight: "700"
  },
  scheduleList: {
    gap: 10
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d8e0ea",
    padding: 12
  },
  scheduleTime: {
    width: 92,
    color: "#0f1720",
    fontWeight: "700",
    fontSize: 12
  },
  scheduleTextGroup: {
    flex: 1
  },
  scheduleTitle: {
    color: "#0f1720",
    fontWeight: "700",
    fontSize: 14
  },
  scheduleMeta: {
    marginTop: 3,
    color: "#6d7784",
    fontSize: 12
  },
  emptyText: {
    color: "#6d7784",
    fontSize: 13,
    lineHeight: 19
  }
});

const statusChipStyles = {
  idle: styles.statusIdle,
  running: styles.statusRunning,
  complete: styles.statusComplete,
  error: styles.statusError
};
