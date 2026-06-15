import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import {
  listMyBots,
  listSpaceBots,
  type BotCandidate,
} from "@/features/base/api/endpoints/obo.api";
import { useCreateGrantMutation, usePersonaGrantsQuery } from "@/features/persona/mutations";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { buildPersonaBotCandidates } from "@/features/persona/lib/bot-candidates";
import { useT } from "@/lib/i18n/use-t";
import { t as tInst } from "@/lib/i18n/instance";

interface CreatePersonaModalProps {
  open: boolean;
  onClose: () => void;
}

/** open 翻转时 reset 表单。 */
function useResetOnClose(
  open: boolean,
  setSelected: (uid: string | null) => void,
  setPrompt: (s: string) => void,
  setErr: (s: string | null) => void,
) {
  useEffect(() => {
    if (!open) {
      setSelected(null);
      setPrompt("");
      setErr(null);
    }
  }, [open, setSelected, setPrompt, setErr]);
}

/**
 * 新建 AI 分身 modal — 1:1 复刻老仓 PersonaSettings PersonaCreate(v2 octo-web#73)。
 *
 * 浮动元素壳层统一规范 Phase C5 — 走 BaseDialog;在 PersonaListModal 内开,
 * 自动 z-dialog-tertiary(persona-list 是 secondary,本 modal 是 tertiary)。
 *
 * bot 列表来源、过滤、提交逻辑保留,仅改外壳。
 */
export function CreatePersonaModal({ open, onClose }: CreatePersonaModalProps) {
  const t = useT();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  useResetOnClose(open, setSelectedUid, setPersonaPrompt, setInlineError);

  const { data: myBots, isLoading: myLoading } = useQuery({
    queryKey: ["persona", "bots", "my", spaceId ?? "_"],
    queryFn: (): Promise<BotCandidate[]> => listMyBots(spaceId ?? undefined),
    enabled: open,
    retry: 0,
  });
  const { data: spaceBots, isLoading: spaceLoading } = useQuery({
    queryKey: ["persona", "bots", "space", spaceId ?? "_"],
    queryFn: (): Promise<BotCandidate[]> => listSpaceBots(spaceId!),
    enabled: open && !!spaceId,
    retry: 0,
  });
  const { data: grants } = usePersonaGrantsQuery();
  const createMu = useCreateGrantMutation();

  const bots = useMemo<BotCandidate[]>(() => {
    return buildPersonaBotCandidates({ open, myBots, spaceBots, grants, myUid });
  }, [open, myBots, spaceBots, grants, myUid]);

  const loading = myLoading || spaceLoading;
  const selectedBot = bots.find((b) => b.uid === selectedUid);

  const onSubmit = async () => {
    if (!selectedUid) return;
    if (!spaceId) {
      setInlineError(tInst("persona.create.requireSpace"));
      return;
    }
    setInlineError(null);
    try {
      await createMu.mutateAsync({
        grantee_bot_uid: selectedUid,
        mode: "auto",
        global_enabled: true,
        persona_prompt: personaPrompt.trim() || undefined,
        space_id: spaceId,
      });
      onClose();
    } catch (err) {
      setInlineError(extractSafeErrorMessage(err));
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="fit"
      title={t("persona.create.title")}
      className="h-[70vh] w-[460px]"
      contentClassName="p-3"
    >
      {loading ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-tertiary">
          {t("persona.create.loading")}
        </div>
      ) : bots.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm leading-relaxed text-text-tertiary">
          <span>{t("persona.create.noBots")}</span>
          <span>{t("persona.create.noBotsHint")}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bots.map((b) => {
            const active = b.uid === selectedUid;
            return (
              <button
                key={b.uid}
                type="button"
                onClick={() => setSelectedUid(b.uid)}
                className={`flex w-full cursor-pointer flex-col rounded-md border p-3 text-left transition-colors ${
                  active
                    ? "border-brand bg-brand/8"
                    : "border-border-default bg-bg-surface hover:border-brand"
                }`}
              >
                <span className="truncate text-[14px] font-medium text-text-primary">
                  {b.name || b.uid}
                </span>
                <span className="mt-0.5 truncate text-[12px] text-text-tertiary">{b.uid}</span>
              </button>
            );
          })}

          {selectedBot ? (
            <div className="mt-2 flex flex-col gap-2 rounded-md border border-border-default bg-bg-surface p-3">
              <span className="text-[13px] font-medium text-text-secondary">
                {t("persona.create.replyStyleLabel")}
              </span>
              <textarea
                value={personaPrompt}
                onChange={(e) => setPersonaPrompt(e.target.value)}
                placeholder={t("persona.create.replyStylePlaceholder")}
                rows={4}
                className="min-h-20 w-full resize-y rounded-md border border-border-default bg-bg-base px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
              />
              {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}
              <button
                type="button"
                onClick={() => void onSubmit()}
                disabled={createMu.isPending}
                className="mt-1 w-full cursor-pointer rounded-md bg-brand px-3 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMu.isPending ? t("persona.create.creating") : t("persona.create.submitBtn")}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </BaseDialog>
  );
}
