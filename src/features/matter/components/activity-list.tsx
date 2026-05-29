import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { activitiesInfiniteQueryOptions } from "@/features/matter/queries/matters.query";
import { UserName } from "@/features/matter/components/user-name";
import type { ActivityEntry } from "@/features/matter/types/matter.types";

interface ActivityListProps {
  matterId: string;
}

/**
 * action label 映射(对齐原 dmworktodo MatterDetailPanel/index.tsx:1538-1548)。
 */
const ACTION_LABELS: Record<string, string> = {
  created: "创建了事项",
  title_changed: "更新了标题",
  description_changed: "更新了主要目标",
  deadline_changed: "更新了截止日期",
  status_changed: "切换了状态",
  assignee_added: "添加了负责人",
  assignee_removed: "移除了负责人",
  channel_linked: "关联了群聊",
  channel_unlinked: "取消了群聊关联",
};

function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  const mm = `${d.getMonth() + 1}/${d.getDate()}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm} ${hh}:${mi}`;
}

function describeActivity(a: ActivityEntry): string {
  const label = ACTION_LABELS[a.action] ?? a.action;
  const detail = a.detail ?? {};
  const summary = detail["summary"];
  const from = detail["from"];
  const to = detail["to"];
  if (typeof summary === "string" && summary.trim()) return `${label}: ${summary}`;
  if (typeof from === "string" || typeof to === "string") {
    const fromStr = typeof from === "string" ? from : "—";
    const toStr = typeof to === "string" ? to : "—";
    return `${label}: ${fromStr} → ${toStr}`;
  }
  return label;
}

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
 * 变更记录 / Activity 列表(P3-matter D-4 扩展):
 *
 *   [头像] {actor name} {label}: {detail 摘要}     {time}
 *
 * 字段对齐后端 model.MatterActivity:actor_id / action / detail / created_at
 * (不是 user_id / type / payload)。只读列表,无操作。
 *
 * P3+:diff 渲染(description_changed 显示 added/removed 行 + 颜色),时间分组,
 * activity icon 区分。
 */
export function ActivityList({ matterId }: ActivityListProps) {
  const query = useInfiniteQuery(activitiesInfiniteQueryOptions(matterId));
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const all = useMemo<ActivityEntry[]>(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useFetchNextOnInView(sentinelRef, !!hasNextPage && !isFetchingNextPage, fetchNextPage);

  if (isLoading) {
    return <p className="px-1 py-2 text-xs text-text-tertiary">加载中…</p>;
  }
  if (error) {
    return <p className="px-1 py-2 text-xs text-error">加载失败</p>;
  }
  if (all.length === 0) {
    return <p className="px-1 py-2 text-xs text-text-tertiary">暂无变更记录</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {all.map((a) => (
        <li
          key={a.id}
          className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[12px] text-text-secondary hover:bg-bg-hover"
        >
          <ChannelAvatar
            channel={new Channel(a.actor_id, ChannelTypePerson)}
            size={20}
            title={a.actor_id}
          />
          <div className="min-w-0 flex-1">
            <UserName uid={a.actor_id} className="font-medium text-text-primary" />
            <span className="ml-1 text-text-tertiary">{describeActivity(a)}</span>
          </div>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {formatActivityTime(a.created_at)}
          </span>
        </li>
      ))}
      <div ref={sentinelRef} className="h-1 shrink-0" aria-hidden />
      {isFetchingNextPage ? (
        <p className="py-1 text-center text-[11px] text-text-tertiary">加载更早…</p>
      ) : null}
    </ul>
  );
}
