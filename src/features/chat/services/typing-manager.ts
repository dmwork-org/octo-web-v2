import type { Channel } from "wukongimjssdk";

/**
 * Typing 状态管理(1:1 对齐旧 dmworkbase Service/TypingManager.tsx):
 *
 * - bot 输入时后端发 CMD 消息 `cmd: 'typing'`(带 channel_id / from_uid / from_name)
 * - CMD listener 调 `addTyping(channel, fromUID, fromName)` 注册到本 manager
 * - 同 channel 重复 add 走 restart(刷新 8s 失活定时器)
 * - 8s 内无新 typing 推送 → 自动 removeTyping(对齐旧 TYPING_TIMEOUT)
 * - bot 真消息到达时(use-messages-sync messageListener)主动 removeTyping
 *
 * **listener**:per-channel 状态变化通知订阅者(use-typing-for-channel hook 转 React state)。
 *
 * **不走 React store**:typing 是高频 transient 状态(< 1s 触发频繁),用 react-store 会
 * 让所有订阅者多次 re-render。单例 Map + 命令式 listener 跟旧仓一致。
 */

const TYPING_TIMEOUT_MS = 8 * 1000;

export interface TypingInfo {
  fromUID: string;
  fromName: string;
}

interface TypingEntry extends TypingInfo {
  /** 失活 timer,restart 时 clear 重设。 */
  timer: ReturnType<typeof setTimeout>;
}

export type TypingListener = (channel: Channel, add: boolean) => void;

function channelKey(channel: Channel): string {
  return `${channel.channelID}_${channel.channelType}`;
}

class TypingManagerImpl {
  private map = new Map<string, TypingEntry>();
  private listeners = new Set<TypingListener>();

  addTyping(channel: Channel, fromUID: string, fromName: string, selfUid?: string): void {
    if (selfUid && fromUID === selfUid) return;
    const key = channelKey(channel);
    const existing = this.map.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.removeTyping(channel), TYPING_TIMEOUT_MS);
      return;
    }
    const timer = setTimeout(() => this.removeTyping(channel), TYPING_TIMEOUT_MS);
    this.map.set(key, { fromUID, fromName, timer });
    this.notify(channel, true);
  }

  removeTyping(channel: Channel): void {
    const key = channelKey(channel);
    const existing = this.map.get(key);
    if (!existing) return;
    clearTimeout(existing.timer);
    this.map.delete(key);
    this.notify(channel, false);
  }

  hasTyping(channel: Channel): boolean {
    return this.map.has(channelKey(channel));
  }

  getTyping(channel: Channel): TypingInfo | null {
    const e = this.map.get(channelKey(channel));
    return e ? { fromUID: e.fromUID, fromName: e.fromName } : null;
  }

  addListener(listener: TypingListener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: TypingListener): void {
    this.listeners.delete(listener);
  }

  private notify(channel: Channel, add: boolean): void {
    for (const l of this.listeners) l(channel, add);
  }
}

export const TypingManager = new TypingManagerImpl();
