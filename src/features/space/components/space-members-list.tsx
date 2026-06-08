import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Virtuoso } from "react-virtuoso";
import { getSpaceMembers, type SpaceMember } from "@/features/base/api/endpoints/space.api";
import {
  spaceMembersQueryKey,
  useRemoveMembersMutation,
  useUpdateMemberRoleMutation,
} from "@/features/space/mutations";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";
import { t as tInst } from "@/lib/i18n/instance";

interface SpaceMembersListProps {
  spaceId: string;
  /** 当前用户在该 space 的角色(1=owner / 2=admin / 3=member);决定能否改角色/移除。 */
  currentUserRole: number;
}

const ROLE_OWNER = 1;
const ROLE_ADMIN = 2;
const ROLE_MEMBER = 3;

function roleLabel(role: number): string {
  if (role === ROLE_OWNER) return tInst("space.members.roleOwner");
  if (role === ROLE_ADMIN) return tInst("space.members.roleAdmin");
  return tInst("space.members.roleMember");
}

/**
 * Space 成员列表(对齐老仓 SpaceMembers):
 *
 * - 分页拉取(默认 page=1 limit=10000 — 大批量时上层应改分页 UI;本期复用搜索的
 *   Virtuoso 虚拟化保证 DOM 节点数稳定)
 * - 每行:头像 + 名字 + 角色 badge + 操作菜单(改角色 / 移除)
 * - **owner 不可被改角色 / 移除**(后端拒,前端隐藏入口)
 * - 只有 owner / admin 能看到操作菜单(currentUserRole < 3 时可写)
 */
export function SpaceMembersList({ spaceId, currentUserRole }: SpaceMembersListProps) {
  const t = useT();
  const { data: members } = useQuery({
    queryKey: spaceMembersQueryKey(spaceId),
    queryFn: () => getSpaceMembers(spaceId, 1, 10000),
    staleTime: 30 * 1000,
  });
  const updateRoleMu = useUpdateMemberRoleMutation(spaceId);
  const removeMu = useRemoveMembersMutation(spaceId);
  const [error, setError] = useState<string | null>(null);

  const list = members ?? [];
  const canWrite = currentUserRole === ROLE_OWNER || currentUserRole === ROLE_ADMIN;

  const onChangeRole = async (m: SpaceMember, role: number) => {
    setError(null);
    try {
      await updateRoleMu.mutateAsync({ uid: m.uid, role });
    } catch (e) {
      setError(e instanceof Error ? e.message : tInst("space.members.changeRoleFailed"));
    }
  };

  const onRemove = async (m: SpaceMember) => {
    setError(null);
    if (!window.confirm(tInst("space.members.confirmRemove", { values: { name: m.name } }))) return;
    try {
      await removeMu.mutateAsync([m.uid]);
    } catch (e) {
      setError(e instanceof Error ? e.message : tInst("space.members.removeFailed"));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="text-xs text-text-tertiary">
        {t("space.members.count", { values: { count: list.length } })}
      </div>
      {error ? <p className="text-xs text-error">{error}</p> : null}
      <div className="flex-1 overflow-hidden rounded border border-border-subtle">
        <Virtuoso
          data={list}
          style={{ height: "100%" }}
          increaseViewportBy={200}
          itemContent={(_idx: number, m: SpaceMember) => (
            <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0">
              {m.avatar ? (
                <img
                  src={m.avatar}
                  alt={m.name}
                  className="h-8 w-8 shrink-0 rounded-full bg-bg-elevated object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs text-text-secondary">
                  {(m.name ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-text-primary">{m.name}</span>
                <span className="text-[11px] text-text-tertiary">
                  {roleLabel(m.role)}
                  {m.robot === 1 ? t("space.members.bot") : ""}
                </span>
              </div>

              {canWrite && m.role !== ROLE_OWNER ? (
                <div className="flex shrink-0 gap-1">
                  {m.role === ROLE_MEMBER ? (
                    <Button onClick={() => void onChangeRole(m, ROLE_ADMIN)}>
                      {t("space.members.setAdmin")}
                    </Button>
                  ) : null}
                  {m.role === ROLE_ADMIN && currentUserRole === ROLE_OWNER ? (
                    <Button onClick={() => void onChangeRole(m, ROLE_MEMBER)}>
                      {t("space.members.unsetAdmin")}
                    </Button>
                  ) : null}
                  <Button onClick={() => void onRemove(m)} type="danger">
                    {t("space.members.remove")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        />
      </div>
    </div>
  );
}
