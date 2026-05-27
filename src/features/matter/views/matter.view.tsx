import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Plus } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { mattersQueryOptions } from "@/features/matter/queries/matters.query";
import { MatterDetail } from "@/features/matter/components/matter-detail";
import { MatterCreateModal } from "@/features/matter/components/matter-create-modal";
import { SidebarCard } from "@/features/matter/components/sidebar-card";
import type { MatterListParams } from "@/features/matter/types/matter.types";

type MatterTab = "mine" | "created" | "all";

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

/**
 * 事项主视图(对应旧 dmworktodo TodoPage 精简):
 *
 *   ┌ 中列 (320)                ┌ 右列 (flex-1)
 *   │ Header(事项 + 新建按钮)  │
 *   │ Tabs: 我负责/我创建/全部 │ MatterDetail
 *   │ 列表(SidebarCard)        │ (matterId 来源 state)
 *   └                            ┘
 *
 * Space 切换:useResetOnSpaceChange 清掉 selectedId / createOpen — 旧 matter 不属于
 * 新 Space,继续打开会触发 detail/delete 跨 Space 403。tab 不动(用户偏好)。
 *
 * Commit 6/8 会把列表替换为 MatterList(infinite + tabs + 归档折叠 + URL state)。
 */
export function MatterView() {
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const [tab, setTab] = useState<MatterTab>("mine");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useResetOnSpaceChange(() => {
    setSelectedId(null);
    setCreateOpen(false);
  });

  const params = useMemo(() => buildParams(tab, myUid), [tab, myUid]);
  const { data, isLoading, error } = useQuery({
    ...mattersQueryOptions(params),
    enabled: !!myUid,
  });

  const list = data?.data ?? [];

  if (!currentSpaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-tertiary">
        先在顶部切换到一个 Space,才能加载事项
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-5">
          <span className="text-base font-semibold text-text-primary">事项</span>
          <button
            type="button"
            aria-label="新建事项"
            title="新建事项"
            onClick={() => setCreateOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Plus size={16} />
          </button>
        </header>

        <nav className="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-surface px-2 py-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative flex-1 rounded-md py-1.5 text-xs font-medium transition-colors duration-150 ease-(--ease-emphasized) ${
                tab === t.id
                  ? "bg-brand-tint text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              加载事项…
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center text-sm text-error">
              事项加载失败
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              暂无事项
            </div>
          ) : (
            list.map((m) => (
              <SidebarCard
                key={m.id}
                matter={m}
                selected={m.id === selectedId}
                onClick={() => setSelectedId(m.id)}
              />
            ))
          )}
        </div>
      </aside>

      <MatterDetail matterId={selectedId} onDeleted={() => setSelectedId(null)} />

      <MatterCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          setSelectedId(id);
        }}
      />
    </div>
  );
}
