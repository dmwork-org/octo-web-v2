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
 * **resetAll**(对齐上游 7a42c23a / #187):前台回归 / WebSocket 重连时调用,
 * 强制清空所有 channel 的 typing。背景:App 后台 / 断连期间 bot 真实回复经 HTTP
 * sync 落库,**不**触发 WS messageListener → 唯一清除路径失效,typing 永不清。
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
  /** 反查 channel(resetAll 时按 channel 广播 notify)。 */
  channel: Channel;
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
    this.map.set(key, { fromUID, fromName, timer, channel });
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

  /**
   * 清空所有 channel 的 typing。先快照 entries → stop timer + clear map → 按
   * channel 逐个广播 notify(false)。先快照后 clear 是为了在遍历中改 map 不出错。
   */
  resetAll(): void {
    if (this.map.size === 0) return;
    const snapshot: Channel[] = [];
    for (const entry of this.map.values()) {
      clearTimeout(entry.timer);
      snapshot.push(entry.channel);
    }
    this.map.clear();
    for (const channel of snapshot) this.notify(channel, false);
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
