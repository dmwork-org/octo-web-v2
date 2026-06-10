import { useEffect, useRef, useState } from "react";
import WKSDK, { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { List, MoreHorizontal, Sparkles } from "lucide-react";
import { useStore } from "@tanstack/react-store";
import { ThreadIcon } from "@/components/ui/thread-icon";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ChannelSettingModal } from "@/features/chat/components/channel-setting-modal";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { listSummaries } from "@/features/summary/api/summary.api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t as tFn } from "@/lib/i18n/instance";

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
 *   [头像 28×28] [面包屑/名字]            [总结 ✨] [事项] [子区列表]? [⋯]
 *
 * - 高度 56px / bg-surface / border-bottom
 * - 头像:DM 圆 / Group 圆角 / **子区借用父群头像**(对齐截图,不是 ThreadIcon 占位)
 * - 名字:displayName(remark || name);子区显示"父群 › 子区"面包屑,父群可点击跳回
 * - 总结 Sparkles(对齐旧 ChatSummaryStarButton):成功探测有响应 → 打开 chat
 *   summary panel;探测失败 toast 不开 panel(老仓 P1 fix:防止网络错被当作"无总结"
 *   误开创建流)
 * - 事项 List icon(等价老仓 ChecklistIcon:三横+左三点):对齐旧 dmworktodo
 *   registerChannelHeaderRightItem
 * - 子区列表 ThreadIcon:**仅 group 主区显示**,子区主区时不出现
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
  const sidePanelKind = useStore(chatSidePanelStore, (s) => s.kind);

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
        <SummaryEntryButton channel={channel} active={sidePanelKind === "summary"} />
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

/**
 * Sparkle 入口(对齐旧 ChatSummaryStarButton):
 * - 当前已打开 summary panel → 再点 toggle 关。
 * - 否则探测一次 `/summaries?origin_channel_id=...&page_size=1`:
 *   - 成功(任意 total) → openSummary(null) 打开 panel,panel 自己拉详细列表
 *   - AbortError(切了 channel / 二次点击)→ 静默
 *   - 其他错误 → toast,**不**开 panel 走创建(老仓 P1 fix:防止把网络错当成
 *     "无总结"误开创建流)
 */
function SummaryEntryButton({ channel, active }: { channel: Channel; active: boolean }) {
  const t = useT();
  const abortRef = useRef<AbortController | null>(null);
  useAbortOnChannelChange(channel.channelID, abortRef);

  const handleClick = async () => {
    if (active) {
      chatSidePanelActions.close();
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await listSummaries(
        { origin_channel_id: channel.channelID, page: 1, page_size: 1 },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      chatSidePanelActions.openSummary(null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      toast.error(tFn("summary.common.loadingFailed"));
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("summary.chatSummary.starTooltip")}
          onClick={() => void handleClick()}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-bg-hover ${
            active
              ? "bg-bg-elevated text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <Sparkles size={18} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("summary.chatSummary.starTooltip")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * channel 切换时 abort 当前未完成的 fetchSummaryCount 请求,
 * 避免 setState 落到错误 channel 的 panel。
 */
function useAbortOnChannelChange(
  channelId: string,
  abortRef: React.MutableRefObject<AbortController | null>,
): void {
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [channelId, abortRef]);
}
