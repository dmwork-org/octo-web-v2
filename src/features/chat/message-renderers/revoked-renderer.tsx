import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { authStore } from "@/features/base/stores/auth";
import {
  canReeditRevokedMessage,
  getReeditableMessageBlocks,
} from "@/features/chat/lib/reeditable-message";
import { chatReeditRequestActions } from "@/features/chat/stores/chat-reedit-request";
import { useT } from "@/lib/i18n/use-t";

interface RevokedRendererProps {
  message: Message;
}

/**
 * 撤回消息占位渲染(1:1 对齐老仓 dmworkbase Messages/Revoke/index.tsx 文案 4 分支):
 *
 *   revoker == me &&  revoker == sender  → "你撤回了一条消息"
 *   revoker != me &&  revoker == sender  → "<sender> 撤回了一条消息"
 *   revoker == me &&  revoker != sender  → "你撤回了成员 \"<sender>\" 的一条消息"
 *   revoker != me &&  revoker != sender  → "<revoker> 撤回了一条成员消息"
 *
 * 由 dispatch 在所有 contentType 分发之前优先检查 message.remoteExtra.revoke。
 */
export function RevokedRenderer({ message }: RevokedRendererProps) {
  const t = useT();
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const sender = message.fromUID;
  const revoker = message.remoteExtra.revoker || sender;
  const revokerIsMe = me !== null && revoker === me;
  const revokerIsSender = revoker === sender;
  const canReedit = canReeditRevokedMessage(message, me);
  const reeditBlocks = canReedit ? getReeditableMessageBlocks(message) : [];

  let text: string;
  if (revokerIsSender) {
    // 撤回自己消息(标准场景):"你/<sender> 撤回了一条消息"
    const name = revokerIsMe ? t("revoke.you") : displayNameOf(revoker);
    text = t("revoke.revokedMessage", { values: { name } });
  } else if (revokerIsMe) {
    // 群主/管理员撤回他人消息(自己视角):"你撤回了成员 \"X\" 的一条消息"
    const member = displayNameOf(sender);
    text = t("revoke.revokedMemberMessageByYou", { values: { member } });
  } else {
    // 群主/管理员撤回他人消息(旁观者视角):"<revoker> 撤回了一条成员消息"
    const name = displayNameOf(revoker);
    text = t("revoke.revokedMemberMessage", { values: { name } });
  }

  return (
    <div className="flex justify-center py-1">
      <span className="inline-flex items-center gap-2 rounded-md bg-bg-elevated px-3 py-1 text-[11px] leading-none text-text-tertiary">
        {text}
        {canReedit ? (
          <>
            <span className="h-3 w-px bg-border-default" aria-hidden />
            <button
              type="button"
              className="cursor-pointer font-medium text-brand hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                chatReeditRequestActions.request(message.channel, reeditBlocks);
              }}
            >
              {t("revoke.reedit")}
            </button>
          </>
        ) : null}
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
