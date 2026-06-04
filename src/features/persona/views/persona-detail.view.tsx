import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  isPersonaNotDeployed,
  useCreateScopeMutation,
  useDeleteScopeMutation,
  usePersonaScopesQuery,
} from "@/features/persona/mutations";
import { Button } from "@/components/semi-bridge/button";

interface PersonaDetailViewProps {
  grantId: number;
}

/**
 * Persona 详情(对齐老仓 PersonaSettings 详情页):
 *
 * - 列出当前 grant 下的所有 Scope(per-channel 启用)
 * - 加 Scope:输入 channel_id + channel_type → POST /obo/scopes
 * - 删 Scope:DELETE /obo/scopes/{id}
 * - **404 降级**:isPersonaNotDeployed → 显"功能即将上线"
 */
export function PersonaDetailView({ grantId }: PersonaDetailViewProps) {
  const navigate = useNavigate();
  const { data: scopes, isLoading, error } = usePersonaScopesQuery(grantId);
  const createMu = useCreateScopeMutation(grantId);
  const deleteMu = useDeleteScopeMutation(grantId);
  const [channelId, setChannelId] = useState("");
  const [channelType, setChannelType] = useState<number>(2);
  const [inlineError, setInlineError] = useState<string | null>(null);

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
        <p className="text-sm text-text-tertiary">AI 分身功能即将上线</p>
      </div>
    );
  }

  const list = scopes ?? [];

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);
    if (!channelId.trim()) return setInlineError("请输入 channel_id");
    try {
      await createMu.mutateAsync({
        grant_id: grantId,
        channel_id: channelId.trim(),
        channel_type: channelType,
      });
      setChannelId("");
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "添加失败");
    }
  };

  const onDelete = async (id: number) => {
    setInlineError(null);
    try {
      await deleteMu.mutateAsync(id);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void navigate({ href: "/persona" })}
          className="text-text-tertiary hover:text-text-primary"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">分身 Scope #{grantId}</h1>
      </header>

      <form
        onSubmit={onAdd}
        className="flex flex-col gap-2 rounded-md border border-border-subtle p-3"
      >
        <h2 className="text-sm font-semibold text-text-secondary">添加新 Scope</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="channel_id"
            className="flex-1 rounded border border-border-default bg-bg-surface px-2 py-1.5 text-sm text-text-primary"
          />
          <select
            value={channelType}
            onChange={(e) => setChannelType(Number(e.target.value))}
            className="rounded border border-border-default bg-bg-surface px-2 py-1.5 text-sm text-text-primary"
          >
            <option value={1}>私聊</option>
            <option value={2}>群组</option>
            <option value={5}>子区</option>
          </select>
          <Button type="primary" theme="solid" htmlType="submit" loading={createMu.isPending}>
            添加
          </Button>
        </div>
        {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}
      </form>

      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-text-secondary">已配置 ({list.length})</h2>
        {list.length === 0 ? (
          <p className="text-xs text-text-tertiary">未配置 Scope,该分身将不会自动回复任何频道</p>
        ) : (
          list.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded border border-border-subtle px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-text-primary">{s.channel_id}</span>
                <span className="text-[11px] text-text-tertiary">
                  type {s.channel_type}
                  {s.created_at ? ` · ${s.created_at}` : ""}
                </span>
              </div>
              <button
                type="button"
                aria-label="删除"
                onClick={() => void onDelete(s.id)}
                className="text-text-tertiary hover:text-error"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
