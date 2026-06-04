import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Copy, LogOut, Trash2 } from "lucide-react";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { spaceActions, spaceStore } from "@/features/base/stores/space";
import {
  useDismissSpaceMutation,
  useGenerateInviteCodeMutation,
  useLeaveSpaceMutation,
  useUpdateSpaceMutation,
} from "@/features/space/mutations";
import { SpaceMembersList } from "@/features/space/components/space-members-list";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { Button } from "@/components/semi-bridge/button";

interface SpaceSettingsViewProps {
  spaceId: string;
}

const ROLE_OWNER = 1;

/**
 * Space 设置页(对齐老仓 SpaceSettings):
 *
 * - 编辑表单:名称 / 描述(owner / admin)
 * - 邀请码生成 + 复制(invite_code)
 * - 成员列表(虚拟化 + 角色管理)
 * - 危险区域:离开(普通成员 / admin)+ 解散(owner)
 *
 * 当前 space 详情从 my spaces 列表里取(避免单独 detail endpoint)。
 */
export function SpaceSettingsView({ spaceId }: SpaceSettingsViewProps) {
  const navigate = useNavigate();
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data: spaces } = useQuery(mySpacesQueryOptions());
  const space = useMemo(
    () => (spaces ?? []).find((s) => s.space_id === spaceId),
    [spaces, spaceId],
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const updateMu = useUpdateSpaceMutation(spaceId);
  const inviteMu = useGenerateInviteCodeMutation(spaceId);
  const leaveMu = useLeaveSpaceMutation();
  const dismissMu = useDismissSpaceMutation();

  if (!space) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        空间不存在或无权访问
      </div>
    );
  }

  // 从 spaces 取 role(SpaceResp 上有 role 字段;onMount 反映到本地编辑态)
  const role = space.role ?? 3;
  const canEdit = role === ROLE_OWNER || role === 2;
  // 初始化本地编辑态(避免每次 render 都重置)
  if (name === "" && (space.name ?? "") !== "") {
    setName(space.name);
    setDescription(space.description ?? "");
  }

  const onSave = async () => {
    setInlineError(null);
    try {
      await updateMu.mutateAsync({ name, description });
    } catch (e) {
      setInlineError(extractSafeErrorMessage(e));
    }
  };

  const onGenerate = async () => {
    setInlineError(null);
    try {
      const r = await inviteMu.mutateAsync();
      setInviteCode(r.invite_code);
    } catch (e) {
      setInlineError(extractSafeErrorMessage(e));
    }
  };

  const onCopy = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
    } catch {
      // ignore — clipboard 不可用
    }
  };

  const onLeave = async () => {
    if (!window.confirm(`确认离开「${space.name}」?`)) return;
    setInlineError(null);
    try {
      await leaveMu.mutateAsync(spaceId);
      // 离开的是当前 space → 清当前选择(让 spaceStore 自然回落到下一个)
      if (currentSpaceId === spaceId) {
        const remaining = (spaces ?? []).filter((s) => s.space_id !== spaceId);
        spaceActions.setSpace(remaining[0]?.space_id ?? null);
      }
      void navigate({ href: "/", replace: true });
    } catch (e) {
      setInlineError(extractSafeErrorMessage(e));
    }
  };

  const onDismiss = async () => {
    if (!window.confirm(`确认解散「${space.name}」?此操作不可撤销。`)) return;
    setInlineError(null);
    try {
      await dismissMu.mutateAsync(spaceId);
      if (currentSpaceId === spaceId) {
        const remaining = (spaces ?? []).filter((s) => s.space_id !== spaceId);
        spaceActions.setSpace(remaining[0]?.space_id ?? null);
      }
      void navigate({ href: "/", replace: true });
    } catch (e) {
      setInlineError(extractSafeErrorMessage(e));
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-lg font-semibold text-text-primary">{space.name}</h1>
        <p className="text-xs text-text-tertiary">空间设置</p>
      </header>

      {/* 编辑基本信息 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text-secondary">基本信息</h2>
        <label className="block text-sm text-text-secondary">
          名称
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            disabled={!canEdit}
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary disabled:opacity-60"
          />
        </label>
        <label className="block text-sm text-text-secondary">
          描述
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={2}
            disabled={!canEdit}
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary disabled:opacity-60"
          />
        </label>
        {canEdit ? (
          <div className="flex justify-end">
            <Button
              type="primary"
              theme="solid"
              loading={updateMu.isPending}
              onClick={() => void onSave()}
            >
              保存
            </Button>
          </div>
        ) : null}
      </section>

      {/* 邀请码生成 */}
      {canEdit ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-secondary">邀请码</h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteCode ?? ""}
              placeholder="点击右侧按钮生成"
              className="flex-1 rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            />
            {inviteCode ? (
              <Button onClick={() => void onCopy()}>
                <Copy size={14} />
              </Button>
            ) : null}
            <Button onClick={() => void onGenerate()} loading={inviteMu.isPending}>
              生成
            </Button>
          </div>
        </section>
      ) : null}

      {/* 成员管理 */}
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <h2 className="text-sm font-semibold text-text-secondary">成员</h2>
        <div className="min-h-[320px] flex-1">
          <SpaceMembersList spaceId={spaceId} currentUserRole={role} />
        </div>
      </section>

      {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}

      {/* 危险区域 */}
      <section className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        <h2 className="text-sm font-semibold text-error">危险区域</h2>
        <div className="flex gap-2">
          {role === ROLE_OWNER ? (
            <Button type="danger" onClick={() => void onDismiss()} loading={dismissMu.isPending}>
              <Trash2 size={14} />
              <span className="ml-1">解散空间</span>
            </Button>
          ) : (
            <Button type="danger" onClick={() => void onLeave()} loading={leaveMu.isPending}>
              <LogOut size={14} />
              <span className="ml-1">离开空间</span>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
