import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  MessageContentType,
  type ChannelInfoListener,
  type Reply,
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
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { AvatarMenuButton } from "@/features/chat/components/avatar-menu-button";
import { openChatProfile } from "@/features/chat/lib/open-profile";
import { MessageDispatch } from "@/features/chat/message-renderers/dispatch";
import { MessageStatusBadge } from "@/features/chat/components/message-status-badge";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { ReplyBlock } from "@/features/chat/components/reply-block";
import { chatReplyActions } from "@/features/chat/stores/chat-reply";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";
import {
  deleteMessages as deleteMessagesApi,
  revokeMessage,
} from "@/features/base/api/endpoints/message.api";
import { createThread } from "@/features/base/api/endpoints/group.api";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";
import { spaceStore } from "@/features/base/stores/space";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { copyImageToClipboard } from "@/features/base/lib/copy-image";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import {
  formatMessageTimeShort as formatTime,
  formatMessageTimestamp as formatSenderTime,
} from "@/features/chat/lib/format-message-time";

interface MessageRowProps {
  message: Message;
  /** 与上一条同一发送者且时间相近时,跳过头像和 header(连续消息折叠)。 */
  continueWithPrev?: boolean;
  /** 系统消息 / 撤回消息 / time renderer 等不渲染头像 + sender,直接居中。 */
  bare?: boolean;
}

const CHANNEL_TYPE_THREAD = 5;

function effectiveFromUID(message: Message): string {
  if (message.contentType === MessageContentTypeConst.threadCreated) {
    const c = message.content as { from_uid?: string } | undefined;
    if (c?.from_uid) return c.from_uid;
  }
  return message.fromUID;
}

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

// 时间格式化已抽到 lib/format-message-time.ts(对齐上游 c1eaadca)

function isBotSender(fromUID: string): boolean {
  if (!fromUID) return false;
  const info = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(fromUID, ChannelTypePerson),
  );
  const org = info?.orgData as { robot?: number } | undefined;
  return org?.robot === 1;
}

function normalizeVerified(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    return s === "1" || s === "true";
  }
  return false;
}

function isSenderVerified(fromUID: string, isBot: boolean): boolean {
  if (!fromUID || isBot) return false;
  const info = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(fromUID, ChannelTypePerson),
  );
  const org = info?.orgData as { realname_verified?: unknown } | undefined;
  return normalizeVerified(org?.realname_verified);
}

/**
 * 实名认证徽标(对齐旧 RealnameVerifiedBadge variant="icon"):
 * 12×12 SVG 圆 + 白色对勾;颜色 `#2f8cff`(OCTO 品牌蓝);紧贴 sender 名右侧。
 */
function RealnameBadge() {
  const tt = useT();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex shrink-0 items-center text-[#2f8cff]"
          aria-label={tt("messageRow.verifiedAria")}
          role="img"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="6" fill="currentColor" />
            <path
              d="M3 6.2l2 2 4-4"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tt("messageRow.verifiedTooltip")}</TooltipContent>
    </Tooltip>
  );
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

function isSystemMessage(message: Message): boolean {
  return message.contentType >= 1000 && message.contentType < 2000;
}

function canForward(message: Message): boolean {
  if (isSystemMessage(message)) return false;
  if (message.contentType === MessageContentType.cmd) return false;
  return true;
}

function canCreateThread(message: Message): boolean {
  if (message.channel.channelType !== ChannelTypeGroup) return false;
  if (isSystemMessage(message)) return false;
  return true;
}

/**
 * 单条消息行(Slack 风格,对应旧 packages/dmworkbase/src/ui/message/MessageRow)。
 */
export function MessageRow({ message, continueWithPrev, bare }: MessageRowProps) {
  const tt = useT();
  useSenderInfoLive(effectiveFromUID(message));
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
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
    onSuccess: () => toast.success(t("messageRow.toast.revoked")),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("messageRow.toast.revokeFailed")),
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
      toast.success(t("messageRow.toast.deleted"));
      setDeleteOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("messageRow.toast.deleteFailed")),
  });

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
      toast.success(t("messageRow.toast.threadCreated"));
      setThreadOpen(false);
      // 对齐上游 2c5eccbb:消息上下文菜单创建子区成功 → invalidate followed sidebar
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      if (resp?.channel_id) {
        chatSelectedActions.select(new Channel(resp.channel_id, CHANNEL_TYPE_THREAD));
      }
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("messageRow.toast.threadCreateFailed")),
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
      label: t("messageRow.menu.copy"),
      icon: <Copy size={13} />,
      onClick: () => {
        const text = extractText(message);
        void navigator.clipboard
          .writeText(text)
          .then(() => toast.success(t("messageRow.toast.copied")))
          .catch(() => toast.error(t("messageRow.toast.copyFailed")));
      },
    });
  }
  if (isImage && imageUrl) {
    items.push({
      label: t("messageRow.menu.copyImage"),
      icon: <ImageIcon size={13} />,
      onClick: () => {
        copyImageToClipboard(imageUrl)
          .then(() => toast.success(t("messageRow.toast.imageCopied")))
          .catch((err: Error) => toast.error(err.message || t("messageRow.toast.copyFailed")));
      },
    });
  }
  if (replyAllowed) {
    items.push({
      label: t("messageRow.menu.reply"),
      icon: <CornerUpLeft size={13} />,
      onClick: () => chatReplyActions.set(message.channel, message),
    });
  }
  if (forwardAllowed) {
    items.push({
      label: t("messageRow.menu.forward"),
      icon: <Forward size={13} />,
      onClick: () => setForwardOpen(true),
    });
  }
  items.push({
    label: t("messageRow.menu.multiSelect"),
    icon: <CheckSquare size={13} />,
    onClick: () => {
      chatSelectionActions.enter();
      chatSelectionActions.toggle(message.clientMsgNo);
    },
  });
  if (revokeAllowed) {
    items.push({
      label: t("messageRow.menu.revoke"),
      icon: <RotateCcw size={13} />,
      onClick: () => revokeMu.mutate(),
    });
  }
  if (threadAllowed) {
    items.push({
      label: t("messageRow.menu.createThread"),
      icon: <MessageSquarePlus size={13} />,
      onClick: () => setThreadOpen(true),
    });
  }
  items.push({
    label: t("messageRow.menu.delete"),
    icon: <Trash2 size={13} />,
    danger: true,
    onClick: () => setDeleteOpen(true),
  });

  if (bare) {
    return (
      <div className="px-4 py-2">
        <MessageDispatch message={message} />
      </div>
    );
  }

  const wrapperBase =
    "group relative flex items-start gap-3 px-4 transition-colors duration-150 ease-(--ease-emphasized)";
  const wrapperHover = selectionActive
    ? ""
    : "before:absolute before:inset-x-0 before:-top-0.5 before:-bottom-0.5 before:bg-[rgba(28,28,35,0.04)] before:opacity-0 before:transition-opacity before:pointer-events-none hover:before:opacity-100 [&>*]:relative [&>*]:z-[1]";
  const wrapperSelected = selectionActive && isSelected ? "bg-[rgba(127,59,245,0.08)]" : "";
  const wrapperSpacing = continueWithPrev ? "mt-3" : "mt-6";
  const wrapperClass = `${wrapperBase} ${wrapperHover} ${wrapperSelected} ${wrapperSpacing} ${
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
      content={tt("messageRow.confirmDeleteContent")}
      okDanger
      okText={tt("messageRow.menu.delete")}
      okLoading={deleteMu.isPending}
      onOk={() => deleteMu.mutate()}
      onCancel={() => setDeleteOpen(false)}
    />
  );

  const forwardDialog = (
    <ForwardModal open={forwardOpen} messages={[message]} onClose={() => setForwardOpen(false)} />
  );

  const threadDefaultName = (
    (message.content as { conversationDigest?: string } | undefined)?.conversationDigest ?? ""
  ).slice(0, 20);
  const threadDialog = (
    <InputModal
      open={threadOpen}
      title={tt("messageRow.threadModalTitle")}
      placeholder={tt("messageRow.threadModalPlaceholder")}
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

  const onReplyClick = () => {
    const reply = (message.content as { reply?: Reply }).reply;
    const seq = reply?.messageSeq;
    if (!seq) return;
    const el = document.querySelector<HTMLElement>(`[data-msg-seq="${seq}"]`);
    if (!el) {
      toast.warning(t("messageRow.replyNotVisible"));
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const prevRadius = el.style.borderRadius;
    el.style.borderRadius = "8px";
    const anim = el.animate(
      [
        { backgroundColor: "rgba(127, 59, 245, 0.1)" },
        { backgroundColor: "rgba(127, 59, 245, 0.06)", offset: 0.6 },
        { backgroundColor: "transparent" },
      ],
      { duration: 2000, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = () => {
      anim.cancel();
      el.style.borderRadius = prevRadius;
    };
  };

  if (continueWithPrev) {
    return (
      <div
        className={wrapperClass}
        data-msg-seq={message.messageSeq}
        onContextMenu={onContextMenu}
        onClick={onRowClick}
      >
        {checkbox}
        <div className="w-9 shrink-0 text-center text-[10px] leading-[22px] text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
          {formatTime(message.timestamp)}
        </div>
        <div className="relative min-w-0 flex-1">
          {(message.content as { reply?: Reply }).reply ? (
            <div className="mb-1">
              <ReplyBlock
                reply={(message.content as { reply: Reply }).reply}
                onClick={onReplyClick}
              />
            </div>
          ) : null}
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
  const senderUid = effectiveFromUID(message);
  const senderChannel = new Channel(senderUid, ChannelTypePerson);
  const isBot = isBotSender(senderUid);
  const isVerified = isSenderVerified(senderUid, isBot);
  return (
    <div
      className={wrapperClass}
      data-msg-seq={message.messageSeq}
      onContextMenu={onContextMenu}
      onClick={onRowClick}
    >
      {checkbox}
      <AvatarMenuButton
        messageChannel={message.channel}
        senderUid={senderUid}
        senderTitle={senderTitle}
      >
        <ChannelAvatar channel={senderChannel} size={36} title={senderTitle} />
      </AvatarMenuButton>
      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        <header className="flex h-[22px] items-center gap-2 leading-[22px]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openChatProfile(senderUid);
            }}
            className="cursor-pointer truncate text-[15px] font-semibold text-text-primary hover:underline"
          >
            {senderTitle}
          </button>
          {isVerified ? <RealnameBadge /> : null}
          {isBot ? <AiBadge size="small" /> : null}
          <span className="shrink-0 text-[12px] text-[rgba(28,28,35,0.4)]">
            {formatSenderTime(message.timestamp)}
          </span>
        </header>
        {(message.content as { reply?: Reply }).reply ? (
          <ReplyBlock reply={(message.content as { reply: Reply }).reply} onClick={onReplyClick} />
        ) : null}
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
