import { useEffect, useState } from "react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { UserName } from "@/features/matter/components/user-name";
import { getMessages, type IMMessageResp } from "@/features/matter/api/message-bridge.api";

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

/** 提取消息展示文本：优先取 payload.conversationDigest（字符串），否则 JSON 序列化 payload */
function extractMsgText(payload: Record<string, unknown>): string {
  const digest = payload.conversationDigest;
  if (typeof digest === "string") return digest;
  if (digest != null) return JSON.stringify(digest);
  return JSON.stringify(payload);
}

/**
 * 异步拉取原消息 hook — 将 useEffect 从组件本体抽离。
 * open 变化时自动触发；关闭时复位状态。
 */
function useAnchorMessages(
  open: boolean,
  channelId: string,
  channelType: number,
  messageIds: string[],
) {
  const [messages, setMessages] = useState<IMMessageResp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMessages(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setMessages(null);
    setError(null);
    void getMessages(channelId, channelType, messageIds).then((msgs) => {
      if (cancelled) return;
      if (msgs.length === 0) {
        setError("无法查看原消息");
      } else {
        setMessages(msgs);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, channelId, channelType, messageIds]);

  return { messages, error };
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
  const { messages, error } = useAnchorMessages(open, channelId, channelType, messageIds);

  return (
    <BaseDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      size="md"
      title={`${channelName} · 原消息上下文`}
    >
      {(() => {
        if (error) {
          return <p className="py-8 text-center text-sm text-text-tertiary">{error}</p>;
        }
        if (!messages) {
          return <p className="py-8 text-center text-sm text-text-tertiary">加载中…</p>;
        }
        return (
          <ul className="flex flex-col gap-3">
            {messages.map((msg) => {
              const ch = new Channel(msg.from_uid, ChannelTypePerson);
              const content = extractMsgText(msg.payload);
              return (
                <li key={msg.message_idstr} className="flex gap-2.5 rounded-md bg-bg-elevated p-3">
                  <ChannelAvatar channel={ch} size={28} title={msg.from_uid} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <UserName
                        uid={msg.from_uid}
                        className="text-xs font-medium text-text-secondary"
                      />
                      <span className="text-[11px] text-text-tertiary">
                        {formatTime(msg.timestamp)}
                      </span>
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
      })()}
    </BaseDialog>
  );
}
