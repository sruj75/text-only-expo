import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

describe("ui error surfaces", () => {
  it("does not render inline onboarding/chat error text in App", () => {
    const source = read("App.tsx");
    expect(source).not.toContain("styles.authError");
    expect(source).not.toContain("styles.errorText");
  });

  it("does not render task panel error cards", () => {
    const source = read("src/components/TaskPanelSheet.tsx");
    expect(source).not.toContain("snapshot.error_message");
    expect(source).not.toContain("errorCard");
  });
});
