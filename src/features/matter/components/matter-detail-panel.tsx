import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { useRouter } from "@tanstack/react-router";
import WKSDK, { Channel, ChannelTypePerson, type ChannelInfo } from "wukongimjssdk";
import { useT } from "@/lib/i18n/use-t";
import { toast } from "@/components/semi-bridge/toast";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { authStore } from "@/features/base/stores/auth";
import {
  matterDetailQueryOptions,
  activitiesInfiniteQueryOptions,
} from "@/features/matter/queries/matters.query";
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
import {
  useMembersFromChannels,
  type ChannelRef,
} from "@/features/matter/hooks/use-members-from-channels";
import { useChannelName } from "@/features/matter/hooks/use-channel-name";
import {
  useLatestTimelinePerChannel,
  useChannelTimelineOnExpand,
} from "@/features/matter/hooks/use-channel-timeline";
import { toParentGroupNo } from "@/features/matter/utils/channel-id";
import { computeAnchorPosition } from "@/features/matter/utils/anchor-position";
import { resolveFileUrl, downloadFile } from "@/features/matter/utils/download";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { chatLocateMessageActions } from "@/features/chat/stores/chat-locate-message";
import { chatSidePanelActions } from "@/features/chat/stores/chat-side-panel";
import { getExtension } from "@/features/chat/file-preview/types";
import { fileRendererRegistry } from "@/features/chat/file-preview/registry";
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
  /** 嵌入模式：显示关闭按钮，标题在 header 内 */
  showClose?: boolean;
  /**
   * 来源会话 channelId（嵌入聊天/绘画侧栏时透传）。
   * 后端据此判断"用户通过该关联群有权访问此事项",非创建人/负责人也能查看,
   * 否则会 403。对齐旧 dmworktodo MatterDetailPanel `getMatter(id, channelId)`。
   */
  sourceChannelId?: string;
}

type SecondaryTab = "channels" | "outputs" | "changelog";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

/** 相对时间格式化（需要 t 函数） */
function formatRelativeTime(
  iso: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t("matter.day.today");
  if (diffDays === 1) return t("matter.day.yesterday");
  if (diffDays < 30) return t("matter.time.daysAgo", { values: { count: diffDays } });
  if (diffDays < 365)
    return t("matter.time.monthsAgo", { values: { count: Math.floor(diffDays / 30) } });
  return t("matter.time.yearsAgo", { values: { count: Math.floor(diffDays / 365) } });
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

function useOutputChannelNameTick(channels: MatterChannel[] | undefined): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const list = channels ?? [];
    if (list.length === 0) return;

    const listener = (info: ChannelInfo) => {
      const matched = list.some(
        (c) =>
          c.channel_id === info.channel.channelID && c.channel_type === info.channel.channelType,
      );
      if (matched) setTick((value) => value + 1);
    };
    WKSDK.shared().channelManager.addListener(listener);

    for (const c of list) {
      const channel = new Channel(c.channel_id, c.channel_type);
      const cached = WKSDK.shared().channelManager.getChannelInfo(channel);
      if (!cached?.title) {
        WKSDK.shared()
          .channelManager.fetchChannelInfo(channel)
          .catch(() => {
            // 保留后端 snapshot 兜底；实时名称拉取失败不阻断详情页。
          });
      }
    }

    return () => {
      WKSDK.shared().channelManager.removeListener(listener);
    };
  }, [channels]);

  return tick;
}

/**
 * Matter 详情面板(1:1 对齐 P3-matter 设计稿 + 原 dmworktodo MatterDetailPanel
 * 独立模式样式)。
 */
export function MatterDetailPanel({
  matterId,
  onClose,
  showClose = false,
  sourceChannelId,
}: MatterDetailPanelProps) {
  const t = useT();
  const { data } = useSuspenseQuery(matterDetailQueryOptions(matterId, sourceChannelId));
  const deleteMu = useDeleteMatter();
  const updateMu = useUpdateMatter();
  const transitionMu = useTransitionMatter();

  const currentUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const isOwner = currentUid
    ? data.creator_id === currentUid || (data.assignees ?? []).some((a) => a.user_id === currentUid)
    : false;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("channels");

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
        toast.error(t("matter.outputs.downloadFailed"));
      }
    },
    [t],
  );

  // 预览附件（对齐老项目 handlePreviewAttachment — WKApp.mittBus.emit wk:file-preview）
  const handleAttachmentPreview = useCallback(
    (att: TimelineAttachment, entry: TimelineEntry) => {
      const url = resolveFileUrl(att.file_url);
      if (!url) return;
      const ext = getExtension(undefined, att.file_name);
      if (!fileRendererRegistry.canPreview(ext)) {
        // 不可预览的文件类型，直接下载
        void downloadFile(url, att.file_name || "file");
        return;
      }
      const sourceChannelId = entry.source_channel_id;
      const matchedCh = (data.channels ?? []).find((ch) => ch.channel_id === sourceChannelId);
      chatSidePanelActions.openFilePreview({
        url,
        name: att.file_name || t("matter.outputs.unnamedFile"),
        ext,
        size: att.file_size,
        sourceChannelId,
        sourceChannelType: matchedCh?.channel_type ?? entry.channel_type,
      });
    },
    [data.channels, t],
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
    refetch: refetchOutputs,
  } = useMatterOutputs(matterId);

  // 变更记录计数
  const { data: activitiesData } = useInfiniteQuery(activitiesInfiniteQueryOptions(matterId));
  const activitiesCount = activitiesData?.pages.flatMap((p) => p.data).length ?? 0;

  // 来源频道实时名称
  const sourceChannelName = useChannelName(data.source_channel_id, data.source_channel_type);
  const displaySourceName = sourceChannelName || data.source_name || "";

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

  const outputChannelNameTick = useOutputChannelNameTick(data.channels);

  const outputChannelNameMap = useMemo(() => {
    void outputChannelNameTick;
    const map = new Map<string, string>();
    for (const ch of data.channels ?? []) {
      const liveName = WKSDK.shared().channelManager.getChannelInfo(
        new Channel(ch.channel_id, ch.channel_type),
      )?.title;
      const name = liveName || ch.channel_name || "";
      if (name) map.set(ch.channel_id, name);
    }
    return map;
  }, [data.channels, outputChannelNameTick]);

  const resolveOutputChannelName = useCallback(
    (sourceChannelId?: string) => {
      if (!sourceChannelId) return undefined;
      return outputChannelNameMap.get(sourceChannelId);
    },
    [outputChannelNameMap],
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

  // 预览产出文件（对齐老项目 handleOutputPreview — WKApp.mittBus.emit wk:file-preview）
  const handleOutputPreview = useCallback(
    (item: MatterOutput) => {
      const url = resolveFileUrl(item.file_url);
      if (!url) return;
      const ext = getExtension(undefined, item.file_name);
      if (!fileRendererRegistry.canPreview(ext)) {
        // 不可预览的文件类型，直接下载
        void downloadFile(url, item.file_name || "file");
        return;
      }
      const matchedCh = (data.channels ?? []).find(
        (ch) => ch.channel_id === item.source_channel_id,
      );
      chatSidePanelActions.openFilePreview({
        url,
        name: item.file_name || t("matter.outputs.unnamedFile"),
        ext,
        size: item.file_size,
        sourceChannelId: item.source_channel_id,
        sourceChannelType: matchedCh?.channel_type,
      });
    },
    [data.channels, t],
  );

  // 来源群成员判断
  const isSourceMember = (() => {
    if (!data.source_channel_id) return true; // 无来源群, 不限制
    if (myGroupsQ.isError) return false;
    const parentNo = toParentGroupNo(data.source_channel_id, data.source_channel_type ?? 2);
    return myGroupNos.has(parentNo);
  })();
  const hasSourceMsgs = (data.source_msgs ?? []).length > 0;

  // 来源 AnchorPopover 状态 (null = 关闭, 对象 = 锚定位置)
  const [sourceAnchor, setSourceAnchor] = useState<{
    x: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  // 状态切换 handler
  const handleStatusChange = useCallback(
    (newStatus: MatterStatus) => {
      transitionMu.mutate({ matterId, status: newStatus });
    },
    [matterId, transitionMu],
  );

  // 跳转到聊天并定位消息 (对齐老项目 showConversation + initLocateMessageSeq)
  const router = useRouter();
  const handleJumpToMessage = useCallback(
    (messageSeq: number) => {
      if (!data.source_channel_id) return;
      const ch = new Channel(data.source_channel_id, data.source_channel_type ?? 2);
      // 先发定位请求(message-list 订阅 chatLocateMessageStore 滚动到目标 seq),
      // 再切群 + 跳路由。strategy "window":按 seq 拉取目标附近窗口再定位。
      chatLocateMessageActions.request(ch, messageSeq, { strategy: "window" });
      chatSelectedActions.select(ch);
      void router.navigate({ to: "/" });
    },
    [router, data.source_channel_id, data.source_channel_type],
  );

  return (
    <section className="relative flex flex-1 flex-col overflow-hidden bg-bg-surface">
      {/* ── Header ── */}
      <header
        className="flex shrink-0 items-center justify-between rounded-t-lg border-b px-4 py-2"
        style={{ minHeight: 48, borderColor: "rgba(28, 28, 35, 0.08)" }}
      >
        {showClose ? (
          /* 嵌入模式：标题+状态在第一行，日期在第二行，右侧关闭按钮 */
          <>
            <div className="flex min-w-0 flex-1 flex-col gap-0">
              <div className="flex items-center gap-2">
                {/* 嵌入模式标题（带 M-xxx 前缀） */}
                {editingTitle ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="shrink-0 text-[14px] font-medium text-text-primary">
                      M-{data.seq_no}｜
                    </span>
                    <input
                      ref={titleInputRef}
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTitle();
                        if (e.key === "Escape") cancelEditing();
                      }}
                      onBlur={saveTitle}
                      className="min-w-0 flex-1 bg-transparent text-[14px] font-medium leading-[20px] text-text-primary outline-none"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="min-w-0 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap text-left text-[14px] font-medium leading-[20px] text-text-primary transition-opacity hover:opacity-70"
                    title={t("matter.detail.clickToEdit")}
                  >
                    M-{data.seq_no}｜{data.title}
                  </button>
                )}
                <StatusPicker
                  status={data.status}
                  onChange={handleStatusChange}
                  isCreator={currentUid === data.creator_id}
                  canEditStatus={isOwner}
                />
              </div>
              <div className="flex items-center gap-0.5">
                <DeadlinePicker matterId={matterId} deadline={data.deadline} />
              </div>
            </div>
            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
              aria-label={t("matter.action.close")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </>
        ) : (
          /* 独立模式：状态pill + 日期 */
          <div className="flex flex-1 items-center gap-2">
            <StatusPicker
              status={data.status}
              onChange={handleStatusChange}
              isCreator={currentUid === data.creator_id}
              canEditStatus={isOwner}
            />
            <DeadlinePicker matterId={matterId} deadline={data.deadline} />
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* ── Title（独立模式下显示）── */}
        {!showClose &&
          (editingTitle ? (
            <div className="px-4 pt-4">
              <div className="rounded-sm border border-accent bg-bg-surface shadow-[0_0_0_2px_rgba(127,59,245,0.1)]">
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") cancelEditing();
                  }}
                  onBlur={saveTitle}
                  className="w-full bg-transparent px-1.5 py-1 text-[20px] leading-[26px] font-semibold text-text-primary outline-none"
                />
              </div>
            </div>
          ) : (
            <h1 className="px-4 pt-4">
              <button
                type="button"
                onClick={startEditing}
                className="w-full cursor-pointer rounded-sm border border-transparent px-1.5 py-1 text-left text-[20px] leading-[26px] font-semibold text-text-primary transition-colors hover:bg-brand-tint-04"
                title={t("matter.detail.clickToEdit")}
              >
                {data.title}
                {data.seq_no ? (
                  <span className="font-normal text-text-tertiary text-[18px]">
                    {" "}
                    M-{data.seq_no}
                  </span>
                ) : null}
              </button>
            </h1>
          ))}

        {/* ── 主要目标(渐变 chip 标签 + 来自行 + description 紧跟)── */}
        <div className="mt-4 px-4">
          <MainGoalEditor matterId={matterId} description={data.description}>
            {data.source_channel_id ? (
              <div className="relative">
                <div
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[14px] leading-[18px] transition-opacity ${
                    !myGroupsQ.isLoading && isSourceMember && hasSourceMsgs
                      ? "cursor-pointer hover:opacity-80"
                      : ""
                  } text-text-primary`}
                  title={
                    myGroupsQ.isLoading
                      ? t("matter.channel.loadingInfo")
                      : isSourceMember && hasSourceMsgs
                        ? t("matter.anchor.viewContext")
                        : !isSourceMember
                          ? t("matter.channel.notMemberTitle")
                          : undefined
                  }
                  onClick={(e) => {
                    if (!myGroupsQ.isLoading && isSourceMember && hasSourceMsgs) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = computeAnchorPosition(rect);
                      setSourceAnchor((prev) => (prev ? null : pos));
                    }
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="shrink-0 text-icon-muted"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M14.0004 1.33301H8.94326C8.76645 1.33301 8.59688 1.40325 8.47185 1.52827L0.943259 9.05686C0.42256 9.57756 0.422559 10.4218 0.943258 10.9425L5.05764 15.0569C5.57834 15.5776 6.42256 15.5776 6.94326 15.0569L14.4719 7.52827C14.5969 7.40325 14.6671 7.23368 14.6671 7.05687V1.99967C14.6671 1.63148 14.3686 1.33301 14.0004 1.33301ZM10.3338 7.33301C11.2543 7.33301 12.0004 6.58682 12.0004 5.66634C12.0004 4.74587 11.2543 3.99967 10.3338 3.99967C9.41331 3.99967 8.66712 4.74587 8.66712 5.66634C8.66712 6.58682 9.41331 7.33301 10.3338 7.33301Z"
                      fill="currentColor"
                    />
                  </svg>
                  {myGroupsQ.isLoading ? (
                    <span
                      className="inline-block h-4 w-24 animate-pulse rounded bg-bg-elevated"
                      aria-label={t("matter.state.loading")}
                    />
                  ) : isSourceMember ? (
                    <span>
                      {t("matter.label.fromChannel", {
                        values: { name: displaySourceName },
                      })}{" "}
                      · <UserName uid={data.creator_id} className="text-text-primary" /> ·{" "}
                      {formatDateTime(data.created_at)}
                    </span>
                  ) : (
                    <span className="select-none blur-[2.5px] opacity-35">
                      {t("matter.label.fromHiddenChannel")}
                    </span>
                  )}
                </div>
                {sourceAnchor && (
                  <AnchorPopover
                    open
                    channelId={data.source_channel_id ?? ""}
                    channelType={data.source_channel_type ?? 2}
                    channelName={displaySourceName}
                    messageIds={data.source_msgs ?? []}
                    onClose={() => setSourceAnchor(null)}
                    x={sourceAnchor.x}
                    top={sourceAnchor.top}
                    bottom={sourceAnchor.bottom}
                    onJumpToMessage={handleJumpToMessage}
                  />
                )}
              </div>
            ) : null}
          </MainGoalEditor>
        </div>

        {/* ── 创建人 + 负责人 chip 行 ── */}
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 text-xs text-icon-default">
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
        {/* shrink-0:外层是 flex-col + overflow-y-auto,内容多时(如变更记录 16 条)
            固定 h-[47px] 的 tab 行会被 flex 默认收缩压扁,导致下边框线被"挤"上去。 */}
        <div className="mt-6 mb-4 h-[47px] shrink-0 border-b border-brand-tint px-4">
          <div className="flex h-full items-stretch gap-6">
            <SecondaryTabBtn
              active={secondaryTab === "channels"}
              onClick={() => setSecondaryTab("channels")}
              label={t("matter.detail.linkChannelTab")}
              count={data.channels?.length ?? 0}
            />
            <SecondaryTabBtn
              active={secondaryTab === "outputs"}
              onClick={() => {
                setSecondaryTab("outputs");
                // 每次点"产出文件" Tab 都拉一遍最新文件列表(对齐用户期望:
                // 详情面板可能开了一会,刚有新产出时点 Tab 立刻看到)。
                refetchOutputs();
              }}
              label={t("matter.outputs.tabLabel")}
              count={outputs.length}
            />
            <SecondaryTabBtn
              active={secondaryTab === "changelog"}
              onClick={() => setSecondaryTab("changelog")}
              label={t("matter.detail.changelogTab")}
              count={activitiesCount}
            />
          </div>
        </div>

        <div className="px-4">
          {secondaryTab === "channels" ? (
            <ChannelsTab
              matterId={matterId}
              channels={data.channels ?? []}
              linkModalOpen={linkModalOpen}
              onOpenLinkModal={() => setLinkModalOpen(true)}
              onCloseLinkModal={() => setLinkModalOpen(false)}
              onDownloadAttachment={handleDownloadAttachment}
              onPreviewAttachment={showClose ? handleAttachmentPreview : undefined}
              canLink={isOwner}
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
              // onPreview 用 showClose 作为"嵌入会话侧边栏"信号(对齐老项目):
              // 预览走 chatSidePanelActions.openFilePreview,只有聊天页右侧
              // FilePreviewPanel 能接收;独立事项页面没有该面板,故不显示预览按钮。
              onPreview={showClose ? handleOutputPreview : undefined}
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

const STATUS_OPTIONS: { value: MatterStatus; labelKey: string; cls: string }[] = [
  { value: "open", labelKey: "matter.status.open", cls: "bg-[#ebf9ff] text-[#005694]" },
  { value: "done", labelKey: "matter.status.done", cls: "bg-[#ecf9ec] text-[#176221]" },
  {
    value: "archived",
    labelKey: "matter.status.archived",
    cls: "bg-[rgba(28,28,35,0.04)] text-text-tertiary",
  },
];

function useCloseStatusPickerOnOutside(
  open: boolean,
  ref: React.RefObject<HTMLSpanElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", c);
    return () => document.removeEventListener("mousedown", c);
  }, [open, ref, onClose]);
}

function StatusPicker({
  status,
  onChange,
  isCreator,
  canEditStatus,
}: {
  status: MatterStatus;
  onChange: (s: MatterStatus) => void;
  isCreator: boolean;
  canEditStatus: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useCloseStatusPickerOnOutside(open, ref, () => setOpen(false));

  const visibleOptions = isCreator
    ? STATUS_OPTIONS
    : STATUS_OPTIONS.filter((o) => o.value !== "archived");
  const current = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];
  const isArchived = status === "archived";
  const isDisabled = isArchived || !canEditStatus;

  return (
    <span className="relative shrink-0 inline-flex whitespace-nowrap" ref={ref}>
      <button
        type="button"
        className={`inline-flex h-5 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border-0 px-2 text-[13px] leading-5 transition-opacity ${current.cls} ${
          isDisabled ? "cursor-not-allowed opacity-80" : "hover:opacity-80"
        }`}
        onClick={() => !isDisabled && setOpen(!open)}
        disabled={isDisabled}
        title={
          isArchived
            ? t("matter.status.cannotChangeArchived")
            : !canEditStatus
              ? t("matter.status.onlyCreatorOrAssignee")
              : t("matter.status.clickToChange")
        }
      >
        <span className="font-semibold">{t(current.labelKey)}</span>
      </button>
      {open && !isDisabled && (
        <div className="absolute top-full left-0 z-10 mt-1 flex w-36 flex-col rounded-md border border-border-subtle bg-bg-surface py-1 shadow-lg">
          {visibleOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`flex cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-xs transition-colors hover:bg-bg-hover ${
                opt.value === status ? "font-semibold text-text-primary" : "text-text-primary"
              }`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${opt.cls}`} />
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      )}
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
  onPreviewAttachment,
  canLink,
}: {
  matterId: string;
  channels: MatterChannel[];
  linkModalOpen: boolean;
  onOpenLinkModal: () => void;
  onCloseLinkModal: () => void;
  onDownloadAttachment: (attachment: TimelineAttachment, entry: TimelineEntry) => void;
  onPreviewAttachment?: (attachment: TimelineAttachment, entry: TimelineEntry) => void;
  /** 当前用户是否有关联会话权限 (creator 或 assignee) */
  canLink: boolean;
}) {
  const t = useT();
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  /** AnchorPopover 状态 */
  const [anchor, setAnchor] = useState<{
    channelId: string;
    channelType: number;
    channelName: string;
    messageIds: string[];
    x: number;
    top?: number;
    bottom?: number;
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

  // 跳转到聊天并定位消息
  const router = useRouter();
  const handleJumpToMessage = useCallback(
    (messageSeq: number) => {
      if (!anchor) return;
      const ch = new Channel(anchor.channelId, anchor.channelType);
      chatLocateMessageActions.request(ch, messageSeq, { strategy: "window" });
      chatSelectedActions.select(ch);
      void router.navigate({ to: "/" });
    },
    [router, anchor],
  );

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
        {canLink && (
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
        )}
      </div>

      {/* 已关联群聊列表 */}
      {channels.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-default py-8 text-center text-xs text-text-quaternary">
          {t("matter.detail.noLinkedChannels")}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {channels.map((mc) => {
            // 判断成员权限
            const parentGroupNo = toParentGroupNo(mc.channel_id, mc.channel_type);
            const isMember = !myGroupsFailed && myGroupNos.has(parentGroupNo);
            const latestEntry = latestByChannel.get(mc.channel_id);

            return (
              <li key={mc.id} className="flex flex-col gap-4 rounded-lg bg-brand-tint-04 p-2">
                {/* Card head */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-normal leading-[20px] text-text-primary">
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
                    <span className="shrink-0 text-[14px] leading-[20px] whitespace-nowrap text-icon-muted">
                      {formatRelativeTime(mc.created_at, t)}
                      {t("matter.sync.syncSuffix")}
                    </span>
                  </div>
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
                    <div className="flex items-center gap-1 text-[14px] leading-[20px]">
                      <ChannelAvatar
                        channel={new Channel(latestEntry.user_id, ChannelTypePerson)}
                        size={20}
                        title={latestEntry.user_id}
                      />
                      <UserName
                        uid={latestEntry.user_id}
                        className="font-normal text-[rgba(28,28,35,0.8)]"
                      />
                      <span className="text-icon-muted">
                        {formatDateTime(latestEntry.created_at)}
                      </span>
                    </div>
                    <div className="text-[14px] leading-[20px] text-text-primary">
                      {latestEntry.content || t("matter.timeline.noText")}
                    </div>
                  </div>
                )}

                {/* 展开/折叠时间线按钮 */}
                {isMember && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleTimeline(mc.channel_id)}
                      className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent text-[12px] font-semibold leading-[20px] text-accent transition-opacity hover:opacity-80"
                    >
                      {expandedTimelines.has(mc.channel_id)
                        ? t("matter.timeline.collapse")
                        : t("matter.timeline.expand")}
                    </button>
                  </div>
                )}

                {/* 展开的 timeline */}
                {expandedTimelines.has(mc.channel_id) && (
                  <div className="mt-2">
                    {timelineLoading && !timelineMap.has(mc.channel_id) ? (
                      <p className="py-10 text-center text-xs text-text-tertiary">
                        {t("matter.timeline.loading")}
                      </p>
                    ) : (timelineMap.get(mc.channel_id) ?? []).length === 0 ? (
                      <p className="py-10 text-center text-xs text-text-tertiary">
                        {t("matter.timeline.emptyInGroup")}
                      </p>
                    ) : (
                      <TimelinePanel
                        entries={timelineMap.get(mc.channel_id) ?? []}
                        canShowAnchor={isMember}
                        onShowAnchor={(entry, ev) => {
                          const rect = ev.currentTarget.getBoundingClientRect();
                          const pos = computeAnchorPosition(rect);
                          setAnchor({
                            channelId: mc.channel_id,
                            channelType: mc.channel_type,
                            channelName: mc.channel_name ?? mc.channel_id.slice(0, 8),
                            messageIds: entry.source_msgs || [],
                            x: pos.x,
                            top: pos.top,
                            bottom: pos.bottom,
                          });
                        }}
                        onDownloadAttachment={onDownloadAttachment}
                        onPreviewAttachment={onPreviewAttachment}
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
          x={anchor.x}
          top={anchor.top}
          bottom={anchor.bottom}
          onClose={() => setAnchor(null)}
          onJumpToMessage={handleJumpToMessage}
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
      className={`relative inline-flex h-full cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[14px] leading-[20px] transition-colors hover:text-text-primary ${
        active ? "font-semibold text-text-primary" : "font-normal text-text-primary"
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
