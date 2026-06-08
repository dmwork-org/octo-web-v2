import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface InputDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  /** input 上方的小标签(可选)。如 "话题名称"。 */
  label?: string;
  placeholder?: string;
  /** 初始值,open 翻转时 reset */
  initialValue?: string;
  /** 输入校验:返回 false 时禁用确认按钮 */
  validate?: (value: string) => boolean;
  okText?: string;
  cancelText?: string;
  okLoading?: boolean;
  onOk: (value: string) => void;
  onCancel?: () => void;
}

/** open 翻转时 reset value 到 initialValue;命名 hook 满足 no-useeffect-in-component。 */
function useResetOnOpen(open: boolean, initialValue: string, setValue: (v: string) => void) {
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue, setValue]);
}

/**
 * 单行输入弹窗(浮动元素壳层统一规范 — BaseDialog thin wrapper)。
 *
 * 替代老 `input-modal.tsx`。size=sm、内置 form + input + footer。
 * 用法:设置备注 / 改群昵称 / 新建分组名 等单字段编辑。
 */
export function InputDialog({
  open,
  onOpenChange,
  title,
  label,
  placeholder,
  initialValue = "",
  validate,
  okText,
  cancelText,
  okLoading = false,
  onOk,
  onCancel,
}: InputDialogProps) {
  const t = useT();
  const [value, setValue] = useState(initialValue);
  useResetOnOpen(open, initialValue, setValue);

  const handleClose = (next: boolean) => {
    if (!next) onCancel?.();
    onOpenChange?.(next);
  };

  const valid = validate ? validate(value) : value.trim().length > 0;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid || okLoading) return;
    onOk(value);
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={handleClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button type="tertiary" theme="borderless" onClick={() => handleClose(false)}>
            {cancelText ?? t("base.common.cancel")}
          </Button>
          <Button
            htmlType="submit"
            form="input-dialog-form"
            type="primary"
            theme="solid"
            loading={okLoading}
            disabled={!valid}
          >
            {okText ?? t("base.common.confirm")}
          </Button>
        </>
      }
      contentClassName="p-5"
    >
      <form id="input-dialog-form" onSubmit={onSubmit} className="flex flex-col gap-3">
        {label ? <label className="text-sm text-text-secondary">{label}</label> : null}
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="rounded-md border border-border-default bg-bg-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
        />
      </form>
    </BaseDialog>
  );
}
