import { useState } from "react";
import { type Conversation } from "wukongimjssdk";
import { Search, Settings } from "lucide-react";
import { ConversationSidebar } from "@/features/chat/components/conversation-sidebar";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";

export function ChatView() {
  const [selected, setSelected] = useState<Conversation | null>(null);

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConversationSidebar selectedChannelId={selected?.channel.channelID} onSelect={setSelected} />
      <section className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-5">
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight text-text-primary">
                {selected.channelInfo?.title ?? selected.channel.channelID}
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="搜索聊天内容"
                  title="搜索聊天内容(P3-C11)"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <Search size={18} />
                </button>
                <button
                  type="button"
                  aria-label="频道设置"
                  title="频道设置(P3-C12)"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <Settings size={18} />
                </button>
              </div>
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
