import { useCallback, useEffect, useReducer, useState } from "react";

import { EMPTY_TASK_PANEL_SNAPSHOT, normalizeTaskPanelSnapshot } from "../lib/taskPanel";
import {
  refreshTaskPanel,
  syncTaskStatus,
  syncTopEssential
} from "../lib/taskPanelActions";
import type {
  TaskPanelSnapshot,
  TaskPanelTask,
  TaskPanelVisibility
} from "../types/chat";

type TaskPanelControllerArgs = {
  backendUrl: string;
  deviceId: string;
  timezone: string;
  sessionId: string;
  initialSnapshot?: TaskPanelSnapshot | null;
};

type TaskPanelState = {
  snapshot: TaskPanelSnapshot;
  visibility: TaskPanelVisibility;
};

type TaskPanelAction =
  | {
      type: "snapshot_received";
      snapshot: TaskPanelSnapshot;
    }
  | {
      type: "snapshot_replaced";
      snapshot: TaskPanelSnapshot;
    }
  | {
      type: "toggle_panel";
    }
  | {
      type: "close_panel";
    };

const initialTaskPanelState: TaskPanelState = {
  snapshot: EMPTY_TASK_PANEL_SNAPSHOT,
  visibility: "closed"
};

const taskPanelReducer = (
  state: TaskPanelState,
  action: TaskPanelAction
): TaskPanelState => {
  if (action.type === "snapshot_received") {
    return {
      snapshot: action.snapshot,
      visibility: state.visibility
    };
  }

  if (action.type === "snapshot_replaced") {
    return {
      ...state,
      snapshot: action.snapshot
    };
  }

  if (action.type === "toggle_panel") {
    return {
      ...state,
      visibility: state.visibility === "expanded" ? "closed" : "expanded"
    };
  }

  if (action.type === "close_panel") {
    return {
      ...state,
      visibility: "closed"
    };
  }

  return state;
};

export const useTaskPanelController = ({
  backendUrl,
  deviceId,
  timezone,
  sessionId,
  initialSnapshot,
}: TaskPanelControllerArgs) => {
  const [state, dispatch] = useReducer(taskPanelReducer, initialTaskPanelState);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);

  const handleTaskPanelState = useCallback((snapshot: TaskPanelSnapshot) => {
    dispatch({ type: "snapshot_received", snapshot });
  }, []);

  useEffect(() => {
    const snapshot = initialSnapshot ? normalizeTaskPanelSnapshot(initialSnapshot) : EMPTY_TASK_PANEL_SNAPSHOT;
    dispatch({ type: "snapshot_replaced", snapshot });
  }, [initialSnapshot, sessionId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const nextSnapshot = await refreshTaskPanel({
        baseUrl: backendUrl,
        deviceId,
        timezone,
        sessionId
      });

      if (nextSnapshot) {
        dispatch({ type: "snapshot_replaced", snapshot: nextSnapshot });
      }
    } catch (taskError) {
      console.warn("Task panel refresh failed", taskError);
    } finally {
      setRefreshing(false);
    }
  }, [backendUrl, deviceId, sessionId, timezone]);

  const handleTogglePanel = useCallback(() => {
    const opensExpanded = state.visibility === "closed";
    dispatch({ type: "toggle_panel" });

    if (opensExpanded && !refreshing) {
      void handleRefresh();
    }
  }, [handleRefresh, refreshing, state.visibility]);

  const handleClosePanel = useCallback(() => {
    dispatch({ type: "close_panel" });
  }, []);

  const handleTaskStatusToggle = useCallback(async (task: TaskPanelTask) => {
    const actionKey = `status:${task.id}`;
    setPendingActionKey(actionKey);

    try {
      const nextSnapshot = await syncTaskStatus({
        baseUrl: backendUrl,
        deviceId,
        timezone,
        sessionId,
        task
      });

      if (nextSnapshot) {
        dispatch({ type: "snapshot_replaced", snapshot: nextSnapshot });
      }
    } catch (taskError) {
      console.warn("Task status update failed", taskError);
    } finally {
      setPendingActionKey((currentKey) => (currentKey === actionKey ? null : currentKey));
    }
  }, [backendUrl, deviceId, sessionId, timezone]);

  const handleTopEssentialToggle = useCallback(async (task: TaskPanelTask) => {
    const actionKey = `essential:${task.id}`;
    setPendingActionKey(actionKey);

    try {
      const nextSnapshot = await syncTopEssential({
        baseUrl: backendUrl,
        deviceId,
        timezone,
        sessionId,
        task,
        tasks: state.snapshot.tasks
      });

      if (nextSnapshot) {
        dispatch({ type: "snapshot_replaced", snapshot: nextSnapshot });
      }
    } catch (taskError) {
      console.warn("Top essential update failed", taskError);
    } finally {
      setPendingActionKey((currentKey) => (currentKey === actionKey ? null : currentKey));
    }
  }, [backendUrl, deviceId, sessionId, state.snapshot.tasks, timezone]);

  return {
    taskPanelSnapshot: state.snapshot,
    taskPanelVisibility: state.visibility,
    pendingTaskActionKey: pendingActionKey,
    handleClosePanel,
    handleTaskPanelState,
    handleTaskStatusToggle,
    handleTogglePanel,
    handleTopEssentialToggle
  };
};
