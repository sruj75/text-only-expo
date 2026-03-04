import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const DEVICE_ID_KEY = "intentive.device_id";
const DEVICE_CONTEXT_KEY = "intentive.device_context";

type StoredDeviceContext = {
  device_id: string;
  last_known_timezone: string;
};

const generateDeviceId = () => {
  if (typeof Crypto.randomUUID === "function") {
    return Crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parseContext = (raw: string | null): StoredDeviceContext | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDeviceContext;
    if (!parsed.device_id || !parsed.last_known_timezone) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const getOrCreateDeviceContext = async (
  timezone: string,
): Promise<StoredDeviceContext> => {
  const existingContext = parseContext(await AsyncStorage.getItem(DEVICE_CONTEXT_KEY));
  if (existingContext) {
    if (existingContext.last_known_timezone !== timezone) {
      const updated = {
        ...existingContext,
        last_known_timezone: timezone,
      };
      await AsyncStorage.setItem(DEVICE_CONTEXT_KEY, JSON.stringify(updated));
      return updated;
    }
    return existingContext;
  }

  const legacyDeviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  const deviceId = legacyDeviceId || generateDeviceId();
  const context: StoredDeviceContext = {
    device_id: deviceId,
    last_known_timezone: timezone,
  };

  await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  await AsyncStorage.setItem(DEVICE_CONTEXT_KEY, JSON.stringify(context));
  return context;
};

export const getOrCreateDeviceId = async () => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const context = await getOrCreateDeviceContext(timezone);
  return context.device_id;
};
