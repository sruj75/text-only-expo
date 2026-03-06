import type {
  ChatModelAdapter,
  ChatModelRunResult,
  ThreadMessage
} from "@assistant-ui/react-native";
import { normalizeTaskPanelSnapshot } from "./taskPanel";
import type { EntryContext, TaskPanelSnapshot } from "../types/chat";

type AdapterConfig = {
  backendUrl: string;
  deviceId: string;
  sessionId: string;
  timezone: string;
  getEntryContext: () => EntryContext | null;
  onTaskPanelState?: (snapshot: TaskPanelSnapshot) => void;
};

type WsServerFrame =
  | {
      type: "session_ready";
      session_id: string;
    }
  | {
      type: "assistant_delta";
      message_id: string;
      delta: string;
      text?: string;
    }
  | {
      type: "assistant_done";
      message_id: string;
      text: string;
    }
  | {
      type: "task_panel_state";
      state: TaskPanelSnapshot | Record<string, unknown>;
    }
  | {
      type: "error";
      code?: string;
      detail?: string;
    }
  | {
      type: "pong";
    };

const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, "");

const toWsUrl = (
  backendUrl: string,
  params: Record<string, string>,
): string => {
  const url = new URL(trimTrailingSlashes(backendUrl));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/agent/ws";

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
};

const randomId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const textFromMessage = (message: ThreadMessage | undefined): string => {
  if (!message || message.role !== "user") {
    return "";
  }

  const parts = message.content;
  return parts
    .map((part) => {
      if (part.type === "text") return part.text;
      return "";
    })
    .join(" ")
    .trim();
};

const toAssistantUpdate = (text: string): ChatModelRunResult => ({
  content: [
    {
      type: "text",
      text,
    },
  ],
});

export const createWebSocketChatAdapter = (
  config: AdapterConfig,
): ChatModelAdapter => {
  return {
    async *run(options): AsyncGenerator<ChatModelRunResult, void> {
      const lastUserMessage = [...options.messages]
        .reverse()
        .find((message) => message.role === "user");
      const userText = textFromMessage(lastUserMessage);

      if (!userText) {
        return;
      }

      const wsUrl = toWsUrl(config.backendUrl, {
        device_id: config.deviceId,
        session_id: config.sessionId,
        timezone: config.timezone,
        entry_mode: config.getEntryContext()?.entry_mode ?? "reactive",
      });

      const socket = new WebSocket(wsUrl);
      const frameQueue: WsServerFrame[] = [];
      let consumeResolver: ((frame: WsServerFrame) => void) | null = null;
      let consumeRejecter: ((error: Error) => void) | null = null;
      let terminalError: Error | null = null;

      const consumeFrame = () =>
        new Promise<WsServerFrame>((resolve, reject) => {
          if (frameQueue.length > 0) {
            const frame = frameQueue.shift();
            if (frame) {
              resolve(frame);
              return;
            }
          }

          if (terminalError) {
            reject(terminalError);
            return;
          }

          consumeResolver = resolve;
          consumeRejecter = reject;
        });

      const pushFrame = (frame: WsServerFrame) => {
        if (consumeResolver) {
          const resolver = consumeResolver;
          consumeResolver = null;
          consumeRejecter = null;
          resolver(frame);
          return;
        }
        frameQueue.push(frame);
      };

      const failFrameStream = (error: Error) => {
        terminalError = error;
        if (consumeRejecter) {
          const rejecter = consumeRejecter;
          consumeResolver = null;
          consumeRejecter = null;
          rejecter(error);
        }
      };

      const opened = new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("WebSocket failed to connect"));
      });

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as WsServerFrame;
          pushFrame(parsed);
        } catch {
          pushFrame({
            type: "error",
            code: "invalid_server_frame",
            detail: "Server sent an invalid frame",
          });
        }
      };

      socket.onclose = () => {
        failFrameStream(new Error("WebSocket closed before response completed"));
      };

      const abortHandler = () => {
        failFrameStream(new Error("Request aborted"));
        socket.close();
      };

      options.abortSignal.addEventListener("abort", abortHandler);

      try {
        await opened;

        const initFrame = {
          type: "init",
          device_id: config.deviceId,
          session_id: config.sessionId,
          timezone: config.timezone,
          entry_context: config.getEntryContext(),
        };
        socket.send(JSON.stringify(initFrame));

        const userMessageId = randomId();
        socket.send(
          JSON.stringify({
            type: "user_message",
            message_id: userMessageId,
            text: userText,
          }),
        );

        let cumulative = "";
        while (true) {
          const frame = await consumeFrame();

          if (frame.type === "assistant_delta") {
            cumulative = frame.text ?? `${cumulative}${frame.delta}`;
            yield toAssistantUpdate(cumulative);
            continue;
          }

          if (frame.type === "assistant_done") {
            if (frame.text !== cumulative) {
              cumulative = frame.text;
              yield toAssistantUpdate(cumulative);
            }
            return;
          }

          if (frame.type === "task_panel_state") {
            config.onTaskPanelState?.(normalizeTaskPanelSnapshot(frame.state));
            continue;
          }

          if (frame.type === "error") {
            throw new Error(frame.detail ?? frame.code ?? "Server error");
          }
        }
      } finally {
        options.abortSignal.removeEventListener("abort", abortHandler);
        socket.close();
      }
    },
  };
};
