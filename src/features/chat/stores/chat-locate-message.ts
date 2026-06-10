import { Store } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";

interface ChatLocateMessageState {
  requestId: number;
  channelId: string;
  channelType: number;
  messageSeq: number | null;
  strategy: "history" | "window";
}

export const chatLocateMessageStore = new Store<ChatLocateMessageState>({
  requestId: 0,
  channelId: "",
  channelType: 0,
  messageSeq: null,
  strategy: "history",
});

export const chatLocateMessageActions = {
  request(
    channel: Channel,
    messageSeq: number,
    options?: { strategy?: "history" | "window" },
  ): void {
    chatLocateMessageStore.setState((prev) => ({
      requestId: prev.requestId + 1,
      channelId: channel.channelID,
      channelType: channel.channelType,
      messageSeq,
      strategy: options?.strategy ?? "history",
    }));
  },
  clear(requestId: number): void {
    chatLocateMessageStore.setState((prev) => {
      if (prev.requestId !== requestId) return prev;
      return { ...prev, messageSeq: null };
    });
  },
};
