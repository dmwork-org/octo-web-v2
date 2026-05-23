import { useState } from "react";
import { type Conversation } from "wukongimjssdk";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";

export function ChatView() {
  const [selected, setSelected] = useState<Conversation | null>(null);

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-12 shrink-0 items-center border-b border-border-subtle px-4 text-sm font-semibold text-text-primary">
          会话
        </header>
        <ConversationList selectedChannelId={selected?.channel.channelID} onSelect={setSelected} />
      </aside>
      <section className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            <header className="flex h-12 shrink-0 items-center border-b border-border-subtle bg-bg-surface px-4 text-sm font-semibold text-text-primary">
              {selected.channelInfo?.title ?? selected.channel.channelID}
            </header>
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
