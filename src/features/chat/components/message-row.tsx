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
import { message as appMessage } from "@/components/ui/message";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConversationOnlineBadge } from "@/features/chat/components/conversation-online-badge";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { AvatarMenuButton } from "@/features/chat/components/avatar-menu-button";
import { openChatProfile } from "@/features/chat/lib/open-profile";
import { useMessageContextMenu } from "@/features/chat/hooks/use-message-context-menu.hook";
import { locateReplyMessage } from "@/features/chat/lib/locate-reply-message";
import { MessageDispatch } from "@/features/chat/message-renderers/dispatch";
import { MessageStatusBadge } from "@/features/chat/components/message-status-badge";
import { shouldShowConversationOnline } from "@/features/chat/lib/conversation-online";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ReplyBlock } from "@/features/chat/components/reply-block";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";
import { isMessageSelectable } from "@/features/chat/lib/message-selection";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";
import {
  isIncomingWebhookSender,
  webhookFromOfMessage,
} from "@/features/chat/lib/incoming-webhook";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import {
  formatMessageTimeShort as formatTime,
  formatMessageTimestamp as formatSenderTime,
} from "@/features/chat/lib/format-message-time";
import {
  effectiveFromUID,
  senderDisplay,
  senderExternalSpaceName,
  senderSubscribersChannel,
} from "@/features/chat/lib/message-sender-display";

interface MessageRowProps {
  message: Message;
  /** 与上一条同一发送者且时间相近时,跳过头像和 header(连续消息折叠)。 */
  continueWithPrev?: boolean;
  /** 系统消息 / 撤回消息 / time renderer 等不渲染头像 + sender,直接居中。 */
  bare?: boolean;
}

function useSenderInfoLive(fromUID: string, sourceChannel: Channel): void {
  const [, force] = useState(0);
  const sourceChannelID = sourceChannel.channelID;
  const sourceChannelType = sourceChannel.channelType;
  useEffect(() => {
    if (!fromUID) return;
    if (isIncomingWebhookSender(fromUID)) return;
    const mgr = WKSDK.shared().channelManager;
    const ch = new Channel(fromUID, ChannelTypePerson);
    if (!mgr.getChannelInfo(ch)) {
      // 走 tryFetchChannelInfo 模块级 attempted set 防 message-row 多次 mount
      // 触发同 uid 重复 fetch(issue #84)
      tryFetchChannelInfo(ch);
    }
    const listener: ChannelInfoListener = (info) => {
      const c = info?.channel;
      if (c?.channelID === fromUID && c?.channelType === ChannelTypePerson) {
        force((v) => v + 1);
      }
    };
    mgr.addListener(listener);
    const subscribersChannel = senderSubscribersChannel(
      new Channel(sourceChannelID, sourceChannelType),
    );
    const subscriberListener = (channel: Channel) => {
      if (
        subscribersChannel &&
        channel.channelID === subscribersChannel.channelID &&
        channel.channelType === subscribersChannel.channelType
      ) {
        force((v) => v + 1);
      }
    };
    if (subscribersChannel) {
      mgr.addSubscriberChangeListener(subscriberListener);
    }
    return () => {
      mgr.removeListener(listener);
      if (subscribersChannel) mgr.removeSubscriberChangeListener(subscriberListener);
    };
  }, [fromUID, sourceChannelID, sourceChannelType]);
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
  useSenderInfoLive(effectiveFromUID(message), message.channel);
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
  const webhookFrom = webhookFromOfMessage(
    message as {
      fromUID?: string;
      content?: { contentObj?: { from?: unknown } };
    },
  );

  const { onMouseDown, onContextMenu, render: renderMenu } = useMessageContextMenu(message);

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
      const loadingId = appMessage.loading(t("messageRow.replyLoading"));
      try {
        el = await locateReplyMessage(qc, message.channel, seq);
      } finally {
        appMessage.dismiss(loadingId);
      }
    }
    if (!el) {
      appMessage.warning(t("messageRow.replyNotFound"));
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
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onRowClick}
      >
        {checkbox}
        <div className="w-9 shrink-0 text-center text-[10px] leading-[22px] text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
          {formatTime(message.timestamp)}
        </div>
        <div className={`relative min-w-0 flex-1${selectionActive ? " pointer-events-none" : ""}`}>
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

  const senderTitle = webhookFrom
    ? webhookFrom.name || t("messageRow.webhookFallbackName")
    : senderDisplay(message);
  const senderSpaceName = webhookFrom ? "" : senderExternalSpaceName(message);
  const senderUid = effectiveFromUID(message);
  const senderChannel = new Channel(senderUid, ChannelTypePerson);
  const isWebhook = !!webhookFrom;
  const isBot = !isWebhook && isBotSender(senderUid);
  const isVerified = isSenderVerified(senderUid, isBot);
  const senderInfo = WKSDK.shared().channelManager.getChannelInfo(senderChannel);
  const showOnline = shouldShowConversationOnline(senderInfo);
  return (
    <div
      className={wrapperClass}
      data-msg-seq={message.messageSeq}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onClick={onRowClick}
    >
      {checkbox}
      <div className={`relative h-9 w-9 shrink-0 ${selectionActive ? "pointer-events-none" : ""}`}>
        {isWebhook ? (
          <ChannelAvatar
            channel={new Channel(senderUid, ChannelTypePerson)}
            size={36}
            title={senderTitle}
          />
        ) : (
          <AvatarMenuButton
            messageChannel={message.channel}
            senderUid={senderUid}
            senderTitle={senderTitle}
          >
            <ChannelAvatar channel={senderChannel} size={36} title={senderTitle} />
          </AvatarMenuButton>
        )}
        {showOnline ? <ConversationOnlineBadge info={senderInfo} /> : null}
      </div>
      <div
        className={`relative flex min-w-0 flex-1 flex-col gap-1${selectionActive ? " pointer-events-none" : ""}`}
      >
        <header className="flex h-[22px] items-center gap-2 leading-[22px]">
          {isWebhook ? (
            <span className="truncate text-[15px] font-semibold text-text-primary">
              {senderTitle}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openChatProfile(senderUid, message.channel);
              }}
              className="min-w-0 cursor-pointer truncate text-left text-[15px] font-semibold text-text-primary hover:underline"
            >
              {senderTitle}
            </button>
          )}
          {senderSpaceName ? (
            <span className="shrink-0 text-[13px] font-medium text-text-tertiary">
              @{senderSpaceName}
            </span>
          ) : null}
          {isVerified ? <RealnameBadge /> : null}
          {isWebhook ? (
            <span className="shrink-0 rounded-sm bg-[#F0EAFF] px-1.5 text-[10px] font-medium text-[#6B3DD8]">
              {t("messageRow.webhookBadge")}
            </span>
          ) : null}
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
