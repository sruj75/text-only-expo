import { afterEach, describe, expect, it, vi } from "vitest";

const taskManagementAction = vi.fn();
const taskQueryAction = vi.fn();

vi.mock("../src/lib/api", () => ({
  taskManagementAction,
  taskQueryAction
}));

describe("task panel actions", () => {
  afterEach(() => {
    taskManagementAction.mockReset();
    taskQueryAction.mockReset();
  });

  it("updates task status then refreshes tasks", async () => {
    taskManagementAction
      .mockResolvedValueOnce({ status: "ok" });
    taskQueryAction.mockResolvedValueOnce({ task_panel: { tasks: [] } });

    const { syncTaskStatus } = await import("../src/lib/taskPanelActions");

    await syncTaskStatus({
      baseUrl: "http://localhost:8000",
      deviceId: "device-1",
      timezone: "UTC",
      sessionId: "session-1",
      task: {
        id: "task-1",
        title: "Follow up",
        status: "todo",
        time_label: null,
        is_active: false
      }
    });

    expect(taskManagementAction).toHaveBeenNthCalledWith(1, "http://localhost:8000", {
      device_id: "device-1",
      timezone: "UTC",
      session_id: "session-1",
      intent: "status",
      entities: {
        updates: [
          {
            task_id: "task-1",
            status: "done"
          }
        ]
      }
    });
    expect(taskQueryAction).toHaveBeenNthCalledWith(1, "http://localhost:8000", {
      device_id: "device-1",
      timezone: "UTC",
      session_id: "session-1",
      query: "tasks_overview",
      payload: {
        scope: "today"
      }
    });
  });

  it("refreshes the task workspace with tasks_overview query", async () => {
    taskQueryAction.mockResolvedValueOnce({
      task_panel: {
        run_status: "idle",
        tasks: [{ id: "task-3", title: "Inbox zero", status: "pending" }]
      }
    });

    const { refreshTaskPanel } = await import("../src/lib/taskPanelActions");

    const result = await refreshTaskPanel({
      baseUrl: "http://localhost:8000",
      deviceId: "device-1",
      timezone: "UTC",
      sessionId: "session-1"
    });

    expect(taskQueryAction).toHaveBeenCalledWith("http://localhost:8000", {
      device_id: "device-1",
      timezone: "UTC",
      session_id: "session-1",
      query: "tasks_overview",
      payload: {
        scope: "today"
      }
    });
    expect(result?.tasks[0].title).toBe("Inbox zero");
  });
});
