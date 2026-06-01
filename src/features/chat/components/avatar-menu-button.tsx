import { useState, type ReactNode } from "react";
import type { Channel } from "wukongimjssdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chatMentionRequestActions } from "@/features/chat/stores/chat-mention-request";
import { openChatProfile } from "@/features/chat/lib/open-profile";

/**
 * 头像 click 菜单(1:1 对齐旧 dmworkbase ConversationContext onTapAvatar +
 * avatarMenusContext 渲染):
 *
 *   头像 click → 弹 popover,2 项:
 *     1. **@TA**           — 通过 chatMentionRequestStore 通知 composer 插入 mention
 *     2. **查看用户信息** — openChatProfile 弹 UserInfoModal / BotDetailModal
 *
 * **不区分群/Person 频道**(对齐旧仓 Conversation/index.tsx:2555-2599 — 旧仓菜单
 * 两项都无条件渲染;Person 聊天点 @TA 时 composer isMentionable=false 不实际插入,
 * 但 store request 写入是 no-op 安全的)。
 *
 * **解决"点头像直接弹弹窗"**:之前 button onClick 直接 openChatProfile 跳过菜单,
 * 现在必须先弹菜单,用户选"查看用户信息"才走 profile modal。
 */
interface AvatarMenuButtonProps {
  /** 当前所在会话 channel(group / thread / person),@TA 走此 channel 的 mention 队列 */
  messageChannel: Channel;
  /** 被点击的头像所属 sender uid */
  senderUid: string;
  /** sender 显示名(用作 mention label) */
  senderTitle: string;
  /** trigger 内容 — message-row 传入 ChannelAvatar */
  children: ReactNode;
}

export function AvatarMenuButton({
  messageChannel,
  senderUid,
  senderTitle,
  children,
}: AvatarMenuButtonProps) {
  const [open, setOpen] = useState(false);

  const onMentionTa = () => {
    setOpen(false);
    chatMentionRequestActions.request(messageChannel, {
      uid: senderUid,
      label: senderTitle || senderUid,
    });
  };

  const onShowUser = () => {
    setOpen(false);
    openChatProfile(senderUid);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="头像菜单"
          className="shrink-0 cursor-pointer rounded-md transition-opacity hover:opacity-80"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-32 p-1">
        <button
          type="button"
          onClick={onMentionTa}
          className="block w-full rounded-sm px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover"
        >
          @TA
        </button>
        <button
          type="button"
          onClick={onShowUser}
          className="block w-full rounded-sm px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover"
        >
          查看用户信息
        </button>
      </PopoverContent>
    </Popover>
  );
}
