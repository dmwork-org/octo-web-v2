import { useEffect, useRef } from "react";
import { spaceStore } from "@/features/base/stores/space";

/**
 * Space 切换时执行 cb(典型场景:清掉 view 内的 local 选中 state,避免拿旧 Space
 * 的 entity id 去新 Space 发请求被 403)。
 *
 * 实现:订阅 spaceStore,subscribe 内调最新 cb(用 ref 把 cb 稳定起来,不需要把
 * cb 放进 deps 重订阅)。**不**在 mount 触发(只关心"切换"事件)。
 *
 * 与 features/chat/stores/chat-selected.ts 的 wireChatSelectedResetOnSpaceChange
 * 的关系:那个是模块级 store-to-store 联动(main.tsx 调一次);这个是 view 内
 * local state 联动(view 组件挂载时绑一次)。
 */
export function useResetOnSpaceChange(cb: () => void): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    let last = spaceStore.state.spaceId;
    const sub = spaceStore.subscribe(() => {
      const next = spaceStore.state.spaceId;
      if (next === last) return;
      last = next;
      cbRef.current();
    });
    return () => {
      sub.unsubscribe();
    };
  }, []);
}
