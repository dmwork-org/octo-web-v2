import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChevronRight } from "lucide-react";
import type { Channel } from "wukongimjssdk";
import { useT } from "@/lib/i18n/use-t";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { mattersListInfiniteQueryOptions } from "@/features/matter/queries/matters.query";
import { SidebarCard } from "@/features/matter/components/sidebar-card";
import type { Matter, MatterListParams } from "@/features/matter/types/matter.types";

export type MatterTab = "mine" | "created" | "all";

const TAB_KEYS: { id: MatterTab; key: string }[] = [
  { id: "mine", key: "matter.tabs.mine" },
  { id: "created", key: "matter.tabs.created" },
  { id: "all", key: "matter.tabs.all" },
];

interface MatterListProps {
  selectedId: string | null;
  onSelect: (matterId: string) => void;
  /** 切 tab 时通知 view 层清掉 selectedId / URL state。 */
  onTabChange?: (tab: MatterTab) => void;
  /**
   * 群聊 chat header matter panel 触发时传入:
   * - API 一次性按 channel_id 过滤(对齐旧 useMatterList { channel_id: channelId })
   * - 默认 tab="all"(老仓默认)
   * - 切 tab 走**本地 filter**(已拿 matters 不重新 API,对齐老仓 displayMatters 逻辑)
   *
   * 不传时 — matter.view + 按钮场景:每个 tab 各自 API 拉,默认 "mine"。
   */
  channel?: Channel;
}

/** IntersectionObserver 监听 sentinel 触底加载(命名 hook 包 useEffect)。 */
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

/** 对齐旧 ChatMatterPanel.displayMatters:在已拉 matters 上按 tab + myUid 二次过滤。 */
function filterByTab(all: Matter[], tab: MatterTab, myUid: string): Matter[] {
  if (tab === "all") return all;
  if (tab === "mine") return all.filter((m) => m.assignees?.some((a) => a.user_id === myUid));
  return all.filter((m) => m.creator_id === myUid);
}

/**
 * Matter 列表(对齐 P3-matter 设计稿):
 *
 *   ┌─ Tabs(胶囊容器,激活白底)──────────┐
 *   │ [我负责的 N]  我创建的  全部         │
 *   └──────────────────────────────────────┘
 *
 *   ▎未归档
 *     [SidebarCard]
 *
 *   ▎已归档 (N)                            ›
 *     ↑ 默认折叠,点击展开
 *
 *   [sentinel] ← 触底加载下一页
 *
 * **两种模式**:
 * - matter.view 模式(channel 未传):每 tab 各自 API + 默认 tab=mine
 * - chat panel 模式(channel 传入):一次按 channel_id 拉全 + 默认 tab=all,
 *   切 tab 走本地 filter(对齐旧 ChatMatterPanel.displayMatters)
 */
export function MatterList({ selectedId, onSelect, onTabChange, channel }: MatterListProps) {
  const t = useT();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const isChannelMode = !!channel;
  const [tab, setTab] = useState<MatterTab>(isChannelMode ? "all" : "mine");
  const [archivedOpen, setArchivedOpen] = useState(false);

  // params:channel 模式 → 一次性按 channel_id 拉;非 channel 模式 → 跟 tab 切换
  const params = useMemo<MatterListParams>(() => {
    if (isChannelMode) return { channel_id: channel.channelID };
    if (tab === "mine") return { assignee_id: myUid };
    if (tab === "created") return { creator_id: myUid };
    return {};
  }, [isChannelMode, channel, tab, myUid]);

  const query = useInfiniteQuery(mattersListInfiniteQueryOptions(spaceId, params));
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const all = useMemo<Matter[]>(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  // channel 模式:已拿 matters 本地按 tab 二次过滤;非 channel 模式:API 已按 tab 过滤,all 即结果
  const filtered = useMemo<Matter[]>(
    () => (isChannelMode ? filterByTab(all, tab, myUid) : all),
    [isChannelMode, all, tab, myUid],
  );
  const active = filtered.filter((m) => m.status !== "archived");
  const archived = filtered.filter((m) => m.status === "archived");

  const sentinelRef = useRef<HTMLDivElement>(null);
  useFetchNextOnInView(sentinelRef, !!hasNextPage && !isFetchingNextPage, fetchNextPage);

  const handleTabChange = (tb: MatterTab) => {
    if (tb === tab) return;
    setTab(tb);
    setArchivedOpen(false);
    onTabChange?.(tb);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="mx-3 my-3 flex shrink-0 items-center rounded-full bg-bg-elevated p-1">
        {TAB_KEYS.map((tk) => {
          const isActive = tab === tk.id;
          // count:激活 tab 显示该 tab 命中数(channel 模式按本地 filter;非 channel 模式直接 all.length)
          const count = isActive ? (isChannelMode ? filtered.length : all.length) : null;
          return (
            <button
              key={tk.id}
              type="button"
              onClick={() => handleTabChange(tk.id)}
              className={`flex-1 rounded-full py-1.5 text-sm font-medium transition-all duration-150 ease-(--ease-emphasized) ${
                isActive
                  ? "bg-bg-surface text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {t(tk.key)}
              {count !== null && count > 0 ? (
                <span className="ml-1 font-semibold">{count}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {isLoading ? (
          <p className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {t("matter.list.loading")}
          </p>
        ) : error ? (
          <p className="flex flex-1 items-center justify-center text-sm text-error">
            {t("matter.list.loadFailed")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {t("matter.state.empty")}
          </p>
        ) : (
          <>
            <SegmentLabel text={t("matter.sidebar.unarchived")} />
            {active.map((m) => (
              <SidebarCard
                key={m.id}
                matter={m}
                selected={m.id === selectedId}
                onClick={() => onSelect(m.id)}
              />
            ))}

            <button
              type="button"
              onClick={() => setArchivedOpen((v) => !v)}
              className="mt-2 flex items-center justify-between rounded-md px-1 py-1.5 text-left transition-colors hover:bg-bg-hover"
            >
              <SegmentLabel
                text={t("matter.sidebar.archivedWithCount", { values: { count: archived.length } })}
              />
              <ChevronRight
                size={14}
                className={`text-text-tertiary transition-transform ${archivedOpen ? "rotate-90" : ""}`}
              />
            </button>
            {archivedOpen
              ? archived.map((m) => (
                  <SidebarCard
                    key={m.id}
                    matter={m}
                    selected={m.id === selectedId}
                    onClick={() => onSelect(m.id)}
                  />
                ))
              : null}

            <div ref={sentinelRef} className="h-4 shrink-0" aria-hidden />
            {isFetchingNextPage ? (
              <p className="py-2 text-center text-[11px] text-text-tertiary">
                {t("matter.list.loadingMore")}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** 列表分段标题:左侧 brand 色短竖条 + 文字。 */
function SegmentLabel({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-text-secondary">
      <span className="h-3 w-0.5 rounded-full bg-brand" />
      {text}
    </span>
  );
}
