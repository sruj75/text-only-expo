import { afterEach, describe, expect, it, vi } from "vitest";

const taskManagementAction = vi.fn();

vi.mock("../src/lib/api", () => ({
  taskManagementAction
}));

describe("task panel actions", () => {
  afterEach(() => {
    taskManagementAction.mockReset();
  });

  it("updates task status then refreshes tasks", async () => {
    taskManagementAction
      .mockResolvedValueOnce({ status: "ok" })
      .mockResolvedValueOnce({ task_panel: { tasks: [] } });

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
        is_active: false,
        is_top_essential: false
      }
    });

    expect(taskManagementAction).toHaveBeenNthCalledWith(1, "http://localhost:8000", {
      device_id: "device-1",
      timezone: "UTC",
      session_id: "session-1",
      action: "update_task_status",
      payload: {
        task_id: "task-1",
        status: "done"
      }
    });
    expect(taskManagementAction).toHaveBeenNthCalledWith(2, "http://localhost:8000", {
      device_id: "device-1",
      timezone: "UTC",
      session_id: "session-1",
      action: "get_tasks"
    });
  });

  it("updates top essentials then refreshes tasks", async () => {
    taskManagementAction
      .mockResolvedValueOnce({ status: "ok" })
      .mockResolvedValueOnce({ task_panel: { tasks: [] } });

    const { syncTopEssential } = await import("../src/lib/taskPanelActions");

    await syncTopEssential({
      baseUrl: "http://localhost:8000",
      deviceId: "device-1",
      timezone: "UTC",
      sessionId: "session-1",
      task: {
        id: "task-1",
        title: "Follow up",
        status: "todo",
        time_label: null,
        is_active: false,
        is_top_essential: false
      },
      tasks: [
        {
          id: "task-1",
          title: "Follow up",
          status: "todo",
          time_label: null,
          is_active: false,
          is_top_essential: false
        },
        {
          id: "task-2",
          title: "Deep work",
          status: "todo",
          time_label: null,
          is_active: false,
          is_top_essential: true
        }
      ]
    });

    expect(taskManagementAction).toHaveBeenNthCalledWith(1, "http://localhost:8000", {
      device_id: "device-1",
      timezone: "UTC",
      session_id: "session-1",
      action: "set_top_essentials",
      payload: {
        task_ids: ["task-1", "task-2"]
      }
    });
    expect(taskManagementAction).toHaveBeenNthCalledWith(2, "http://localhost:8000", {
      device_id: "device-1",
      timezone: "UTC",
      session_id: "session-1",
      action: "get_tasks"
    });
  });

  it("refreshes the task workspace with get_tasks", async () => {
    taskManagementAction.mockResolvedValueOnce({
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

    expect(taskManagementAction).toHaveBeenCalledWith("http://localhost:8000", {
      device_id: "device-1",
      timezone: "UTC",
      session_id: "session-1",
      action: "get_tasks"
    });
    expect(result?.tasks[0].title).toBe("Inbox zero");
  });
});
