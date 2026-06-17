import type { QueryClient } from "@tanstack/react-query";
import WKSDK, { type Channel, type Conversation } from "wukongimjssdk";
import type { ThreadRaw } from "@/features/base/api/endpoints/group.api";
import { conversationsQueryKey } from "@/features/chat/queries/conversations.query";

interface RemoveThreadConversationOptions {
  groupNo?: string;
  shortId?: string;
}

export function removeThreadConversation(
  channel: Channel,
  queryClient: QueryClient,
  spaceId: string | null,
  opts?: RemoveThreadConversationOptions,
): void {
  const sdk = WKSDK.shared();
  sdk.channelManager.deleteChannelInfo(channel);
  sdk.conversationManager.removeConversation(channel);
  queryClient.setQueryData<Conversation[]>(conversationsQueryKey(spaceId), (old) =>
    Array.isArray(old)
      ? old.filter(
          (conv) =>
            conv.channel.channelID !== channel.channelID ||
            conv.channel.channelType !== channel.channelType,
        )
      : old,
  );
  if (opts?.groupNo && opts.shortId) {
    queryClient.setQueryData<ThreadRaw[]>(["chat", "thread-list", opts.groupNo], (old) =>
      Array.isArray(old)
        ? old.filter(
            (thread) => thread.short_id !== opts.shortId && thread.channel_id !== channel.channelID,
          )
        : old,
    );
  }
}
