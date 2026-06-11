import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { useT } from "@/lib/i18n/use-t";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { activitiesInfiniteQueryOptions } from "@/features/matter/queries/matters.query";
import { UserName } from "@/features/matter/components/user-name";
import type { ActivityEntry, MatterAction } from "@/features/matter/types/matter.types";

interface ActivityListProps {
  matterId: string;
}

type FilterId = "all" | "channel_changed" | MatterAction;

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

const FILTER_OPTIONS: { id: FilterId; labelKey: string }[] = [
  { id: "all", labelKey: "matter.activity.filter.all" },
  { id: "created", labelKey: "matter.activityAction.created" },
  { id: "description_changed", labelKey: "matter.activityAction.descriptionChanged" },
  { id: "deadline_changed", labelKey: "matter.activityAction.deadlineChanged" },
  { id: "status_changed", labelKey: "matter.activityAction.statusChanged" },
  { id: "channel_changed", labelKey: "matter.activityAction.channelChanged" },
];

function applyFilter(activities: ActivityEntry[], filter: FilterId): ActivityEntry[] {
  if (filter === "all") return activities;
  if (filter === "channel_changed") {
    return activities.filter(
      (a) => a.action === "channel_linked" || a.action === "channel_unlinked",
    );
  }
  return activities.filter((a) => a.action === filter);
}

/** 时间格式化: 月/日 时:分(对齐原始 i18n.format.dateTime)。 */
function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

/** 去除 HTML 标签，用于活动记录文本展示 */
function stripHtml(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

/** IntersectionObserver 无限滚动 sentinel hook。 */
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

/** click-outside 关闭 dropdown hook。 */
function useClickOutside(
  ref: React.RefObject<HTMLSpanElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, ref, onClose]);
}

// ─── Activity 行内 SVG 图标 ──

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-[#22c55e]"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 14.667A6.667 6.667 0 108 1.333a6.667 6.667 0 000 13.334zm.667-9.334a.667.667 0 10-1.334 0v2H5.333a.667.667 0 100 1.334h2v2a.667.667 0 101.334 0v-2h2a.667.667 0 100-1.334h-2v-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-[#ef4444]"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 14.667A6.667 6.667 0 108 1.333a6.667 6.667 0 000 13.334zM5.333 7.333a.667.667 0 100 1.334h5.334a.667.667 0 100-1.334H5.333z"
        fill="currentColor"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-icon-muted"
      aria-hidden="true"
    >
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── ActivityContent: diff 渲染(对齐原始) ──

function ActivityContent({ activity }: { activity: ActivityEntry }) {
  const t = useT();
  const detail = activity.detail ?? {};

  switch (activity.action) {
    case "created":
      return (
        <span>
          {t("matter.activity.initial")}{" "}
          {(detail.summary as string) || t("matter.activity.createdMatter")}
        </span>
      );

    case "title_changed":
      return (
        <span className="inline-flex items-center gap-1">
          <span className="text-text-tertiary line-through decoration-[rgba(0,0,0,0.08)]">
            {(detail.from as string) || ""}
          </span>
          <ArrowIcon />
          <span className="text-text-primary font-medium">{(detail.to as string) || ""}</span>
        </span>
      );

    case "description_changed": {
      const added = (detail.added as string[]) || [];
      const removed = (detail.removed as string[]) || [];
      if (added.length === 0 && removed.length === 0) {
        return (
          <span>
            {stripHtml((detail.summary as string) || "") || t("matter.activity.updatedDescription")}
          </span>
        );
      }
      return (
        <div className="flex flex-col gap-0.5">
          {added.map((line, i) => (
            <div key={`add-${i}`} className="inline-flex items-center gap-1 text-sm leading-5">
              <PlusIcon />
              <span className="text-text-primary font-medium">"{stripHtml(line)}"</span>
            </div>
          ))}
          {removed.map((line, i) => (
            <div key={`rm-${i}`} className="inline-flex items-center gap-1 text-sm leading-5">
              <MinusIcon />
              <span className="text-text-tertiary line-through decoration-[rgba(0,0,0,0.08)]">
                "{stripHtml(line)}"
              </span>
            </div>
          ))}
        </div>
      );
    }

    case "deadline_changed": {
      const from = detail.from
        ? formatActivityTime(new Date((detail.from as number) * 1000).toISOString())
        : t("matter.common.none");
      const to = detail.to
        ? formatActivityTime(new Date((detail.to as number) * 1000).toISOString())
        : t("matter.common.none");
      return (
        <span className="inline-flex items-center gap-1">
          <span className="text-text-tertiary line-through decoration-[rgba(0,0,0,0.08)]">
            {from}
          </span>
          <ArrowIcon />
          <span className="text-text-primary font-medium">{to}</span>
        </span>
      );
    }

    case "status_changed":
      return (
        <span className="inline-flex items-center gap-1">
          <span className="text-text-tertiary line-through decoration-[rgba(0,0,0,0.08)]">
            {(detail.from as string) || ""}
          </span>
          <ArrowIcon />
          <span className="text-text-primary font-medium">{(detail.to as string) || ""}</span>
        </span>
      );

    case "assignee_added":
      return (
        <span>
          <UserName uid={(detail.user_id as string) || ""} />
        </span>
      );

    case "assignee_removed":
      return (
        <span>
          <UserName uid={(detail.user_id as string) || ""} />
        </span>
      );

    case "channel_linked":
      return <span>#{(detail.channel_name as string) || (detail.channel_id as string) || ""}</span>;

    case "channel_unlinked":
      return <span>#{(detail.channel_id as string) || ""}</span>;

    default:
      return <span>{activity.action}</span>;
  }
}

// ─── 主组件 ──

/**
 * 变更记录 / Activity 列表。
 *
 * 对齐原始 octo-web ActivityPanel:
 * - 5 列表格(时间 / 类型 / 内容 / 操作人 / 来源)
 * - dropdown 筛选(全部 / 创建 / 描述变更 / DDL 变更 / 状态变更 / 群聊变更)
 * - 时间排序按钮
 * - diff 渲染(旧值删除线 → 新值、描述 +/- 行)
 * - 操作人列:头像 20×20 + UserName
 * - 无限滚动(保留)
 */
export function ActivityList({ matterId }: ActivityListProps) {
  const t = useT();
  const [filter, setFilter] = useState<FilterId>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);
  const filterRef = useRef<HTMLSpanElement>(null);

  const query = useInfiniteQuery(activitiesInfiniteQueryOptions(matterId));
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const all = useMemo<ActivityEntry[]>(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const filtered = useMemo(() => applyFilter(all, filter), [all, filter]);
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return sortNewest ? tb - ta : ta - tb;
      }),
    [filtered, sortNewest],
  );

  // click-outside 关闭 dropdown
  useClickOutside(filterRef, filterOpen, () => setFilterOpen(false));

  const currentFilter = FILTER_OPTIONS.find((o) => o.id === filter) || FILTER_OPTIONS[0];

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
    <div className="flex flex-col gap-4">
      {/* Toolbar: 类型筛选 + 时间排序 */}
      <div className="flex items-center justify-between gap-3">
        <span className="relative inline-flex" ref={filterRef}>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm font-medium leading-5 text-text-primary transition-opacity hover:opacity-80"
            onClick={() => setFilterOpen((o) => !o)}
          >
            <span>
              {t("matter.activity.filter.label", { values: { type: t(currentFilter.labelKey) } })}
            </span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4.29 6.27L8 9.71l3.71-3.42"
                stroke="currentColor"
                strokeOpacity="0.4"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {filterOpen && (
            <div className="absolute top-[calc(100%+4px)] left-0 z-20 w-46 rounded-md border border-border-subtle bg-bg-surface py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]">
              {FILTER_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`flex w-full cursor-pointer items-center gap-2 px-2 text-left text-sm leading-5 transition-colors h-8 ${
                    o.id === filter
                      ? "font-semibold text-text-primary"
                      : "font-normal text-text-primary hover:bg-bg-item-hover"
                  }`}
                  onClick={() => {
                    setFilter(o.id);
                    setFilterOpen(false);
                  }}
                >
                  <span className="inline-flex h-5 w-3 items-center justify-center shrink-0 text-icon-default">
                    {o.id === filter && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  {t(o.labelKey)}
                </button>
              ))}
            </div>
          )}
        </span>

        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm font-medium leading-5 text-text-primary transition-opacity hover:opacity-80"
          onClick={() => setSortNewest((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M7.33333 10.667L4.66667 13.3337L2 10.667M4.66667 13.3337V2.66699"
              stroke="currentColor"
              strokeOpacity={sortNewest ? 1 : 0.4}
              strokeWidth="1.33"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.66602 5.33366L11.3327 2.66699L13.9993 5.33366M11.3327 2.66699V13.3337"
              stroke="currentColor"
              strokeOpacity={sortNewest ? 0.4 : 1}
              strokeWidth="1.33"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("matter.action.timeSort")}
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-tertiary">
          {t("matter.activity.filterEmpty")}
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse table-fixed [&>tbody>tr:last-child>td]:border-b-0">
            <thead>
              <tr>
                <th className="h-8 px-3 bg-bg-elevated text-left text-[12px] font-medium leading-4 text-icon-default border-b border-border-subtle w-24">
                  {t("matter.activity.table.time")}
                </th>
                <th className="h-8 px-3 bg-bg-elevated text-left text-[12px] font-medium leading-4 text-icon-default border-b border-border-subtle w-24">
                  {t("matter.activity.table.type")}
                </th>
                <th className="h-8 px-3 bg-bg-elevated text-left text-[12px] font-medium leading-4 text-icon-default border-b border-border-subtle">
                  {t("matter.activity.table.content")}
                </th>
                <th className="h-8 px-3 bg-bg-elevated text-left text-[12px] font-medium leading-4 text-icon-default border-b border-border-subtle w-36">
                  {t("matter.activity.table.actor")}
                </th>
                <th className="h-8 px-3 bg-bg-elevated text-left text-[12px] font-medium leading-4 text-icon-default border-b border-border-subtle w-40">
                  {t("matter.activity.table.source")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id} className="bg-bg-surface">
                  <td className="p-3 align-top text-sm font-normal leading-5 text-text-primary border-b border-border-subtle tabular-nums">
                    {formatActivityTime(a.created_at)}
                  </td>
                  <td className="p-3 align-top text-sm font-normal leading-5 text-text-primary border-b border-border-subtle">
                    {t(ACTION_LABEL_KEYS[a.action])}
                  </td>
                  <td className="p-3 align-top text-sm font-normal leading-5 text-text-primary border-b border-border-subtle">
                    <ActivityContent activity={a} />
                  </td>
                  <td className="p-3 align-top text-sm font-normal leading-5 text-text-primary border-b border-border-subtle">
                    <span className="inline-flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-full text-sm text-text-primary">
                      <ChannelAvatar
                        channel={new Channel(a.actor_id, ChannelTypePerson)}
                        size={20}
                        title={a.actor_id}
                      />
                      <UserName uid={a.actor_id} />
                    </span>
                  </td>
                  <td className="p-3 align-top border-b border-border-subtle">
                    <span className="text-icon-muted text-sm">-</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
