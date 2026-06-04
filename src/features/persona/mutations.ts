import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGrant,
  createScope,
  deleteGrant,
  deleteScope,
  listGrants,
  listScopes,
  updateGrant,
  type CreateGrantPayload,
  type CreateScopePayload,
  type OboGrant,
  type OboScope,
  type UpdateGrantPayload,
} from "@/features/base/api/endpoints/obo.api";

/**
 * Persona / AI 分身 hooks(对齐老仓 PersonaSettings/vm.tsx)。
 *
 * **404 降级**:首次 GET /obo/grants 拿 404 → 后端 PR-A 未 merge,UI 显示
 * "功能即将上线"。query retry=0 + 由 view 检 error 决定。
 */

export const personaGrantsQueryKey = ["persona", "grants"] as const;
export const personaScopesQueryKey = (grantId: number) =>
  ["persona", "grants", grantId, "scopes"] as const;

export function usePersonaGrantsQuery() {
  return useQuery({
    queryKey: personaGrantsQueryKey,
    queryFn: (): Promise<OboGrant[]> => listGrants(),
    staleTime: 60 * 1000,
    retry: 0,
  });
}

export function usePersonaScopesQuery(grantId: number) {
  return useQuery({
    queryKey: personaScopesQueryKey(grantId),
    queryFn: (): Promise<OboScope[]> => listScopes(grantId),
    staleTime: 30 * 1000,
    retry: 0,
  });
}

export function useCreateGrantMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateGrantPayload) => createGrant(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: personaGrantsQueryKey }),
  });
}

export function useUpdateGrantMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: number; payload: UpdateGrantPayload }) =>
      updateGrant(params.id, params.payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: personaGrantsQueryKey }),
  });
}

export function useDeleteGrantMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteGrant(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: personaGrantsQueryKey }),
  });
}

export function useCreateScopeMutation(grantId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateScopePayload) => createScope(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: personaScopesQueryKey(grantId) }),
  });
}

export function useDeleteScopeMutation(grantId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteScope(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: personaScopesQueryKey(grantId) }),
  });
}

function is404(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: number }).status;
  return status === 404;
}

/** 检测错误是否是"后端 PR-A 未 merge",由 view 决定显"功能即将上线"。 */
export function isPersonaNotDeployed(err: unknown): boolean {
  return is404(err);
}
