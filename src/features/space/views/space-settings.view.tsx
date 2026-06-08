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
import { useT } from "@/lib/i18n/use-t";
import { t as tInst } from "@/lib/i18n/instance";

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
  const t = useT();
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
        {t("space.settings.notFound")}
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
    if (!window.confirm(tInst("space.settings.confirmLeave", { values: { name: space.name } })))
      return;
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
    if (!window.confirm(tInst("space.settings.confirmDismiss", { values: { name: space.name } })))
      return;
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
        <p className="text-xs text-text-tertiary">{t("space.settings.subtitle")}</p>
      </header>

      {/* 基本信息 */}
      <SectionGroup>
        <InlineEditRow
          title={t("space.settings.nameTitle")}
          value={name}
          placeholder={t("space.settings.unset")}
          canEdit={canEdit}
          cantEditMessage={t("space.settings.cantEditMessage")}
          maxLength={32}
          pending={updateMu.isPending && editing === "name"}
          editing={editing === "name"}
          onEnterEdit={() => setEditing("name")}
          onCancel={() => setEditing(null)}
          onSave={(v) => void onSaveName(v)}
        />
        <InlineEditRow
          title={t("space.settings.descTitle")}
          value={description}
          placeholder={t("space.settings.unset")}
          canEdit={canEdit}
          cantEditMessage={t("space.settings.cantEditMessage")}
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
            title={t("space.settings.inviteTitle")}
            subTitle={inviteCode ?? t("space.settings.inviteClickGenerate")}
            right={
              inviteCode ? (
                <button
                  type="button"
                  onClick={(e) => void onCopy(e)}
                  aria-label={t("space.settings.copyInvite")}
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
        <h2 className="text-xs font-semibold text-text-tertiary">
          {t("space.settings.membersHeader")}
        </h2>
        <div className="min-h-[320px] flex-1">
          <SpaceMembersList spaceId={spaceId} currentUserRole={role} />
        </div>
      </section>

      {inlineError ? <p className="px-4 text-xs text-error">{inlineError}</p> : null}

      {/* 危险区域 */}
      <SectionGroup>
        {role === ROLE_OWNER ? (
          <NavRow
            title={t("space.settings.dismissTitle")}
            danger
            onClick={() => void onDismiss()}
          />
        ) : (
          <NavRow title={t("space.settings.leaveTitle")} danger onClick={() => void onLeave()} />
        )}
      </SectionGroup>
    </div>
  );
}
