import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel } from "wukongimjssdk";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
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

const THREAD_STATUS_ACTIVE = 1;
const CHANNEL_TYPE_THREAD = 5;

/**
 * 子区列表 panel(对齐截图高保真设计):
 *
 *   ┌──────────────────────────────────┐
 *   │  ⫷ 子区                       ✕  │
 *   ├──────────────────────────────────┤
 *   │ ┌──────────────────────────────┐ │
 *   │ │      + 新建子区              │ │ ← 全宽 dashed 紫色按钮
 *   │ └──────────────────────────────┘ │
 *   │  ▼ 活跃中                        │ ← 折叠分组
 *   │  ┌────────────────────────────┐  │
 *   │  │ dev-...        2026/5/13   │
 *   │  │ 18 条回复 · 参与 3 人 · X… │
 *   │  │ 许建文: @开发 还是不行哦   │
 *   │  └────────────────────────────┘  │
 *   └──────────────────────────────────┘
 *
 * 操作(加入/离开/解散)入口进子区后走 channel-setting-modal,本 panel 无 hover actions。
 */
export function ThreadListPanel({ open, groupNo, onClose }: ThreadListPanelProps) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeOpen, setActiveOpen] = useState(true);
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

  const activeThreads = (data ?? []).filter((t) => !t.status || t.status === THREAD_STATUS_ACTIVE);

  return (
    <aside className="absolute top-0 right-0 z-30 flex h-full w-[360px] flex-col border-l border-border-subtle bg-bg-surface shadow-lg">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4">
        <span className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <ThreadIcon size={20} className="text-[#7f3bf5]" />
          子区
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        {/* 顶部"+ 新建子区" dashed 紫色全宽按钮 */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="mb-4 flex h-12 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[#7f3bf5]/40 bg-[rgba(127,59,245,0.04)] text-[14px] font-medium text-[#7f3bf5] transition-colors hover:bg-[rgba(127,59,245,0.08)]"
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
              className="text-xs text-[#7f3bf5] hover:underline"
            >
              重试
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setActiveOpen((v) => !v)}
              className="flex shrink-0 items-center gap-1.5 py-2 text-[13px] text-text-secondary hover:text-text-primary"
            >
              {activeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              活跃中
            </button>
            {activeOpen ? (
              activeThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-text-tertiary">
                  暂无子区
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {activeThreads.map((t) => {
                    const channelId = buildThreadChannelId(groupNo, t.short_id);
                    const isSelected = selectedChannel?.channelID === channelId;
                    return (
                      <ThreadRow
                        key={t.short_id}
                        thread={t}
                        selected={isSelected}
                        onClick={() => {
                          chatSelectedActions.select(new Channel(channelId, CHANNEL_TYPE_THREAD));
                          onClose();
                        }}
                      />
                    );
                  })}
                </div>
              )
            ) : null}
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

/** 日期格式化 yyyy/M/d(对齐截图)。 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function ThreadRow({
  thread,
  selected,
  onClick,
}: {
  thread: ThreadRaw;
  selected: boolean;
  onClick: () => void;
}) {
  const messageCount = thread.message_count ?? 0;
  const memberCount = thread.member_count ?? 0;
  const creatorName = thread.creator_name ?? "";
  const lastSender = thread.last_message_sender_name ?? "";
  const lastContent = thread.last_message_content ?? "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
        selected ? "bg-bg-elevated" : "hover:bg-bg-hover"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[14px] font-semibold text-text-primary">{thread.name}</span>
        <span className="shrink-0 text-[12px] text-text-tertiary">
          {formatDate(thread.last_message_at || thread.updated_at || thread.created_at)}
        </span>
      </div>
      <div className="truncate text-[12px] text-text-tertiary">
        {messageCount} 条回复
        {memberCount > 0 ? ` · 参与 ${memberCount} 人` : ""}
        {creatorName ? ` · ${creatorName} 发起` : ""}
      </div>
      {lastContent ? (
        <div className="line-clamp-2 text-[13px] leading-snug text-text-secondary">
          {lastSender ? `${lastSender}: ` : ""}
          {lastContent}
        </div>
      ) : null}
    </button>
  );
}
