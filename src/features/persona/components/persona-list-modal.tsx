import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import {
  isPersonaNotDeployed,
  usePersonaGrantsQuery,
  useUpdateGrantMutation,
} from "@/features/persona/mutations";
import { CreatePersonaModal } from "@/features/persona/components/create-persona-modal";
import { Switch } from "@/features/base/components/section-form/toggle-row";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useT } from "@/lib/i18n/use-t";

interface PersonaListModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 我的分身二级 modal — 1:1 复刻老仓 PersonaSettings/index.tsx PersonaListBody。
 *
 * 浮动元素壳层统一规范 Phase C5 — 走 BaseDialog;在 me-info-modal 内开,
 * 自动 z-dialog-secondary;内嵌 CreatePersonaModal 自动 z-dialog-tertiary。
 */
export function PersonaListModal({ open, onClose }: PersonaListModalProps) {
  const t = useT();
  const navigate = useNavigate();
  const { data: grants, isLoading, error, refetch } = usePersonaGrantsQuery();
  const updateMu = useUpdateGrantMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

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
    <>
      <BaseDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        size="fit"
        title={t("persona.list.title")}
        className="h-[70vh] w-[460px]"
        contentClassName="p-3"
      >
        {!notDeployed && !loadError ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={isLoading}
            className="mb-3 flex w-full cursor-pointer items-center justify-center gap-1 rounded-md bg-brand px-3 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} />
            {t("persona.list.newBtn")}
          </button>
        ) : null}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-tertiary">
            {t("persona.list.loading")}
          </div>
        ) : notDeployed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm leading-relaxed text-text-tertiary">
            <span>{t("persona.list.comingSoon")}</span>
            <span>{t("persona.list.staytuned")}</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-text-tertiary">
            <span>{t("persona.list.loadFailed")}</span>
            <button
              type="button"
              onClick={() => void refetch()}
              className="cursor-pointer text-brand underline hover:opacity-80"
            >
              {t("persona.list.retry")}
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm leading-relaxed text-text-tertiary">
            <span>{t("persona.list.empty")}</span>
            <span>{t("persona.list.emptyHint")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((g) => {
              const busy = busyId === g.id;
              const dimmed = anyActive && !g.active;
              const name = g.grantee_bot_name || g.grantee_bot_uid;
              const initial = (name || "P").charAt(0).toUpperCase();
              const sub =
                g.persona_prompt && g.persona_prompt.trim()
                  ? g.persona_prompt
                  : t("persona.list.noPromptHint");
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
                          {t("persona.list.badge")}
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
      </BaseDialog>

      <CreatePersonaModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
