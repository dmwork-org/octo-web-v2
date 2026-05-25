import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { createMatter } from "@/features/matter/api/matter.api";

interface MatterCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (matterId: string) => void;
}

/**
 * 创建 Matter 对话框(Wave 1 简版):
 * - 仅 title + description + deadline 3 字段
 * - 旧项目 CreateTaskModal / SmartCreateModal 含 AI 智能提取 / @mention / 关联会话,
 *   都放 Wave 2(SmartCreate)+ Wave 3(AssigneeEditor / Channel link)
 *
 * 居中 modal,简易遮罩 + Escape 关。
 */
export function MatterCreateModal({ open, onClose, onCreated }: MatterCreateModalProps) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");

  const mu = useMutation({
    mutationFn: () =>
      createMatter({
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
      }),
    onSuccess: (detail) => {
      void qc.invalidateQueries({ queryKey: ["matter", "list"] });
      toast.success("已创建");
      setTitle("");
      setDescription("");
      setDeadline("");
      onCreated(detail.id);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "创建事项失败");
    },
  });

  if (!open) return null;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || mu.isPending) return;
    mu.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">新建事项</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={onSubmit} className="flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">标题 *</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="说说要做什么"
              className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">描述</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="补充细节(可选)"
              className="resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">截止日期</span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            />
          </label>

          <div className="flex shrink-0 items-center justify-end gap-2 pt-2">
            <Button type="tertiary" theme="borderless" onClick={onClose}>
              取消
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              theme="solid"
              loading={mu.isPending}
              disabled={!title.trim()}
            >
              创建
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
