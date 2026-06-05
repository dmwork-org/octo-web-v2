import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import {
  isPersonaNotDeployed,
  usePersonaGrantsQuery,
  useUpdateGrantMutation,
} from "@/features/persona/mutations";
import { CreatePersonaModal } from "@/features/persona/components/create-persona-modal";
import { Switch } from "@/features/base/components/section-form/toggle-row";

interface PersonaListModalProps {
  open: boolean;
  onClose: () => void;
}

/** ESC 关闭(stopPropagation 防穿透到底层 modal)。 */
function useEscClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

/**
 * 我的分身二级 modal — 1:1 复刻老仓 PersonaSettings/index.tsx PersonaListBody:
 *
 * **视觉对齐老仓 `.wk-persona-page` + `.wk-persona-card`**:
 * - 顶部全宽"+ 新建分身"按钮(brand 色,圆角 md)
 * - 卡片列表(`gap-3`):
 *   - 卡片:rounded-md + bg-bg-surface + border + hover 上浮 1px
 *   - 头像:40×40 圆角 + brand 背景 + 首字母(`text-[18px] font-semibold text-white`)
 *   - 名字 + "分身" badge(`text-[10px] bg-brand/10 text-brand rounded-sm`)
 *   - 副标题:persona_prompt 或 "未设置回复风格"
 *   - 右侧 Switch(active),stopPropagation 不触发卡片点击
 *   - active 卡片:border-brand + inset shadow(对齐 `.wk-persona-card-active`)
 *   - 任意 active 存在时,非 active 卡片 `opacity-55`(`.wk-persona-card-dimmed`)
 * - **点卡片** → 关本 modal + navigate /personadetail(等价老仓 push PersonaEdit)
 *
 * **空态 / 后端未部署 / 加载失败** 分三段文案(对齐老仓 `.wk-persona-empty/error`)。
 *
 * 删除分身放在 PersonaEdit 整页(/personadetail),这里只做列表 + active toggle + 新建。
 */
export function PersonaListModal({ open, onClose }: PersonaListModalProps) {
  const navigate = useNavigate();
  const { data: grants, isLoading, error, refetch } = usePersonaGrantsQuery();
  const updateMu = useUpdateGrantMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  useEscClose(open && !createOpen, onClose);

  if (!open) return null;

  const list = Array.isArray(grants) ? grants : [];
  const notDeployed = !!(error && isPersonaNotDeployed(error));
  const loadError = !!(error && !isPersonaNotDeployed(error));
  const anyActive = list.some((g) => g.active);

  const onToggleActive = async (id: number, next: boolean) => {
    setBusyId(id);
    try {
      await updateMu.mutateAsync({ id, payload: { active: next } });
    } finally {
      setBusyId(null);
    }
  };

  const onOpenDetail = (id: number) => {
    onClose();
    void navigate({ href: `/personadetail?id=${id}` });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[70vh] w-[460px] flex-col overflow-hidden rounded-lg border border-border-default bg-bg-base shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">我的分身</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto p-3">
          {/* 新建按钮(后端 404 / 加载失败时隐藏,对齐老仓 R4 YUJ-1206) */}
          {!notDeployed && !loadError ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={isLoading}
              className="mb-3 flex w-full cursor-pointer items-center justify-center gap-1 rounded-md bg-brand px-3 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} />
              新建分身
            </button>
          ) : null}

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-tertiary">
              加载中…
            </div>
          ) : notDeployed ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm leading-relaxed text-text-tertiary">
              <span>分身功能即将上线</span>
              <span>敬请期待 ✨</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-text-tertiary">
              <span>加载失败</span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="cursor-pointer text-brand underline hover:opacity-80"
              >
                重新加载
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm leading-relaxed text-text-tertiary">
              <span>还没有创建任何分身</span>
              <span>点击上方「新建分身」开始</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((g) => {
                const busy = busyId === g.id;
                const dimmed = anyActive && !g.active;
                const name = g.grantee_bot_name || g.grantee_bot_uid;
                const initial = (name || "P").charAt(0).toUpperCase();
                const sub =
                  g.persona_prompt && g.persona_prompt.trim() ? g.persona_prompt : "未设置回复风格";
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onOpenDetail(g.id)}
                    className={`flex w-full cursor-pointer flex-col rounded-md border bg-bg-surface p-3 text-left transition-all duration-150 hover:-translate-y-px ${
                      g.active
                        ? "border-brand shadow-[inset_0_0_0_1px_var(--color-brand,_#1c1c23)]"
                        : "border-border-default"
                    } ${dimmed ? "opacity-55 hover:opacity-85" : ""}`}
                  >
                    <div className="flex items-center">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand text-[18px] font-semibold text-white">
                        {initial}
                      </div>
                      <div className="ml-3 flex min-w-0 flex-1 flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-semibold text-text-primary">
                            {name}
                          </span>
                          <span className="shrink-0 rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                            分身
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[13px] text-text-tertiary">{sub}</div>
                      </div>
                      <div
                        className="ml-3 flex shrink-0 items-center"
                        onClick={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <Switch
                          checked={!!g.active}
                          disabled={busy}
                          onChange={(v) => void onToggleActive(g.id, v)}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CreatePersonaModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
