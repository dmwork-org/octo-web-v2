import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";

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
 * 通用确认弹窗 — **薄 adapter**,内部委托 `ConfirmDialog`(浮动元素壳层统一规范 Phase B)。
 *
 * 保留旧 API(onOk / onCancel 必传)以兼容数十处调用点零改动。
 *
 * 新代码请直接用 `@/features/base/components/overlay/confirm-dialog` 的 `ConfirmDialog`。
 * 本 adapter 在 Phase C 末删除。
 */
export function ConfirmModal({
  open,
  title,
  content,
  okText,
  cancelText,
  okDanger,
  okLoading,
  onOk,
  onCancel,
}: ConfirmModalProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={title}
      content={content}
      okText={okText}
      cancelText={cancelText}
      okDanger={okDanger}
      okLoading={okLoading}
      onOk={onOk}
      onCancel={onCancel}
    />
  );
}
