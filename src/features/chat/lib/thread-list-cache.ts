import type { QueryClient } from "@tanstack/react-query";
import type { Channel } from "wukongimjssdk";
import type { ThreadRaw } from "@/features/base/api/endpoints/group.api";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { THREAD_STATUS_ACTIVE } from "@/features/chat/lib/thread-status";

const CHANNEL_TYPE_THREAD = 5;
const REFRESH_DELAY_MS = 600;

type ThreadChannel = Pick<Channel, "channelID" | "channelType">;

export function threadListQueryKey(groupNo: string) {
  return ["chat", "thread-list", groupNo] as const;
}

export function refreshThreadListAfterSend(
  queryClient: QueryClient,
  channel: ThreadChannel,
  opts?: { reactivate?: boolean; activeAt?: string },
): { groupNo: string; patch: Partial<ThreadRaw> } | null {
  if (channel.channelType !== CHANNEL_TYPE_THREAD) return null;
  const parsed = parseThreadChannelId(channel.channelID);
  if (!parsed) return null;

  const activeAt = opts?.activeAt ?? new Date().toISOString();
  const patch: Partial<ThreadRaw> = {
    last_message_at: activeAt,
    updated_at: activeAt,
    ...(opts?.reactivate ? { status: THREAD_STATUS_ACTIVE } : {}),
  };
  const key = threadListQueryKey(parsed.groupNo);

  queryClient.setQueryData<ThreadRaw[]>(key, (old) =>
    Array.isArray(old)
      ? old.map((item) =>
          item.short_id === parsed.shortId || item.channel_id === channel.channelID
            ? { ...item, ...patch }
            : item,
        )
      : old,
  );

  setTimeout(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, REFRESH_DELAY_MS);

  return { groupNo: parsed.groupNo, patch };
}
