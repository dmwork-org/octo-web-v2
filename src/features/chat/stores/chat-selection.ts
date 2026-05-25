import { Store } from "@tanstack/react-store";
import { chatSelectedStore } from "@/features/chat/stores/chat-selected";

/**
 * 多选模式 store(对应旧 ConversationVM.editOn + selectedMessages):
 *
 * - active: 是否在多选模式
 * - ids: 已选消息的 clientMsgNo 集合(SDK 用 clientMsgNo 唯一标识本地消息)
 *
 * Channel 切换时自动退出(对齐旧 setEditOn(false) 行为)。
 */

interface ChatSelectionState {
  active: boolean;
  ids: Set<string>;
}

const initialState: ChatSelectionState = {
  active: false,
  ids: new Set<string>(),
};

export const chatSelectionStore = new Store<ChatSelectionState>(initialState);

export const chatSelectionActions = {
  enter: () => chatSelectionStore.setState(() => ({ active: true, ids: new Set<string>() })),
  exit: () => chatSelectionStore.setState(() => ({ active: false, ids: new Set<string>() })),
  toggle: (clientMsgNo: string) =>
    chatSelectionStore.setState((s) => {
      const next = new Set(s.ids);
      if (next.has(clientMsgNo)) next.delete(clientMsgNo);
      else next.add(clientMsgNo);
      return { ...s, ids: next };
    }),
  clear: () => chatSelectionStore.setState((s) => ({ ...s, ids: new Set<string>() })),
};

/**
 * 跨 store 联动:切换会话时退出多选。
 * main.tsx 启动时调一次。
 */
export function wireChatSelectionResetOnChannelChange(): void {
  let lastChannelId = chatSelectedStore.state.channel?.channelID ?? null;
  chatSelectedStore.subscribe(() => {
    const next = chatSelectedStore.state.channel?.channelID ?? null;
    if (next === lastChannelId) return;
    lastChannelId = next;
    chatSelectionActions.exit();
  });
}
