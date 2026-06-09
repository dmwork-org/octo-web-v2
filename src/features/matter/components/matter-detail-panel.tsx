import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import WKSDK, { Channel, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
import { ChevronDown, ChevronRight, Hash, MoreHorizontal, Plus, Tag, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatSidePanelActions } from "@/features/chat/stores/chat-side-panel";
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
import type {
  MatterChannel,
  MatterStatus,
  TimelineEntry,
} from "@/features/matter/types/matter.types";
import { listTimeline } from "@/features/matter/api/matter.api";

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

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("channels");
  const menuRef = useRef<HTMLDivElement>(null);

  // ── 标题 inline 编辑态 ──
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // 进入编辑态后自动 focus
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

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
        <div ref={menuRef} className="relative ml-auto flex shrink-0 items-center">
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
            />
            <SecondaryTabBtn
              active={secondaryTab === "changelog"}
              onClick={() => setSecondaryTab("changelog")}
              label={t("matter.detail.changelogTab")}
            />
          </div>
        </div>

        <div className="px-8 pt-4">
          {secondaryTab === "channels" ? (
            <ChannelsTab matterId={matterId} channels={data.channels ?? []} />
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
 * 关联群聊 tab — 完整功能版（Wave 1）。
 *
 * - 列表展示 matter.channels（已包含 source_channel）
 * - 关联新群：弹出 LinkChannelModal
 * - 解除关联：右侧悬浮删除按钮 + confirm
 * - 点击群行跳转聊天
 * - 展开/折叠该群的 timeline 条目
 */
function ChannelsTab({ matterId, channels }: { matterId: string; channels: MatterChannel[] }) {
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // 每个 channelId → timeline 条目
  const [timelineMap, setTimelineMap] = useState<Record<string, TimelineEntry[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  /** 每个群的最新 1 条 timeline 摘要（折叠态展示用） */
  const [latestTimelineMap, setLatestTimelineMap] = useState<Record<string, TimelineEntry | null>>(
    {},
  );
  /** AnchorPopover 状态 */
  const [anchor, setAnchor] = useState<{
    channelId: string;
    channelType: number;
    channelName: string;
    messageIds: string[];
  } | null>(null);

  const unlinkMu = useUnlinkChannel();

  // 初始渲染 / matterId 或 channels 变化时，拉取每个群的最新一条 timeline 摘要
  useEffect(() => {
    channels.forEach((mc) => {
      listTimeline(matterId, { source_channel_id: mc.channel_id, limit: 1 })
        .then((resp) => {
          setLatestTimelineMap((prev) => ({ ...prev, [mc.channel_id]: resp.data?.[0] ?? null }));
        })
        .catch(() => {
          setLatestTimelineMap((prev) => ({ ...prev, [mc.channel_id]: null }));
        });
    });
  }, [matterId, channels]);

  const toggleExpand = (channelId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
        // 展开时拉 timeline（若还没拉过）
        if (!timelineMap[channelId]) {
          setLoadingIds((ids) => new Set([...ids, channelId]));
          void listTimeline(matterId, { source_channel_id: channelId, limit: 10 })
            .then((resp) => {
              setTimelineMap((m) => ({ ...m, [channelId]: resp.data }));
            })
            .finally(() => {
              setLoadingIds((ids) => {
                const s = new Set(ids);
                s.delete(channelId);
                return s;
              });
            });
        }
      }
      return next;
    });
  };

  const handleJump = (channelId: string, channelType: number) => {
    const ch = new Channel(channelId, channelType);
    chatSelectedActions.select(ch);
    chatSidePanelActions.close();
  };

  const handleUnlink = () => {
    if (!unlinkTarget) return;
    unlinkMu.mutate(
      { matterId, channelId: unlinkTarget },
      { onSuccess: () => setUnlinkTarget(null) },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 关联新群按钮 */}
      <div>
        <button
          type="button"
          onClick={() => setLinkModalOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-brand transition-opacity hover:opacity-80"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-bg-surface">
            <Plus size={12} strokeWidth={3} />
          </span>
          关联新群聊
        </button>
      </div>

      {/* 已关联群聊列表 */}
      {channels.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-default px-4 py-8 text-center text-xs text-text-tertiary">
          暂无关联群聊
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {channels.map((mc) => {
            const ch = new Channel(mc.channel_id, mc.channel_type);
            const info = WKSDK.shared().channelManager.getChannelInfo(ch);
            if (!info) void WKSDK.shared().channelManager.fetchChannelInfo(ch);
            const title = mc.channel_name ?? info?.title ?? mc.channel_id;
            const isGroup = mc.channel_type === ChannelTypeGroup;
            const isExpanded = expandedIds.has(mc.channel_id);
            const isLoadingTimeline = loadingIds.has(mc.channel_id);
            const entries = timelineMap[mc.channel_id] ?? [];

            return (
              <li key={mc.id} className="rounded-md border border-border-subtle bg-bg-elevated">
                {/* 群行主体 */}
                <div className="group relative flex items-center">
                  {/* 展开/折叠箭头 */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(mc.channel_id)}
                    className="flex h-10 w-8 shrink-0 items-center justify-center text-text-tertiary transition-colors hover:text-text-secondary"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {/* 点击跳转聊天 */}
                  <button
                    type="button"
                    onClick={() => handleJump(mc.channel_id, mc.channel_type)}
                    className="flex flex-1 items-center gap-2 py-2 pr-2 text-left"
                  >
                    <ChannelAvatar channel={ch} size={26} title={title} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        {isGroup ? null : (
                          <Hash size={12} className="shrink-0 text-text-tertiary" />
                        )}
                        <span className="truncate text-sm text-text-primary">{title}</span>
                      </div>
                      {/* 折叠态：展示最新一条进展摘要 */}
                      {!isExpanded
                        ? (() => {
                            const latest = latestTimelineMap[mc.channel_id];
                            // 仍在加载中则不显示
                            if (latest === undefined) return null;
                            if (latest === null) {
                              return (
                                <span className="text-[11px] text-text-tertiary">暂无进展</span>
                              );
                            }
                            const rawContent = latest.content ?? "";
                            const truncated =
                              rawContent.length > 60 ? rawContent.slice(0, 60) + "…" : rawContent;
                            return (
                              <span className="truncate text-[11px] text-text-tertiary">
                                <UserName
                                  uid={latest.user_id}
                                  className="text-[11px] font-medium"
                                />
                                <span>: </span>
                                <span>{truncated}</span>
                              </span>
                            );
                          })()
                        : null}
                    </div>
                    <span className="shrink-0 text-[11px] text-text-tertiary">→</span>
                  </button>

                  {/* 解除关联按钮（悬浮显现） */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUnlinkTarget(mc.channel_id);
                    }}
                    className="absolute top-1/2 right-2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
                    title="解除关联"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* 展开的 timeline 列表 */}
                {isExpanded ? (
                  <div className="border-t border-border-subtle px-3 pb-2 pt-1.5">
                    {isLoadingTimeline ? (
                      <p className="py-2 text-xs text-text-tertiary">加载中…</p>
                    ) : entries.length === 0 ? (
                      <p className="py-2 text-xs text-text-tertiary">该群暂无进展</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {entries.map((entry) => (
                          <li key={entry.id} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <UserName
                                uid={entry.user_id}
                                className="shrink-0 text-[11px] font-medium text-text-secondary"
                              />
                              <span className="text-[11px] text-text-tertiary">
                                {formatDateTime(entry.created_at)}
                              </span>
                            </div>
                            {entry.content ? (
                              <p className="text-xs text-text-primary">{entry.content}</p>
                            ) : null}
                            {entry.source_msgs && entry.source_msgs.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setAnchor({
                                    channelId: mc.channel_id,
                                    channelType: mc.channel_type,
                                    channelName: mc.channel_name ?? info?.title ?? mc.channel_id,
                                    messageIds: entry.source_msgs!,
                                  })
                                }
                                className="self-start mt-0.5 text-[11px] text-brand underline-offset-2 transition-colors hover:underline"
                              >
                                查看原消息
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
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
        onClose={() => setLinkModalOpen(false)}
        onLinked={() => setLinkModalOpen(false)}
      />

      {/* 解除关联确认弹窗 */}
      <ConfirmModal
        open={!!unlinkTarget}
        title="解除群聊关联"
        content="确定要解除该群聊与此事项的关联吗？"
        okText="解除关联"
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
