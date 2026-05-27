import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChevronRight } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { mattersListInfiniteQueryOptions } from "@/features/matter/queries/matters.query";
import { SidebarCard } from "@/features/matter/components/sidebar-card";
import type { Matter, MatterListParams } from "@/features/matter/types/matter.types";

export type MatterTab = "mine" | "created" | "all";

const TABS: { id: MatterTab; label: string }[] = [
  { id: "mine", label: "我负责的" },
  { id: "created", label: "我创建的" },
  { id: "all", label: "全部" },
];

function buildParams(tab: MatterTab, myUid: string): MatterListParams {
  if (tab === "mine") return { assignee_id: myUid };
  if (tab === "created") return { creator_id: myUid };
  return {};
}

interface MatterListProps {
  selectedId: string | null;
  onSelect: (matterId: string) => void;
  /** 切 tab 时通知 view 层清掉 selectedId / URL state。 */
  onTabChange?: (tab: MatterTab) => void;
}

/**
 * IntersectionObserver 监听 sentinel 触底加载。命名 hook 包 useEffect。
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
 * Matter 列表(对齐 P3-matter 设计稿):
 *
 *   ┌─ Tabs(胶囊容器,激活白底)──────────┐
 *   │ [我负责的 N]  我创建的  全部         │
 *   └──────────────────────────────────────┘
 *
 *   ▎未归档
 *     [SidebarCard]
 *     [SidebarCard]
 *
 *   ▎已归档 (N)                            ›
 *     ↑ 默认折叠,点击展开
 *
 *   [sentinel] ← 触底加载下一页
 *
 * 计数贴在激活 tab 标题后(不是括号),与设计稿一致。分段标题左侧 brand 色短竖条。
 */
export function MatterList({ selectedId, onSelect, onTabChange }: MatterListProps) {
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [tab, setTab] = useState<MatterTab>("mine");
  const [archivedOpen, setArchivedOpen] = useState(false);

  const params = useMemo(() => buildParams(tab, myUid), [tab, myUid]);
  const query = useInfiniteQuery(mattersListInfiniteQueryOptions(spaceId, params));
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const all = useMemo<Matter[]>(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const active = all.filter((m) => m.status !== "archived");
  const archived = all.filter((m) => m.status === "archived");

  const sentinelRef = useRef<HTMLDivElement>(null);
  useFetchNextOnInView(sentinelRef, !!hasNextPage && !isFetchingNextPage, fetchNextPage);

  const handleTabChange = (t: MatterTab) => {
    if (t === tab) return;
    setTab(t);
    setArchivedOpen(false);
    onTabChange?.(t);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="mx-3 my-3 flex shrink-0 items-center rounded-full bg-bg-elevated p-1">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          const count = isActive ? all.length : null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className={`flex-1 rounded-full py-1.5 text-sm font-medium transition-all duration-150 ease-(--ease-emphasized) ${
                isActive
                  ? "bg-bg-surface text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {t.label}
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
            加载事项…
          </p>
        ) : error ? (
          <p className="flex flex-1 items-center justify-center text-sm text-error">事项加载失败</p>
        ) : all.length === 0 ? (
          <p className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            暂无事项
          </p>
        ) : (
          <>
            <SegmentLabel text="未归档" />
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
              <SegmentLabel text={`已归档 (${archived.length})`} />
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
              <p className="py-2 text-center text-[11px] text-text-tertiary">加载更多…</p>
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
