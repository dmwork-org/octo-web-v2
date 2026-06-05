import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { X } from "lucide-react";
import {
  listMyBots,
  listSpaceBots,
  type BotCandidate,
} from "@/features/base/api/endpoints/obo.api";
import { useCreateGrantMutation, usePersonaGrantsQuery } from "@/features/persona/mutations";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";

interface CreatePersonaModalProps {
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
 * 新建 AI 分身 modal — 1:1 复刻老仓 PersonaSettings PersonaCreate(v2 octo-web#73):
 *
 * **bot 列表来源**(对齐老仓 vm.tsx::loadMyBots L189-244):
 *   - 并发拉 `/robot/my_bots` + `/robot/space_bots`(单端失败用 [] 兜底,不阻塞)
 *   - **`space_bots` 只取 `creator_uid === myUid` 的**(整个 space 的 bot 都返,过滤别人的
 *     避免误绑定)
 *   - 合并去重(按 uid,my_bots 优先 — 已加好友的元数据更完整)
 *   - **过滤掉已 grant 的 bot**(grants.grantee_bot_uid Set),防止 duplicate POST
 *
 * **交互**:
 * 1. 顶部"选择 Bot"列表
 * 2. 行选中:`border-brand + bg-brand/8`
 * 3. **选中后才展开** prompt textarea + 全宽"创建分身"按钮
 * 4. 提交 → POST /obo/grants(`mode=auto` / `global_enabled=true` / `persona_prompt` /
 *    `space_id`)→ invalidate grants → close
 *
 * **`space_id`**:新仓后端要求 body 显式带(老仓走 X-Space-Id header)。
 */
export function CreatePersonaModal({ open, onClose }: CreatePersonaModalProps) {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  useEscClose(open, onClose);
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

  // bot 列表合并去重 + 过滤(对齐老仓 vm.tsx L222-244)
  const bots = useMemo<BotCandidate[]>(() => {
    if (!open) return [];
    const myList = Array.isArray(myBots) ? myBots : [];
    const spaceList = Array.isArray(spaceBots) ? spaceBots : [];
    // space_bots 只留自己创建的(creator_uid 缺失视为非自己)
    const ownedSpaceBots = myUid
      ? spaceList.filter((b) => b.creator_uid && b.creator_uid === myUid)
      : [];
    // 合并去重(my_bots 优先,元数据更完整)
    const merged = new Map<string, BotCandidate>();
    for (const b of [...myList, ...ownedSpaceBots]) {
      if (!b || !b.uid || merged.has(b.uid)) continue;
      merged.set(b.uid, b);
    }
    // 过滤已 grant
    const grantedUids = new Set(
      (Array.isArray(grants) ? grants : []).map((g) => g.grantee_bot_uid),
    );
    return Array.from(merged.values()).filter((b) => !grantedUids.has(b.uid));
  }, [open, myBots, spaceBots, grants, myUid]);

  if (!open) return null;

  const loading = myLoading || spaceLoading;
  const selectedBot = bots.find((b) => b.uid === selectedUid);

  const onSubmit = async () => {
    if (!selectedUid) return;
    if (!spaceId) {
      setInlineError("请先选择一个空间");
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[70vh] w-[460px] flex-col overflow-hidden rounded-lg border border-border-default bg-bg-base shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">新建分身</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          {loading ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-tertiary">
              加载中…
            </div>
          ) : bots.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm leading-relaxed text-text-tertiary">
              <span>暂无可关联的 Bot</span>
              <span>请先去 AI 广场添加一个 bot</span>
            </div>
          ) : (
            <>
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

              {/* v2:选中后才展开 prompt + 创建按钮(对齐老仓 `.wk-persona-create-form`) */}
              {selectedBot ? (
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-border-default bg-bg-surface p-3">
                  <span className="text-[13px] font-medium text-text-secondary">
                    回复风格 prompt(可选)
                  </span>
                  <textarea
                    value={personaPrompt}
                    onChange={(e) => setPersonaPrompt(e.target.value)}
                    placeholder="设置分身的回复风格,如:用简洁专业的语气回复"
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
                    {createMu.isPending ? "创建中…" : "创建分身"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
