import { Store } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";

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
