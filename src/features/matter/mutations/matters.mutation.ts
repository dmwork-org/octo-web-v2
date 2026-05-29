import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addAssignee,
  addTimelineEntry,
  createMatter,
  deleteMatter,
  deleteTimelineEntry,
  removeAssignee,
  transitionMatter,
  updateMatter,
} from "@/features/matter/api/matter.api";
import {
  matterDetailQueryKey,
  timelineInfiniteQueryKey,
} from "@/features/matter/queries/matters.query";
import type {
  AddTimelineReq,
  CreateMatterReq,
  MatterDetail,
  MatterStatus,
  UpdateMatterReq,
} from "@/features/matter/types/matter.types";

/**
 * Matter 写操作 mutation 工厂。每个 hook 内部:
 *   - mutationFn 调对应 endpoint
 *   - onSuccess 通过 ["matter", "list"] 模糊 key 失效所有 list query(覆盖
 *     mattersListInfiniteQueryKey 与旧 mattersQueryKey,跨 spaceId / params),
 *     改单条还顺便 setQueryData 更新 detail cache
 *   - onError 留空 — base/api/interceptors/response.ts 的 withErrorToast 已统一兜底
 *
 * 参考 features/chat/components/conversation-list.tsx unfollowMu 双 invalidate
 * 与 clearMessagesMu setQueryData 范式。
 */

const MATTER_LIST_KEY_PREFIX = ["matter", "list"] as const;

export function useCreateMatter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateMatterReq) => createMatter(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MATTER_LIST_KEY_PREFIX });
    },
  });
}

export function useUpdateMatter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { matterId: string; req: UpdateMatterReq }) =>
      updateMatter(args.matterId, args.req),
    onSuccess: (updated, args) => {
      qc.setQueryData<MatterDetail>(matterDetailQueryKey(args.matterId), updated);
      void qc.invalidateQueries({ queryKey: MATTER_LIST_KEY_PREFIX });
    },
  });
}

export function useTransitionMatter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { matterId: string; status: MatterStatus }) =>
      transitionMatter(args.matterId, args.status),
    onSuccess: (updated, args) => {
      qc.setQueryData<MatterDetail>(matterDetailQueryKey(args.matterId), updated);
      void qc.invalidateQueries({ queryKey: MATTER_LIST_KEY_PREFIX });
    },
  });
}

export function useDeleteMatter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matterId: string) => deleteMatter(matterId),
    onSuccess: (_void, matterId) => {
      qc.removeQueries({ queryKey: matterDetailQueryKey(matterId) });
      void qc.invalidateQueries({ queryKey: MATTER_LIST_KEY_PREFIX });
    },
  });
}

export function useAddAssignee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { matterId: string; userId: string }) =>
      addAssignee(args.matterId, args.userId),
    onSuccess: (_void, args) => {
      void qc.invalidateQueries({ queryKey: matterDetailQueryKey(args.matterId) });
      void qc.invalidateQueries({ queryKey: MATTER_LIST_KEY_PREFIX });
    },
  });
}

export function useRemoveAssignee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { matterId: string; userId: string }) =>
      removeAssignee(args.matterId, args.userId),
    onSuccess: (_void, args) => {
      void qc.invalidateQueries({ queryKey: matterDetailQueryKey(args.matterId) });
      void qc.invalidateQueries({ queryKey: MATTER_LIST_KEY_PREFIX });
    },
  });
}

// ─── Timeline mutations ───────────────────────────────────

export function useAddTimelineEntry(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AddTimelineReq) => addTimelineEntry(matterId, req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: timelineInfiniteQueryKey(matterId) });
    },
  });
}

export function useDeleteTimelineEntry(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => deleteTimelineEntry(matterId, entryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: timelineInfiniteQueryKey(matterId) });
    },
  });
}
