import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  MessageContentType,
  type ChannelInfoListener,
  type Message,
  type MessageImage,
  type MessageText,
} from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { useEffect, useState, type MouseEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckSquare,
  Copy,
  CornerUpLeft,
  Forward,
  Image as ImageIcon,
  MessageSquarePlus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { toast } from "@/components/semi-bridge/toast";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { MessageDispatch } from "@/features/chat/message-renderers/dispatch";
import { MessageStatusBadge } from "@/features/chat/components/message-status-badge";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { chatReplyActions } from "@/features/chat/stores/chat-reply";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";
import {
  deleteMessages as deleteMessagesApi,
  revokeMessage,
} from "@/features/base/api/endpoints/message.api";
import { createThread } from "@/features/base/api/endpoints/group.api";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { copyImageToClipboard } from "@/features/base/lib/copy-image";

interface MessageRowProps {
  message: Message;
  /** 与上一条同一发送者且时间相近时,跳过头像和 header(连续消息折叠)。 */
  continueWithPrev?: boolean;
  /** 系统消息 / 撤回消息 / time renderer 等不渲染头像 + sender,直接居中。 */
  bare?: boolean;
}

/** ChannelType 5 = ChannelTypeCommunityTopic(子区,SDK 1.3.5 未导出常量,对齐旧 dmworkbase Const.ts)。 */
const CHANNEL_TYPE_THREAD = 5;

/**
 * 拿"实际渲染用"的发送者 uid。
 *
 * threadCreated(=1100,系统消息但有真实创建人)的 message.fromUID 通常是后端
 * 系统/IM uid,真正的创建人 uid 在 content.from_uid。对齐旧
 * dmworkbase ThreadCreated `WKApp.shared.avatarUser(content.from_uid || message.fromUID)`。
 *
 * 其他消息直接返回 message.fromUID。
 */
function effectiveFromUID(message: Message): string {
  if (message.contentType === MessageContentTypeConst.threadCreated) {
    const c = message.content as { from_uid?: string } | undefined;
    if (c?.from_uid) return c.from_uid;
  }
  return message.fromUID;
}

/**
 * 取消息发送者的展示名:
 * - threadCreated:优先 content.from_name(后端拼好,fallback 走 channelInfo)
 * - 其他:走 fromUID + ChannelTypePerson 拿 channelInfo.title;不是 message.channel
 *   (会话频道,group 时是群名,会渲染成"村长群" 而不是发送人名)
 *
 * bot:bot 在 IM 里也是 ChannelTypePerson,channelInfo.title 同样适用。
 *
 * 注意:这里只读 SDK 缓存,首次渲染可能没缓存。组件需要配合 useSenderInfoLive 主动
 * 拉取 + 监听更新,触发重渲。
 */
function senderDisplay(message: Message): string {
  if (message.contentType === MessageContentTypeConst.threadCreated) {
    const c = message.content as { from_name?: string } | undefined;
    if (c?.from_name) return c.from_name;
  }
  const uid = effectiveFromUID(message);
  const personChannelInfo = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(uid, ChannelTypePerson),
  );
  return personChannelInfo?.title || uid;
}

/**
 * 主动确保 sender 的 ChannelInfo 已拉取并保持最新(对应旧 dmworkbase
 * MessageCell.componentDidMount 同款两件事):
 *
 *   1. 缓存里没有 → 主动 fetchChannelInfo(发送者 Person 频道)
 *   2. 注册 channelInfoListener,sender 信息到达后 force rerender
 *
 * 普通群成员通常已经走 syncSubscribers 拿到名字,但 **bot** 没在群成员里(订阅
 * 表只列人类成员),需要这条路径单独把 bot 的 channelInfo 拉过来才能显示昵称。
 */
function useSenderInfoLive(fromUID: string): void {
  const [, force] = useState(0);
  useEffect(() => {
    if (!fromUID) return;
    const mgr = WKSDK.shared().channelManager;
    const ch = new Channel(fromUID, ChannelTypePerson);
    if (!mgr.getChannelInfo(ch)) {
      void mgr.fetchChannelInfo(ch);
    }
    const listener: ChannelInfoListener = (info) => {
      const c = info?.channel;
      if (c?.channelID === fromUID && c?.channelType === ChannelTypePerson) {
        force((v) => v + 1);
      }
    };
    mgr.addListener(listener);
    return () => mgr.removeListener(listener);
  }, [fromUID]);
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function extractText(message: Message): string {
  if (message.contentType === MessageContentType.text) {
    return (message.content as MessageText).text ?? "";
  }
  const digest = (message.content as { conversationDigest?: string } | undefined)
    ?.conversationDigest;
  return digest ?? "";
}

const REVOKE_SECONDS = 120;

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

/** 系统消息判定(contentType 1000-1999),对齐旧 WKSDK.isSystemMessage。 */
function isSystemMessage(message: Message): boolean {
  return message.contentType >= 1000 && message.contentType < 2000;
}

function canForward(message: Message): boolean {
  if (isSystemMessage(message)) return false;
  if (message.contentType === MessageContentType.cmd) return false;
  return true;
}

/**
 * 创建子区可用条件(对齐旧 contextmenus.createThread):
 * - 群消息(ChannelTypeGroup,子区本身不能再开子区)
 * - 非系统消息
 * - (旧版还有 remoteConfig.threadOn 总开关,新版未接 remoteConfig,默认开)
 */
function canCreateThread(message: Message): boolean {
  if (message.channel.channelType !== ChannelTypeGroup) return false;
  if (isSystemMessage(message)) return false;
  return true;
}

/**
 * 单条消息行(Slack 风格,对应旧 packages/dmworkbase/src/ui/message/MessageRow):
 *   [头像 36×36] [sender + timestamp]
 *               [body]                [self 状态徽标]
 *
 * 多选模式(chatSelectionStore.active)行为:
 * - 左侧渲染 checkbox(替代头像 hover 区域)
 * - 整行 click 切换 selection,不触发 ContextMenu
 *
 * 右键 → ContextMenu(F-4/F-5/F-6 完整集合,对齐旧 module.tsx
 * registerMessageContextMenus 7 项):
 *   - 复制 / 复制图片 / 回复 / 转发 / 多选 / 撤回 / 创建子区(群消息)/ 删除
 */
export function MessageRow({ message, continueWithPrev, bare }: MessageRowProps) {
  useSenderInfoLive(effectiveFromUID(message));
  const qc = useQueryClient();
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  const selectionActive = useStore(chatSelectionStore, (s) => s.active);
  const selectionIds = useStore(chatSelectionStore, (s) => s.ids);
  const isSelected = selectionIds.has(message.clientMsgNo);
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);

  const onContextMenu = (e: MouseEvent) => {
    if (selectionActive) return;
    e.preventDefault();
    setMenu({ open: true, x: e.clientX, y: e.clientY });
  };

  const onRowClick = () => {
    if (!selectionActive) return;
    chatSelectionActions.toggle(message.clientMsgNo);
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
    onSuccess: () => toast.success("已撤回"),
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

  // 创建子区 mutation:对齐旧 createThread RPC(name + source_message_id + source_message_payload)。
  const threadMu = useMutation({
    mutationFn: (name: string) => {
      const content = message.content as {
        contentObj?: Record<string, unknown>;
        encodeJSON?: () => Record<string, unknown>;
      };
      const sourcePayload: Record<string, unknown> = content.contentObj ?? {
        ...content.encodeJSON?.(),
        type: message.contentType,
      };
      return createThread(message.channel.channelID, {
        name: name.trim(),
        source_message_id: parseInt(message.messageID, 10),
        source_message_payload: sourcePayload,
      });
    },
    onSuccess: (resp) => {
      toast.success("子区创建成功");
      setThreadOpen(false);
      if (resp?.channel_id) {
        chatSelectedActions.select(new Channel(resp.channel_id, CHANNEL_TYPE_THREAD));
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "创建失败"),
  });

  const isImage = message.contentType === MessageContentType.image;
  const imageUrl = isImage ? (message.content as MessageImage).url : "";
  const revokeAllowed = me ? canRevoke(message, me) : false;
  const forwardAllowed = canForward(message);
  const replyAllowed = canForward(message);
  const threadAllowed = canCreateThread(message);

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
  if (replyAllowed) {
    items.push({
      label: "回复",
      icon: <CornerUpLeft size={13} />,
      onClick: () => chatReplyActions.set(message.channel, message),
    });
  }
  if (forwardAllowed) {
    items.push({
      label: "转发",
      icon: <Forward size={13} />,
      onClick: () => setForwardOpen(true),
    });
  }
  items.push({
    label: "多选",
    icon: <CheckSquare size={13} />,
    onClick: () => {
      chatSelectionActions.enter();
      chatSelectionActions.toggle(message.clientMsgNo);
    },
  });
  if (revokeAllowed) {
    items.push({
      label: "撤回",
      icon: <RotateCcw size={13} />,
      onClick: () => revokeMu.mutate(),
    });
  }
  if (threadAllowed) {
    items.push({
      label: "创建子区",
      icon: <MessageSquarePlus size={13} />,
      onClick: () => setThreadOpen(true),
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

  const wrapperBase =
    "group relative flex gap-3 px-4 transition-colors duration-150 ease-(--ease-emphasized)";
  const wrapperHover = selectionActive ? "" : "hover:bg-brand-tint/40";
  const wrapperSelected = selectionActive && isSelected ? "bg-brand-tint/60" : "";
  const wrapperClass = `${wrapperBase} ${wrapperHover} ${wrapperSelected} ${
    selectionActive ? "cursor-pointer" : ""
  }`;

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

  // 子区创建弹窗(对齐旧 Modal.confirm + InputModal):默认名 = digest 前 20 字。
  const threadDefaultName = (
    (message.content as { conversationDigest?: string } | undefined)?.conversationDigest ?? ""
  ).slice(0, 20);
  const threadDialog = (
    <InputModal
      open={threadOpen}
      title="创建子区"
      placeholder="输入讨论话题..."
      initialValue={threadDefaultName}
      validate={(v) => v.trim().length > 0}
      okLoading={threadMu.isPending}
      onOk={(value) => threadMu.mutate(value)}
      onCancel={() => setThreadOpen(false)}
    />
  );

  const checkbox = selectionActive ? (
    <div className="flex w-6 shrink-0 items-center justify-center self-stretch">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
          isSelected ? "border-brand bg-brand text-white" : "border-border-default bg-bg-base"
        }`}
        aria-hidden
      >
        {isSelected ? <Check size={12} strokeWidth={3} /> : null}
      </span>
    </div>
  ) : null;

  if (continueWithPrev) {
    return (
      <div className={wrapperClass} onContextMenu={onContextMenu} onClick={onRowClick}>
        {checkbox}
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
        {threadDialog}
      </div>
    );
  }

  const senderTitle = senderDisplay(message);
  const senderChannel = new Channel(effectiveFromUID(message), ChannelTypePerson);
  return (
    <div className={`${wrapperClass} pt-3`} onContextMenu={onContextMenu} onClick={onRowClick}>
      {checkbox}
      <ChannelAvatar channel={senderChannel} size={36} title={senderTitle} />
      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        <header className="flex items-baseline gap-2 leading-[22px]">
          <span className="truncate text-sm font-semibold text-text-primary">{senderTitle}</span>
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
      {threadDialog}
    </div>
  );
}
