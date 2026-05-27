import { useState } from "react";
import { Target } from "lucide-react";
import { RichEditor } from "@/components/rich/rich-editor";
import { useUpdateMatter } from "@/features/matter/mutations/matters.mutation";

interface MainGoalEditorProps {
  matterId: string;
  /** 后端 description 字段(HTML 串)。 */
  description?: string | null;
}

/**
 * "主要目标"编辑器(对齐 P3-matter 设计稿紫色渐变卡片):
 *
 *   ┌─────────────────────────────────────┐
 *   │ 🎯 主要目标                          │
 *   │ {description 富文本(TipTap)}      │
 *   └─────────────────────────────────────┘
 *
 * 编辑策略:
 * - 内容受控,本地 dirty state 跟踪是否有改动
 * - onBlur 触发提交(dirty 时调 useUpdateMatter,description=HTML 串)
 * - 提交中显示淡淡 saving 提示;失败由 withErrorToast 拦截器兜底
 *
 * P3-matter spec D-4:本期用 TipTap 富文本(段落 / 加粗 / 列表 / 链接,无标题)。
 */
export function MainGoalEditor({ matterId, description }: MainGoalEditorProps) {
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
    <div className="rounded-lg bg-gradient-to-br from-violet-50 to-purple-50 p-4 dark:from-violet-950/30 dark:to-purple-950/30">
      <div className="mb-2 flex items-center justify-between gap-2 text-violet-600 dark:text-violet-400">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Target size={14} />
          主要目标
        </div>
        {updateMu.isPending ? (
          <span className="text-[11px] font-normal text-text-tertiary">保存中…</span>
        ) : null}
      </div>
      <RichEditor
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="描述这个事项的主要目标(支持加粗 / 列表 / 链接)"
      />
    </div>
  );
}
