import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/semi-bridge/toast";

/** editing 由 false → true 时把 draft 同步成最新 value(避免上次编辑残留)。 */
function useSyncDraftOnEnterEdit(editing: boolean, value: string, setDraft: (v: string) => void) {
  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value, setDraft]);
}

/** 编辑态打开下一帧把焦点切给 input/textarea(对齐旧 InputEdit 进入即聚焦)。 */
function useFocusOnEnterEdit(
  editing: boolean,
  ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
) {
  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* select 不支持 type 的 input(如 number)会抛,忽略 */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editing, ref]);
}

/**
 * InlineEditRow — 行内编辑文本字段。
 *
 * 来源:`src/features/chat/components/channel-setting-modal.tsx` L183-317。Phase B 抽到共享层。
 *
 * **视图态**:title 左 + value/placeholder 右,整行可点进入编辑;若 `canEdit=false` 点击
 * Toast 提示 `cantEditMessage`(对齐老仓 ListItem 禁用)。
 * **编辑态**:title 上 + input/textarea + 右下"取消" / "保存"按钮。
 *
 * **键盘**:
 * - Enter:input 模式直接保存;textarea 模式 Cmd/Ctrl+Enter 保存(避免误触换行)
 * - Esc:取消并退出
 *
 * **生命周期**(对齐老仓 InputEdit 二级页):
 * - 进入编辑 → 自动聚焦 + 光标到末尾(useFocusOnEnterEdit)
 * - 进入编辑 → draft 同步到最新 value(useSyncDraftOnEnterEdit,防上次残留)
 * - 保存:若 trim 后等于原值则不调 onSave,直接 onCancel
 *
 * **由调用方控制**:`editing` / `pending` 受控,`onEnterEdit/onCancel/onSave` 注入。
 */
export function InlineEditRow({
  title,
  value,
  placeholder,
  canEdit,
  cantEditMessage,
  multiline,
  maxLength,
  pending,
  editing,
  onEnterEdit,
  onCancel,
  onSave,
}: {
  title: string;
  value: string;
  placeholder?: string;
  canEdit: boolean;
  cantEditMessage?: string;
  multiline?: boolean;
  maxLength?: number;
  pending: boolean;
  editing: boolean;
  onEnterEdit: () => void;
  onCancel: () => void;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useSyncDraftOnEnterEdit(editing, value, setDraft);
  useFocusOnEnterEdit(editing, multiline ? textareaRef : inputRef);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!canEdit) {
            if (cantEditMessage) toast.warning(cantEditMessage);
            return;
          }
          onEnterEdit();
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-bg-hover"
      >
        <span className="flex-1 truncate text-[13px] text-text-primary">{title}</span>
        <span className="shrink-0 max-w-[60%] truncate text-[12px] text-text-tertiary">
          {value || placeholder || "未设置"}
        </span>
      </button>
    );
  }

  const trySave = () => {
    const next = draft.trim();
    if (next === value.trim()) {
      onCancel();
      return;
    }
    onSave(next);
  };

  return (
    <div className="flex w-full flex-col gap-2 px-4 py-2.5">
      <span className="text-[13px] text-text-primary">{title}</span>
      {multiline ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              trySave();
            }
          }}
          className="min-h-16 w-full resize-y rounded-md border border-border-default bg-bg-surface px-2 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
        />
      ) : (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if (e.key === "Enter") {
              e.preventDefault();
              trySave();
            }
          }}
          className="w-full rounded-md border border-border-default bg-bg-surface px-2 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
        />
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md px-3 py-1 text-[12px] text-text-tertiary transition-colors hover:bg-bg-hover disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={trySave}
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
