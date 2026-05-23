import { type Message } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { authStore } from "@/features/base/stores/auth";

interface RevokedRendererProps {
  message: Message;
}

/**
 * 撤回消息占位渲染。
 * - 自己撤回:"你撤回了一条消息"
 * - 他人撤回:"<姓名> 撤回了一条消息"(姓名暂用 fromUID;P3 接 ChannelInfo subscriber 拿名)
 *
 * 由 dispatch 在所有 contentType 分发之前优先检查 message.remoteExtra.revoke。
 */
export function RevokedRenderer({ message }: RevokedRendererProps) {
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const revoker = message.remoteExtra.revoker || message.fromUID;
  const isSelf = me !== null && revoker === me;
  const label = isSelf ? "你撤回了一条消息" : `${revoker} 撤回了一条消息`;
  return (
    <div className="flex justify-center">
      <span className="rounded bg-bg-elevated px-3 py-1 text-[11px] text-text-tertiary">
        {label}
      </span>
    </div>
  );
}
