import { useStore } from "@tanstack/react-store";
import { ConversationSidebar } from "@/features/chat/components/conversation-sidebar";
import { ChatMain } from "@/features/chat/components/chat-main";
import { chatSelectedStore, chatSelectedActions } from "@/features/chat/stores/chat-selected";

/**
 * chat 主视图。
 *
 * UserInfoModal / BotDetailModal 已提到 AppShell(全 view 共享),通过
 * chatProfileStore 控制 — contacts / matter / chat 任意页面点头像都能弹。
 */
export function ChatView() {
  const channel = useStore(chatSelectedStore, (s) => s.channel);

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConversationSidebar
        selectedChannelId={channel?.channelID}
        onSelect={(c) => chatSelectedActions.select(c.channel, { fromSidebarList: true })}
      />
      <ChatMain />
    </div>
  );
}
