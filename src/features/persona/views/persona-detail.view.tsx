import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import {
  isPersonaNotDeployed,
  useDeleteGrantMutation,
  useDeleteScopeMutation,
  usePersonaGrantsQuery,
  usePersonaScopesQuery,
  useUpdateGrantMutation,
} from "@/features/persona/mutations";
// section-form 共享原语
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { NavRow } from "@/features/base/components/section-form/nav-row";
import { Switch } from "@/features/base/components/section-form/toggle-row";

interface PersonaDetailViewProps {
  grantId: number;
}

/** 同步 props.grant → 本地 prompt / active 表单态(grant cache 更新时同步)。 */
function useSyncFormFromGrant(
  grantId: number,
  prompt: string | undefined,
  active: boolean,
  setForm: (next: { prompt: string; active: boolean }) => void,
) {
  useEffect(() => {
    setForm({ prompt: prompt ?? "", active });
  }, [grantId, prompt, active, setForm]);
}

/** 二次确认计时器:5s 内不再点 → 复位。 */
function useConfirmTimer(armed: boolean, reset: () => void, ms = 5000) {
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(reset, ms);
    return () => clearTimeout(id);
  }, [armed, reset, ms]);
}

/**
 * Persona 详情整页 — 1:1 复刻老仓 PersonaSettings/PersonaEdit.tsx 视觉:
 *
 * **Section 1:基础信息 + v2 表单**(对齐老仓 `.wk-persona-edit-section`):
 *   - 关联 Bot(只读)
 *   - 回复风格 prompt(column 布局 textarea)
 *   - 启用此分身(Switch)
 *   - 保存按钮(全宽 brand)
 *   - 模式(只读,新仓 v0 只支持 auto)
 *   - 全局开关(Switch,即时保存)
 *
 * **Section 2:会话列表**(对齐老仓 `.wk-persona-edit-scope-list`):
 *   - 标题"已启用的会话 (N)"(新仓 OboScope 无 enabled 字段,不做分区)
 *   - 每行:"群聊/私聊 · channel_id" + "停止代答"(删除)
 *   - 空态文案"尚未启用任何会话 \n 请去具体会话的「设置 → 分身在此会话代答」开启"
 *
 * **底部"删除分身"**(二次确认 5s 内,对齐老仓 PersonaEdit `handleDelete`):
 *   首次点 → 文案变"再次点击以确认删除" + 5s 后自动复位
 *   二次点 → 真删除 → 跳回 /persona
 */
export function PersonaDetailView({ grantId }: PersonaDetailViewProps) {
  const navigate = useNavigate();
  const { data: grants, error: grantsError } = usePersonaGrantsQuery();
  const {
    data: scopes,
    isLoading: scopesLoading,
    error: scopesError,
  } = usePersonaScopesQuery(grantId);
  const updateMu = useUpdateGrantMutation();
  const deleteGrantMu = useDeleteGrantMutation();
  const deleteScopeMu = useDeleteScopeMutation(grantId);

  const grant = (Array.isArray(grants) ? grants : []).find((g) => g.id === grantId);
  const [form, setForm] = useState({ prompt: "", active: false });
  const [confirmDelete, setConfirmDelete] = useState(false);
  useSyncFormFromGrant(grantId, grant?.persona_prompt, !!grant?.active, setForm);
  useConfirmTimer(confirmDelete, () => setConfirmDelete(false));

  if (grantsError && isPersonaNotDeployed(grantsError)) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-text-tertiary">AI 分身功能即将上线</p>
      </div>
    );
  }
  if (!grant) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm text-text-tertiary">
        <span>分身不存在或已删除</span>
        <button
          type="button"
          onClick={() => void navigate({ href: "/persona" })}
          className="cursor-pointer text-brand underline hover:opacity-80"
        >
          返回列表
        </button>
      </div>
    );
  }

  const botName = grant.grantee_bot_name || grant.grantee_bot_uid;
  const modeLabel = grant.mode === "draft" ? "草稿审批" : "自动回复";
  const scopeList = Array.isArray(scopes) ? scopes : [];
  const scopesNotDeployed = !!(scopesError && isPersonaNotDeployed(scopesError));
  const scopesLoadError = !!(scopesError && !isPersonaNotDeployed(scopesError));

  const onSave = async () => {
    try {
      await updateMu.mutateAsync({
        id: grantId,
        payload: {
          persona_prompt: form.prompt,
          active: form.active,
        },
      });
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const onToggleGlobal = async (v: boolean) => {
    try {
      await updateMu.mutateAsync({ id: grantId, payload: { global_enabled: v } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const onRemoveScope = async (scopeId: number) => {
    try {
      await deleteScopeMu.mutateAsync(scopeId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const onDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      toast.warning("再次点击「删除分身」确认");
      return;
    }
    void deleteGrantMu
      .mutateAsync(grantId)
      .then(() => {
        toast.success("已删除");
        void navigate({ href: "/persona" });
      })
      .catch((e: unknown) => {
        setConfirmDelete(false);
        toast.error(e instanceof Error ? e.message : "删除失败");
      });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-bg-base py-3">
      <header className="flex items-center gap-2 px-4">
        <button
          type="button"
          onClick={() => void navigate({ href: "/persona" })}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          aria-label="返回"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-base font-semibold text-text-primary">{botName}</h1>
        <span className="rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
          分身
        </span>
      </header>

      {/* Section 1:基础信息 + v2 表单 */}
      <SectionGroup>
        <NavRow title="关联 Bot" subTitle={botName} />

        {/* 回复风格 prompt — column 布局 */}
        <div className="flex flex-col gap-2 px-4 py-3">
          <span className="text-[13px] text-text-primary">回复风格 prompt</span>
          <textarea
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            placeholder="设置分身的回复风格,如:用简洁专业的语气回复"
            rows={4}
            className="min-h-20 w-full resize-y rounded-md border border-border-default bg-bg-surface px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
          />
        </div>

        {/* 启用此分身 Switch — 本地态,保存按钮一并提交 */}
        <div className="flex items-center px-4 py-2.5">
          <span className="flex-1 truncate text-[13px] text-text-primary">启用此分身</span>
          <Switch
            checked={form.active}
            disabled={updateMu.isPending}
            onChange={(v) => setForm({ ...form, active: v })}
          />
        </div>

        {/* 保存按钮 */}
        <div className="px-4 py-2.5">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={updateMu.isPending}
            className="w-full cursor-pointer rounded-md bg-brand px-3 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMu.isPending ? "保存中…" : "保存"}
          </button>
        </div>

        <NavRow title="模式" subTitle={modeLabel} />

        {/* 全局开关 — 即时保存(对齐老仓 toggleGlobal) */}
        <div className="flex items-center px-4 py-2.5">
          <span className="flex-1 truncate text-[13px] text-text-primary">全局开关</span>
          <Switch
            checked={!!grant.global_enabled}
            disabled={updateMu.isPending}
            onChange={(v) => void onToggleGlobal(v)}
          />
        </div>
      </SectionGroup>

      {/* Section 2:会话列表(scopes)*/}
      <SectionGroup>
        <div className="flex items-center px-4 py-2.5">
          <span className="flex-1 text-[13px] text-text-primary">
            已启用的会话 ({scopeList.length})
          </span>
        </div>
        {scopesLoading ? (
          <div className="p-4 text-center text-[13px] text-text-tertiary">加载中…</div>
        ) : scopesNotDeployed ? (
          <div className="p-4 text-center text-[13px] text-text-tertiary">分身功能即将上线</div>
        ) : scopesLoadError ? (
          <div className="p-4 text-center text-[13px] text-text-tertiary">加载失败,请稍后再试</div>
        ) : scopeList.length === 0 ? (
          <div className="p-4 text-center text-[13px] leading-relaxed text-text-tertiary">
            尚未启用任何会话
            <br />
            请去具体会话的「设置 → 分身在此会话代答」开启
          </div>
        ) : (
          scopeList.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 border-t border-border-subtle px-4 py-2 first:border-t-0"
            >
              <span className="flex-1 truncate text-[13px] text-text-primary">
                {s.channel_type === 2 ? "群聊" : "私聊"} · {s.channel_id}
              </span>
              <button
                type="button"
                onClick={() => void onRemoveScope(s.id)}
                disabled={deleteScopeMu.isPending}
                className="cursor-pointer text-[13px] text-error hover:opacity-80 disabled:opacity-50"
              >
                停止代答
              </button>
            </div>
          ))
        )}
      </SectionGroup>

      {/* 底部:删除分身(二次确认) */}
      <div className="mx-4 mt-4">
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteGrantMu.isPending}
          className="w-full cursor-pointer rounded-md bg-bg-surface px-3 py-3 text-center text-[14px] font-medium text-error transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {confirmDelete ? "再次点击以确认删除" : "删除分身"}
        </button>
      </div>
    </div>
  );
}
