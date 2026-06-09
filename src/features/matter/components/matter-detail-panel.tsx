import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChevronDown, MoreHorizontal, Plus, Tag } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { authStore } from "@/features/base/stores/auth";
import { matterDetailQueryOptions } from "@/features/matter/queries/matters.query";
import {
  useDeleteMatter,
  useTransitionMatter,
  useUnlinkChannel,
  useUpdateMatter,
} from "@/features/matter/mutations/matters.mutation";
import { UserName } from "@/features/matter/components/user-name";
import { AssigneePicker } from "@/features/matter/components/assignee-picker";
import { DeadlinePicker } from "@/features/matter/components/deadline-picker";
import { MainGoalEditor } from "@/features/matter/components/main-goal-editor";
import { ActivityList } from "@/features/matter/components/activity-list";
import { LinkChannelModal } from "@/features/matter/components/link-channel-modal";
import { AnchorPopover } from "@/features/matter/components/anchor-popover";
import { ChannelNameLabel } from "@/features/matter/components/channel-name-label";
import { NotMemberBadge } from "@/features/matter/components/not-member-badge";
import { ChannelMoreMenu } from "@/features/matter/components/channel-more-menu";
import { TimelinePanel } from "@/features/matter/components/timeline-panel";
import { useMyGroups } from "@/features/matter/hooks/use-my-groups";
import {
  useLatestTimelinePerChannel,
  useChannelTimelineOnExpand,
} from "@/features/matter/hooks/use-channel-timeline";
import { toParentGroupNo } from "@/features/matter/utils/channel-id";
import type { MatterChannel, MatterStatus } from "@/features/matter/types/matter.types";

interface MatterDetailPanelProps {
  matterId: string;
  onClose: () => void;
}

type SecondaryTab = "channels" | "changelog";

const STATUS_KEY: Record<MatterStatus, string> = {
  open: "matter.status.open",
  done: "matter.status.done",
  archived: "matter.status.archived",
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

/** 点击外部关闭下拉菜单 */
function useClickOutside(
  ref: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, ref, onClose]);
}

/** 编辑态自动 focus + select */
function useAutoFocusInput(ref: React.RefObject<HTMLInputElement | null>, shouldFocus: boolean) {
  useEffect(() => {
    if (shouldFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [shouldFocus, ref]);
}

/**
 * Matter 详情面板(1:1 对齐 P3-matter 设计稿 + 原 dmworktodo MatterDetailPanel
 * 独立模式样式)。
 */
export function MatterDetailPanel({ matterId, onClose }: MatterDetailPanelProps) {
  const t = useT();
  const { data } = useSuspenseQuery(matterDetailQueryOptions(matterId));
  const transitionMu = useTransitionMatter();
  const deleteMu = useDeleteMatter();
  const updateMu = useUpdateMatter();

  const currentUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const isOwner = currentUid
    ? data.creator_id === currentUid || data.assignees.some((a) => a.user_id === currentUid)
    : false;

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("channels");
  const menuRef = useRef<HTMLDivElement>(null);

  // click-outside 关闭下拉菜单
  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));

  // ── 标题 inline 编辑态 ──
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // 进入编辑态后自动 focus + select
  useAutoFocusInput(titleInputRef, editingTitle);

  const startEditing = useCallback(() => {
    setTitleDraft(data.title);
    setEditingTitle(true);
  }, [data.title]);

  const saveTitle = useCallback(() => {
    const trimmed = titleDraft.trim();
    // 空内容不保存，恢复原标题
    if (!trimmed) {
      setTitleDraft(data.title);
      setEditingTitle(false);
      return;
    }
    // 内容没变不调 API
    if (trimmed === data.title) {
      setEditingTitle(false);
      return;
    }
    updateMu.mutate({ matterId, req: { title: trimmed } });
    setEditingTitle(false);
  }, [titleDraft, data.title, matterId, updateMu]);

  const cancelEditing = useCallback(() => {
    setTitleDraft(data.title);
    setEditingTitle(false);
  }, [data.title]);

  const assigneeUids = useMemo(() => data.assignees.map((a) => a.user_id), [data.assignees]);

  const toggleLabel = (s: MatterStatus): string =>
    s === "open" ? t("matter.action.markDone") : t("matter.action.reopen");

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
        {isOwner && (
          <button
            type="button"
            onClick={() => setLinkModalOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Plus size={12} />
            关联新群
          </button>
        )}
        <div
          ref={menuRef}
          className={`relative flex shrink-0 items-center ${!isOwner ? "ml-auto" : ""}`}
        >
          <button
            type="button"
            aria-label={t("matter.detail.menuMore")}
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
                  {t("matter.action.archive")}
                </MenuItem>
              ) : null}
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setPickerOpen(true);
                }}
              >
                {t("matter.action.editAssignees")}
              </MenuItem>
              <div className="my-1 h-px bg-border-subtle" />
              <MenuItem
                danger
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                {t("matter.action.delete")}
              </MenuItem>
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* ── Title（点击可编辑）── */}
        {editingTitle ? (
          <div className="px-8 pt-5">
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") cancelEditing();
              }}
              onBlur={saveTitle}
              className="w-full rounded-md border-2 border-brand bg-bg-surface px-2 py-0.5 text-[20px] leading-[26px] font-semibold text-text-primary outline-none"
            />
          </div>
        ) : (
          <h1
            onClick={startEditing}
            className="cursor-pointer rounded-md px-8 pt-5 text-[20px] leading-[26px] font-semibold text-text-primary transition-colors hover:bg-bg-hover"
            title="点击编辑标题"
          >
            {data.title}
          </h1>
        )}

        {/* ── 主要目标(渐变 chip 标签 + description 紧跟)── */}
        <div className="mt-4 flex flex-col gap-2 px-8">
          <MainGoalEditor matterId={matterId} description={data.description} />

          {data.source_name ? (
            <div className="inline-flex items-center gap-1 text-sm leading-[18px] text-text-primary">
              <Tag size={14} className="shrink-0 text-text-tertiary" />
              <span>
                {t("matter.label.fromChannel", {
                  values: { name: "" },
                })}{" "}
                <span className="text-brand">#{data.source_name}</span> ·{" "}
                <UserName uid={data.creator_id} className="text-text-primary" /> ·{" "}
                {formatDateTime(data.created_at)}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── 创建人 + 负责人 chip 行 ── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-8 text-sm text-text-tertiary">
          <FieldChip label={t("matter.sidebar.createdByLabel")}>
            <UserChip uid={data.creator_id} />
          </FieldChip>
          <FieldChip label={t("matter.sidebar.assigneeLabel")}>
            {assigneeUids.length > 0 ? (
              <ul className="flex flex-wrap items-center gap-1.5">
                {assigneeUids.map((uid) => (
                  <li key={uid}>
                    <UserChip uid={uid} />
                  </li>
                ))}
              </ul>
            ) : (
              <span>{t("matter.assignee.empty")}</span>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="ml-1 rounded px-1.5 py-0.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              {t("matter.action.edit")}
            </button>
          </FieldChip>
        </div>

        {/* ── 二级 tabs(关联群聊 N / 变更记录 N)── */}
        <div className="mt-6 border-b border-border-subtle px-8">
          <div className="flex items-stretch gap-6">
            <SecondaryTabBtn
              active={secondaryTab === "channels"}
              onClick={() => setSecondaryTab("channels")}
              label={t("matter.detail.linkChannelTab")}
              count={data.channels?.length ?? 0}
            />
            <SecondaryTabBtn
              active={secondaryTab === "changelog"}
              onClick={() => setSecondaryTab("changelog")}
              label={t("matter.detail.changelogTab")}
              count={0}
            />
          </div>
        </div>

        <div className="px-8 pt-4">
          {secondaryTab === "channels" ? (
            <ChannelsTab
              matterId={matterId}
              channels={data.channels ?? []}
              linkModalOpen={linkModalOpen}
              onLinkModalClose={() => setLinkModalOpen(false)}
            />
          ) : (
            <ActivityList matterId={matterId} />
          )}
        </div>

        {/* ── Footer 说明文案 ── */}
        <p className="mt-8 mb-4 text-center text-xs text-text-tertiary">
          {t("matter.detail.footer")}
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
        title={t("matter.confirm.deleteTitle")}
        content={t("matter.confirm.deleteContent")}
        okText={t("matter.action.delete")}
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
  const t = useT();
  const cls = STATUS_CLASS[status];
  return (
    <span className={`inline-flex h-5 items-center rounded-full px-2 text-[13px] leading-5 ${cls}`}>
      <span className="font-semibold">{t(STATUS_KEY[status])}</span>
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
 * 关联群聊 tab — 完整功能版。
 *
 * - 列表展示 matter.channels（已包含 source_channel）
 * - 关联新群：由父组件传入 linkModalOpen 控制
 * - 解除关联：⋮ 菜单中的"取消关联"项 + confirm
 * - 点击 ⋮ 菜单跳转聊天
 * - 展开/折叠该群的 timeline 条目
 * - isMember 判断：通过 useMyGroups 获取当前用户所在群集合
 */
function ChannelsTab({
  matterId,
  channels,
  linkModalOpen,
  onLinkModalClose,
}: {
  matterId: string;
  channels: MatterChannel[];
  linkModalOpen: boolean;
  onLinkModalClose: () => void;
}) {
  const t = useT();
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  /** AnchorPopover 状态 */
  const [anchor, setAnchor] = useState<{
    channelId: string;
    channelType: number;
    channelName: string;
    messageIds: string[];
  } | null>(null);

  const unlinkMu = useUnlinkChannel();

  // 我的群列表
  const myGroupsQ = useMyGroups();
  const myGroupNos = useMemo(
    () => new Set((myGroupsQ.data ?? []).map((g) => g.group_no)),
    [myGroupsQ.data],
  );
  const myGroupsFailed = myGroupsQ.isError;
  const myGroupsLoading = myGroupsQ.isLoading;

  // 展开状态
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(new Set());

  // 拉取每个 channel 的最新 1 条 timeline
  const { latestByChannel } = useLatestTimelinePerChannel(matterId, channels);

  const toggleTimeline = useCallback((chId: string) => {
    setExpandedTimelines((prev) => {
      const next = new Set(prev);
      if (next.has(chId)) {
        next.delete(chId);
      } else {
        next.add(chId);
      }
      return next;
    });
  }, []);

  const handleUnlink = () => {
    if (!unlinkTarget) return;
    unlinkMu.mutate(
      { matterId, channelId: unlinkTarget },
      { onSuccess: () => setUnlinkTarget(null) },
    );
  };

  // 展开某个 channel 时拉取全量 timeline
  const { timelineMap, timelineLoading } = useChannelTimelineOnExpand(matterId, expandedTimelines);

  return (
    <div className="flex flex-col gap-0">
      {/* 已关联群聊列表 */}
      {channels.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-default px-4 py-8 text-center text-xs text-text-tertiary">
          {t("matter.detail.noLinkedChannels")}
        </div>
      ) : (
        <ul className="flex flex-col">
          {channels.map((mc, index) => {
            // 判断成员权限
            const parentGroupNo = toParentGroupNo(mc.channel_id, mc.channel_type);
            const isMember = !myGroupsFailed && myGroupNos.has(parentGroupNo);
            const latestEntry = latestByChannel.get(mc.channel_id);

            return (
              <li
                key={mc.id}
                className={index < channels.length - 1 ? "border-b border-border-subtle" : ""}
              >
                {/* 群行主体 */}
                <div className="flex items-center py-2.5">
                  {/* 群头像 */}
                  <ChannelAvatar
                    channel={new Channel(mc.channel_id, mc.channel_type)}
                    size={26}
                    title={mc.channel_name ?? mc.channel_id}
                  />
                  {/* 群名 + 关联时间 + 最新进展 */}
                  <div className="ml-2 flex min-w-0 flex-col">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-sm text-text-primary">
                        #
                        <ChannelNameLabel
                          channelId={mc.channel_id}
                          channelType={mc.channel_type}
                          fallback={mc.channel_name}
                          blur={!isMember && !myGroupsLoading}
                          loading={myGroupsLoading}
                        />
                      </span>
                      {!myGroupsLoading && !isMember && <NotMemberBadge />}
                      <span className="ml-3 text-[11px] text-text-tertiary whitespace-nowrap">
                        {new Date(mc.created_at).toLocaleDateString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                        })}{" "}
                        关联
                      </span>
                    </div>
                    {/* 最新进展：仅成员可见，有内容才显示 */}
                    {isMember && latestEntry !== undefined && latestEntry !== null && (
                      <div className="mt-1 rounded-r-md border-l-2 border-l-purple-500 bg-purple-50/60 px-3 py-2">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-purple-700">
                          最新进展
                        </div>
                        <div className="text-[13px] leading-relaxed text-text-primary">
                          {latestEntry.content || "（无文本内容）"}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* ⋮ 菜单：仅成员可见 */}
                  {isMember && (
                    <ChannelMoreMenu
                      channelId={mc.channel_id}
                      channelType={mc.channel_type}
                      onUnlink={() => setUnlinkTarget(mc.channel_id)}
                    />
                  )}
                </div>

                {/* 展开/折叠时间线按钮：仅成员可见 */}
                {isMember && (
                  <div className="flex justify-start border-t border-border-subtle px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggleTimeline(mc.channel_id)}
                      className="inline-flex items-center gap-1 text-[11px] text-text-tertiary transition-colors hover:text-text-primary"
                    >
                      <ChevronDown
                        size={10}
                        className={
                          expandedTimelines.has(mc.channel_id)
                            ? "rotate-180 transition-transform"
                            : "transition-transform"
                        }
                      />
                      {expandedTimelines.has(mc.channel_id) ? "收起时间线" : "展开时间线"}
                    </button>
                  </div>
                )}

                {/* 展开的 timeline */}
                {expandedTimelines.has(mc.channel_id) && (
                  <div className="border-t border-border-subtle px-3 pb-3 pt-2">
                    {timelineLoading && !timelineMap.has(mc.channel_id) ? (
                      <p className="py-2 text-xs text-text-tertiary">{t("base.common.loading")}</p>
                    ) : (timelineMap.get(mc.channel_id) ?? []).length === 0 ? (
                      <p className="py-2 text-xs text-text-tertiary">
                        {t("matter.detail.channelNoProgress")}
                      </p>
                    ) : (
                      <TimelinePanel
                        entries={timelineMap.get(mc.channel_id) ?? []}
                        canShowAnchor={isMember}
                        onShowAnchor={(entry, _ev) => {
                          setAnchor({
                            channelId: mc.channel_id,
                            channelType: mc.channel_type,
                            channelName: mc.channel_name ?? mc.channel_id.slice(0, 8),
                            messageIds: entry.source_msgs || [],
                          });
                        }}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 关联群聊弹窗 */}
      <LinkChannelModal
        open={linkModalOpen}
        matterId={matterId}
        linkedChannels={channels}
        onClose={onLinkModalClose}
      />

      {/* 解除关联确认弹窗 */}
      <ConfirmModal
        open={!!unlinkTarget}
        title={t("matter.detail.unlinkChannelTitle")}
        content={t("matter.detail.unlinkChannelContent")}
        okText={t("matter.action.unlink")}
        okDanger
        okLoading={unlinkMu.isPending}
        onOk={handleUnlink}
        onCancel={() => setUnlinkTarget(null)}
      />

      {/* 原消息上下文弹窗 */}
      {anchor ? (
        <AnchorPopover
          open
          channelId={anchor.channelId}
          channelType={anchor.channelType}
          channelName={anchor.channelName}
          messageIds={anchor.messageIds}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </div>
  );
}

interface SecondaryTabBtnProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}

/** 二级 tab 按钮:label + (count){可选},激活态 2px 黑色下划线。 */
function SecondaryTabBtn({ active, onClick, label, count }: SecondaryTabBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-12 items-center gap-1.5 text-sm transition-colors ${
        active
          ? "font-semibold text-text-primary after:absolute after:right-0 after:bottom-[-1px] after:left-0 after:h-0.5 after:rounded-sm after:bg-text-primary"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
      {count != null ? (
        <span
          className={`rounded px-1.5 text-[11px] font-mono ${
            active ? "bg-text-primary text-white" : "bg-bg-elevated text-text-tertiary"
          }`}
        >
          {count}
        </span>
      ) : null}
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
