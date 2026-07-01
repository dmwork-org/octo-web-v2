import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  ConversationAction,
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
import { message as appMessage } from "@/components/ui/message";
import { extractApiErrorMessage } from "@/features/base/api/api-error";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import { InputDialog } from "@/features/base/components/overlay/input-dialog";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { replyToMessage } from "@/features/chat/lib/reply-to-message";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";
import {
  deleteMessages as deleteMessagesApi,
  revokeMessage,
} from "@/features/base/api/endpoints/message.api";
import { createThread } from "@/features/base/api/endpoints/group.api";
import { followThread } from "@/features/base/api/endpoints/follow.api";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import {
  RichTextBlockType,
  createRichTextContent,
  type RichTextBlock,
  type RichTextContent,
} from "@/features/base/im/richtext-content";
import {
  sidebarFollowQueryKey,
  type SidebarFollowDerived,
} from "@/features/chat/queries/sidebar.query";
import { spaceStore } from "@/features/base/stores/space";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { copyImageToClipboard } from "@/features/base/lib/copy-image";
import { copyRichTextToClipboard } from "@/features/chat/lib/rich-text-clipboard";
import { authStore } from "@/features/base/stores/auth";
import { safeAiServiceText } from "@/features/chat/lib/ai-error-message";
import { canShowRevokeMenu } from "@/features/chat/lib/revoke-permission";
import {
  collectRevokeRoleContext,
  warmMissingRevokeTargetRole,
} from "@/features/chat/hooks/use-ensure-role-subscribers.hook";
import { getRevokeSecondFromCache } from "@/features/chat/lib/get-revoke-second";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

const CHANNEL_TYPE_THREAD = 5;

interface SelectionSnapshot {
  text: string;
  start: number;
  end: number;
}

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
  onMouseDown: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  render: () => ReactNode;
} {
  const tt = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const selectionActive = useStore(chatSelectionStore, (s) => s.active);
  const selectionRootRef = useRef<Node | null>(null);
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; selectedText: string }>({
    open: false,
    x: 0,
    y: 0,
    selectedText: "",
  });
  const [targetImageUrl, setTargetImageUrl] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);

  const onMouseDown = (e: MouseEvent) => {
    if (selectionActive || e.button !== 2) return;
    const snapshot = captureSelectionWithin(e.currentTarget);
    selectionRootRef.current = e.currentTarget instanceof Node ? e.currentTarget : null;
    selectionSnapshotRef.current = snapshot?.text.trim() ? snapshot : null;
  };

  const onContextMenu = (e: MouseEvent) => {
    if (selectionActive) return;
    e.preventDefault();
    if (me) warmMissingRevokeTargetRole(message, me);
    const liveSnapshot = captureSelectionWithin(e.currentTarget);
    const savedSnapshot =
      selectionRootRef.current === e.currentTarget ? selectionSnapshotRef.current : null;
    const snapshot = liveSnapshot?.text.trim() ? liveSnapshot : savedSnapshot;
    selectionRootRef.current = e.currentTarget instanceof Node ? e.currentTarget : null;
    selectionSnapshotRef.current = snapshot ?? null;
    setTargetImageUrl(getContextTargetImageUrl(e.target));
    setMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      selectedText: snapshot?.text ?? "",
    });
  };

  useLayoutEffect(() => {
    if (!menu.open) return;
    const root = selectionRootRef.current;
    const snapshot = selectionSnapshotRef.current;
    if (!root || !snapshot) return;
    restoreSelectionWithin(root, snapshot);
  }, [menu.open, menu.x, menu.y]);

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

  const markRevokedLocally = () => {
    const revoker = me ?? message.fromUID;
    const messageId = message.messageID;
    const clientMsgNo = message.clientMsgNo;

    qc.setQueryData<InfiniteData<Message[], number>>(
      messagesQueryKey(message.channel.channelID, message.channel.channelType),
      (prev) => {
        if (!prev) return prev;
        let touched = false;
        for (const page of prev.pages) {
          for (const cachedMessage of page) {
            if (isSameMessage(cachedMessage, messageId, clientMsgNo)) {
              cachedMessage.remoteExtra.revoke = true;
              cachedMessage.remoteExtra.revoker = revoker;
              touched = true;
            }
          }
        }
        if (!touched) return prev;
        return { ...prev, pages: prev.pages.map((page) => [...page]) };
      },
    );

    const cm = WKSDK.shared().conversationManager;
    const conv = cm.findConversation(message.channel);
    const lastMessage = conv?.lastMessage;
    if (lastMessage && isSameMessage(lastMessage, messageId, clientMsgNo)) {
      lastMessage.remoteExtra.revoke = true;
      lastMessage.remoteExtra.revoker = revoker;
      cm.notifyConversationListeners(conv, ConversationAction.update);
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
    }
  };

  const revokeMu = useMutation({
    mutationFn: () =>
      revokeMessage({
        channel: message.channel,
        messageId: message.messageID,
        clientMsgNo: message.clientMsgNo,
      }),
    onSuccess: () => {
      markRevokedLocally();
      appMessage.success(t("messageRow.toast.revoked"));
    },
    onError: (err) =>
      appMessage.error(extractApiErrorMessage(err, t("messageRow.toast.revokeFailed"))),
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
      appMessage.success(t("messageRow.toast.deleted"));
      setDeleteOpen(false);
    },
    onError: (err) =>
      appMessage.error(err instanceof Error ? err.message : t("messageRow.toast.deleteFailed")),
  });

  const maybeFollowCreatedThread = async (threadChannelId: string) => {
    const follow = qc.getQueryData<SidebarFollowDerived>(sidebarFollowQueryKey(spaceId));
    const parentGroupNo = message.channel.channelID;
    if (!follow?.followedGroupNos.has(parentGroupNo)) return;
    if (follow.followedKeys.has(`${CHANNEL_TYPE_THREAD}::${threadChannelId}`)) return;
    try {
      await followThread(threadChannelId);
    } catch (err) {
      console.warn("auto-follow created thread failed", err);
    }
  };

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
    onSuccess: async (resp) => {
      appMessage.success(t("messageRow.toast.threadCreated"));
      setThreadOpen(false);
      if (resp?.channel_id) {
        await maybeFollowCreatedThread(resp.channel_id);
        void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
        chatSelectedActions.select(new Channel(resp.channel_id, CHANNEL_TYPE_THREAD));
      } else {
        void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      }
    },
    onError: (err) =>
      appMessage.error(
        err instanceof Error ? err.message : t("messageRow.toast.threadCreateFailed"),
      ),
  });

  const imageUrl = targetImageUrl || getSingleCopyableImageUrl(message);
  const copyableImageBlocks = getCopyableImageBlocks(message);

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

  const selectedText = menu.selectedText.trim() ? menu.selectedText : "";
  const messageText = extractText(message);
  const items: ContextMenuItem[] = [];
  if (canCopy(message) && (selectedText || messageText)) {
    items.push({
      label: t("messageRow.menu.copy"),
      icon: <Copy size={13} />,
      onClick: () => {
        const richText = message.contentType === MessageContentTypeConst.richText;
        const copied = selectedText
          ? navigator.clipboard.writeText(selectedText).then(() => true)
          : richText
            ? copyRichTextToClipboard(message.content as RichTextContent, message.channel)
            : navigator.clipboard.writeText(messageText).then(() => true);
        void copied
          .then((ok) => {
            if (ok) appMessage.success(t("messageRow.toast.copied"));
            else appMessage.error(t("messageRow.toast.copyFailed"));
          })
          .catch(() => appMessage.error(t("messageRow.toast.copyFailed")));
      },
    });
  }
  if (imageUrl || copyableImageBlocks.length > 0) {
    items.push({
      label: t("messageRow.menu.copyImage"),
      icon: <ImageIcon size={13} />,
      onClick: () => {
        const copied =
          imageUrl || copyableImageBlocks.length === 1
            ? copyImageToClipboard(imageUrl || copyableImageBlocks[0].url || "").then(() => true)
            : copyRichTextToClipboard(createRichTextContent(copyableImageBlocks), message.channel);
        copied
          .then(() => appMessage.success(t("messageRow.toast.imageCopied")))
          .catch((err: Error) => appMessage.error(err.message || t("messageRow.toast.copyFailed")));
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

  const threadDefaultName = safeAiServiceText(
    (message.content as { conversationDigest?: string } | undefined)?.conversationDigest ?? "",
    t("message.aiServiceUnavailable"),
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
      <ConfirmDialog
        open={deleteOpen}
        content={tt("messageRow.confirmDeleteContent")}
        okDanger
        okText={tt("messageRow.menu.delete")}
        okLoading={deleteMu.isPending}
        onOk={() => deleteMu.mutate()}
        onCancel={() => setDeleteOpen(false)}
      />
      <ForwardModal open={forwardOpen} messages={[message]} onClose={() => setForwardOpen(false)} />
      <InputDialog
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

  return { onMouseDown, onContextMenu, render };
}

function captureSelectionWithin(root: EventTarget | null): SelectionSnapshot | null {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof Node === "undefined" ||
    !(root instanceof Node)
  ) {
    return null;
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const { anchorNode, focusNode } = selection;
  if (!anchorNode || !focusNode) return null;
  if (!root.contains(anchorNode) || !root.contains(focusNode)) return null;
  const range = selection.getRangeAt(0);
  const start = getTextOffsetWithin(root, range.startContainer, range.startOffset);
  const end = getTextOffsetWithin(root, range.endContainer, range.endOffset);
  if (start === null || end === null || start === end) return null;
  return {
    text: selection.toString(),
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function getTextOffsetWithin(root: Node, node: Node, offset: number): number | null {
  if (!root.contains(node)) return null;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function restoreSelectionWithin(root: Node, snapshot: SelectionSnapshot): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!root.isConnected) return;
  const start = findTextBoundary(root, snapshot.start);
  const end = findTextBoundary(root, snapshot.end);
  if (!start || !end) return;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function isSameMessage(message: Message, messageId: string, clientMsgNo: string): boolean {
  return (
    (messageId.length > 0 && message.messageID === messageId) ||
    (clientMsgNo.length > 0 && message.clientMsgNo === clientMsgNo)
  );
}

function findTextBoundary(root: Node, targetOffset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, targetOffset);
  let lastText: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    lastText = text;
    if (remaining <= text.data.length) return { node: text, offset: remaining };
    remaining -= text.data.length;
    current = walker.nextNode();
  }
  return lastText ? { node: lastText, offset: lastText.data.length } : null;
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
  const fallback = t("message.aiServiceUnavailable");
  if (message.contentType === MessageContentType.text) {
    return safeAiServiceText((message.content as MessageText).text ?? "", fallback);
  }
  const digest = (message.content as { conversationDigest?: string } | undefined)
    ?.conversationDigest;
  return safeAiServiceText(digest ?? "", fallback);
}

function isSystemMessage(message: Message): boolean {
  return message.contentType >= 1000 && message.contentType < 2000;
}

function canForward(message: Message): boolean {
  if (isSystemMessage(message)) return false;
  if (message.contentType === MessageContentType.cmd) return false;
  return true;
}

function canCopy(message: Message): boolean {
  return (
    message.contentType === MessageContentType.text ||
    message.contentType === MessageContentTypeConst.richText
  );
}

function getSingleCopyableImageUrl(message: Message): string {
  if (message.contentType === MessageContentType.image) {
    const image = message.content as MessageImage & { remoteUrl?: string };
    return image.url || image.remoteUrl || "";
  }
  return "";
}

function getCopyableImageBlocks(message: Message): RichTextBlock[] {
  if (message.contentType !== MessageContentTypeConst.richText) return [];
  const richText = message.content as RichTextContent;
  return richText.content.filter((block) => block.type === RichTextBlockType.image && block.url);
}

function getContextTargetImageUrl(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "";
  return target.closest<HTMLElement>("[data-richtext-image-url]")?.dataset.richtextImageUrl || "";
}

function canCreateThread(message: Message): boolean {
  if (message.channel.channelType !== ChannelTypeGroup) return false;
  if (isSystemMessage(message)) return false;
  // 子区里再创建子区不合理(老仓 contextmenus.createThread 限 ChannelTypeGroup)
  return true;
}
