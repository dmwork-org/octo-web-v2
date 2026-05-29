import { useEffect, useState } from "react";
import WKSDK, { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { useMutation } from "@tanstack/react-query";
import { followThread } from "@/features/base/api/endpoints/follow.api";
import { toast } from "@/components/semi-bridge/toast";
import { MoreHorizontal, Search, Star } from "lucide-react";
import { ThreadIcon } from "@/components/ui/thread-icon";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { GlobalSearchModal } from "@/features/chat/components/global-search-modal";
import { ChannelSettingModal } from "@/features/chat/components/channel-setting-modal";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

interface ChatHeaderProps {
  showThreadIcon?: boolean;
  threadPanelOpen?: boolean;
  onToggleThreadPanel?: () => void;
  channel: Channel;
}

/** ChannelType 7 = ChannelTypeCommunityTopic(子区);SDK 未导出常量,旧项目 hardcode 7。 */
const CHANNEL_TYPE_THREAD = 5; // ChannelTypeCommunityTopic(对齐旧 dmworkbase Const.ts);SDK 1.3.5 7 = ChannelTypeData,不是子区

function isThread(c: Channel): boolean {
  return c.channelType === CHANNEL_TYPE_THREAD;
}

/**
 * channelInfo 不在 conversation 上时(从 contacts 直接选人进 chat),
 * 主动 fetch + 订阅 channelManager 变化,info 到位后强制重渲。
 */
function useChannelInfoLive(channel: Channel) {
  const [, force] = useState(0);

  useEffect(() => {
    const mgr = WKSDK.shared().channelManager;
    if (!mgr.getChannelInfo(channel)) {
      void mgr.fetchChannelInfo(channel);
    }
    const listener = () => force((v) => v + 1);
    mgr.addListener(listener);
    return () => {
      mgr.removeListener(listener);
    };
  }, [channel]);

  return WKSDK.shared().channelManager.getChannelInfo(channel);
}

/**
 * Chat 区顶部 header(对应旧 .wk-chat-conversation-header):
 *
 *   [头像 28×28] [面包屑/名字]                       [🔍] [⋯]
 *
 * - 高度 56px / bg-surface / border-bottom
 * - 头像:DM 圆 / Group 圆角 6px / 子区 # icon 占位
 * - 名字:displayName(remark || name);子区显示"父群 › 子区"面包屑
 * - 🔍 搜索:打开 GlobalSearchModal 带 channel(channel 内搜索 mode)
 * - ⋯ 更多:打开 ChannelSettingModal(精简版聊天信息)
 *
 * 接受 channel 而非 conversation:contacts 选人也共用此 header。
 */
export function ChatHeader({
  channel,
  showThreadIcon,
  threadPanelOpen,
  onToggleThreadPanel,
}: ChatHeaderProps) {
  const channelInfo = useChannelInfoLive(channel);
  const isThreadCh = isThread(channel);
  const parsed = isThreadCh ? parseThreadChannelId(channel.channelID) : null;
  const displayName =
    (channelInfo?.orgData as { displayName?: string } | undefined)?.displayName ||
    channelInfo?.title ||
    channel.channelID;

  const parentGroupTitle = useParentGroupTitle(parsed?.groupNo ?? null);
  const followThreadMu = useMutation({
    mutationFn: (channelId: string) => followThread(channelId),
    onSuccess: () => toast.success("已关注子区"),
    onError: (err) => toast.error(err instanceof Error ? err.message : "关注失败"),
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingOpen, setSettingOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {isThreadCh ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
            #
          </div>
        ) : (
          <ChannelAvatar channel={channel} size={28} title={displayName} />
        )}
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight text-text-primary">
          {isThreadCh && parsed ? (
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
        {isThreadCh ? (
          <button
            type="button"
            aria-label="关注此子区"
            title="关注此子区"
            onClick={() => followThreadMu.mutate(channel.channelID)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-brand"
          >
            <Star size={18} />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="搜索聊天内容"
          title="搜索聊天内容"
          onClick={() => setSearchOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Search size={18} />
        </button>
        {showThreadIcon ? (
          <button
            type="button"
            aria-label="子区列表"
            title="子区"
            onClick={onToggleThreadPanel}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-bg-hover ${threadPanelOpen ? "bg-bg-elevated text-text-primary" : "text-text-secondary hover:text-text-primary"}`}
          >
            <ThreadIcon size={20} />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="更多"
          title="聊天信息"
          onClick={() => setSettingOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      <GlobalSearchModal open={searchOpen} channel={channel} onClose={() => setSearchOpen(false)} />
      <ChannelSettingModal
        open={settingOpen}
        channel={channel}
        onClose={() => setSettingOpen(false)}
      />
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
