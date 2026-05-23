import { useStore } from "@tanstack/react-store";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { ChatHeader } from "@/features/chat/components/chat-header";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";

/**
 * ChatMain — chat / contacts(以及未来 matter / summary 凡需展示聊天主区)
 * 共用的"右侧主区"。
 *
 * 数据来源:chatSelectedStore.channel
 * - null  → "选择对话,激活连接"占位
 * - chan  → ChatHeader + MessageList + Composer
 *
 * 不持有任何会话级 state,所有交互通过 chatSelectedActions 改 store。
 */
export function ChatMain() {
  const channel = useStore(chatSelectedStore, (s) => s.channel);

  if (!channel) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        选择对话,激活连接
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <ChatHeader channel={channel} />
      <MessageList channel={channel} />
      <Composer channel={channel} />
    </section>
  );
}
