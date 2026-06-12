import { useEffect, useState } from "react";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { chatSelectionStore } from "@/features/chat/stores/chat-selection";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { ChatHeader } from "@/features/chat/components/chat-header";
import { ChatEmptyHologram } from "@/features/chat/components/chat-empty-hologram";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";
import { useArchivedThreadInputNotice } from "@/features/chat/hooks/use-archived-thread-input-notice.hook";
import { SelectionToolbar } from "@/features/chat/components/selection-toolbar";
import { ThreadListPanel } from "@/features/chat/components/thread-list-panel";
import { FilePreviewPanel } from "@/features/chat/components/file-preview-panel";
import { MatterListPanel } from "@/features/chat/components/matter-list-panel";
import { ChatSummaryPanel } from "@/features/chat/components/chat-summary-panel";
import { CreateMatterModal } from "@/features/matter/components/create-matter-modal";
import { ChatSummaryNewModal } from "@/features/summary/components/chat-summary-new-modal";
import { useEnsureRoleSubscribersForRevoke } from "@/features/chat/hooks/use-ensure-role-subscribers.hook";
import { useEnsureAppConfigLoaded } from "@/features/chat/hooks/use-ensure-app-config-loaded.hook";

/**
 * Channel 切换时关掉所有右侧 panel(对齐旧 ChatContentPage 用 key={channel.getChannelKey()}
 * 重建组件让 showThreadPanel / previewFile / showMatterPanel 等 local state 归零的语义)。
 * 新仓 chatSidePanelStore 是全局 store,不绑 channel,必须显式 close,否则切群后还看到
 * 上一个群的 thread / matter / filePreview / summary。命名 hook 满足
 * no-useeffect-in-component。
 */
function useResetSidePanelOnChannelChange(channelKey: string): void {
  useEffect(() => {
    chatSidePanelActions.close();
  }, [channelKey]);
}

function useResetSummaryCreateModalOnChannelChange(
  channelKey: string,
  setChannel: (channel: Channel | null) => void,
): void {
  useEffect(() => {
    setChannel(null);
  }, [channelKey, setChannel]);
}

/**
 * 监听 composer 派发的 chat:create-matter-from-composer 事件(A5 Alt+Enter / 工具栏 ✓)。
 * 命中后用当前 channel 打开 CreateMatterModal(手动 4 字段表单,本群成员候选)。
 *
 * 抽成命名 hook 满足 no-useeffect-in-component。
 */
function useListenCreateMatterFromComposer(
  channel: Channel | null,
  onRequest: (channel: Channel) => void,
) {
  useEffect(() => {
    if (!channel) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ channelId: string; channelType: number }>).detail;
      if (!detail) return;
      if (detail.channelId !== channel.channelID || detail.channelType !== channel.channelType) {
        return;
      }
      onRequest(channel);
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
 * - matter      → 渲染 MatterListPanel
 * - summary     → 渲染 ChatSummaryPanel(chat 上下文智能总结)
 * - none        → 不渲染右侧
 *
 * **创建事项触发路径**:
 * - composer ✓ / Alt+Enter → CustomEvent → 本组件 listener 打开 CreateMatterModal
 *   (手动 4 字段表单,候选限本群成员;source_channel_* 自动透传)
 * - selection-toolbar 多选消息 → "创建新事项" → 走 SmartCreateModal(独立路径,
 *   本地 state,不在本组件管,触发 AI extract)
 */
export function ChatMain() {
  const channel = useStore(chatSelectedStore, (s) => s.channel);
  const selectionActive = useStore(chatSelectionStore, (s) => s.active);
  const sidePanelKind = useStore(chatSidePanelStore, (s) => s.kind);
  const [createMatterChannel, setCreateMatterChannel] = useState<Channel | null>(null);
  const [summaryCreateChannel, setSummaryCreateChannel] = useState<Channel | null>(null);
  useListenCreateMatterFromComposer(channel ?? null, setCreateMatterChannel);
  const channelKey = channel ? `${channel.channelID}_${channel.channelType}` : "_";
  // channel 切换 → 关掉所有右侧 panel(对齐旧 ChatContentPage key 重建语义)
  useResetSidePanelOnChannelChange(channelKey);
  useResetSummaryCreateModalOnChannelChange(channelKey, setSummaryCreateChannel);
  // 进入群/子区时预热 subscribers,供 message-row 撤回菜单同步读 myRole/targetRole
  useEnsureRoleSubscribersForRevoke(channel);
  // issue #113:子区在主区域(完整视图)打开时,归档状态也要给 composer 顶部 notice
  // — thread-list-panel 内嵌 detail view 早已支持,主区域同步对齐
  const archivedInputNotice = useArchivedThreadInputNotice(channel);
  // 预热 appConfig → message-row 同步读 revoke_second
  useEnsureAppConfigLoaded();

  if (!channel) {
    return <ChatEmptyHologram />;
  }

  const showThreadIcon = channel.channelType === ChannelTypeGroup;
  const createMatterChannelName = createMatterChannel
    ? (WKSDK.shared().channelManager.getChannelInfo(createMatterChannel)?.title ?? undefined)
    : undefined;

  return (
    <div className="flex flex-1 overflow-hidden">
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-base">
        <ChatHeader
          channel={channel}
          showThreadIcon={showThreadIcon}
          threadPanelOpen={sidePanelKind === "threads"}
          onToggleThreadPanel={() => chatSidePanelActions.toggleThreads()}
          onOpenSummaryCreate={() => setSummaryCreateChannel(channel)}
        />
        <MessageList channel={channel} />
        {selectionActive ? (
          <SelectionToolbar channel={channel} />
        ) : (
          <Composer
            key={`${channel.channelID}_${channel.channelType}`}
            channel={channel}
            inputNotice={archivedInputNotice}
          />
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
      {sidePanelKind === "summary" ? (
        <ChatSummaryPanel onCreateNew={() => setSummaryCreateChannel(channel)} />
      ) : null}
      {createMatterChannel ? (
        <CreateMatterModal
          open
          onClose={() => setCreateMatterChannel(null)}
          sourceChannel={{ channel: createMatterChannel, name: createMatterChannelName }}
        />
      ) : null}
      {summaryCreateChannel ? (
        <ChatSummaryNewModal
          open
          channel={summaryCreateChannel}
          onClose={() => setSummaryCreateChannel(null)}
          onCreated={() => {
            setSummaryCreateChannel(null);
            chatSidePanelActions.openSummary(null);
          }}
        />
      ) : null}
    </div>
  );
}
