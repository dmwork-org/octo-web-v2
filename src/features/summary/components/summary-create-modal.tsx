import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChannelTypeGroup, ChannelTypePerson, type Conversation } from "wukongimjssdk";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { createSummary } from "@/features/summary/api/summary.api";
import { SourceType, SummaryMode, type SourceItem } from "@/features/summary/types/summary.types";

interface SummaryCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (taskId: number) => void;
}

function convToSource(c: Conversation): SourceItem {
  const type =
    c.channel.channelType === ChannelTypeGroup
      ? SourceType.GROUP_CHAT
      : c.channel.channelType === ChannelTypePerson
        ? SourceType.DIRECT_MESSAGE
        : SourceType.THREAD;
  return {
    source_type: type,
    source_id: c.channel.channelID,
    source_name: c.channelInfo?.title ?? c.channel.channelID,
  };
}

/**
 * 创建总结(Wave 2 简版):
 * - title + topic 两个文本字段(后端要求 topic 必填,旧实现把 topic 复用为 title)
 * - 来源会话 multi-select:从 SDK conversations 列出群聊 + DM,checkbox 多选
 *   (旧 SmartCreate 单独 ChatSelector 弹窗,这里 inline 简化)
 *
 * 不做(Wave 3+):个人模式参与者选择、模板、定时任务、time_range 范围、智能模板提取。
 */
export function SummaryCreateModal({ open, onClose, onCreated }: SummaryCreateModalProps) {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: conversations } = useQuery({
    ...conversationsQueryOptions(spaceId),
    enabled: open,
  });

  const candidates = useMemo(() => {
    return (conversations ?? []).filter(
      (c) =>
        c.channel.channelType === ChannelTypeGroup || c.channel.channelType === ChannelTypePerson,
    );
  }, [conversations]);

  const mu = useMutation({
    mutationFn: () => {
      const sources = candidates
        .filter((c) => selectedIds.has(c.channel.channelID))
        .map(convToSource);
      return createSummary({
        topic: topic.trim(),
        title: title.trim() || topic.trim(),
        summary_mode: SummaryMode.BY_GROUP,
        sources: sources.length > 0 ? sources : undefined,
      });
    },
    onSuccess: ({ task_id }) => {
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      toast.success("总结任务已创建");
      setTitle("");
      setTopic("");
      setSelectedIds(new Set());
      onCreated(task_id);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "创建失败"),
  });

  if (!open) return null;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!topic.trim() || mu.isPending) return;
    mu.mutate();
  };

  const toggleSource = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">新建总结</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">想总结什么 *</span>
              <textarea
                autoFocus
                value={topic}
                onChange={(e) => setTopic(e.target.value.slice(0, 1000))}
                rows={3}
                placeholder="例:总结本周项目进度 / 整理客户反馈"
                className="resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
              />
              <span className="self-end text-[10px] text-text-tertiary">{topic.length}/1000</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">标题(留空用 topic)</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="可选"
                className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
              />
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">
                信息来源 ({selectedIds.size} 选中)
              </span>
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-md border border-border-default bg-bg-base p-1">
                {candidates.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-text-tertiary">
                    没有可选会话
                  </div>
                ) : (
                  candidates.map((c) => {
                    const id = c.channel.channelID;
                    const checked = selectedIds.has(id);
                    const isGroup = c.channel.channelType === ChannelTypeGroup;
                    const name = c.channelInfo?.title ?? id;
                    return (
                      <label
                        key={`${c.channel.channelType}-${id}`}
                        className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bg-hover ${
                          checked ? "bg-brand-tint" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSource(id)}
                          className="shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate text-text-primary">{name}</span>
                        <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
                          {isGroup ? "群" : "私聊"}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
            <Button type="tertiary" theme="borderless" onClick={onClose}>
              取消
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              theme="solid"
              loading={mu.isPending}
              disabled={!topic.trim()}
            >
              创建
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
