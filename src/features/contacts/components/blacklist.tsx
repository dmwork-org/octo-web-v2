import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { UserInfoModal } from "@/features/base/components/modals/user-info-modal";
import { friendsQueryOptions } from "@/features/contacts/queries/friends.query";

/**
 * 黑名单页(对应旧 dmworkcontacts/Blacklist):
 *
 * 数据源 = friends(全局好友列表,跨 Space) filter be_blacklist === 1。
 * 旧 BlacklistVM 是 `contactsList.filter(v => v.status === blacklist)`,语义等价
 * (be_blacklist=1 ↔ status=blacklist)。
 *
 * 点击 row → UserInfoModal(里面有"拉出黑名单" section row 操作)。
 */
export function BlacklistPage() {
  const { data, isLoading, error } = useQuery(friendsQueryOptions());
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const blacklisted = useMemo(() => {
    return (data ?? []).filter((f) => f.be_blacklist === 1);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        加载黑名单…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-error">加载失败</div>
    );
  }
  if (blacklisted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        黑名单为空
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-2">
      {blacklisted.map((f) => {
        const channel = new Channel(f.uid, ChannelTypePerson);
        const name = f.remark || f.name || f.username || f.uid;
        return (
          <button
            key={f.uid}
            type="button"
            onClick={() => setSelectedUid(f.uid)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-bg-hover"
          >
            <ChannelAvatar channel={channel} size={32} title={name} />
            <span className="truncate text-sm text-text-primary">{name}</span>
          </button>
        );
      })}

      <UserInfoModal uid={selectedUid} onClose={() => setSelectedUid(null)} />
    </div>
  );
}
