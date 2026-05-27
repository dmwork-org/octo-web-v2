import { useState, type FormEvent } from "react";
import { toast } from "@/components/semi-bridge/toast";
import { useCreateMatter } from "@/features/matter/mutations/matters.mutation";

interface QuickAddProps {
  /** 创建成功后回调,view 层用来切到刚创建的事项。 */
  onCreated?: (matterId: string) => void;
}

/**
 * QuickAdd 单行输入(P3-matter spec §5):
 * - 单行 input + Enter 提交 → useCreateMatter
 * - 提交中 disabled,空白标题不发请求
 * - 成功 toast + 清空,失败由 withErrorToast 拦截器统一兜底
 *
 * 取代旧 MatterCreateModal 的弹窗交互;Modal 仅留作 P3+ 复杂场景(描述 / 截止
 * 日期 / 受理人预选)启用。
 */
export function QuickAdd({ onCreated }: QuickAddProps) {
  const [title, setTitle] = useState("");
  const createMu = useCreateMatter();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = title.trim();
    if (!text || createMu.isPending) return;
    createMu.mutate(
      { title: text },
      {
        onSuccess: (matter) => {
          setTitle("");
          toast.success("已添加");
          onCreated?.(matter.id);
        },
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-surface px-3 py-2"
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={createMu.isPending}
        placeholder="添加事项,Enter 提交"
        className="flex-1 rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm text-text-primary transition-colors placeholder:text-text-tertiary focus:border-brand focus:outline-none disabled:opacity-60"
      />
    </form>
  );
}
