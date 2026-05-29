import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Search } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { bucketLetter, sortLetters } from "@/features/base/lib/pinyin-bucket";
import { friendsQueryOptions } from "@/features/contacts/queries/friends.query";
import type { Friend } from "@/features/contacts/types/friend.types";

function groupFriends(list: Friend[]): { letter: string; items: Friend[] }[] {
  const map = new Map<string, Friend[]>();
  for (const f of list) {
    const key = bucketLetter(f.remark || f.name || f.username || f.uid);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  const letters = [...map.keys()].sort(sortLetters);
  return letters.map((letter) => ({
    letter,
    items: map.get(letter)!.sort((x, y) => {
      const xn = x.remark || x.name || x.username || x.uid;
      const yn = y.remark || y.name || y.username || y.uid;
      return xn.localeCompare(yn);
    }),
  }));
}

function FriendRow({ friend, onClick }: { friend: Friend; onClick: () => void }) {
  const name = friend.remark || friend.name || friend.username || friend.uid;
  const isBot = friend.robot === 1;
  const channel = useMemo(() => new Channel(friend.uid, ChannelTypePerson), [friend.uid]);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-left transition-colors duration-150 ease-(--ease-emphasized) hover:bg-bg-hover"
    >
      <ChannelAvatar channel={channel} size={32} title={name} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm text-text-primary">{name}</span>
        {isBot ? (
          <span className="shrink-0 rounded-sm bg-accent/10 px-1.5 text-[10px] font-semibold text-accent">
            AI
          </span>
        ) : null}
        {friend.online === 1 ? (
          <span aria-label="在线" className="h-1.5 w-1.5 shrink-0 rounded-full bg-online" />
        ) : null}
      </div>
      {friend.category ? (
        <span className="shrink-0 text-[11px] text-text-tertiary">{friend.category}</span>
      ) : null}
    </button>
  );
}

interface FriendListProps {
  friends: Friend[];
  onOpenChat: (uid: string) => void;
}

export function FriendList({ friends, onOpenChat }: FriendListProps) {
  const [q, setQ] = useState("");
  const grouped = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const filtered = !kw
      ? friends
      : friends.filter((f) => {
          const t = `${f.remark || ""} ${f.name || ""} ${f.username || ""} ${f.uid}`.toLowerCase();
          return t.includes(kw);
        });
    return groupFriends(filtered);
  }, [friends, q]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 focus-within:border-brand">
          <Search size={14} className="text-text-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索联系人"
            className="flex-1 border-0 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto pb-3">
        {grouped.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            暂无联系人
          </div>
        ) : (
          grouped.map(({ letter, items }) => (
            <section key={letter} className="flex flex-col">
              <header className="sticky top-0 bg-bg-base px-4 py-1 text-[11px] font-semibold text-text-tertiary">
                {letter}
              </header>
              {items.map((f) => (
                <FriendRow key={f.uid} friend={f} onClick={() => onOpenChat(f.uid)} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * 顶层 ContactsView 内同时管理 query + 点击行为。
 * 点联系人 → 写 chatSelectedStore,触发右侧 ChatMain 进对话(不再 navigate 跳路由)。
 */
export function FriendListContainer() {
  const { data, isLoading, error } = useQuery(friendsQueryOptions());

  const onOpenChat = (uid: string) => {
    chatSelectedActions.select(new Channel(uid, ChannelTypePerson));
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        加载联系人…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-error">
        联系人加载失败
      </div>
    );
  }
  return <FriendList friends={data ?? []} onOpenChat={onOpenChat} />;
}
