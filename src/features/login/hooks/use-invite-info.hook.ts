import { useQuery } from "@tanstack/react-query";
import { getInviteInfo, type SpaceInviteInfo } from "@/features/base/api/endpoints/space.api";

/**
 * 邀请信息(对齐老仓 LoginVM.inviteInfo + GET /space/invite/{code})。
 *
 * 在 login 页 / register 页顶部显 banner:"邀请你加入 XX 空间(N/Max 人)"。
 * inviteCode 缺失或非法 → query disabled,返 undefined。
 */

export const inviteInfoQueryKey = (inviteCode: string | undefined) =>
  ["base", "spaces", "invite", inviteCode ?? ""] as const;

export function useInviteInfo(inviteCode: string | undefined): {
  data: SpaceInviteInfo | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const valid = !!inviteCode && /^[a-zA-Z0-9_-]+$/.test(inviteCode);
  const { data, isLoading, error } = useQuery({
    queryKey: inviteInfoQueryKey(inviteCode),
    queryFn: () => getInviteInfo(inviteCode!),
    enabled: valid,
    staleTime: 60 * 1000,
    retry: 0,
  });
  return { data, isLoading, error };
}
