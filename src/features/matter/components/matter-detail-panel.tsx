import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { MoreHorizontal, Tag } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import { toast } from "@/components/semi-bridge/toast";
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
import { OwnerEditor } from "@/features/matter/components/owner-editor";
import { DeadlinePicker } from "@/features/matter/components/deadline-picker";
import { MainGoalEditor } from "@/features/matter/components/main-goal-editor";
import { ActivityList } from "@/features/matter/components/activity-list";
import { OutputsPanel } from "@/features/matter/components/outputs-panel";
import { LinkChannelModal } from "@/features/matter/components/link-channel-modal";
import { AnchorPopover } from "@/features/matter/components/anchor-popover";
import { ChannelNameLabel } from "@/features/matter/components/channel-name-label";
import { NotMemberBadge } from "@/features/matter/components/not-member-badge";
import { ChannelMoreMenu } from "@/features/matter/components/channel-more-menu";
import { TimelinePanel } from "@/features/matter/components/timeline-panel";
import { useMyGroups } from "@/features/matter/hooks/use-my-groups";
import { useMatterOutputs } from "@/features/matter/hooks/use-matter-outputs";
import { useMembersFromChannels, type ChannelRef } from "@/features/matter/hooks/use-members-from-channels";
import {
  useLatestTimelinePerChannel,
  useChannelTimelineOnExpand,
} from "@/features/matter/hooks/use-channel-timeline";
import { toParentGroupNo } from "@/features/matter/utils/channel-id";
import { resolveFileUrl, downloadFile } from "@/features/matter/utils/download";
import type {
  MatterChannel,
  MatterOutput,
  MatterStatus,
  TimelineAttachment,
  TimelineEntry,
} from "@/features/matter/types/matter.types";

interface MatterDetailPanelProps {
  matterId: string;
  onClose: () => void;
}

type SecondaryTab = "channels" | "outputs" | "changelog";

const STATUS_KEY: Record<MatterStatus, string> = {
  open: "matter.status.open",
  done: "matter.status.done",
  archived: "matter.status.archived",
};

const STATUS_CLASS: Record<MatterStatus, string> = {
  open: "bg-[#ebf9ff] text-[#005694]",
  done: "bg-[#ecf9ec] text-[#176221]",
  archived: "bg-[rgba(28,28,35,0.04)] text-text-tertiary",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 30) return `${diffDays} 天前`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} 个月前`;
  return `${Math.floor(diffDays / 365)} 年前`;
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

  // 下载附件
  const handleDownloadAttachment = useCallback(
    async (att: TimelineAttachment, _entry: TimelineEntry) => {
      const url = resolveFileUrl(att.file_url);
      if (!url) return;
      try {
        await downloadFile(url, att.file_name || "file");
      } catch {
        toast.error("下载失败");
      }
    },
    [],
  );

  // ── Outputs (产出文件) ──
  const myGroupsQ = useMyGroups();
  const myGroupNos = useMemo(
    () => new Set((myGroupsQ.data ?? []).map((g) => g.group_no)),
    [myGroupsQ.data],
  );

  // ── OwnerEditor 候选人: Matter 关联的所有 channel 成员并集 ──
  const ownerCandidateChannelRefs = useMemo<ChannelRef[]>(() => {
    const seen = new Set<string>();
    const list: ChannelRef[] = [];
    const push = (id: string | undefined | null, type: number | undefined | null) => {
      if (!id || type === undefined || type === null) return;
      const key = `${id}:${type}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ channelId: id, channelType: type });
    };
    for (const ch of data.channels || []) {
      push(ch.channel_id, ch.channel_type);
    }
    push(data.source_channel_id, data.source_channel_type);
    return list;
  }, [data.channels, data.source_channel_id, data.source_channel_type]);

  const { members: ownerCandidates } = useMembersFromChannels(ownerCandidateChannelRefs);

  const {
    outputs,
    loading: outputsLoading,
    hasMore: outputsHasMore,
    query: outputsQuery,
    error: outputsError,
    handleSearch: handleOutputsSearch,
    handleLoadMore: handleOutputsLoadMore,
    handleRetry: handleOutputsRetry,
  } = useMatterOutputs(matterId);

  const getOutputChannelMembership = useCallback(
    (sourceChannelId?: string) => {
      if (!sourceChannelId) return { isMember: true, loading: false };
      if (myGroupsQ.isLoading) return { isMember: false, loading: true };
      const ch = (data.channels ?? []).find((c) => c.channel_id === sourceChannelId);
      if (!ch) return { isMember: true, loading: false };
      const parentNo = toParentGroupNo(ch.channel_id, ch.channel_type);
      const isMember = !myGroupsQ.isError && myGroupNos.has(parentNo);
      return { isMember, loading: false };
    },
    [data.channels, myGroupNos, myGroupsQ.isLoading, myGroupsQ.isError],
  );

  const resolveOutputChannelName = useCallback(
    (sourceChannelId?: string) => {
      if (!sourceChannelId) return undefined;
      const ch = (data.channels ?? []).find((c) => c.channel_id === sourceChannelId);
      return ch?.channel_name;
    },
    [data.channels],
  );

  const handleOutputDownload = useCallback(
    async (item: MatterOutput) => {
      const url = resolveFileUrl(item.file_url);
      if (!url) return;
      try {
        await downloadFile(url, item.file_name || "file");
      } catch {
        toast.error(t("matter.outputs.downloadFailed"));
      }
    },
    [t],
  );

  return (
    <section className="relative flex flex-1 flex-col overflow-hidden bg-bg-surface">
      {/* ── Header:状态 pill + DDL + ⋯ ── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-8 py-3">
        <StatusPill status={data.status} seqNo={data.seq_no} />
        <DeadlinePicker matterId={matterId} deadline={data.deadline} />
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
            <div className="rounded-md border border-[#6366f1] bg-bg-primary shadow-[0_0_0_2px_rgba(99,102,241,0.15)]">
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") cancelEditing();
                }}
                onBlur={saveTitle}
                className="w-full bg-transparent px-1 py-0.5 text-[24px] leading-[1.25] font-semibold text-text-primary outline-none"
              />
            </div>
          </div>
        ) : (
          <h1 className="px-8 pt-5">
            <button
              type="button"
              onClick={startEditing}
              className="w-full rounded border border-transparent px-1 py-0.5 text-left text-[24px] leading-[1.25] font-semibold text-text-primary transition-colors hover:bg-bg-hover"
              title={t("matter.detail.clickToEdit")}
            >
              {data.title}
            </button>
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
            <OwnerEditor
              matterId={matterId}
              assignees={data.assignees}
              canEdit={isOwner}
              isCreator={currentUid === data.creator_id}
              candidates={ownerCandidates}
            />
          </FieldChip>
        </div>

        {/* ── 二级 tabs(关联群聊 / 产出文件 / 变更记录)── */}
        <div className="mt-6 border-b border-border-subtle px-8">
          <div className="flex items-stretch gap-6">
            <SecondaryTabBtn
              active={secondaryTab === "channels"}
              onClick={() => setSecondaryTab("channels")}
              label={t("matter.detail.linkChannelTab")}
              count={data.channels?.length ?? 0}
            />
            <SecondaryTabBtn
              active={secondaryTab === "outputs"}
              onClick={() => setSecondaryTab("outputs")}
              label={t("matter.outputs.tabLabel")}
              count={outputs.length}
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
              onOpenLinkModal={() => setLinkModalOpen(true)}
              onCloseLinkModal={() => setLinkModalOpen(false)}
              onDownloadAttachment={handleDownloadAttachment}
            />
          ) : secondaryTab === "outputs" ? (
            <OutputsPanel
              outputs={outputs}
              loading={outputsLoading}
              hasMore={outputsHasMore}
              query={outputsQuery}
              error={outputsError}
              onSearch={handleOutputsSearch}
              onLoadMore={handleOutputsLoadMore}
              onRetry={handleOutputsRetry}
              onDownload={handleOutputDownload}
              getChannelMembership={getOutputChannelMembership}
              resolveChannelName={resolveOutputChannelName}
            />
          ) : (
            <ActivityList matterId={matterId} />
          )}
        </div>
      </div>

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
    <span className="inline-flex h-5 items-center gap-1.5 rounded-full border border-brand-tint-10 bg-bg-surface py-0 pr-2 pl-0.5">
      <ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} size={16} title={uid} />
      <UserName uid={uid} className="text-sm font-normal text-text-primary" />
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
  onOpenLinkModal,
  onCloseLinkModal,
  onDownloadAttachment,
}: {
  matterId: string;
  channels: MatterChannel[];
  linkModalOpen: boolean;
  onOpenLinkModal: () => void;
  onCloseLinkModal: () => void;
  onDownloadAttachment: (attachment: TimelineAttachment, entry: TimelineEntry) => void;
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
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="mb-3 flex items-center">
        <button
          type="button"
          onClick={() => onOpenLinkModal()}
          className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[14px] font-semibold leading-[20px] text-accent transition-opacity hover:opacity-80"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M8.00033 15.3332C12.0504 15.3332 15.3337 12.0499 15.3337 7.99984C15.3337 3.94975 12.0504 0.666504 8.00033 0.666504C3.95024 0.666504 0.666992 3.94975 0.666992 7.99984C0.666992 12.0499 3.95024 15.3332 8.00033 15.3332ZM12.6662 7.9184C12.6758 8.4706 12.236 8.92606 11.6838 8.9357L9.01751 8.98224L9.06405 11.6485C9.07369 12.2007 8.63386 12.6562 8.08166 12.6658C7.52945 12.6754 7.07399 12.2356 7.06435 11.6834L7.01781 9.01714L4.35155 9.06368C3.79935 9.07332 3.34389 8.63349 3.33425 8.08129C3.32462 7.52909 3.76445 7.07363 4.31665 7.06399L6.98291 7.01745L6.93637 4.35119C6.92673 3.79899 7.36657 3.34353 7.91877 3.33389C8.47097 3.32425 8.92643 3.76408 8.93607 4.31628L8.98261 6.98254L11.6489 6.936C12.2011 6.92637 12.6565 7.3662 12.6662 7.9184Z"
              fill="currentColor"
            />
          </svg>
          {t("matter.action.linkNewGroup")}
        </button>
      </div>

      {/* 已关联群聊列表 */}
      {channels.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-default py-8 text-center text-xs text-text-quaternary">
          {t("matter.detail.noLinkedChannels")}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {channels.map((mc) => {
            // 判断成员权限
            const parentGroupNo = toParentGroupNo(mc.channel_id, mc.channel_type);
            const isMember = !myGroupsFailed && myGroupNos.has(parentGroupNo);
            const latestEntry = latestByChannel.get(mc.channel_id);

            return (
              <li key={mc.id} className="flex flex-col gap-4 rounded-lg bg-black/[0.04] p-3">
                {/* Card head */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-medium leading-[20px] text-text-primary">
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
                  <span
                    className="ml-3 text-[14px] leading-[20px] whitespace-nowrap"
                    style={{ color: "rgba(28,28,35,0.4)" }}
                  >
                    {formatRelativeTime(mc.created_at)}同步
                  </span>
                  {isMember && (
                    <ChannelMoreMenu
                      channelId={mc.channel_id}
                      channelType={mc.channel_type}
                      onUnlink={() => setUnlinkTarget(mc.channel_id)}
                    />
                  )}
                </div>

                {/* 最新进展：仅成员可见 */}
                {isMember && latestEntry !== undefined && latestEntry !== null && (
                  <div className="flex flex-col gap-2">
                    <div
                      className="flex items-center gap-1 text-[14px] leading-[20px]"
                      style={{ color: "rgba(28,28,35,0.8)" }}
                    >
                      <ChannelAvatar
                        channel={new Channel(latestEntry.user_id, ChannelTypePerson)}
                        size={16}
                        title={latestEntry.user_id}
                      />
                      <UserName uid={latestEntry.user_id} className="font-medium" />
                      <span>{formatDateTime(latestEntry.created_at)}</span>
                    </div>
                    <div className="text-[14px] leading-[20px] text-text-primary">
                      {latestEntry.content || "（无文本内容）"}
                    </div>
                  </div>
                )}

                {/* 展开/折叠时间线按钮 */}
                {isMember && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleTimeline(mc.channel_id)}
                      className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent text-[12px] font-semibold leading-[20px] text-purple-600 transition-opacity hover:opacity-80"
                    >
                      {expandedTimelines.has(mc.channel_id) ? "收起群内时间线" : "展开群内时间线"}
                    </button>
                  </div>
                )}

                {/* 展开的 timeline */}
                {expandedTimelines.has(mc.channel_id) && (
                  <div className="mt-2">
                    {timelineLoading && !timelineMap.has(mc.channel_id) ? (
                      <p className="py-10 text-center text-xs text-text-tertiary">
                        正在加载时间线...
                      </p>
                    ) : (timelineMap.get(mc.channel_id) ?? []).length === 0 ? (
                      <p className="py-10 text-center text-xs text-text-tertiary">
                        本群暂无时间线记录
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
                        onDownloadAttachment={onDownloadAttachment}
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
        onClose={onCloseLinkModal}
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
      className={`relative inline-flex h-12 items-center gap-1 border-0 bg-transparent p-0 text-[14px] leading-[20px] transition-colors cursor-pointer ${
        active ? "font-semibold text-text-primary" : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
      {count != null ? <span>{count}</span> : null}
      {active && (
        <span className="absolute right-0 bottom-[-1px] left-0 h-0.5 rounded-[1px] bg-text-primary" />
      )}
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
