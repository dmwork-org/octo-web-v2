import { Suspense } from "react";
import { useStore } from "@tanstack/react-store";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { MatterList } from "@/features/matter/components/matter-list";
import { QuickAdd } from "@/features/matter/components/quick-add";
import { MatterDetailPanel } from "@/features/matter/components/matter-detail-panel";
import { Route } from "@/routes/_auth.matter";

/**
 * 事项主视图(P3-matter spec §8 路由整合后):
 *
 *   ┌ Sidebar (320)              ┌ Detail (flex-1)
 *   │ Header(事项)              │
 *   │ QuickAdd                   │ MatterDetailPanel (?id 命中)
 *   │ MatterList(tabs + infinite)│   或空状态文案
 *   └                            ┘
 *
 * 选中事项通过 URL `?id={matterId}` 持久化(useSearch + navigate),刷新保留。
 * Space 切换时 useResetOnSpaceChange 清掉 ?id(避免跨 Space 加载 detail 403)。
 * Detail panel 包 Suspense 接管 useSuspenseQuery loading。
 */
export function MatterView() {
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const navigate = Route.useNavigate();
  const { id: selectedId } = Route.useSearch();

  const setSelectedId = (id: string | null) => {
    void navigate({ search: (prev) => ({ ...prev, id: id ?? undefined }) });
  };

  useResetOnSpaceChange(() => {
    if (selectedId) setSelectedId(null);
  });

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
        <header className="flex h-14 shrink-0 items-center border-b border-border-subtle bg-bg-surface px-5">
          <span className="text-base font-semibold text-text-primary">事项</span>
        </header>
        <QuickAdd onCreated={(id) => setSelectedId(id)} />
        <MatterList
          selectedId={selectedId ?? null}
          onSelect={setSelectedId}
          onTabChange={() => setSelectedId(null)}
        />
      </aside>

      {selectedId ? (
        <Suspense
          fallback={
            <section className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              加载详情…
            </section>
          }
        >
          <MatterDetailPanel
            key={selectedId}
            matterId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </Suspense>
      ) : (
        <section className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
          选个事项看看
        </section>
      )}
    </div>
  );
}
