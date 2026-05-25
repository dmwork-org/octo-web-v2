import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";

interface InputModalProps {
  open: boolean;
  title: string;
  /** input 占位文本 */
  placeholder?: string;
  /** 初始值,open 翻转时 reset */
  initialValue?: string;
  /** 输入校验:返回 false 时禁用确认按钮(不显示错误文案,简版) */
  validate?: (value: string) => boolean;
  okLoading?: boolean;
  onOk: (value: string) => void;
  onCancel: () => void;
}

/**
 * 通用单行输入弹窗(对应旧 dmworkbase ContextRoute inputEdit)。
 *
 * 用法:设置备注 / 修改群昵称 / 新建分组名 等单字段编辑场景。
 * z-[60] 叠在基础 modal 之上。
 */
function useResetOnOpen(open: boolean, initialValue: string, setValue: (v: string) => void) {
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue, setValue]);
}

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

export function InputModal({
  open,
  title,
  placeholder,
  initialValue = "",
  validate,
  okLoading = false,
  onOk,
  onCancel,
}: InputModalProps) {
  const [value, setValue] = useState(initialValue);
  useResetOnOpen(open, initialValue, setValue);
  useEscClose(open, onCancel);

  if (!open) return null;

  const valid = validate ? validate(value) : value.trim().length > 0;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid || okLoading) return;
    onOk(value);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 p-5">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
          />
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button type="tertiary" theme="borderless" onClick={onCancel}>
              取消
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              theme="solid"
              loading={okLoading}
              disabled={!valid}
            >
              确定
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
