/**
 * 全局"未发送附件守卫"注册表 — 1:1 对齐旧 dmworkbase
 * `WKApp.shared.pendingAttachmentGuard` + `_guardId`。
 *
 * 谁注册:当前 mount 中的 Composer(per-channel),返回"是否有未发送附件"。
 * 谁消费:`chatSelectedActions.select` 切换 channel 前调 `hasPending()`,
 *   true 则改走 confirm dialog,确认后才真切。
 *
 * 用 instance id(Symbol)而非纯函数引用,防止"新实例 mount 注册 → 旧实例 unmount
 * 把新注册的覆盖清掉"的竞态(对齐旧 _guardId 守卫)。
 */
type GuardFn = () => boolean;

let currentGuard: { id: symbol; fn: GuardFn } | null = null;

export const chatPendingAttachmentRegistry = {
  /** Composer mount 时注册 — 返回 id 用于 unregister */
  register(fn: GuardFn): symbol {
    const id = Symbol("pending-attachment-guard");
    currentGuard = { id, fn };
    return id;
  },
  /** Composer unmount 时反注册(只清自己注册的那一份,防止覆盖新实例) */
  unregister(id: symbol): void {
    if (currentGuard && currentGuard.id === id) {
      currentGuard = null;
    }
  },
  /** 切换 channel 前调:true = 有未发送附件,需 confirm */
  hasPending(): boolean {
    return currentGuard?.fn() ?? false;
  },
};
