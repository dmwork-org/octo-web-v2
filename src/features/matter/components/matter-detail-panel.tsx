import { useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Archive, MoreHorizontal, Tag, Trash2, X } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { matterDetailQueryOptions } from "@/features/matter/queries/matters.query";
import { useDeleteMatter, useTransitionMatter } from "@/features/matter/mutations/matters.mutation";
import { MatterStatusBadge } from "@/features/matter/components/matter-status-badge";
import { UserName } from "@/features/matter/components/user-name";
import { AssigneePicker } from "@/features/matter/components/assignee-picker";
import { DeadlinePicker } from "@/features/matter/components/deadline-picker";
import { MainGoalEditor } from "@/features/matter/components/main-goal-editor";
import type { MatterStatus } from "@/features/matter/types/matter.types";

interface MatterDetailPanelProps {
  matterId: string;
  onClose: () => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

function nextStatusForToggle(s: MatterStatus): MatterStatus {
  return s === "open" ? "done" : "open";
}

function toggleLabel(s: MatterStatus): string {
  return s === "open" ? "标完成" : "重新打开";
}

/**
 * Matter 详情面板(对齐 P3-matter 设计稿,扩展 MVP D-4):
 *
 *   ┌ Header ─────────────────────────────────────────────────────
 *   │ [状态]|M-96   [📅 设置截止日期(DDL pick)]            ⋯  ✕
 *   ├──────────────────────────────────────────────────────────────
 *   │ {title 大字粗体}
 *   │ ┌─ 🎯 主要目标(MainGoalEditor TipTap)─────┐
 *   │ │ {description 富文本编辑}                     │
 *   │ └──────────────────────────────────────────────┘
 *   │ 🏷 来自 #{source_name} · {creator} · {created_at}
 *   │ 创建人: [头像] {name}    负责人: [头像] {name}  [编辑]
 *   │ ─── 二级 tabs(关联群聊 P3+ 占位 / 变更记录 — Commit 17 接)
 *   └
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
    <section className="flex flex-1 flex-col overflow-hidden bg-bg-surface">
      <header className="flex shrink-0 items-center justify-between gap-3 px-8 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex items-center gap-2 text-[12px]">
            <MatterStatusBadge status={data.status} size="md" />
            <span className="text-text-tertiary">|</span>
            <span className="font-mono text-text-tertiary">M-{data.seq_no}</span>
          </span>
          <DeadlinePicker matterId={matterId} deadline={data.deadline} />
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

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-8 pb-8">
        <h1 className="text-2xl leading-tight font-bold text-text-primary">{data.title}</h1>

        <MainGoalEditor matterId={matterId} description={data.description} />

        {data.source_name ? (
          <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <Tag size={12} />
            <span>
              来自 <span className="text-text-secondary">#{data.source_name}</span> ·{" "}
              <UserName uid={data.creator_id} className="text-text-secondary" /> ·{" "}
              {formatDateTime(data.created_at)}
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-text-tertiary">
          <FieldChip label="创建人" uid={data.creator_id} />
          <div className="flex items-center gap-1.5">
            <span className="shrink-0">负责人:</span>
            {assigneeUids.length > 0 ? (
              <ul className="flex flex-wrap items-center gap-1.5">
                {assigneeUids.map((uid) => (
                  <li
                    key={uid}
                    className="inline-flex items-center gap-1 rounded-full bg-bg-elevated py-0.5 pr-2 pl-0.5"
                  >
                    <ChannelAvatar
                      channel={new Channel(uid, ChannelTypePerson)}
                      size={18}
                      title={uid}
                    />
                    <UserName uid={uid} className="text-text-primary" />
                  </li>
                ))}
              </ul>
            ) : (
              <span>暂无</span>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="ml-1 rounded px-1.5 py-0.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              编辑
            </button>
          </div>
        </div>

        <div className="mt-2 border-b border-border-subtle">
          <div className="flex items-center gap-6">
            <span className="cursor-not-allowed border-b-2 border-text-primary pb-2 text-sm font-semibold text-text-primary opacity-60">
              关联群聊
            </span>
            <span className="cursor-not-allowed pb-2 text-sm text-text-tertiary opacity-60">
              变更记录
            </span>
          </div>
        </div>
        <p className="text-xs text-text-tertiary italic">
          关联群聊 / 变更记录 接入中(Commit 16-17)
        </p>
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

function FieldChip({ label, uid }: { label: string; uid: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="shrink-0">{label}:</span>
      <ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} size={18} title={uid} />
      <UserName uid={uid} className="text-text-primary" />
    </span>
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
