import { Store } from "@tanstack/react-store";
import { Channel } from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { chatPendingAttachmentRegistry } from "@/features/chat/stores/chat-pending-attachment";
import { chatConfirmDialogActions } from "@/features/chat/stores/chat-confirm-dialog";
import { chatSidebarTabActions } from "@/features/chat/stores/chat-sidebar-tab";
import { t } from "@/lib/i18n/instance";

/**
 * 全局当前选中的 chat channel。
 *
 * 设计:
 * - chat / contacts(以及未来 matter / summary 凡需展示聊天主区) 共用一个
 *   ChatMain 组件,由这个 store 驱动当前显示哪个会话。
 * - sidebar 切换会话 / 联系人详情点击 → chatSelectedActions.select(channel)
 * - chatSelectedActions.clear() — 进入"无选中"占位状态
 *
 * 同 Space 下持久化到 localStorage,刷新后恢复当前会话。Space 切换 / 退出登录时
 * clear() 会同步清掉持久化值,避免恢复到错误工作区。
 *
 * **未发送附件守卫**(对齐旧 dmworkbase Pages/Chat `pendingAttachmentGuard` 模式):
 * - `select` 内部检查 [chat-pending-attachment.ts](./chat-pending-attachment.ts)
 *   注册的 guard,有未发送附件时 → 改走 confirm dialog(`chatConfirmDialogActions.show`)
 *   确认后才真切;取消则 channel 不变。
 * - 同 channel 重选(channelID + type 一致)直接跳过 guard,不弹 modal。
 * - clear(Space 切换 / 退出登录)不走 guard:Space 已变,旧 channel 已无意义,
 *   不应阻塞用户(对齐旧 ChatVM.spaceChangedHandler 强清行为)。
 */

interface ChatSelectedState {
  channel: Channel | null;
}

interface PersistedSelectedChannel {
  channelID: string;
  channelType: number;
  spaceId: string | null;
}

const STORAGE_KEY = "octo:chat:selected-channel";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePersisted(value: unknown): PersistedSelectedChannel | null {
  if (!isObject(value)) return null;
  const { channelID, channelType, spaceId } = value;
  if (typeof channelID !== "string" || channelID.length === 0) return null;
  if (typeof channelType !== "number" || !Number.isFinite(channelType)) return null;
  if (spaceId !== null && typeof spaceId !== "string") return null;
  return { channelID, channelType, spaceId };
}

function removePersistedChannel(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage quota / private mode errors
  }
}

function readPersistedChannel(): Channel | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = parsePersisted(JSON.parse(raw) as unknown);
    if (!payload || payload.spaceId !== spaceStore.state.spaceId) {
      removePersistedChannel();
      return null;
    }
    return new Channel(payload.channelID, payload.channelType);
  } catch {
    removePersistedChannel();
    return null;
  }
}

function writePersistedChannel(channel: Channel): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedSelectedChannel = {
      channelID: channel.channelID,
      channelType: channel.channelType,
      spaceId: spaceStore.state.spaceId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota / private mode errors
  }
}

export const chatSelectedStore = new Store<ChatSelectedState>({ channel: readPersistedChannel() });

function isSameChannel(a: Channel | null, b: Channel): boolean {
  return !!a && a.channelID === b.channelID && a.channelType === b.channelType;
}

/**
 * 选中会话的入口选项。
 *
 * **fromSidebarList**(对齐老仓 EndpointCommon.tsx:138 + Pages/Chat:1197):
 * 外部入口(global search / 通知 / 弹窗 / matter / citation / 新建群 / 子区
 * 跳转等)默认强切到 recent tab — recent filter='all' 不论目标是否 followed
 * 都能展示并高亮;留在 follow tab 时未关注的会话**列表里看不到 + 无法高亮**,
 * 用户不知道当前在哪。sidebar 内点击传 `true` 跳过切 tab,避免点 follow
 * 列表里的项被强切到 recent。
 */
export interface SelectChannelOptions {
  fromSidebarList?: boolean;
}

function doSelect(channel: Channel, opts?: SelectChannelOptions): void {
  if (!opts?.fromSidebarList) {
    chatSidebarTabActions.setTab("recent");
  }
  chatSelectedStore.setState(() => ({ channel }));
  writePersistedChannel(channel);
}

export const chatSelectedActions = {
  select: (channel: Channel, opts?: SelectChannelOptions) => {
    if (isSameChannel(chatSelectedStore.state.channel, channel)) {
      writePersistedChannel(channel);
      return;
    }
    if (chatPendingAttachmentRegistry.hasPending()) {
      chatConfirmDialogActions.show({
        title: t("chatSelected.pendingAttachment.title"),
        message: t("chatSelected.pendingAttachment.message"),
        okText: t("chatSelected.pendingAttachment.ok"),
        onOk: () => doSelect(channel, opts),
      });
      return;
    }
    doSelect(channel, opts);
  },
  clear: () => {
    chatSelectedStore.setState(() => ({ channel: null }));
    removePersistedChannel();
  },
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
