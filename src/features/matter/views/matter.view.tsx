import { Suspense, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { MatterList, type MatterTab } from "@/features/matter/components/matter-list";
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
 * URL `?id={matterId}` 持久化选中,刷新保留。Space 切换 reset。
 */
export function MatterView() {
  const t = useT();
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const navigate = Route.useNavigate();
  const { id: selectedId, tab: tabFromUrl, q: qFromUrl } = Route.useSearch();
  const [createOpen, setCreateOpen] = useState(false);

  const setSelectedId = (id: string | null) => {
    void navigate({ search: (prev) => ({ ...prev, id: id ?? undefined }) });
  };

  const setTab = (tab: MatterTab | null) => {
    void navigate({ search: (prev) => ({ ...prev, tab: tab ?? undefined }) });
  };

  const setQ = (q: string | null) => {
    void navigate({ search: (prev) => ({ ...prev, q: q ?? undefined }) });
  };

  useResetOnSpaceChange(() => {
    if (selectedId) setSelectedId(null);
    setCreateOpen(false);
  });

  if (!currentSpaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-tertiary">
        {t("matter.state.spaceRequired")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center justify-between px-5">
          <span className="text-base font-semibold text-text-primary">
            {t("matter.menu.title")}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("matter.action.new")}
                onClick={() => setCreateOpen(true)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Plus size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("matter.action.new")}</TooltipContent>
          </Tooltip>
        </header>
        <MatterList
          selectedId={selectedId ?? null}
          onSelect={setSelectedId}
          onTabChange={setTab}
          initialTab={tabFromUrl}
          initialQ={qFromUrl}
          onQChange={setQ}
        />
      </aside>

      {selectedId ? (
        <Suspense
          fallback={
            <section className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              {t("matter.state.loadingDetail")}
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
          {t("matter.state.selectMatterHint")}
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
