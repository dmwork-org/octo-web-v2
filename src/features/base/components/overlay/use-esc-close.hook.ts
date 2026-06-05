import { useEffect } from "react";

/**
 * Esc 键关闭 hook — 浮动元素壳层统一规范使用。
 *
 * 用于非 Radix 场景(ContextMenu / 自定义 popover / 旧 modal 残余)。
 * Radix Dialog 自带 Esc 关闭 + 嵌套智能,**不需要**手动挂这个 hook。
 *
 * 从原 confirm-modal.tsx / input-modal.tsx 等内联实现提出,统一一份。
 */
export function useEscClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}
