import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";
import { MemberChoiceList } from "@/features/base/components/member-select/member-select";
import { toggleMemberSelection } from "@/features/base/components/member-select/member-select-utils";
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
  const tr = useT();
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
      if (added) parts.push(t("matter.assignee.added", { values: { count: added } }));
      if (removed) parts.push(t("matter.assignee.removed", { values: { count: removed } }));
      message.success(
        parts.length
          ? t("matter.assignee.changeSummary", { values: { summary: parts.join(" / ") } })
          : t("matter.assignee.noChanges"),
      );
      onClose();
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.common.saveFailed")),
  });

  const toggle = (uid: string) => {
    toggleMemberSelection(setSelected, uid);
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
      title={tr("matter.assignee.pickerTitle")}
      contentClassName="overflow-hidden"
      footer={
        <>
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            {tr("matter.common.cancel")}
          </Button>
          <Button
            htmlType="submit"
            form="assignee-picker-form"
            type="primary"
            theme="solid"
            loading={mu.isPending}
          >
            {tr("matter.action.save")}
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
          {tr("matter.assignee.selectedPeople", { values: { count: selected.size } })}
        </div>
        <MemberChoiceList
          items={candidates}
          selectedIds={selected}
          onToggle={toggle}
          empty={
            <div className="px-3 py-4 text-center text-xs text-text-tertiary">
              {tr("matter.assignee.noSpaceMembers")}
            </div>
          }
        />
      </form>
    </BaseDialog>
  );
}
