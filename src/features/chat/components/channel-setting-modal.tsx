import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { BellOff, BellRing, Eye, Pin, PinOff, Trash2, X } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
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

/** ChannelType 7 = ChannelTypeCommunityTopic */
const CHANNEL_TYPE_THREAD = 7;

/**
 * Modal 打开时主动 syncSubscribes,把群成员拉到 SDK cache。
 *
 * SDK syncSubscribes 走 syncSubscribersCallback(K-1 已接 GET groups/{}/membersync),
 * 完成后写到 channelManager.subscribeCacheMap。返回 token 触发 setVer 让组件重渲拿数。
 */
function useSyncSubscribesOnOpen(
  open: boolean,
  channel: Channel,
  enabled: boolean,
  onDone: () => void,
) {
  useEffect(() => {
    if (!open || !enabled) return;
    void WKSDK.shared().channelManager.syncSubscribes(channel).then(onDone, onDone);
  }, [open, channel, enabled, onDone]);
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
      {right ? <span className="shrink-0">{right}</span> : null}
      {subTitle ? (
        <span className="shrink-0 truncate text-[12px] text-text-tertiary">{subTitle}</span>
      ) : null}
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
 * 频道设置弹窗(对应旧 dmworkbase Components/ChannelSetting 精简版):
 *
 *   ┌ Header(头像 + 名 + 群标识 + close)
 *   ├ Section: 成员数(进入时主动 syncSubscribes,从 cache 读真实数)/ 公告(只读)
 *   ├ Section: 置顶 / 免打扰(toggle row,直接调 channel-setting.api)
 *   └ Section: 清空聊天记录 / 关闭聊天窗口
 *
 * 不做(P3+ wave):成员列表展开 / 子区列表 / 群文档 / 群权限 / 成员管理 / 退群。
 */
export function ChannelSettingModal({ open, channel, onClose }: ChannelSettingModalProps) {
  const qc = useQueryClient();
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // tick 让 syncSubscribes 完成后强制重渲(SDK subscribeCacheMap 写入不会主动通知 React)
  const [subscribesTick, setSubscribesTick] = useState(0);

  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  const title = channelInfo?.title || channel.channelID;
  const isGroup = channel.channelType === ChannelTypeGroup;
  const isThread = channel.channelType === CHANNEL_TYPE_THREAD;
  const isPerson = channel.channelType === ChannelTypePerson;
  const isMuted = !!channelInfo?.mute;
  const isTop = !!channelInfo?.top;
  const orgData = channelInfo?.orgData as { member_count?: number; notice?: string } | undefined;
  const notice = orgData?.notice;

  useSyncSubscribesOnOpen(open, channel, isGroup || isThread, () =>
    setSubscribesTick((v) => v + 1),
  );

  // 真实成员数:SDK cache 里的 subscribers.length 优先,fallback 到 orgData.member_count
  const memberCount = useMemo(() => {
    if (!isGroup && !isThread) return undefined;
    // subscribesTick 入依赖,让 syncSubscribes done 后重算
    void subscribesTick;
    const subs = WKSDK.shared().channelManager.getSubscribes(channel);
    if (subs && subs.length > 0) return subs.length;
    return orgData?.member_count;
  }, [isGroup, isThread, channel, subscribesTick, orgData?.member_count]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
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
                <SectionRow title="成员" subTitle={`${memberCount} 人`} />
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
      </div>

      <ConfirmModal
        open={confirmClear}
        title="确认清空"
        content="确定要清空所有聊天记录吗?该操作不可撤销。"
        okDanger
        okText="清空"
        okLoading={clearMu.isPending}
        onOk={() => clearMu.mutate()}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmModal
        open={confirmClose}
        title="确认关闭"
        content="确定要关闭此聊天窗口吗?"
        okText="关闭"
        okLoading={closeMu.isPending}
        onOk={() => closeMu.mutate()}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}
