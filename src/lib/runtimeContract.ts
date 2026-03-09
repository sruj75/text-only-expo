import * as Crypto from "expo-crypto";

export const CONTRACT_VERSION =
  "2026-03-09";

export const RELEASE_ID = "mobile-client";

export const generateOpenId = (): string => {
  if (typeof Crypto.randomUUID === "function") {
    return `open_${Crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `open_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};
