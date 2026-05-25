import { Store } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";

/**
 * 全局当前选中的 chat channel。
 *
 * 设计:
 * - chat / contacts(以及未来 matter / summary 凡需展示聊天主区) 共用一个
 *   ChatMain 组件,由这个 store 驱动当前显示哪个会话。
 * - sidebar 切换会话 / 联系人详情点击 → chatSelectedActions.select(channel)
 * - chatSelectedActions.clear() — 进入"无选中"占位状态
 *
 * 不持久化(刷新页面后丢失选中);P3 后续如有需要再加 storage。
 */

interface ChatSelectedState {
  channel: Channel | null;
}

export const chatSelectedStore = new Store<ChatSelectedState>({ channel: null });

export const chatSelectedActions = {
  select: (channel: Channel) => chatSelectedStore.setState(() => ({ channel })),
  clear: () => chatSelectedStore.setState(() => ({ channel: null })),
};

/**
 * 跨 store 联动:Space 切换时清掉选中(对齐旧 ChatVM.spaceChangedHandler:
 * `this.selectedConversation = undefined`)。
 *
 * 旧 channel 大概率不属于新 Space,继续显示会让 Composer 发到错的 Space。
 * main.tsx 启动时调一次。
 */
export function wireChatSelectedResetOnSpaceChange(): void {
  let lastSpaceId = spaceStore.state.spaceId;
  spaceStore.subscribe(() => {
    const next = spaceStore.state.spaceId;
    if (next === lastSpaceId) return;
    lastSpaceId = next;
    chatSelectedActions.clear();
  });
}
