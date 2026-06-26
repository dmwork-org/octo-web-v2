import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { Search } from "lucide-react";
import { message } from "@/components/ui/message";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { type SpaceMember } from "@/features/base/api/endpoints/space.api";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import {
  SelectableMemberRow,
  SelectedMemberRow,
  SelectedPreviewPane,
  VirtualizedSelectList,
} from "@/features/base/components/member-select/member-select";
import {
  filterMembersByKeyword,
  toggleMemberSelection,
} from "@/features/base/components/member-select/member-select-utils";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { addGroupMembers, createGroup } from "@/features/base/api/endpoints/group.api";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";
import { buildPrivateChatGroupMemberUids } from "@/features/chat/lib/private-chat-group-members";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface AddMembersModalProps {
  open: boolean;
  /** 当前群 channel(子区不应进这个 picker,父级隐藏入口) */
  channel: Channel;
  onClose: () => void;
}

const ADD_MEMBER_ROW_HEIGHT = 36;
const ADD_MEMBER_LIST_OVERSCAN = 8;

function useResetOnClose(open: boolean, reset: () => void): void {
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    if (!open) resetRef.current();
  }, [open]);
}

function useDebouncedKeyword(input: string, setKeyword: (k: string) => void): void {
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(input), 300);
    return () => clearTimeout(timer);
  }, [input, setKeyword]);
}

function AddMemberCandidateRow({
  member,
  checked,
  onToggle,
}: {
  member: SpaceMember;
  checked: boolean;
  onToggle: (uid: string) => void;
}) {
  return (
    <SelectableMemberRow
      uid={member.uid}
      name={member.name}
      avatar={member.avatar}
      checked={checked}
      onToggle={onToggle}
      avatarSize={28}
      checkboxVariant="brand"
      rowClassName="flex h-9 cursor-pointer items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)]"
      checkedClassName=""
      nameClassName="text-[14px] text-text-primary"
      trailing={member.robot === 1 ? <AiBadge size="small" /> : null}
    />
  );
}

function AddMemberCandidateList({
  items,
  selectedIds,
  onToggle,
  empty,
}: {
  items: SpaceMember[];
  selectedIds: Set<string>;
  onToggle: (uid: string) => void;
  empty: ReactNode;
}) {
  return (
    <VirtualizedSelectList
      items={items}
      empty={empty}
      rowHeight={ADD_MEMBER_ROW_HEIGHT}
      overscan={ADD_MEMBER_LIST_OVERSCAN}
      renderRow={(member) => (
        <AddMemberCandidateRow
          member={member}
          checked={selectedIds.has(member.uid)}
          onToggle={onToggle}
        />
      )}
    />
  );
}

function AddMemberSelectedRow({
  member,
  onRemove,
}: {
  member: SpaceMember;
  onRemove: (uid: string) => void;
}) {
  const tt = useT();
  return (
    <SelectedMemberRow
      uid={member.uid}
      name={member.name}
      avatar={member.avatar}
      onRemove={onRemove}
      removeLabel={tt("forwardModalLocal.remove")}
      trailing={member.robot === 1 ? <AiBadge size="small" /> : null}
    />
  );
}

/**
 * 群加成员选择器,UI 对齐转发弹窗:左侧候选列表,右侧已选预览。
 */
export function AddMembersModal({ open, channel, onClose }: AddMembersModalProps) {
  const tt = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [input, setInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isPrivateChat = channel.channelType === ChannelTypePerson;

  useResetOnClose(open, () => {
    setInput("");
    setKeyword("");
    setSelected(new Set());
  });
  useDebouncedKeyword(input, setKeyword);

  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });
  const subscribers = useGroupSubscribers(
    channel,
    open && channel.channelType === ChannelTypeGroup,
  );

  const candidates = useMemo(() => {
    const inGroup = isPrivateChat
      ? new Set([myUid, channel.channelID])
      : new Set(subscribers.map((s) => s.uid));
    return (members ?? []).filter((m) => {
      if (m.uid === myUid) return false;
      if (inGroup.has(m.uid)) return false;
      return true;
    });
  }, [members, subscribers, myUid, isPrivateChat, channel.channelID]);

  const filtered = useMemo(() => {
    return filterMembersByKeyword(candidates, keyword);
  }, [candidates, keyword]);

  const selectedCandidates = useMemo(() => {
    return candidates.filter((m) => selected.has(m.uid));
  }, [candidates, selected]);

  const groupMemberCount = buildPrivateChatGroupMemberUids(myUid, channel.channelID, [
    ...selected,
  ]).length;

  const mu = useMutation({
    mutationFn: async () => {
      if (isPrivateChat) {
        const members = buildPrivateChatGroupMemberUids(myUid, channel.channelID, [...selected]);
        const resp = await createGroup({ members, space_id: spaceId || undefined });
        return { kind: "createdGroup" as const, groupNo: resp.group_no };
      }
      await addGroupMembers(channel.channelID, [...selected]);
      return { kind: "addedMembers" as const };
    },
    onSuccess: (result) => {
      if (result.kind === "createdGroup") {
        const newChannel = new Channel(result.groupNo, ChannelTypeGroup);
        void WKSDK.shared().channelManager.fetchChannelInfo(newChannel);
        chatSelectedActions.select(newChannel);
        void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
        void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
        message.success(t("createGroup.toast.created"));
        onClose();
        return;
      }
      void WKSDK.shared().channelManager.syncSubscribes(channel);
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      message.success(t("addMembers.toast.added", { values: { count: selected.size } }));
      onClose();
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("addMembers.toast.failed")),
  });

  const toggle = (uid: string) => {
    toggleMemberSelection(setSelected, uid);
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="fit"
      title={
        <span className="text-center text-[17px] font-semibold">
          {isPrivateChat ? tt("createGroup.title") : tt("addMembers.title")}
        </span>
      }
      showCloseButton={false}
      className="h-[560px] w-[625px]"
      contentClassName="overflow-hidden p-0"
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-full border border-[rgba(28,28,35,0.15)] bg-white px-4 text-[14px] text-[rgba(28,28,35,0.8)] transition-colors hover:bg-[rgba(28,28,35,0.04)]"
          >
            {tt("addMembers.cancel")}
          </button>
          <button
            type="button"
            onClick={() => mu.mutate()}
            disabled={selected.size === 0 || mu.isPending}
            className="inline-flex h-9 min-w-16 items-center justify-center rounded-full bg-[#1c1c23] px-4 text-[14px] text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {isPrivateChat
              ? tt("createGroup.createWithCount", { values: { count: groupMemberCount } })
              : selected.size > 0
                ? tt("addMembers.addWithCount", { values: { count: selected.size } })
                : tt("addMembers.add")}
          </button>
        </div>
      }
    >
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[296px] shrink-0 flex-col overflow-hidden">
          <div className="mx-2 mt-2 mb-1 flex h-8 shrink-0 items-center gap-2 rounded-full bg-bg-elevated px-3">
            <Search size={14} className="shrink-0 text-[rgba(28,28,35,0.4)]" />
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={tt("addMembers.searchPlaceholder")}
              className="flex-1 border-0 bg-transparent text-[13px] text-text-primary placeholder:text-[rgba(28,28,35,0.35)] focus:outline-none"
            />
          </div>

          <AddMemberCandidateList
            items={filtered}
            selectedIds={selected}
            onToggle={toggle}
            empty={
              <div className="flex h-20 items-center justify-center px-4 text-center text-[13px] text-[rgba(28,28,35,0.35)]">
                {keyword
                  ? tt("addMembers.noMatches")
                  : isPrivateChat
                    ? tt("createGroup.noOtherMembers")
                    : candidates.length === 0
                      ? tt("addMembers.allInGroup")
                      : tt("addMembers.noCandidates")}
              </div>
            }
          />
        </div>

        <div className="w-px shrink-0 bg-[rgba(46,50,56,0.09)]" />

        <SelectedPreviewPane
          items={selectedCandidates}
          emptyLabel={tt("forwardModalLocal.notSelected")}
          countLabel={tt("forwardModalLocal.selectedCount", {
            values: { count: selectedCandidates.length },
          })}
          getKey={(member) => `sel-${member.uid}`}
          renderItem={(member) => <AddMemberSelectedRow member={member} onRemove={toggle} />}
        />
      </div>
    </BaseDialog>
  );
}
