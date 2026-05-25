import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { addTimelineEntry, deleteTimelineEntry } from "@/features/matter/api/matter.api";
import { timelineQueryKey, timelineQueryOptions } from "@/features/matter/queries/matters.query";
import type { TimelineEntry } from "@/features/matter/types/matter.types";

interface TimelineSectionProps {
  matterId: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return `今天 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/**
 * Matter 时间线(K-3 简版,对应旧 MatterDetailPanel 平铺评论):
 *
 * - GET /matters/{id}/timeline?limit=50 拉首页(后续 wave 接 useInfiniteQuery)
 * - 每条 entry:发送人头像 + uid + content + 时间 + 自己条目右侧删除
 * - 底部 textarea + Cmd/Ctrl+Enter 发送
 *
 * 旧版还有分群分组 / 展开收起 / 附件 / activities,P3 后续 wave 再补。
 */
export function TimelineSection({ matterId }: TimelineSectionProps) {
  const qc = useQueryClient();
  const currentUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const { data, isLoading, error } = useQuery(timelineQueryOptions(matterId));
  const [input, setInput] = useState("");

  const addMu = useMutation({
    mutationFn: (content: string) => addTimelineEntry(matterId, { content }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: timelineQueryKey(matterId) });
      setInput("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "发送失败"),
  });

  const delMu = useMutation({
    mutationFn: (entryId: string) => deleteTimelineEntry(matterId, entryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: timelineQueryKey(matterId) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  const entries = useMemo<TimelineEntry[]>(() => data?.data ?? [], [data]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || addMu.isPending) return;
    addMu.mutate(text);
  };

  return (
    <section className="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-4">
      <h2 className="text-xs font-semibold text-text-secondary">时间线</h2>

      {isLoading ? (
        <p className="px-1 py-2 text-xs text-text-tertiary">加载中…</p>
      ) : error ? (
        <p className="px-1 py-2 text-xs text-error">加载失败</p>
      ) : entries.length === 0 ? (
        <p className="px-1 py-2 text-xs text-text-tertiary">暂无评论</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => {
            const canDelete = e.user_id === currentUid;
            return (
              <li
                key={e.id}
                className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-bg-hover"
              >
                <ChannelAvatar
                  channel={new Channel(e.user_id, ChannelTypePerson)}
                  size={24}
                  title={e.user_id}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-[11px] text-text-tertiary">
                    <span className="truncate font-mono text-text-secondary">{e.user_id}</span>
                    <span className="shrink-0">{formatTime(e.created_at)}</span>
                  </div>
                  <p className="mt-0.5 break-words whitespace-pre-wrap text-sm text-text-primary">
                    {e.content ?? ""}
                  </p>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    aria-label="删除"
                    title="删除"
                    disabled={delMu.isPending && delMu.variables === e.id}
                    onClick={() => {
                      if (window.confirm("确认删除该评论?")) delMu.mutate(e.id);
                    }}
                    className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-error group-hover:flex disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={onSubmit} className="mt-1 flex flex-col gap-2">
        <textarea
          value={input}
          onChange={(ev) => setInput(ev.target.value)}
          onKeyDown={(ev) => {
            if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
              ev.preventDefault();
              const text = input.trim();
              if (text && !addMu.isPending) addMu.mutate(text);
            }
          }}
          placeholder="添加评论…(⌘/Ctrl + Enter 发送)"
          rows={2}
          className="resize-none rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
        />
        <div className="flex justify-end">
          <Button
            htmlType="submit"
            type="primary"
            theme="solid"
            size="small"
            loading={addMu.isPending}
            disabled={input.trim().length === 0}
          >
            发送
          </Button>
        </div>
      </form>
    </section>
  );
}
