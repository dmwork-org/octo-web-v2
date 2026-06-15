import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { Check, Search, X } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { type SpaceMember } from "@/features/base/api/endpoints/space.api";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
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

function AddMemberAvatar({ member }: { member: SpaceMember }) {
  return (
    <ChannelAvatar
      channel={new Channel(member.uid, ChannelTypePerson)}
      size={28}
      title={member.name || member.uid}
    />
  );
}

function AddMemberName({ member }: { member: SpaceMember }) {
  return (
    <span className="min-w-0 flex-1 truncate text-[14px] text-text-primary">
      {member.name || member.uid}
    </span>
  );
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
    <div
      onClick={() => onToggle(member.uid)}
      className="flex h-9 cursor-pointer items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)]"
    >
      <span
        role="checkbox"
        aria-checked={checked}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-colors ${
          checked ? "border-brand bg-brand text-text-inverse" : "border-border-strong bg-bg-surface"
        }`}
      >
        {checked ? <Check size={12} strokeWidth={2.5} /> : null}
      </span>
      <AddMemberAvatar member={member} />
      <AddMemberName member={member} />
      {member.robot === 1 ? <AiBadge size="small" /> : null}
    </div>
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
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ADD_MEMBER_ROW_HEIGHT,
    overscan: ADD_MEMBER_LIST_OVERSCAN,
  });

  if (items.length === 0) {
    return <div className="flex-1 overflow-y-auto py-1">{empty}</div>;
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto py-1">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const member = items[virtualItem.index];
          if (!member) return null;
          return (
            <div
              key={virtualItem.key}
              className="absolute top-0 left-0 w-full"
              style={{
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <AddMemberCandidateRow
                member={member}
                checked={selectedIds.has(member.uid)}
                onToggle={onToggle}
              />
            </div>
          );
        })}
      </div>
    </div>
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
    <div className="group flex h-9 items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)]">
      <AddMemberAvatar member={member} />
      <AddMemberName member={member} />
      {member.robot === 1 ? <AiBadge size="small" /> : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(member.uid);
        }}
        aria-label={tt("forwardModalLocal.remove")}
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[rgba(28,28,35,0.4)] transition-colors hover:bg-[rgba(28,28,35,0.06)] hover:text-text-primary"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
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
    const kw = keyword.trim().toLowerCase();
    if (!kw) return candidates;
    return candidates.filter(
      (c) => (c.name || "").toLowerCase().includes(kw) || c.uid.toLowerCase().includes(kw),
    );
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
        toast.success(t("createGroup.toast.created"));
        onClose();
        return;
      }
      void WKSDK.shared().channelManager.syncSubscribes(channel);
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      toast.success(t("addMembers.toast.added", { values: { count: selected.size } }));
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("addMembers.toast.failed")),
  });

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
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

        <div className="flex flex-1 flex-col overflow-hidden py-2">
          {selectedCandidates.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[rgba(28,28,35,0.35)]">
              {tt("forwardModalLocal.notSelected")}
            </div>
          ) : (
            <>
              <div className="shrink-0 px-2 pb-1.5 text-[12px] text-[rgba(28,28,35,0.4)]">
                {tt("forwardModalLocal.selectedCount", {
                  values: { count: selectedCandidates.length },
                })}
              </div>
              <div className="flex-1 overflow-y-auto">
                {selectedCandidates.map((member) => (
                  <AddMemberSelectedRow
                    key={`sel-${member.uid}`}
                    member={member}
                    onRemove={toggle}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  );
}
