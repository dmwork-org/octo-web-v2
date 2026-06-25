import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { UserName } from "@/features/matter/components/user-name";
import { anchorMessagesQueryOptions } from "@/features/matter/queries/matters.query";
import type { IMMessageResp } from "@/features/matter/api/message-bridge.api";
import { useT } from "@/lib/i18n/use-t";

// ─── Props ──────────────────────────────────────────────

export interface AnchorPopoverProps {
  open: boolean;
  channelId: string;
  channelType: number;
  channelName: string;
  messageIds: string[];
  onClose: () => void;
  /** 锚定 viewport 坐标 (px)，由调用方根据按钮 rect 计算 */
  x?: number;
  top?: number;
  bottom?: number;
  /** 可选: 跳转到原消息回调 */
  onJumpToMessage?: (messageSeq: number) => void;
}

// ─── Helpers ────────────────────────────────────────────

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

/**
 * 从 payload 里提取可展示文本。
 * 文本消息取 content，其它类型显示类型占位。
 */
function extractDisplayText(msg: IMMessageResp): string {
  const p = msg.payload as Record<string, unknown> | undefined;
  if (!p) return "";
  // 文本消息
  const content = p.content;
  if (typeof content === "string" && content.trim()) {
    const MAX_LENGTH = 200;
    const text = content.trim();
    return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) + "..." : text;
  }
  // 退回到 conversationDigest
  const digest = p.conversationDigest;
  if (typeof digest === "string") return digest;
  // 文件消息
  if (p.name && typeof p.name === "string") return `[文件] ${p.name}`;
  // 图片消息
  if (p.type === 1) return "[图片]";
  return "";
}

function useCloseOnEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

// ─── Component ──────────────────────────────────────────

export function AnchorPopover({
  open,
  channelId,
  channelType,
  channelName,
  messageIds,
  onClose,
  x,
  top,
  bottom,
  onJumpToMessage,
}: AnchorPopoverProps) {
  const t = useT();

  const {
    data: messages,
    isLoading,
    isError,
  } = useQuery(anchorMessagesQueryOptions(channelId, channelType, messageIds, open));

  useCloseOnEscape(open, onClose);

  if (!open) return null;

  const displayChannelName = channelName || channelId.slice(0, 8);

  // 有 x + top/bottom 时锚定到指定 viewport 坐标, 无则居中
  const anchored = typeof x === "number" && (typeof top === "number" || typeof bottom === "number");

  const popStyle: React.CSSProperties | undefined = anchored
    ? {
        left: x,
        right: "auto",
        top: typeof top === "number" ? top : "auto",
        bottom: typeof bottom === "number" ? bottom : "auto",
        transform: "none",
        maxHeight:
          typeof top === "number"
            ? `calc(100vh - ${top + 16}px)`
            : typeof bottom === "number"
              ? `calc(100vh - ${bottom + 16}px)`
              : undefined,
      }
    : undefined;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  // 第一条成功消息的时间 (显示在 header)
  const firstOkMsg = messages?.find(() => true);

  return (
    <>
      {/* 遮罩: 透明, 点击关闭 */}
      <div
        className="fixed inset-0 z-dialog-secondary cursor-default"
        onClick={onClose}
        aria-hidden
      />
      {/* Popover */}
      <div
        className={`fixed flex w-[424px] max-h-[370px] flex-col gap-3 overflow-hidden rounded-md bg-bg-surface p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] ${anchored ? "animate-[wk-anchor-fade-in_0.12s_ease-out_both]" : "animate-[wk-anchor-pop-in_0.12s_ease-out_both]"}`}
        style={{ ...popStyle, zIndex: "calc(var(--z-dialog-secondary) + 1)" }}
        role="dialog"
        aria-modal="true"
        onClick={stop}
      >
        {/* Header: #channelName + 首条消息时间 */}
        <div className="flex items-center justify-between gap-2 bg-transparent">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-[18px] text-icon-default max-w-[325px]">
            #{displayChannelName}
          </span>
          {!isLoading && firstOkMsg && (
            <span className="shrink-0 text-sm leading-[18px] text-icon-default">
              {formatTime(firstOkMsg.timestamp)}
            </span>
          )}
        </div>

        {/* Body: 消息列表 */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto border-t border-brand-tint-15 pt-3">
          {isError ? (
            <div className="py-8 text-center text-sm text-text-tertiary">
              {t("matter.anchor.loadFailed")}
            </div>
          ) : isLoading || !messages ? (
            <div className="py-8 text-center text-sm text-text-tertiary">
              {t("matter.anchor.loadingMessages")}
            </div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-tertiary">
              {t("matter.anchor.noSourceMessages")}
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {messages.map((msg) => (
                <MessageRow
                  key={msg.message_idstr}
                  msg={msg}
                  onJump={
                    onJumpToMessage && msg.message_seq != null
                      ? () => {
                          onClose();
                          onJumpToMessage(msg.message_seq!);
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 内联 keyframes (Tailwind v4 不支持 @keyframes in utility) */}
      <style>{`
        @keyframes wk-anchor-pop-in {
          from { opacity: 0; transform: translate(-50%, -48%); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }
        @keyframes wk-anchor-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ─── 单条消息行 ──────────────────────────────────────────

function MessageRow({ msg, onJump }: { msg: IMMessageResp; onJump?: () => void }) {
  const t = useT();
  const content = extractDisplayText(msg);
  const ch = new Channel(msg.from_uid, ChannelTypePerson);
  const clickable = !!onJump;

  return (
    <li
      className={`flex flex-col gap-1 ${clickable ? "cursor-pointer rounded-md p-1 -m-1 transition-colors hover:bg-brand-tint-04" : ""}`}
      onClick={clickable ? onJump : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onJump?.();
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {/* 头: 头像 + 名字 + 时间 + 冒号 */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="inline-flex shrink-0">
            <ChannelAvatar channel={ch} size={20} title={msg.from_uid} />
          </span>
          <UserName
            uid={msg.from_uid}
            className="text-sm font-medium leading-5 text-text-primary"
          />
        </span>
        <span className="shrink-0 font-sans text-sm leading-5 text-icon-muted">
          {formatTime(msg.timestamp)}
        </span>
        <span className="text-sm text-text-primary">：</span>
      </div>
      {/* 内容: 缩进 24px */}
      <div className="pl-6">
        <p className="whitespace-pre-wrap break-words text-sm leading-5 text-text-primary">
          {content || t("matter.anchor.messageUnavailable")}
        </p>
      </div>
    </li>
  );
}
