import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

describe("notifications bootstrap", () => {
  it("shows foreground notifications in App", () => {
    const source = read("App.tsx");
    expect(source).toContain("Notifications.setNotificationHandler");
    expect(source).toContain("shouldShowBanner: true");
    expect(source).toContain("shouldShowList: true");
  });
});
