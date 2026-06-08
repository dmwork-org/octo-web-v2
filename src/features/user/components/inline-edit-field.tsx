import { useEffect, useState } from "react";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";

interface InlineEditFieldProps {
  label: string;
  value: string;
  maxLength?: number;
  placeholder?: string;
  /** 提交保存,返 Promise(失败被调用方 toast)。 */
  onSave: (next: string) => Promise<void>;
}

/** value sync hook 命名(满足 no-useeffect-in-component)。 */
function useSyncValue(value: string, setDraft: (v: string) => void) {
  useEffect(() => {
    setDraft(value);
  }, [value, setDraft]);
}

/**
 * 行内编辑文本字段(对齐老仓 InputEdit)。
 *
 * - 默认显示文本 + "编辑"链接
 * - 编辑态:input + 保存 / 取消
 * - 保存中显 loading
 * - 外部 value 变 → 自动 sync draft(防 invalidate 后展示旧值)
 */
export function InlineEditField({
  label,
  value,
  maxLength = 20,
  placeholder,
  onSave,
}: InlineEditFieldProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useSyncValue(value, setDraft);

  const onSubmit = async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-sm text-text-tertiary">{label}</span>
      {editing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            className="flex-1 rounded border border-border-default bg-bg-surface px-2 py-1 text-sm text-text-primary"
          />
          <Button onClick={() => void onSubmit()} loading={saving} type="primary" theme="solid">
            {t("user.inlineEdit.save")}
          </Button>
          <Button
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
            disabled={saving}
          >
            {t("user.inlineEdit.cancel")}
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate text-sm text-text-primary">{value || placeholder}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-brand hover:underline"
          >
            {t("user.inlineEdit.edit")}
          </button>
        </>
      )}
    </div>
  );
}
