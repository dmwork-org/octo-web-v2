import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { authStore } from "@/features/base/stores/auth";

interface RevokedRendererProps {
  message: Message;
}

/**
 * 撤回消息占位渲染(1:1 对齐旧 dmworkbase Messages/Revoke/index.tsx 文案):
 * - 自己撤回:"你撤回了一条消息"
 * - 他人撤回:"<姓名> 撤回了一条消息"(走 Person channelInfo.title fallback uid)
 *
 * 由 dispatch 在所有 contentType 分发之前优先检查 message.remoteExtra.revoke。
 */
export function RevokedRenderer({ message }: RevokedRendererProps) {
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const revoker = message.remoteExtra.revoker || message.fromUID;
  const isSelf = me !== null && revoker === me;
  const name = isSelf ? "你" : displayNameOf(revoker);
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-md bg-bg-elevated px-3 py-1 text-[11px] leading-none text-text-tertiary">
        {`${name}撤回了一条消息`}
      </span>
    </div>
  );
}

/**
 * uid → 显示名:Person channelInfo.title fallback uid。
 * channelInfo 未缓存时返回 uid 字符串(撤回是低频事件,不主动 fetch,等下次推送 listener 触发重渲)。
 */
function displayNameOf(uid: string): string {
  if (!uid) return "";
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  return info?.title || uid;
}
