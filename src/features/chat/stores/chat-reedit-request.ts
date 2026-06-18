import { Store } from "@tanstack/react-store";
import type { JSONContent } from "@tiptap/react";
import type { Channel } from "wukongimjssdk";

export interface ReeditRequest {
  content: JSONContent[];
  nonce: number;
}

interface ChatReeditRequestState {
  pending: Map<string, ReeditRequest>;
}

function channelKey(channel: Channel): string {
  return `${channel.channelID}_${channel.channelType}`;
}

let nonceCounter = 0;

export const chatReeditRequestStore = new Store<ChatReeditRequestState>({
  pending: new Map(),
});

export const chatReeditRequestActions = {
  request: (channel: Channel, content: JSONContent[]) =>
    chatReeditRequestStore.setState((s) => {
      const next = new Map(s.pending);
      next.set(channelKey(channel), { content, nonce: ++nonceCounter });
      return { pending: next };
    }),

  consume: (channel: Channel) =>
    chatReeditRequestStore.setState((s) => {
      const key = channelKey(channel);
      if (!s.pending.has(key)) return s;
      const next = new Map(s.pending);
      next.delete(key);
      return { pending: next };
    }),
};

export function selectPendingReedit(
  state: ChatReeditRequestState,
  channel: Channel | null,
): ReeditRequest | null {
  if (!channel) return null;
  return state.pending.get(channelKey(channel)) ?? null;
}
