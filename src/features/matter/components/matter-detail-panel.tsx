import { useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Archive, MoreHorizontal, Trash2, UserPlus, X } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { matterDetailQueryOptions } from "@/features/matter/queries/matters.query";
import { useDeleteMatter, useTransitionMatter } from "@/features/matter/mutations/matters.mutation";
import { MatterStatusBadge } from "@/features/matter/components/matter-status-badge";
import { UserName } from "@/features/matter/components/user-name";
import { AssigneePicker } from "@/features/matter/components/assignee-picker";
import type { MatterStatus } from "@/features/matter/types/matter.types";

interface MatterDetailPanelProps {
  matterId: string;
  onClose: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function nextStatusForToggle(s: MatterStatus): MatterStatus {
  if (s === "open") return "done";
  return "open";
}

function toggleLabel(s: MatterStatus): string {
  return s === "open" ? "标完成" : "重新打开";
}

/**
 * Matter 详情面板(P3-matter spec §7,只读 + 操作菜单):
 *
 *   ┌ Header                                    ⋯  ✕
 *   │ M-{seq_no} {title} [status]
 *   ├ ────────────────────────────
 *   │ description
 *   │ DDL / 创建人 / 创建时间 / 更新时间
 *   │ assignees(头像 + UserName 列表)
 *   └
 *
 * 操作菜单(⋯):
 *   - 标完成 / 重新打开:useTransitionMatter(open ↔ done toggle)
 *   - 归档:useTransitionMatter("archived")
 *   - 编辑负责人:复用 AssigneePicker
 *   - 删除:ConfirmModal danger,onSuccess 调 onClose
 *
 * 用 useSuspenseQuery 触发外层 Suspense 的 loading,避免组件内 if (loading) 嵌套。
 */
export function MatterDetailPanel({ matterId, onClose }: MatterDetailPanelProps) {
  const { data } = useSuspenseQuery(matterDetailQueryOptions(matterId));
  const transitionMu = useTransitionMatter();
  const deleteMu = useDeleteMatter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const assigneeUids = useMemo(() => data.assignees.map((a) => a.user_id), [data.assignees]);

  const handleToggle = () => {
    setMenuOpen(false);
    transitionMu.mutate({ matterId, status: nextStatusForToggle(data.status) });
  };

  const handleArchive = () => {
    setMenuOpen(false);
    transitionMu.mutate({ matterId, status: "archived" });
  };

  const handleDelete = () => {
    deleteMu.mutate(matterId, {
      onSuccess: () => {
        setConfirmDelete(false);
        onClose();
      },
    });
  };

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">M-{data.seq_no}</span>
          <MatterStatusBadge status={data.status} size="md" />
          <h1 className="min-w-0 truncate text-base font-semibold text-text-primary">
            {data.title}
          </h1>
        </div>
        <div ref={menuRef} className="relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="更多操作"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <MoreHorizontal size={16} />
          </button>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
          {menuOpen ? (
            <div className="absolute top-9 right-0 z-10 flex w-44 flex-col rounded-md border border-border-subtle bg-bg-surface py-1 shadow-lg">
              <MenuItem onClick={handleToggle} disabled={transitionMu.isPending}>
                {toggleLabel(data.status)}
              </MenuItem>
              {data.status !== "archived" ? (
                <MenuItem
                  onClick={handleArchive}
                  disabled={transitionMu.isPending}
                  icon={<Archive size={12} />}
                >
                  归档
                </MenuItem>
              ) : null}
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setPickerOpen(true);
                }}
                icon={<UserPlus size={12} />}
              >
                编辑负责人
              </MenuItem>
              <div className="my-1 h-px bg-border-subtle" />
              <MenuItem
                danger
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
                icon={<Trash2 size={12} />}
              >
                删除
              </MenuItem>
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
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
          <dd className="flex items-center gap-1.5">
            <ChannelAvatar
              channel={new Channel(data.creator_id, ChannelTypePerson)}
              size={18}
              title={data.creator_id}
            />
            <UserName uid={data.creator_id} className="text-text-primary" />
          </dd>
          <dt className="text-text-tertiary">创建时间</dt>
          <dd className="text-text-primary">{formatTime(data.created_at)}</dd>
          <dt className="text-text-tertiary">更新时间</dt>
          <dd className="text-text-primary">{formatTime(data.updated_at)}</dd>
        </dl>

        <section>
          <h3 className="mb-2 text-xs font-semibold text-text-secondary">
            负责人 ({assigneeUids.length})
          </h3>
          {assigneeUids.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-2">
              {assigneeUids.map((uid) => (
                <li
                  key={uid}
                  className="inline-flex items-center gap-1.5 rounded-full bg-bg-elevated py-1 pr-3 pl-1"
                >
                  <ChannelAvatar
                    channel={new Channel(uid, ChannelTypePerson)}
                    size={20}
                    title={uid}
                  />
                  <UserName uid={uid} className="text-xs text-text-primary" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-tertiary">暂无</p>
          )}
        </section>
      </div>

      <AssigneePicker
        open={pickerOpen}
        matterId={matterId}
        currentAssigneeUids={assigneeUids}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmModal
        open={confirmDelete}
        title="确认删除"
        content="事项删除后无法恢复,确认继续?"
        okText="删除"
        okDanger
        okLoading={deleteMu.isPending}
        onOk={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}

interface MenuItemProps {
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

function MenuItem({ onClick, children, icon, danger, disabled }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
        danger ? "text-error hover:bg-error/10" : "text-text-primary hover:bg-bg-hover"
      }`}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
}
