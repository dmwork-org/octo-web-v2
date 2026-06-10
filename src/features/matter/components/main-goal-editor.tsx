import { useState } from "react";
import { RichEditor } from "@/components/rich/rich-editor";
import { useT } from "@/lib/i18n/use-t";
import { useUpdateMatter } from "@/features/matter/mutations/matters.mutation";

interface MainGoalEditorProps {
  matterId: string;
  /** 后端 description 字段(HTML 串)。 */
  description?: string | null;
  /** 标签下方插入的内容（如"来自"行） */
  children?: React.ReactNode;
}

/**
 * "主要目标"编辑器(1:1 对齐原 dmworktodo MatterPage.css .wk-mp-goal):
 *
 *   ▢ 🎯 主要目标     ← 渐变 chip 标签(brand 色横向 fade,无大背景卡)
 *   {description 富文本(TipTap)}
 *
 * label 横向 brand 色渐变(原 css line 346):
 *   linear-gradient(90deg, rgba(127, 59, 245, 0.1) 0%, rgba(127, 59, 245, 0) 100%)
 * 占据一行(inline-flex 但 width full)。description 紧跟下方,无背景。
 *
 * 编辑策略:
 * - 内容受控,本地 dirty state 跟踪是否有改动
 * - onBlur 触发提交(dirty 时调 useUpdateMatter,description=HTML 串)
 * - 提交中显示"保存中…";失败由 withErrorToast 拦截器兜底
 */
export function MainGoalEditor({ matterId, description, children }: MainGoalEditorProps) {
  const t = useT();
  const initial = description ?? "";
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const updateMu = useUpdateMatter();

  const handleChange = (html: string) => {
    setDraft(html);
    if (html !== initial) setDirty(true);
  };

  const handleBlur = (html: string) => {
    if (!dirty) return;
    setDirty(false);
    updateMu.mutate({ matterId, req: { description: html } });
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center justify-between gap-2 px-2 py-1"
        style={{
          background:
            "linear-gradient(90deg, rgba(127, 59, 245, 0.1) 0%, rgba(127, 59, 245, 0) 100%)",
        }}
      >
        <div className="flex items-center gap-1 text-sm leading-5 font-semibold text-text-secondary">
          <span aria-hidden>🎯</span>
          {t("matter.field.goal")}
        </div>
        {updateMu.isPending ? (
          <span className="text-[11px] font-normal text-text-tertiary">
            {t("matter.create.goalSavingHint")}
          </span>
        ) : null}
      </div>
      {children}
      <div className="rounded-md border border-transparent px-1 py-0.5 transition-colors focus-within:border-[#6366f1] focus-within:bg-bg-primary focus-within:shadow-[0_0_0_2px_rgba(99,102,241,0.15)]">
        <RichEditor
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={t("matter.create.goalPlaceholder")}
        />
      </div>
    </div>
  );
}
