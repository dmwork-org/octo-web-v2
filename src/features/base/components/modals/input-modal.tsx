import { InputDialog } from "@/features/base/components/overlay/input-dialog";

interface InputModalProps {
  open: boolean;
  title: string;
  /** input 上方的小标签(可选)。如 "话题名称"。 */
  label?: string;
  /** input 占位文本 */
  placeholder?: string;
  /** 初始值,open 翻转时 reset */
  initialValue?: string;
  /** 输入校验:返回 false 时禁用确认按钮 */
  validate?: (value: string) => boolean;
  /** 确认按钮文案,默认 "确定"。 */
  okText?: string;
  /** 取消按钮文案,默认 "取消"。 */
  cancelText?: string;
  okLoading?: boolean;
  onOk: (value: string) => void;
  onCancel: () => void;
}

/**
 * 通用单行输入弹窗 — **薄 adapter**,内部委托 `InputDialog`(浮动元素壳层统一规范 Phase B)。
 *
 * 保留旧 API(onOk / onCancel 必传)以兼容数十处调用点零改动。
 *
 * 新代码请直接用 `@/features/base/components/overlay/input-dialog` 的 `InputDialog`。
 * 本 adapter 在 Phase C 末删除。
 */
export function InputModal({
  open,
  title,
  label,
  placeholder,
  initialValue,
  validate,
  okText,
  cancelText,
  okLoading,
  onOk,
  onCancel,
}: InputModalProps) {
  return (
    <InputDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={title}
      label={label}
      placeholder={placeholder}
      initialValue={initialValue}
      validate={validate}
      okText={okText}
      cancelText={cancelText}
      okLoading={okLoading}
      onOk={onOk}
      onCancel={onCancel}
    />
  );
}
