import { useState, type FormEvent } from "react";
import { useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Search, UserPlus, Check } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { searchFriends, applyFriend } from "@/features/contacts/api/friends.api";
import type { Friend } from "@/features/contacts/types/friend.types";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

/**
 * 加好友表单(对应旧 dmworkcontacts FriendAdd):搜索 + 结果列表 + 申请。
 *
 * 加好友主入口在 chat 右上"+"号(对应旧 chatmenus.addfriend),contacts
 * 自家无 sub-page 入口 — 本表单完全归 chat 拥有,只通过 contacts/api/
 * friends.api 复用搜索 / 申请 API(D-2:API 在 contacts,UI 在消费 feature)。
 */
const searchQueryKey = (kw: string) => ["chat", "friend-search", kw] as const;

function SearchResultRow({
  user,
  applied,
  busy,
  onApply,
}: {
  user: Friend;
  applied: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  const tt = useT();
  const channel = new Channel(user.uid, ChannelTypePerson);
  const name = user.name || user.username || user.uid;
  const isFriend = user.follow === 1;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover">
      <ChannelAvatar channel={channel} size={36} title={name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-text-primary">{name}</span>
        {user.short_no ? (
          <span className="truncate text-xs text-text-tertiary">
            {tt("friendAdd.shortNo", { values: { no: user.short_no } })}
          </span>
        ) : null}
      </div>
      {isFriend ? (
        <span className="shrink-0 text-xs text-text-tertiary">{tt("friendAdd.alreadyFriend")}</span>
      ) : applied ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-online">
          <Check size={12} /> {tt("friendAdd.applySent")}
        </span>
      ) : (
        <Button type="primary" theme="solid" size="small" loading={busy} onClick={onApply}>
          <UserPlus size={14} />
          {tt("friendAdd.addFriend")}
        </Button>
      )}
    </div>
  );
}

export function FriendAddForm() {
  const tt = useT();
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [appliedSet, setAppliedSet] = useState<Set<string>>(new Set());

  const { data, isFetching, error } = useQuery({
    queryKey: searchQueryKey(submitted),
    queryFn: () => searchFriends(submitted),
    enabled: submitted.length > 0,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const applyMu = useMutation({
    mutationFn: (target: Friend) =>
      applyFriend({ to_uid: target.uid, vercode: target.vercode, remark: "" }),
    onSuccess: (_void, target) => {
      setAppliedSet((prev) => new Set(prev).add(target.uid));
      toast.success(t("friendAdd.toast.applySent"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("friendAdd.toast.applyFailed"));
    },
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(keyword.trim());
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <form onSubmit={onSubmit} className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 focus-within:border-brand">
          <Search size={14} className="text-text-tertiary" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tt("friendAdd.searchPlaceholder")}
            className="flex-1 border-0 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          <Button htmlType="submit" type="primary" theme="solid" size="small">
            {tt("friendAdd.search")}
          </Button>
        </div>
      </form>
      <div className="flex flex-1 flex-col overflow-y-auto pb-3">
        {!submitted ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {tt("friendAdd.hintEnter")}
          </div>
        ) : isFetching && !data ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {tt("friendAdd.searching")}
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center text-sm text-error">
            {tt("friendAdd.searchFailed")}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {tt("friendAdd.noMatches")}
          </div>
        ) : (
          data.map((u) => (
            <SearchResultRow
              key={u.uid}
              user={u}
              applied={appliedSet.has(u.uid)}
              busy={applyMu.isPending && applyMu.variables?.uid === u.uid}
              onApply={() => applyMu.mutate(u)}
            />
          ))
        )}
      </div>
    </div>
  );
}
