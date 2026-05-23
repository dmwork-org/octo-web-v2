import { useStore } from "@tanstack/react-store";
import { ConversationSidebar } from "@/features/chat/components/conversation-sidebar";
import { ChatMain } from "@/features/chat/components/chat-main";
import { chatSelectedStore, chatSelectedActions } from "@/features/chat/stores/chat-selected";

export function ChatView() {
  const channel = useStore(chatSelectedStore, (s) => s.channel);

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConversationSidebar
        selectedChannelId={channel?.channelID}
        onSelect={(c) => chatSelectedActions.select(c.channel)}
      />
      <ChatMain />
    </div>
  );
}
