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
      tasks: [{ id: "task-1", title: "Ship mobile UI" }],
      top_essentials: ["Ship mobile UI"]
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
          is_active: false,
          is_top_essential: false
        }
      ],
      top_essentials: ["Ship mobile UI"]
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

  it("uses only task titles for current focus and ignores backend status copy", () => {
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
            is_active: false,
            is_top_essential: false
          }
        ]
      })
    ).toBe("Write landing page");
  });
});
