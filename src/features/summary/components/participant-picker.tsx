import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Pencil, Search } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";
import {
  SelectableMemberRow,
  SelectedMemberRow,
  SelectedPreviewPane,
} from "@/features/base/components/member-select/member-select";
import {
  filterMembersByKeyword,
  toggleMemberSelection,
} from "@/features/base/components/member-select/member-select-utils";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface ParticipantPickerProps {
  /** 已选 participant uid 列表 */
  value: string[];
  onChange: (uids: string[]) => void;
  trigger?: (props: { open: () => void; count: number }) => ReactNode;
}

/** modal open 翻转时把 ext selected 同步进 internal pickerSelected */
function useResetPickerOnOpen(
  open: boolean,
  value: string[],
  setSelected: (s: Set<string>) => void,
  setKeyword: (s: string) => void,
) {
  useEffect(() => {
    if (open) {
      setSelected(new Set(value));
      setKeyword("");
    }
  }, [open, value, setSelected, setKeyword]);
}

/**
 * 参与者多选(Wave 3c BY_PERSON 模式专用,内嵌于 SummaryCreateModal)。
 *
 * 浮动元素壳层统一规范 Phase C5 — 走 BaseDialog;通常嵌在 ScheduleFormModal 内,
 * 自动 z-dialog-secondary。
 */
export function ParticipantPicker({ value, onChange, trigger }: ParticipantPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(value));
  useResetPickerOnOpen(open, value, setSelected, setKeyword);

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

  const filtered = useMemo(
    () => filterMembersByKeyword(candidates, keyword),
    [candidates, keyword],
  );

  const selectedCandidates = useMemo(
    () => candidates.filter((m) => selected.has(m.uid)),
    [candidates, selected],
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

  const openPicker = () => setOpen(true);

  return (
    <>
      {trigger ? (
        trigger({ open: openPicker, count: value.length })
      ) : (
        <button
          type="button"
          onClick={openPicker}
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
      )}

      <BaseDialog
        open={open}
        onOpenChange={(next) => !next && setOpen(false)}
        size="fit"
        title={t("summary.participant.pickerTitle")}
        className="h-[560px] w-[625px]"
        contentClassName="overflow-hidden p-0"
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
        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-[296px] shrink-0 flex-col overflow-hidden">
            <div className="mx-2 mt-2 mb-1 flex h-8 shrink-0 items-center gap-2 rounded-full bg-bg-elevated px-3">
              <Search size={14} className="shrink-0 text-[rgba(28,28,35,0.4)]" />
              <input
                autoFocus
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={t("createGroup.searchPlaceholder")}
                className="flex-1 border-0 bg-transparent text-[13px] text-text-primary placeholder:text-[rgba(28,28,35,0.35)] focus:outline-none"
              />
            </div>

            <ul className="flex flex-1 flex-col overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="flex flex-1 items-center justify-center px-4 text-center text-[13px] text-[rgba(28,28,35,0.35)]">
                  {keyword ? t("createGroup.noMatches") : t("summary.participant.noSpaceMembers")}
                </li>
              ) : (
                filtered.map((member) => (
                  <li key={member.uid} className="px-2">
                    <SelectableMemberRow
                      uid={member.uid}
                      name={member.name}
                      avatar={member.avatar}
                      checked={selected.has(member.uid)}
                      onToggle={toggle}
                    />
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="w-px shrink-0 bg-[rgba(46,50,56,0.09)]" />

          <SelectedPreviewPane
            items={selectedCandidates}
            emptyLabel={t("forwardModalLocal.notSelected")}
            countLabel={t("forwardModalLocal.selectedCount", {
              values: { count: selectedCandidates.length },
            })}
            getKey={(member) => `sel-${member.uid}`}
            renderItem={(member) => (
              <SelectedMemberRow
                uid={member.uid}
                name={member.name}
                avatar={member.avatar}
                onRemove={toggle}
                removeLabel={t("forwardModalLocal.remove")}
              />
            )}
          />
        </div>
      </BaseDialog>
    </>
  );
}
