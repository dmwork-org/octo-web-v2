import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listMyBots,
  listSpaceBots,
  type BotCandidate,
} from "@/features/base/api/endpoints/obo.api";
import { useCreateGrantMutation } from "@/features/persona/mutations";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { Button } from "@/components/semi-bridge/button";
import { X } from "lucide-react";

interface CreatePersonaModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 新建 AI 分身 modal(对齐老仓 PersonaSettings 新建流程):
 *
 * - 选 Bot:`/robot/my_bots` + `/robot/space_bots` 合并去重
 * - 填回复风格 prompt(可选,v2)
 * - 创建成功 → invalidate grants → close
 */
export function CreatePersonaModal({ open, onClose }: CreatePersonaModalProps) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  const { data: myBots } = useQuery({
    queryKey: ["persona", "bots", "my"],
    queryFn: (): Promise<BotCandidate[]> => listMyBots(),
    enabled: open,
    retry: 0,
  });
  const { data: spaceBots } = useQuery({
    queryKey: ["persona", "bots", "space"],
    queryFn: (): Promise<BotCandidate[]> => listSpaceBots(),
    enabled: open,
    retry: 0,
  });
  const createMu = useCreateGrantMutation();

  // 合并 + 去重(my 优先)
  const bots: BotCandidate[] = [];
  const seen = new Set<string>();
  for (const b of [...(myBots ?? []), ...(spaceBots ?? [])]) {
    if (!seen.has(b.uid)) {
      seen.add(b.uid);
      bots.push(b);
    }
  }

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);
    if (!selectedUid) return setInlineError("请选择 Bot");
    try {
      await createMu.mutateAsync({
        grantee_bot_uid: selectedUid,
        mode: "auto",
        global_enabled: true,
        persona_prompt: personaPrompt.trim() || undefined,
      });
      setSelectedUid(null);
      setPersonaPrompt("");
      onClose();
    } catch (err) {
      setInlineError(extractSafeErrorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="flex w-[420px] flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-6 shadow-xl"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">新建 AI 分身</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-secondary">选择 Bot</span>
          <div className="flex max-h-64 flex-col overflow-y-auto rounded border border-border-subtle">
            {bots.length === 0 ? (
              <div className="p-4 text-center text-xs text-text-tertiary">暂无可用 Bot</div>
            ) : (
              bots.map((b) => (
                <button
                  key={b.uid}
                  type="button"
                  onClick={() => setSelectedUid(b.uid)}
                  className={`flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-hover ${
                    selectedUid === b.uid ? "bg-brand-tint" : ""
                  }`}
                >
                  {b.avatar ? (
                    <img
                      src={b.avatar}
                      alt={b.name}
                      className="h-8 w-8 rounded-full bg-bg-elevated object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-elevated text-xs text-text-secondary">
                      {(b.name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-text-primary">{b.name}</span>
                    {b.description ? (
                      <span className="truncate text-[11px] text-text-tertiary">
                        {b.description}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <label className="block text-sm text-text-secondary">
          回复风格 prompt(可选)
          <textarea
            value={personaPrompt}
            onChange={(e) => setPersonaPrompt(e.target.value)}
            rows={3}
            placeholder="例如:简洁专业,带表情符号"
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-sm text-text-primary"
          />
        </label>

        {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button
            htmlType="submit"
            type="primary"
            theme="solid"
            loading={createMu.isPending}
            disabled={!selectedUid}
          >
            创建
          </Button>
        </div>
      </form>
    </div>
  );
}
