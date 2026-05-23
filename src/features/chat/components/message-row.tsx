import WKSDK, { type Message } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { useState, type MouseEvent } from "react";
import { authStore } from "@/features/base/stores/auth";
import { MessageDispatch } from "@/features/chat/message-renderers/dispatch";
import { MessageStatusBadge } from "@/features/chat/components/message-status-badge";

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

/**
 * 单条消息行(Slack 风格,对应旧 packages/dmworkbase/src/ui/message/MessageRow):
 *   [头像 36×36] [sender + timestamp]
 *               [body]                [self 状态徽标]
 *
 * 连续消息(continueWithPrev):头像/header 折叠,只渲染 body,hover 显示 timestamp。
 * Hover 整行加 brand-tint 背景,微交互 transition 150ms ease-emphasized。
 * 右键 onContextMenu placeholder(P3-C8 接完整 ContextMenu)。
 */
export function MessageRow({ message, continueWithPrev, bare }: MessageRowProps) {
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  const [menuOpen, setMenuOpen] = useState(false);

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
    // 占位:P3-C8 接真正 ContextMenu 组件
    window.setTimeout(() => setMenuOpen(false), 1200);
  };

  if (bare) {
    return (
      <div className="px-4 py-1">
        <MessageDispatch message={message} />
      </div>
    );
  }

  const wrapperClass =
    "group relative flex gap-3 px-4 transition-colors duration-150 ease-(--ease-emphasized) hover:bg-brand-tint/40";

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
        {menuOpen ? <ContextMenuPlaceholder /> : null}
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
      {menuOpen ? <ContextMenuPlaceholder /> : null}
    </div>
  );
}

/** P3-C8 ContextMenus 接入前的占位提示(避免静默,告诉用户功能在 P3)。 */
function ContextMenuPlaceholder() {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1 right-2 z-10 rounded-md bg-bg-surface px-3 py-1.5 text-[11px] text-text-secondary shadow-md ring-1 ring-border-default"
    >
      右键菜单(复制/转发/回复/撤回)将在 P3-C8 接入
    </div>
  );
}
