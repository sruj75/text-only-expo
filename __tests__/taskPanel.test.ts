import { describe, expect, it } from "vitest";

import {
  EMPTY_TASK_PANEL_SNAPSHOT,
  extractTaskPanelSnapshot,
  getCurrentFocusTitle,
  getTaskPanelHeightRatio,
  normalizeTaskPanelSnapshot,
} from "../src/lib/taskPanel";

describe("task panel helpers", () => {
  it("normalizes missing values into safe defaults", () => {
    const snapshot = normalizeTaskPanelSnapshot({
      run_status: "running",
      tasks: [{ id: "task-1", title: "Ship mobile UI" }]
    });

    expect(snapshot).toEqual({
      ...EMPTY_TASK_PANEL_SNAPSHOT,
      run_status: "running",
      tasks: [
        {
          id: "task-1",
          title: "Ship mobile UI",
          status: "todo",
          time_label: null,
          is_active: false
        }
      ]
    });
  });

  it("extracts snapshots from nested API payloads", () => {
    const snapshot = extractTaskPanelSnapshot({
      result: {
        task_panel: {
          run_status: "complete",
          tasks: [{ id: "task-2", title: "Review schedule", status: "done" }]
        }
      }
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.run_status).toBe("complete");
    expect(snapshot?.tasks[0].title).toBe("Review schedule");
  });

  it("returns full height only for expanded panels", () => {
    expect(getTaskPanelHeightRatio("closed")).toBe(0);
    expect(getTaskPanelHeightRatio("expanded")).toBe(1);
  });

  it("uses only time-derived active tasks for current focus", () => {
    expect(
      getCurrentFocusTitle({
        ...EMPTY_TASK_PANEL_SNAPSHOT,
        headline: "Live task changes will show here.",
        active_action: "Capturing tasks"
      })
    ).toBeNull();

    expect(
      getCurrentFocusTitle({
        ...EMPTY_TASK_PANEL_SNAPSHOT,
        tasks: [
          {
            id: "task-1",
            title: "Write landing page",
            status: "todo",
            time_label: null,
            is_active: false
          }
        ]
      })
    ).toBeNull();
  });
});
