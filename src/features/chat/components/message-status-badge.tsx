import { useStore } from "@tanstack/react-store";
import WKSDK, { type Message, MessageStatus } from "wukongimjssdk";
import { Loader2, AlertCircle } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";

interface MessageStatusBadgeProps {
  message: Message;
}

/**
 * 自己发出消息的状态指示(Wait→spinner / Fail→红 ! 点击重发)。
 * Normal 状态不渲染。他人消息也不渲染。
 *
 * 重发:再次调 chatManager.send(content, channel)。SDK 自带的 sendingQueue 会处理
 * clientSeq 唯一性,新消息会拿到新 clientMsgNo,旧失败的标记仍留在 cache(P3 加
 * "删除失败消息"的 UI 入口)。
 */
export function MessageStatusBadge({ message }: MessageStatusBadgeProps) {
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  if (!isSelf) return null;

  if (message.status === MessageStatus.Wait) {
    return (
      <span
        aria-label="发送中"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text-tertiary"
      >
        <Loader2 size={14} className="animate-spin" />
      </span>
    );
  }
  if (message.status === MessageStatus.Fail) {
    return (
      <button
        type="button"
        title="发送失败,点击重发"
        aria-label="重新发送"
        onClick={() => {
          void WKSDK.shared().chatManager.send(message.content, message.channel);
        }}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-error hover:bg-error/10"
      >
        <AlertCircle size={16} />
      </button>
    );
  }
  return null;
}
