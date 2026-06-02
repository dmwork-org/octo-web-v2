import { useEffect, useState } from "react";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypeGroup, type Message } from "wukongimjssdk";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { chatSelectionStore } from "@/features/chat/stores/chat-selection";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { ChatHeader } from "@/features/chat/components/chat-header";
import { ChatEmptyHologram } from "@/features/chat/components/chat-empty-hologram";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";
import { SelectionToolbar } from "@/features/chat/components/selection-toolbar";
import { ThreadListPanel } from "@/features/chat/components/thread-list-panel";
import { FilePreviewPanel } from "@/features/chat/components/file-preview-panel";
import { MatterListPanel } from "@/features/chat/components/matter-list-panel";
import { SmartCreateModal } from "@/features/matter/components/smart-create-modal";

interface CreateMatterRequest {
  channel: Channel;
  messages: Message[];
}

/**
 * 监听 composer 派发的 chat:create-matter-from-composer 事件(A5 Alt+Enter)。
 * 命中后用当前 channel 打开 SmartCreateModal(无选中消息;C1)。
 *
 * 抽成命名 hook 满足 no-useeffect-in-component。
 */
function useListenCreateMatterFromComposer(
  channel: Channel | null,
  onRequest: (req: CreateMatterRequest) => void,
) {
  useEffect(() => {
    if (!channel) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ channelId: string; channelType: number }>).detail;
      if (!detail) return;
      if (detail.channelId !== channel.channelID || detail.channelType !== channel.channelType) {
        return;
      }
      onRequest({ channel, messages: [] });
    };
    window.addEventListener("chat:create-matter-from-composer", handler);
    return () => window.removeEventListener("chat:create-matter-from-composer", handler);
  }, [channel, onRequest]);
}

/**
 * ChatMain — chat / contacts(以及未来 matter / summary 凡需展示聊天主区)
 * 共用的"右侧主区"。
 *
 * **侧边 panel(互斥渲染)** — 由 chatSidePanelStore.kind 决定:
 * - threads     → 渲染 ThreadListPanel
 * - filePreview → 渲染 FilePreviewPanel
 * - matter      → 渲染 MatterListPanel(B1+B2)
 * - none        → 不渲染右侧
 *
 * 互斥语义对齐旧 dmworkbase Pages/Chat `_onFilePreview`。横向 flex sibling 模式。
 *
 * **Alt+Enter 创建事项**(C1):composer 派发 chat:create-matter-from-composer 事件,
 * 本组件 listener 打开 SmartCreateModal(无选中消息),走 extractMatter 创建流程。
 * selection-toolbar 的批量"创建事项"路径保持独立(本地 state,不影响该入口)。
 */
export function ChatMain() {
  const channel = useStore(chatSelectedStore, (s) => s.channel);
  const selectionActive = useStore(chatSelectionStore, (s) => s.active);
  const sidePanelKind = useStore(chatSidePanelStore, (s) => s.kind);
  const [createMatter, setCreateMatter] = useState<CreateMatterRequest | null>(null);
  useListenCreateMatterFromComposer(channel ?? null, setCreateMatter);

  if (!channel) {
    return <ChatEmptyHologram />;
  }

  const showThreadIcon = channel.channelType === ChannelTypeGroup;
  const createMatterChannelName = createMatter
    ? (WKSDK.shared().channelManager.getChannelInfo(createMatter.channel)?.title ?? undefined)
    : undefined;

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
      {sidePanelKind === "matter" ? <MatterListPanel /> : null}
      {createMatter ? (
        <SmartCreateModal
          open
          channel={createMatter.channel}
          channelName={createMatterChannelName}
          messages={createMatter.messages}
          onClose={() => setCreateMatter(null)}
        />
      ) : null}
    </div>
  );
}
