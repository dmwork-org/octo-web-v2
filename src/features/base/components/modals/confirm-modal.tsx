import { useEffect } from "react";
import { Button } from "@/components/semi-bridge/button";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  content: string;
  okText?: string;
  cancelText?: string;
  okDanger?: boolean;
  okLoading?: boolean;
  onOk: () => void;
  onCancel: () => void;
}

/**
 * 通用确认弹窗(对应旧 dmworkbase BaseContext::showAlert)。
 *
 * 简版:Esc 关闭 / 点遮罩关闭 / 确认+取消按钮。
 * okDanger 用 danger 按钮 type;okLoading 在 mutation 中显示 loading。
 *
 * z-index 比 UserInfo 等基础 modal 高一层(z-[60]),保证叠在上面。
 */
function useEscClose(open: boolean, onCancel: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);
}

export function ConfirmModal({
  open,
  title,
  content,
  okText = "确定",
  cancelText = "取消",
  okDanger = false,
  okLoading = false,
  onOk,
  onCancel,
}: ConfirmModalProps) {
  useEscClose(open, onCancel);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        {title ? (
          <header className="shrink-0 border-b border-border-subtle px-5 py-3 text-sm font-semibold text-text-primary">
            {title}
          </header>
        ) : null}
        <div className="px-5 py-4 text-sm text-text-primary">{content}</div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <Button type="tertiary" theme="borderless" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            type={okDanger ? "danger" : "primary"}
            theme="solid"
            loading={okLoading}
            onClick={onOk}
          >
            {okText}
          </Button>
        </div>
      </div>
    </div>
  );
}
