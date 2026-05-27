import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import {
  matterDetailQueryOptions,
  matterDetailQueryKey,
} from "@/features/matter/queries/matters.query";
import { deleteMatter, transitionMatter } from "@/features/matter/api/matter.api";
import type { MatterStatus } from "@/features/matter/types/matter.types";
import { MatterStatusBadge } from "@/features/matter/components/matter-status-badge";
import { AssigneePicker } from "@/features/matter/components/assignee-picker";

interface MatterDetailProps {
  matterId: string | null;
  onDeleted: () => void;
}

const STATUS_OPTIONS: { id: MatterStatus; label: string }[] = [
  { id: "open", label: "进行中" },
  { id: "done", label: "已完成" },
  { id: "archived", label: "归档" },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Matter 右列详情面板(MVP):
 * - 顶部:M-{seq_no} + 状态 badge + 状态切换按钮 + 删除
 * - 主体:title + description + 元数据 + 受理人编辑
 *
 * P3+ 留:timeline / channel linking / smart extract — 已在 Commit 0 移除依赖。
 * 本组件将在 Commit 7 整体重写为 matter-detail-panel.tsx,这里只保留 MVP 必需字段。
 */
export function MatterDetail({ matterId, onDeleted }: MatterDetailProps) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(matterDetailQueryOptions(matterId));
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  const transitionMu = useMutation({
    mutationFn: (status: MatterStatus) => transitionMatter(matterId!, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matter", "list"] });
      void qc.invalidateQueries({ queryKey: matterDetailQueryKey(matterId!) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "状态切换失败"),
  });

  const deleteMu = useMutation({
    mutationFn: () => deleteMatter(matterId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matter", "list"] });
      toast.success("已删除");
      onDeleted();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  const assigneeUids = useMemo(() => (data?.assignees ?? []).map((a) => a.user_id), [data]);

  if (!matterId) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        从左侧选一个事项查看详情
      </section>
    );
  }
  if (isLoading) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        加载详情…
      </section>
    );
  }
  if (error || !data) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-error">
        详情加载失败
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">M-{data.seq_no}</span>
          <MatterStatusBadge status={data.status} size="md" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {STATUS_OPTIONS.filter((o) => o.id !== data.status).map((o) => (
            <Button
              key={o.id}
              type="tertiary"
              theme="borderless"
              size="small"
              loading={transitionMu.isPending && transitionMu.variables === o.id}
              onClick={() => transitionMu.mutate(o.id)}
            >
              标为{o.label}
            </Button>
          ))}
          <Button
            type="danger"
            theme="borderless"
            size="small"
            iconOnly
            loading={deleteMu.isPending}
            onClick={() => {
              if (window.confirm("确认删除该事项?")) deleteMu.mutate();
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <h1 className="text-xl font-semibold text-text-primary">{data.title}</h1>

        {data.description ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-secondary">
            {data.description}
          </p>
        ) : (
          <p className="text-sm text-text-tertiary italic">暂无描述</p>
        )}

        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-xs">
          <dt className="text-text-tertiary">截止日期</dt>
          <dd className="text-text-primary">{data.deadline ? formatTime(data.deadline) : "—"}</dd>
          <dt className="text-text-tertiary">来源</dt>
          <dd className="text-text-primary">{data.source_name ?? "—"}</dd>
          <dt className="text-text-tertiary">创建人</dt>
          <dd className="font-mono text-text-primary">{data.creator_id}</dd>

          <dt className="self-start pt-1 text-text-tertiary">负责人</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            {assigneeUids.length > 0 ? (
              assigneeUids.map((uid) => (
                <span
                  key={uid}
                  className="inline-flex items-center gap-1 rounded-full bg-bg-elevated py-0.5 pr-2 pl-0.5 text-text-primary"
                >
                  <ChannelAvatar
                    channel={new Channel(uid, ChannelTypePerson)}
                    size={20}
                    title={uid}
                  />
                  <span className="truncate text-[12px]">{uid}</span>
                </span>
              ))
            ) : (
              <span className="text-text-tertiary">—</span>
            )}
            <button
              type="button"
              onClick={() => setAssigneePickerOpen(true)}
              aria-label="编辑受理人"
              className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Pencil size={12} />
            </button>
          </dd>

          <dt className="text-text-tertiary">创建时间</dt>
          <dd className="text-text-primary">{formatTime(data.created_at)}</dd>
          <dt className="text-text-tertiary">更新时间</dt>
          <dd className="text-text-primary">{formatTime(data.updated_at)}</dd>
        </dl>
      </div>

      <AssigneePicker
        open={assigneePickerOpen}
        matterId={matterId}
        currentAssigneeUids={assigneeUids}
        onClose={() => setAssigneePickerOpen(false)}
      />
    </section>
  );
}
