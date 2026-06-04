import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Settings, Trash2 } from "lucide-react";
import {
  isPersonaNotDeployed,
  useDeleteGrantMutation,
  usePersonaGrantsQuery,
  useUpdateGrantMutation,
} from "@/features/persona/mutations";
import { CreatePersonaModal } from "@/features/persona/components/create-persona-modal";
import { Button } from "@/components/semi-bridge/button";

/**
 * AI 分身列表(对齐老仓 PersonaSettings 主页):
 *
 * - 卡片列表:bot avatar + name + active toggle(同一用户最多 1 个 active,后端互斥)
 * - 新建按钮 → CreatePersonaModal
 * - 卡片点击 → 详情页(Scope 管理)
 * - 删除 → 二次确认
 * - **404 降级**:isPersonaNotDeployed → 显"功能即将上线"
 */
export function PersonaListView() {
  const navigate = useNavigate();
  const { data: grants, isLoading, error } = usePersonaGrantsQuery();
  const updateMu = useUpdateGrantMutation();
  const deleteMu = useDeleteGrantMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [busyUid, setBusyUid] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        加载中…
      </div>
    );
  }

  if (error && isPersonaNotDeployed(error)) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-text-primary">AI 分身功能即将上线</h2>
          <p className="text-sm text-text-tertiary">敬请期待</p>
        </div>
      </div>
    );
  }

  const list = grants ?? [];

  const onToggleActive = async (id: number, next: boolean) => {
    setBusyUid(id);
    try {
      await updateMu.mutateAsync({ id, payload: { active: next } });
    } finally {
      setBusyUid(null);
    }
  };

  const onDelete = async (id: number, name: string) => {
    if (!window.confirm(`确认删除分身「${name}」?`)) return;
    setBusyUid(id);
    try {
      await deleteMu.mutateAsync(id);
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">AI 分身</h1>
        <Button type="primary" theme="solid" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          <span className="ml-1">新建分身</span>
        </Button>
      </header>

      {list.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
          还没有分身,点击右上角"新建分身"开始
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((g) => {
            const busy = busyUid === g.id;
            return (
              <div
                key={g.id}
                className={`flex items-center gap-3 rounded-md border border-border-subtle p-3 ${
                  g.active ? "" : "opacity-60"
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs text-text-secondary">
                  AI
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-text-primary">
                    Bot {g.grantee_bot_uid}
                  </span>
                  <span className="truncate text-[11px] text-text-tertiary">
                    {g.mode === "auto" ? "自动回复" : "草稿模式"}
                    {g.persona_prompt ? ` · ${g.persona_prompt}` : ""}
                  </span>
                </div>
                <label className="flex shrink-0 items-center gap-1 text-xs text-text-tertiary">
                  <input
                    type="checkbox"
                    checked={g.active}
                    disabled={busy}
                    onChange={(e) => void onToggleActive(g.id, e.target.checked)}
                  />
                  启用
                </label>
                <button
                  type="button"
                  aria-label="管理 Scope"
                  title="管理 Scope"
                  onClick={() => void navigate({ href: `/personadetail?id=${g.id}` })}
                  className="shrink-0 text-text-tertiary hover:text-text-primary"
                >
                  <Settings size={14} />
                </button>
                <button
                  type="button"
                  aria-label="删除"
                  title="删除分身"
                  onClick={() => void onDelete(g.id, String(g.grantee_bot_uid))}
                  disabled={busy}
                  className="shrink-0 text-text-tertiary hover:text-error disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <CreatePersonaModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
