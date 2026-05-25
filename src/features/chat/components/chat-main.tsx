import { useStore } from "@tanstack/react-store";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { chatSelectionStore } from "@/features/chat/stores/chat-selection";
import { ChatHeader } from "@/features/chat/components/chat-header";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";
import { SelectionToolbar } from "@/features/chat/components/selection-toolbar";

/**
 * ChatMain — chat / contacts(以及未来 matter / summary 凡需展示聊天主区)
 * 共用的"右侧主区"。
 *
 * 数据来源:chatSelectedStore.channel
 * - null  → "选择对话,激活连接"占位
 * - chan  → ChatHeader + MessageList + (selection active ? SelectionToolbar : Composer)
 *
 * 多选模式(F-5c)时 Composer 替换为 SelectionToolbar(对齐旧 ConversationVM editOn)。
 */
export function ChatMain() {
  const channel = useStore(chatSelectedStore, (s) => s.channel);
  const selectionActive = useStore(chatSelectionStore, (s) => s.active);

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
      {selectionActive ? <SelectionToolbar channel={channel} /> : <Composer channel={channel} />}
    </section>
  );
}
