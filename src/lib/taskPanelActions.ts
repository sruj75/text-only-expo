import { taskManagementAction } from "./api";
import { extractTaskPanelSnapshot } from "./taskPanel";
import type { TaskPanelSnapshot, TaskPanelTask } from "../types/chat";

type BaseTaskPanelActionParams = {
  baseUrl: string;
  deviceId: string;
  timezone: string;
  sessionId: string;
};

export const refreshTaskPanel = async ({
  baseUrl,
  deviceId,
  timezone,
  sessionId
}: BaseTaskPanelActionParams): Promise<TaskPanelSnapshot | null> => {
  const response = await taskManagementAction(baseUrl, {
    device_id: deviceId,
    timezone,
    session_id: sessionId,
    action: "get_tasks"
  });

  return extractTaskPanelSnapshot(response);
};

export const syncTaskStatus = async (
  params: BaseTaskPanelActionParams & {
    task: TaskPanelTask;
  }
): Promise<TaskPanelSnapshot | null> => {
  const nextStatus = params.task.status === "done" ? "todo" : "done";

  await taskManagementAction(params.baseUrl, {
    device_id: params.deviceId,
    timezone: params.timezone,
    session_id: params.sessionId,
    action: "update_task_status",
    payload: {
      task_id: params.task.id,
      status: nextStatus
    }
  });

  return refreshTaskPanel(params);
};

export const syncTopEssential = async (
  params: BaseTaskPanelActionParams & {
    task: TaskPanelTask;
    tasks: TaskPanelTask[];
  }
): Promise<TaskPanelSnapshot | null> => {
  const nextTaskIds = params.task.is_top_essential
    ? params.tasks.filter((task) => task.id !== params.task.id && task.is_top_essential)
    : params.tasks.filter((task) => task.is_top_essential || task.id === params.task.id);

  await taskManagementAction(params.baseUrl, {
    device_id: params.deviceId,
    timezone: params.timezone,
    session_id: params.sessionId,
    action: "set_top_essentials",
    payload: {
      task_ids: nextTaskIds.map((task) => task.id)
    }
  });

  return refreshTaskPanel(params);
};
