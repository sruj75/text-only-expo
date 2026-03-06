import { describe, expect, it } from "vitest";

import {
  EMPTY_TASK_PANEL_SNAPSHOT,
  extractTaskPanelSnapshot,
  getTaskPanelVisibilityForSnapshot,
  normalizeTaskPanelSnapshot,
  shouldAutoCollapseTaskPanel
} from "../src/lib/taskPanel";
import type { TaskPanelSnapshot } from "../src/types/chat";

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

  it("opens preview when task work starts from a closed state", () => {
    const snapshot: TaskPanelSnapshot = {
      ...EMPTY_TASK_PANEL_SNAPSHOT,
      run_status: "running"
    };

    expect(getTaskPanelVisibilityForSnapshot("closed", snapshot)).toBe("preview");
  });

  it("keeps expanded panels open when work completes", () => {
    expect(shouldAutoCollapseTaskPanel("expanded", "complete")).toBe(false);
  });

  it("marks preview panels for auto-collapse after completion", () => {
    expect(shouldAutoCollapseTaskPanel("preview", "complete")).toBe(true);
    expect(shouldAutoCollapseTaskPanel("preview", "error")).toBe(true);
  });
});
