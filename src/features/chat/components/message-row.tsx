import WKSDK, {
  Channel,
  ChannelTypePerson,
  MessageContentType,
  type Message,
  type MessageImage,
  type MessageText,
} from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { useState, type MouseEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Forward, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { toast } from "@/components/semi-bridge/toast";
import { MessageDispatch } from "@/features/chat/message-renderers/dispatch";
import { MessageStatusBadge } from "@/features/chat/components/message-status-badge";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import {
  deleteMessages as deleteMessagesApi,
  revokeMessage,
} from "@/features/base/api/endpoints/message.api";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { copyImageToClipboard } from "@/features/base/lib/copy-image";

interface MessageRowProps {
  message: Message;
  /** 与上一条同一发送者且时间相近时,跳过头像和 header(连续消息折叠)。 */
  continueWithPrev?: boolean;
  /** 系统消息 / 撤回消息 / time renderer 等不渲染头像 + sender,直接居中。 */
  bare?: boolean;
}

/** 取发送者首字母(P3-C18 接 group subscribers 拿真名 + ChannelInfo 拿头像 url)。 */
function senderInitial(message: Message): string {
  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(message.channel);
  const name = channelInfo?.title || message.fromUID;
  return (name || "?").slice(0, 1).toUpperCase();
}

function senderDisplay(message: Message): string {
  // P3 接 group subscribers 拿群昵称;暂用 fromUID
  return message.fromUID;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 文本消息提取纯文本;非文本消息 fallback 到 conversationDigest。 */
function extractText(message: Message): string {
  if (message.contentType === MessageContentType.text) {
    return (message.content as MessageText).text ?? "";
  }
  const digest = (message.content as { conversationDigest?: string } | undefined)
    ?.conversationDigest;
  return digest ?? "";
}

/** 撤回时间窗(秒),对齐旧 WKApp.remoteConfig.revokeSecond 默认值。 */
const REVOKE_SECONDS = 120;

/**
 * 撤回权限判定(对齐旧 module.tsx::registerMessageContextMenus contextmenus.revoke):
 *
 * 1) Bot 创建者豁免:from 是 robot 且 bot_creator_uid === myUid → 可撤
 * 2) 普通用户:必须 message.send(自己发的)且在 revokeSecond 内
 *
 * 群管理员豁免(GroupRole.manager/owner)P4 等接群成员管理后再加。
 */
function canRevoke(message: Message, myUid: string): boolean {
  if (!message.messageID) return false;

  const fromChannelInfo = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(message.fromUID, ChannelTypePerson),
  );
  const fromOrgData = fromChannelInfo?.orgData as
    | { robot?: number; bot_creator_uid?: string }
    | undefined;
  if (fromOrgData?.robot === 1 && fromOrgData.bot_creator_uid === myUid) {
    return true;
  }

  if (!message.send) return false;
  const elapsed = new Date().getTime() / 1000 - message.timestamp;
  return elapsed <= REVOKE_SECONDS;
}

/** 转发是否支持(对齐旧 notSupportForward,简版:系统消息 / 命令消息 不支持) */
function canForward(message: Message): boolean {
  if (message.contentType >= 1000 && message.contentType < 2000) return false; // 系统
  if (message.contentType === MessageContentType.cmd) return false;
  return true;
}

/**
 * 单条消息行(Slack 风格,对应旧 packages/dmworkbase/src/ui/message/MessageRow):
 *   [头像 36×36] [sender + timestamp]
 *               [body]                [self 状态徽标]
 *
 * 连续消息(continueWithPrev):头像/header 折叠,只渲染 body,hover 显示 timestamp。
 *
 * 右键 → ContextMenu(F-4 + F-5a 集合):
 *   - 复制(文本/digest)
 *   - 复制图片(image only)
 *   - 转发(canForward 通过,弹 ForwardModal)
 *   - 撤回(canRevoke 通过时显示)
 *   - 删除(总是显示,ConfirmModal 二次确认)
 *
 * 回复 / 多选(F-5b/c)+ 分享名片 / 翻译 / 标记 / 创建子区(F-6)留后续。
 */
export function MessageRow({ message, continueWithPrev, bare }: MessageRowProps) {
  const qc = useQueryClient();
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ open: true, x: e.clientX, y: e.clientY });
  };

  const removeFromCache = () => {
    qc.setQueriesData<{ pages: Message[][]; pageParams: unknown[] }>(
      { queryKey: messagesQueryKey(message.channel.channelID, message.channel.channelType) },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => p.filter((m) => m.clientMsgNo !== message.clientMsgNo)),
        };
      },
    );
  };

  const revokeMu = useMutation({
    mutationFn: () =>
      revokeMessage({
        channel: message.channel,
        messageId: message.messageID,
        clientMsgNo: message.clientMsgNo,
      }),
    onSuccess: () => {
      toast.success("已撤回");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "撤回失败"),
  });

  const deleteMu = useMutation({
    mutationFn: () =>
      deleteMessagesApi([
        {
          message_id: message.messageID,
          channel_id: message.channel.channelID,
          channel_type: message.channel.channelType,
          message_seq: message.messageSeq,
        },
      ]),
    onSuccess: () => {
      removeFromCache();
      toast.success("已删除");
      setDeleteOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  const isImage = message.contentType === MessageContentType.image;
  const imageUrl = isImage ? (message.content as MessageImage).url : "";
  const revokeAllowed = me ? canRevoke(message, me) : false;
  const forwardAllowed = canForward(message);

  const items: ContextMenuItem[] = [];
  if (extractText(message)) {
    items.push({
      label: "复制",
      icon: <Copy size={13} />,
      onClick: () => {
        const text = extractText(message);
        void navigator.clipboard
          .writeText(text)
          .then(() => toast.success("已复制"))
          .catch(() => toast.error("复制失败"));
      },
    });
  }
  if (isImage && imageUrl) {
    items.push({
      label: "复制图片",
      icon: <ImageIcon size={13} />,
      onClick: () => {
        copyImageToClipboard(imageUrl)
          .then(() => toast.success("已复制图片"))
          .catch((err: Error) => toast.error(err.message || "复制失败"));
      },
    });
  }
  if (forwardAllowed) {
    items.push({
      label: "转发",
      icon: <Forward size={13} />,
      onClick: () => setForwardOpen(true),
    });
  }
  if (revokeAllowed) {
    items.push({
      label: "撤回",
      icon: <RotateCcw size={13} />,
      onClick: () => revokeMu.mutate(),
    });
  }
  items.push({
    label: "删除",
    icon: <Trash2 size={13} />,
    danger: true,
    onClick: () => setDeleteOpen(true),
  });

  if (bare) {
    return (
      <div className="px-4 py-1">
        <MessageDispatch message={message} />
      </div>
    );
  }

  const wrapperClass =
    "group relative flex gap-3 px-4 transition-colors duration-150 ease-(--ease-emphasized) hover:bg-brand-tint/40";

  const ctxMenu = (
    <ContextMenu
      open={menu.open}
      x={menu.x}
      y={menu.y}
      items={items}
      onClose={() => setMenu((m) => ({ ...m, open: false }))}
    />
  );

  const deleteDialog = (
    <ConfirmModal
      open={deleteOpen}
      content="确定删除这条消息?该操作不可恢复。"
      okDanger
      okText="删除"
      okLoading={deleteMu.isPending}
      onOk={() => deleteMu.mutate()}
      onCancel={() => setDeleteOpen(false)}
    />
  );

  const forwardDialog = (
    <ForwardModal open={forwardOpen} message={message} onClose={() => setForwardOpen(false)} />
  );

  if (continueWithPrev) {
    return (
      <div className={wrapperClass} onContextMenu={onContextMenu}>
        <div className="w-9 shrink-0 self-stretch text-center text-[10px] leading-[22px] text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
          {formatTime(message.timestamp)}
        </div>
        <div className="relative min-w-0 flex-1 py-0.5">
          <MessageDispatch message={message} />
          {isSelf ? (
            <div className="pointer-events-auto absolute right-0 -bottom-1">
              <MessageStatusBadge message={message} />
            </div>
          ) : null}
        </div>
        {ctxMenu}
        {deleteDialog}
        {forwardDialog}
      </div>
    );
  }

  return (
    <div className={`${wrapperClass} pt-3`} onContextMenu={onContextMenu}>
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-sm font-medium text-text-secondary"
        aria-hidden
      >
        {senderInitial(message)}
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        <header className="flex items-baseline gap-2 leading-[22px]">
          <span className="truncate text-sm font-semibold text-text-primary">
            {senderDisplay(message)}
          </span>
          <span className="text-[11px] text-text-tertiary">{formatTime(message.timestamp)}</span>
        </header>
        <MessageDispatch message={message} />
        {isSelf ? (
          <div className="pointer-events-auto absolute right-0 -bottom-1">
            <MessageStatusBadge message={message} />
          </div>
        ) : null}
      </div>
      {ctxMenu}
      {deleteDialog}
      {forwardDialog}
    </div>
  );
}
