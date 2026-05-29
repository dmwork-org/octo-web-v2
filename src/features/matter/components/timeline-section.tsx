import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Trash2 } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { RichEditor } from "@/components/rich/rich-editor";
import { Button } from "@/components/semi-bridge/button";
import { timelineInfiniteQueryOptions } from "@/features/matter/queries/matters.query";
import {
  useAddTimelineEntry,
  useDeleteTimelineEntry,
} from "@/features/matter/mutations/matters.mutation";
import { UserName } from "@/features/matter/components/user-name";
import type { TimelineEntry } from "@/features/matter/types/matter.types";

interface TimelineSectionProps {
  matterId: string;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatGroupHeader(d: Date, now: Date): string {
  if (isSameDay(d, now)) return "今天";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "昨天";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface TimelineGroup {
  key: string;
  label: string;
  entries: TimelineEntry[];
}

/**
 * 把扁平 entries 按"今天/昨天/MM-DD"分组,每组内按时间升序。
 * 后端返回最新在前(DESC),这里 reverse 让最旧在前,符合"看完前面看后面"阅读顺序。
 */
function groupTimelineEntries(entries: TimelineEntry[]): TimelineGroup[] {
  const now = new Date();
  const groups = new Map<string, TimelineGroup>();
  const ordered = [...entries].reverse();
  for (const e of ordered) {
    const d = new Date(e.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const label = formatGroupHeader(d, now);
    if (!groups.has(key)) groups.set(key, { key, label, entries: [] });
    groups.get(key)!.entries.push(e);
  }
  return [...groups.values()];
}

/**
 * IntersectionObserver 监听 sentinel 触底,加载更老的 timeline。命名 hook。
 */
function useFetchNextOnInView(
  ref: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  fetchNextPage: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled, fetchNextPage]);
}

/**
 * Matter 评论 / 时间线区段(P3-matter D-4 扩展):
 *
 *   [— 今天 —]
 *     [头像] {name}  HH:mm                   [删除(自己)]
 *     {content RichEditor 渲染}
 *     [头像] ...
 *
 *   [— 昨天 —] ...
 *
 *   [sentinel] ← 触底加载更老
 *
 *   ┌─ 输入区 ───────────────────────────────────────────┐
 *   │ <RichEditor placeholder="添加评论…">                │
 *   │                                          [发送]    │
 *   └─────────────────────────────────────────────────────┘
 *
 * 与原 dmworktodo 的差异:
 * - 不分 channel 渲染(本期 channel-picker 仍 P3+,timeline 平铺)
 * - 不做附件上传(IM 文件接口跨 chat feature,P3+)
 * - 不做 @mention(同上,P3+)
 *
 * 内容用 TipTap RichEditor 写入(支持加粗 / 列表 / 链接);只读渲染由
 * RichEditor readOnly 模式 dangerouslySetInnerHTML 等价输出。
 */
export function TimelineSection({ matterId }: TimelineSectionProps) {
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const query = useInfiniteQuery(timelineInfiniteQueryOptions(matterId));
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const addMu = useAddTimelineEntry(matterId);
  const delMu = useDeleteTimelineEntry(matterId);

  const [draft, setDraft] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const all = useMemo<TimelineEntry[]>(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const groups = useMemo(() => groupTimelineEntries(all), [all]);

  useFetchNextOnInView(sentinelRef, !!hasNextPage && !isFetchingNextPage, fetchNextPage);

  const isEmptyContent = (html: string) => {
    const text = html.replace(/<[^>]+>/g, "").trim();
    return text.length === 0;
  };

  const handleSend = () => {
    if (isEmptyContent(draft) || addMu.isPending) return;
    addMu.mutate(
      { content: draft },
      {
        onSuccess: () => setDraft(""),
      },
    );
  };

  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-border-subtle pt-4">
      <h3 className="text-xs font-semibold text-text-secondary">评论 / 时间线</h3>

      <div ref={sentinelRef} className="h-1 shrink-0" aria-hidden />
      {isFetchingNextPage ? (
        <p className="py-1 text-center text-[11px] text-text-tertiary">加载更早…</p>
      ) : null}

      {isLoading ? (
        <p className="px-1 py-2 text-xs text-text-tertiary">加载中…</p>
      ) : error ? (
        <p className="px-1 py-2 text-xs text-error">加载失败</p>
      ) : groups.length === 0 ? (
        <p className="px-1 py-2 text-xs text-text-tertiary">暂无评论,在下方写第一条</p>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
              <span className="h-px flex-1 bg-border-subtle" />
              <span>{g.label}</span>
              <span className="h-px flex-1 bg-border-subtle" />
            </div>
            {g.entries.map((e) => {
              const canDelete = e.user_id === myUid;
              const time = formatTime(new Date(e.created_at));
              return (
                <article
                  key={e.id}
                  className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-bg-hover"
                >
                  <ChannelAvatar
                    channel={new Channel(e.user_id, ChannelTypePerson)}
                    size={28}
                    title={e.user_id}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-[11px] text-text-tertiary">
                      <UserName uid={e.user_id} className="font-medium text-text-secondary" />
                      <span>{time}</span>
                    </div>
                    <div className="mt-0.5 text-sm text-text-primary">
                      <RichEditor value={e.content ?? ""} readOnly />
                    </div>
                  </div>
                  {canDelete ? (
                    <button
                      type="button"
                      aria-label="删除评论"
                      title="删除"
                      disabled={delMu.isPending && delMu.variables === e.id}
                      onClick={() => {
                        if (window.confirm("确认删除该评论?")) delMu.mutate(e.id);
                      }}
                      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors group-hover:flex hover:bg-bg-elevated hover:text-error disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ))
      )}

      <div className="mt-2 flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-base p-3">
        <RichEditor
          value={draft}
          onChange={setDraft}
          placeholder="添加评论…(支持加粗 / 列表 / 链接)"
        />
        <div className="flex justify-end">
          <Button
            type="primary"
            theme="solid"
            size="small"
            loading={addMu.isPending}
            disabled={isEmptyContent(draft)}
            onClick={handleSend}
          >
            发送
          </Button>
        </div>
      </div>
    </section>
  );
}
