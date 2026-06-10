import WKSDK, {
  Channel,
  ChannelTypePerson,
  type ChannelInfoListener,
  type Reply,
  type Message,
} from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { toast } from "@/components/semi-bridge/toast";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { AvatarMenuButton } from "@/features/chat/components/avatar-menu-button";
import { openChatProfile } from "@/features/chat/lib/open-profile";
import { useMessageContextMenu } from "@/features/chat/hooks/use-message-context-menu.hook";
import { locateReplyMessage } from "@/features/chat/lib/locate-reply-message";
import { MessageDispatch } from "@/features/chat/message-renderers/dispatch";
import { MessageStatusBadge } from "@/features/chat/components/message-status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ReplyBlock } from "@/features/chat/components/reply-block";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";
import { isMessageSelectable } from "@/features/chat/lib/message-selection";
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

/**
 * 单条消息行(Slack 风格,对应旧 packages/dmworkbase/src/ui/message/MessageRow)。
 */
export function MessageRow({ message, continueWithPrev, bare }: MessageRowProps) {
  useSenderInfoLive(effectiveFromUID(message));
  const qc = useQueryClient();
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  const selectionActive = useStore(chatSelectionStore, (s) => s.active);
  const selectionIds = useStore(chatSelectionStore, (s) => s.ids);
  const isSelected = selectionIds.has(message.clientMsgNo);
  /**
   * 多选可选性(对齐上游 `930b8fa5` isMessageSelectable):
   * - time / historySplit / typing / threadCreated 等系统/标记类不可选
   * - 不可选时:不渲染 checkbox + row 点击不 toggle + 不进选中集
   *   (避免后续转发/批量操作命中 system message 导致后端 400)
   */
  const selectable = isMessageSelectable(message);

  const { onContextMenu, render: renderMenu } = useMessageContextMenu(message);

  const onRowClick = () => {
    if (!selectionActive || !selectable) return;
    chatSelectionActions.toggle(message.clientMsgNo);
  };

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
    selectionActive && selectable ? "cursor-pointer" : ""
  }`;

  // 多选模式且消息不可选时,仍占位 checkbox 槽位保持对齐(对齐上游灰化策略),
  // 但内部不渲染勾选框(避免视觉误导)。
  const checkbox = selectionActive ? (
    <div className="flex w-6 shrink-0 items-center justify-center self-stretch">
      {selectable ? (
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
            isSelected ? "border-brand bg-brand text-white" : "border-border-default bg-bg-base"
          }`}
          aria-hidden
        >
          {isSelected ? <Check size={12} strokeWidth={3} /> : null}
        </span>
      ) : null}
    </div>
  ) : null;

  const onReplyClick = async () => {
    const reply = (message.content as { reply?: Reply }).reply;
    const seq = reply?.messageSeq;
    if (!seq) return;
    // 快速路径:已渲染在 DOM 内,直接定位
    let el = document.querySelector<HTMLElement>(`[data-msg-seq="${seq}"]`);
    if (!el) {
      // 不在当前页 → 循环拉历史
      const loadingId = toast.loading(t("messageRow.replyLoading"));
      try {
        el = await locateReplyMessage(qc, message.channel, seq);
      } finally {
        toast.dismiss(loadingId);
      }
    }
    if (!el) {
      toast.warning(t("messageRow.replyNotFound"));
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
      if (el) el.style.borderRadius = prevRadius;
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
        {renderMenu()}
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
      {renderMenu()}
    </div>
  );
}
