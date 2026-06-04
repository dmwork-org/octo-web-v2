import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createSpace,
  dismissSpace,
  generateInviteCode,
  joinSpace,
  leaveSpace,
  removeMembers,
  updateMemberRole,
  updateSpace,
  type CreateSpacePayload,
  type SpaceResp,
} from "@/features/base/api/endpoints/space.api";
import { mySpacesQueryKey } from "@/features/base/queries/spaces.query";

/**
 * Space 写操作 mutations(对齐老仓 SpaceService).
 *
 * 所有 mutation 成功后 invalidate `["base","spaces","my"]` 让 SpaceSwitcher / 设置页
 * 自动重渲染;关键 join / leave / dismiss / update 也 invalidate 单个 space 详情 cache。
 */

export const spaceDetailQueryKey = (spaceId: string) =>
  ["base", "spaces", "detail", spaceId] as const;
export const spaceMembersQueryKey = (spaceId: string) =>
  ["base", "spaces", "members", spaceId] as const;

export function useCreateSpaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSpacePayload): Promise<SpaceResp> => createSpace(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mySpacesQueryKey }),
  });
}

export function useJoinSpaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => joinSpace(inviteCode),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mySpacesQueryKey }),
  });
}

export function useUpdateSpaceMutation(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      payload: Partial<Pick<SpaceResp, "name" | "description" | "join_mode" | "logo">>,
    ) => updateSpace(spaceId, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mySpacesQueryKey });
      void qc.invalidateQueries({ queryKey: spaceDetailQueryKey(spaceId) });
    },
  });
}

export function useGenerateInviteCodeMutation(spaceId: string) {
  return useMutation({
    mutationFn: () => generateInviteCode(spaceId),
  });
}

export function useLeaveSpaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: string) => leaveSpace(spaceId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mySpacesQueryKey }),
  });
}

export function useDismissSpaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: string) => dismissSpace(spaceId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mySpacesQueryKey }),
  });
}

export function useUpdateMemberRoleMutation(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { uid: string; role: number }) =>
      updateMemberRole(spaceId, params.uid, params.role),
    onSuccess: () => void qc.invalidateQueries({ queryKey: spaceMembersQueryKey(spaceId) }),
  });
}

export function useRemoveMembersMutation(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uids: string[]) => removeMembers(spaceId, uids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: spaceMembersQueryKey(spaceId) });
      void qc.invalidateQueries({ queryKey: mySpacesQueryKey });
    },
  });
}
