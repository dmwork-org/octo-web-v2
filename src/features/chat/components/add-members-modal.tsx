import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Search } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { addGroupMembers } from "@/features/base/api/endpoints/group.api";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface AddMembersModalProps {
  open: boolean;
  /** 当前群 channel(子区不应进这个 picker,父级隐藏入口) */
  channel: Channel;
  onClose: () => void;
}

/** open 翻转时 reset selected。 */
function useResetOnOpen(open: boolean, setSelected: (v: Set<string>) => void) {
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open, setSelected]);
}

/**
 * 群加成员选择器(对应旧 dmworkbase Components/MemberPicker 精简版)。
 *
 * 浮动元素壳层统一规范 Phase C — 走 BaseDialog。
 */
export function AddMembersModal({ open, channel, onClose }: AddMembersModalProps) {
  const tt = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useResetOnOpen(open, setSelected);

  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });
  const subscribers = useGroupSubscribers(channel, open);

  const candidates = useMemo(() => {
    const inGroup = new Set(subscribers.map((s) => s.uid));
    return (members ?? []).filter((m) => {
      if (m.uid === myUid) return false;
      if (m.robot === 1) return false;
      if (inGroup.has(m.uid)) return false;
      return true;
    });
  }, [members, subscribers, myUid]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return candidates;
    return candidates.filter(
      (c) => (c.name || "").toLowerCase().includes(kw) || c.uid.toLowerCase().includes(kw),
    );
  }, [candidates, keyword]);

  const mu = useMutation({
    mutationFn: () => addGroupMembers(channel.channelID, [...selected]),
    onSuccess: () => {
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
      size="md"
      height="sm"
      title={
        selected.size > 0
          ? tt("addMembers.titleWithCount", { values: { count: selected.size } })
          : tt("addMembers.title")
      }
      contentClassName="overflow-hidden"
      footer={
        <>
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            {tt("addMembers.cancel")}
          </Button>
          <Button
            type="primary"
            theme="solid"
            loading={mu.isPending}
            disabled={selected.size === 0}
            onClick={() => mu.mutate()}
          >
            {selected.size > 0
              ? tt("addMembers.addWithCount", { values: { count: selected.size } })
              : tt("addMembers.add")}
          </Button>
        </>
      }
    >
      <div className="shrink-0 px-5 py-2">
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5">
          <Search size={14} className="shrink-0 text-text-tertiary" />
          <input
            autoFocus
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tt("addMembers.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>
      </div>

      <ul className="flex flex-1 flex-col overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {keyword
              ? tt("addMembers.noMatches")
              : candidates.length === 0
                ? tt("addMembers.allInGroup")
                : tt("addMembers.noCandidates")}
          </li>
        ) : (
          filtered.map((m) => {
            const checked = selected.has(m.uid);
            return (
              <li key={m.uid} className="px-2">
                <label
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
                  <ChannelAvatar
                    channel={new Channel(m.uid, ChannelTypePerson)}
                    size={32}
                    title={m.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {m.name || m.uid}
                  </span>
                </label>
              </li>
            );
          })
        )}
      </ul>
    </BaseDialog>
  );
}
