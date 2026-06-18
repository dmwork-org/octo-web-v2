import { useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
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
import { useFetchNextOnInView } from "@/features/matter/hooks/use-fetch-next-on-in-view";
import { formatMatterTime, isSameMatterDay } from "@/features/matter/lib/time";
import type { TimelineEntry } from "@/features/matter/types/matter.types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TimelineSectionProps {
  matterId: string;
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
function groupTimelineEntries(
  entries: TimelineEntry[],
  formatGroupHeader: (d: Date, now: Date) => string,
): TimelineGroup[] {
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
 * Matter 评论 / 时间线区段(P3-matter D-4 扩展)。
 */
export function TimelineSection({ matterId }: TimelineSectionProps) {
  const tr = useT();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const query = useInfiniteQuery(timelineInfiniteQueryOptions(matterId));
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const addMu = useAddTimelineEntry(matterId);
  const delMu = useDeleteTimelineEntry(matterId);

  const [draft, setDraft] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const all = useMemo<TimelineEntry[]>(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  const formatGroupHeader = (d: Date, now: Date): string => {
    if (isSameMatterDay(d, now)) return tr("matter.day.today");
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameMatterDay(d, yesterday)) return tr("matter.day.yesterday");
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const groups = useMemo(
    () => groupTimelineEntries(all, formatGroupHeader),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, tr],
  );

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
      <h3 className="text-xs font-semibold text-text-secondary">{tr("matter.timeline.title")}</h3>

      <div ref={sentinelRef} className="h-1 shrink-0" aria-hidden />
      {isFetchingNextPage ? (
        <p className="py-1 text-center text-[11px] text-text-tertiary">
          {tr("matter.timeline.loadingMore")}
        </p>
      ) : null}

      {isLoading ? (
        <p className="px-1 py-2 text-xs text-text-tertiary">{tr("matter.activity.loading")}</p>
      ) : error ? (
        <p className="px-1 py-2 text-xs text-error">{tr("matter.timeline.loadFailed")}</p>
      ) : groups.length === 0 ? (
        <p className="px-1 py-2 text-xs text-text-tertiary">{tr("matter.timeline.emptyHint")}</p>
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
              const time = formatMatterTime(e.created_at);
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={tr("matter.timeline.deleteCommentAria")}
                          disabled={delMu.isPending && delMu.variables === e.id}
                          onClick={() => {
                            if (window.confirm(t("matter.toast.commentDeleteConfirm")))
                              delMu.mutate(e.id);
                          }}
                          className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors group-hover:flex hover:bg-bg-elevated hover:text-error disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{tr("matter.action.delete")}</TooltipContent>
                    </Tooltip>
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
          placeholder={tr("matter.timeline.commentPlaceholder")}
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
            {tr("matter.common.send")}
          </Button>
        </div>
      </div>
    </section>
  );
}
