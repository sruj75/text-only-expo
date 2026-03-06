import { describe, expect, it } from "vitest";

import {
  buildHealthAnchors,
  buildPlaybookSummary,
  formatTimeForDisplay,
  parsePlaybookSummary,
  parseTimeInput
} from "../src/lib/onboarding";

describe("onboarding helpers", () => {
  it("formats stored time into 12-hour display", () => {
    expect(formatTimeForDisplay("07:30")).toBe("7:30 AM");
    expect(formatTimeForDisplay("23:15")).toBe("11:15 PM");
  });

  it("parses 12-hour time input into backend format", () => {
    expect(parseTimeInput("7:30 am")).toBe("07:30");
    expect(parseTimeInput("12 PM")).toBe("12:00");
    expect(parseTimeInput("12:05 AM")).toBe("00:05");
  });

  it("still accepts 24-hour input", () => {
    expect(parseTimeInput("23:30")).toBe("23:30");
  });

  it("builds and reads the onboarding summary", () => {
    const summary = buildPlaybookSummary({
      struggles: "I freeze when there are too many tasks.",
      goals: "Finish my top priority before noon.",
      motivationStyle: "motivation"
    });

    expect(summary).toBe(
      "Struggles: I freeze when there are too many tasks.\n" +
        "Goals: Finish my top priority before noon.\n" +
        "Motivation style: Motivation"
    );

    expect(parsePlaybookSummary(summary)).toEqual({
      struggles: "I freeze when there are too many tasks.",
      goals: "Finish my top priority before noon.",
      motivationStyle: "motivation"
    });
  });

  it("builds non-empty health anchors from onboarding inputs", () => {
    expect(
      buildHealthAnchors({
        wakeTime: "07:30",
        bedtime: "23:30",
        goals: "Finish my top priority before noon."
      })
    ).toEqual([
      "Morning reset around 7:30 AM",
      "Night shutdown around 11:30 PM",
      "Daily focus: Finish my top priority before noon"
    ]);
  });

  it("returns a fallback anchor when everything is empty", () => {
    expect(
      buildHealthAnchors({
        wakeTime: "",
        bedtime: "",
        goals: "   "
      })
    ).toEqual(["Daily consistency check-in"]);
  });
});
