import { useStore } from "@tanstack/react-store";
import { ChannelTypeGroup } from "wukongimjssdk";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { chatSelectionStore } from "@/features/chat/stores/chat-selection";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { ChatHeader } from "@/features/chat/components/chat-header";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";
import { SelectionToolbar } from "@/features/chat/components/selection-toolbar";
import { ThreadListPanel } from "@/features/chat/components/thread-list-panel";
import { FilePreviewPanel } from "@/features/chat/components/file-preview-panel";

/**
 * ChatMain — chat / contacts(以及未来 matter / summary 凡需展示聊天主区)
 * 共用的"右侧主区"。
 *
 * 数据来源:chatSelectedStore.channel
 * - null  → "选择对话,激活连接"占位
 * - chan  → ChatHeader + MessageList + (selection active ? SelectionToolbar : Composer)
 *
 * **侧边 panel(互斥渲染)** — 由 chatSidePanelStore.kind 决定:
 * - threads     → 渲染 ThreadListPanel
 * - filePreview → 渲染 FilePreviewPanel
 * - none        → 不渲染右侧
 *
 * 互斥语义对齐旧 dmworkbase Pages/Chat `_onFilePreview` —
 * 打开文件预览自动关 thread(反之亦然),不会出现两个 panel 同时撑出 760px 把主区压扁。
 *
 * 横向 flex sibling 模式(主区 flex-1 自动 calc 剩余宽度),不是 absolute overlay。
 */
export function ChatMain() {
  const channel = useStore(chatSelectedStore, (s) => s.channel);
  const selectionActive = useStore(chatSelectionStore, (s) => s.active);
  const sidePanelKind = useStore(chatSidePanelStore, (s) => s.kind);

  if (!channel) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        选择对话,激活连接
      </section>
    );
  }

  const showThreadIcon = channel.channelType === ChannelTypeGroup;

  return (
    <div className="flex flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatHeader
          channel={channel}
          showThreadIcon={showThreadIcon}
          threadPanelOpen={sidePanelKind === "threads"}
          onToggleThreadPanel={() => chatSidePanelActions.toggleThreads()}
        />
        <MessageList channel={channel} />
        {selectionActive ? (
          <SelectionToolbar channel={channel} />
        ) : (
          <Composer key={`${channel.channelID}_${channel.channelType}`} channel={channel} />
        )}
      </section>
      {sidePanelKind === "threads" && showThreadIcon ? (
        <ThreadListPanel
          open
          groupNo={channel.channelID}
          onClose={() => chatSidePanelActions.close()}
        />
      ) : null}
      {sidePanelKind === "filePreview" ? <FilePreviewPanel /> : null}
    </div>
  );
}
