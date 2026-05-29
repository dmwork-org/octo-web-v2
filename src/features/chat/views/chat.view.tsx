import { useStore } from "@tanstack/react-store";
import { ConversationSidebar } from "@/features/chat/components/conversation-sidebar";
import { ChatMain } from "@/features/chat/components/chat-main";
import { chatSelectedStore, chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatProfileStore, chatProfileActions } from "@/features/chat/stores/chat-profile";
import { UserInfoModal } from "@/features/base/components/modals/user-info-modal";
import { BotDetailModal } from "@/features/base/components/modals/bot-detail-modal";

/**
 * chat 主视图。
 *
 * 顶部 mount UserInfoModal + BotDetailModal,受 chatProfileStore 控制 —
 * mention click / 头像 click 通过 lib/open-profile.ts 统一 dispatch action 唤起,
 * 对齐旧 dmworkbase WKApp.shared.baseContext.showUserInfo / showBotDetail 全局入口。
 */
export function ChatView() {
  const channel = useStore(chatSelectedStore, (s) => s.channel);
  const profile = useStore(chatProfileStore, (s) => s);

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConversationSidebar
        selectedChannelId={channel?.channelID}
        onSelect={(c) => chatSelectedActions.select(c.channel)}
      />
      <ChatMain />
      <UserInfoModal
        uid={profile.kind === "user" ? profile.uid : null}
        onClose={chatProfileActions.close}
      />
      <BotDetailModal
        uid={profile.kind === "bot" ? profile.uid : null}
        onClose={chatProfileActions.close}
      />
    </div>
  );
}
