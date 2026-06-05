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

/** Intl 英文短星期(Mon/Tue/.../Sun),对齐旧 dmworkbase moment `ddd` format。 */
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "short" });

/**
 * sender 旁的时间显示(对齐旧 bridge/message/useMessageRow.ts:335 formatTimestamp):
 *   今天 → HH:mm
 *   昨天 → 昨天 HH:mm
 *   一周内 → "ddd HH:mm"(英文短星期,Mon/Tue/Sat...)
 *   今年 → MM-DD HH:mm
 *   跨年 → YYYY-MM-DD HH:mm
 */
function formatSenderTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const hhmm = formatTime(ts);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, now)) return hhmm;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return `昨天 ${hhmm}`;
  const deltaDays = Math.abs(now.getTime() - d.getTime()) / 86_400_000;
  if (deltaDays < 7) return `${WEEKDAY_FORMATTER.format(d)} ${hhmm}`;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  if (d.getFullYear() === now.getFullYear()) return `${mm}-${dd} ${hhmm}`;
  return `${d.getFullYear()}-${mm}-${dd} ${hhmm}`;
}

/**
 * sender 是否 AI bot(对齐旧 conversation `channelInfo.orgData.robot === 1`)。
 * 用于在 sender name 旁渲染共用 AiBadge(渐变紫色 "AI")。
 */
function isBotSender(fromUID: string): boolean {
  if (!fromUID) return false;
  const info = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(fromUID, ChannelTypePerson),
  );
  const org = info?.orgData as { robot?: number } | undefined;
  return org?.robot === 1;
}

/**
 * realname_verified 归一化(对齐旧 Utils/displayName.ts normalizeVerified):
 * 后端可能投射 tinyint(1) → "1" / "true",必须 truthy 收敛到 boolean。
 */
function normalizeVerified(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    return s === "1" || s === "true";
  }
  return false;
}

/**
 * sender 是否已实名(对齐旧 Utils/realnameBadge.ts shouldShowRealnameBadge,简化版):
 * - bot 短路 false(AI/bot 发送者不显示徽章)
 * - Person channelInfo.orgData.realname_verified truthy → true
 *
 * 未做的旧仓覆盖:groupMember subscriber.orgData 路径(覆盖率不够再补)+
 * self-fallback(login user.realname_verified 字段尚未接入 auth store);
 * 当前 Person channelInfo 路径已覆盖大部分群消息场景。
 */
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
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex shrink-0 items-center text-[#2f8cff]"
          aria-label="已实名"
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
      <TooltipContent>已完成实名认证</TooltipContent>
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
 *   [头像 36×36] [sender + 实名 ✓? + AI 徽标? + timestamp]
 *               [body]                                    [self 状态徽标]
 *
 * 多选模式(chatSelectionStore.active)行为:
 * - 左侧渲染 checkbox(替代头像 hover 区域)
 * - 整行 click 切换 selection,不触发 ContextMenu
 *
 * 右键 → ContextMenu(F-4/F-5/F-6 完整集合,对齐旧 module.tsx
 * registerMessageContextMenus 7 项):
 *   - 复制 / 复制图片 / 回复 / 转发 / 多选 / 撤回 / 创建子区(群消息)/ 删除
 *
 * 头像 click → AvatarMenuButton 弹 popover 菜单(@TA / 查看用户信息),
 * 对齐旧 ConversationContext onTapAvatar → avatarMenusContext.show。
 * **不要**直接弹 profile modal(那是旧仓 showUser 走的快捷路径,头像 click 走菜单)。
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
      <div className="px-4 py-2">
        <MessageDispatch message={message} />
      </div>
    );
  }

  const wrapperBase =
    "group relative flex items-start gap-3 px-4 transition-colors duration-150 ease-(--ease-emphasized)";
  // hover ::before:对齐旧 .wk-msg-row::before(top/bottom -2px,bg rgba(28,28,35,0.04))
  //   伪元素绝对定位向上下扩展 2px,叠在 #f6f6f6 上 = ~#ededed(用户实地拾色一致)
  //   - z-index:before 0 / 子元素 1(确保 hover 高亮在内容下方)
  //   - 元素本身 bg 透明,只有 selected 态才覆盖
  const wrapperHover = selectionActive
    ? ""
    : "before:absolute before:inset-x-0 before:-top-0.5 before:-bottom-0.5 before:bg-[rgba(28,28,35,0.04)] before:opacity-0 before:transition-opacity before:pointer-events-none hover:before:opacity-100 [&>*]:relative [&>*]:z-[1]";
  const wrapperSelected = selectionActive && isSelected ? "bg-[rgba(127,59,245,0.08)]" : "";
  // continue 间距 12px,非 continue 24px(对齐旧 .wk-msg-row--continue margin-top)
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
      content="确定删除这条消息?该操作不可恢复。"
      okDanger
      okText="删除"
      okLoading={deleteMu.isPending}
      onOk={() => deleteMu.mutate()}
      onCancel={() => setDeleteOpen(false)}
    />
  );

  const forwardDialog = (
    <ForwardModal open={forwardOpen} messages={[message]} onClose={() => setForwardOpen(false)} />
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

  // 引用消息点击 → 定位原消息(对齐旧 Conversation.locateMessage):
  // scrollIntoView + 紫色 bg fade 动画 2s ease-out(对齐旧 .wk-message-item-reminder
  // keyframes:rgba(127,59,245,0.1) 0% → rgba(127,59,245,0.06) 60% → transparent 100%);
  // 未命中(消息可能已撤回/不在当前已加载范围)toast.warning 提示。
  const onReplyClick = () => {
    const reply = (message.content as { reply?: Reply }).reply;
    const seq = reply?.messageSeq;
    if (!seq) return;
    const el = document.querySelector<HTMLElement>(`[data-msg-seq="${seq}"]`);
    if (!el) {
      toast.warning("原消息不在当前可见范围");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // 临时加 border-radius 8px 让 bg fade 更柔和(对齐旧 .wk-message-item-reminder)
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
          <span className="truncate text-[15px] font-semibold text-text-primary">
            {senderTitle}
          </span>
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
