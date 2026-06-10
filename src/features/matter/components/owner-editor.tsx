import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Virtuoso } from "react-virtuoso";
import { toast } from "@/components/semi-bridge/toast";
import { UserName } from "@/features/matter/components/user-name";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { matterDetailQueryKey, mattersQueryKey } from "@/features/matter/queries/matters.query";
import { addAssignee, removeAssignee } from "@/features/matter/api/matter.api";
import type { MatterAssignee } from "@/features/matter/types/matter.types";

interface OwnerEditorProps {
  matterId: string;
  assignees: MatterAssignee[];
  /** 当前用户是否有编辑权限 (creator 或 assignee) */
  canEdit: boolean;
  /** 当前用户是否是 Matter 发起人 (creator 能移除任何人) */
  isCreator: boolean;
}

/** click-outside 关闭下拉 */
function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return ref;
}

/**
 * OwnerEditor — 负责人 inline 下拉编辑器(对齐原始 OwnerEditor)
 *
 * 点击负责人胶囊 → 弹出下拉列表,可勾选/取消勾选。
 * 权限:仅创建人或已有负责人可编辑。
 * 移除权限:creator 能移除任何人,非 creator 只能移除自己。
 */
export function OwnerEditor({ matterId, assignees, canEdit, isCreator }: OwnerEditorProps) {
  const tr = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const ref = useClickOutside(open, () => setOpen(false));

  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  const assignedUids = useMemo(
    () => new Set(assignees.map((a) => a.user_id)),
    [assignees],
  );

  const candidates = useMemo(() => {
    const list: Array<{ uid: string; name: string }> = [];
    const seen = new Set<string>();
    // 当前负责人排最前
    for (const a of assignees) {
      if (seen.has(a.user_id)) continue;
      seen.add(a.user_id);
      list.push({ uid: a.user_id, name: a.user_id });
    }
    // 然后 space 成员
    for (const m of members ?? []) {
      if (seen.has(m.uid) || m.robot === 1) continue;
      seen.add(m.uid);
      list.push({ uid: m.uid, name: m.name || m.uid });
    }
    return list;
  }, [members, assignees]);

  const mu = useMutation({
    mutationFn: async (uid: string) => {
      if (assignedUids.has(uid)) {
        await removeAssignee(matterId, uid);
        return { uid, added: false };
      }
      await addAssignee(matterId, uid);
      return { uid, added: true };
    },
    onSuccess: ({ uid, added }) => {
      void qc.invalidateQueries({ queryKey: matterDetailQueryKey(matterId) });
      void qc.invalidateQueries({
        queryKey: mattersQueryKey(undefined).slice(0, 2),
      });
      toast.success(
        added
          ? t("matter.assignee.added", { values: { count: 1 } })
          : t("matter.assignee.removed", { values: { count: 1 } }),
      );
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.common.saveFailed")),
    onSettled: (_data, _err, uid) => {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    },
  });

  const handleToggle = useCallback(
    (uid: string) => {
      if (pending.has(uid)) return;
      const picked = assignedUids.has(uid);
      // 至少保留 1 位负责人
      if (picked && assignees.length <= 1) return;
      // 不能移除自己
      if (picked && uid === myUid) return;
      // 移除权限:creator 能移除任何人,非 creator 只能移除自己
      if (picked && !isCreator && uid !== myUid) return;

      setPending((prev) => {
        const next = new Set(prev);
        next.add(uid);
        return next;
      });
      mu.mutate(uid);
    },
    [assignedUids, assignees.length, mu, pending, isCreator, myUid],
  );

  const toggleDropdown = () => {
    if (canEdit) setOpen((o) => !o);
  };

  return (
    <div ref={ref} className="relative inline-flex">
      {/* 触发区:展示当前负责人胶囊 */}
      <span className="inline-flex items-center gap-1.5">
        {assignees.slice(0, 2).map((a) => (
          <button
            key={a.user_id}
            type="button"
            onClick={toggleDropdown}
            disabled={!canEdit}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-bg-elevated py-0.5 pr-2 pl-0.5 text-sm text-text-primary transition-opacity hover:opacity-80 disabled:cursor-default disabled:opacity-100"
          >
            <ChannelAvatar
              channel={new Channel(a.user_id, ChannelTypePerson)}
              size={18}
              title={a.user_id}
            />
            <UserName uid={a.user_id} className="text-text-primary" />
          </button>
        ))}
        {assignees.length > 2 && (
          <button
            type="button"
            onClick={toggleDropdown}
            disabled={!canEdit}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-bg-elevated text-xs text-text-tertiary transition-opacity hover:opacity-80 disabled:cursor-default disabled:opacity-100"
          >
            +{assignees.length - 2}
          </button>
        )}
      </span>

      {/* 下拉 */}
      {open && (
        <div className="absolute top-full left-0 z-popover mt-2 min-w-64 rounded-md border border-border-subtle bg-bg-surface shadow-lg">
          {candidates.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-text-tertiary">
              {tr("matter.member.empty")}
            </div>
          ) : (
            <Virtuoso
              style={{ height: 256, width: "100%" }}
              totalCount={candidates.length}
              itemContent={(index) => {
                const c = candidates[index];
                const picked = assignedUids.has(c.uid);
                const isLast = picked && assignees.length <= 1;
                const isLoading = pending.has(c.uid);
                // 不能移除自己
                const isSelf = picked && c.uid === myUid;
                // 移除权限:creator 能移除任何人,非 creator 只能移除自己
                const cannotRemove = picked && !isCreator && c.uid !== myUid;
                const isDisabled = isLast || isLoading || isSelf || cannotRemove;
                return (
                  <button
                    type="button"
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-hover ${
                      picked ? "font-medium text-text-primary" : "text-text-primary"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    disabled={isDisabled}
                    onClick={() => handleToggle(c.uid)}
                    title={cannotRemove ? tr("matter.owner.readonly") : undefined}
                  >
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                      {picked && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <ChannelAvatar
                      channel={new Channel(c.uid, ChannelTypePerson)}
                      size={20}
                      title={c.name}
                    />
                    <span className="truncate">
                      <UserName uid={c.uid} />
                    </span>
                  </button>
                );
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
