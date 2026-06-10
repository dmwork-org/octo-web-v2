import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { UserName } from "@/features/matter/components/user-name";
import { anchorMessagesQueryOptions } from "@/features/matter/queries/matters.query";
import type { IMMessageResp } from "@/features/matter/api/message-bridge.api";

interface AnchorPopoverProps {
  open: boolean;
  channelId: string;
  channelType: number;
  channelName: string;
  messageIds: string[];
  onClose: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const mm = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

/** 提取消息展示文本 */
function extractMsgText(payload: Record<string, unknown>): string {
  const digest = payload.conversationDigest;
  if (typeof digest === "string") return digest;
  if (digest != null) return JSON.stringify(digest);
  // 文件消息：显示文件名
  if (payload.name && typeof payload.name === "string") return `[文件] ${payload.name}`;
  // 图片消息
  if (payload.type === 1) return "[图片]";
  return "";
}

/**
 * 独立渲染函数，负责将消息列表渲染为 JSX。
 * 避免在 JSX 中使用 IIFE，提高可读性。
 */
function renderMessageList(messages: IMMessageResp[], channelMap: Map<string, Channel>) {
  return (
    <ul className="flex flex-col gap-3">
      {messages.map((msg) => {
        const ch = channelMap.get(msg.from_uid) ?? new Channel(msg.from_uid, ChannelTypePerson);
        const content = extractMsgText(msg.payload);
        return (
          <li key={msg.message_idstr} className="flex gap-2.5 rounded-md bg-bg-elevated p-3">
            <ChannelAvatar channel={ch} size={28} title={msg.from_uid} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <UserName uid={msg.from_uid} className="text-xs font-medium text-text-secondary" />
                <span className="text-[11px] text-text-tertiary">{formatTime(msg.timestamp)}</span>
              </div>
              {content ? (
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-text-primary break-words">
                  {content}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 原消息上下文浮层弹窗。
 *
 * 展示多条原消息的详情：发送人头像、用户名、时间、内容。
 * 用 BaseDialog 作为壳，title = "{channelName} · 原消息上下文"。
 */
export function AnchorPopover({
  open,
  channelId,
  channelType,
  channelName,
  messageIds,
  onClose,
}: AnchorPopoverProps) {
  const {
    data: messages,
    isLoading,
    isError,
  } = useQuery(anchorMessagesQueryOptions(channelId, channelType, messageIds, open));

  if (!open) return null;

  // 预缓存 Channel 实例，避免在 map 中重复 new
  const channelMap = useMemo(() => {
    const map = new Map<string, Channel>();
    if (!messages) return map;
    for (const msg of messages) {
      if (!map.has(msg.from_uid)) {
        map.set(msg.from_uid, new Channel(msg.from_uid, ChannelTypePerson));
      }
    }
    return map;
  }, [messages]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-dialog cursor-default"
        onClick={onClose}
        aria-hidden
      />
      {/* Popover */}
      <div className="absolute top-full left-0 z-dialog mt-2 w-96 rounded-md border border-border-subtle bg-bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <span className="text-sm font-medium text-text-primary">
            {channelName} · 原消息上下文
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-4">
          {isError ? (
            <p className="py-8 text-center text-sm text-text-tertiary">无法查看原消息</p>
          ) : isLoading || !messages ? (
            <p className="py-8 text-center text-sm text-text-tertiary">加载中…</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {messages.map((msg) => {
                const ch = channelMap.get(msg.from_uid) ?? new Channel(msg.from_uid, ChannelTypePerson);
                const content = extractMsgText(msg.payload);
                return (
                  <li key={msg.message_idstr} className="flex gap-2.5 rounded-md bg-bg-elevated p-3">
                    <ChannelAvatar channel={ch} size={28} title={msg.from_uid} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <UserName uid={msg.from_uid} className="text-xs font-medium text-text-secondary" />
                        <span className="text-[11px] text-text-tertiary">{formatTime(msg.timestamp)}</span>
                      </div>
                      {content ? (
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-text-primary break-words">{content}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
