import { beforeEach, describe, expect, it, vi } from "vitest";

const { getItem, setItem, randomUUID } = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  randomUUID: vi.fn()
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem,
    setItem
  }
}));

vi.mock("expo-crypto", () => ({
  randomUUID
}));

import { getOrCreateDeviceContext } from "../src/lib/device";

describe("getOrCreateDeviceContext", () => {
  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset();
    randomUUID.mockReset();
  });

  it("reuses existing context and updates timezone when changed", async () => {
    getItem.mockResolvedValueOnce(
      JSON.stringify({ device_id: "existing-device-id", last_known_timezone: "UTC" })
    );

    const value = await getOrCreateDeviceContext("Asia/Kolkata");

    expect(value).toEqual({
      device_id: "existing-device-id",
      last_known_timezone: "Asia/Kolkata"
    });
    expect(setItem).toHaveBeenCalledWith(
      "intentive.device_context",
      JSON.stringify({
        device_id: "existing-device-id",
        last_known_timezone: "Asia/Kolkata"
      })
    );
  });

  it("migrates legacy device id and stores context", async () => {
    getItem.mockResolvedValueOnce(null).mockResolvedValueOnce("legacy-device-id");

    const value = await getOrCreateDeviceContext("UTC");

    expect(value).toEqual({
      device_id: "legacy-device-id",
      last_known_timezone: "UTC"
    });
    expect(setItem).toHaveBeenCalledWith("intentive.device_id", "legacy-device-id");
    expect(setItem).toHaveBeenCalledWith(
      "intentive.device_context",
      JSON.stringify({ device_id: "legacy-device-id", last_known_timezone: "UTC" })
    );
  });

  it("creates a new device id when nothing exists", async () => {
    getItem.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    randomUUID.mockReturnValueOnce("generated-id");

    const value = await getOrCreateDeviceContext("UTC");

    expect(value).toEqual({
      device_id: "generated-id",
      last_known_timezone: "UTC"
    });
    expect(setItem).toHaveBeenCalledWith("intentive.device_id", "generated-id");
  });
});
