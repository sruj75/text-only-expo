import { taskManagementAction, taskQueryAction } from "./api";
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
  const response = await taskQueryAction(baseUrl, {
    device_id: deviceId,
    timezone,
    session_id: sessionId,
    query: "tasks_overview",
    payload: { scope: "today" }
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
    intent: "status",
    entities: {
      updates: [
        {
      task_id: params.task.id,
      status: nextStatus
        }
      ]
    }
  });

  return refreshTaskPanel(params);
};
