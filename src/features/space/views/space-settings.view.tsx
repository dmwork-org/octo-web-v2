import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Copy } from "lucide-react";
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
// section-form 共享原语(Phase D)
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { NavRow } from "@/features/base/components/section-form/nav-row";
import { InlineEditRow } from "@/features/base/components/section-form/inline-edit-row";

interface SpaceSettingsViewProps {
  spaceId: string;
}

const ROLE_OWNER = 1;
const ROLE_ADMIN = 2;

/**
 * Space 设置页(对齐老仓 SpaceSettings):
 *
 * - 基本信息:名称 / 描述(InlineEditRow 行内编辑,owner / admin 可编)
 * - 邀请码:NavRow(右侧显当前 code,点击生成新的;有 code 时显复制按钮)
 * - 成员列表(虚拟化 + 角色管理)
 * - 危险区域:离开(普通成员 / admin)+ 解散(owner)
 *
 * 当前 space 详情从 my spaces 列表里取(避免单独 detail endpoint)。
 *
 * **Phase D 改造**:删 name/description 本地 state + 显式保存按钮 + label/input 散布局,
 * 改用 SectionGroup + InlineEditRow + NavRow(行内编辑 / 一行一字段 / 整行可点)。
 */
export function SpaceSettingsView({ spaceId }: SpaceSettingsViewProps) {
  const navigate = useNavigate();
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data: spaces } = useQuery(mySpacesQueryOptions());
  const space = useMemo(
    () => (spaces ?? []).find((s) => s.space_id === spaceId),
    [spaces, spaceId],
  );

  const [editing, setEditing] = useState<"name" | "description" | null>(null);
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

  const role = space.role ?? 3;
  const canEdit = role === ROLE_OWNER || role === ROLE_ADMIN;
  const name = space.name ?? "";
  const description = space.description ?? "";

  const onSaveName = async (next: string) => {
    setInlineError(null);
    try {
      await updateMu.mutateAsync({ name: next });
      setEditing(null);
    } catch (e) {
      setInlineError(extractSafeErrorMessage(e));
    }
  };

  const onSaveDescription = async (next: string) => {
    setInlineError(null);
    try {
      await updateMu.mutateAsync({ description: next });
      setEditing(null);
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

  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
    <div className="flex h-full flex-col gap-3 overflow-y-auto py-4">
      <header className="px-4">
        <h1 className="text-lg font-semibold text-text-primary">{space.name}</h1>
        <p className="text-xs text-text-tertiary">空间设置</p>
      </header>

      {/* 基本信息 */}
      <SectionGroup>
        <InlineEditRow
          title="名称"
          value={name}
          placeholder="未设置"
          canEdit={canEdit}
          cantEditMessage="只有空间所有者 / 管理员可编辑"
          maxLength={32}
          pending={updateMu.isPending && editing === "name"}
          editing={editing === "name"}
          onEnterEdit={() => setEditing("name")}
          onCancel={() => setEditing(null)}
          onSave={(v) => void onSaveName(v)}
        />
        <InlineEditRow
          title="描述"
          value={description}
          placeholder="未设置"
          canEdit={canEdit}
          cantEditMessage="只有空间所有者 / 管理员可编辑"
          multiline
          maxLength={200}
          pending={updateMu.isPending && editing === "description"}
          editing={editing === "description"}
          onEnterEdit={() => setEditing("description")}
          onCancel={() => setEditing(null)}
          onSave={(v) => void onSaveDescription(v)}
        />
      </SectionGroup>

      {/* 邀请码 */}
      {canEdit ? (
        <SectionGroup>
          <NavRow
            title="邀请码"
            subTitle={inviteCode ?? "点击生成"}
            right={
              inviteCode ? (
                <button
                  type="button"
                  onClick={(e) => void onCopy(e)}
                  aria-label="复制邀请码"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                >
                  <Copy size={14} />
                </button>
              ) : null
            }
            onClick={() => void onGenerate()}
          />
        </SectionGroup>
      ) : null}

      {/* 成员管理 — 保留原结构(虚拟化列表需要的样式约束多,不适合塞 NavRow 行) */}
      <section className="flex min-h-0 flex-1 flex-col gap-2 px-4">
        <h2 className="text-xs font-semibold text-text-tertiary">成员</h2>
        <div className="min-h-[320px] flex-1">
          <SpaceMembersList spaceId={spaceId} currentUserRole={role} />
        </div>
      </section>

      {inlineError ? <p className="px-4 text-xs text-error">{inlineError}</p> : null}

      {/* 危险区域 */}
      <SectionGroup>
        {role === ROLE_OWNER ? (
          <NavRow title="解散空间" danger onClick={() => void onDismiss()} />
        ) : (
          <NavRow title="离开空间" danger onClick={() => void onLeave()} />
        )}
      </SectionGroup>
    </div>
  );
}
