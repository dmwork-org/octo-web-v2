import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { editSummary } from "@/features/summary/api/summary.api";
import { t } from "@/lib/i18n/instance";
import { useT } from "@/lib/i18n/use-t";

interface SummaryEditorProps {
  taskId: number;
  baseResultId: number;
  initialContent: string;
  title: string;
  onSave: () => void;
  onCancel: () => void;
}

function useBeforeUnloadWhenDirty(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

function useAutoResizeSummaryEditor(content: string, adjustHeight: () => void): void {
  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, content]);
}

export function SummaryEditor({
  taskId,
  baseResultId,
  initialContent,
  title,
  onSave,
  onCancel,
}: SummaryEditorProps) {
  const tr = useT();
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dirty = content !== initialContent;

  useBeforeUnloadWhenDirty(dirty);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 600)}px`;
  }, []);

  useAutoResizeSummaryEditor(content, adjustHeight);

  const handleSave = async () => {
    setSaving(true);
    try {
      await editSummary(taskId, content, baseResultId);
      message.success(t("summary.editor.saveSuccess"));
      onSave();
    } catch (err) {
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
      if (status === 409) {
        message.warning(t("summary.editor.contentUpdated"));
        onSave();
        return;
      }
      message.error(err instanceof Error ? err.message : t("summary.editor.saveFailed"));
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <h3 className="min-w-0 truncate text-sm font-semibold text-text-primary">{title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="tertiary"
            theme="borderless"
            size="small"
            disabled={saving}
            onClick={onCancel}
          >
            {tr("summary.common.cancel")}
          </Button>
          <Button
            type="primary"
            theme="solid"
            size="small"
            disabled={!dirty || saving}
            loading={saving}
            onClick={handleSave}
          >
            {tr("summary.common.save")}
          </Button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={content}
        disabled={saving}
        onChange={(event) => setContent(event.target.value)}
        placeholder={tr("summary.editor.placeholder")}
        className="max-h-[calc(100vh-260px)] min-h-[360px] w-full resize-none overflow-y-auto rounded-md border border-border-default bg-bg-elevated px-4 py-3 text-sm leading-7 text-text-primary outline-none transition-shadow focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
