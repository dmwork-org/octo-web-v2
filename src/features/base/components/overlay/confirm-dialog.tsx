import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/use-t";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface ConfirmDialogProps {
  open: boolean;
  /** 关闭回调(Esc / mask / 取消按钮 / X 都会触发) */
  onOpenChange?: (open: boolean) => void;
  title?: string;
  content: ReactNode;
  okText?: string;
  cancelText?: string;
  okDanger?: boolean;
  okLoading?: boolean;
  onOk: () => void;
  /** 显式取消回调(默认 = onOpenChange(false))。 */
  onCancel?: () => void;
}

/**
 * 确认弹窗(浮动元素壳层统一规范 — BaseDialog thin wrapper)。
 *
 * 替代老 `confirm-modal.tsx`。size=sm 固定、内置 footer(取消 + 确定 + danger/loading)。
 *
 * 兼容老 API:
 * - 旧 `onCancel` → 映射到 onOpenChange(false) + 可选 onCancel 回调
 * - 旧 `okDanger / okLoading` 保留
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  content,
  okText,
  cancelText,
  okDanger = false,
  okLoading: _okLoading = false, // 兼容老 API，加下划线避免 TS6133 未使用变量警告
  onOk,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  const handleClose = (next: boolean) => {
    if (!next) onCancel?.();
    onOpenChange?.(next);
  };
  return (
    <BaseDialog
      open={open}
      onOpenChange={handleClose}
      size="sm"
      title={title}
      // title 缺省时 description 兜底 a11y
      description={!title && typeof content === "string" ? content : undefined}
      showCloseButton={false}
      footer={
        <>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            {cancelText ?? t("base.common.cancel")}
          </Button>
          <Button
            variant={okDanger ? "destructive" : "default"}
            onClick={onOk}
          >
            {okText ?? t("base.common.confirm")}
          </Button>
        </>
      }
      contentClassName="px-5 py-4 text-sm text-text-primary"
    >
      {content}
    </BaseDialog>
  );
}
