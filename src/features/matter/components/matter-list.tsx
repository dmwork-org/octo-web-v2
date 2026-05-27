import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChevronDown, ChevronRight } from "lucide-react";
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
 * IntersectionObserver 监听 sentinel 触底加载下一页。订阅在命名 hook 内,符合
 * no-useeffect-in-component 规则。
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
 * Matter 列表(P3-matter spec §6):
 *
 *   [Tabs:我负责 / 我创建 / 全部]    每 tab 末尾计数 = loaded 数
 *   [滚动区]
 *     未归档 segment(open / done)
 *     [▶ 已归档 N]  ← 默认折叠,展开渲染
 *     [sentinel] ← 触底加载下一页
 *
 * 每 tab 一个 useInfiniteQuery,key 含 spaceId + params。切 tab 仅切 active,数据
 * 各自独立缓存。
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
      <nav className="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-surface px-2 py-1">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          const count = isActive ? all.length : null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className={`relative flex-1 rounded-md py-1.5 text-xs font-medium transition-colors duration-150 ease-(--ease-emphasized) ${
                isActive
                  ? "bg-brand-tint text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover"
              }`}
            >
              {t.label}
              {count !== null && count > 0 ? (
                <span className="ml-1 text-text-tertiary">({count})</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
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
            {active.map((m) => (
              <SidebarCard
                key={m.id}
                matter={m}
                selected={m.id === selectedId}
                onClick={() => onSelect(m.id)}
              />
            ))}

            {archived.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setArchivedOpen((v) => !v)}
                  className="mt-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-xs font-medium text-text-tertiary transition-colors hover:bg-bg-hover"
                >
                  {archivedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  已归档 ({archived.length})
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
              </>
            ) : null}

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
