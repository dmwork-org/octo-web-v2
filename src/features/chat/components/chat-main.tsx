import { useState } from "react";
import { useStore } from "@tanstack/react-store";
import { ChannelTypeGroup } from "wukongimjssdk";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { chatSelectionStore } from "@/features/chat/stores/chat-selection";
import { ChatHeader } from "@/features/chat/components/chat-header";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";
import { SelectionToolbar } from "@/features/chat/components/selection-toolbar";
import { ThreadListPanel } from "@/features/chat/components/thread-list-panel";

/**
 * ChatMain — chat / contacts(以及未来 matter / summary 凡需展示聊天主区)
 * 共用的"右侧主区"。
 *
 * 数据来源:chatSelectedStore.channel
 * - null  → "选择对话,激活连接"占位
 * - chan  → ChatHeader + MessageList + (selection active ? SelectionToolbar : Composer)
 *
 * 子区列表 panel:chat-header MessagesSquare 按钮(只 group 显示)toggle,
 * panel absolute 浮在右侧覆盖 chat 主区(对应旧 Pages/Chat showThreadPanel)。
 */
export function ChatMain() {
  const channel = useStore(chatSelectedStore, (s) => s.channel);
  const selectionActive = useStore(chatSelectionStore, (s) => s.active);
  const [threadPanelOpen, setThreadPanelOpen] = useState(false);

  if (!channel) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        选择对话,激活连接
      </section>
    );
  }

  const showThreadIcon = channel.channelType === ChannelTypeGroup;

  return (
    <section className="relative flex flex-1 flex-col overflow-hidden">
      <ChatHeader
        channel={channel}
        showThreadIcon={showThreadIcon}
        threadPanelOpen={threadPanelOpen}
        onToggleThreadPanel={() => setThreadPanelOpen((v) => !v)}
      />
      <MessageList channel={channel} />
      {selectionActive ? (
        <SelectionToolbar channel={channel} />
      ) : (
        <Composer key={`${channel.channelID}_${channel.channelType}`} channel={channel} />
      )}
      {showThreadIcon ? (
        <ThreadListPanel
          open={threadPanelOpen}
          groupNo={channel.channelID}
          onClose={() => setThreadPanelOpen(false)}
        />
      ) : null}
    </section>
  );
}
