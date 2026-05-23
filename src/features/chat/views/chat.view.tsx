import { useState } from "react";
import { type Conversation } from "wukongimjssdk";
import { ConversationList } from "@/features/chat/components/conversation-list";

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
      <section className="flex flex-1 flex-col items-center justify-center text-text-tertiary">
        {selected ? (
          <div className="text-sm">
            已选会话:{" "}
            <span className="font-mono text-text-secondary">
              {selected.channelInfo?.title ?? selected.channel.channelID}
            </span>
            <p className="mt-2 text-xs">P2-A3 阶段接入消息流(MessageList + Composer)</p>
          </div>
        ) : (
          <div className="text-sm">从左侧选一个会话(P2-A3 接入消息流)</div>
        )}
      </section>
    </div>
  );
}
