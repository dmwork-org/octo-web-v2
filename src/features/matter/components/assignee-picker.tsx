import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { matterDetailQueryKey, mattersQueryKey } from "@/features/matter/queries/matters.query";
import { addAssignee, removeAssignee } from "@/features/matter/api/matter.api";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface AssigneePickerProps {
  open: boolean;
  matterId: string;
  /** 当前 matter 已有受理人 uid 集合(用于预填 + diff) */
  currentAssigneeUids: string[];
  onClose: () => void;
}

/** open 翻转时 reset 选中集合到 current(命名 hook 包 useEffect)。 */
function useResetSelectionOnOpen(
  open: boolean,
  currentUids: string[],
  setSelected: (s: Set<string>) => void,
) {
  useEffect(() => {
    if (open) setSelected(new Set(currentUids));
  }, [open, currentUids, setSelected]);
}

/**
 * Matter 受理人选择器(对应旧 dmworktodo AssigneeEditor + MemberPicker 精简版)。
 *
 * 浮动元素壳层统一规范 Phase C5 — 走 BaseDialog。
 */
export function AssigneePicker({
  open,
  matterId,
  currentAssigneeUids,
  onClose,
}: AssigneePickerProps) {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(currentAssigneeUids));
  useResetSelectionOnOpen(open, currentAssigneeUids, setSelected);

  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  const candidates = useMemo(() => {
    return (members ?? []).filter((m) => m.uid !== myUid && m.robot !== 1);
  }, [members, myUid]);

  const mu = useMutation({
    mutationFn: async () => {
      const current = new Set(currentAssigneeUids);
      const toAdd = [...selected].filter((u) => !current.has(u));
      const toRemove = [...current].filter((u) => !selected.has(u));
      await Promise.all([
        ...toAdd.map((u) => addAssignee(matterId, u)),
        ...toRemove.map((u) => removeAssignee(matterId, u)),
      ]);
      return { added: toAdd.length, removed: toRemove.length };
    },
    onSuccess: ({ added, removed }) => {
      void qc.invalidateQueries({ queryKey: mattersQueryKey(undefined).slice(0, 2) });
      void qc.invalidateQueries({ queryKey: matterDetailQueryKey(matterId) });
      const parts: string[] = [];
      if (added) parts.push(`新增 ${added}`);
      if (removed) parts.push(`移除 ${removed}`);
      toast.success(parts.length ? `已${parts.join(" / ")}人` : "未变更");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
  });

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mu.isPending) return;
    mu.mutate();
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="md"
      height="md"
      title="选择受理人"
      contentClassName="overflow-hidden"
      footer={
        <>
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            取消
          </Button>
          <Button
            htmlType="submit"
            form="assignee-picker-form"
            type="primary"
            theme="solid"
            loading={mu.isPending}
          >
            保存
          </Button>
        </>
      }
    >
      <form
        id="assignee-picker-form"
        onSubmit={onSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 px-5 pt-3 pb-2 text-xs text-text-tertiary">
          已选 {selected.size} 人
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-2">
          {candidates.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-text-tertiary">
              当前 Space 没有可选成员
            </div>
          ) : (
            candidates.map((m) => {
              const checked = selected.has(m.uid);
              const channel = new Channel(m.uid, ChannelTypePerson);
              return (
                <label
                  key={m.uid}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-bg-hover ${
                    checked ? "bg-brand-tint" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(m.uid)}
                    className="shrink-0"
                  />
                  <ChannelAvatar channel={channel} size={32} title={m.name} />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {m.name || m.uid}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </form>
    </BaseDialog>
  );
}
