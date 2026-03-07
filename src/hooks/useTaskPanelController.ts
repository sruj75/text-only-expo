import { useCallback, useReducer, useState } from "react";

import { EMPTY_TASK_PANEL_SNAPSHOT } from "../lib/taskPanel";
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
  sessionId
}: TaskPanelControllerArgs) => {
  const [state, dispatch] = useReducer(taskPanelReducer, initialTaskPanelState);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);

  const handleTaskPanelState = useCallback((snapshot: TaskPanelSnapshot) => {
    setActionError(null);
    dispatch({ type: "snapshot_received", snapshot });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setActionError(null);

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
      setActionError(
        taskError instanceof Error ? taskError.message : "Could not refresh task workspace."
      );
    } finally {
      setRefreshing(false);
    }
  }, [backendUrl, deviceId, sessionId, timezone]);

  const handleTogglePanel = useCallback(() => {
    const opensExpanded = state.visibility === "closed";
    dispatch({ type: "toggle_panel" });

    if (
      opensExpanded &&
      !refreshing &&
      state.snapshot.tasks.length === 0 &&
      state.snapshot.schedule.length === 0
    ) {
      void handleRefresh();
    }
  }, [handleRefresh, refreshing, state.snapshot.schedule.length, state.snapshot.tasks.length, state.visibility]);

  const handleClosePanel = useCallback(() => {
    dispatch({ type: "close_panel" });
  }, []);

  const handleTaskStatusToggle = useCallback(async (task: TaskPanelTask) => {
    const actionKey = `status:${task.id}`;
    setPendingActionKey(actionKey);
    setActionError(null);

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
      setActionError(
        taskError instanceof Error ? taskError.message : "Could not update task status."
      );
    } finally {
      setPendingActionKey((currentKey) => (currentKey === actionKey ? null : currentKey));
    }
  }, [backendUrl, deviceId, sessionId, timezone]);

  const handleTopEssentialToggle = useCallback(async (task: TaskPanelTask) => {
    const actionKey = `essential:${task.id}`;
    setPendingActionKey(actionKey);
    setActionError(null);

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
      setActionError(
        taskError instanceof Error ? taskError.message : "Could not update top essential."
      );
    } finally {
      setPendingActionKey((currentKey) => (currentKey === actionKey ? null : currentKey));
    }
  }, [backendUrl, deviceId, sessionId, state.snapshot.tasks, timezone]);

  return {
    taskPanelSnapshot: state.snapshot,
    taskPanelVisibility: state.visibility,
    taskActionError: actionError,
    pendingTaskActionKey: pendingActionKey,
    handleClosePanel,
    handleTaskPanelState,
    handleTaskStatusToggle,
    handleTogglePanel,
    handleTopEssentialToggle
  };
};
