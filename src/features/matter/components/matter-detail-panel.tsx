import { useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import WKSDK, { Channel, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
import { Hash, MoreHorizontal, Plus, Tag } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatSidePanelActions } from "@/features/chat/stores/chat-side-panel";
import { matterDetailQueryOptions } from "@/features/matter/queries/matters.query";
import { useDeleteMatter, useTransitionMatter } from "@/features/matter/mutations/matters.mutation";
import { UserName } from "@/features/matter/components/user-name";
import { AssigneePicker } from "@/features/matter/components/assignee-picker";
import { DeadlinePicker } from "@/features/matter/components/deadline-picker";
import { MainGoalEditor } from "@/features/matter/components/main-goal-editor";
import { ActivityList } from "@/features/matter/components/activity-list";
import type { MatterStatus } from "@/features/matter/types/matter.types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MatterDetailPanelProps {
  matterId: string;
  onClose: () => void;
}

type SecondaryTab = "channels" | "changelog";

const STATUS_LABELS: Record<MatterStatus, string> = {
  open: "进行中",
  done: "已完成",
  archived: "已归档",
};

const STATUS_CLASS: Record<MatterStatus, string> = {
  open: "bg-brand-tint text-brand",
  done: "bg-online/10 text-online",
  archived: "bg-bg-elevated text-text-tertiary",
};

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
 * Matter 详情面板(1:1 对齐 P3-matter 设计稿 + 原 dmworktodo MatterDetailPanel
 * 独立模式样式):
 *
 *   ┌ Header(底部 1px 分隔线)─────────────────────────────
 *   │ [进行中｜M-142] 📅 截止到 5/29 周五               ⋯
 *   ├──────────────────────────────────────────────────────
 *   │ {title 大字 20px semibold}
 *   │ ┌─🎯 主要目标─────────────────┐  渐变 chip-like 标签
 *   │ │ {description 富文本编辑}     │
 *   │ └──────────────────────────────┘
 *   │ 🏷 来自 #源 · {creator} · {time}
 *   │ [创建人: chip] [负责人: chip ...]
 *   │ ─── 二级 tabs(关联群聊 P3+ 占位 / 变更记录 — activities)
 *   │ ✦ Matter 是 IM 工作的 hierarchy 任务卡 · …(footer)
 *   └
 *
 * 关键差异(对齐设计稿):
 * - 状态 + M-序号 合并 pill(同 SidebarCard 风格,不再独立徽章)
 * - DDL 文案"截止到 M/D 周X",自定义封套日历 SVG
 * - 主要目标:渐变 chip 标签 + description 紧跟,无大背景卡
 * - 关联群聊 tab:占位"+ 关联新群"按钮(channel-picker 仍 P3+)+ dashed 空态
 * - 删 ✕ 关闭按钮(独立模式无,功能由切换 matter / URL `?id=` 清除替代)
 * - ⋯ 菜单保留(标完成/归档/编辑负责人/删除入口,设计稿无此显式按钮但功能必须留)
 */
export function MatterDetailPanel({ matterId, onClose }: MatterDetailPanelProps) {
  const { data } = useSuspenseQuery(matterDetailQueryOptions(matterId));
  const transitionMu = useTransitionMatter();
  const deleteMu = useDeleteMatter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("channels");
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
    <section className="relative flex flex-1 flex-col overflow-hidden bg-bg-base">
      {/* ── Header:状态 pill + DDL + ⋯ ── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-8 py-3">
        <StatusPill status={data.status} seqNo={data.seq_no} />
        <DeadlinePicker matterId={matterId} deadline={data.deadline} />
        <div ref={menuRef} className="relative ml-auto flex shrink-0 items-center">
          <button
            type="button"
            aria-label="更多操作"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? (
            <div className="absolute top-9 right-0 z-10 flex w-44 flex-col rounded-md border border-border-subtle bg-bg-surface py-1 shadow-lg">
              <MenuItem onClick={handleToggle} disabled={transitionMu.isPending}>
                {toggleLabel(data.status)}
              </MenuItem>
              {data.status !== "archived" ? (
                <MenuItem onClick={handleArchive} disabled={transitionMu.isPending}>
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
              >
                删除
              </MenuItem>
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* ── Title ── */}
        <h1 className="px-8 pt-5 text-[20px] leading-[26px] font-semibold text-text-primary">
          {data.title}
        </h1>

        {/* ── 主要目标(渐变 chip 标签 + description 紧跟)── */}
        <div className="mt-4 flex flex-col gap-2 px-8">
          <MainGoalEditor matterId={matterId} description={data.description} />

          {data.source_name ? (
            <div className="inline-flex items-center gap-1 text-sm leading-[18px] text-text-primary">
              <Tag size={14} className="shrink-0 text-text-tertiary" />
              <span>
                来自 <span className="text-brand">#{data.source_name}</span> ·{" "}
                <UserName uid={data.creator_id} className="text-text-primary" /> ·{" "}
                {formatDateTime(data.created_at)}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── 创建人 + 负责人 chip 行 ── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-8 text-sm text-text-tertiary">
          <FieldChip label="创建人:">
            <UserChip uid={data.creator_id} />
          </FieldChip>
          <FieldChip label="负责人:">
            {assigneeUids.length > 0 ? (
              <ul className="flex flex-wrap items-center gap-1.5">
                {assigneeUids.map((uid) => (
                  <li key={uid}>
                    <UserChip uid={uid} />
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
          </FieldChip>
        </div>

        {/* ── 二级 tabs(关联群聊 N / 变更记录 N)── */}
        <div className="mt-6 border-b border-border-subtle px-8">
          <div className="flex items-stretch gap-6">
            <SecondaryTabBtn
              active={secondaryTab === "channels"}
              onClick={() => setSecondaryTab("channels")}
              label="关联群聊"
            />
            <SecondaryTabBtn
              active={secondaryTab === "changelog"}
              onClick={() => setSecondaryTab("changelog")}
              label="变更记录"
            />
          </div>
        </div>

        <div className="px-8 pt-4">
          {secondaryTab === "channels" ? (
            <ChannelsTab
              sourceChannelId={data.source_channel_id}
              sourceChannelType={data.source_channel_type}
            />
          ) : (
            <ActivityList matterId={matterId} />
          )}
        </div>

        {/* ── Footer 说明文案 ── */}
        <p className="mt-8 mb-4 text-center text-xs text-text-tertiary">
          ✦ Matter 是 IM 工作的 hierarchy 任务卡 · AI 从群聊持续蒸馏 · 用户只确认, 不维护
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

/** 状态 + M-序号 合并 pill(同 SidebarCard 风格)。 */
function StatusPill({ status, seqNo }: { status: MatterStatus; seqNo: number }) {
  const cls = STATUS_CLASS[status];
  return (
    <span className={`inline-flex h-5 items-center rounded-full px-2 text-[13px] leading-5 ${cls}`}>
      <span className="font-semibold">{STATUS_LABELS[status]}</span>
      {seqNo ? <span className="font-normal">｜M-{seqNo}</span> : null}
    </span>
  );
}

/** 用户 chip:头像 + UserName,带浅灰底圆角。 */
function UserChip({ uid }: { uid: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-bg-elevated py-0.5 pr-2 pl-0.5">
      <ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} size={18} title={uid} />
      <UserName uid={uid} className="text-text-primary" />
    </span>
  );
}

/** label + 内容 行内组合(创建人:、负责人:)。 */
function FieldChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="shrink-0">{label}</span>
      {children}
    </span>
  );
}

/**
 * 关联群聊 tab(B5,对齐旧 dmworktodo LinkChannelsModal 反向):
 *
 * 显示 matter.source_channel_id / source_channel_type 关联的会话条目;点击 → 选中
 * 该会话 + 关闭 matter panel(对齐旧 routeLeftMenuID 跳 chat 体验)。
 *
 * 关联新群入口 — 老仓在 dmworktodo LinkChannelsModal,新仓 P3+ 接;此处禁用占位。
 */
function ChannelsTab({
  sourceChannelId,
  sourceChannelType,
}: {
  sourceChannelId?: string;
  sourceChannelType?: number;
}) {
  const hasSource = !!sourceChannelId && sourceChannelType != null;
  const channel =
    hasSource && sourceChannelId
      ? new Channel(sourceChannelId, sourceChannelType ?? ChannelTypeGroup)
      : null;
  const info = channel ? WKSDK.shared().channelManager.getChannelInfo(channel) : undefined;
  if (channel && !info) void WKSDK.shared().channelManager.fetchChannelInfo(channel);
  const title = info?.title ?? sourceChannelId ?? "";
  const isGroup = sourceChannelType === ChannelTypeGroup;

  const onJump = () => {
    if (!channel) return;
    chatSelectedActions.select(channel);
    chatSidePanelActions.close();
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center gap-1.5 text-sm font-semibold text-brand opacity-70"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-bg-surface">
                <Plus size={12} strokeWidth={3} />
              </span>
              关联新群
            </button>
          </TooltipTrigger>
          <TooltipContent>channel-picker 留 P3+</TooltipContent>
        </Tooltip>
      </div>
      {hasSource && channel ? (
        <button
          type="button"
          onClick={onJump}
          className="flex w-full items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-left transition-colors hover:bg-bg-hover"
        >
          <ChannelAvatar channel={channel} size={28} title={title} />
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {isGroup ? null : <Hash size={12} className="shrink-0 text-text-tertiary" />}
            <span className="truncate text-sm text-text-primary">{title}</span>
          </div>
          <span className="shrink-0 text-[11px] text-text-tertiary">跳转 ›</span>
        </button>
      ) : (
        <div className="rounded-md border border-dashed border-border-default px-4 py-8 text-center text-xs text-text-tertiary">
          暂无关联群聊
        </div>
      )}
    </div>
  );
}

interface SecondaryTabBtnProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

/** 二级 tab 按钮:label + (count){可选},激活态 2px 黑色下划线。 */
function SecondaryTabBtn({ active, onClick, label }: SecondaryTabBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-12 items-center text-sm transition-colors ${
        active
          ? "font-semibold text-text-primary after:absolute after:right-0 after:bottom-[-1px] after:left-0 after:h-0.5 after:rounded-sm after:bg-text-primary"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}

interface MenuItemProps {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

function MenuItem({ onClick, children, danger, disabled }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
        danger ? "text-error hover:bg-error/10" : "text-text-primary hover:bg-bg-hover"
      }`}
    >
      {children}
    </button>
  );
}
