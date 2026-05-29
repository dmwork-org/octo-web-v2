import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel } from "wukongimjssdk";
import { LogOut, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { authStore } from "@/features/base/stores/auth";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import {
  createThreadByName,
  deleteThread,
  joinThread,
  leaveThread,
  listThreads,
  type ThreadRaw,
} from "@/features/base/api/endpoints/group.api";
import { buildThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

interface ThreadListPanelProps {
  open: boolean;
  groupNo: string;
  onClose: () => void;
}

/** ThreadStatus(对齐旧 Service/Thread):1=活跃 / 2=归档 / 3=删除。 */
const THREAD_STATUS_ACTIVE = 1;
/** ChannelType 5 = ChannelTypeCommunityTopic。 */
const CHANNEL_TYPE_THREAD = 5;

/**
 * 子区列表 panel(对齐旧 dmworkbase Components/ThreadList,1:1 复刻):
 *
 *   ┌────────────────────────────────────┐
 *   │ 子区列表          [新建子区] [✕]   │
 *   ├────────────────────────────────────┤
 *   │ ┃#┃ thread name  [已加入]   [icon] │ ← hover 出 join/leave/delete
 *   │ ┃ ┃ N 人 · 创建于 X                │
 *   └────────────────────────────────────┘
 *
 * - Filter status === Active(1),归档/删除不显示
 * - 加入(未加入显示主色按钮)/ 离开(已加入显示三级)/ 删除(creator only,
 *   hover 出 danger icon)
 * - 顶部"新建子区"打开 InputModal,createThreadByName 提交
 * - 列表 click → 进子区(buildThreadChannelId)
 */
export function ThreadListPanel({ open, groupNo, onClose }: ThreadListPanelProps) {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<ThreadRaw | null>(null);

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

  const joinMu = useMutation({
    mutationFn: (shortId: string) => joinThread(shortId),
    onSuccess: () => {
      invalidate();
      toast.success("已加入");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "加入失败"),
  });

  const leaveMu = useMutation({
    mutationFn: (shortId: string) => leaveThread(shortId),
    onSuccess: () => {
      invalidate();
      toast.success("已离开");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "离开失败"),
  });

  const deleteMu = useMutation({
    mutationFn: (shortId: string) => deleteThread(groupNo, shortId),
    onSuccess: () => {
      invalidate();
      setConfirmDeleteId(null);
      toast.success("已删除");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  if (!open) return null;

  const activeThreads = (data ?? []).filter((t) => !t.status || t.status === THREAD_STATUS_ACTIVE);

  return (
    <aside className="absolute top-14 right-0 z-30 flex h-[calc(100%-3.5rem)] w-[320px] flex-col border-l border-border-subtle bg-bg-surface shadow-lg">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <span className="text-base font-semibold text-text-primary">子区列表</span>
        <div className="flex items-center gap-2">
          <Button size="small" onClick={() => setCreateOpen(true)}>
            新建子区
          </Button>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            加载中…
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm">
            <span className="text-error">
              {error instanceof Error ? error.message : "子区加载失败"}
            </span>
            <Button onClick={invalidate}>重试</Button>
          </div>
        ) : activeThreads.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-text-tertiary">
            <span>暂无子区</span>
            <Button onClick={() => setCreateOpen(true)}>创建第一个子区</Button>
          </div>
        ) : (
          activeThreads.map((t) => (
            <ThreadRow
              key={t.short_id}
              thread={t}
              myUid={myUid}
              joining={joinMu.isPending && joinMu.variables === t.short_id}
              leaving={leaveMu.isPending && leaveMu.variables === t.short_id}
              onEnter={() => {
                const channelId = buildThreadChannelId(groupNo, t.short_id);
                chatSelectedActions.select(new Channel(channelId, CHANNEL_TYPE_THREAD));
                onClose();
              }}
              onJoin={() => joinMu.mutate(t.short_id)}
              onLeave={() => leaveMu.mutate(t.short_id)}
              onAskDelete={() => setConfirmDeleteId(t)}
            />
          ))
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

      <ConfirmModal
        open={!!confirmDeleteId}
        content={`确定要删除子区 "${confirmDeleteId?.name ?? ""}" 吗?此操作不可恢复。`}
        okDanger
        okText="删除"
        okLoading={deleteMu.isPending}
        onOk={() => confirmDeleteId && deleteMu.mutate(confirmDeleteId.short_id)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </aside>
  );
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString();
}

function ThreadRow({
  thread,
  myUid,
  joining,
  leaving,
  onEnter,
  onJoin,
  onLeave,
  onAskDelete,
}: {
  thread: ThreadRaw;
  myUid: string;
  joining: boolean;
  leaving: boolean;
  onEnter: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onAskDelete: () => void;
}) {
  const isMember = thread.is_member === 1;
  const isCreator = thread.creator_uid === myUid;
  return (
    <div
      className="group flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-bg-hover"
      onClick={onEnter}
      role="button"
    >
      {/* # icon — 36×36 圆角方块,浅紫底(对齐旧 .wk-thread-item-icon) */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(127,59,245,0.1)] text-lg font-medium text-[#7f3bf5]">
        #
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text-primary">{thread.name}</span>
          {isMember ? (
            <span className="shrink-0 rounded-[10px] bg-[#7f3bf5] px-1.5 text-[10px] font-normal text-white">
              已加入
            </span>
          ) : null}
        </div>
        <div className="truncate text-[12px] text-text-tertiary">
          {thread.member_count && thread.member_count > 0 ? `${thread.member_count} 人 · ` : ""}
          创建于 {formatTime(thread.created_at)}
        </div>
      </div>
      <div
        className="flex shrink-0 items-center gap-1"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        {isMember ? (
          <button
            type="button"
            title="离开"
            aria-label="离开子区"
            disabled={leaving}
            onClick={onLeave}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:opacity-50"
          >
            <LogOut size={14} />
          </button>
        ) : (
          <button
            type="button"
            title="加入"
            aria-label="加入子区"
            disabled={joining}
            onClick={onJoin}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#7f3bf5] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <UserPlus size={14} />
          </button>
        )}
        {isCreator ? (
          <button
            type="button"
            title="删除"
            aria-label="删除子区"
            onClick={onAskDelete}
            className="flex h-7 w-7 items-center justify-center rounded-md text-error opacity-0 transition-opacity hover:bg-error/10 group-hover:opacity-100"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
