import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { BellOff, BellRing, ChevronRight, Eye, Pin, PinOff, Trash2, X } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { ChannelMembersModal } from "@/features/chat/components/channel-members-modal";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import {
  clearChannelMessages,
  deleteConversation,
} from "@/features/base/api/endpoints/conversation.api";
import { setChannelMute, setChannelTop } from "@/features/base/api/endpoints/channel-setting.api";

interface ChannelSettingModalProps {
  open: boolean;
  channel: Channel;
  onClose: () => void;
}

/** ChannelType 5 = ChannelTypeCommunityTopic(对齐旧 dmworkbase Const.ts)。 */
const CHANNEL_TYPE_THREAD = 5;

/**
 * open 翻转后下一帧 entered=true 触发 transition,与 ChannelMembersModal 同款。
 */
function useEnterTransition(open: boolean) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);
  return entered;
}

function SectionRow({
  title,
  subTitle,
  right,
  danger,
  onClick,
}: {
  title: string;
  subTitle?: string;
  right?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors ${
        clickable ? "hover:bg-bg-hover" : "cursor-default"
      }`}
    >
      <span
        className={`flex-1 truncate text-[13px] ${danger ? "text-error" : "text-text-primary"}`}
      >
        {title}
      </span>
      {subTitle ? (
        <span className="shrink-0 truncate text-[12px] text-text-tertiary">{subTitle}</span>
      ) : null}
      {right ? <span className="shrink-0">{right}</span> : null}
    </button>
  );
}

function SectionGroup({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-4 mb-2 flex flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-base">
      {children}
    </section>
  );
}

/**
 * 频道设置抽屉(对应旧 dmworkbase Components/ChannelSetting,右侧滑入):
 *
 *   ┌ Header(标题 + 关闭)
 *   ├ 头像 + 名 + 类型 badge
 *   ├ Section: 成员行(可点击 → ChannelMembersModal)/ 公告(只读)
 *   ├ Section: 置顶 / 免打扰
 *   └ Section: 清空聊天记录 / 关闭聊天窗口
 *
 * 形态:fixed 右侧抽屉 + backdrop 半透明可点关闭(对齐 ChannelMembersModal)。
 *
 * 数据:
 * - channelInfo 走 SDK channelManager.getChannelInfo(同步,缓存命中即返)
 * - 成员数走 useGroupSubscribers(自带 syncSubscribes + listener,与 ChannelMembersModal
 *   共用,SDK cache 命中省 RTT)
 *
 * 设计取舍 — 之前自己写 useSyncSubscribesOnOpen + subscribesTick state 触发重渲,onDone
 * 是箭头函数每次重渲新引用,被 useEffect 依赖 → setSubscribesTick → 重渲生新 onDone
 * → useEffect 又跑 → 死循环。改用 useGroupSubscribers 直接消费 subscribers 数组,
 * hook 内部 listener 自管 setState,React 闭包稳定无死循环。
 */
export function ChannelSettingModal({ open, channel, onClose }: ChannelSettingModalProps) {
  const qc = useQueryClient();
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const entered = useEnterTransition(open);

  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  const title = channelInfo?.title || channel.channelID;
  const isGroup = channel.channelType === ChannelTypeGroup;
  const isThread = channel.channelType === CHANNEL_TYPE_THREAD;
  const isPerson = channel.channelType === ChannelTypePerson;
  const isMuted = !!channelInfo?.mute;
  const isTop = !!channelInfo?.top;
  const orgData = channelInfo?.orgData as { member_count?: number; notice?: string } | undefined;
  const notice = orgData?.notice;

  const subscribers = useGroupSubscribers(channel, open && (isGroup || isThread));
  const memberCount = useMemo(() => {
    if (!isGroup && !isThread) return undefined;
    if (subscribers.length > 0) return subscribers.length;
    return orgData?.member_count;
  }, [isGroup, isThread, subscribers.length, orgData?.member_count]);

  const refreshChannelInfo = () => {
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
  };

  const topMu = useMutation({
    mutationFn: (top: boolean) => setChannelTop(channel, top),
    onSuccess: () => {
      refreshChannelInfo();
      toast.success(isTop ? "已取消置顶" : "已置顶");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失败"),
  });

  const muteMu = useMutation({
    mutationFn: (mute: boolean) => setChannelMute(channel, mute),
    onSuccess: () => {
      refreshChannelInfo();
      toast.success(isMuted ? "已关闭免打扰" : "已开启免打扰");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失败"),
  });

  const clearMu = useMutation({
    mutationFn: () => {
      const conv = WKSDK.shared().conversationManager.findConversation(channel);
      return clearChannelMessages({
        channelId: channel.channelID,
        channelType: channel.channelType,
        messageSeq: conv?.lastMessage?.messageSeq ?? 0,
      });
    },
    onSuccess: () => {
      qc.setQueryData(["chat", "messages", channel.channelType, channel.channelID], {
        pages: [[]],
        pageParams: [0],
      });
      toast.success("已清空聊天记录");
      setConfirmClear(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "清空失败"),
  });

  const closeMu = useMutation({
    mutationFn: () =>
      deleteConversation({
        channelId: channel.channelID,
        channelType: channel.channelType,
      }),
    onSuccess: () => {
      WKSDK.shared().conversationManager.removeConversation(channel);
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      if (chatSelectedStore.state.channel?.channelID === channel.channelID) {
        chatSelectedActions.clear();
      }
      toast.success("已关闭聊天");
      setConfirmClose(false);
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "关闭失败"),
  });

  if (!open) return null;

  const typeLabel = isGroup ? "群" : isThread ? "子区" : isPerson ? "私聊" : "";
  const headerCount = isGroup || isThread ? (memberCount ?? 0) : undefined;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      {/* drawer panel — 右侧滑入(对齐旧 dmworkbase ChannelSetting transform 滑入) */}
      <aside
        className={`absolute top-0 right-0 flex h-full w-full max-w-md transform flex-col overflow-hidden border-l border-border-default bg-bg-surface shadow-xl transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {typeof headerCount === "number" ? `聊天信息(${headerCount})` : "聊天信息"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-col items-center gap-2 px-6 pt-4 pb-3">
          <ChannelAvatar channel={channel} size={56} title={title} />
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
            {typeLabel ? (
              <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] font-semibold text-text-tertiary">
                {typeLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto py-2">
          {(isGroup || isThread) && (typeof memberCount === "number" || notice) ? (
            <SectionGroup>
              {typeof memberCount === "number" ? (
                <SectionRow
                  title="成员"
                  subTitle={`${memberCount} 人`}
                  right={<ChevronRight size={14} className="text-text-tertiary" />}
                  onClick={() => setMembersOpen(true)}
                />
              ) : null}
              {notice ? <SectionRow title="群公告" subTitle={notice} /> : null}
            </SectionGroup>
          ) : null}

          <SectionGroup>
            <SectionRow
              title={isTop ? "取消置顶" : "置顶聊天"}
              right={
                isTop ? (
                  <PinOff size={14} className="text-text-tertiary" />
                ) : (
                  <Pin size={14} className="text-text-tertiary" />
                )
              }
              onClick={() => topMu.mutate(!isTop)}
            />
            <SectionRow
              title={isMuted ? "关闭免打扰" : "开启免打扰"}
              right={
                isMuted ? (
                  <BellRing size={14} className="text-text-tertiary" />
                ) : (
                  <BellOff size={14} className="text-text-tertiary" />
                )
              }
              onClick={() => muteMu.mutate(!isMuted)}
            />
          </SectionGroup>

          <SectionGroup>
            <SectionRow
              title="清空聊天记录"
              right={<Eye size={14} className="text-text-tertiary" />}
              danger
              onClick={() => setConfirmClear(true)}
            />
            <SectionRow
              title="关闭聊天窗口"
              right={<Trash2 size={14} className="text-text-tertiary" />}
              danger
              onClick={() => setConfirmClose(true)}
            />
          </SectionGroup>
        </div>
      </aside>

      <ChannelMembersModal
        open={membersOpen}
        channel={channel}
        onClose={() => setMembersOpen(false)}
      />

      {confirmClear ? (
        <ConfirmModal
          open
          title="确认清空"
          content="确定要清空所有聊天记录吗?该操作不可撤销。"
          okDanger
          okText="清空"
          okLoading={clearMu.isPending}
          onOk={() => clearMu.mutate()}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}

      {confirmClose ? (
        <ConfirmModal
          open
          title="确认关闭"
          content="确定要关闭此聊天窗口吗?"
          okText="关闭"
          okLoading={closeMu.isPending}
          onOk={() => closeMu.mutate()}
          onCancel={() => setConfirmClose(false)}
        />
      ) : null}
    </div>
  );
}
