import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Pencil } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";
import { MemberChoiceList } from "@/features/base/components/member-select/member-select";
import { toggleMemberSelection } from "@/features/base/components/member-select/member-select-utils";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface ParticipantPickerProps {
  /** 已选 participant uid 列表 */
  value: string[];
  onChange: (uids: string[]) => void;
}

/** modal open 翻转时把 ext selected 同步进 internal pickerSelected */
function useResetPickerOnOpen(
  open: boolean,
  value: string[],
  setSelected: (s: Set<string>) => void,
) {
  useEffect(() => {
    if (open) setSelected(new Set(value));
  }, [open, value, setSelected]);
}

/**
 * 参与者多选(Wave 3c BY_PERSON 模式专用,内嵌于 SummaryCreateModal)。
 *
 * 浮动元素壳层统一规范 Phase C5 — 走 BaseDialog;通常嵌在 ScheduleFormModal 内,
 * 自动 z-dialog-secondary。
 */
export function ParticipantPicker({ value, onChange }: ParticipantPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(value));
  useResetPickerOnOpen(open, value, setSelected);

  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  const candidates = useMemo(
    () => (members ?? []).filter((m) => m.uid !== myUid && m.robot !== 1),
    [members, myUid],
  );

  const valueSet = useMemo(() => new Set(value), [value]);
  const selectedMembers = useMemo(
    () => (members ?? []).filter((m) => valueSet.has(m.uid)),
    [members, valueSet],
  );

  const toggle = (uid: string) => {
    toggleMemberSelection(setSelected, uid);
  };

  const save = () => {
    onChange([...selected]);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-9 w-full items-center gap-2 rounded-md border border-border-default bg-bg-base px-3 py-1.5 text-left text-sm text-text-primary hover:border-brand"
      >
        {value.length === 0 ? (
          <span className="text-text-tertiary">{t("summary.participant.clickPick")}</span>
        ) : (
          <>
            <span className="flex shrink-0 -space-x-1">
              {selectedMembers.slice(0, 4).map((m) => (
                <ChannelAvatar
                  key={m.uid}
                  channel={new Channel(m.uid, ChannelTypePerson)}
                  size={20}
                  title={m.name}
                />
              ))}
              {selectedMembers.length === 0 && value.length > 0
                ? value
                    .slice(0, 4)
                    .map((uid) => (
                      <ChannelAvatar
                        key={uid}
                        channel={new Channel(uid, ChannelTypePerson)}
                        size={20}
                        title={uid}
                      />
                    ))
                : null}
            </span>
            <span className="truncate text-xs text-text-secondary">
              {t("summary.participant.selectedCount", { values: { count: value.length } })}
            </span>
          </>
        )}
        <Pencil size={12} className="ml-auto shrink-0 text-text-tertiary" />
      </button>

      <BaseDialog
        open={open}
        onOpenChange={(next) => !next && setOpen(false)}
        size="md"
        height="md"
        title={t("summary.participant.pickerTitle")}
        contentClassName="overflow-hidden"
        footer={
          <>
            <Button type="tertiary" theme="borderless" onClick={() => setOpen(false)}>
              {t("summary.common.cancel")}
            </Button>
            <Button type="primary" theme="solid" onClick={save}>
              {t("summary.common.confirm")}
            </Button>
          </>
        }
      >
        <div className="shrink-0 px-5 pt-3 pb-2 text-xs text-text-tertiary">
          {t("summary.participant.selectedCount", { values: { count: selected.size } })}
        </div>
        <MemberChoiceList
          items={candidates}
          selectedIds={selected}
          onToggle={toggle}
          empty={
            <div className="px-3 py-4 text-center text-xs text-text-tertiary">
              {t("summary.participant.noSpaceMembers")}
            </div>
          }
        />
      </BaseDialog>
    </>
  );
}
