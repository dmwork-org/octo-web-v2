import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ArrowLeft, ChevronDown, MoreHorizontal, Plus, X } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { buildThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { useResizablePanel } from "@/features/chat/hooks/use-resizable-panel.hook";
import { DragOverlay, PanelSplitter } from "@/components/ui/panel-splitter";

/** thread / file preview 共用 panel 宽度(对齐老仓 ThreadPanel + FilePreviewPanel 同一组件,
    共享 localStorage key wk-thread-panel-width)。range/默认 = 老仓 layoutWidth.ts THREAD_*。
    动态 max:(window - sidebar) * 0.5,保 chat 区 ≥ 50%。 */
const RIGHT_PANEL_MIN_WIDTH = 432;
const RIGHT_PANEL_DEFAULT_WIDTH = 432;
const RIGHT_PANEL_STORAGE_KEY = "wk-thread-panel-width";
const RIGHT_PANEL_MAX_HARD = 1600;
function getRightPanelMaxWidth(windowWidth: number): number {
  // 读 sidebar 当前宽度,扣减后取 50%(对齐老仓 getMaxThreadWidth)
  let leftPanelWidth = 300;
  try {
    const stored = window.localStorage.getItem("wk-layout-left-width");
    if (stored) {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n) && n >= 190 && n <= 360) leftPanelWidth = n;
    }
  } catch {
    // ignore stored width parse error
  }
  const dynamicMax = Math.floor((windowWidth - leftPanelWidth) * 0.5);
  return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(RIGHT_PANEL_MAX_HARD, dynamicMax));
}

interface ThreadListPanelProps {
  open: boolean;
  groupNo: string;
  onClose: () => void;
}

// 旧仓 ThreadStatus enum: 1=Active 2=Archived 3=Deleted
const THREAD_STATUS_ACTIVE = 1;
const THREAD_STATUS_ARCHIVED = 2;
const CHANNEL_TYPE_THREAD = 5;

type View = "list" | "detail";

/**
 * 子区 panel — 1:1 复刻旧 dmworkbase ThreadPanel
 * (`packages/dmworkbase/src/Components/ThreadPanel/index.tsx`)
 *
 * **两个 view**:
 * - `list`:子区列表(分组活跃中/已归档,relative time,unread 红点)
 * - `detail`:进入子区后的对话(MessageList + Composer,header 加 返回 + ··· 菜单)
 *
 * **布局**:panel 是父容器 flex sibling,主区被自动挤压(`calc(100% - 380px)`),
 *   不是 absolute overlay。挂在 `chat-main` 横向 flex 内。
 *
 * 操作(加入/离开)入口走 detail view 的 ··· 菜单。
 */
export function ThreadListPanel({ open, groupNo, onClose }: ThreadListPanelProps) {
  const qc = useQueryClient();
  // 宽度拖拽(左边缘,共享 file-preview-panel localStorage,对齐老仓 ThreadPanel)
  const { width, isDragging, panelRef, onSplitterMouseDown, onSplitterDoubleClick } =
    useResizablePanel({
      storageKey: RIGHT_PANEL_STORAGE_KEY,
      defaultWidth: RIGHT_PANEL_DEFAULT_WIDTH,
      minWidth: RIGHT_PANEL_MIN_WIDTH,
      getMaxWidth: getRightPanelMaxWidth,
      edge: "left",
    });
  const [view, setView] = useState<View>("list");
  const [activeThread, setActiveThread] = useState<ThreadRaw | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const selectedChannel = useStore(chatSelectedStore, (s) => s.channel);

  const queryKey = ["chat", "thread-list", groupNo];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => listThreads(groupNo, { page_index: 1, page_size: 100 }),
    enabled: open,
    staleTime: 30 * 1000,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey });

  const createMu = useMutation({
    mutationFn: (name: string) => createThreadByName(groupNo, name),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      toast.success("子区创建成功");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "创建失败"),
  });

  if (!open) return null;

  const threads = (data ?? [])
    .slice()
    // 按活跃时间倒序(对齐 ThreadPanel:line 439 threads.sort by updated_at desc)
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
  const activeThreads = threads.filter((t) => !t.status || t.status === THREAD_STATUS_ACTIVE);
  const archivedThreads = threads.filter((t) => t.status === THREAD_STATUS_ARCHIVED);

  const openDetail = (thread: ThreadRaw) => {
    setActiveThread(thread);
    setView("detail");
  };

  // 关 panel 时把 view/activeThread 重置 — 下次重开默认进 list
  // (panel 用 `if (!open) return null` 早退,内部 state 不卸载,不 reset 会停在 detail)
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

      {/* 创建子区 modal — 文案对齐旧 ThreadPanel handleCreateThread:
            title=创建子区 / label=话题名称 / placeholder=输入讨论话题... / okText=创建 */}
      <InputModal
        open={createOpen}
        title="创建子区"
        label="话题名称"
        placeholder="输入讨论话题..."
        okText="创建"
        validate={(v) => v.trim().length > 0}
        okLoading={createMu.isPending}
        onOk={(name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          createMu.mutate(trimmed);
        }}
        onCancel={() => setCreateOpen(false)}
      />

      {/* 左边缘 splitter:hover/drag 显紫色细线;双击重置默认 432 */}
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
  return (
    <>
      <PanelHeader title="子区" onClose={onClose} />
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* "+ 新建子区" — 1px dashed,wk-ai-surface/wk-ai-border 真值 */}
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
          新建子区
        </button>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            加载中…
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm">
            <span className="text-error">
              {error instanceof Error ? error.message : "子区加载失败"}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="text-xs text-text-accent hover:underline"
            >
              重试
            </button>
          </div>
        ) : (
          <>
            <ThreadGroup
              label="活跃中"
              expanded={activeExpanded}
              onToggle={toggleActive}
              threads={activeThreads}
              emptyText="暂无活跃子区"
              groupNo={groupNo}
              selectedChannelId={selectedChannelId}
              onSelect={onSelect}
            />
            {archivedThreads.length > 0 && (
              <ThreadGroup
                label="已归档"
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
  /** 改名/状态变更后,通知外层更新 activeThread,detail header 实时显示新值。 */
  onThreadUpdated?: (patch: Partial<ThreadRaw>) => void;
  onAfterDelete: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
      toast.success("已更新");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "更新失败"),
  });

  const deleteMu = useMutation({
    mutationFn: () => deleteThread(groupNo, thread.short_id),
    onSuccess: () => {
      onInvalidate();
      setDeleteOpen(false);
      onAfterDelete();
      toast.success("已删除");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-default bg-bg-surface px-4">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            aria-label="返回全部子区"
            title="返回全部子区"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary">
            <ThreadIcon size={18} className="shrink-0 text-text-secondary" />
            <span className="truncate">{thread.name || "子区"}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="更多操作"
                title="更多操作"
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
                在完整视图打开
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setRenameOpen(true);
                }}
                className="block w-full rounded-sm px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover"
              >
                编辑子区名称
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setDeleteOpen(true);
                }}
                className="block w-full rounded-sm px-3 py-2 text-left text-sm text-error hover:bg-bg-hover"
              >
                删除子区
              </button>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <MessageList key={threadChannel.channelID} channel={threadChannel} />
        <Composer key={`${threadChannel.channelID}_composer`} channel={threadChannel} />
      </div>

      <InputModal
        open={renameOpen}
        title="编辑子区名称"
        label="话题名称"
        placeholder="输入子区名称"
        initialValue={thread.name}
        okText="保存"
        validate={(v) => v.trim().length > 0 && v.trim() !== thread.name}
        okLoading={renameMu.isPending}
        onOk={(name) => {
          const trimmed = name.trim();
          if (!trimmed || trimmed === thread.name) return;
          renameMu.mutate(trimmed);
        }}
        onCancel={() => setRenameOpen(false)}
      />

      <ConfirmModal
        open={deleteOpen}
        title="删除子区"
        content={`确定删除子区"${thread.name}"?此操作不可撤销。`}
        okText="删除"
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
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-default bg-bg-surface px-4">
      <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <ThreadIcon size={18} className="text-text-secondary" />
        {title}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
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
            {threads.map((t) => {
              const channelId = buildThreadChannelId(groupNo, t.short_id);
              return (
                <ThreadItem
                  key={t.short_id}
                  thread={t}
                  selected={selectedChannelId === channelId}
                  onClick={() => onSelect(t)}
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
}: {
  thread: ThreadRaw;
  selected: boolean;
  onClick: () => void;
}) {
  const hasUnread = (thread.unread_count ?? 0) > 0;
  const creatorName = getCreatorName(thread);
  const lastSender = thread.last_message_sender_name ?? "";
  const lastContent = thread.last_message_content ?? "";

  return (
    <div
      onClick={onClick}
      className={`mx-0 mb-1 cursor-pointer rounded-md p-3 transition-colors ${
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
        <span className="shrink-0 text-[12px] text-text-tertiary">
          {formatRelativeTime(thread.updated_at)}
        </span>
      </div>
      <div className="mb-1 text-[12px] text-text-tertiary">
        {thread.message_count || 0} 条回复 · 参与 {thread.member_count || 0} 人 · {creatorName} 发起
      </div>
      {lastContent ? (
        <div className="truncate text-[13px] text-text-secondary">
          {lastSender}: {lastContent}
        </div>
      ) : (
        <div className="truncate text-[13px] italic text-text-tertiary">暂无消息</div>
      )}
    </div>
  );
}

/**
 * 创建人名称解析(1:1 复刻 ThreadPanel line 967-978 getCreatorName)
 * 1. thread.creator_name 直接用
 * 2. 否则查 channelManager 的 personal channelInfo.title
 * 3. fallback uid → "未知"
 */
function getCreatorName(thread: ThreadRaw): string {
  if (thread.creator_name) return thread.creator_name;
  if (thread.creator_uid) {
    const info = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(thread.creator_uid, ChannelTypePerson),
    );
    return info?.title || thread.creator_uid;
  }
  return "未知";
}

/**
 * 相对时间格式化(1:1 复刻 dmworkbase/src/Utils/time.ts:136 formatRelativeTime)
 * 刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期(7 天以上走 toLocaleDateString)
 */
function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString();
}
