import { useState, type MouseEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  MessageContentType,
  type Message,
  type MessageImage,
  type MessageText,
} from "wukongimjssdk";
import {
  CheckSquare,
  Copy,
  CornerUpLeft,
  Forward,
  Image as ImageIcon,
  MessageSquarePlus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { replyToMessage } from "@/features/chat/lib/reply-to-message";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";
import {
  deleteMessages as deleteMessagesApi,
  revokeMessage,
} from "@/features/base/api/endpoints/message.api";
import { createThread } from "@/features/base/api/endpoints/group.api";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import type { RichTextContent } from "@/features/base/im/richtext-content";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";
import { spaceStore } from "@/features/base/stores/space";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { copyImageToClipboard } from "@/features/base/lib/copy-image";
import { copyRichTextToClipboard } from "@/features/chat/lib/rich-text-clipboard";
import { authStore } from "@/features/base/stores/auth";
import { canShowRevokeMenu } from "@/features/chat/lib/revoke-permission";
import { collectRevokeRoleContext } from "@/features/chat/hooks/use-ensure-role-subscribers.hook";
import { getRevokeSecondFromCache } from "@/features/chat/lib/get-revoke-second";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

const CHANNEL_TYPE_THREAD = 5;

/**
 * 通用消息右键菜单 hook —
 *
 * 抽自 message-row.tsx 的菜单 items / dialogs / mutations 构造逻辑,
 * 让 fold-session-card 等场景也能复用同一套菜单(对齐老仓
 * `FoldSessionCard onSummaryContextMenu` + `FoldSessionExpandedList onMessageContextMenu`)。
 *
 * 用法:
 *   const { onContextMenu, render } = useMessageContextMenu(message);
 *   return <div onContextMenu={onContextMenu}>...{render()}</div>;
 *
 * 菜单条目(对齐老仓 module.tsx contextmenus.*):
 *   copy / copyImage / reply / forward / multiSelect / revoke / createThread / delete
 *
 * 选中模式下 onContextMenu 直接 return(对齐老仓 FoldSessionCard:166
 * `selectionMode ? preventDefault : onSummaryContextMenu`)。
 */
export function useMessageContextMenu(message: Message): {
  onContextMenu: (e: MouseEvent) => void;
  render: () => ReactNode;
} {
  const tt = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const selectionActive = useStore(chatSelectionStore, (s) => s.active);

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

  const revokeAllowed = me
    ? (() => {
        const { myRole, targetRole } = collectRevokeRoleContext(message, me);
        return canShowRevokeMenu({
          messageID: message.messageID,
          channelType: message.channel.channelType,
          messageSend: message.send,
          messageTimestamp: message.timestamp,
          revokeSecond: getRevokeSecondFromCache(qc),
          isBotOwner: isBotOwnerOf(message, me),
          myRole,
          targetRole,
        });
      })()
    : false;
  const forwardAllowed = canForward(message);
  const replyAllowed = canForward(message);
  const threadAllowed = canCreateThread(message);

  const items: ContextMenuItem[] = [];
  if (extractText(message)) {
    items.push({
      label: t("messageRow.menu.copy"),
      icon: <Copy size={13} />,
      onClick: () => {
        const richText = message.contentType === MessageContentTypeConst.richText;
        const copied = richText
          ? copyRichTextToClipboard(message.content as RichTextContent, message.channel)
          : navigator.clipboard.writeText(extractText(message)).then(() => true);
        void copied
          .then((ok) => {
            if (ok) toast.success(t("messageRow.toast.copied"));
            else toast.error(t("messageRow.toast.copyFailed"));
          })
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
      onClick: () => replyToMessage(message.channel, message, me),
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

  const threadDefaultName = (
    (message.content as { conversationDigest?: string } | undefined)?.conversationDigest ?? ""
  ).slice(0, 20);

  const render = (): ReactNode => (
    <>
      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        items={items}
        onClose={() => setMenu((m) => ({ ...m, open: false }))}
      />
      <ConfirmModal
        open={deleteOpen}
        content={tt("messageRow.confirmDeleteContent")}
        okDanger
        okText={tt("messageRow.menu.delete")}
        okLoading={deleteMu.isPending}
        onOk={() => deleteMu.mutate()}
        onCancel={() => setDeleteOpen(false)}
      />
      <ForwardModal open={forwardOpen} messages={[message]} onClose={() => setForwardOpen(false)} />
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
    </>
  );

  return { onContextMenu, render };
}

/** sender 是 bot 且 bot 由当前用户创建。 */
function isBotOwnerOf(message: Message, myUid: string): boolean {
  const fromChannelInfo = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(message.fromUID, ChannelTypePerson),
  );
  const fromOrgData = fromChannelInfo?.orgData as
    | { robot?: number; bot_creator_uid?: string }
    | undefined;
  return fromOrgData?.robot === 1 && fromOrgData.bot_creator_uid === myUid;
}

function extractText(message: Message): string {
  if (message.contentType === MessageContentType.text) {
    return (message.content as MessageText).text ?? "";
  }
  const digest = (message.content as { conversationDigest?: string } | undefined)
    ?.conversationDigest;
  return digest ?? "";
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
  // 子区里再创建子区不合理(老仓 contextmenus.createThread 限 ChannelTypeGroup)
  return true;
}
