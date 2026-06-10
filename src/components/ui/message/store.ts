import { Store } from "@tanstack/react-store";
import type { MessageItem, MessageOptions, MessageType } from "./types";

/**
 * 全局 Message store + auto-dismiss timer 管理。
 *
 * **不变量**:
 * - state.items 按显示顺序排列(最新在最后,UI 从上到下渲染)
 * - 同 key 只存一条;新调用 push 同 key 时 → 更新 content + 重置 timer
 * - loading 类型默认 duration=0(不自动消失);其他默认 3000ms
 * - dismiss(id) 主动移除并清 timer
 *
 * **timer 设计**:Map<id, timeoutId> 跟 store 外存放,key 复用时先清旧 timer
 * 再设新 — 避免"复用条目但旧 timer 仍在跑"造成提前消失的 race。
 */

interface MessageState {
  items: MessageItem[];
}

const DEFAULT_DURATION_MS = 3000;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const messageStore = new Store<MessageState>({ items: [] });

function resolveDuration(type: MessageType, duration: number | undefined): number {
  if (typeof duration === "number") return duration;
  return type === "loading" ? 0 : DEFAULT_DURATION_MS;
}

function clearTimerFor(id: number): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

function scheduleAutoDismiss(id: number, duration: number): void {
  if (duration <= 0) return;
  const t = setTimeout(() => {
    dismiss(id);
  }, duration);
  timers.set(id, t);
}

/**
 * 触发一条 message(类型 + 内容 + options)。
 *
 * 同 key 复用:找到现有 item → 更新 type/content + 清旧 timer + 设新 timer,
 * 不新增条目(对齐 antd message.key 语义)。返回的 id 始终是底层 item.id
 * (key 复用时返回旧 id,首次创建时返回新 id),supports dismiss(id) 关闭。
 */
export function show(type: MessageType, content: string, options?: MessageOptions): number {
  const { key, duration, action } = options ?? {};
  const finalDuration = resolveDuration(type, duration);

  if (key) {
    const existing = messageStore.state.items.find((it) => it.key === key);
    if (existing) {
      clearTimerFor(existing.id);
      messageStore.setState((s) => ({
        items: s.items.map((it) =>
          it.id === existing.id
            ? { ...it, type, content, duration: finalDuration, action }
            : it,
        ),
      }));
      scheduleAutoDismiss(existing.id, finalDuration);
      return existing.id;
    }
  }

  const id = nextId++;
  const item: MessageItem = { id, key, type, content, duration: finalDuration, action };
  messageStore.setState((s) => ({ items: [...s.items, item] }));
  scheduleAutoDismiss(id, finalDuration);
  return id;
}

/** 主动移除一条 message(id 或 key);id 优先,找不到再按 key。 */
export function dismiss(idOrKey: number | string): void {
  let targetId: number | null = null;
  if (typeof idOrKey === "number") {
    targetId = idOrKey;
  } else {
    const found = messageStore.state.items.find((it) => it.key === idOrKey);
    if (found) targetId = found.id;
  }
  if (targetId === null) return;
  clearTimerFor(targetId);
  messageStore.setState((s) => ({ items: s.items.filter((it) => it.id !== targetId) }));
}

/** 清所有 message(罕用:登出 / 路由切换重置)。 */
export function dismissAll(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  messageStore.setState(() => ({ items: [] }));
}
