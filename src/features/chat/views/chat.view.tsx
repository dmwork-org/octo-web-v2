import { useState } from "react";
import { type Conversation } from "wukongimjssdk";
import { ConversationSidebar } from "@/features/chat/components/conversation-sidebar";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";
import { ChatHeader } from "@/features/chat/components/chat-header";

export function ChatView() {
  const [selected, setSelected] = useState<Conversation | null>(null);

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConversationSidebar selectedChannelId={selected?.channel.channelID} onSelect={setSelected} />
      <section className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            <ChatHeader conversation={selected} />
            <MessageList channel={selected.channel} />
            <Composer channel={selected.channel} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            从左侧选一个会话
          </div>
        )}
      </section>
    </div>
  );
}
