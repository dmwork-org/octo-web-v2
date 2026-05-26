import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Search, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { addGroupMembers } from "@/features/base/api/endpoints/group.api";

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
 * 群加成员选择器(对应旧 dmworkbase Components/MemberPicker 精简版):
 *
 * - 候选 = spaceMembers - 已在群里的成员 - 自己 - robot(robot 走 appbot 添加链路)
 * - 搜索过滤 / 多选
 * - 提交 POST /groups/{groupNo}/members { members: uids } batch
 * - 成功后:invalidate conversations + syncSubscribes + close
 *
 * 子区不接此 modal(子区成员=父群成员,后端会 reject;父级 ChannelMembersModal
 * 在子区场景隐藏"加成员"按钮)。
 */
export function AddMembersModal({ open, channel, onClose }: AddMembersModalProps) {
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

  // 候选 = spaceMembers - 已在群 - 自己 - robot
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
      toast.success(`已加入 ${selected.size} 人`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "加入失败"),
  });

  if (!open) return null;

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            加成员{selected.size > 0 ? ` (${selected.size})` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="shrink-0 px-5 py-2">
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5">
            <Search size={14} className="shrink-0 text-text-tertiary" />
            <input
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索 Space 成员"
              className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
        </div>

        <ul className="flex flex-1 flex-col overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              {keyword
                ? "没有匹配的成员"
                : candidates.length === 0
                  ? "Space 内成员都已在群里"
                  : "暂无可加成员"}
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

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            取消
          </Button>
          <Button
            type="primary"
            theme="solid"
            loading={mu.isPending}
            disabled={selected.size === 0}
            onClick={() => mu.mutate()}
          >
            添加 {selected.size > 0 ? selected.size : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
