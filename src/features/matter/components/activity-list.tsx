import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import {
  AlignLeft,
  CalendarClock,
  CirclePlus,
  Link2,
  PencilLine,
  RefreshCw,
  Type,
  Unlink,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { activitiesInfiniteQueryOptions } from "@/features/matter/queries/matters.query";
import { UserName } from "@/features/matter/components/user-name";
import type { ActivityEntry, MatterAction } from "@/features/matter/types/matter.types";

interface ActivityListProps {
  matterId: string;
}

type ActivityFilter = "all" | MatterAction;

const ACTIONS: MatterAction[] = [
  "created",
  "title_changed",
  "description_changed",
  "status_changed",
  "deadline_changed",
  "assignee_added",
  "assignee_removed",
  "channel_linked",
  "channel_unlinked",
];

/** action label key 映射(对齐后端 model.MatterActivity.action)。 */
const ACTION_LABEL_KEYS: Record<MatterAction, string> = {
  created: "matter.activityAction.created",
  title_changed: "matter.activityAction.titleChanged",
  description_changed: "matter.activityAction.descriptionChanged",
  deadline_changed: "matter.activityAction.deadlineChanged",
  status_changed: "matter.activityAction.statusChanged",
  assignee_added: "matter.activityAction.assigneeAdded",
  assignee_removed: "matter.activityAction.assigneeRemoved",
  channel_linked: "matter.activityAction.channelLinked",
  channel_unlinked: "matter.activityAction.channelUnlinked",
};

function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

function dayLabel(iso: string, t: (key: string) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diff === 0) return t("matter.day.today");
  if (diff === 1) return t("matter.day.yesterday");
  return `${d.getMonth() + 1}/${d.getDate()}`;
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

function actionIcon(action: MatterAction) {
  const className = "h-3.5 w-3.5";
  if (action === "created") return <CirclePlus className={className} />;
  if (action === "title_changed") return <Type className={className} />;
  if (action === "description_changed") return <AlignLeft className={className} />;
  if (action === "deadline_changed") return <CalendarClock className={className} />;
  if (action === "status_changed") return <RefreshCw className={className} />;
  if (action === "assignee_added") return <UserPlus className={className} />;
  if (action === "assignee_removed") return <UserMinus className={className} />;
  if (action === "channel_linked") return <Link2 className={className} />;
  if (action === "channel_unlinked") return <Unlink className={className} />;
  return <PencilLine className={className} />;
}

function actionTone(action: MatterAction): string {
  if (action === "created") return "bg-online/10 text-online";
  if (action === "status_changed") return "bg-brand-tint text-brand";
  if (action === "channel_linked" || action === "channel_unlinked") {
    return "bg-purple-50 text-purple-700";
  }
  if (action === "assignee_added" || action === "assignee_removed") {
    return "bg-blue-50 text-blue-700";
  }
  return "bg-bg-elevated text-text-tertiary";
}

function readText(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function DetailValue({ value }: { value: string | null }) {
  return (
    <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-secondary">
      {value ?? "—"}
    </span>
  );
}

function ActivityDetail({ activity }: { activity: ActivityEntry }) {
  const detail = activity.detail ?? {};
  const summary = readText(detail, "summary");
  const from = readText(detail, "from");
  const to = readText(detail, "to");
  const uid = readText(detail, "uid") ?? readText(detail, "user_id");
  const channelName = readText(detail, "channel_name") ?? readText(detail, "channel_id");

  if (summary) return <span className="text-text-secondary">{summary}</span>;
  if (from || to) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <DetailValue value={from} />
        <span className="text-text-tertiary">→</span>
        <DetailValue value={to} />
      </span>
    );
  }
  if (uid) return <UserName uid={uid} className="text-text-secondary" />;
  if (channelName) return <span className="text-text-secondary">#{channelName}</span>;
  return null;
}

interface ActivityGroup {
  key: string;
  label: string;
  items: ActivityEntry[];
}

function groupActivities(entries: ActivityEntry[], t: (key: string) => string): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();
  for (const entry of entries) {
    const d = new Date(entry.created_at);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const current = groups.get(key) ?? { key, label: dayLabel(entry.created_at, t), items: [] };
    current.items.push(entry);
    groups.set(key, current);
  }
  return Array.from(groups.values());
}

/**
 * 变更记录 / Activity 列表。
 *
 * 增强点：类型过滤、日期分组、按 action 的图标/色彩、from/to diff chip。
 */
export function ActivityList({ matterId }: ActivityListProps) {
  const t = useT();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const query = useInfiniteQuery(activitiesInfiniteQueryOptions(matterId));
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const all = useMemo<ActivityEntry[]>(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const filtered = useMemo(
    () => (filter === "all" ? all : all.filter((a) => a.action === filter)),
    [all, filter],
  );
  const grouped = useMemo(() => groupActivities(filtered, t), [filtered, t]);
  const counts = useMemo(() => {
    const next = new Map<ActivityFilter, number>();
    next.set("all", all.length);
    for (const action of ACTIONS) next.set(action, 0);
    for (const item of all) next.set(item.action, (next.get(item.action) ?? 0) + 1);
    return next;
  }, [all]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useFetchNextOnInView(sentinelRef, !!hasNextPage && !isFetchingNextPage, fetchNextPage);

  if (isLoading) {
    return <p className="px-1 py-2 text-xs text-text-tertiary">{t("matter.activity.loading")}</p>;
  }
  if (error) {
    return <p className="px-1 py-2 text-xs text-error">{t("matter.activity.loadFailed")}</p>;
  }
  if (all.length === 0) {
    return <p className="px-1 py-2 text-xs text-text-tertiary">{t("matter.activity.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterButton
          active={filter === "all"}
          label={t("matter.activity.filter.all")}
          count={counts.get("all") ?? 0}
          onClick={() => setFilter("all")}
        />
        {ACTIONS.filter((action) => (counts.get(action) ?? 0) > 0).map((action) => (
          <FilterButton
            key={action}
            active={filter === action}
            label={t(ACTION_LABEL_KEYS[action])}
            count={counts.get(action) ?? 0}
            onClick={() => setFilter(action)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-2 text-xs text-text-tertiary">{t("matter.activity.filterEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
                <span className="font-medium text-text-secondary">{group.label}</span>
                <span className="h-px flex-1 bg-border-subtle" />
              </div>
              <ul className="flex flex-col gap-1">
                {group.items.map((a) => (
                  <li
                    key={a.id}
                    className="group flex items-start gap-2 rounded-md px-2 py-2 text-[12px] text-text-secondary transition-colors hover:bg-bg-hover"
                  >
                    <ChannelAvatar
                      channel={new Channel(a.actor_id, ChannelTypePerson)}
                      size={22}
                      title={a.actor_id}
                    />
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${actionTone(a.action)}`}
                    >
                      {actionIcon(a.action)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                        <UserName uid={a.actor_id} className="font-medium text-text-primary" />
                        <span className="text-text-tertiary">{t(ACTION_LABEL_KEYS[a.action])}</span>
                        <ActivityDetail activity={a} />
                      </div>
                    </div>
                    <span className="shrink-0 pt-0.5 text-[11px] text-text-tertiary tabular-nums">
                      {formatActivityTime(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-1 shrink-0" aria-hidden />
      {isFetchingNextPage ? (
        <p className="py-1 text-center text-[11px] text-text-tertiary">
          {t("matter.activity.loadingEarlier")}
        </p>
      ) : null}
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}

function FilterButton({ active, label, count, onClick }: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-colors ${
        active
          ? "bg-text-primary text-white"
          : "bg-bg-elevated text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
      }`}
    >
      <span>{label}</span>
      <span className={active ? "text-white/80" : "text-text-tertiary"}>{count}</span>
    </button>
  );
}
