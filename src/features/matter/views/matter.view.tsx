import { Suspense, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { Plus } from "lucide-react";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { MatterList } from "@/features/matter/components/matter-list";
import { CreateMatterModal } from "@/features/matter/components/create-matter-modal";
import { MatterDetailPanel } from "@/features/matter/components/matter-detail-panel";
import { Route } from "@/routes/_auth.matter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * 事项主视图(对齐 P3-matter 设计稿 + 原 dmworktodo 创建交互):
 *
 *   ┌ Sidebar (320)              ┌ Detail (flex-1)
 *   │ Header(事项)         + 按钮│
 *   │   ↳ 点击 + 弹 CreateMatterModal(完整表单)
 *   │ MatterList(tabs + infinite)│ MatterDetailPanel (?id 命中)
 *   │                            │   或空状态文案
 *   └                            ┘
 *
 * + 按钮弹 CreateMatterModal — 对齐原项目 CreateTaskModal(title / 主要目标 /
 * 受理人 / DDL 完整表单)。spec.md §UI 文字描述的"QuickAdd 单行输入"在设计稿
 * 与原项目对齐后改为弹窗形式(详见 decisions.md D-4)。
 *
 * URL `?id={matterId}` 持久化选中,刷新保留。Space 切换 reset。
 */
export function MatterView() {
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const navigate = Route.useNavigate();
  const { id: selectedId } = Route.useSearch();
  const [createOpen, setCreateOpen] = useState(false);

  const setSelectedId = (id: string | null) => {
    void navigate({ search: (prev) => ({ ...prev, id: id ?? undefined }) });
  };

  useResetOnSpaceChange(() => {
    if (selectedId) setSelectedId(null);
    setCreateOpen(false);
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="新建事项"
                onClick={() => setCreateOpen(true)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Plus size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>新建事项</TooltipContent>
          </Tooltip>
        </header>
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

      <CreateMatterModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(matter) => {
          setCreateOpen(false);
          setSelectedId(matter.id);
        }}
      />
    </div>
  );
}
