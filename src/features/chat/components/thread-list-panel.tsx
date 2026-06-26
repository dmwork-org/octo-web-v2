import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Star,
  X,
} from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { InputDialog } from "@/features/base/components/overlay/input-dialog";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThreadIcon } from "@/components/ui/thread-icon";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { MessageList } from "@/features/chat/components/message-list";
import { Composer } from "@/features/chat/components/composer";
import {
  createThreadByName,
  deleteThread,
  listThreads,
  updateThread,
  type ThreadRaw,
} from "@/features/base/api/endpoints/group.api";
import { followThread, unfollowThread } from "@/features/base/api/endpoints/follow.api";
import { authStore } from "@/features/base/stores/auth";
import { archiveThread, unarchiveThread } from "@/features/base/api/endpoints/group.api";
import { canManageThread } from "@/features/chat/lib/thread-permission";
import {
  deriveArchiveAction,
  shouldShowArchiveButton,
  syncThreadArchiveState,
} from "@/features/chat/lib/thread-archive-actions";
import {
  sidebarFollowQueryKey,
  sidebarFollowQueryOptions,
} from "@/features/chat/queries/sidebar.query";
import { spaceStore } from "@/features/base/stores/space";
import { buildThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { useRightPanelResize } from "@/features/chat/hooks/use-right-panel-resize.hook";
import { DragOverlay, PanelSplitter } from "@/components/ui/panel-splitter";
import { removeThreadConversation } from "@/features/chat/lib/remove-thread-conversation";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface ThreadListPanelProps {
  open: boolean;
  groupNo: string;
  onClose: () => void;
}

// 旧仓 ThreadStatus enum: 1=Active 2=Archived 3=Deleted
const THREAD_STATUS_ACTIVE = 1;
const THREAD_STATUS_ARCHIVED = 2;
const THREAD_STATUS_DELETED = 3;
const CHANNEL_TYPE_THREAD = 5;

type View = "list" | "detail";

/**
 * 子区 panel — 1:1 复刻旧 dmworkbase ThreadPanel
 */
export function ThreadListPanel({ open, groupNo, onClose }: ThreadListPanelProps) {
  const tt = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const { width, isDragging, panelRef, onSplitterMouseDown, onSplitterDoubleClick } =
    useRightPanelResize();
  const [view, setView] = useState<View>("list");
  const [activeThread, setActiveThread] = useState<ThreadRaw | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const selectedChannel = useStore(chatSelectedStore, (s) => s.channel);

  const queryKey = ["chat", "thread-list", groupNo];
  const { data, isLoading, error } = useQuery({
    queryKey,
    // status:"all" 必传 — 默认后端只返活跃子区,thread panel 需要活跃 + 已归档两组
    // (对齐上游 23b59a41 / ThreadPanel.loadThreads)
    queryFn: () => listThreads(groupNo, { page_index: 1, page_size: 100, status: "all" }),
    enabled: open,
    staleTime: 30 * 1000,
  });
  // sidebar follow 推 is_followed(双源融合,对齐老仓 ThreadPanel.loadThreads):
  // ThreadRaw.is_followed 字段后端可能不填,必须叠加 sidebar/sync 推的 followedKeys
  // 才能保证 Star 状态正确。
  const sidebarFollowQ = useQuery(sidebarFollowQueryOptions(spaceId));

  const invalidate = () => void qc.invalidateQueries({ queryKey });

  const createMu = useMutation({
    mutationFn: (name: string) => createThreadByName(groupNo, name),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      toast.success(t("threadPanelLocal.toast.created"));
      // 对齐上游 2c5eccbb:子区创建成功 → 立即 invalidate followed sidebar query,
      // 让关注 tab 列表里(如果父群已被关注 / 子区被默认加入)即时刷新。
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("threadPanelLocal.toast.createFailed")),
  });

  if (!open) return null;

  // 双源融合 is_followed:sidebar.followedKeys 推关注子区集合,合并到 thread
  const followedThreadChannels = new Set<string>();
  if (sidebarFollowQ.data?.followedKeys) {
    // followedKeys 格式:`${target_type}::${target_id}`,target_id 对子区 = channel_id
    for (const key of sidebarFollowQ.data.followedKeys) {
      const [tt, cid] = key.split("::");
      // SidebarTargetType.THREAD = 5,跟 ChannelTypeCommunityTopic 同
      if (tt === "5" && cid) followedThreadChannels.add(cid);
    }
  }
  const threadsWithFollow = (data ?? []).map((th) => ({
    ...th,
    is_followed:
      followedThreadChannels.has(buildThreadChannelId(groupNo, th.short_id)) || !!th.is_followed,
  }));
  // 排序口径:last_message_at(有消息时)→ updated_at → created_at(对齐老仓 threadSortTime)
  const threadSortTime = (th: ThreadRaw): number => {
    const raw = th.last_message_at || th.updated_at || th.created_at;
    return raw ? new Date(raw).getTime() : 0;
  };
  const threads = threadsWithFollow.slice().sort((a, b) => threadSortTime(b) - threadSortTime(a));
  const visibleThreads = threads.filter((th) => th.status !== THREAD_STATUS_DELETED);
  const activeThreads = visibleThreads.filter(
    (th) => !th.status || th.status === THREAD_STATUS_ACTIVE,
  );
  const archivedThreads = visibleThreads.filter((th) => th.status === THREAD_STATUS_ARCHIVED);

  const openDetail = (thread: ThreadRaw) => {
    setActiveThread(thread);
    setView("detail");
  };

  const close = () => {
    setView("list");
    setActiveThread(null);
    onClose();
  };

  return (
    <aside
      ref={panelRef}
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border-default bg-bg-base"
    >
      {view === "list" ? (
        <ListView
          onClose={close}
          onOpenCreate={() => setCreateOpen(true)}
          isLoading={isLoading}
          error={error}
          onRetry={invalidate}
          activeThreads={activeThreads}
          archivedThreads={archivedThreads}
          activeExpanded={activeExpanded}
          archivedExpanded={archivedExpanded}
          toggleActive={() => setActiveExpanded((v) => !v)}
          toggleArchived={() => setArchivedExpanded((v) => !v)}
          groupNo={groupNo}
          selectedChannelId={selectedChannel?.channelID}
          onSelect={openDetail}
        />
      ) : activeThread ? (
        <DetailView
          groupNo={groupNo}
          thread={activeThread}
          onBack={() => setView("list")}
          onClose={close}
          onInvalidate={invalidate}
          onThreadUpdated={(patch) =>
            setActiveThread((prev) => (prev ? { ...prev, ...patch } : prev))
          }
          onAfterDelete={() => {
            setView("list");
            setActiveThread(null);
          }}
        />
      ) : null}

      <InputDialog
        open={createOpen}
        title={tt("threadPanelLocal.createTitle")}
        label={tt("threadPanelLocal.topicLabel")}
        placeholder={tt("threadPanelLocal.topicPlaceholder")}
        okText={tt("threadPanelLocal.create")}
        validate={(v) => v.trim().length > 0}
        okLoading={createMu.isPending}
        onOk={(name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          createMu.mutate(trimmed);
        }}
        onCancel={() => setCreateOpen(false)}
      />

      <PanelSplitter
        side="left"
        isDragging={isDragging}
        onMouseDown={onSplitterMouseDown}
        onDoubleClick={onSplitterDoubleClick}
      />
      {isDragging ? <DragOverlay /> : null}
    </aside>
  );
}

// ─── list view ──────────────────────────────────────────────────────────────

function ListView({
  onClose,
  onOpenCreate,
  isLoading,
  error,
  onRetry,
  activeThreads,
  archivedThreads,
  activeExpanded,
  archivedExpanded,
  toggleActive,
  toggleArchived,
  groupNo,
  selectedChannelId,
  onSelect,
}: {
  onClose: () => void;
  onOpenCreate: () => void;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  activeThreads: ThreadRaw[];
  archivedThreads: ThreadRaw[];
  activeExpanded: boolean;
  archivedExpanded: boolean;
  toggleActive: () => void;
  toggleArchived: () => void;
  groupNo: string;
  selectedChannelId: string | undefined;
  onSelect: (thread: ThreadRaw) => void;
}) {
  const tt = useT();
  return (
    <>
      <PanelHeader title={tt("threadPanelLocal.threadHeader")} onClose={onClose} />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <button
          type="button"
          onClick={onOpenCreate}
          className="mx-4 my-3 flex shrink-0 items-center justify-center gap-1.5 rounded-sm border border-dashed py-2 text-[13px] font-medium text-text-accent transition-colors"
          style={{
            borderColor: "rgba(127, 59, 245, 0.12)",
            backgroundColor: "rgba(127, 59, 245, 0.03)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(28, 28, 35, 0.06)";
            e.currentTarget.style.borderColor = "rgba(127, 59, 245, 0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(127, 59, 245, 0.03)";
            e.currentTarget.style.borderColor = "rgba(127, 59, 245, 0.12)";
          }}
        >
          <Plus size={16} />
          {tt("threadPanelLocal.newThread")}
        </button>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {tt("threadPanelLocal.loading")}
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm">
            <span className="text-error">
              {error instanceof Error ? error.message : tt("threadPanelLocal.loadFailed")}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="text-xs text-text-accent hover:underline"
            >
              {tt("threadPanelLocal.retry")}
            </button>
          </div>
        ) : (
          <>
            <ThreadGroup
              label={tt("threadPanelLocal.active")}
              expanded={activeExpanded}
              onToggle={toggleActive}
              threads={activeThreads}
              emptyText={tt("threadPanelLocal.noActive")}
              groupNo={groupNo}
              selectedChannelId={selectedChannelId}
              onSelect={onSelect}
            />
            {archivedThreads.length > 0 && (
              <ThreadGroup
                label={tt("threadPanelLocal.archived")}
                expanded={archivedExpanded}
                onToggle={toggleArchived}
                threads={archivedThreads}
                emptyText=""
                groupNo={groupNo}
                selectedChannelId={selectedChannelId}
                onSelect={onSelect}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

// ─── detail view(panel 内嵌子区对话)─────────────────────────────────────

function DetailView({
  groupNo,
  thread,
  onBack,
  onClose,
  onInvalidate,
  onThreadUpdated,
  onAfterDelete,
}: {
  groupNo: string;
  thread: ThreadRaw;
  onBack: () => void;
  onClose: () => void;
  onInvalidate: () => void;
  onThreadUpdated?: (patch: Partial<ThreadRaw>) => void;
  onAfterDelete: () => void;
}) {
  const tt = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [moreOpen, setMoreOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const canEdit = canManageThread(thread, groupNo, myUid);
  const archiveAction = deriveArchiveAction(thread);
  const isArchived = thread.status === THREAD_STATUS_ARCHIVED;

  const threadChannel = new Channel(
    buildThreadChannelId(groupNo, thread.short_id),
    CHANNEL_TYPE_THREAD,
  );

  const renameMu = useMutation({
    mutationFn: (name: string) => updateThread(groupNo, thread.short_id, { name }),
    onSuccess: (_data, name) => {
      onInvalidate();
      onThreadUpdated?.({ name });
      setRenameOpen(false);
      toast.success(t("threadPanelLocal.toast.updated"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("threadPanelLocal.toast.updateFailed")),
  });

  const deleteMu = useMutation({
    mutationFn: () => deleteThread(groupNo, thread.short_id),
    onSuccess: () => {
      removeThreadConversation(threadChannel, qc, spaceId, { groupNo, shortId: thread.short_id });
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      setDeleteOpen(false);
      onAfterDelete();
      toast.success(t("threadPanelLocal.toast.deleted"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("threadPanelLocal.toast.deleteFailed")),
  });

  const archiveMu = useMutation({
    mutationFn: () => {
      if (!archiveAction) return Promise.reject(new Error("invalid action"));
      return archiveAction === "archive"
        ? archiveThread(groupNo, thread.short_id)
        : unarchiveThread(groupNo, thread.short_id);
    },
    onSuccess: () => {
      setArchiveConfirmOpen(false);
      onInvalidate();
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      const nextStatus =
        archiveAction === "archive" ? THREAD_STATUS_ARCHIVED : THREAD_STATUS_ACTIVE;
      syncThreadArchiveState(groupNo, thread.short_id, nextStatus);
      void WKSDK.shared().channelManager.fetchChannelInfo(threadChannel);
      onThreadUpdated?.({ status: nextStatus });
      toast.success(
        archiveAction === "archive"
          ? t("threadPanelLocal.toast.archived")
          : t("threadPanelLocal.toast.unarchived"),
      );
    },
    onError: (err) =>
      toast.error(
        err instanceof Error
          ? err.message
          : archiveAction === "archive"
            ? t("threadPanelLocal.toast.archiveFailed")
            : t("threadPanelLocal.toast.unarchiveFailed"),
      ),
  });

  /**
   * 已归档子区发消息后,后端会自动 reactivate 为 Active(对齐上游 23b59a41)。
   * Composer onMessageSent → 短 delay 后 invalidate thread query 拿权威状态。
   * 延迟是为了等后端事务落盘,避免立即 GET 仍返 Archived。
   */
  const handleMessageSent = isArchived
    ? () => {
        setTimeout(() => {
          onInvalidate();
          onThreadUpdated?.({ status: THREAD_STATUS_ACTIVE });
        }, 600);
      }
    : undefined;

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-4">
        <div className="flex min-w-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onBack}
                aria-label={tt("threadPanelLocal.backAll")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <ArrowLeft size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tt("threadPanelLocal.backAll")}</TooltipContent>
          </Tooltip>
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary">
            <ThreadIcon size={18} className="shrink-0 text-text-secondary" />
            <span className="truncate">{thread.name || tt("threadPanelLocal.threadHeader")}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={tt("threadPanelLocal.moreActions")}
                title={tt("threadPanelLocal.moreActions")}
                className="flex h-7 w-7 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <MoreHorizontal size={16} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-36 p-1">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  chatSelectedActions.select(threadChannel);
                  onClose();
                }}
                className="block w-full rounded-sm px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover"
              >
                {tt("threadPanelLocal.openFull")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setRenameOpen(true);
                }}
                className="block w-full rounded-sm px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover"
              >
                {tt("threadPanelLocal.editName")}
              </button>
              {canEdit && archiveAction ? (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setArchiveConfirmOpen(true);
                  }}
                  className="block w-full rounded-sm px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover"
                >
                  {archiveAction === "archive"
                    ? tt("threadPanelLocal.archive")
                    : tt("threadPanelLocal.unarchive")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setDeleteOpen(true);
                }}
                className="block w-full rounded-sm px-3 py-2 text-left text-sm text-error hover:bg-bg-hover"
              >
                {tt("threadPanelLocal.deleteThread")}
              </button>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={onClose}
            aria-label={tt("threadPanelLocal.close")}
            className="flex h-7 w-7 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <MessageList key={threadChannel.channelID} channel={threadChannel} />
        <Composer
          key={`${threadChannel.channelID}_composer`}
          channel={threadChannel}
          inputNotice={isArchived ? tt("threadPanelLocal.archivedInputNotice") : undefined}
          onMessageSent={handleMessageSent}
        />
      </div>

      <InputDialog
        open={renameOpen}
        title={tt("threadPanelLocal.editNameTitle")}
        label={tt("threadPanelLocal.topicLabel")}
        placeholder={tt("threadPanelLocal.threadNamePlaceholder")}
        initialValue={thread.name}
        okText={tt("threadPanelLocal.save")}
        validate={(v) => v.trim().length > 0 && v.trim() !== thread.name}
        okLoading={renameMu.isPending}
        onOk={(name) => {
          const trimmed = name.trim();
          if (!trimmed || trimmed === thread.name) return;
          renameMu.mutate(trimmed);
        }}
        onCancel={() => setRenameOpen(false)}
      />

      <ConfirmDialog
        open={archiveConfirmOpen}
        title={
          archiveAction === "archive"
            ? tt("threadPanelLocal.archiveConfirmTitle", { values: { name: thread.name } })
            : tt("threadPanelLocal.unarchiveConfirmTitle", { values: { name: thread.name } })
        }
        content={
          archiveAction === "archive"
            ? tt("threadPanelLocal.archiveConfirmContent")
            : tt("threadPanelLocal.unarchiveConfirmContent")
        }
        okText={
          archiveAction === "archive"
            ? tt("threadPanelLocal.archive")
            : tt("threadPanelLocal.unarchive")
        }
        okLoading={archiveMu.isPending}
        onOk={() => archiveMu.mutate()}
        onCancel={() => setArchiveConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={tt("threadPanelLocal.deleteTitle")}
        content={tt("threadPanelLocal.deleteContent", { values: { name: thread.name } })}
        okText={tt("threadPanelLocal.deleteOk")}
        okDanger
        okLoading={deleteMu.isPending}
        onOk={() => deleteMu.mutate()}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}

// ─── shared ─────────────────────────────────────────────────────────────────

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const tt = useT();
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-4">
      <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <ThreadIcon size={18} className="text-text-secondary" />
        {title}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label={tt("threadPanelLocal.close")}
        className="flex h-7 w-7 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
      >
        <X size={18} />
      </button>
    </header>
  );
}

function ThreadGroup({
  label,
  expanded,
  onToggle,
  threads,
  emptyText,
  groupNo,
  selectedChannelId,
  onSelect,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  threads: ThreadRaw[];
  emptyText: string;
  groupNo: string;
  selectedChannelId: string | undefined;
  onSelect: (thread: ThreadRaw) => void;
}) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full select-none items-center gap-1 px-4 py-2 text-[12px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <ChevronDown size={14} className={`transition-transform ${expanded ? "" : "-rotate-90"}`} />
        {label}
      </button>
      {expanded ? (
        threads.length === 0 ? (
          emptyText ? (
            <div className="px-4 py-2 text-[12px] text-text-tertiary">{emptyText}</div>
          ) : null
        ) : (
          <div className="px-2">
            {threads.map((th) => {
              const channelId = buildThreadChannelId(groupNo, th.short_id);
              return (
                <ThreadItem
                  key={th.short_id}
                  thread={th}
                  selected={selectedChannelId === channelId}
                  onClick={() => onSelect(th)}
                  groupNo={groupNo}
                />
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}

function ThreadItem({
  thread,
  selected,
  onClick,
  groupNo,
}: {
  thread: ThreadRaw;
  selected: boolean;
  onClick: () => void;
  groupNo: string;
}) {
  const tt = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const canEdit = canManageThread(thread, groupNo, myUid);
  const archiveAction = deriveArchiveAction(thread);
  const showArchiveBtn = shouldShowArchiveButton(thread, canEdit);
  const [optimisticFollowed, setOptimisticFollowed] = useState<boolean | null>(null);
  const [archivingPending, setArchivingPending] = useState(false);
  const followMu = useMutation({
    mutationFn: async ({ followed }: { followed: boolean }) => {
      const channelId = buildThreadChannelId(groupNo, thread.short_id);
      if (followed) await followThread(channelId);
      else await unfollowThread(channelId);
    },
    onMutate: ({ followed }) => setOptimisticFollowed(followed),
    onSuccess: (_void, { followed }) => {
      toast.success(
        followed ? t("threadPanelLocal.toast.followed") : t("threadPanelLocal.toast.unfollowed"),
      );
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      void qc.invalidateQueries({ queryKey: ["chat", "thread-list", groupNo] });
    },
    onError: (err, { followed }) => {
      setOptimisticFollowed(null);
      toast.error(
        err instanceof Error
          ? err.message
          : followed
            ? t("threadPanelLocal.toast.followFailed")
            : t("threadPanelLocal.toast.unfollowFailed"),
      );
    },
  });
  /**
   * 行内归档/取消归档(对齐上游 c13e7e27):
   * - optimistic: 立刻乐观 invalidate query 让 UI 看起来已切组
   * - 成功后 toast 带 5 秒撤销 action,点撤销会反向调对方接口
   * - 失败 toast 错误,query refetch 拿回真实状态
   */
  const performArchive = async (action: "archive" | "unarchive") => {
    if (archivingPending) return;
    setArchivingPending(true);
    try {
      if (action === "archive") {
        await archiveThread(groupNo, thread.short_id);
      } else {
        await unarchiveThread(groupNo, thread.short_id);
      }
      void qc.invalidateQueries({ queryKey: ["chat", "thread-list", groupNo] });
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      syncThreadArchiveState(
        groupNo,
        thread.short_id,
        action === "archive" ? THREAD_STATUS_ARCHIVED : THREAD_STATUS_ACTIVE,
      );
      void WKSDK.shared().channelManager.fetchChannelInfo(
        new Channel(buildThreadChannelId(groupNo, thread.short_id), CHANNEL_TYPE_THREAD),
      );
      toast.success(
        action === "archive"
          ? t("threadPanelLocal.toast.archived")
          : t("threadPanelLocal.toast.unarchived"),
        {
          action: {
            label: t("threadPanelLocal.undo"),
            onClick: () => {
              void performArchive(action === "archive" ? "unarchive" : "archive");
            },
          },
          duration: 5000,
        },
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : action === "archive"
            ? t("threadPanelLocal.toast.archiveFailed")
            : t("threadPanelLocal.toast.unarchiveFailed"),
      );
      void qc.invalidateQueries({ queryKey: ["chat", "thread-list", groupNo] });
    } finally {
      setArchivingPending(false);
    }
  };

  const isFollowed = optimisticFollowed ?? !!thread.is_followed;
  const hasUnread = (thread.unread_count ?? 0) > 0;
  const creatorName = getCreatorName(thread);
  const lastSender = thread.last_message_sender_name ?? "";
  const lastContent = thread.last_message_content ?? "";

  return (
    <div
      onClick={onClick}
      className={`group/thread-item mx-0 mb-1 cursor-pointer rounded-md p-3 transition-colors ${
        selected ? "bg-bg-elevated" : "hover:bg-bg-hover"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {hasUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />}
          <span className="truncate text-[14px] font-semibold text-text-primary">
            {thread.name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (followMu.isPending) return;
              followMu.mutate({ followed: !isFollowed });
            }}
            aria-label={
              isFollowed ? tt("threadPanelLocal.unfollowAria") : tt("threadPanelLocal.followAria")
            }
            className={`flex h-5 w-5 items-center justify-center rounded transition-opacity ${
              isFollowed
                ? "opacity-100 text-yellow-500"
                : "opacity-0 text-text-tertiary group-hover/thread-item:opacity-100 hover:text-text-secondary"
            }`}
          >
            <Star
              size={14}
              fill={isFollowed ? "currentColor" : "none"}
              strokeWidth={isFollowed ? 0 : 1.5}
            />
          </button>
          {showArchiveBtn && archiveAction ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void performArchive(archiveAction);
              }}
              disabled={archivingPending}
              aria-label={
                archiveAction === "archive"
                  ? tt("threadPanelLocal.archiveAria")
                  : tt("threadPanelLocal.unarchiveAria")
              }
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-sm border border-border-default bg-bg-surface px-2 text-[11px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {archiveAction === "archive" ? <Archive size={11} /> : <ArchiveRestore size={11} />}
              <span>
                {archiveAction === "archive"
                  ? tt("threadPanelLocal.archive")
                  : tt("threadPanelLocal.unarchive")}
              </span>
            </button>
          ) : null}
          <span className="text-[12px] text-text-tertiary">
            {formatRelativeTime(thread.updated_at)}
          </span>
        </div>
      </div>
      <div className="mb-1 text-[12px] text-text-tertiary">
        {tt("threadPanelLocal.itemMeta", {
          values: {
            replies: thread.message_count || 0,
            members: thread.member_count || 0,
            creator: creatorName,
          },
        })}
      </div>
      {lastContent ? (
        <div className="truncate text-[13px] text-text-secondary">
          {lastSender}: {lastContent}
        </div>
      ) : (
        <div className="truncate text-[13px] italic text-text-tertiary">
          {tt("threadPanelLocal.noMessages")}
        </div>
      )}
    </div>
  );
}

/**
 * 创建人名称解析(1:1 复刻 ThreadPanel line 967-978 getCreatorName)
 */
function getCreatorName(thread: ThreadRaw): string {
  if (thread.creator_name) return thread.creator_name;
  if (thread.creator_uid) {
    const info = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(thread.creator_uid, ChannelTypePerson),
    );
    return info?.title || thread.creator_uid;
  }
  return t("threadPanelLocal.unknown");
}

/**
 * 相对时间格式化(1:1 复刻 dmworkbase/src/Utils/time.ts:136 formatRelativeTime)
 */
function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t("threadPanelLocal.justNow");
  if (minutes < 60) return t("threadPanelLocal.minutesAgo", { values: { count: minutes } });
  if (hours < 24) return t("threadPanelLocal.hoursAgo", { values: { count: hours } });
  if (days < 7) return t("threadPanelLocal.daysAgo", { values: { count: days } });
  return date.toLocaleDateString();
}
