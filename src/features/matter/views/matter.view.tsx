import { Suspense, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { Plus } from "lucide-react";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { MatterList } from "@/features/matter/components/matter-list";
import { QuickAdd } from "@/features/matter/components/quick-add";
import { MatterDetailPanel } from "@/features/matter/components/matter-detail-panel";
import { Route } from "@/routes/_auth.matter";

/**
 * 事项主视图(对齐 P3-matter 设计稿):
 *
 *   ┌ Sidebar (320)              ┌ Detail (flex-1)
 *   │ Header(事项)         + 按钮│
 *   │   ↳ 点击 + 展开 QuickAdd   │ MatterDetailPanel (?id 命中)
 *   │ MatterList(tabs + infinite)│   或空状态文案
 *   └                            ┘
 *
 * + 按钮:展开/收起顶部 QuickAdd 输入框(对齐设计稿 默认隐藏)。Commit 13 接
 * DDL pick 时,可选改为弹完整表单 modal(创建时同时设置 DDL / 受理人)。
 *
 * URL `?id={matterId}` 持久化选中,刷新保留。Space 切换 reset。
 */
export function MatterView() {
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const navigate = Route.useNavigate();
  const { id: selectedId } = Route.useSearch();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const setSelectedId = (id: string | null) => {
    void navigate({ search: (prev) => ({ ...prev, id: id ?? undefined }) });
  };

  useResetOnSpaceChange(() => {
    if (selectedId) setSelectedId(null);
    setQuickAddOpen(false);
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
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-5">
          <span className="text-base font-semibold text-text-primary">事项</span>
          <button
            type="button"
            aria-label="新建事项"
            title="新建事项"
            onClick={() => setQuickAddOpen((v) => !v)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              quickAddOpen
                ? "bg-brand-tint text-brand"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            <Plus size={16} className={quickAddOpen ? "rotate-45" : ""} />
          </button>
        </header>
        {quickAddOpen ? (
          <QuickAdd
            onCreated={(id) => {
              setSelectedId(id);
              setQuickAddOpen(false);
            }}
          />
        ) : null}
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
