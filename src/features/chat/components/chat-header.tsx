import { useEffect, useState } from "react";
import WKSDK, { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { List, MoreHorizontal } from "lucide-react";
import { ThreadIcon } from "@/components/ui/thread-icon";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ChannelSettingModal } from "@/features/chat/components/channel-setting-modal";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatSidePanelActions } from "@/features/chat/stores/chat-side-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/use-t";

interface ChatHeaderProps {
  showThreadIcon?: boolean;
  threadPanelOpen?: boolean;
  onToggleThreadPanel?: () => void;
  channel: Channel;
}

/** ChannelType 5 = ChannelTypeCommunityTopic(子区) — SDK 未导出常量,旧 dmworkbase Const.ts 同。 */
const CHANNEL_TYPE_THREAD = 5;

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
 *   [头像 28×28] [面包屑/名字]                  [事项] [子区列表]? [⋯]
 *
 * - 高度 56px / bg-surface / border-bottom
 * - 头像:DM 圆 / Group 圆角 / **子区借用父群头像**(对齐截图,不是 ThreadIcon 占位)
 * - 名字:displayName(remark || name);子区显示"父群 › 子区"面包屑,父群可点击跳回
 * - 事项 List icon(等价老仓 ChecklistIcon:三横+左三点):对齐旧 dmworktodo registerChannelHeaderRightItem
 *   (matter panel chat 内集成方案未定,onClick 用 console 占位)
 * - 子区列表 ThreadIcon:**仅 group 主区显示**,子区主区时不出现(对齐 Pages/Chat line 688)
 * - 更多 ⋯:打开 ChannelSettingModal(精简版聊天信息)
 *
 * 接受 channel 而非 conversation:contacts 选人也共用此 header。
 */
export function ChatHeader({
  channel,
  showThreadIcon,
  threadPanelOpen,
  onToggleThreadPanel,
}: ChatHeaderProps) {
  const t = useT();
  const channelInfo = useChannelInfoLive(channel);
  const isThreadCh = isThread(channel);
  const parsed = isThreadCh ? parseThreadChannelId(channel.channelID) : null;
  const displayName =
    (channelInfo?.orgData as { displayName?: string } | undefined)?.displayName ||
    channelInfo?.title ||
    channel.channelID;

  const parentChannel = parsed ? new Channel(parsed.groupNo, ChannelTypeGroup) : null;
  const parentGroupTitle = useParentGroupTitle(parsed?.groupNo ?? null);
  const [settingOpen, setSettingOpen] = useState(false);

  // 子区主区时,父群面包屑点击 → 切回父群(对齐旧 ThreadPanel handleOpenFullView 反向)
  const goParentGroup = () => {
    if (!parentChannel) return;
    chatSelectedActions.select(parentChannel);
  };

  // 事项面板入口:toggle chat 右侧 matter panel(对齐旧 registerChatMatterPanel)
  const onClickMatter = () => chatSidePanelActions.toggleMatter();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* 子区借用父群头像(对齐截图);其他场景用 channel 自身头像 */}
        <ChannelAvatar
          channel={parentChannel ?? channel}
          size={28}
          title={parentGroupTitle || displayName}
        />
        <h2 className="flex min-w-0 flex-1 items-center gap-1 truncate text-base font-semibold leading-tight text-text-primary">
          {isThreadCh && parsed ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={goParentGroup}
                    aria-label={t("chatHeader.backToParent")}
                    className="shrink cursor-pointer truncate text-[13px] font-normal text-text-tertiary transition-colors hover:text-text-secondary"
                  >
                    {parentGroupTitle || parsed.groupNo}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("chatHeader.backToParent")}</TooltipContent>
              </Tooltip>
              <span className="shrink-0 text-[11px] font-light text-text-disabled">›</span>
              <span className="min-w-0 truncate text-[13px] font-semibold text-text-primary">
                {displayName}
              </span>
            </>
          ) : (
            displayName
          )}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* 事项入口仅群聊/子区显示(对齐旧 dmworktodo registerChatHeaderIcon — 私聊不显示) */}
        {channel.channelType === ChannelTypeGroup || isThreadCh ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("chatHeader.matter")}
                onClick={onClickMatter}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <List size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("chatHeader.matter")}</TooltipContent>
          </Tooltip>
        ) : null}
        {showThreadIcon ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("chatHeader.threadList")}
                onClick={onToggleThreadPanel}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-bg-hover ${threadPanelOpen ? "bg-bg-elevated text-text-primary" : "text-text-secondary hover:text-text-primary"}`}
              >
                <ThreadIcon size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("chatHeader.thread")}</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("chatHeader.more")}
              onClick={() => setSettingOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <MoreHorizontal size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("chatHeader.chatInfo")}</TooltipContent>
        </Tooltip>
      </div>

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
