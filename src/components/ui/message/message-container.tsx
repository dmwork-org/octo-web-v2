import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@tanstack/react-store";
import { MessageItem } from "./message-item";
import { messageStore } from "./store";

/**
 * 全局 Message 容器 — 在 root layout 单实例挂载(对齐 sonner Toaster 同款角色)。
 *
 * 渲染策略:
 * - Portal 到 document.body,固定顶部居中(top-4 z-toast)
 * - subscribe messageStore,纯渲染 list(状态 + auto-dismiss 都在 store 内)
 * - 多条堆叠:column gap-2,从上到下 = 旧 → 新
 * - 进入/退出动画用 tailwindcss-animate(fade-in-0 + slide-in-from-top-2 / fade-out-0)
 * - z-index:`z-toast`(高于 dialog / drawer / system-overlay,通知不应该被蒙层遮)
 * - SSR 安全:document undefined 时不渲染(typeof window 守门)
 */
export function MessageContainer() {
  const items = useStore(messageStore, (s) => s.items);
  const portalTarget = useDocumentBody();
  if (!portalTarget) return null;
  if (items.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed top-4 left-1/2 z-toast flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="animate-in fade-in-0 slide-in-from-top-2 duration-200 ease-(--ease-emphasized)"
        >
          <MessageItem item={item} />
        </div>
      ))}
    </div>,
    portalTarget,
  );
}

/**
 * 拿 document.body 作 Portal target。SSR / 首屏 hydration 时 document
 * 不可用,延迟到 useEffect 后再读。命名 hook 满足 no-useeffect-in-component。
 */
function useDocumentBody(): HTMLElement | null {
  const [body, setBody] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setBody(typeof document !== "undefined" ? document.body : null);
  }, []);
  return body;
}
