import { useEffect, useState } from "react";
import WKSDK, { type Conversation, Channel, ChannelTypeGroup } from "wukongimjssdk";
import { MoreHorizontal, Search } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";

interface ChatHeaderProps {
  conversation: Conversation;
}

/** 子区(thread)channelID 解析:`{groupNo}@{shortId}` 形如旧 parseThreadChannelId。 */
function parseThreadChannelId(channelId: string): { groupNo: string; shortId: string } | null {
  const at = channelId.indexOf("@");
  if (at <= 0) return null;
  return { groupNo: channelId.substring(0, at), shortId: channelId.substring(at + 1) };
}

/** ChannelType 7 = ChannelTypeCommunityTopic(子区);SDK 未导出常量,旧项目 hardcode 7。 */
const CHANNEL_TYPE_THREAD = 7;

function isThreadChannel(c: Conversation): boolean {
  return c.channel.channelType === CHANNEL_TYPE_THREAD;
}

/**
 * Chat 区顶部 header(对应旧 .wk-chat-conversation-header):
 *
 *   [头像 28×28] [面包屑/名字]                       [🔍] [⋯]
 *
 * - 高度 56px / bg-surface / border-bottom
 * - 头像:DM 圆 / Group 圆角 6px / 子区 # icon 占位
 * - 名字:displayName(remark || name);子区显示"父群 › 子区"面包屑
 * - 右侧:搜索(P3-C11) + More(P3-C12 ChannelSetting)
 *
 * P3 接:更多右侧 endpoints 注册项(channelHeaderRightItems,如子区列表按钮)。
 */
export function ChatHeader({ conversation }: ChatHeaderProps) {
  const channel = conversation.channel;
  const channelInfo = conversation.channelInfo;
  const isThread = isThreadChannel(conversation);
  const parsed = isThread ? parseThreadChannelId(channel.channelID) : null;
  const displayName =
    (channelInfo?.orgData as { displayName?: string } | undefined)?.displayName ||
    channelInfo?.title ||
    channel.channelID;

  const parentGroupTitle = useParentGroupTitle(parsed?.groupNo ?? null);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {isThread ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
            #
          </div>
        ) : (
          <ChannelAvatar channel={channel} size={28} title={displayName} />
        )}
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight text-text-primary">
          {isThread && parsed ? (
            <>
              <span className="text-text-secondary">{parentGroupTitle || parsed.groupNo}</span>
              <span className="mx-2 text-text-tertiary">›</span>
              <span>{displayName}</span>
            </>
          ) : (
            displayName
          )}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="搜索聊天内容"
          title="搜索聊天内容(P3-C11)"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Search size={18} />
        </button>
        <button
          type="button"
          aria-label="更多"
          title="频道设置(P3-C12)"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </header>
  );
}

/**
 * 子区 header 需要拿父群 title。父群 info 可能未缓存,主动 fetchChannelInfo;
 * channelInfoListener 触发 cache 写入即 force 重渲拿到 title。
 */
function useParentGroupTitle(groupNo: string | null): string | undefined {
  const [, force] = useState(0);

  useEffect(() => {
    if (!groupNo) return;
    const ch = new Channel(groupNo, ChannelTypeGroup);
    if (!WKSDK.shared().channelManager.getChannelInfo(ch)) {
      void WKSDK.shared().channelManager.fetchChannelInfo(ch);
    }
    const listener = () => force((v) => v + 1);
    WKSDK.shared().channelManager.addListener(listener);
    return () => {
      WKSDK.shared().channelManager.removeListener(listener);
    };
  }, [groupNo]);

  if (!groupNo) return undefined;
  return WKSDK.shared().channelManager.getChannelInfo(new Channel(groupNo, ChannelTypeGroup))
    ?.title;
}
