import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel } from "wukongimjssdk";
import { ChevronDown, Plus, X } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { ThreadIcon } from "@/components/ui/thread-icon";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import {
  createThreadByName,
  listThreads,
  type ThreadRaw,
} from "@/features/base/api/endpoints/group.api";
import { buildThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

interface ThreadListPanelProps {
  open: boolean;
  groupNo: string;
  onClose: () => void;
}

// 旧仓 ThreadStatus enum: 1=Active 2=Archived 3=Deleted
const THREAD_STATUS_ACTIVE = 1;
const THREAD_STATUS_ARCHIVED = 2;
const CHANNEL_TYPE_THREAD = 5;

/**
 * 子区列表 panel — 1:1 复刻旧 dmworkbase ThreadPanel listView
 * (`packages/dmworkbase/src/Components/ThreadPanel/index.tsx` line 877-1015)
 *
 *   ┌──────────────────────────────────┐
 *   │  ⫷ 子区                       ✕  │  height = chat-header
 *   ├──────────────────────────────────┤
 *   │ ┌──────────────────────────────┐ │
 *   │ │      + 新建子区              │ │  ← 1px dashed 紫面板,sp-3/sp-4 margin
 *   │ └──────────────────────────────┘ │
 *   │  ▾ 活跃中                        │  ← chevron 折叠
 *   │  ┌────────────────────────────┐  │
 *   │  │ • dev-…       3 小时前    │  ← unread 红点 + relative time
 *   │  │ 18 条回复 · 参与 3 人 · X… │
 *   │  │ 许建文: @开发 还是不行     │  ← single-line ellipsis
 *   │  └────────────────────────────┘  │
 *   │  ▾ 已归档                        │  ← 仅 archived 非空时显示
 *   └──────────────────────────────────┘
 *
 * 操作(加入/离开/解散)入口进子区后走 channel-setting-modal,本 panel 无 hover actions。
 */
export function ThreadListPanel({ open, groupNo, onClose }: ThreadListPanelProps) {
  const qc = useQueryClient();
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
      toast.success("已创建");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "创建失败"),
  });

  if (!open) return null;

  const threads = data ?? [];
  const activeThreads = threads.filter((t) => !t.status || t.status === THREAD_STATUS_ACTIVE);
  const archivedThreads = threads.filter((t) => t.status === THREAD_STATUS_ARCHIVED);

  return (
    <aside className="absolute top-0 right-0 z-30 flex h-full w-[380px] flex-col border-l border-border-default bg-bg-base shadow-md">
      {/* header — list view 只有 X 关闭(MoreHorizontal 在 detail view) */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-default bg-bg-surface px-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <ThreadIcon size={18} className="text-text-secondary" />
          子区
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

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* "+ 新建子区" — 1px dashed,wk-ai-surface/wk-ai-border 真值 */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
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
              onClick={invalidate}
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
              onToggle={() => setActiveExpanded((v) => !v)}
              threads={activeThreads}
              emptyText="暂无活跃子区"
              groupNo={groupNo}
              selectedChannelId={selectedChannel?.channelID}
              onSelect={(channelId) => {
                chatSelectedActions.select(new Channel(channelId, CHANNEL_TYPE_THREAD));
                onClose();
              }}
            />
            {archivedThreads.length > 0 && (
              <ThreadGroup
                label="已归档"
                expanded={archivedExpanded}
                onToggle={() => setArchivedExpanded((v) => !v)}
                threads={archivedThreads}
                emptyText=""
                groupNo={groupNo}
                selectedChannelId={selectedChannel?.channelID}
                onSelect={(channelId) => {
                  chatSelectedActions.select(new Channel(channelId, CHANNEL_TYPE_THREAD));
                  onClose();
                }}
              />
            )}
          </>
        )}
      </div>

      <InputModal
        open={createOpen}
        title="新建子区"
        placeholder="输入子区名称"
        validate={(v) => v.trim().length > 0}
        okLoading={createMu.isPending}
        onOk={(name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          createMu.mutate(trimmed);
        }}
        onCancel={() => setCreateOpen(false)}
      />
    </aside>
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
  onSelect: (channelId: string) => void;
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
                  onClick={() => onSelect(channelId)}
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
  const creatorName = thread.creator_name ?? "未知";
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
